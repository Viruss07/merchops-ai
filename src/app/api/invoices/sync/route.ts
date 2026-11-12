import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/store';
import { jsonError, requireSameOrigin } from '@/lib/http';
import { formatCentsToUSD } from '@/lib/money';
import { invoiceSyncSchema, parseJson } from '@/lib/validation';
import { getInvoice, PayPalError } from '@/lib/paypal';

export const dynamic = 'force-dynamic';

const SETTLED_PAYPAL_STATUSES = new Set(['PAID', 'MARKED_AS_PAID']);

function toSyncErrorResponse(err: unknown): NextResponse {
  const snapshot = demoStore.getSnapshot();
  if (err instanceof PayPalError) {
    if (err.code === 'PAYPAL_AUTH_FAILED') {
      return jsonError(
        503,
        'PAYPAL_AUTH_FAILED',
        err.message || 'PayPal Sandbox authentication failed.',
        { snapshot },
      );
    }
    if (err.code === 'PAYPAL_OUTCOME_UNKNOWN') {
      return jsonError(
        502,
        'PAYPAL_OUTCOME_UNKNOWN',
        err.message || 'Could not reach PayPal Sandbox to check this invoice.',
        { snapshot },
      );
    }
    const status = err.status === 403 ? 403 : 502;
    return jsonError(status, err.code, err.message || 'PayPal Invoicing lookup failed.', {
      snapshot,
    });
  }

  const message =
    err instanceof Error && err.message
      ? err.message
      : 'Unexpected error while checking PayPal for payment.';
  return jsonError(502, 'PAYPAL_SYNC_FAILED', message, { snapshot });
}

export async function POST(req: NextRequest) {
  const originResponse = requireSameOrigin(req);
  if (originResponse) return originResponse;

  const parsed = await parseJson(req, invoiceSyncSchema);
  if (!parsed.ok) return parsed.response;

  const { invoiceId } = parsed.data;

  if (invoiceId) {
    const inv = demoStore.getInvoice(invoiceId);
    if (!inv) {
      return jsonError(404, 'NOT_FOUND', 'Invoice not found.', {
        snapshot: demoStore.getSnapshot(),
      });
    }

    if (inv.status === 'PAID') {
      return NextResponse.json(
        {
          success: true,
          outcome: 'ALREADY_PAID',
          credited: false,
          paypalStatus: inv.paypalInvoiceId ? 'PAID' : undefined,
          paidAmountCents: inv.amountCents,
          dueAmountCents: 0,
          totalAmountCents: inv.amountCents,
          updated: 0,
          message: `Invoice ${inv.invoiceNumber} is already settled (${formatCentsToUSD(inv.amountCents)} confirmed); no duplicate credit applied.`,
          snapshot: demoStore.getSnapshot(),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (!inv.paypalInvoiceId) {
      return jsonError(
        409,
        'NOT_ON_PAYPAL',
        'This invoice has not been sent to PayPal yet. Send it as a PayPal invoice first.',
        { snapshot: demoStore.getSnapshot() },
      );
    }

    let details;
    try {
      details = await getInvoice(inv.paypalInvoiceId);
    } catch (err: unknown) {
      return toSyncErrorResponse(err);
    }

    const totalAmountCents = details.amountCents > 0 ? details.amountCents : inv.amountCents;

    if (SETTLED_PAYPAL_STATUSES.has(details.status)) {
      const paidAmountCents =
        details.paidAmountCents > 0 ? details.paidAmountCents : inv.amountCents;
      const payResult = demoStore.payInvoice(inv.id, {
        actor: 'SYSTEM',
        isSimulated: false,
        action: 'INVOICE_PAID_PAYPAL',
        details: `PayPal Sandbox confirmed payment of ${formatCentsToUSD(paidAmountCents)} for invoice ${inv.invoiceNumber} (${details.status}).`,
      });

      if (!payResult.ok && payResult.reason === 'ALREADY_PAID') {
        return NextResponse.json(
          {
            success: true,
            outcome: 'ALREADY_PAID',
            credited: false,
            paypalStatus: details.status,
            paidAmountCents: inv.amountCents,
            dueAmountCents: 0,
            totalAmountCents,
            updated: 0,
            message: `Invoice ${inv.invoiceNumber} is already settled (${formatCentsToUSD(inv.amountCents)} confirmed); no duplicate credit applied.`,
            snapshot: demoStore.getSnapshot(),
          },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }

      return NextResponse.json(
        {
          success: true,
          outcome: 'PAID',
          credited: payResult.ok,
          paypalStatus: details.status,
          paidAmountCents,
          dueAmountCents: 0,
          totalAmountCents,
          updated: payResult.ok ? 1 : 0,
          message: `PayPal confirmed payment of ${formatCentsToUSD(paidAmountCents)}. The ledger has been updated.`,
          snapshot: payResult.ok ? payResult.snapshot : demoStore.getSnapshot(),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (details.status === 'PARTIALLY_PAID') {
      const paidAmountCents = details.paidAmountCents;
      const dueAmountCents =
        details.dueAmountCents > 0 || paidAmountCents > 0
          ? details.dueAmountCents
          : Math.max(0, totalAmountCents - paidAmountCents);

      return NextResponse.json(
        {
          success: true,
          outcome: 'PARTIALLY_PAID',
          credited: false,
          paypalStatus: details.status,
          paidAmountCents,
          dueAmountCents,
          totalAmountCents,
          updated: 0,
          message: `PayPal reports a partial payment: ${formatCentsToUSD(paidAmountCents)} received, ${formatCentsToUSD(dueAmountCents)} remaining balance.`,
          snapshot: demoStore.getSnapshot(),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const dueAmountCents =
      details.dueAmountCents > 0 ? details.dueAmountCents : totalAmountCents;

    return NextResponse.json(
      {
        success: true,
        outcome: 'UNPAID',
        credited: false,
        paypalStatus: details.status,
        paidAmountCents: details.paidAmountCents,
        dueAmountCents,
        totalAmountCents,
        updated: 0,
        message: 'PayPal confirms this invoice is still unpaid.',
        snapshot: demoStore.getSnapshot(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const invoicesToSync = demoStore
    .getInvoices()
    .filter((i) => i.paypalInvoiceId && i.status !== 'PAID');

  if (invoicesToSync.length === 0) {
    return NextResponse.json(
      {
        success: true,
        outcome: 'NO_ACTIVE_INVOICES',
        credited: false,
        updated: 0,
        partiallyPaidCount: 0,
        unpaidCount: 0,
        message: 'No active PayPal invoices to synchronize.',
        snapshot: demoStore.getSnapshot(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let updatedCount = 0;
  let partiallyPaidCount = 0;
  let unpaidCount = 0;
  let firstError: unknown = null;
  let errorCount = 0;

  for (const inv of invoicesToSync) {
    if (!inv.paypalInvoiceId) continue;
    try {
      const details = await getInvoice(inv.paypalInvoiceId);
      if (SETTLED_PAYPAL_STATUSES.has(details.status)) {
        const paidAmountCents =
          details.paidAmountCents > 0 ? details.paidAmountCents : inv.amountCents;
        const payResult = demoStore.payInvoice(inv.id, {
          actor: 'SYSTEM',
          isSimulated: false,
          action: 'INVOICE_PAID_PAYPAL',
          details: `PayPal Sandbox confirmed payment of ${formatCentsToUSD(paidAmountCents)} for invoice ${inv.invoiceNumber} (${details.status}).`,
        });
        if (payResult.ok) {
          updatedCount += 1;
        }
      } else if (details.status === 'PARTIALLY_PAID') {
        partiallyPaidCount += 1;
      } else {
        unpaidCount += 1;
      }
    } catch (err: unknown) {
      if (err instanceof PayPalError && err.code === 'PAYPAL_AUTH_FAILED') {
        return toSyncErrorResponse(err);
      }
      if (!firstError) firstError = err;
      errorCount += 1;
    }
  }

  if (errorCount > 0) {
    if (updatedCount === 0 && partiallyPaidCount === 0 && unpaidCount === 0) {
      return toSyncErrorResponse(firstError);
    }
    const firstMsg =
      firstError instanceof Error ? firstError.message : 'PayPal lookup failed.';
    return jsonError(
      502,
      'PAYPAL_PARTIAL_SYNC_FAILED',
      `Checked ${invoicesToSync.length} invoice(s): ${updatedCount} paid, ${errorCount} failed (${firstMsg}).`,
      { snapshot: demoStore.getSnapshot() },
    );
  }

  let outcome: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID' = 'UNPAID';
  if (updatedCount > 0) {
    outcome = 'PAID';
  } else if (partiallyPaidCount > 0) {
    outcome = 'PARTIALLY_PAID';
  }

  const parts: string[] = [];
  if (updatedCount > 0) parts.push(`${updatedCount} marked paid`);
  if (partiallyPaidCount > 0) parts.push(`${partiallyPaidCount} partially paid`);
  if (unpaidCount > 0) parts.push(`${unpaidCount} still unpaid`);

  const summaryMessage =
    invoicesToSync.length === 1 && unpaidCount === 1
      ? 'PayPal confirms this invoice is still unpaid.'
      : `Checked ${invoicesToSync.length} invoice(s): ${parts.join(', ')}.`;

  return NextResponse.json(
    {
      success: true,
      outcome,
      credited: updatedCount > 0,
      updated: updatedCount,
      partiallyPaidCount,
      unpaidCount,
      message: summaryMessage,
      snapshot: demoStore.getSnapshot(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

