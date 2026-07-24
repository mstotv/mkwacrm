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

    // Deduplicate in memory (in case duplicate default rows exist because of NULL staff_id unique constraint behavior in Postgres)
    const uniqueHoursMap: Record<number, any> = {}
    if (workingHours) {
      for (const wh of workingHours) {
        if (uniqueHoursMap[wh.day_of_week] === undefined) {
          uniqueHoursMap[wh.day_of_week] = wh
        }
      }
    }
    const deduplicatedHours = Object.values(uniqueHoursMap)

    // If empty or incomplete, initialize standard 9-5 defaults for all 7 days
    if (deduplicatedHours.length < 7) {
      const existingDays = deduplicatedHours.map(d => d.day_of_week)
      const defaultsToInsert = []

      for (let i = 0; i < 7; i++) {
        if (!existingDays.includes(i)) {
          defaultsToInsert.push({
            account_id: profile.account_id,
            staff_id: staffId || null,
            day_of_week: i,
            opening_time: '09:00:00',
            closing_time: '17:00:00',
            is_active: i !== 0 && i !== 6 // Sunday & Saturday closed by default
          })
        }
      }

      if (defaultsToInsert.length > 0) {
        const { data: inserted, error: initErr } = await supabase
          .from('appointment_working_hours')
          .insert(defaultsToInsert)
          .select()

        if (initErr) {
          return NextResponse.json({ error: initErr.message }, { status: 500 })
        }
        
        // Merge and sort
        const allHours = [...deduplicatedHours, ...inserted].sort((a, b) => a.day_of_week - b.day_of_week)
        return NextResponse.json({ workingHours: allHours })
      }
    }

    return NextResponse.json({ workingHours: deduplicatedHours })
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

    // 1. Delete all existing working hours for this account/staff combination to clean up any duplicates
    let deleteQuery = supabase
      .from('appointment_working_hours')
      .delete()
      .eq('account_id', profile.account_id)

    if (staffId) {
      deleteQuery = deleteQuery.eq('staff_id', staffId)
    } else {
      deleteQuery = deleteQuery.is('staff_id', null)
    }

    const { error: deleteErr } = await deleteQuery
    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 })
    }

    // 2. Insert fresh clean working hours data
    const insertData = workingHours.map(wh => ({
      account_id: profile.account_id,
      staff_id: staffId || null,
      day_of_week: wh.day_of_week,
      opening_time: wh.opening_time || '09:00:00',
      closing_time: wh.closing_time || '17:00:00',
      is_active: !!wh.is_active,
      updated_at: new Date().toISOString()
    }))

    const { data: saved, error: insertErr } = await supabase
      .from('appointment_working_hours')
      .insert(insertData)
      .select()

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    return NextResponse.json({ workingHours: saved })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
