import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGoogleSheetsConfig, saveGoogleSheetsConfig } from '@/lib/whatsapp/google-sheets'

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
      console.error('Google OAuth credentials missing in callback.', {
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret,
        availableEnvs: Object.keys(process.env)
      })
      return NextResponse.json({ error: 'Google OAuth credentials missing' }, { status: 500 })
    }

    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/oauth/google/callback`

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

    // Fetch user info (email, name, picture) from Google
    const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` }
    })
    const userinfo = await userinfoRes.json()

    const email = userinfo.email || ''
    const name = userinfo.name || 'Google User'
    const avatarUrl = userinfo.picture || ''

    const supabase = await createClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', state)
      .maybeSingle()

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No account linked' }, { status: 403 })
    }

    // Load existing config
    const { accounts, sheets } = await getGoogleSheetsConfig(profile.account_id)

    // Check if account already exists
    const existingIndex = accounts.findIndex(a => a.email.toLowerCase() === email.toLowerCase())

    const newAccount = {
      id: existingIndex !== -1 ? accounts[existingIndex].id : crypto.randomUUID(),
      email,
      name,
      avatar_url: avatarUrl,
      access_token,
      // Reuse existing refresh token if Google didn't send a new one
      refresh_token: refresh_token || (existingIndex !== -1 ? accounts[existingIndex].refresh_token : ''),
      expires_at: expiresAt,
    }

    if (existingIndex !== -1) {
      accounts[existingIndex] = newAccount
    } else {
      accounts.push(newAccount)
    }

    // Save back to DB
    await saveGoogleSheetsConfig(profile.account_id, accounts, sheets)

    // Redirect to settings page with google-sheets tab active
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/settings?tab=google-sheets`)
  } catch (error: any) {
    console.error('Callback error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
