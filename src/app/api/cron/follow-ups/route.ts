import { NextResponse } from 'next/server';
import { processDueFollowUps } from '@/lib/follow-ups/runner';

// Vercel Cron Job endpoint / or manual trigger
// Example CRON: * * * * * (Every minute)

export const maxDuration = 60; // Max execution time for Next.js API

export async function GET(req: Request) {
  try {
    // Basic authorization check if needed (e.g. check for a secure cron secret)
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const processedCount = await processDueFollowUps();
    
    return NextResponse.json({
      success: true,
      message: `Successfully processed ${processedCount} due follow-ups.`,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Cron API] Follow-ups error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
