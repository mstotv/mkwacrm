/**
 * Telegram Bot API notification helpers.
 *
 * Each account can optionally configure a personal Telegram bot
 * (Bot Token + Chat ID) to receive real-time notifications for
 * appointment bookings and new orders from their WhatsApp customers.
 *
 * All functions are designed to be non-blocking — failures are logged
 * but never propagate to the caller, so the primary business flow
 * (booking, order saving) is never interrupted.
 */

import { supabaseAdmin } from '@/lib/automations/admin-client'
import { decrypt } from '@/lib/whatsapp/encryption'
import { formatBaghdadDateTime, parseLocalTimeString } from '@/lib/whatsapp/timezone-utils'

// ----------------------------------------------------------------
// Low-level Telegram API
// ----------------------------------------------------------------

interface TelegramSendResult {
  ok: boolean
  error?: string
  error_code?: number
}

/**
 * Send a message via Telegram Bot API.
 * Returns a structured result instead of throwing.
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  parseMode: 'HTML' | 'MarkdownV2' = 'HTML'
): Promise<TelegramSendResult> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
      }),
    })

    const data = await res.json()

    if (data.ok) {
      return { ok: true }
    }

    // Map common Telegram error codes to user-friendly messages
    const errorCode = data.error_code || res.status
    let errorMsg = data.description || 'Unknown Telegram error'

    if (errorCode === 401) {
      errorMsg = 'Bot Token غير صالح أو خاطئ. تأكد من نسخ الـ Token بالكامل من @BotFather.'
    } else if (errorCode === 400 && errorMsg.includes('chat not found')) {
      errorMsg =
        'Chat ID غير صحيح أو البوت لم يبدأ محادثة بعد. تأكد أنك بدأت محادثة مع البوت أولاً بالضغط على /start داخل تيليجرام.'
    } else if (errorCode === 403) {
      errorMsg =
        'البوت محظور من قبل المستخدم أو لا يملك صلاحية الإرسال. تأكد أنك لم تحظر البوت وأنك بدأت محادثة معه بالضغط على /start.'
    }

    return { ok: false, error: errorMsg, error_code: errorCode }
  } catch (err: any) {
    return {
      ok: false,
      error: `فشل الاتصال بخوادم تيليجرام: ${err.message}`,
    }
  }
}

/**
 * Send a quick test message to verify bot token + chat id.
 */
export async function sendTestTelegramMessage(
  botToken: string,
  chatId: string
): Promise<TelegramSendResult> {
  const text = `✅ <b>تم ربط البوت بنجاح!</b>\n\nهذه رسالة اختبارية من منصة MKWhats.\nسيصلك هنا إشعارات حجوزات المواعيد والطلبات الجديدة من عملائك عبر واتساب.`
  return sendTelegramMessage(botToken, chatId, text)
}

// ----------------------------------------------------------------
// Account-level notification (reads config from DB)
// ----------------------------------------------------------------

/**
 * Send a Telegram notification to an account's configured bot.
 * Silently returns if the account has no config or telegram is disabled.
 * Never throws — all errors are logged to console.
 */
export async function notifyAccountViaTelegram(
  accountId: string,
  message: string
): Promise<void> {
  try {
    const db = supabaseAdmin()
    const { data: config, error } = await db
      .from('account_telegram_config')
      .select('bot_token_encrypted, chat_id, is_enabled')
      .eq('account_id', accountId)
      .maybeSingle()

    if (error) {
      console.error('[Telegram] Failed to load config:', error.message)
      return
    }

    if (!config || !config.is_enabled) {
      return // No config or disabled — silently skip
    }

    let botToken: string
    try {
      botToken = decrypt(config.bot_token_encrypted)
    } catch (decErr: any) {
      console.error('[Telegram] Failed to decrypt bot token for account', accountId, decErr.message)
      return
    }

    const result = await sendTelegramMessage(botToken, config.chat_id, message)
    if (!result.ok) {
      console.error(
        `[Telegram] Notification failed for account ${accountId}:`,
        result.error
      )
    }
  } catch (err: any) {
    console.error('[Telegram] Unexpected error in notifyAccountViaTelegram:', err.message)
  }
}

// ----------------------------------------------------------------
// Message formatters
// ----------------------------------------------------------------

/** Escape HTML special chars for Telegram HTML parse mode. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Format a rich appointment-booking notification with complete patient & calendar details.
 */
export function formatAppointmentNotification(
  contactName: string,
  contactPhone: string,
  dateTime: string,
  notes?: string,
  patientName?: string,
  patientPhone?: string,
  googleEventId?: string,
  htmlLink?: string
): string {
  // Try to format the date nicely using Baghdad Timezone
  let formattedDate = dateTime
  try {
    const d = parseLocalTimeString(dateTime)
    if (!isNaN(d.getTime())) {
      formattedDate = formatBaghdadDateTime(d, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
    }
  } catch (e) {
    console.error('[Telegram] Date formatting failed:', e)
  }

  const finalPatientName = patientName || contactName || 'غير محدد';
  const finalPatientPhone = patientPhone || contactPhone || 'غير محدد';

  let msg = `📅 <b>إشعار تأكيد موعد جديد</b>\n`
  msg += `━━━━━━━━━━━━━━━━━━━━\n`
  msg += `👤 <b>اسم المريض / صاحب الموعد:</b> ${esc(finalPatientName)}\n`
  msg += `📱 <b>رقم هاتف المريض:</b> <code>${esc(finalPatientPhone)}</code>\n`

  if (contactPhone && (contactPhone !== finalPatientPhone || contactName !== finalPatientName)) {
    msg += `💬 <b>حساب الواتساب المرسل:</b> <code>${esc(contactPhone)}</code> (${esc(contactName)})\n`
  }

  msg += `🕐 <b>موعد الزيارة / التاريخ والوقت:</b> ${esc(formattedDate)}\n`
  
  if (notes) {
    msg += `📝 <b>التفاصيل والملاحظات:</b> ${esc(notes)}\n`
  }

  if (htmlLink) {
    msg += `🔗 <b>رابط التقويم:</b> <a href="${esc(htmlLink)}">عرض في Google Calendar</a>\n`
  } else {
    msg += `✅ <b>تأكيد الإضافة:</b> تم حفظ وتثبيت الموعد بنجاح في Google Calendar\n`
  }
  
  msg += `━━━━━━━━━━━━━━━━━━━━\n`
  msg += `🔔 <i>إشعار تلقائي مؤكد من MKWhats</i>`

  return msg
}

/**
 * Format a rich new-order notification with all collected fields.
 * Cleans out raw Google Sheet column keys (A, B, C, D).
 */
export function formatOrderNotification(
  contactName: string,
  contactPhone: string,
  fields: Record<string, unknown>
): string {
  let msg = `🛒 <b>إشعار تأكيد طلب شراء جديد</b>\n`
  msg += `━━━━━━━━━━━━━━━━━━━━\n`
  msg += `👤 <b>اسم العميل:</b> ${esc(contactName)}\n`
  msg += `📱 <b>رقم الهاتف:</b> <code>${esc(contactPhone)}</code>\n`
  msg += `━━━━━━━━━━━━━━━━━━━━\n`
  msg += `📋 <b>تفاصيل الطلب المؤكد:</b>\n\n`

  const entries = Object.entries(fields)
  let count = 0
  if (entries.length > 0) {
    for (const [key, value] of entries) {
      if (!value) continue
      const keyTrim = String(key).trim()
      // Skip raw sheet column letter keys (A, B, C, D...) or pure numbers (0, 1, 2...)
      if (/^[A-Z]{1,2}$|^\d+$/.test(keyTrim)) continue

      const label = esc(keyTrim)
      const val = esc(String(value))
      msg += `  • <b>${label}:</b> ${val}\n`
      count++
    }
  }

  if (count === 0) {
    msg += `  <i>(تم تسجيل وتثبيت طلب الشراء بنجاح)</i>\n`
  }

  msg += `\n━━━━━━━━━━━━━━━━━━━━\n`
  msg += `🔔 <i>إشعار تلقائي مؤكد من MKWhats</i>`

  return msg
}

// Global in-memory deduplication cache for orders (Key: accountId_contactPhone_orderHash, Value: timestamp)
const globalOrderDeduplicationCache = new Map<string, number>();

/**
 * Send an order notification via Telegram EXACTLY ONCE per confirmed order.
 * Automatically cleans raw sheet column letters (A, B, C, D) and prevents duplicate dispatches.
 */
export async function notifyOrderOnceViaTelegram(
  accountId: string,
  contactId: string | null | undefined,
  contactName: string,
  contactPhone: string,
  fields: Record<string, unknown>
): Promise<void> {
  const cleanFields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!v) continue;
    const keyTrim = String(k).trim();
    if (/^[A-Z]{1,2}$|^\d+$/.test(keyTrim)) continue;
    cleanFields[keyTrim] = v;
  }

  const product = String(cleanFields['المنتج / الخدمة'] || cleanFields['المنتج'] || cleanFields['product_name'] || '').trim();
  const price = String(cleanFields['المبلغ الإجمالي'] || cleanFields['السعر'] || cleanFields['total_price'] || '').trim();
  const phone = (contactPhone || '').trim();

  const dedupeKey = `${accountId}_${phone}_${product}_${price}`;
  const now = Date.now();
  const lastSent = globalOrderDeduplicationCache.get(dedupeKey);

  // If sent within last 10 minutes for this account + contact + order, skip duplicate dispatch!
  if (lastSent && (now - lastSent < 10 * 60 * 1000)) {
    console.log('[Telegram] Skipping duplicate order notification for key:', dedupeKey);
    return;
  }

  globalOrderDeduplicationCache.set(dedupeKey, now);

  // Periodic cleanup
  if (globalOrderDeduplicationCache.size > 500) {
    for (const [k, ts] of globalOrderDeduplicationCache.entries()) {
      if (now - ts > 10 * 60 * 1000) globalOrderDeduplicationCache.delete(k);
    }
  }

  const message = formatOrderNotification(contactName, contactPhone, cleanFields);
  await notifyAccountViaTelegram(accountId, message);
}

// Global in-memory deduplication cache for appointments
const globalAppointmentDeduplicationCache = new Map<string, number>();

/**
 * Send an appointment booking notification via Telegram Bot API exactly once.
 * Prevents double alerts on simultaneous triggers.
 */
export async function notifyAppointmentOnceViaTelegram(
  accountId: string,
  contactName: string,
  contactPhone: string,
  dateTime: string,
  notes?: string,
  patientName?: string,
  patientPhone?: string,
  googleEventId?: string,
  htmlLink?: string
): Promise<void> {
  const dateStr = String(dateTime).trim();
  const phone = (patientPhone || contactPhone || '').trim();
  const dedupeKey = `${accountId}_${phone}_${dateStr}`;
  const now = Date.now();
  const lastSent = globalAppointmentDeduplicationCache.get(dedupeKey);

  if (lastSent && (now - lastSent < 10 * 60 * 1000)) {
    console.log('[Telegram] Skipping duplicate appointment notification for key:', dedupeKey);
    return;
  }

  globalAppointmentDeduplicationCache.set(dedupeKey, now);

  // Periodic cleanup
  if (globalAppointmentDeduplicationCache.size > 500) {
    for (const [k, ts] of globalAppointmentDeduplicationCache.entries()) {
      if (now - ts > 10 * 60 * 1000) globalAppointmentDeduplicationCache.delete(k);
    }
  }

  const message = formatAppointmentNotification(
    contactName,
    contactPhone,
    dateTime,
    notes,
    patientName,
    patientPhone,
    googleEventId,
    htmlLink
  );
  await notifyAccountViaTelegram(accountId, message);
}
