import { NextResponse } from 'next/server';
import { demoStore } from '@/lib/store';
import {
  calculatePayoutFeeCents,
  evaluatePayoutPolicy,
  formatCentsToUSD,
} from '@/lib/money';
import {
  PAYPAL_PAYOUT_FEE_CENTS,
  PAYPAL_SANDBOX_ENABLED,
  payoutReceiverFor,
} from '@/lib/config';
import { jsonError } from '@/lib/http';
import { derivePayoutRequestId } from '@/lib/idempotency';
import {
  dispatchPayout,
  getPayPalSandboxBalance,
  parsePayoutBatch,
  PayPalError,
} from '@/lib/paypal';
import {
  evaluateBillPayPalBalance,
  PAYPAL_SANDBOX_ACCOUNTS_URL,
} from '@/lib/paypalBalance';
import type { PayPalBalanceSnapshot } from '@/types';

export interface PayoutAuthorizationDeps {
  sandboxEnabled?: boolean;
  hasCredentials?: boolean;
  getPayPalBalance?: () => Promise<PayPalBalanceSnapshot>;
  dispatchPayout?: typeof dispatchPayout;
  paypalFeeCents?: number;
}

const billAuthQueues = new Map<string, Promise<unknown>>();

async function withBillAuthLock<T>(billId: string, task: () => Promise<T>): Promise<T> {
  const previous = billAuthQueues.get(billId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.catch(() => undefined).then(() => gate);
  billAuthQueues.set(billId, chained);

  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (billAuthQueues.get(billId) === chained) {
      billAuthQueues.delete(billId);
    }
  }
}

function replayResponse(
  outcome: NonNullable<ReturnType<typeof demoStore.getIdempotencyOutcome>>
) {
  const stored =
    outcome.response && typeof outcome.response === 'object'
      ? (outcome.response as Record<string, unknown>)
      : {};

  return NextResponse.json(
    {
      success: true,
      status: 'DISBURSED',
      mode: outcome.executionMode,
      isSimulated: outcome.executionMode === 'SIMULATION',
      billId: outcome.billId,
      batchId: outcome.paypalBatchId ?? null,
      message: 'This payout was already confirmed and settled.',
      ...stored,
      snapshot: demoStore.getSnapshot(),
    },
    {
      status: 200,
      headers: {
        'Idempotent-Replay': 'true',
        'Cache-Control': 'no-store',
      },
    }
  );
}

/**
 * Core payout execution flow with pre-payout PayPal Sandbox wallet balance verification,
 * atomic reserve-floor locking, INSUFFICIENT_FUNDS capture, and idempotent replay safety.
 */
export async function executePayoutAuthorization(
  input: {
    billId: string;
    executionMode: 'SIMULATION' | 'PAYPAL_SANDBOX';
  },
  deps?: PayoutAuthorizationDeps
): Promise<NextResponse> {
  const { billId, executionMode } = input;
  const sandboxEnabled = deps?.sandboxEnabled ?? PAYPAL_SANDBOX_ENABLED;
  const paypalFeeCents = deps?.paypalFeeCents ?? PAYPAL_PAYOUT_FEE_CENTS;
  const getPayPalBalanceFn = deps?.getPayPalBalance ?? getPayPalSandboxBalance;
  const dispatchPayoutFn = deps?.dispatchPayout ?? dispatchPayout;

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const hasCredentials =
    deps?.hasCredentials ??
    Boolean(
      clientId &&
        clientSecret &&
        !clientId.startsWith('your_') &&
        !clientSecret.startsWith('your_')
    );

  if (executionMode === 'PAYPAL_SANDBOX' && !sandboxEnabled) {
    return jsonError(
      403,
      'PAYPAL_DISABLED',
      'The PayPal Sandbox execution rail is disabled for this environment.'
    );
  }

  // Serialize pre-flight balance refresh, reserve check, idempotency reservation, and IN_FLIGHT
  // transition per bill so double clicks cannot trigger duplicate balance checks or race past
  // the reserve/duplicate guard while awaiting PayPal.
  const lockOutcome = await withBillAuthLock(billId, async () => {
    const preSnapshot = demoStore.getSnapshot();
    const key = derivePayoutRequestId(billId, preSnapshot.demoConfig.payoutEpoch);
    const feeForBalanceCheck =
      deps?.paypalFeeCents ??
      preSnapshot.account.payoutVerification?.actualFeeCents ??
      paypalFeeCents;

    if (executionMode === 'PAYPAL_SANDBOX' && hasCredentials) {
      const existingOutcome = demoStore.getIdempotencyOutcome(key);
      const existingBill = preSnapshot.bills.find((b) => b.id === billId);
      if (!existingOutcome && existingBill && existingBill.status === 'PENDING') {
        const inFlightCents = preSnapshot.bills
          .filter((b) => b.status === 'IN_FLIGHT' || b.status === 'APPROVED')
          .reduce((sum, b) => sum + b.amountCents + calculatePayoutFeeCents(b.amountCents), 0);
        const reserveCheck = evaluatePayoutPolicy({
          currentBalanceCents: Math.max(0, preSnapshot.account.clearedBalanceCents - inFlightCents),
          minReserveCents: preSnapshot.account.minReserveCents,
          billAmountCents: existingBill.amountCents,
          feeCents: calculatePayoutFeeCents(existingBill.amountCents),
        });

        if (!reserveCheck.wouldBreach) {
          const paypalBalance = await getPayPalBalanceFn();
          let nextSnapshot = demoStore.setPayPalBalanceState(paypalBalance);
          const walletCheck = evaluateBillPayPalBalance({
            paypalBalance: nextSnapshot.paypalBalance,
            billAmountCents: existingBill.amountCents,
            feeCents: feeForBalanceCheck,
          });

          if (walletCheck.status === 'INSUFFICIENT' && walletCheck.availableCents !== null) {
            nextSnapshot = demoStore.recordPayPalBalanceBlock({
              billId: existingBill.id,
              availableCents: walletCheck.availableCents,
              feeCents: walletCheck.feeCents,
              shortfallCents: walletCheck.shortfallCents,
            });
            return {
              kind: 'RESPONSE' as const,
              response: jsonError(
                409,
                'PAYPAL_INSUFFICIENT_BALANCE',
                `PayPal Sandbox payout blocked before dispatch: requires ${formatCentsToUSD(walletCheck.requiredCents)} (${formatCentsToUSD(existingBill.amountCents)} + ${formatCentsToUSD(walletCheck.feeCents)} PayPal fee), but Sandbox wallet holds ${formatCentsToUSD(walletCheck.availableCents)} (${formatCentsToUSD(walletCheck.shortfallCents)} short). Replenish Sandbox funds before retrying.`,
                {
                  availableCents: walletCheck.availableCents,
                  requiredCents: walletCheck.requiredCents,
                  feeCents: walletCheck.feeCents,
                  shortfallCents: walletCheck.shortfallCents,
                  dashboardUrl: PAYPAL_SANDBOX_ACCOUNTS_URL,
                  snapshot: nextSnapshot,
                }
              ),
            };
          }
        }
      }
    }

    let beginResult: ReturnType<typeof demoStore.beginPayout>;
    try {
      beginResult = demoStore.beginPayout({
        billId,
        idempotencyKey: key,
        executionMode,
      });
    } catch {
      return {
        kind: 'RESPONSE' as const,
        response: jsonError(500, 'SERVER_ERROR', 'Failed to authorize payout.'),
      };
    }

    if (!beginResult.ok) {
      return { kind: 'BEGIN_FAILED' as const, beginResult };
    }

    if (executionMode === 'PAYPAL_SANDBOX' && !hasCredentials) {
      return {
        kind: 'NO_CREDENTIALS' as const,
        beginResult,
        idempotencyKey: key,
      };
    }

    try {
      demoStore.markPayoutInFlight({ billId: beginResult.bill.id, idempotencyKey: key });
    } catch {
      return {
        kind: 'RESPONSE' as const,
        response: jsonError(500, 'SERVER_ERROR', 'Failed to move the payout to in-flight.'),
      };
    }

    return {
      kind: 'READY' as const,
      beginResult,
      idempotencyKey: key,
    };
  });

  if (lockOutcome.kind === 'RESPONSE') {
    return lockOutcome.response;
  }

  if (lockOutcome.kind === 'BEGIN_FAILED') {
    const { beginResult } = lockOutcome;
    switch (beginResult.reason) {
      case 'NOT_FOUND':
        return jsonError(404, 'NOT_FOUND', 'Vendor bill not found.', {
          snapshot: demoStore.getSnapshot(),
        });

      case 'ALREADY_DISBURSED':
        return jsonError(
          409,
          'ALREADY_DISBURSED',
          'This bill has already been paid and settled.',
          { snapshot: demoStore.getSnapshot() }
        );

      case 'IN_FLIGHT':
        return jsonError(
          409,
          'IN_FLIGHT',
          'A payout for this request is already in flight.',
          { snapshot: demoStore.getSnapshot() }
        );

      case 'APPROVAL_PENDING':
        return jsonError(
          409,
          'APPROVAL_PENDING',
          'This payout is already approved and awaiting dispatch.',
          { snapshot: demoStore.getSnapshot() }
        );

      case 'PAYOUT_FAILED':
        return jsonError(
          409,
          'PAYOUT_FAILED',
          'This bill has a failed payout. Reset the demo before trying a new payout.',
          { snapshot: demoStore.getSnapshot() }
        );

      case 'INVALID_AMOUNT':
        return jsonError(400, 'INVALID_AMOUNT', 'The payout amount is invalid.');

      case 'RESERVE_BREACH': {
        const snapshot = demoStore.getSnapshot();
        return jsonError(
          403,
          'RESERVE_BREACH_BLOCKED',
          'Payout blocked by the cash reserve policy.',
          {
            postPayoutBalanceCents: beginResult.postPayoutBalanceCents,
            reserveCents: snapshot.account.minReserveCents,
            deficitCents: beginResult.deficitCents,
            snapshot,
          }
        );
      }

      case 'DUPLICATE_REQUEST': {
        const outcome = beginResult.outcome;

        if (!outcome) {
          return jsonError(
            409,
            'DUPLICATE_REQUEST',
            'This payout request has already been used.',
            { snapshot: demoStore.getSnapshot() }
          );
        }

        if (outcome.status === 'SUCCEEDED') {
          return replayResponse(outcome);
        }

        if (outcome.status === 'IN_FLIGHT') {
          return NextResponse.json(
            {
              success: true,
              status: 'IN_FLIGHT',
              mode: outcome.executionMode,
              isSimulated: outcome.executionMode === 'SIMULATION',
              billId: outcome.billId,
              batchId: outcome.paypalBatchId ?? null,
              message:
                'This payout is already in flight. It cannot be retried until PayPal confirms settlement.',
              snapshot: demoStore.getSnapshot(),
            },
            {
              status: 202,
              headers: {
                'Idempotent-Replay': 'true',
                'Cache-Control': 'no-store',
              },
            }
          );
        }

        if (outcome.status === 'APPROVED') {
          return jsonError(
            409,
            'PAYOUT_APPROVAL_INCOMPLETE',
            'The payout was approved but never dispatched. Reconcile this request before retrying.',
            { snapshot: demoStore.getSnapshot() }
          );
        }

        return jsonError(
          409,
          outcome.code || 'PAYOUT_FAILED',
          'This bill is associated with a failed payout. No money was moved.',
          {
            ...(outcome.code === 'PAYPAL_INSUFFICIENT_FUNDS'
              ? { dashboardUrl: PAYPAL_SANDBOX_ACCOUNTS_URL }
              : {}),
            snapshot: demoStore.getSnapshot(),
          }
        );
      }

      default:
        return jsonError(
          409,
          'PAYOUT_REJECTED',
          'The payout could not be authorized.',
          { snapshot: demoStore.getSnapshot() }
        );
    }
  }

  const { beginResult, idempotencyKey } = lockOutcome;
  const bill = beginResult.bill;

  if (lockOutcome.kind === 'NO_CREDENTIALS') {
    let snapshot: ReturnType<typeof demoStore.getSnapshot>;
    try {
      snapshot = demoStore.failPayout({
        billId: bill.id,
        idempotencyKey,
        code: 'PAYPAL_CREDENTIALS_MISSING',
        message: 'PayPal Sandbox credentials are not configured.',
      });
    } catch {
      snapshot = demoStore.getSnapshot();
    }

    return jsonError(
      503,
      'PAYPAL_CREDENTIALS_MISSING',
      'PayPal Sandbox credentials are not configured. Use simulated payout mode instead.',
      { snapshot }
    );
  }

  if (executionMode === 'SIMULATION') {
    const responsePayload = {
      success: true,
      status: 'DISBURSED',
      mode: 'SIMULATION',
      isSimulated: true,
      billId: bill.id,
      batchId: null,
      message: `Simulated payout of ${formatCentsToUSD(bill.amountCents)} to ${bill.vendorName} confirmed. Cash balance updated.`,
    };

    try {
      const snapshot = demoStore.completePayout({
        billId: bill.id,
        idempotencyKey,
        isRealPayPal: false,
        response: {
          mode: 'SIMULATION',
          billId: bill.id,
          message: responsePayload.message,
        },
      });

      return NextResponse.json(
        { ...responsePayload, snapshot },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    } catch {
      let snapshot: ReturnType<typeof demoStore.getSnapshot>;
      try {
        snapshot = demoStore.failPayout({
          billId: bill.id,
          idempotencyKey,
          code: 'SERVER_ERROR',
          message: 'Failed to complete the simulated payout.',
        });
      } catch {
        snapshot = demoStore.getSnapshot();
      }
      return jsonError(
        500,
        'SERVER_ERROR',
        'Failed to complete the simulated payout.',
        { snapshot }
      );
    }
  }

  let payoutData: unknown;
  try {
    payoutData = await dispatchPayoutFn({
      idempotencyKey,
      amountCents: bill.amountCents,
      currency: 'USD',
      receiverEmail: payoutReceiverFor(bill.vendorEmail),
      senderBatchId: `batch-${idempotencyKey}`,
      note: `Payment for ${bill.description}`,
      emailSubject: `Payment from ${beginResult.snapshot.account.businessName}`,
      emailMessage: `You received payment for bill ${bill.billNumber}.`,
    });
  } catch (error: unknown) {
    const isUnknownOutcome =
      error instanceof PayPalError && error.code === 'PAYPAL_OUTCOME_UNKNOWN';

    if (isUnknownOutcome) {
      let snapshot: ReturnType<typeof demoStore.getSnapshot>;
      try {
        snapshot = demoStore.markPayoutUnknown({
          billId: bill.id,
          idempotencyKey,
          code: 'PAYPAL_OUTCOME_UNKNOWN',
          message:
            'PayPal did not confirm the payout outcome. The request is locked in flight for reconciliation.',
        });
      } catch {
        snapshot = demoStore.getSnapshot();
      }

      return NextResponse.json(
        {
          success: true,
          status: 'IN_FLIGHT',
          mode: 'PAYPAL_SANDBOX',
          isSimulated: false,
          billId: bill.id,
          batchId: null,
          message:
            'PayPal did not confirm the payout outcome. The bill remains in flight and cannot be retried.',
          snapshot,
        },
        { status: 202, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const code =
      error instanceof PayPalError ? error.code : 'PAYPAL_API_REJECTED';
    const message =
      error instanceof PayPalError
        ? error.message
        : 'PayPal rejected the payout request before a batch was accepted.';

    let snapshot: ReturnType<typeof demoStore.getSnapshot>;
    try {
      snapshot = demoStore.failPayout({
        billId: bill.id,
        idempotencyKey,
        code,
        message,
        isRealPayPal: true,
      });
      if (code === 'PAYPAL_INSUFFICIENT_FUNDS') {
        snapshot = demoStore.recordPayPalInsufficientFunds({ message });
      }
    } catch {
      snapshot = demoStore.getSnapshot();
    }

    return jsonError(502, code, message, {
      ...(code === 'PAYPAL_INSUFFICIENT_FUNDS'
        ? { dashboardUrl: PAYPAL_SANDBOX_ACCOUNTS_URL }
        : {}),
      snapshot,
    });
  }

  // From this point PayPal may have accepted the payout. Any internal error is
  // an unknown outcome, never a failure: marking it FAILED could hide money
  // that is still moving at PayPal.
  let acceptedBatchId: string | null = null;
  try {
    const batch = parsePayoutBatch(payoutData);
    acceptedBatchId = batch.batchId;

    if (!batch.batchId) {
      demoStore.markPayoutUnknown({
        billId: bill.id,
        idempotencyKey,
        code: 'PAYPAL_OUTCOME_UNKNOWN',
        message: 'PayPal accepted the request but did not return a batch id.',
        paypalStatus: batch.batchStatus ?? undefined,
      });

      return NextResponse.json(
        {
          success: true,
          status: 'IN_FLIGHT',
          mode: 'PAYPAL_SANDBOX',
          isSimulated: false,
          billId: bill.id,
          batchId: null,
          message:
            'PayPal did not return a batch id. The payout remains in flight and requires reconciliation.',
          snapshot: demoStore.getSnapshot(),
        },
        { status: 202, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    demoStore.markPayoutAccepted({
      billId: bill.id,
      idempotencyKey,
      batchId: batch.batchId,
      paypalStatus: batch.batchStatus ?? 'UNKNOWN',
      response: payoutData,
      actualFeeCents: batch.actualFeeCents,
    });

    if (batch.outcome === 'SUCCESS') {
      const responsePayload = {
        success: true,
        status: 'DISBURSED',
        mode: 'PAYPAL_SANDBOX',
        isSimulated: false,
        billId: bill.id,
        batchId: batch.batchId,
        message: `PayPal Sandbox confirmed batch ${batch.batchId}: ${formatCentsToUSD(bill.amountCents)} settled to ${bill.vendorName}.`,
      };

      const snapshot = demoStore.completePayout({
        billId: bill.id,
        idempotencyKey,
        isRealPayPal: true,
        externalRef: batch.batchId,
        response: { ...responsePayload, paypal: payoutData },
        actualFeeCents: batch.actualFeeCents,
      });

      return NextResponse.json(
        { ...responsePayload, snapshot },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (batch.outcome === 'FAILED') {
      const failCode = batch.insufficientFunds
        ? 'PAYPAL_INSUFFICIENT_FUNDS'
        : 'PAYPAL_BATCH_FAILED';
      const failMessage = batch.insufficientFunds
        ? `PayPal reported INSUFFICIENT_FUNDS for batch ${batch.batchId}. Replenish Sandbox funds at ${PAYPAL_SANDBOX_ACCOUNTS_URL}.`
        : `PayPal reported batch ${batch.batchId} as ${batch.batchStatus ?? 'failed'}.`;
      let snapshot: ReturnType<typeof demoStore.getSnapshot>;
      try {
        snapshot = demoStore.failPayout({
          billId: bill.id,
          idempotencyKey,
          code: failCode,
          message: failMessage,
          isRealPayPal: true,
          externalRef: batch.batchId,
        });
        if (batch.insufficientFunds) {
          snapshot = demoStore.recordPayPalInsufficientFunds({ message: failMessage });
        }
      } catch {
        snapshot = demoStore.getSnapshot();
      }

      return jsonError(
        502,
        failCode,
        batch.insufficientFunds
          ? failMessage
          : 'PayPal reported that the payout failed. No ledger debit was applied.',
        {
          ...(batch.insufficientFunds
            ? { dashboardUrl: PAYPAL_SANDBOX_ACCOUNTS_URL }
            : {}),
          snapshot,
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        status: 'IN_FLIGHT',
        mode: 'PAYPAL_SANDBOX',
        isSimulated: false,
        billId: bill.id,
        batchId: batch.batchId,
        message: `PayPal accepted batch ${batch.batchId} with status ${batch.batchStatus ?? 'PENDING'}. Settlement is not confirmed yet; sync or wait for the webhook.`,
        snapshot: demoStore.getSnapshot(),
      },
      { status: 202, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    let snapshot: ReturnType<typeof demoStore.getSnapshot>;
    try {
      snapshot = demoStore.markPayoutUnknown({
        billId: bill.id,
        idempotencyKey,
        code: 'PAYPAL_RECONCILIATION_REQUIRED',
        message:
          'PayPal accepted the payout, but the local outcome could not be recorded.',
        paypalBatchId: acceptedBatchId ?? undefined,
      });
    } catch {
      snapshot = demoStore.getSnapshot();
    }

    return NextResponse.json(
      {
        success: true,
        status: 'IN_FLIGHT',
        mode: 'PAYPAL_SANDBOX',
        isSimulated: false,
        billId: bill.id,
        batchId: acceptedBatchId,
        message:
          'PayPal accepted the payout, but the local outcome could not be recorded. The bill remains in flight and requires reconciliation.',
        snapshot,
      },
      { status: 202, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
