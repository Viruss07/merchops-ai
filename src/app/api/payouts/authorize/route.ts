import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/store';
import { formatCentsToUSD } from '@/lib/money';
import { PAYPAL_SANDBOX_ENABLED } from '@/lib/config';
import { jsonError, requireSameOrigin } from '@/lib/http';
import { parseJson, payoutSchema } from '@/lib/validation';
import { derivePayoutRequestId } from '@/lib/idempotency';
import {
  dispatchPayout,
  parsePayoutBatch,
  PayPalError,
} from '@/lib/paypal';

export const dynamic = 'force-dynamic';

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

export async function POST(req: NextRequest) {
  const originResponse = requireSameOrigin(req);
  if (originResponse) return originResponse;

  const parsed = await parseJson(req, payoutSchema);
  if (!parsed.ok) return parsed.response;

  const { billId, executionMode } = parsed.data;
  const idempotencyKey = derivePayoutRequestId(billId);

  if (executionMode === 'PAYPAL_SANDBOX' && !PAYPAL_SANDBOX_ENABLED) {
    return jsonError(
      403,
      'PAYPAL_DISABLED',
      'The PayPal Sandbox execution rail is disabled for this environment.'
    );
  }

  let beginResult: ReturnType<typeof demoStore.beginPayout>;
  try {
    beginResult = demoStore.beginPayout({
      billId,
      idempotencyKey,
      executionMode,
    });
  } catch {
    return jsonError(500, 'SERVER_ERROR', 'Failed to authorize payout.');
  }

  if (!beginResult.ok) {
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
          { snapshot: demoStore.getSnapshot() }
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

  const bill = beginResult.bill;

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
      demoStore.markPayoutInFlight({ billId: bill.id, idempotencyKey });
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

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (
    !clientId ||
    !clientSecret ||
    clientId.startsWith('your_') ||
    clientSecret.startsWith('your_')
  ) {
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

  try {
    demoStore.markPayoutInFlight({ billId: bill.id, idempotencyKey });
  } catch {
    return jsonError(500, 'SERVER_ERROR', 'Failed to move the payout to in-flight.');
  }

  let payoutData: unknown;
  try {
    payoutData = await dispatchPayout({
      idempotencyKey,
      amountCents: bill.amountCents,
      currency: 'USD',
      receiverEmail: bill.vendorEmail,
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
    } catch {
      snapshot = demoStore.getSnapshot();
    }

    return jsonError(502, code, message, { snapshot });
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
      });

      return NextResponse.json(
        { ...responsePayload, snapshot },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (batch.outcome === 'FAILED') {
      let snapshot: ReturnType<typeof demoStore.getSnapshot>;
      try {
        snapshot = demoStore.failPayout({
          billId: bill.id,
          idempotencyKey,
          code: 'PAYPAL_BATCH_FAILED',
          message: `PayPal reported batch ${batch.batchId} as ${batch.batchStatus ?? 'failed'}.`,
          isRealPayPal: true,
          externalRef: batch.batchId,
        });
      } catch {
        snapshot = demoStore.getSnapshot();
      }

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
