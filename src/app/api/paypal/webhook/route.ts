import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/store';
import { jsonError } from '@/lib/http';
import {
  PayPalError,
  verifyWebhookSignature,
  type PayPalWebhookHeaders,
} from '@/lib/paypal';

export const dynamic = 'force-dynamic';

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function extractBatchId(event: unknown): string | null {
  if (typeof event !== 'object' || event === null) return null;
  const resource = (event as Record<string, unknown>).resource;
  if (typeof resource !== 'object' || resource === null) return null;

  const record = resource as Record<string, unknown>;
  const direct = readString(record, 'payout_batch_id');
  if (direct) return direct;

  const batchHeader = record.batch_header;
  if (typeof batchHeader === 'object' && batchHeader !== null) {
    return readString(batchHeader as Record<string, unknown>, 'payout_batch_id');
  }

  return null;
}

function classifyEvent(eventType: string): 'SUCCESS' | 'FAILED' | 'IGNORE' {
  const upper = eventType.toUpperCase();

  if (
    upper === 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED' ||
    upper === 'PAYMENT.PAYOUTSBATCH.SUCCESS'
  ) {
    return 'SUCCESS';
  }

  if (
    upper === 'PAYMENT.PAYOUTS-ITEM.FAILED' ||
    upper === 'PAYMENT.PAYOUTS-ITEM.DENIED' ||
    upper === 'PAYMENT.PAYOUTS-ITEM.BLOCKED' ||
    upper === 'PAYMENT.PAYOUTS-ITEM.RETURNED' ||
    upper === 'PAYMENT.PAYOUTS-ITEM.REVERSED' ||
    upper === 'PAYMENT.PAYOUTS-ITEM.REFUNDED' ||
    upper === 'PAYMENT.PAYOUTSBATCH.DENIED'
  ) {
    return 'FAILED';
  }

  return 'IGNORE';
}

export async function POST(req: NextRequest) {
  let event: unknown;
  try {
    event = await req.json();
  } catch {
    return jsonError(400, 'VALIDATION_ERROR', 'Webhook body must be valid JSON.');
  }

  const headers: PayPalWebhookHeaders = {
    authAlgo: req.headers.get('paypal-auth-algo'),
    certUrl: req.headers.get('paypal-cert-url'),
    transmissionId: req.headers.get('paypal-transmission-id'),
    transmissionSig: req.headers.get('paypal-transmission-sig'),
    transmissionTime: req.headers.get('paypal-transmission-time'),
  };

  let verified = false;
  try {
    verified = await verifyWebhookSignature(event, headers);
  } catch (error: unknown) {
    if (error instanceof PayPalError) {
      const status =
        error.code === 'PAYPAL_WEBHOOK_NOT_CONFIGURED' ? 503 : 401;
      return jsonError(status, error.code, error.message);
    }
    return jsonError(401, 'PAYPAL_WEBHOOK_INVALID', 'Webhook verification failed.');
  }

  if (!verified) {
    return jsonError(401, 'PAYPAL_WEBHOOK_INVALID', 'Webhook signature is invalid.');
  }

  if (typeof event !== 'object' || event === null) {
    return NextResponse.json({ received: true, processed: false });
  }

  const record = event as Record<string, unknown>;
  const eventType = readString(record, 'event_type') ?? '';
  const action = classifyEvent(eventType);
  if (action === 'IGNORE') {
    return NextResponse.json({ received: true, processed: false });
  }

  const batchId = extractBatchId(event);
  if (!batchId) {
    return NextResponse.json({ received: true, processed: false });
  }

  const request = demoStore.getPayoutRequestByBatchId(batchId);
  if (!request) {
    return NextResponse.json({ received: true, processed: false });
  }

  try {
    if (action === 'SUCCESS') {
      demoStore.completePayout({
        billId: request.billId,
        idempotencyKey: request.idempotencyKey,
        isRealPayPal: true,
        externalRef: batchId,
        response: { webhook: event },
        actor: 'PAYPAL_WEBHOOK',
      });
    } else {
      demoStore.failPayout({
        billId: request.billId,
        idempotencyKey: request.idempotencyKey,
        code: 'PAYPAL_BATCH_FAILED',
        message: `PayPal webhook reported ${eventType} for batch ${batchId}.`,
        isRealPayPal: true,
        externalRef: batchId,
        actor: 'PAYPAL_WEBHOOK',
      });
    }
  } catch {
    return jsonError(500, 'WEBHOOK_PROCESSING_FAILED', 'Webhook could not be applied.');
  }

  return NextResponse.json({ received: true, processed: true });
}
