import test from 'node:test';
import assert from 'node:assert/strict';
import { demoStore } from '../src/lib/store';
import { PAYPAL_PAYOUT_FEE_CENTS } from '../src/lib/config';
import { executePayoutAuthorization } from '../src/lib/payoutExecutor';
import { executePayoutSync } from '../src/lib/payoutSyncExecutor';
import { runPayoutSettlementPolling } from '../src/lib/client/payoutPolling';
import { createUnavailablePayPalBalance } from '../src/lib/paypalBalance';
import { clearPayPalTokenCache, getPayPalAccessToken, PayPalError } from '../src/lib/paypal';
import { ApiError, type SyncPayoutResponse } from '../src/lib/apiClient';
import type { Bill, PayPalBalanceSnapshot, StateSnapshot } from '../src/types';

function seedPayableBill(): { bill: Bill; clearedBeforeCents: number } {
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
  assert.ok(bill, 'Expected a payable pending bill');
  return { bill, clearedBeforeCents: snapshot.account.clearedBalanceCents };
}

test('duplicate concurrent clicks on PayPal payout authorize dispatch at most once and stay idempotent', async () => {
  const { bill, clearedBeforeCents } = seedPayableBill();
  let balanceQueries = 0;
  let dispatchCalls = 0;

  const mockBalance: PayPalBalanceSnapshot = {
    availability: 'AVAILABLE',
    availableCents: bill.amountCents + PAYPAL_PAYOUT_FEE_CENTS + 50_000,
    currency: 'USD',
    checkedAt: '2026-11-12T06:00:00.000Z',
    source: 'PAYPAL_REPORTING_API',
    reason: null,
    lastInsufficientFundsAt: null,
    lastInsufficientFundsMessage: null,
  };

  const deps = {
    sandboxEnabled: true,
    hasCredentials: true,
    getPayPalBalance: async () => {
      balanceQueries += 1;
      await new Promise((r) => setTimeout(r, 15));
      return mockBalance;
    },
    dispatchPayout: async () => {
      dispatchCalls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return {
        batch_header: {
          payout_batch_id: 'BATCH-DEDUP-1',
          batch_status: 'PENDING',
        },
        items: [{ transaction_status: 'PENDING' }],
      };
    },
  };

  const [resA, resB] = await Promise.all([
    executePayoutAuthorization({ billId: bill.id, executionMode: 'PAYPAL_SANDBOX' }, deps),
    executePayoutAuthorization({ billId: bill.id, executionMode: 'PAYPAL_SANDBOX' }, deps),
  ]);

  assert.equal(balanceQueries, 1, 'Serialized per-bill lock should query balance once for double click');
  assert.equal(dispatchCalls, 1, 'Double click must invoke PayPal dispatchPayout exactly once');
  assert.equal(resA.status, 202);
  assert.equal(resB.status, 202);
  assert.equal(resB.headers.get('Idempotent-Replay'), 'true');

  const bodyA = (await resA.json()) as { batchId: string; status: string };
  assert.equal(bodyA.status, 'IN_FLIGHT');
  assert.equal(bodyA.batchId, 'BATCH-DEDUP-1');

  const snap = demoStore.getSnapshot();
  assert.equal(snap.account.clearedBalanceCents, clearedBeforeCents, 'Must not debit while PENDING');
  assert.equal(snap.bills.find((b) => b.id === bill.id)?.paypalBatchId, 'BATCH-DEDUP-1');
});

test('pending-to-success auto-polling transitions to DISBURSED without duplicate payouts and debits once', async () => {
  const { bill, clearedBeforeCents } = seedPayableBill();
  let dispatchCalls = 0;
  let batchQueryCount = 0;

  // Step 1: Authorize payout -> PayPal returns PENDING batch
  const authRes = await executePayoutAuthorization(
    { billId: bill.id, executionMode: 'PAYPAL_SANDBOX' },
    {
      sandboxEnabled: true,
      hasCredentials: true,
      getPayPalBalance: async () => createUnavailablePayPalBalance('HTTP 403 List Balances missing'),
      dispatchPayout: async () => {
        dispatchCalls += 1;
        return {
          batch_header: {
            payout_batch_id: 'BATCH-POLL-1',
            batch_status: 'PENDING',
          },
          items: [{ transaction_status: 'PENDING' }],
        };
      },
    }
  );
  assert.equal(authRes.status, 202);
  assert.equal(dispatchCalls, 1);

  // Step 2: Poll sync endpoint: PENDING -> PENDING -> SUCCESS (must never re-call dispatchPayout)
  const capturedSnapshots: StateSnapshot[] = [];
  const pollResult = await runPayoutSettlementPolling({
    billId: bill.id,
    initialBatchId: 'BATCH-POLL-1',
    initialDelayMs: 0,
    intervalMs: 0,
    maxDurationMs: 10_000,
    waitFn: async () => undefined,
    syncFn: async (targetBillId) => {
      const res = await executePayoutSync(
        { billId: targetBillId },
        {
          sandboxEnabled: true,
          getPayoutBatch: async (batchId) => {
            batchQueryCount += 1;
            assert.equal(batchId, 'BATCH-POLL-1', 'Must always query the original stored batch ID');
            if (batchQueryCount < 3) {
              return {
                batch_header: { payout_batch_id: batchId, batch_status: 'PENDING' },
                items: [{ transaction_status: 'PENDING' }],
              };
            }
            return {
              batch_header: {
                payout_batch_id: batchId,
                batch_status: 'SUCCESS',
                fees: { currency: 'USD', value: '0.25' },
              },
              items: [
                {
                  transaction_status: 'SUCCESS',
                  payout_item_fee: { currency: 'USD', value: '0.25' },
                },
              ],
            };
          },
        }
      );
      return (await res.json()) as SyncPayoutResponse;
    },
    onSnapshot: (snap) => {
      capturedSnapshots.push(snap);
    },
  });

  assert.equal(dispatchCalls, 1, 'Polling must NEVER dispatch another payout');
  assert.equal(batchQueryCount, 3);
  assert.equal(pollResult.phase, 'settled');
  assert.equal(pollResult.batchId, 'BATCH-POLL-1');
  assert.equal(pollResult.attempts, 3);
  const latestSnapshot = capturedSnapshots[capturedSnapshots.length - 1];
  assert.ok(latestSnapshot);
  assert.equal(latestSnapshot.account.clearedBalanceCents, clearedBeforeCents - bill.amountCents);
  const settledBill = latestSnapshot.bills.find((b) => b.id === bill.id);
  assert.equal(settledBill?.status, 'DISBURSED');
  assert.equal(settledBill?.paypalBatchId, 'BATCH-POLL-1');
  assert.equal(settledBill?.actualFeeCents, 25);

  // Step 3: Concurrent extra syncs after settlement remain idempotent and never debit twice
  const extraSyncs = await Promise.all(
    Array.from({ length: 5 }, () =>
      executePayoutSync(
        { billId: bill.id },
        {
          sandboxEnabled: true,
          getPayoutBatch: async () => {
            throw new Error('Must not re-query PayPal after bill is DISBURSED');
          },
        }
      )
    )
  );
  for (const res of extraSyncs) {
    assert.equal(res.status, 200);
  }
  assert.equal(demoStore.getAccount().clearedBalanceCents, clearedBeforeCents - bill.amountCents);
});

test('transient network failures during polling retain batchId, avoid false failures, and allow safe recovery', async () => {
  const { bill, clearedBeforeCents } = seedPayableBill();

  await executePayoutAuthorization(
    { billId: bill.id, executionMode: 'PAYPAL_SANDBOX' },
    {
      sandboxEnabled: true,
      hasCredentials: true,
      getPayPalBalance: async () => createUnavailablePayPalBalance(),
      dispatchPayout: async () => ({
        batch_header: { payout_batch_id: 'BATCH-NET-RECOVER', batch_status: 'PENDING' },
        items: [{ transaction_status: 'PENDING' }],
      }),
    }
  );

  let step = 0;
  let capturedWarningDuringPoll: string | null = null;
  let currentNow = 0;

  const finalState = await runPayoutSettlementPolling({
    billId: bill.id,
    initialBatchId: 'BATCH-NET-RECOVER',
    initialDelayMs: 0,
    intervalMs: 0,
    maxDurationMs: 10_000,
    nowFn: () => {
      currentNow += 100;
      return currentNow;
    },
    waitFn: async () => undefined,
    syncFn: async (targetBillId) => {
      step += 1;
      if (step === 1) {
        // Server experiences transient PayPal timeout
        const res = await executePayoutSync(
          { billId: targetBillId },
          {
            sandboxEnabled: true,
            getPayoutBatch: async () => {
              throw new PayPalError('PAYPAL_OUTCOME_UNKNOWN', 'PayPal batch lookup timed out.');
            },
          }
        );
        assert.equal(res.status, 202);
        const body = (await res.json()) as SyncPayoutResponse;
        assert.equal(body.transientError, true);
        assert.equal(body.batchId, 'BATCH-NET-RECOVER');
        return body;
      }
      if (step === 2) {
        // Client fetch throws transient network error
        throw new ApiError(0, 'NETWORK_ERROR', 'Unable to reach the server.');
      }
      // Step 3 recovers cleanly to SUCCESS
      const res = await executePayoutSync(
        { billId: targetBillId },
        {
          sandboxEnabled: true,
          getPayoutBatch: async (batchId) => ({
            batch_header: {
              payout_batch_id: batchId,
              batch_status: 'SUCCESS',
              fees: { currency: 'USD', value: '0.25' },
            },
            items: [{ transaction_status: 'SUCCESS' }],
          }),
        }
      );
      return (await res.json()) as SyncPayoutResponse;
    },
    onProgress: (p) => {
      assert.equal(p.batchId, 'BATCH-NET-RECOVER', 'Batch ID must remain intact across network errors');
      if (p.networkWarning) capturedWarningDuringPoll = p.networkWarning;
    },
  });

  assert.ok(capturedWarningDuringPoll);
  assert.equal(finalState.phase, 'settled');
  assert.equal(finalState.networkWarning, null, 'Settled state clears transient warnings');
  assert.equal(demoStore.getAccount().clearedBalanceCents, clearedBeforeCents - bill.amountCents);
});

test('polling stops cleanly after maxDurationMs while preserving batchId for manual refresh', async () => {
  const { bill, clearedBeforeCents } = seedPayableBill();

  await executePayoutAuthorization(
    { billId: bill.id, executionMode: 'PAYPAL_SANDBOX' },
    {
      sandboxEnabled: true,
      hasCredentials: true,
      getPayPalBalance: async () => createUnavailablePayPalBalance(),
      dispatchPayout: async () => ({
        batch_header: { payout_batch_id: 'BATCH-TIMEOUT-CAP', batch_status: 'PENDING' },
        items: [{ transaction_status: 'PENDING' }],
      }),
    }
  );

  let fakeClock = 0;
  const result = await runPayoutSettlementPolling({
    billId: bill.id,
    initialBatchId: 'BATCH-TIMEOUT-CAP',
    initialDelayMs: 0,
    intervalMs: 0,
    maxDurationMs: 5_000,
    nowFn: () => {
      const t = fakeClock;
      fakeClock += 3_000;
      return t;
    },
    waitFn: async () => undefined,
    syncFn: async (targetBillId) => {
      const res = await executePayoutSync(
        { billId: targetBillId },
        {
          sandboxEnabled: true,
          getPayoutBatch: async (batchId) => ({
            batch_header: { payout_batch_id: batchId, batch_status: 'PENDING' },
            items: [{ transaction_status: 'PENDING' }],
          }),
        }
      );
      return (await res.json()) as SyncPayoutResponse;
    },
  });

  assert.equal(result.phase, 'timed_out');
  assert.equal(result.batchId, 'BATCH-TIMEOUT-CAP');
  assert.equal(demoStore.getAccount().clearedBalanceCents, clearedBeforeCents);
});

test('successful real PayPal settlement clears active insufficient-funds flag while preserving audit warning history', () => {
  const { bill, clearedBeforeCents } = seedPayableBill();
  demoStore.recordPayPalBalanceBlock({
    billId: bill.id,
    availableCents: 1000,
    feeCents: 25,
    shortfallCents: bill.amountCents + 25 - 1000,
  });
  demoStore.recordPayPalInsufficientFunds({
    message: 'PayPal reported INSUFFICIENT_FUNDS earlier.',
  });

  assert.ok(demoStore.getSnapshot().paypalBalance.lastInsufficientFundsAt);

  demoStore.beginPayout({ billId: bill.id, idempotencyKey: 'key-hist', executionMode: 'PAYPAL_SANDBOX' });
  demoStore.markPayoutInFlight({ billId: bill.id, idempotencyKey: 'key-hist' });
  const settled = demoStore.completePayout({
    billId: bill.id,
    idempotencyKey: 'key-hist',
    isRealPayPal: true,
    externalRef: 'BATCH-SETTLED-OK',
    actualFeeCents: 25,
    response: { ok: true },
  });

  assert.equal(settled.paypalBalance.lastInsufficientFundsAt, null);
  assert.equal(settled.paypalBalance.lastInsufficientFundsMessage, null);
  assert.equal(settled.account.clearedBalanceCents, clearedBeforeCents - bill.amountCents);
  assert.ok(
    settled.auditLogs.some((log) => log.action === 'PAYOUT_BLOCKED_PAYPAL_BALANCE'),
    'Historical pre-payout balance warning must remain preserved in auditLogs'
  );
  assert.equal(settled.auditLogs[0]?.action, 'PAYOUT_DISBURSED_PAYPAL');
});

test('getPayPalAccessToken uses unadorned client_credentials so app-enabled Reporting scopes are not stripped', async () => {
  const originalFetch = globalThis.fetch;
  const prevId = process.env.PAYPAL_CLIENT_ID;
  const prevSecret = process.env.PAYPAL_CLIENT_SECRET;
  const prevBase = process.env.PAYPAL_API_BASE_URL;

  clearPayPalTokenCache();
  process.env.PAYPAL_CLIENT_ID = 'test-client-id';
  process.env.PAYPAL_CLIENT_SECRET = 'test-client-secret';
  process.env.PAYPAL_API_BASE_URL = 'https://api-m.sandbox.paypal.com';

  let capturedBody: string | undefined;
  globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    capturedBody = typeof init?.body === 'string' ? init.body : undefined;
    return new Response(
      JSON.stringify({ access_token: 'tok-default', expires_in: 3600 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const token = await getPayPalAccessToken(true);
    assert.equal(token, 'tok-default');
    assert.equal(capturedBody, 'grant_type=client_credentials');
  } finally {
    clearPayPalTokenCache();
    globalThis.fetch = originalFetch;
    if (prevId === undefined) delete process.env.PAYPAL_CLIENT_ID;
    else process.env.PAYPAL_CLIENT_ID = prevId;
    if (prevSecret === undefined) delete process.env.PAYPAL_CLIENT_SECRET;
    else process.env.PAYPAL_CLIENT_SECRET = prevSecret;
    if (prevBase === undefined) delete process.env.PAYPAL_API_BASE_URL;
    else process.env.PAYPAL_API_BASE_URL = prevBase;
  }
});
