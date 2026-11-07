import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/store';
import { requireSameOrigin, jsonError } from '@/lib/http';
import { generateCashPlans } from '@/lib/plan/engine';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const originResponse = requireSameOrigin(req);
  if (originResponse) return originResponse;

  try {
    const snapshot = demoStore.getSnapshot();
    const proposal = await generateCashPlans({
      clearedBalanceCents: snapshot.account.clearedBalanceCents,
      minReserveCents: snapshot.account.minReserveCents,
      invoices: snapshot.invoices,
      bills: snapshot.bills,
      asOfDate: snapshot.demoConfig.asOfDate,
      forecastDays: snapshot.demoConfig.forecastDays,
    });

    return NextResponse.json(proposal, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Plan generation failed.';
    return jsonError(500, 'PLAN_GENERATION_FAILED', message);
  }
}

