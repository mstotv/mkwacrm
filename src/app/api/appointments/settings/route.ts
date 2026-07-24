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

    let { data: settings } = await supabase
      .from('appointment_settings')
      .select('*')
      .eq('account_id', profile.account_id)
      .maybeSingle()

    // Initialize default settings if not exists
    if (!settings) {
      const { data: newSettings, error: insertErr } = await supabase
        .from('appointment_settings')
        .insert({
          account_id: profile.account_id,
          timezone: 'Asia/Baghdad',
          min_booking_notice_hours: 2,
          max_future_booking_days: 30,
          booking_interval_minutes: 30,
          sheets_sync_enabled: false
        })
        .select()
        .single()
      
      if (!insertErr && newSettings) {
        settings = newSettings
      }
    }

    // Check if Google Calendar is connected
    const { data: gAcc } = await supabase
      .from('appointment_google_accounts')
      .select('email, calendar_id')
      .eq('account_id', profile.account_id)
      .maybeSingle()

    return NextResponse.json({ 
      settings,
      googleCalendarConnected: !!gAcc,
      googleCalendarEmail: gAcc?.email || null,
      googleCalendarId: gAcc?.calendar_id || null
    })
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
    const {
      timezone,
      max_daily_appointments,
      max_hourly_appointments,
      min_booking_notice_hours,
      max_future_booking_days,
      booking_interval_minutes,
      sheets_sync_enabled,
      sheets_spreadsheet_id,
      sheets_worksheet_name,
      google_calendar_id // if updating target calendar
    } = body

    const upsertData: any = {
      account_id: profile.account_id,
      timezone: timezone || 'Asia/Baghdad',
      max_daily_appointments: max_daily_appointments !== undefined ? Number(max_daily_appointments) : null,
      max_hourly_appointments: max_hourly_appointments !== undefined ? Number(max_hourly_appointments) : null,
      min_booking_notice_hours: Number(min_booking_notice_hours ?? 2),
      max_future_booking_days: Number(max_future_booking_days ?? 30),
      booking_interval_minutes: Number(booking_interval_minutes ?? 30),
      sheets_sync_enabled: !!sheets_sync_enabled,
      sheets_spreadsheet_id: sheets_spreadsheet_id || null,
      sheets_worksheet_name: sheets_worksheet_name || null,
      updated_at: new Date().toISOString()
    }

    const { data: settings, error: upsertErr } = await supabase
      .from('appointment_settings')
      .upsert(upsertData, { onConflict: 'account_id' })
      .select()
      .single()

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 })
    }

    // Update target google calendar if passed
    if (google_calendar_id) {
      await supabase
        .from('appointment_google_accounts')
        .update({ calendar_id: google_calendar_id })
        .eq('account_id', profile.account_id)
    }

    return NextResponse.json({ settings })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
