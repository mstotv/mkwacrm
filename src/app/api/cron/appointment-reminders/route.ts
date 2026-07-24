import { NextResponse } from 'next/server';
import { processAppointmentReminders } from '@/lib/appointments/reminders';

export const maxDuration = 60; 

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const processedCount = await processAppointmentReminders();
    
    return NextResponse.json({
      success: true,
      message: `Successfully processed ${processedCount} appointment reminders.`,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Cron API] Appointment Reminders error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
