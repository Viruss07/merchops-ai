import { NextRequest } from 'next/server';
import { requireSameOrigin } from '@/lib/http';
import { parseJson, payoutSyncSchema } from '@/lib/validation';
import { executePayoutSync } from '@/lib/payoutSyncExecutor';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const originResponse = requireSameOrigin(req);
  if (originResponse) return originResponse;

  const parsed = await parseJson(req, payoutSyncSchema);
  if (!parsed.ok) return parsed.response;

  return executePayoutSync(parsed.data);
}
