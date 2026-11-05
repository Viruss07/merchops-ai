import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/store';
import { formatCentsToUSD } from '@/lib/money';
import { jsonError, requireSameOrigin } from '@/lib/http';
import { invoiceIdBodySchema, parseJson } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const originResponse = requireSameOrigin(req);
  if (originResponse) return originResponse;

  const parsed = await parseJson(req, invoiceIdBodySchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = demoStore.payInvoice(parsed.data.invoiceId);

    if (!result.ok) {
      if (result.reason === 'NOT_FOUND') {
        return jsonError(404, 'NOT_FOUND', 'Invoice not found.', {
          snapshot: demoStore.getSnapshot(),
        });
      }

      return jsonError(
        409,
        'ALREADY_PAID',
        'Invoice has already been paid.',
        { snapshot: demoStore.getSnapshot() }
      );
    }

    const { invoice, snapshot } = result;
    return NextResponse.json(
      {
        success: true,
        message: `Simulated receipt of payment for invoice ${invoice.invoiceNumber} (${formatCentsToUSD(invoice.amountCents)}). Updated cleared balance to ${formatCentsToUSD(snapshot.account.clearedBalanceCents)}.`,
        snapshot,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return jsonError(500, 'SERVER_ERROR', 'Failed to simulate payment.');
  }
}
