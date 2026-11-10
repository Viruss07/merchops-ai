import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/store';
import { PAYPAL_SANDBOX_ENABLED } from '@/lib/config';
import { jsonError, requireSameOrigin } from '@/lib/http';
import { parseJson, payoutSyncSchema } from '@/lib/validation';
import { getPayoutBatch, parsePayoutBatch, PayPalError } from '@/lib/paypal';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const originResponse = requireSameOrigin(req);
  if (originResponse) return originResponse;

  const parsed = await parseJson(req, payoutSyncSchema);
  if (!parsed.ok) return parsed.response;

  const bill = demoStore.getBills().find((candidate) => candidate.id === parsed.data.billId);
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

  if (request.executionMode === 'SIMULATION' || !PAYPAL_SANDBOX_ENABLED) {
    return NextResponse.json(
      {
        success: true,
        status: 'IN_FLIGHT',
        billId: bill.id,
        message:
          'This payout has no PayPal batch to sync. It remains in flight and requires reconciliation.',
        snapshot: demoStore.getSnapshot(),
      },
      { status: 202, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (!request.paypalBatchId) {
    demoStore.markPayoutUnknown({
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
        message:
          'No PayPal batch id is available yet. The payout remains in flight and cannot be retried.',
        snapshot: demoStore.getSnapshot(),
      },
      { status: 202, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const batchData = await getPayoutBatch(request.paypalBatchId);
    const batch = parsePayoutBatch(batchData);
    const batchId = batch.batchId ?? request.paypalBatchId;

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
      });

      return NextResponse.json(
        {
          success: true,
          status: 'DISBURSED',
          billId: bill.id,
          batchId,
          message: `PayPal confirmed batch ${batchId}. The ledger was debited once.`,
          snapshot,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (batch.outcome === 'FAILED') {
      const snapshot = demoStore.failPayout({
        billId: bill.id,
        idempotencyKey: request.idempotencyKey,
        code: 'PAYPAL_BATCH_FAILED',
        message: `PayPal reported batch ${batchId} as ${batch.batchStatus ?? 'failed'}.`,
        isRealPayPal: true,
        externalRef: batchId,
        actor: 'SYSTEM',
      });

      return jsonError(
        502,
        'PAYPAL_BATCH_FAILED',
        'PayPal reported that the payout failed. No ledger debit was applied.',
        { snapshot }
      );
    }

    return NextResponse.json(
      {
        success: true,
        status: 'IN_FLIGHT',
        billId: bill.id,
        batchId,
        message:
          batch.itemStatuses.includes('UNCLAIMED')
            ? `PayPal processed batch ${batchId}, but the payment is UNCLAIMED: the receiver has no sandbox account yet. It stays in flight and no debit has been applied.`
            : `PayPal batch ${batchId} is ${batch.batchStatus ?? 'pending'}, items ${batch.itemStatuses.join(', ') || 'pending'}. No debit has been applied.`,
        snapshot: demoStore.getSnapshot(),
      },
      { status: 202, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error: unknown) {
    const message =
      error instanceof PayPalError
        ? error.message
        : 'PayPal status could not be confirmed.';

    let snapshot: ReturnType<typeof demoStore.getSnapshot>;
    try {
      snapshot = demoStore.markPayoutUnknown({
        billId: bill.id,
        idempotencyKey: request.idempotencyKey,
        code: 'PAYPAL_OUTCOME_UNKNOWN',
        message,
        paypalBatchId: request.paypalBatchId,
      });
    } catch {
      snapshot = demoStore.getSnapshot();
    }

    return NextResponse.json(
      {
        success: true,
        status: 'IN_FLIGHT',
        billId: bill.id,
        batchId: request.paypalBatchId,
        message:
          'PayPal status could not be confirmed. The payout remains in flight and cannot be retried.',
        snapshot,
      },
      { status: 202, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
