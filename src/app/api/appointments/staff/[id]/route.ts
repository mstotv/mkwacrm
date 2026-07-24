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
    const { name, photo_url, email, google_calendar_id, is_active, service_ids } = body

    const { data: member, error: checkErr } = await supabase
      .from('appointment_staff')
      .select('*')
      .eq('id', id)
      .eq('account_id', profile.account_id)
      .maybeSingle()

    if (checkErr || !member) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
    }

    const updates: any = {}
    if (name !== undefined) updates.name = name
    if (photo_url !== undefined) updates.photo_url = photo_url
    if (email !== undefined) updates.email = email
    if (google_calendar_id !== undefined) updates.google_calendar_id = google_calendar_id
    if (is_active !== undefined) updates.is_active = is_active

    const { data: updatedMember, error: updateErr } = await supabase
      .from('appointment_staff')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // Sync many-to-many services if service_ids are supplied
    if (service_ids && Array.isArray(service_ids)) {
      // Clear old associations
      await supabase.from('appointment_staff_services').delete().eq('staff_id', id)

      // Add new associations
      const joins = service_ids.map(sid => ({
        staff_id: id,
        service_id: sid
      }))
      if (joins.length > 0) {
        await supabase.from('appointment_staff_services').insert(joins)
      }
    }

    return NextResponse.json({ staff: updatedMember })
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
    const { data: member } = await supabase
      .from('appointment_staff')
      .select('id')
      .eq('id', id)
      .eq('account_id', profile.account_id)
      .maybeSingle()

    if (!member) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
    }

    const { error: deleteErr } = await supabase
      .from('appointment_staff')
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
