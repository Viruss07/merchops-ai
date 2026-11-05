import { NextResponse } from 'next/server';
import { demoStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(demoStore.getSnapshot(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
