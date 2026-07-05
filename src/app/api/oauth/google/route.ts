import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const clientId = process.env.GOOGLE_CLIENT_ID
    if (!clientId) {
      console.error('GOOGLE_CLIENT_ID is missing. Available env keys:', Object.keys(process.env))
      return NextResponse.json({ error: 'GOOGLE_CLIENT_ID is not configured in server environment' }, { status: 500 })
    }

    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/oauth/google/callback`

    const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + 
      new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly',
        access_type: 'offline',
        prompt: 'consent',
        state: user.id,
      }).toString()

    return NextResponse.redirect(oauthUrl)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
