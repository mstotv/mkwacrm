import { supabaseAdmin } from '@/lib/automations/admin-client';
import { getFreshTokenForCalendarAccount } from '@/lib/appointments/google-calendar';

export async function syncGoogleCalendarToDb(): Promise<number> {
  const db = supabaseAdmin();
  let updatedCount = 0;

  // 1. Fetch all accounts with active Google Calendar Integrations
  const { data: accounts, error } = await db
    .from('appointment_google_accounts')
    .select('account_id, calendar_id');

  if (error || !accounts) return 0;

  const now = new Date();
  // Only sync appointments from today onwards to save API calls
  const timeMin = new Date(now.setHours(0, 0, 0, 0)).toISOString();
  // Look 30 days ahead
  const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  for (const acc of accounts) {
    try {
      // 2. Get fresh token
      const token = await getFreshTokenForCalendarAccount(acc.account_id);

      // 3. Fetch events from Google Calendar
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(acc.calendar_id)}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true`;
      
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) continue;

      const data = await res.json();
      const events = data.items || [];

      // 4. Fetch local future appointments for this account
      const { data: localAppts } = await db
        .from('appointments')
        .select('id, calendar_event_id, scheduled_at, status')
        .eq('account_id', acc.account_id)
        .gte('scheduled_at', timeMin)
        .not('calendar_event_id', 'is', null);

      if (!localAppts) continue;

      // 5. Compare and Update
      for (const appt of localAppts) {
        if (!appt.calendar_event_id) continue;

        const gEvent = events.find((e: any) => e.id === appt.calendar_event_id);

        if (!gEvent || gEvent.status === 'cancelled') {
          // Event was deleted/cancelled in Google Calendar
          if (appt.status !== 'cancelled') {
            await db.from('appointments').update({ status: 'cancelled' }).eq('id', appt.id);
            updatedCount++;
            
            await db.from('appointment_logs').insert({
              account_id: acc.account_id,
              appointment_id: appt.id,
              operation: 'google_sync_cancel',
              description: 'Appointment cancelled via Google Calendar Sync.'
            });
          }
        } else {
          // Event exists, check if time was changed
          const gStartTime = gEvent.start?.dateTime;
          if (gStartTime) {
            const localStart = new Date(appt.scheduled_at).getTime();
            const gStart = new Date(gStartTime).getTime();
            
            // Allow 60 seconds tolerance
            if (Math.abs(localStart - gStart) > 60000) {
              await db.from('appointments').update({
                scheduled_at: gStartTime,
                status: 'rescheduled'
              }).eq('id', appt.id);
              updatedCount++;
              
              await db.from('appointment_logs').insert({
                account_id: acc.account_id,
                appointment_id: appt.id,
                operation: 'google_sync_reschedule',
                description: 'Appointment rescheduled via Google Calendar Sync.'
              });
            }
          }
        }
      }
    } catch (err: any) {
      console.error(`[Google Calendar Sync] Failed for account ${acc.account_id}:`, err.message);
    }
  }

  return updatedCount;
}
