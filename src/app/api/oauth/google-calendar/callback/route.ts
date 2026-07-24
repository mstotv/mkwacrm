import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/whatsapp/encryption'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state') // state holds the userId

    if (!code || !state) {
      return NextResponse.json({ error: 'Missing code or state parameter' }, { status: 400 })
    }

    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    if (!clientId || !clientSecret) {
      console.error('Google OAuth credentials missing in callback.')
      return NextResponse.json({ error: 'Google OAuth credentials missing' }, { status: 500 })
    }

    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/oauth/google-calendar/callback`

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString()
    })

    const tokenData = await tokenRes.json()
    if (!tokenRes.ok) {
      return NextResponse.json({ error: tokenData.error_description || 'Failed to exchange token' }, { status: 500 })
    }

    const { access_token, refresh_token, expires_in } = tokenData
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString()

    // Fetch user email info
    const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` }
    })
    const userinfo = await userinfoRes.json()
    const email = userinfo.email || ''

    const supabase = await createClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', state)
      .maybeSingle()

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No account linked' }, { status: 403 })
    }

    const encryptedAccess = encrypt(access_token)
    const encryptedRefresh = refresh_token ? encrypt(refresh_token) : ''

    // Upsert into appointment_google_accounts
    const { error: upsertErr } = await supabase
      .from('appointment_google_accounts')
      .upsert({
        account_id: profile.account_id,
        email,
        access_token: encryptedAccess,
        refresh_token: encryptedRefresh || undefined, // only update if provided by Google
        calendar_id: 'primary',
        timezone: 'Asia/Baghdad',
        expires_at: expiresAt,
        updated_at: new Date().toISOString()
      }, { onConflict: 'account_id' })

    if (upsertErr) {
      console.error('[OAuth Calendar Callback] DB Upsert error:', upsertErr.message)
      return NextResponse.json({ error: upsertErr.message }, { status: 500 })
    }

    // Redirect to the main Appointments page
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/appointments`)
  } catch (error: any) {
    console.error('Calendar Callback error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
