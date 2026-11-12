import test from 'node:test';
import assert from 'node:assert/strict';
import { demoStore } from '../src/lib/store';
import { PAYPAL_PAYOUT_FEE_CENTS } from '../src/lib/config';
import { calculatePayoutFeeCents } from '../src/lib/money';
import {
  dispatchPayout,
  parsePayoutBatch,
  parsePayPalReportingBalanceResponse,
  PayPalError,
} from '../src/lib/paypal';
import {
  createUnavailablePayPalBalance,
  evaluateBillPayPalBalance,
  evaluatePortfolioPayPalBalance,
  PAYPAL_SANDBOX_ACCOUNTS_URL,
} from '../src/lib/paypalBalance';
import { executePayoutAuthorization } from '../src/lib/payoutExecutor';
import type { Bill, PayPalBalanceSnapshot } from '../src/types';

function preparePayableBill(): { bill: Bill; clearedBeforeCents: number } {
  let snapshot = demoStore.resetDemoData();
  for (const inv of snapshot.invoices) {
    if (inv.status !== 'PAID') {
      const paid = demoStore.payInvoice(inv.id);
      if (paid.ok) {
        snapshot = paid.snapshot;
      }
    }
  }
  const bill = snapshot.bills
    .filter((b) => b.status === 'PENDING')
    .sort((a, b) => a.amountCents - b.amountCents)[0];
  assert.ok(bill, 'Expected at least one seeded pending bill');
  return { bill, clearedBeforeCents: snapshot.account.clearedBalanceCents };
}

test('fee reconciliation separates actual PayPal $0.25 API fee from $1.00 conservative reserve cap', () => {
  assert.equal(PAYPAL_PAYOUT_FEE_CENTS, 25);
  assert.equal(calculatePayoutFeeCents(300_000), 100);

  const fromBatchHeader = parsePayoutBatch({
    batch_header: {
      payout_batch_id: 'BATCH-FEE-HEADER',
      batch_status: 'SUCCESS',
      fees: { currency: 'USD', value: '0.25' },
    },
    items: [{ transaction_status: 'SUCCESS' }],
  });
  assert.equal(fromBatchHeader.outcome, 'SUCCESS');
  assert.equal(fromBatchHeader.actualFeeCents, 25);

  const fromItemFee = parsePayoutBatch({
    batch_header: {
      payout_batch_id: 'BATCH-FEE-ITEM',
      batch_status: 'SUCCESS',
    },
    items: [
      {
        transaction_status: 'SUCCESS',
        payout_item_fee: { currency: 'USD', value: '0.25' },
      },
    ],
  });
  assert.equal(fromItemFee.actualFeeCents, 25);

  const failedItem = parsePayoutBatch({
    batch_header: {
      payout_batch_id: 'BATCH-FAILED-IF',
      batch_status: 'SUCCESS',
    },
    items: [
      {
        transaction_status: 'FAILED',
        errors: [{ name: 'INSUFFICIENT_FUNDS', message: 'Sender does not have sufficient funds.' }],
      },
    ],
  });
  assert.equal(failedItem.outcome, 'FAILED');
  assert.equal(failedItem.insufficientFunds, true);
});

test('sufficient PayPal balance passes evaluation and executes payout without hardcoding balances', async () => {
  const { bill, clearedBeforeCents } = preparePayableBill();
  const mockBalance: PayPalBalanceSnapshot = {
    availability: 'AVAILABLE',
    availableCents: bill.amountCents + PAYPAL_PAYOUT_FEE_CENTS + 100_000,
    currency: 'USD',
    checkedAt: '2026-11-11T10:00:00.000Z',
    source: 'PAYPAL_REPORTING_API',
    reason: null,
    lastInsufficientFundsAt: null,
    lastInsufficientFundsMessage: null,
  };

  const singleEval = evaluateBillPayPalBalance({
    paypalBalance: mockBalance,
    billAmountCents: bill.amountCents,
    feeCents: PAYPAL_PAYOUT_FEE_CENTS,
  });
  assert.equal(singleEval.status, 'SUFFICIENT');
  assert.equal(singleEval.canSubmitSandboxPayout, true);
  assert.equal(singleEval.shortfallCents, 0);

  let dispatchCalls = 0;
  const res = await executePayoutAuthorization(
    { billId: bill.id, executionMode: 'PAYPAL_SANDBOX' },
    {
      sandboxEnabled: true,
      hasCredentials: true,
      getPayPalBalance: async () => mockBalance,
      dispatchPayout: async () => {
        dispatchCalls += 1;
        return {
          batch_header: {
            payout_batch_id: 'TEST-BATCH-SUFFICIENT',
            batch_status: 'SUCCESS',
            fees: { currency: 'USD', value: '0.25' },
          },
          items: [{ transaction_status: 'SUCCESS' }],
        };
      },
    }
  );

  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    status: string;
    batchId: string;
    snapshot: ReturnType<typeof demoStore.getSnapshot>;
  };
  assert.equal(dispatchCalls, 1);
  assert.equal(body.status, 'DISBURSED');
  assert.equal(body.batchId, 'TEST-BATCH-SUFFICIENT');
  assert.equal(body.snapshot.account.clearedBalanceCents, clearedBeforeCents - bill.amountCents);
  assert.equal(body.snapshot.account.payoutVerification?.actualFeeCents, 25);
});

test('insufficient PayPal balance blocks pre-payout before calling PayPal and preserves ledger & PENDING status', async () => {
  const { bill, clearedBeforeCents } = preparePayableBill();
  const insufficientWalletCents = bill.amountCents - 500; // $5.00 below bill principal alone
  const expectedRequiredCents = bill.amountCents + PAYPAL_PAYOUT_FEE_CENTS;
  const expectedShortfallCents = expectedRequiredCents - insufficientWalletCents;

  const mockBalance: PayPalBalanceSnapshot = {
    availability: 'AVAILABLE',
    availableCents: insufficientWalletCents,
    currency: 'USD',
    checkedAt: '2026-11-11T10:05:00.000Z',
    source: 'PAYPAL_REPORTING_API',
    reason: null,
    lastInsufficientFundsAt: null,
    lastInsufficientFundsMessage: null,
  };

  const evalResult = evaluateBillPayPalBalance({
    paypalBalance: mockBalance,
    billAmountCents: bill.amountCents,
    feeCents: PAYPAL_PAYOUT_FEE_CENTS,
  });
  assert.equal(evalResult.status, 'INSUFFICIENT');
  assert.equal(evalResult.canSubmitSandboxPayout, false);
  assert.equal(evalResult.shortfallCents, expectedShortfallCents);

  let dispatchCalls = 0;
  const res = await executePayoutAuthorization(
    { billId: bill.id, executionMode: 'PAYPAL_SANDBOX' },
    {
      sandboxEnabled: true,
      hasCredentials: true,
      getPayPalBalance: async () => mockBalance,
      dispatchPayout: async () => {
        dispatchCalls += 1;
        throw new Error('dispatchPayout must NOT be called when PayPal balance is insufficient');
      },
    }
  );

  assert.equal(res.status, 409);
  const body = (await res.json()) as {
    error: string;
    shortfallCents: number;
    requiredCents: number;
    availableCents: number;
    feeCents: number;
    dashboardUrl: string;
    snapshot: ReturnType<typeof demoStore.getSnapshot>;
  };

  assert.equal(body.error, 'PAYPAL_INSUFFICIENT_BALANCE');
  assert.equal(dispatchCalls, 0);
  assert.equal(body.shortfallCents, expectedShortfallCents);
  assert.equal(body.requiredCents, expectedRequiredCents);
  assert.equal(body.availableCents, insufficientWalletCents);
  assert.equal(body.feeCents, PAYPAL_PAYOUT_FEE_CENTS);
  assert.equal(body.dashboardUrl, PAYPAL_SANDBOX_ACCOUNTS_URL);
  assert.equal(body.snapshot.account.clearedBalanceCents, clearedBeforeCents);

  const billAfter = body.snapshot.bills.find((b) => b.id === bill.id);
  assert.equal(billAfter?.status, 'PENDING');
  assert.equal(body.snapshot.auditLogs[0]?.action, 'PAYOUT_BLOCKED_PAYPAL_BALANCE');
});

test('balance unavailable never substitutes internal cleared cash and reports UNAVAILABLE state cleanly', () => {
  const { clearedBeforeCents } = preparePayableBill();
  const snapshot = demoStore.getSnapshot();

  const unavailable = createUnavailablePayPalBalance('HTTP 403 missing reporting scope');
  assert.equal(unavailable.availability, 'UNAVAILABLE');
  assert.equal(unavailable.availableCents, null);

  const parsedMissing = parsePayPalReportingBalanceResponse({ balances: [] });
  assert.equal(parsedMissing.availability, 'UNAVAILABLE');
  assert.equal(parsedMissing.availableCents, null);

  const parsedValid = parsePayPalReportingBalanceResponse({
    balances: [
      {
        currency: 'USD',
        primary: true,
        available_balance: { currency_code: 'USD', value: '0.00' },
      },
    ],
    as_of_time: '2026-11-11T10:15:00Z',
  });
  assert.equal(parsedValid.availability, 'AVAILABLE');
  assert.equal(parsedValid.availableCents, 0);

  const portfolioEval = evaluatePortfolioPayPalBalance({
    ...snapshot,
    paypalBalance: unavailable,
  });
  assert.equal(portfolioEval.status, 'UNAVAILABLE');
  assert.equal(portfolioEval.availableCents, null);
  assert.equal(portfolioEval.headline, 'PayPal balance unavailable');
  assert.ok(clearedBeforeCents > 0);
});

test('dispatchPayout converts PayPal HTTP 422 INSUFFICIENT_FUNDS into PAYPAL_INSUFFICIENT_FUNDS PayPalError', async () => {
  const originalFetch = globalThis.fetch;
  const prevId = process.env.PAYPAL_CLIENT_ID;
  const prevSecret = process.env.PAYPAL_CLIENT_SECRET;
  const prevBase = process.env.PAYPAL_BASE_URL;

  process.env.PAYPAL_CLIENT_ID = 'test-client-id';
  process.env.PAYPAL_CLIENT_SECRET = 'test-client-secret';
  process.env.PAYPAL_BASE_URL = 'https://api-m.sandbox.paypal.com';

  globalThis.fetch = async (url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.includes('/v1/oauth2/token')) {
      return new Response(
        JSON.stringify({ access_token: 'mock-token', expires_in: 3600 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({
        name: 'INSUFFICIENT_FUNDS',
        message: 'Sender does not have sufficient funds. Please add funds and retry.',
      }),
      { status: 422, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    await assert.rejects(
      () =>
        dispatchPayout({
          idempotencyKey: 'key-insufficient-test',
          amountCents: 300_000,
          currency: 'USD',
          receiverEmail: 'vendor@personal.example.com',
          senderBatchId: 'batch-insufficient-test',
          note: 'Test payout',
          emailSubject: 'Subject',
          emailMessage: 'Message',
        }),
      (err: unknown) => {
        assert.ok(err instanceof PayPalError);
        assert.equal(err.code, 'PAYPAL_INSUFFICIENT_FUNDS');
        assert.equal(err.paypalName, 'INSUFFICIENT_FUNDS');
        assert.ok(err.message.includes(PAYPAL_SANDBOX_ACCOUNTS_URL));
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (prevId === undefined) delete process.env.PAYPAL_CLIENT_ID;
    else process.env.PAYPAL_CLIENT_ID = prevId;
    if (prevSecret === undefined) delete process.env.PAYPAL_CLIENT_SECRET;
    else process.env.PAYPAL_CLIENT_SECRET = prevSecret;
    if (prevBase === undefined) delete process.env.PAYPAL_BASE_URL;
    else process.env.PAYPAL_BASE_URL = prevBase;
  }
});

test('PayPal INSUFFICIENT_FUNDS preserves FAILED status, applies zero ledger debit, and blocks duplicate attempts', async () => {
  const { bill, clearedBeforeCents } = preparePayableBill();
  let dispatchCalls = 0;

  const firstRes = await executePayoutAuthorization(
    { billId: bill.id, executionMode: 'PAYPAL_SANDBOX' },
    {
      sandboxEnabled: true,
      hasCredentials: true,
      getPayPalBalance: async () => createUnavailablePayPalBalance('Reporting permission missing'),
      dispatchPayout: async () => {
        dispatchCalls += 1;
        throw new PayPalError(
          'PAYPAL_INSUFFICIENT_FUNDS',
          `PayPal Payouts rejected (INSUFFICIENT_FUNDS). Replenish at ${PAYPAL_SANDBOX_ACCOUNTS_URL}.`,
          { status: 422, paypalName: 'INSUFFICIENT_FUNDS' }
        );
      },
    }
  );

  assert.equal(firstRes.status, 502);
  const firstBody = (await firstRes.json()) as {
    error: string;
    dashboardUrl?: string;
    snapshot: ReturnType<typeof demoStore.getSnapshot>;
  };

  assert.equal(dispatchCalls, 1);
  assert.equal(firstBody.error, 'PAYPAL_INSUFFICIENT_FUNDS');
  assert.equal(firstBody.dashboardUrl, PAYPAL_SANDBOX_ACCOUNTS_URL);
  assert.equal(firstBody.snapshot.account.clearedBalanceCents, clearedBeforeCents);
  assert.equal(firstBody.snapshot.paypalBalance.availableCents, null);
  assert.ok(firstBody.snapshot.paypalBalance.lastInsufficientFundsAt);
  assert.equal(firstBody.snapshot.bills.find((b) => b.id === bill.id)?.status, 'FAILED');
  assert.equal(firstBody.snapshot.auditLogs[0]?.action, 'PAYOUT_FAILED');

  // Duplicate payout attempt after INSUFFICIENT_FUNDS must NOT dispatch to PayPal again or debit cash.
  const secondRes = await executePayoutAuthorization(
    { billId: bill.id, executionMode: 'PAYPAL_SANDBOX' },
    {
      sandboxEnabled: true,
      hasCredentials: true,
      getPayPalBalance: async () => createUnavailablePayPalBalance(),
      dispatchPayout: async () => {
        dispatchCalls += 1;
        throw new Error('Duplicate payout attempt must never reach dispatchPayout');
      },
    }
  );

  assert.equal(secondRes.status, 409);
  const secondBody = (await secondRes.json()) as {
    error: string;
    dashboardUrl?: string;
    snapshot: ReturnType<typeof demoStore.getSnapshot>;
  };
  assert.equal(dispatchCalls, 1);
  assert.equal(secondBody.error, 'PAYPAL_INSUFFICIENT_FUNDS');
  assert.equal(secondBody.dashboardUrl, PAYPAL_SANDBOX_ACCOUNTS_URL);
  assert.equal(secondBody.snapshot.account.clearedBalanceCents, clearedBeforeCents);
  assert.equal(secondBody.snapshot.bills.find((b) => b.id === bill.id)?.status, 'FAILED');
});

