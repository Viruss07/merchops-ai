import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/store';
import { formatCentsToUSD } from '@/lib/money';
import { PAYPAL_SANDBOX_ENABLED } from '@/lib/config';
import { jsonError, requireSameOrigin } from '@/lib/http';
import { parseJson, payoutSchema } from '@/lib/validation';
import { dispatchPayout, PayPalError } from '@/lib/paypal';

export const dynamic = 'force-dynamic';

function extractBatchId(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const batchHeader = (payload as Record<string, unknown>).batch_header;
  if (typeof batchHeader !== 'object' || batchHeader === null) return null;
  const batchId = (batchHeader as Record<string, unknown>).payout_batch_id;
  return typeof batchId === 'string' && batchId.length > 0 ? batchId : null;
}

export async function POST(req: NextRequest) {
  const originResponse = requireSameOrigin(req);
  if (originResponse) return originResponse;

  const parsed = await parseJson(req, payoutSchema);
  if (!parsed.ok) return parsed.response;

  const { billId, idempotencyKey, executionMode } = parsed.data;

  if (executionMode === 'PAYPAL_SANDBOX' && !PAYPAL_SANDBOX_ENABLED) {
    return jsonError(
      403,
      'PAYPAL_DISABLED',
      'The PayPal Sandbox execution rail is disabled for this environment.'
    );
  }

  let beginResult: ReturnType<typeof demoStore.beginPayout>;
  try {
    beginResult = demoStore.beginPayout({ billId, idempotencyKey });
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

      case 'INVALID_AMOUNT':
        return jsonError(
          400,
          'INVALID_AMOUNT',
          'The payout amount is invalid.'
        );

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
        const outcome: ReturnType<
          typeof demoStore.getIdempotencyOutcome
        > =
          demoStore.getIdempotencyOutcome(idempotencyKey) ??
          (beginResult.outcome as ReturnType<
            typeof demoStore.getIdempotencyOutcome
          >);

        if (outcome?.status === 'SUCCEEDED') {
          const stored =
            outcome.response && typeof outcome.response === 'object'
              ? (outcome.response as Record<string, unknown>)
              : {};
          return NextResponse.json(
            { success: true, ...stored, snapshot: demoStore.getSnapshot() },
            {
              status: 200,
              headers: {
                'Idempotent-Replay': 'true',
                'Cache-Control': 'no-store',
              },
            }
          );
        }

        if (outcome?.status === 'IN_FLIGHT') {
          return jsonError(
            409,
            'IN_FLIGHT',
            'A payout for this idempotency key is already in flight.',
            { snapshot: demoStore.getSnapshot() }
          );
        }

        if (outcome?.status === 'FAILED') {
          return jsonError(
            409,
            outcome.code || 'PAYOUT_FAILED',
            'This idempotency key is associated with a failed payout.',
            { snapshot: demoStore.getSnapshot() }
          );
        }

        return jsonError(
          409,
          'DUPLICATE_REQUEST',
          'This idempotency key has already been used.',
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
    const payoutData = await dispatchPayout({
      idempotencyKey,
      amountCents: bill.amountCents,
      currency: 'USD',
      receiverEmail: bill.vendorEmail,
      senderBatchId: `batch-${idempotencyKey}`,
      note: `Payment for ${bill.description}`,
      emailSubject: `Payment from ${beginResult.snapshot.account.businessName}`,
      emailMessage: `You received payment for bill ${bill.billNumber}.`,
    });

    const batchId = extractBatchId(payoutData);
    const responsePayload = {
      success: true,
      mode: 'PAYPAL_SANDBOX',
      isSimulated: false,
      billId: bill.id,
      batchId,
      message: `Successfully executed live PayPal Sandbox Payout of ${formatCentsToUSD(bill.amountCents)} to ${bill.vendorName}.`,
    };

    const snapshot = demoStore.completePayout({
      billId: bill.id,
      idempotencyKey,
      isRealPayPal: true,
      externalRef: batchId ?? undefined,
      response: {
        ...responsePayload,
        paypal: payoutData,
      },
    });

    return NextResponse.json(
      { ...responsePayload, snapshot },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error: unknown) {
    const isUnknownOutcome =
      error instanceof PayPalError &&
      error.code === 'PAYPAL_OUTCOME_UNKNOWN';
    const code = isUnknownOutcome
      ? 'PAYPAL_OUTCOME_UNKNOWN'
      : 'PAYPAL_API_REJECTED';
    const message = isUnknownOutcome
      ? 'PayPal did not confirm the payout outcome. Reconcile before retrying.'
      : 'PayPal rejected the payout request. No funds were disbursed.';

    let snapshot: ReturnType<typeof demoStore.getSnapshot>;
    try {
      snapshot = demoStore.failPayout({
        billId: bill.id,
        idempotencyKey,
        code,
        message,
      });
    } catch {
      snapshot = demoStore.getSnapshot();
    }

    return jsonError(502, code, message, { snapshot });
  }
}
