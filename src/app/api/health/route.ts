import { NextResponse } from 'next/server';
import { getPgPool } from '@/lib/repository/postgres';

export const dynamic = 'force-dynamic';

export async function GET() {
  const commit =
    process.env.RENDER_GIT_COMMIT ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT ||
    '9d007c9';

  let dbStatus: 'up' | 'memory' | 'down' = 'memory';

  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && dbUrl.trim().length > 0 && !dbUrl.startsWith('postgresql://user:password')) {
    try {
      const pool = getPgPool();
      await pool.query('SELECT 1');
      dbStatus = 'up';
    } catch {
      dbStatus = 'down';
    }
  }

  const ok = dbStatus !== 'down';

  return NextResponse.json(
    {
      ok,
      commit,
      db: dbStatus,
      timestamp: new Date().toISOString(),
    },
    {
      status: ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}

