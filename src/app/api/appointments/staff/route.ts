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

    const { data: staff, error } = await supabase
      .from('appointment_staff')
      .select('*')
      .eq('account_id', profile.account_id)
      .order('name', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ staff })
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
    const { name, photo_url, email, google_calendar_id, service_ids } = body

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const { data: member, error: insertErr } = await supabase
      .from('appointment_staff')
      .insert({
        account_id: profile.account_id,
        name,
        photo_url: photo_url || null,
        email: email || null,
        google_calendar_id: google_calendar_id || null,
        is_active: true
      })
      .select()
      .single()

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    // Link services many-to-many if provided
    if (service_ids && Array.isArray(service_ids)) {
      const joins = service_ids.map(sid => ({
        staff_id: member.id,
        service_id: sid
      }))
      await supabase.from('appointment_staff_services').insert(joins)
    }

    return NextResponse.json({ staff: member })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
