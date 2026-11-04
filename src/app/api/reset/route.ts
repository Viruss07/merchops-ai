import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const resetData = demoStore.resetDemoData();
    return NextResponse.json({
      success: true,
      message: 'Demo state successfully reset to initial baseline values ($4,200 balance, $2,000 safety floor).',
      data: resetData,
    });
  } catch (error: any) {
    console.error('Error in /api/reset:', error);
    return NextResponse.json({ error: 'SERVER_ERROR', message: error.message || 'Failed to reset demo state.' }, { status: 500 });
  }
}

