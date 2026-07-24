import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getFreshTokenForCalendarAccount, updateCalendarEvent, deleteCalendarEvent } from '@/lib/appointments/google-calendar'
import { checkAvailability } from '@/lib/appointments/booking-engine'

export const dynamic = 'force-dynamic'

export async function GET(
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

    const { data: appointment, error } = await supabase
      .from('appointments')
      .select('*, staff:appointment_staff(*), service:appointment_services(*)')
      .eq('id', id)
      .eq('account_id', profile.account_id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    return NextResponse.json({ appointment })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

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
    const { patient_name, patient_phone, scheduled_at, status, staff_id, service_id } = body

    // 1. Fetch current appointment
    const { data: current } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', id)
      .eq('account_id', profile.account_id)
      .maybeSingle()

    if (!current) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    const updates: any = {}
    let logMsg = `Appointment ID ${id} updated:`

    if (patient_name) {
      updates.patient_name = patient_name
      logMsg += ` Name updated to ${patient_name}.`
    }
    if (patient_phone !== undefined) {
      updates.patient_phone = patient_phone
      logMsg += ` Phone updated.`
    }
    if (staff_id !== undefined) updates.staff_id = staff_id
    if (service_id !== undefined) updates.service_id = service_id

    // Check Rescheduling
    if (scheduled_at && scheduled_at !== current.scheduled_at) {
      const avail = await checkAvailability(profile.account_id, scheduled_at, service_id || current.service_id, staff_id || current.staff_id)
      if (!avail.available) {
        return NextResponse.json({ error: avail.reason || 'Requested new slot is unavailable.' }, { status: 409 })
      }
      updates.scheduled_at = scheduled_at
      updates.status = 'rescheduled'
      logMsg += ` Rescheduled from ${current.scheduled_at} to ${scheduled_at}.`
    }

    if (status && status !== current.status) {
      updates.status = status
      logMsg += ` Status changed to ${status}.`
    }

    // 2. Sync with Google Calendar if connected
    if (current.calendar_event_id) {
      try {
        const { data: gAcc } = await supabase
          .from('appointment_google_accounts')
          .select('*')
          .eq('account_id', profile.account_id)
          .maybeSingle()

        if (gAcc) {
          const freshToken = await getFreshTokenForCalendarAccount(profile.account_id)
          
          if (status === 'cancelled') {
            await deleteCalendarEvent(freshToken, gAcc.calendar_id, current.calendar_event_id)
          } else {
            // Update Google Event
            let serviceName = 'General Appointment'
            let duration = 30
            const activeServiceId = service_id || current.service_id
            if (activeServiceId) {
              const { data: srv } = await supabase
                .from('appointment_services')
                .select('name, duration_minutes')
                .eq('id', activeServiceId)
                .maybeSingle()
              if (srv) {
                serviceName = srv.name
                duration = srv.duration_minutes
              }
            }

            await updateCalendarEvent(
              freshToken,
              gAcc.calendar_id,
              current.calendar_event_id,
              `${serviceName} (Updated)`,
              `Patient: ${patient_name || current.patient_name}\nStatus: ${status || current.status}`,
              scheduled_at || current.scheduled_at,
              duration
            )
          }
        }
      } catch (gErr) {
        console.error('[Appointments API] Google Calendar update error:', gErr)
      }
    }

    const { data: updatedAppt, error: updateErr } = await supabase
      .from('appointments')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // Log the operation
    await supabase.from('appointment_logs').insert({
      account_id: profile.account_id,
      appointment_id: id,
      operation: status === 'cancelled' ? 'cancelled' : (scheduled_at ? 'rescheduled' : 'updated'),
      description: logMsg
    })

    return NextResponse.json({ appointment: updatedAppt })
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

    // Fetch current appointment
    const { data: current } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', id)
      .eq('account_id', profile.account_id)
      .maybeSingle()

    if (!current) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    // Delete Google Calendar Event
    if (current.calendar_event_id) {
      try {
        const { data: gAcc } = await supabase
          .from('appointment_google_accounts')
          .select('*')
          .eq('account_id', profile.account_id)
          .maybeSingle()

        if (gAcc) {
          const freshToken = await getFreshTokenForCalendarAccount(profile.account_id)
          await deleteCalendarEvent(freshToken, gAcc.calendar_id, current.calendar_event_id)
        }
      } catch (gErr) {
        console.error('[Appointments API] Google Calendar delete event error:', gErr)
      }
    }

    const { error: deleteErr } = await supabase
      .from('appointments')
      .delete()
      .eq('id', id)

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 })
    }

    // Log the operation
    await supabase.from('appointment_logs').insert({
      account_id: profile.account_id,
      operation: 'deleted',
      description: `Appointment ID ${id} deleted permanently from the database.`
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
