import { supabaseAdmin } from '@/lib/automations/admin-client';
import { engineSendText } from '@/lib/automations/meta-send';

/**
 * Processes automated reminders for appointments.
 * Checks for appointments starting in:
 * - 24 hours
 * - 3 hours
 * - 30 minutes
 */
export async function processAppointmentReminders(): Promise<number> {
  const db = supabaseAdmin();
  const now = new Date();
  let processedCount = 0;

  // We define the 3 reminder intervals (in minutes)
  const intervals = [
    { minutes: 24 * 60, type: '24h' },
    { minutes: 3 * 60, type: '3h' },
    { minutes: 30, type: '30m' }
  ];

  for (const interval of intervals) {
    const targetTime = new Date(now.getTime() + interval.minutes * 60 * 1000);
    // Add a 5 minute window to catch them
    const windowStart = new Date(targetTime.getTime() - 2.5 * 60 * 1000).toISOString();
    const windowEnd = new Date(targetTime.getTime() + 2.5 * 60 * 1000).toISOString();

    const { data: appointments, error } = await db
      .from('appointments')
      .select('*, account:accounts(owner_user_id)')
      .eq('status', 'confirmed')
      .gte('scheduled_at', windowStart)
      .lte('scheduled_at', windowEnd);

    if (error || !appointments) continue;

    for (const appt of appointments) {
      // Check if this specific reminder was already sent
      const logType = `reminder_${interval.type}`;
      const { data: existingLog } = await db
        .from('appointment_logs')
        .select('id')
        .eq('appointment_id', appt.id)
        .eq('operation', logType)
        .maybeSingle();

      if (existingLog) continue; // Already sent

      // Send the reminder
      try {
        const timeStr = new Date(appt.scheduled_at).toLocaleString('ar-SA', {
          timeZone: 'Asia/Baghdad',
          dateStyle: 'full',
          timeStyle: 'short'
        });

        const text = `مرحباً ${appt.patient_name || 'عميلنا العزيز'}، نود تذكيرك بموعدك القادم بتتاريخ ${timeStr}. نتمنى لك وقتاً ممتعاً!`;

        await engineSendText({
          accountId: appt.account_id,
          userId: (appt.account as any)?.owner_user_id,
          conversationId: appt.conversation_id, // If available
          contactId: appt.contact_id,
          text
        });

        // Log success
        await db.from('appointment_logs').insert({
          account_id: appt.account_id,
          appointment_id: appt.id,
          operation: logType,
          description: `Sent ${interval.type} reminder to ${appt.patient_phone || appt.patient_name}`
        });

        processedCount++;
      } catch (err: any) {
        console.error(`[Appointment Reminders] Failed to send ${interval.type} reminder for appt ${appt.id}:`, err.message);
      }
    }
  }

  return processedCount;
}
