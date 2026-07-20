import { NextRequest, NextResponse } from 'next/server'
import { sendTestTelegramMessage } from '@/lib/notifications/telegram'

/**
 * POST /api/settings/telegram/test
 *
 * Send a test message to verify bot token + chat id BEFORE saving.
 * Accepts raw (unencrypted) values from the client.
 *
 * Body: { bot_token: string, chat_id: string }
 * Returns: { success: boolean, error?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { bot_token, chat_id } = await req.json()

    if (!bot_token || typeof bot_token !== 'string' || !bot_token.trim()) {
      return NextResponse.json(
        { success: false, error: 'Bot Token مطلوب. يمكنك الحصول عليه من @BotFather في تيليجرام.' },
        { status: 400 }
      )
    }

    if (!chat_id || typeof chat_id !== 'string' || !chat_id.trim()) {
      return NextResponse.json(
        { success: false, error: 'Chat ID مطلوب. يمكنك معرفته عبر بوت @userinfobot في تيليجرام.' },
        { status: 400 }
      )
    }

    const result = await sendTestTelegramMessage(bot_token.trim(), chat_id.trim())

    if (result.ok) {
      return NextResponse.json({ success: true })
    }

    return NextResponse.json(
      { success: false, error: result.error },
      { status: 422 }
    )
  } catch (err: any) {
    console.error('[Telegram Test] Unexpected error:', err)
    return NextResponse.json(
      { success: false, error: `خطأ غير متوقع: ${err.message}` },
      { status: 500 }
    )
  }
}
