import { NextResponse } from 'next/server';
import { demoStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      account: demoStore.getAccount(),
      invoices: demoStore.getInvoices(),
      bills: demoStore.getBills(),
      auditLogs: demoStore.getAuditLogs(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message || 'Failed to fetch state.' },
      { status: 500 }
    );
  }
}