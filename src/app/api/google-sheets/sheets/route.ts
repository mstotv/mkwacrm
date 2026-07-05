import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getFreshTokenForAccount } from '@/lib/whatsapp/google-sheets'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No account linked' }, { status: 403 })
    }

    const url = new URL(request.url)
    const spreadsheetId = url.searchParams.get('spreadsheetId')
    const googleAccountId = url.searchParams.get('googleAccountId')

    if (!spreadsheetId || !googleAccountId) {
      return NextResponse.json({ sheets: [] })
    }

    const token = await getFreshTokenForAccount(profile.account_id, googleAccountId)

    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json({ error: data.error?.message || 'Failed to fetch sheets tabs' }, { status: res.status })
    }

    const sheets = (data.sheets || []).map((s: any) => s.properties?.title || '')

    return NextResponse.json({ sheets })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
