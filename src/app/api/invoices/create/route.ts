import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/store';
import { jsonError, requireSameOrigin } from '@/lib/http';
import { invoiceCreateSchema, parseJson } from '@/lib/validation';
import {
  createDraftInvoice,
  sendInvoice,
  getInvoice,
  PayPalError,
} from '@/lib/paypal';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const originResponse = requireSameOrigin(req);
  if (originResponse) return originResponse;

  const parsed = await parseJson(req, invoiceCreateSchema);
  if (!parsed.ok) return parsed.response;

  const { invoiceId } = parsed.data;

  // Resolve target invoice: specified by ID or default to first unpaid
  let target = invoiceId ? demoStore.getInvoice(invoiceId) : undefined;
  if (!target) {
    const unpaid = demoStore.getInvoices().filter((i) => i.status !== 'PAID');
    target = unpaid[0];
  }

  if (!target) {
    return jsonError(404, 'NOT_FOUND', 'No eligible invoice found to create in PayPal.', {
      snapshot: demoStore.getSnapshot(),
    });
  }

  // Idempotency: if already created and sent, return cached details
  if (target.paypalInvoiceId && target.recipientViewUrl) {
    return NextResponse.json(
      {
        success: true,
        alreadyCreated: true,
        paypalInvoiceId: target.paypalInvoiceId,
        recipientViewUrl: target.recipientViewUrl,
        invoice: target,
        snapshot: demoStore.getSnapshot(),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    // Step 1: Create draft invoice in PayPal Sandbox
    const draft = await createDraftInvoice({
      invoiceNumber: target.invoiceNumber,
      customerName: target.customerName,
      customerEmail: target.customerEmail,
      amountCents: target.amountCents,
      dueDate: target.dueDate,
      itemDescription: target.description,
    });

    // Step 2: Send invoice to make it active and generate customer payment link
    await sendInvoice(draft.invoiceId, true);

    // Step 3: Fetch details to extract recipient_view_url
    const details = await getInvoice(draft.invoiceId);

    // Step 4: Persist PayPal identifiers in store
    const attached = demoStore.attachPayPalInvoice(target.id, {
      paypalInvoiceId: draft.invoiceId,
      recipientViewUrl: details.recipientViewUrl,
    });

    if (!attached.ok) {
      return jsonError(500, 'STATE_ERROR', 'Failed to attach PayPal IDs to invoice.');
    }

    return NextResponse.json(
      {
        success: true,
        paypalInvoiceId: draft.invoiceId,
        recipientViewUrl: details.recipientViewUrl,
        invoice: attached.invoice,
        snapshot: attached.snapshot,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error: unknown) {
    if (error instanceof PayPalError) {
      return jsonError(
        error.status && error.status >= 400 && error.status < 500 ? error.status : 502,
        error.code,
        `PayPal Invoicing error: ${error.message}`
      );
    }
    return jsonError(500, 'SERVER_ERROR', 'Failed to create PayPal invoice.');
  }
}

