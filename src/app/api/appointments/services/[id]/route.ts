import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    const { data: service, error: checkErr } = await supabase
      .from('appointment_services')
      .select('id')
      .eq('id', id)
      .eq('account_id', profile.account_id)
      .maybeSingle()

    if (checkErr || !service) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 })
    }

    const updates: any = {}
    if (name !== undefined) updates.name = name
    if (duration_minutes !== undefined) updates.duration_minutes = Number(duration_minutes)
    if (description !== undefined) updates.description = description
    if (price !== undefined) updates.price = price ? Number(price) : null
    if (color !== undefined) updates.color = color
    if (max_daily_capacity !== undefined) updates.max_daily_capacity = max_daily_capacity ? Number(max_daily_capacity) : null

    const { data: updatedService, error: updateErr } = await supabase
      .from('appointment_services')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ service: updatedService })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // Confirm ownership
    const { data: service } = await supabase
      .from('appointment_services')
      .select('id')
      .eq('id', id)
      .eq('account_id', profile.account_id)
      .maybeSingle()

    if (!service) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 })
    }

    const { error: deleteErr } = await supabase
      .from('appointment_services')
      .delete()
      .eq('id', id)

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
