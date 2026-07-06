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
    const googleAccountId = url.searchParams.get('googleAccountId')

    if (!googleAccountId) {
      return NextResponse.json({ error: 'googleAccountId is required' }, { status: 400 })
    }

    const token = await getFreshTokenForAccount(profile.account_id, googleAccountId)

    const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json({ error: data.error?.message || 'Failed to fetch calendar list' }, { status: res.status })
    }

    const calendars = (data.items || []).map((c: any) => ({
      id: c.id,
      summary: c.summary,
      primary: c.primary || false,
    }))

    return NextResponse.json({ calendars })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
