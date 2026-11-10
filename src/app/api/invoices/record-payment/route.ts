import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/store';
import { jsonError, requireSameOrigin } from '@/lib/http';
import { invoiceIdBodySchema, parseJson } from '@/lib/validation';
import { formatCentsToUSD } from '@/lib/money';
import { PAYPAL_SANDBOX_ENABLED } from '@/lib/config';
import { getInvoice, PayPalError, recordInvoicePayment } from '@/lib/paypal';

export const dynamic = 'force-dynamic';

/** PAID is a buyer payment through PayPal; MARKED_AS_PAID is a payment the merchant recorded. */
const SETTLED = new Set(['PAID', 'MARKED_AS_PAID']);

/**
 * Records the customer's payment on the real PayPal sandbox invoice (Invoicing v2
 * `POST /invoices/{id}/payments`), then reads the invoice back. The local ledger is credited only
 * when PayPal itself reports the invoice PAID, exactly as the sync route does. This lets anyone
 * finish the live flow without a sandbox buyer login.
 */
export async function POST(req: NextRequest) {
  const originResponse = requireSameOrigin(req);
  if (originResponse) return originResponse;

  const parsed = await parseJson(req, invoiceIdBodySchema);
  if (!parsed.ok) return parsed.response;

  if (!PAYPAL_SANDBOX_ENABLED) {
    return jsonError(400, 'SANDBOX_DISABLED', 'PayPal sandbox is not enabled on this server.', {
      snapshot: demoStore.getSnapshot(),
    });
  }

  const invoice = demoStore.getInvoice(parsed.data.invoiceId);
  if (!invoice) {
    return jsonError(404, 'NOT_FOUND', 'Invoice not found.', { snapshot: demoStore.getSnapshot() });
  }
  if (invoice.status === 'PAID') {
    return jsonError(409, 'ALREADY_PAID', 'Invoice has already been paid.', {
      snapshot: demoStore.getSnapshot(),
    });
  }
  if (!invoice.paypalInvoiceId) {
    return jsonError(409, 'NOT_ON_PAYPAL', 'Create the invoice on PayPal first.', {
      snapshot: demoStore.getSnapshot(),
    });
  }

  try {
    const before = await getInvoice(invoice.paypalInvoiceId);
    if (!SETTLED.has(before.status)) {
      await recordInvoicePayment(invoice.paypalInvoiceId, {
        amountCents: invoice.amountCents,
        method: 'OTHER',
        note: `Customer payment for ${invoice.invoiceNumber}, recorded by the merchant in MerchOps.`,
      });
    }
    const after = await getInvoice(invoice.paypalInvoiceId);
    if (!SETTLED.has(after.status)) {
      return jsonError(
        502,
        'PAYPAL_NOT_PAID',
        `PayPal recorded the payment but reports the invoice as ${after.status}. Nothing was credited.`,
        { snapshot: demoStore.getSnapshot() }
      );
    }

    const result = demoStore.payInvoice(invoice.id, {
      actor: 'MERCHANT',
      isSimulated: false,
      action: 'INVOICE_PAID_PAYPAL',
      details: `PayPal sandbox confirmed invoice ${invoice.paypalInvoiceId} ${after.status} (${formatCentsToUSD(invoice.amountCents)}, payment recorded by the merchant).`,
    });
    if (!result.ok) {
      return jsonError(409, 'ALREADY_PAID', 'Invoice has already been paid.', {
        snapshot: demoStore.getSnapshot(),
      });
    }

    return NextResponse.json(
      {
        success: true,
        paypalInvoiceId: invoice.paypalInvoiceId,
        paypalStatus: after.status,
        message: `PayPal reports ${invoice.paypalInvoiceId} as ${after.status}.`,
        snapshot: result.snapshot,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error: unknown) {
    const message =
      error instanceof PayPalError ? error.message : 'PayPal could not record the payment.';
    return jsonError(502, 'PAYPAL_RECORD_FAILED', message, { snapshot: demoStore.getSnapshot() });
  }
}
