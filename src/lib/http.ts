import { NextRequest, NextResponse } from 'next/server';

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();
const MAX_RATE_BUCKETS = 5000;

export function jsonError(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    { ...extra, error: code, message },
    {
      status,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (!forwarded) return 'unknown';
  const first = forwarded.split(',')[0]?.trim();
  return first && first.length > 0 ? first : 'unknown';
}

export function isSameOrigin(req: NextRequest): boolean {
  const secFetchSite = req.headers.get('sec-fetch-site');
  if (
    secFetchSite !== null &&
    secFetchSite !== 'same-origin' &&
    secFetchSite !== 'same-site'
  ) {
    return false;
  }

  const origin = req.headers.get('origin');
  if (origin === null) {
    return process.env.NODE_ENV !== 'production';
  }

  try {
    const parsed = new URL(origin);
    const requestHost = req.headers.get('host') ?? req.nextUrl.host;
    return parsed.host === requestHost;
  } catch {
    return false;
  }
}

export function requireSameOrigin(req: NextRequest): NextResponse | null {
  if (isSameOrigin(req)) return null;
  return jsonError(403, 'FORBIDDEN', 'Cross-origin request rejected.');
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();

  if (rateBuckets.size >= MAX_RATE_BUCKETS) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (bucket.resetAt <= now) {
        rateBuckets.delete(bucketKey);
      }
    }
  }

  const existing = rateBuckets.get(key);
  if (existing === undefined || existing.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (existing.count >= limit) {
    return false;
  }

  existing.count += 1;
  return true;
}

export function sanitizeText(value: unknown, maxLen: number): string {
  const limit = Number.isFinite(maxLen) ? Math.max(0, Math.floor(maxLen)) : 0;
  const raw = typeof value === 'string' ? value : String(value ?? '');
  const withoutControls = Array.from(raw)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code > 0x1f && (code < 0x7f || code > 0x9f);
    })
    .join('');
  return withoutControls.replace(/\s+/g, ' ').trim().slice(0, limit);
}
