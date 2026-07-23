import { supabaseAdmin } from '@/lib/automations/admin-client'
import { engineSendText } from '@/lib/automations/meta-send'
import { notifyAccountViaTelegram } from '@/lib/notifications/telegram'

let _intervalStarted = false;

/**
 * Ensures an in-memory timer runs every 30 seconds to check for due follow-ups.
 * Safe to call multiple times — only initializes once.
 */
export function startFollowUpBackgroundWorker() {
  if (typeof window !== 'undefined' || _intervalStarted) return;
  _intervalStarted = true;
  console.log('[Follow-up Worker] Starting in-app background worker (checking every 30s)...');
  
  // Run immediately once
  processDueFollowUps().catch(err => console.error('[Follow-up Worker] Initial run error:', err));
  
  // Run every 30 seconds
  setInterval(() => {
    processDueFollowUps().catch(err => console.error('[Follow-up Worker] Background run error:', err));
  }, 30000);
}

/**
 * Process all due pending follow-ups from the database.
 * Sends WhatsApp message to the contact and/or notifies the account owner via Telegram.
 */
export async function processDueFollowUps(): Promise<number> {
  const db = supabaseAdmin()
  const now = new Date().toISOString()

  // Fetch up to 50 pending follow-ups that are due
  const { data: dueFollowUps, error: fetchErr } = await db
    .from('follow_ups')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(50)

  if (fetchErr) {
    console.error('[Follow-up Runner] DB Fetch error:', fetchErr.message);
    return 0;
  }

  if (!dueFollowUps || dueFollowUps.length === 0) {
    return 0
  }

  let processedCount = 0

  for (const followUp of dueFollowUps) {
    // 1) Claim row to avoid double processing (atomic lock)
    const { data: claimed, error: claimErr } = await db
      .from('follow_ups')
      .update({ status: 'completed' })
      .eq('id', followUp.id)
      .eq('status', 'pending')
      .select('id')

    if (claimErr || !claimed || claimed.length === 0) {
      continue // Row was claimed by another thread or failed to update
    }

    let processedSuccessfully = false;

    try {
      // 2) Load account data and contact details
      const [acctRes, contactRes] = await Promise.all([
        db
          .from('accounts')
          .select('owner_user_id, follow_up_reminder_template')
          .eq('id', followUp.account_id)
          .maybeSingle(),
        db
          .from('contacts')
          .select('name, phone')
          .eq('id', followUp.contact_id)
          .maybeSingle(),
      ])

      const account = acctRes.data
      const contact = contactRes.data

      if (!account || !contact) {
        throw new Error(`Missing account (exists: ${!!account}) or contact (exists: ${!!contact}) context`);
      }

      const contactName = contact.name || 'عميل واتساب'
      const contactPhone = contact.phone || ''

      // 3) Send Auto Reminder if enabled
      if (followUp.action_type === 'auto_reminder' || followUp.action_type === 'both') {
        const template = account.follow_up_reminder_template || 'مرحباً {name}، تواصلنا معك سابقاً بخصوص {reason}، هل ما زلت مهتماً؟'
        const customMessage = template
          .replace(/{name}/g, contactName)
          .replace(/{reason}/g, followUp.reason)

        console.log(`[Follow-up Runner] Sending WhatsApp reminder to contact ${followUp.contact_id}: "${customMessage}"`)
        
        await engineSendText({
          accountId: followUp.account_id,
          userId: account.owner_user_id,
          conversationId: followUp.conversation_id,
          contactId: followUp.contact_id,
          text: customMessage,
        })
      }

      // 4) Notify Owner via Telegram if enabled
      if (followUp.action_type === 'notify_owner' || followUp.action_type === 'both') {
        let formattedDate = followUp.scheduled_at
        try {
          const d = new Date(followUp.scheduled_at)
          if (!isNaN(d.getTime())) {
            formattedDate = d.toLocaleString('ar-SA', { timeZone: 'Asia/Baghdad' })
          }
        } catch {}

        const telegramText = `🔔 <b>تذكير متابعة عميل</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 <b>العميل:</b> ${contactName}\n` +
          `📱 <b>الهاتف:</b> <code>${contactPhone}</code>\n` +
          `📝 <b>السبب:</b> ${followUp.reason}\n` +
          `🕐 <b>الوقت المحدد للمتابعة:</b> ${formattedDate}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `<i>تذكير تلقائي من منصة MKWhats</i>`

        console.log(`[Follow-up Runner] Sending Telegram notification for account ${followUp.account_id}`)
        await notifyAccountViaTelegram(followUp.account_id, telegramText)
      }

      processedSuccessfully = true;
      processedCount++
      console.log(`[Follow-up Runner] Success: processed followUp ID ${followUp.id}`);
    } catch (err: any) {
      console.error(`[Follow-up Runner] Failure: failed to process followUp ID ${followUp.id}:`, err.message)
      
      // Revert status to 'pending' so it can retry in the next run
      const { error: revertErr } = await db
        .from('follow_ups')
        .update({ status: 'pending' })
        .eq('id', followUp.id);

      if (revertErr) {
        console.error(`[Follow-up Runner] Critical: Failed to revert followUp ID ${followUp.id} to pending:`, revertErr.message);
      } else {
        console.log(`[Follow-up Runner] Reverted followUp ID ${followUp.id} back to pending for retry.`);
      }
    }
  }

  return processedCount
}
