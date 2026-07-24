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

    const { data: services, error } = await supabase
      .from('appointment_services')
      .select('*')
      .eq('account_id', profile.account_id)
      .order('name', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ services })
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
    const { name, duration_minutes, description, price, color, max_daily_capacity } = body

    if (!name || !duration_minutes) {
      return NextResponse.json({ error: 'name and duration_minutes are required' }, { status: 400 })
    }

    const { data: service, error: insertErr } = await supabase
      .from('appointment_services')
      .insert({
        account_id: profile.account_id,
        name,
        duration_minutes: Number(duration_minutes),
        description: description || null,
        price: price ? Number(price) : null,
        color: color || '#3b82f6',
        max_daily_capacity: max_daily_capacity ? Number(max_daily_capacity) : null
      })
      .select()
      .single()

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    return NextResponse.json({ service })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
