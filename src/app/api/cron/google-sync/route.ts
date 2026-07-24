import { NextResponse } from 'next/server';
import { syncGoogleCalendarToDb } from '@/lib/appointments/google-sync';

export const maxDuration = 60; 

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const updatedCount = await syncGoogleCalendarToDb();
    
    return NextResponse.json({
      success: true,
      message: `Successfully synced and updated ${updatedCount} appointments from Google Calendar.`,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Cron API] Google Calendar Sync error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
