import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/store';
import { formatCentsToUSD } from '@/lib/money';
import { jsonError, requireSameOrigin } from '@/lib/http';
import { parseJson, resetSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const originResponse = requireSameOrigin(req);
  if (originResponse) return originResponse;

  const parsed = await parseJson(req, resetSchema);
  if (!parsed.ok) return parsed.response;

  const adminToken = process.env.DEMO_ADMIN_TOKEN;
  if (process.env.NODE_ENV === 'production' && adminToken) {
    const provided = req.headers.get('x-demo-admin-token');
    if (!provided || provided !== adminToken) {
      return jsonError(
        403,
        'FORBIDDEN',
        'Demo reset requires a valid administrator token.'
      );
    }
  }

  try {
    const snapshot = demoStore.resetDemoData();
    return NextResponse.json(
      {
        success: true,
        message: `Demo state successfully reset to initial baseline values (${formatCentsToUSD(
          snapshot.account.clearedBalanceCents
        )} balance, ${formatCentsToUSD(
          snapshot.account.minReserveCents
        )} safety floor).`,
        snapshot,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return jsonError(500, 'SERVER_ERROR', 'Failed to reset demo state.');
  }
}
