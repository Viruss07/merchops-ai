import { NextRequest } from 'next/server';
import { requireSameOrigin } from '@/lib/http';
import { parseJson, payoutSchema } from '@/lib/validation';
import { executePayoutAuthorization } from '@/lib/payoutExecutor';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const originResponse = requireSameOrigin(req);
  if (originResponse) return originResponse;

  const parsed = await parseJson(req, payoutSchema);
  if (!parsed.ok) return parsed.response;

  return executePayoutAuthorization(parsed.data);
}
