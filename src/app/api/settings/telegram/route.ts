import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { encrypt, decrypt } from '@/lib/whatsapp/encryption'

/**
 * Account-level Telegram notification config.
 *
 * GET  — Read the current config (token masked)
 * POST — Create or update the config (encrypts bot_token)
 * DELETE — Remove the config entirely
 *
 * Auth: JWT verification via Supabase, writes use service_role to
 * bypass RLS (same pattern as /api/billing/subscription).
 */

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getAccountIdFromRequest(req: NextRequest): Promise<{
  accountId: string | null
  error?: string
}> {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return { accountId: null, error: 'Missing authorization header' }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)

  if (error || !user) {
    return { accountId: null, error: 'Invalid or expired token' }
  }

  const db = supabaseAdmin()
  const { data: profile } = await db
    .from('profiles')
    .select('account_id, account_role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!profile?.account_id) {
    return { accountId: null, error: 'No account found for this user' }
  }

  // Only owner/admin can manage telegram settings
  if (!['owner', 'admin'].includes(profile.account_role || '')) {
    return { accountId: null, error: 'Insufficient permissions. Only owner or admin can manage Telegram settings.' }
  }

  return { accountId: profile.account_id }
}

export async function GET(req: NextRequest) {
  const { accountId, error } = await getAccountIdFromRequest(req)
  if (!accountId) {
    return NextResponse.json({ error }, { status: 401 })
  }

  const db = supabaseAdmin()
  const { data: config, error: dbErr } = await db
    .from('account_telegram_config')
    .select('chat_id, is_enabled, bot_token_encrypted, updated_at')
    .eq('account_id', accountId)
    .maybeSingle()

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  if (!config) {
    return NextResponse.json({ configured: false })
  }

  // Mask the bot token — never expose the actual value
  let tokenMask = '••••••••'
  try {
    const plain = decrypt(config.bot_token_encrypted)
    // Show last 6 chars of the token for identification
    if (plain.length > 6) {
      tokenMask = `••••••${plain.slice(-6)}`
    }
  } catch {
    tokenMask = '(تشفير غير صالح)'
  }

  return NextResponse.json({
    configured: true,
    chat_id: config.chat_id,
    is_enabled: config.is_enabled,
    bot_token_masked: tokenMask,
    updated_at: config.updated_at,
  })
}

export async function POST(req: NextRequest) {
  const { accountId, error } = await getAccountIdFromRequest(req)
  if (!accountId) {
    return NextResponse.json({ error }, { status: 401 })
  }

  const body = await req.json()
  const { bot_token, chat_id, is_enabled } = body

  if (!chat_id || typeof chat_id !== 'string' || !chat_id.trim()) {
    return NextResponse.json(
      { error: 'Chat ID مطلوب ولا يمكن أن يكون فارغاً.' },
      { status: 400 }
    )
  }

  const db = supabaseAdmin()

  // Check if config already exists
  const { data: existing } = await db
    .from('account_telegram_config')
    .select('id, bot_token_encrypted')
    .eq('account_id', accountId)
    .maybeSingle()

  if (existing) {
    // Update — only encrypt new token if provided
    const updatePayload: Record<string, any> = {
      chat_id: chat_id.trim(),
      is_enabled: is_enabled !== false,
      updated_at: new Date().toISOString(),
    }

    if (bot_token && typeof bot_token === 'string' && bot_token.trim()) {
      updatePayload.bot_token_encrypted = encrypt(bot_token.trim())
    }

    const { error: updateErr } = await db
      .from('account_telegram_config')
      .update(updatePayload)
      .eq('id', existing.id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }
  } else {
    // Insert — token is required for first-time setup
    if (!bot_token || typeof bot_token !== 'string' || !bot_token.trim()) {
      return NextResponse.json(
        { error: 'Bot Token مطلوب عند إعداد تيليجرام لأول مرة.' },
        { status: 400 }
      )
    }

    const { error: insertErr } = await db
      .from('account_telegram_config')
      .insert({
        account_id: accountId,
        bot_token_encrypted: encrypt(bot_token.trim()),
        chat_id: chat_id.trim(),
        is_enabled: is_enabled !== false,
      })

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const { accountId, error } = await getAccountIdFromRequest(req)
  if (!accountId) {
    return NextResponse.json({ error }, { status: 401 })
  }

  const db = supabaseAdmin()
  const { error: delErr } = await db
    .from('account_telegram_config')
    .delete()
    .eq('account_id', accountId)

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
