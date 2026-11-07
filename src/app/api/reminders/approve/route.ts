import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/store';
import { jsonError, requireSameOrigin } from '@/lib/http';
import { parseJson, reminderApproveSchema } from '@/lib/validation';
import { remindInvoice, PayPalError } from '@/lib/paypal';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const originResponse = requireSameOrigin(req);
  if (originResponse) return originResponse;

  const parsed = await parseJson(req, reminderApproveSchema);
  if (!parsed.ok) return parsed.response;

  const { invoiceId, subject, body } = parsed.data;

  try {
    const existing = demoStore.getInvoice(invoiceId);
    if (!existing) {
      return jsonError(404, 'NOT_FOUND', 'Invoice not found.', {
        snapshot: demoStore.getSnapshot(),
      });
    }

    let deliveredViaPayPal = false;
    let paypalNote = '';

    if (existing.paypalInvoiceId) {
      try {
        await remindInvoice(existing.paypalInvoiceId, {
          subject,
          note: body,
        });
        deliveredViaPayPal = true;
        paypalNote = ' Delivered via live PayPal Invoicing API.';
      } catch (err: unknown) {
        if (err instanceof PayPalError) {
          paypalNote = ` (PayPal dispatch note: ${err.message}; staged locally)`;
        }
      }
    }

    const result = demoStore.recordReminderSent(invoiceId, subject, body, {
      deliveredViaPayPal,
    });

    if (!result.ok) {
      return jsonError(404, 'NOT_FOUND', 'Invoice not found.', {
        snapshot: demoStore.getSnapshot(),
      });
    }

    return NextResponse.json(
      {
        success: true,
        message: `Reminder for invoice ${result.invoice.invoiceNumber} approved.${paypalNote}`,
        deliveredViaPayPal,
        snapshot: result.snapshot,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return jsonError(500, 'SERVER_ERROR', 'Failed to approve reminder.');
  }
}
