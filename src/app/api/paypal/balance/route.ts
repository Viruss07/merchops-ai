import { NextResponse } from 'next/server';
import { getPayPalSandboxBalance } from '@/lib/paypal';
import { demoStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Read-only PayPal Sandbox wallet balance endpoint.
 * Queries PayPal Reporting API with existing OAuth scopes; returns availability = 'UNAVAILABLE'
 * when unsupported or unpermitted rather than substituting internal cleared ledger cash.
 */
export async function GET() {
  const balance = await getPayPalSandboxBalance();
  const snapshot = demoStore.setPayPalBalanceState(balance);

  return NextResponse.json(
    {
      paypalBalance: snapshot.paypalBalance,
      snapshot,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}

