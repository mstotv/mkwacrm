import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkAvailability, syncAppointmentToSheets } from '@/lib/appointments/booking-engine'
import { createCalendarEvent, getFreshTokenForCalendarAccount } from '@/lib/appointments/google-calendar'
import { notifyAppointmentOnceViaTelegram } from '@/lib/notifications/telegram'

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
    const status = url.searchParams.get('status')
    const staffId = url.searchParams.get('staff_id')
    const serviceId = url.searchParams.get('service_id')

    let query = supabase
      .from('appointments')
      .select('*, staff:appointment_staff(name), service:appointment_services(name)')
      .eq('account_id', profile.account_id)
      .order('scheduled_at', { ascending: true })

    if (status) query = query.eq('status', status)
    if (staffId) query = query.eq('staff_id', staffId)
    if (serviceId) query = query.eq('service_id', serviceId)

    const { data: appointments, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ appointments })
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
    const { patient_name, patient_phone, scheduled_at, staff_id, service_id } = body

    if (!patient_name || !scheduled_at) {
      return NextResponse.json({ error: 'patient_name and scheduled_at are required' }, { status: 400 })
    }

    // 1. Check availability
    const avail = await checkAvailability(profile.account_id, scheduled_at, service_id, staff_id)
    if (!avail.available) {
      return NextResponse.json({ error: avail.reason || 'Requested slot is unavailable.' }, { status: 409 })
    }

    // 2. Fetch service & staff info for description
    let serviceName = 'General Appointment'
    let serviceDuration = 30
    if (service_id) {
      const { data: srv } = await supabase
        .from('appointment_services')
        .select('*')
        .eq('id', service_id)
        .maybeSingle()
      if (srv) {
        serviceName = srv.name
        serviceDuration = srv.duration_minutes
      }
    }

    let staffName = 'Any Staff'
    if (staff_id) {
      const { data: stf } = await supabase
        .from('appointment_staff')
        .select('*')
        .eq('id', staff_id)
        .maybeSingle()
      if (stf) staffName = stf.name
    }

    // 3. Create Google Calendar Event if connected
    let calendarEventId: string | undefined
    try {
      const { data: gAcc } = await supabase
        .from('appointment_google_accounts')
        .select('*')
        .eq('account_id', profile.account_id)
        .maybeSingle()

      if (gAcc) {
        const freshToken = await getFreshTokenForCalendarAccount(profile.account_id)
        const summary = `${serviceName} with ${staffName}`
        const description = `Patient Name: ${patient_name}\nPhone: ${patient_phone || 'N/A'}\nCreated via Dashboard.`
        
        const gEvent = await createCalendarEvent(
          freshToken,
          gAcc.calendar_id,
          summary,
          description,
          scheduled_at,
          serviceDuration
        )
        if (gEvent?.id) {
          calendarEventId = gEvent.id
        }
      }
    } catch (gErr) {
      console.error('[Appointments API] Google Calendar sync error:', gErr)
    }

    // 4. Save in Database
    const { data: appointment, error: insertErr } = await supabase
      .from('appointments')
      .insert({
        account_id: profile.account_id,
        patient_name,
        patient_phone,
        scheduled_at,
        staff_id: staff_id || null,
        service_id: service_id || null,
        status: 'confirmed',
        calendar_event_id: calendarEventId || null,
        booking_source: 'dashboard',
        created_by_ai: false
      })
      .select()
      .single()

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    // Log the operation
    await supabase.from('appointment_logs').insert({
      account_id: profile.account_id,
      appointment_id: appointment.id,
      operation: 'created',
      description: `Appointment booked manually for ${patient_name} at ${scheduled_at}.`
    })

    // 5. Send Telegram notification (non-blocking)
    try {
      await notifyAppointmentOnceViaTelegram(
        profile.account_id,
        patient_name,          // contactName
        patient_phone || '',   // contactPhone
        scheduled_at,
        `الخدمة: ${serviceName} | الطبيب: ${staffName} | المصدر: لوحة التحكم`,
        patient_name,
        patient_phone || '',
        calendarEventId,
        undefined
      )
    } catch (tErr) {
      console.error('[Appointments API] Telegram notification failed (non-blocking):', tErr)
    }

    // 6. Sync to Google Sheets if enabled (non-blocking)
    syncAppointmentToSheets(profile.account_id, appointment.id).catch((sErr) => {
      console.error('[Appointments API] Google Sheets sync failed (non-blocking):', sErr)
    })

    return NextResponse.json({ appointment })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
