import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { engineSendText } from '@/lib/automations/meta-send'
import { notifyAccountViaTelegram } from '@/lib/notifications/telegram'

/**
 * GET /api/follow-ups/cron
 *
 * Background job to process due pending follow-ups.
 * Safe from concurrent runs via a row-level claim step.
 *
 * Auth: x-cron-secret header matching AUTOMATION_CRON_SECRET env variable.
 */
export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }

  const supplied = request.headers.get('x-cron-secret') ?? ''
  const suppliedBuf = Buffer.from(supplied)
  const expectedBuf = Buffer.from(expected)

  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
    console.error('[Follow-up Cron] Fetch failed:', fetchErr.message)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  if (!dueFollowUps || dueFollowUps.length === 0) {
    return NextResponse.json({ processed: 0 })
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
        console.warn(`[Follow-up Cron] Missing account/contact context for followUp ID: ${followUp.id}`)
        continue
      }

      const contactName = contact.name || 'عميل واتساب'
      const contactPhone = contact.phone || ''

      // 3) Send Auto Reminder if enabled
      if (followUp.action_type === 'auto_reminder' || followUp.action_type === 'both') {
        const template = account.follow_up_reminder_template || 'مرحباً {name}، تواصلنا معك سابقاً بخصوص {reason}، هل ما زلت مهتماً؟'
        const customMessage = template
          .replace(/{name}/g, contactName)
          .replace(/{reason}/g, followUp.reason)

        console.log(`[Follow-up Cron] Sending WhatsApp reminder to contact ${followUp.contact_id}`)
        
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
            formattedDate = d.toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })
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


        console.log(`[Follow-up Cron] Sending Telegram notification to owner of account ${followUp.account_id}`)
        await notifyAccountViaTelegram(followUp.account_id, telegramText)
      }

      processedCount++
    } catch (err: any) {
      console.error(`[Follow-up Cron] Failed to process followUp ID ${followUp.id}:`, err.message)
    }
  }

  return NextResponse.json({ processed: processedCount })
}
