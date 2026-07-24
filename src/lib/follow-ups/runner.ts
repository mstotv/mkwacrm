import { supabaseAdmin } from '@/lib/automations/admin-client'
import { engineSendText } from '@/lib/automations/meta-send'
import { notifyAccountViaTelegram } from '@/lib/notifications/telegram'

let _intervalStarted = false;
let _isProcessing = false; // Mutex: prevent concurrent runs

/**
 * Ensures an in-memory timer runs every 60 seconds to check for due follow-ups.
 * Safe to call multiple times — only initializes once per process.
 * Started from src/instrumentation.ts on server boot.
 */
export function startFollowUpBackgroundWorker() {
  // Guard: only run in Node.js server context (not browser or edge)
  if (typeof window !== 'undefined') return;
  if (_intervalStarted) {
    console.log('[Follow-up Worker] Already running, skipping duplicate start.')
    return;
  }
  _intervalStarted = true;
  console.log('[Follow-up Worker] ✅ Starting background worker (checking every 60s)...');

  // Run immediately once on startup
  processDueFollowUps().catch(err =>
    console.error('[Follow-up Worker] Initial run error:', err.message)
  );

  // Then run every 60 seconds (reduced from 30s to avoid hammering DB)
  setInterval(() => {
    processDueFollowUps().catch(err =>
      console.error('[Follow-up Worker] Interval run error:', err.message)
    );
  }, 60_000);
}

/**
 * Process all due pending follow-ups from the database.
 * Uses a mutex (_isProcessing) to prevent concurrent executions.
 * Sends WhatsApp message to the contact and/or notifies via Telegram.
 */
export async function processDueFollowUps(): Promise<number> {
  // Mutex: prevent overlapping runs
  if (_isProcessing) {
    console.log('[Follow-up Worker] Previous run still in progress, skipping this cycle.')
    return 0;
  }
  _isProcessing = true;

  try {
    const db = supabaseAdmin()
    const now = new Date().toISOString()

    // Fetch up to 50 pending follow-ups that are due now
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
      return 0;
    }

    console.log(`[Follow-up Runner] Found ${dueFollowUps.length} due follow-up(s) to process.`)

    let processedCount = 0

    for (const followUp of dueFollowUps) {
      // Atomic claim: mark as 'completed' only if still 'pending'
      // This prevents double-processing in any race condition scenario
      const { data: claimed, error: claimErr } = await db
        .from('follow_ups')
        .update({ status: 'completed' })
        .eq('id', followUp.id)
        .eq('status', 'pending') // Only claim if still pending
        .select('id')

      if (claimErr || !claimed || claimed.length === 0) {
        console.log(`[Follow-up Runner] Skipping ID ${followUp.id} — already claimed by another process.`)
        continue;
      }

      try {
        // Load account and contact details in parallel
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
          console.error(`[Follow-up Runner] Missing account or contact for follow-up ${followUp.id}. Marking cancelled.`)
          await db.from('follow_ups').update({ status: 'cancelled' }).eq('id', followUp.id)
          continue;
        }

        const contactName = contact.name || 'عميل'
        const contactPhone = contact.phone || ''

        // ── Step 1: Send WhatsApp auto-reminder ─────────────────────
        if (followUp.action_type === 'auto_reminder' || followUp.action_type === 'both') {
          const template = account.follow_up_reminder_template
            || 'مرحباً {name}، تواصلنا معك سابقاً بخصوص {reason}، هل ما زلت مهتماً؟'

          const customMessage = template
            .replace(/{name}/g, contactName)
            .replace(/{reason}/g, followUp.reason || 'متابعة')

          console.log(`[Follow-up Runner] Sending WhatsApp reminder to ${contactPhone}`)

          await engineSendText({
            accountId: followUp.account_id,
            userId: account.owner_user_id,
            conversationId: followUp.conversation_id,
            contactId: followUp.contact_id,
            text: customMessage,
          })
        }

        // ── Step 2: Notify owner via Telegram ───────────────────────
        if (followUp.action_type === 'notify_owner' || followUp.action_type === 'both') {
          let formattedDate = followUp.scheduled_at
          try {
            const d = new Date(followUp.scheduled_at)
            if (!isNaN(d.getTime())) {
              formattedDate = d.toLocaleString('ar-SA', { timeZone: 'Asia/Baghdad' })
            }
          } catch (_) {}

          const telegramText =
            `🔔 <b>تذكير متابعة عميل</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `👤 <b>العميل:</b> ${contactName}\n` +
            `📱 <b>الهاتف:</b> <code>${contactPhone}</code>\n` +
            `📝 <b>السبب:</b> ${followUp.reason || 'متابعة'}\n` +
            `🕐 <b>الوقت المحدد:</b> ${formattedDate}\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `<i>تذكير تلقائي — MKWhats Platform</i>`

          console.log(`[Follow-up Runner] Sending Telegram notification for account ${followUp.account_id}`)
          await notifyAccountViaTelegram(followUp.account_id, telegramText)
        }

        processedCount++
        console.log(`[Follow-up Runner] ✅ Successfully processed follow-up ID ${followUp.id}`)
      } catch (err: any) {
        console.error(`[Follow-up Runner] ❌ Failed to process follow-up ID ${followUp.id}:`, err.message)

        // Revert to 'pending' so it retries on the next cycle
        const { error: revertErr } = await db
          .from('follow_ups')
          .update({ status: 'pending' })
          .eq('id', followUp.id)

        if (revertErr) {
          console.error(`[Follow-up Runner] CRITICAL: Could not revert follow-up ${followUp.id} to pending:`, revertErr.message)
        }
      }
    }

    if (processedCount > 0) {
      console.log(`[Follow-up Runner] Batch complete. Processed ${processedCount}/${dueFollowUps.length} follow-up(s).`)
    }

    return processedCount
  } finally {
    // Always release the mutex, even if an error occurred
    _isProcessing = false;
  }
}
