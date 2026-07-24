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

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No account linked' }, { status: 403 })
    }

    const url = new URL(request.url)
    const staffId = url.searchParams.get('staff_id')

    let query = supabase
      .from('appointment_working_hours')
      .select('*')
      .eq('account_id', profile.account_id)

    if (staffId) {
      query = query.eq('staff_id', staffId)
    } else {
      query = query.is('staff_id', null)
    }

    const { data: workingHours, error } = await query.order('day_of_week', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // If empty, initialize standard 9-5 defaults for Mon-Fri
    if (!workingHours || workingHours.length === 0) {
      const defaults = Array.from({ length: 7 }, (_, i) => ({
        account_id: profile.account_id,
        staff_id: staffId || null,
        day_of_week: i,
        opening_time: '09:00:00',
        closing_time: '17:00:00',
        is_active: i !== 0 && i !== 6 // Sunday & Saturday closed by default
      }))

      const { data: inserted, error: initErr } = await supabase
        .from('appointment_working_hours')
        .insert(defaults)
        .select()

      if (initErr) {
        return NextResponse.json({ error: initErr.message }, { status: 500 })
      }

      return NextResponse.json({ workingHours: inserted })
    }

    return NextResponse.json({ workingHours })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
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

    const body = await request.json()
    const { workingHours, staffId } = body // workingHours = Array<{ day_of_week, opening_time, closing_time, is_active }>

    if (!workingHours || !Array.isArray(workingHours)) {
      return NextResponse.json({ error: 'workingHours array is required' }, { status: 400 })
    }

    const upsertData = workingHours.map(wh => ({
      account_id: profile.account_id,
      staff_id: staffId || null,
      day_of_week: wh.day_of_week,
      opening_time: wh.opening_time || '09:00:00',
      closing_time: wh.closing_time || '17:00:00',
      is_active: !!wh.is_active,
      updated_at: new Date().toISOString()
    }))

    const { data: saved, error: upsertErr } = await supabase
      .from('appointment_working_hours')
      .upsert(upsertData, { onConflict: 'account_id,staff_id,day_of_week' })
      .select()

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 })
    }

    return NextResponse.json({ workingHours: saved })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
