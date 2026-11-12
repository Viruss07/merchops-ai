import { NextResponse } from 'next/server';
import { demoStore } from '@/lib/store';
import { PAYPAL_SANDBOX_ENABLED } from '@/lib/config';
import { jsonError } from '@/lib/http';
import { getPayoutBatch, parsePayoutBatch, PayPalError } from '@/lib/paypal';
import { PAYPAL_SANDBOX_ACCOUNTS_URL } from '@/lib/paypalBalance';

export interface PayoutSyncDeps {
  sandboxEnabled?: boolean;
  getPayoutBatch?: typeof getPayoutBatch;
}

const billSyncQueues = new Map<string, Promise<unknown>>();

async function withBillSyncLock<T>(billId: string, task: () => Promise<T>): Promise<T> {
  const previous = billSyncQueues.get(billId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.catch(() => undefined).then(() => gate);
  billSyncQueues.set(billId, chained);

  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (billSyncQueues.get(billId) === chained) {
      billSyncQueues.delete(billId);
    }
  }
}

/**
 * Queries PayPal Payouts status (`GET /v1/payments/payouts/{batchId}`) for an existing IN_FLIGHT bill.
 * Never initiates a new payout or generates a new batch ID; retains batch metadata across transient
 * network errors and settles the ledger at most once when PayPal confirms item SUCCESS.
 */
export async function executePayoutSync(
  input: { billId: string },
  deps?: PayoutSyncDeps
): Promise<NextResponse> {
  const sandboxEnabled = deps?.sandboxEnabled ?? PAYPAL_SANDBOX_ENABLED;
  const getPayoutBatchFn = deps?.getPayoutBatch ?? getPayoutBatch;

  return withBillSyncLock(input.billId, async () => {
    const bill = demoStore.getBills().find((candidate) => candidate.id === input.billId);
    if (!bill) {
      return jsonError(404, 'NOT_FOUND', 'Vendor bill not found.', {
        snapshot: demoStore.getSnapshot(),
      });
    }

    if (bill.status === 'DISBURSED') {
      return NextResponse.json(
        {
          success: true,
          status: 'DISBURSED',
          billId: bill.id,
          batchId: bill.paypalBatchId ?? null,
          paypalStatus: bill.paypalBatchStatus ?? 'SUCCESS',
          pollable: false,
          transientError: false,
          message: 'This payout is already settled.',
          snapshot: demoStore.getSnapshot(),
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (bill.status === 'FAILED') {
      return jsonError(409, 'PAYOUT_FAILED', 'This payout has failed. No funds were moved.', {
        snapshot: demoStore.getSnapshot(),
      });
    }

    if (bill.status !== 'IN_FLIGHT') {
      return jsonError(400, 'NOT_IN_FLIGHT', 'Only in-flight payouts can be synced.', {
        snapshot: demoStore.getSnapshot(),
      });
    }

    const request = demoStore.getPayoutRequestByBillId(bill.id);
    if (!request) {
      return jsonError(409, 'PAYOUT_STATE_MISSING', 'No payout request was found for this bill.', {
        snapshot: demoStore.getSnapshot(),
      });
    }

    if (request.executionMode === 'SIMULATION' || !sandboxEnabled) {
      return NextResponse.json(
        {
          success: true,
          status: 'IN_FLIGHT',
          billId: bill.id,
          batchId: request.paypalBatchId ?? null,
          paypalStatus: request.paypalStatus ?? 'PENDING',
          pollable: false,
          transientError: false,
          message:
            'This payout has no PayPal batch to sync. It remains in flight and requires reconciliation.',
          snapshot: demoStore.getSnapshot(),
        },
        { status: 202, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (!request.paypalBatchId) {
      const snapshot = demoStore.markPayoutUnknown({
        billId: bill.id,
        idempotencyKey: request.idempotencyKey,
        code: 'PAYPAL_BATCH_ID_MISSING',
        message: 'No PayPal batch id is stored, so settlement cannot be queried yet.',
      });

      return NextResponse.json(
        {
          success: true,
          status: 'IN_FLIGHT',
          billId: bill.id,
          batchId: null,
          paypalStatus: request.paypalStatus ?? 'UNKNOWN',
          pollable: false,
          transientError: false,
          message:
            'No PayPal batch id is available yet. The payout remains in flight and cannot be retried.',
          snapshot,
        },
        { status: 202, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const storedBatchId = request.paypalBatchId;

    try {
      const batchData = await getPayoutBatchFn(storedBatchId);
      const batch = parsePayoutBatch(batchData);
      const batchId = batch.batchId ?? storedBatchId;

      if (batch.outcome === 'SUCCESS') {
        const snapshot = demoStore.completePayout({
          billId: bill.id,
          idempotencyKey: request.idempotencyKey,
          isRealPayPal: true,
          externalRef: batchId,
          response: {
            mode: 'PAYPAL_SANDBOX',
            billId: bill.id,
            message: `PayPal batch ${batchId} confirmed settled.`,
            paypal: batchData,
          },
          actor: 'SYSTEM',
          actualFeeCents: batch.actualFeeCents,
        });

        return NextResponse.json(
          {
            success: true,
            status: 'DISBURSED',
            billId: bill.id,
            batchId,
            paypalStatus: 'SUCCESS',
            pollable: false,
            transientError: false,
            message: `PayPal confirmed batch ${batchId}. The ledger was debited once.`,
            snapshot,
          },
          { headers: { 'Cache-Control': 'no-store' } }
        );
      }

      if (batch.outcome === 'FAILED') {
        const failCode = batch.insufficientFunds
          ? 'PAYPAL_INSUFFICIENT_FUNDS'
          : 'PAYPAL_BATCH_FAILED';
        const failMessage = batch.insufficientFunds
          ? `PayPal reported INSUFFICIENT_FUNDS for batch ${batchId}. Replenish Sandbox funds at ${PAYPAL_SANDBOX_ACCOUNTS_URL}.`
          : `PayPal reported batch ${batchId} as ${batch.batchStatus ?? 'failed'}.`;
        let snapshot = demoStore.failPayout({
          billId: bill.id,
          idempotencyKey: request.idempotencyKey,
          code: failCode,
          message: failMessage,
          isRealPayPal: true,
          externalRef: batchId,
          actor: 'SYSTEM',
        });
        if (batch.insufficientFunds) {
          snapshot = demoStore.recordPayPalInsufficientFunds({ message: failMessage });
        }

        return jsonError(
          502,
          failCode,
          batch.insufficientFunds
            ? failMessage
            : 'PayPal reported that the payout failed. No ledger debit was applied.',
          {
            ...(batch.insufficientFunds ? { dashboardUrl: PAYPAL_SANDBOX_ACCOUNTS_URL } : {}),
            snapshot,
          }
        );
      }

      const statusLabel = batch.batchStatus ?? 'PENDING';
      const snapshot = demoStore.recordPayoutSyncStatus({
        billId: bill.id,
        idempotencyKey: request.idempotencyKey,
        batchId,
        paypalStatus: statusLabel,
      });

      return NextResponse.json(
        {
          success: true,
          status: 'IN_FLIGHT',
          billId: bill.id,
          batchId,
          paypalStatus: statusLabel,
          pollable: !batch.itemStatuses.includes('UNCLAIMED'),
          transientError: false,
          message: batch.itemStatuses.includes('UNCLAIMED')
            ? `PayPal processed batch ${batchId}, but the payment is UNCLAIMED: the receiver has no sandbox account yet. It stays in flight and no debit has been applied.`
            : `PayPal batch ${batchId} is ${statusLabel}, items ${batch.itemStatuses.join(', ') || 'PENDING'}. No debit has been applied.`,
          snapshot,
        },
        { status: 202, headers: { 'Cache-Control': 'no-store' } }
      );
    } catch (error: unknown) {
      const message =
        error instanceof PayPalError ? error.message : 'PayPal status could not be confirmed.';

      let snapshot: ReturnType<typeof demoStore.getSnapshot>;
      try {
        snapshot = demoStore.markPayoutUnknown({
          billId: bill.id,
          idempotencyKey: request.idempotencyKey,
          code: 'PAYPAL_OUTCOME_UNKNOWN',
          message,
          paypalBatchId: storedBatchId,
        });
      } catch {
        snapshot = demoStore.getSnapshot();
      }

      return NextResponse.json(
        {
          success: true,
          status: 'IN_FLIGHT',
          billId: bill.id,
          batchId: storedBatchId,
          paypalStatus: request.paypalStatus ?? 'UNKNOWN',
          pollable: true,
          transientError: true,
          message: `PayPal status could not be confirmed for batch ${storedBatchId}. The payout remains in flight and can be refreshed safely.`,
          snapshot,
        },
        { status: 202, headers: { 'Cache-Control': 'no-store' } }
      );
    }
  });
}

