import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/store';
import { jsonError, requireSameOrigin } from '@/lib/http';
import { invoiceSyncSchema, parseJson } from '@/lib/validation';
import { getInvoice, PayPalError } from '@/lib/paypal';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const originResponse = requireSameOrigin(req);
  if (originResponse) return originResponse;

  const parsed = await parseJson(req, invoiceSyncSchema);
  if (!parsed.ok) return parsed.response;

  const { invoiceId } = parsed.data;

  const invoicesToSync = invoiceId
    ? [demoStore.getInvoice(invoiceId)].filter(Boolean)
    : demoStore.getInvoices().filter((i) => i.paypalInvoiceId && i.status !== 'PAID');

  if (invoicesToSync.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'No active PayPal invoices to synchronize.',
      updated: 0,
      snapshot: demoStore.getSnapshot(),
    });
  }

  let updatedCount = 0;
  for (const inv of invoicesToSync) {
    if (!inv || !inv.paypalInvoiceId) continue;
    try {
      const details = await getInvoice(inv.paypalInvoiceId);
      if (details.status === 'PAID' && inv.status !== 'PAID') {
        demoStore.payInvoice(inv.id, {
          actor: 'SYSTEM',
          isSimulated: false,
          action: 'INVOICE_PAID_PAYPAL',
          details: `Reconciliation poll confirmed payment for invoice ${inv.invoiceNumber} on PayPal Sandbox.`,
        });
        updatedCount += 1;
      }
    } catch (err: unknown) {
      if (err instanceof PayPalError && err.code === 'PAYPAL_AUTH_FAILED') {
        return jsonError(503, 'PAYPAL_AUTH_FAILED', 'PayPal Sandbox authentication failed.');
      }
      // Continue checking other invoices
    }
  }

  return NextResponse.json({
    success: true,
    message: `Synchronized ${invoicesToSync.length} invoice(s); ${updatedCount} marked settled.`,
    updated: updatedCount,
    snapshot: demoStore.getSnapshot(),
  });
}

