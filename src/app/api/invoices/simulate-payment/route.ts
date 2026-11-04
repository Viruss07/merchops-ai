import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/store';
import { formatCentsToUSD } from '@/lib/money';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { invoiceId } = body;

    if (!invoiceId) {
      return NextResponse.json({ error: 'MISSING_INVOICE_ID', message: 'invoiceId is required.' }, { status: 400 });
    }

    const invoice = demoStore.markInvoicePaid(invoiceId);
    if (!invoice) {
      return NextResponse.json({ error: 'INVOICE_NOT_FOUND', message: 'Invoice not found or already settled.' }, { status: 404 });
    }

    const updatedAccount = demoStore.getAccount();

    return NextResponse.json({
      success: true,
      message: `Simulated receipt of payment for invoice ${invoice.invoiceNumber} (${formatCentsToUSD(invoice.amountCents)}). Updated cleared balance to ${formatCentsToUSD(updatedAccount.clearedBalanceCents)}.`,
      invoice,
      account: updatedAccount,
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'SERVER_ERROR', message: error.message || 'Failed to simulate payment.' }, { status: 500 });
  }
}

