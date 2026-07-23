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
 * Format a rich appointment-booking notification.
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

  let msg = `📅 <b>حجز موعد جديد</b>\n`
  msg += `━━━━━━━━━━━━━━━━━━━━\n`
  
  if (patientName && (patientName !== contactName || (patientPhone && patientPhone !== contactPhone))) {
    msg += `👤 <b>صاحب الموعد:</b> ${esc(patientName)}\n`
    if (patientPhone) {
      msg += `📱 <b>هاتف صاحب الموعد:</b> <code>${esc(patientPhone)}</code>\n`
    }
    msg += `💬 <b>الحجز عبر واتساب رقم:</b> <code>${esc(contactPhone)}</code> | <b>لصاحب الموعد:</b> ${esc(patientName)} - ${esc(patientPhone || '')}\n`
  } else {
    msg += `👤 <b>العميل:</b> ${esc(contactName)}\n`
    msg += `📱 <b>الهاتف:</b> <code>${esc(contactPhone)}</code>\n`
  }

  msg += `🕐 <b>التاريخ والوقت:</b> ${esc(formattedDate)}\n`
  
  if (notes) {
    msg += `📝 <b>ملاحظات:</b> ${esc(notes)}\n`
  }
  if (htmlLink) {
    msg += `🔗 <b>رابط الحدث:</b> <a href="${esc(htmlLink)}">Google Calendar</a>\n`
  } else {
    msg += `✅ <b>تأكيد الإضافة:</b> تم إضافة الحدث بنجاح إلى Google Calendar\n`
  }
  
  msg += `━━━━━━━━━━━━━━━━━━━━\n`
  msg += `🔔 <i>إشعار تلقائي من MKWhats</i>`

  return msg
}

/**
 * Format a rich new-order notification with all collected fields.
 */
export function formatOrderNotification(
  contactName: string,
  contactPhone: string,
  fields: Record<string, unknown>
): string {
  let msg = `🛒 <b>طلب جديد / بيانات مستلمة</b>\n`
  msg += `━━━━━━━━━━━━━━━━━━━━\n`
  msg += `👤 <b>العميل:</b> ${esc(contactName)}\n`
  msg += `📱 <b>الهاتف:</b> <code>${esc(contactPhone)}</code>\n`
  msg += `━━━━━━━━━━━━━━━━━━━━\n`
  msg += `📋 <b>البيانات المجمعة بالكامل:</b>\n\n`

  const entries = Object.entries(fields)
  if (entries.length > 0) {
    for (const [key, value] of entries) {
      const label = esc(String(key))
      const val = esc(String(value ?? ''))
      msg += `  • <b>${label}:</b> ${val}\n`
    }
  } else {
    msg += `  <i>(لا توجد حقول إضافية)</i>\n`
  }

  msg += `\n━━━━━━━━━━━━━━━━━━━━\n`
  msg += `🔔 <i>إشعار تلقائي من MKWhats</i>`

  return msg
}
