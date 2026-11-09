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

function extractInvoiceIdentifier(event: unknown): {
  paypalInvoiceId: string | null;
  invoiceNumber: string | null;
} {
  if (typeof event !== 'object' || event === null) {
    return { paypalInvoiceId: null, invoiceNumber: null };
  }
  const root = event as Record<string, unknown>;
  const resource =
    typeof root.resource === 'object' && root.resource !== null
      ? (root.resource as Record<string, unknown>)
      : null;
  if (!resource) return { paypalInvoiceId: null, invoiceNumber: null };

  const invoiceObj =
    typeof resource.invoice === 'object' && resource.invoice !== null
      ? (resource.invoice as Record<string, unknown>)
      : resource;

  const paypalInvoiceId = readString(invoiceObj, 'id');
  const detail =
    typeof invoiceObj.detail === 'object' && invoiceObj.detail !== null
      ? (invoiceObj.detail as Record<string, unknown>)
      : null;

  const invoiceNumber = detail
    ? readString(detail, 'invoice_number')
    : readString(resource, 'invoice_id') ?? readString(resource, 'custom_id');

  return { paypalInvoiceId, invoiceNumber };
}

function classifyEvent(
  eventType: string
): 'PAYOUT_SUCCESS' | 'PAYOUT_FAILED' | 'INVOICE_PAID' | 'IGNORE' {
  const upper = eventType.toUpperCase();

  // Only the invoice-level event: a bare PAYMENT.CAPTURE.COMPLETED can belong to
  // any checkout on the account and must never credit one of our invoices.
  if (upper === 'INVOICING.INVOICE.PAID') {
    return 'INVOICE_PAID';
  }

  // Item-level only. PAYMENT.PAYOUTSBATCH.SUCCESS means PayPal finished
  // *processing* the batch; items inside it can still be UNCLAIMED or ONHOLD.
  if (upper === 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED') {
    return 'PAYOUT_SUCCESS';
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
    return 'PAYOUT_FAILED';
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

  // Handle customer invoice payments
  if (action === 'INVOICE_PAID') {
    const { paypalInvoiceId, invoiceNumber } = extractInvoiceIdentifier(event);
    let invoice = paypalInvoiceId
      ? demoStore.getInvoiceByPayPalId(paypalInvoiceId)
      : undefined;
    if (!invoice && invoiceNumber) {
      invoice = demoStore.getInvoiceByNumber(invoiceNumber);
    }
    // No guessing: an event we cannot tie to one of our invoices by PayPal id or
    // invoice number is acknowledged (so PayPal stops retrying) but never credited.
    if (!invoice) {
      return NextResponse.json({
        received: true,
        processed: false,
        reason: 'INVOICE_NOT_FOUND',
      });
    }

    if (invoice.status === 'PAID') {
      return NextResponse.json({
        received: true,
        processed: true,
        alreadySettled: true,
      });
    }

    demoStore.payInvoice(invoice.id, {
      actor: 'PAYPAL_WEBHOOK',
      isSimulated: false,
      action: 'INVOICE_PAID_PAYPAL',
      details: `PayPal Webhook verified payment for invoice ${invoice.invoiceNumber} (${invoice.customerName}). Cash settled into merchant cleared balance.`,
    });

    return NextResponse.json({
      received: true,
      processed: true,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
    });
  }

  // Handle vendor payout batches
  const batchId = extractBatchId(event);
  if (!batchId) {
    return NextResponse.json({ received: true, processed: false });
  }

  const request = demoStore.getPayoutRequestByBatchId(batchId);
  if (!request) {
    return NextResponse.json({ received: true, processed: false });
  }

  try {
    if (action === 'PAYOUT_SUCCESS') {
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
