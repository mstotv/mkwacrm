import { supabaseAdmin } from '@/lib/automations/admin-client'
import { getFreshTokenForCalendarAccount, fetchCalendarBusySlots, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from './google-calendar'
import { getBaghdadParts, createDateFromBaghdadParts, parseLocalTimeString } from '@/lib/whatsapp/timezone-utils'

export interface SlotAvailability {
  available: boolean
  reason?: string
  nearestSlots?: string[]
}

// Convert HH:MM:SS or HH:MM to minutes from midnight
function timeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':').map(Number)
  return (parts[0] || 0) * 60 + (parts[1] || 0)
}

export async function checkAvailability(
  accountId: string,
  dateTimeStr: string, // ISO or local date time
  serviceId?: string | null,
  staffId?: string | null
): Promise<SlotAvailability> {
  const db = supabaseAdmin()
  const requestedDate = new Date(dateTimeStr)
  const requestedTimeMs = requestedDate.getTime()

  // 1. Fetch settings
  const { data: settings } = await db
    .from('appointment_settings')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle()

  const timezone = settings?.timezone || 'Asia/Baghdad'
  const minBookingNoticeHours = settings?.min_booking_notice_hours ?? 2
  const maxFutureBookingDays = settings?.max_future_booking_days ?? 30

  // 2. Validate Notice and Window
  const now = new Date()
  const noticeMinTime = now.getTime() + minBookingNoticeHours * 60 * 60 * 1000
  if (requestedTimeMs < noticeMinTime) {
    return { available: false, reason: 'Slot is too close to current time. Minimum notice required.' }
  }

  const maxFutureTime = now.getTime() + maxFutureBookingDays * 24 * 60 * 60 * 1000
  if (requestedTimeMs > maxFutureTime) {
    return { available: false, reason: 'Slot is too far in the future.' }
  }

  // 3. Extract Date and Time parts
  // Use Baghdad parts or simple local timezone
  const localDateStr = requestedDate.toISOString().substring(0, 10) // YYYY-MM-DD
  const dayOfWeek = requestedDate.getDay() // 0 is Sunday, 6 is Saturday
  const hours = requestedDate.getHours()
  const minutes = requestedDate.getMinutes()
  const requestedMinutes = hours * 60 + minutes

  // 4. Validate Holidays
  const { data: holiday } = await db
    .from('appointment_holidays')
    .select('id')
    .eq('account_id', accountId)
    .eq('holiday_date', localDateStr)
    .or(staffId ? `staff_id.eq.${staffId},staff_id.is.null` : 'staff_id.is.null')
    .maybeSingle()

  if (holiday) {
    return { available: false, reason: 'Requested date is a holiday/closed day.' }
  }

  // 5. Validate Working Hours
  const { data: workingHour } = await db
    .from('appointment_working_hours')
    .select('*')
    .eq('account_id', accountId)
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true)
    .or(staffId ? `staff_id.eq.${staffId},staff_id.is.null` : 'staff_id.is.null')
    .order('staff_id', { ascending: false }) // prioritize staff-specific settings
    .limit(1)
    .maybeSingle()

  if (!workingHour) {
    return { available: false, reason: 'We are closed on this day of the week.' }
  }

  const openMinutes = timeToMinutes(workingHour.opening_time)
  const closeMinutes = timeToMinutes(workingHour.closing_time)
  if (requestedMinutes < openMinutes || requestedMinutes >= closeMinutes) {
    return { available: false, reason: 'Time is outside our working hours.' }
  }

  // 6. Validate Breaks
  const { data: breaks } = await db
    .from('appointment_breaks')
    .select('*')
    .eq('account_id', accountId)
    .or(staffId ? `staff_id.eq.${staffId},staff_id.is.null` : 'staff_id.is.null')

  if (breaks && breaks.length > 0) {
    for (const brk of breaks) {
      if (brk.specific_date && brk.specific_date !== localDateStr) continue
      if (brk.day_of_week !== null && brk.day_of_week !== dayOfWeek) continue

      const breakStart = timeToMinutes(brk.start_time)
      const breakEnd = timeToMinutes(brk.end_time)
      if (requestedMinutes >= breakStart && requestedMinutes < breakEnd) {
        return { available: false, reason: 'Requested slot is during a scheduled break.' }
      }
    }
  }

  // 7. Validate Service Assigned Staff & Capacity
  let durationMinutes = settings?.booking_interval_minutes ?? 30
  if (serviceId) {
    const { data: service } = await db
      .from('appointment_services')
      .select('*')
      .eq('id', serviceId)
      .maybeSingle()

    if (service) {
      durationMinutes = service.duration_minutes || durationMinutes

      // Validate service daily capacity limit
      if (service.max_daily_capacity) {
        const { count } = await db
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('account_id', accountId)
          .eq('service_id', serviceId)
          .eq('status', 'confirmed')
          .gte('scheduled_at', `${localDateStr}T00:00:00Z`)
          .lte('scheduled_at', `${localDateStr}T23:59:59Z`)

        if (count && count >= service.max_daily_capacity) {
          return { available: false, reason: 'Service daily booking capacity reached.' }
        }
      }
    }
  }

  // 8. Validate Settings Daily/Hourly Limits
  if (settings?.max_daily_appointments) {
    const { count } = await db
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('status', 'confirmed')
      .gte('scheduled_at', `${localDateStr}T00:00:00Z`)
      .lte('scheduled_at', `${localDateStr}T23:59:59Z`)

    if (count && count >= settings.max_daily_appointments) {
      return { available: false, reason: 'Maximum daily appointments limit reached.' }
    }
  }

  if (settings?.max_hourly_appointments) {
    const hourStart = new Date(requestedDate.getTime() - 30 * 60 * 1000).toISOString()
    const hourEnd = new Date(requestedDate.getTime() + 30 * 60 * 1000).toISOString()
    const { count } = await db
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('status', 'confirmed')
      .gte('scheduled_at', hourStart)
      .lte('scheduled_at', hourEnd)

    if (count && count >= settings.max_hourly_appointments) {
      return { available: false, reason: 'Maximum hourly appointments limit reached.' }
    }
  }

  // 9. Fetch and Check Google Calendar Busy Slots
  try {
    const { data: gAcc } = await db
      .from('appointment_google_accounts')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle()

    if (gAcc) {
      const freshToken = await getFreshTokenForCalendarAccount(accountId)
      const timeMin = `${localDateStr}T00:00:00Z`
      const timeMax = `${localDateStr}T23:59:59Z`
      const busySlots = await fetchCalendarBusySlots(freshToken, gAcc.calendar_id, timeMin, timeMax)

      const slotStart = requestedTimeMs
      const slotEnd = slotStart + durationMinutes * 60 * 1000

      for (const slot of busySlots) {
        const busyStart = new Date(slot.start).getTime()
        const busyEnd = new Date(slot.end).getTime()
        // Overlap check
        if (slotStart < busyEnd && slotEnd > busyStart) {
          return { available: false, reason: 'Conflict with external Google Calendar event.' }
        }
      }
    }
  } catch (gErr) {
    console.error('[Booking Engine] Google calendar verification skipped:', gErr)
  }

  // 10. Check Existing Appointments in DB (Slot Conflict)
  const slotStart = requestedTimeMs
  const slotEnd = slotStart + durationMinutes * 60 * 1000

  const { data: conflicts } = await db
    .from('appointments')
    .select('id, scheduled_at, service_id, service:appointment_services(duration_minutes)')
    .eq('account_id', accountId)
    .eq('status', 'confirmed')
    .or(staffId ? `staff_id.eq.${staffId},staff_id.is.null` : 'staff_id.is.null')

  if (conflicts) {
    for (const c of conflicts) {
      const cStart = new Date(c.scheduled_at).getTime()
      const cDuration = (c.service as any)?.duration_minutes || settings?.booking_interval_minutes || 30
      const cEnd = cStart + cDuration * 60 * 1000

      if (slotStart < cEnd && slotEnd > cStart) {
        return { available: false, reason: 'Conflict with an existing confirmed appointment.' }
      }
    }
  }

  return { available: true }
}

export async function findAvailableSlots(
  accountId: string,
  dateStr: string, // YYYY-MM-DD
  serviceId?: string | null,
  staffId?: string | null
): Promise<string[]> {
  const db = supabaseAdmin()
  const { data: settings } = await db
    .from('appointment_settings')
    .select('booking_interval_minutes, timezone')
    .eq('account_id', accountId)
    .maybeSingle()

  const interval = settings?.booking_interval_minutes ?? 30
  const dateObj = new Date(`${dateStr}T09:00:00`)
  const dayOfWeek = dateObj.getDay()

  const { data: workingHour } = await db
    .from('appointment_working_hours')
    .select('*')
    .eq('account_id', accountId)
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true)
    .maybeSingle()

  if (!workingHour) return []

  // Pre-fetch Google Calendar busy slots ONCE for the whole day (performance optimization)
  let googleBusySlots: { start: string; end: string }[] = []
  try {
    const { data: gAcc } = await db
      .from('appointment_google_accounts')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle()

    if (gAcc) {
      const freshToken = await getFreshTokenForCalendarAccount(accountId)
      const timeMin = `${dateStr}T00:00:00Z`
      const timeMax = `${dateStr}T23:59:59Z`
      googleBusySlots = await fetchCalendarBusySlots(freshToken, gAcc.calendar_id, timeMin, timeMax)
    }
  } catch (gErr) {
    console.error('[Booking Engine] Could not pre-fetch Google busy slots for findAvailableSlots:', gErr)
  }

  const openMinutes = timeToMinutes(workingHour.opening_time)
  const closeMinutes = timeToMinutes(workingHour.closing_time)
  const availableSlots: string[] = []

  // Get service duration once
  let slotDuration = interval
  if (serviceId) {
    const { data: srv } = await db
      .from('appointment_services')
      .select('duration_minutes')
      .eq('id', serviceId)
      .maybeSingle()
    if (srv?.duration_minutes) slotDuration = srv.duration_minutes
  }

  for (let min = openMinutes; min < closeMinutes; min += interval) {
    const hh = String(Math.floor(min / 60)).padStart(2, '0')
    const mm = String(min % 60).padStart(2, '0')
    const targetISO = `${dateStr}T${hh}:${mm}:00`

    // Pass pre-fetched busy slots to avoid repeated Google API calls
    const status = await checkAvailabilityWithBusySlots(accountId, targetISO, serviceId, staffId, googleBusySlots, slotDuration)
    if (status.available) {
      availableSlots.push(targetISO)
    }
  }

  return availableSlots
}

// Internal helper: checkAvailability with pre-fetched Google busy slots
async function checkAvailabilityWithBusySlots(
  accountId: string,
  dateTimeStr: string,
  serviceId?: string | null,
  staffId?: string | null,
  googleBusySlots?: { start: string; end: string }[],
  durationOverride?: number
): Promise<SlotAvailability> {
  const db = supabaseAdmin()
  const requestedDate = new Date(dateTimeStr)
  const requestedTimeMs = requestedDate.getTime()

  const { data: settings } = await db
    .from('appointment_settings')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle()

  const now = new Date()
  const minBookingNoticeHours = settings?.min_booking_notice_hours ?? 2
  const noticeMinTime = now.getTime() + minBookingNoticeHours * 60 * 60 * 1000
  if (requestedTimeMs < noticeMinTime) return { available: false, reason: 'Too close to current time.' }

  const localDateStr = requestedDate.toISOString().substring(0, 10)
  const dayOfWeek = requestedDate.getDay()
  const requestedMinutes = requestedDate.getHours() * 60 + requestedDate.getMinutes()

  const { data: holiday } = await db
    .from('appointment_holidays')
    .select('id')
    .eq('account_id', accountId)
    .eq('holiday_date', localDateStr)
    .maybeSingle()
  if (holiday) return { available: false, reason: 'Holiday.' }

  const { data: workingHour } = await db
    .from('appointment_working_hours')
    .select('*')
    .eq('account_id', accountId)
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true)
    .maybeSingle()
  if (!workingHour) return { available: false, reason: 'Closed this day.' }

  const openMinutes = timeToMinutes(workingHour.opening_time)
  const closeMinutes = timeToMinutes(workingHour.closing_time)
  if (requestedMinutes < openMinutes || requestedMinutes >= closeMinutes) {
    return { available: false, reason: 'Outside working hours.' }
  }

  const durationMinutes = durationOverride ?? settings?.booking_interval_minutes ?? 30
  const slotStart = requestedTimeMs
  const slotEnd = slotStart + durationMinutes * 60 * 1000

  // Check pre-fetched Google busy slots
  if (googleBusySlots && googleBusySlots.length > 0) {
    for (const slot of googleBusySlots) {
      const busyStart = new Date(slot.start).getTime()
      const busyEnd = new Date(slot.end).getTime()
      if (slotStart < busyEnd && slotEnd > busyStart) {
        return { available: false, reason: 'Conflict with Google Calendar event.' }
      }
    }
  }

  // Check existing DB appointments
  const { data: conflicts } = await db
    .from('appointments')
    .select('id, scheduled_at, service:appointment_services(duration_minutes)')
    .eq('account_id', accountId)
    .eq('status', 'confirmed')
    .or(staffId ? `staff_id.eq.${staffId},staff_id.is.null` : 'staff_id.is.null')

  if (conflicts) {
    for (const c of conflicts) {
      const cStart = new Date(c.scheduled_at).getTime()
      const cDuration = (c.service as any)?.duration_minutes || durationMinutes
      const cEnd = cStart + cDuration * 60 * 1000
      if (slotStart < cEnd && slotEnd > cStart) {
        return { available: false, reason: 'Conflict with existing appointment.' }
      }
    }
  }

  return { available: true }
}

// 11. Google Sheets Production Sync
export async function syncAppointmentToSheets(accountId: string, appointmentId: string): Promise<void> {
  const db = supabaseAdmin()
  try {
    const { data: settings } = await db
      .from('appointment_settings')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle()

    if (!settings?.sheets_sync_enabled) return

    const { data: appt } = await db
      .from('appointments')
      .select('*, staff:appointment_staff(name), service:appointment_services(name)')
      .eq('id', appointmentId)
      .maybeSingle()

    if (!appt) return

    // Get Google Sheets connection (reuse existing google_sheets_config)
    const { data: sheetsConfig } = await db
      .from('google_sheets_config')
      .select('linked_accounts, linked_spreadsheets')
      .eq('account_id', accountId)
      .maybeSingle()

    if (!sheetsConfig?.linked_accounts || !sheetsConfig?.linked_spreadsheets) {
      console.warn('[Sheets Sync] No Google Sheets config found for account', accountId)
      return
    }

    let accounts: any[] = []
    let sheets: any[] = []
    try {
      accounts = Array.isArray(sheetsConfig.linked_accounts)
        ? sheetsConfig.linked_accounts
        : JSON.parse(sheetsConfig.linked_accounts as any)
      sheets = Array.isArray(sheetsConfig.linked_spreadsheets)
        ? sheetsConfig.linked_spreadsheets
        : JSON.parse(sheetsConfig.linked_spreadsheets as any)
    } catch (parseErr) {
      console.error('[Sheets Sync] Failed to parse linked accounts/sheets:', parseErr)
      return
    }

    if (accounts.length === 0 || sheets.length === 0) return

    const linkedSheet = sheets[0]
    const googleAccountId = linkedSheet.google_account_id || accounts[0].id

    // Import getFreshTokenForAccount to get valid access token
    const { getFreshTokenForAccount } = await import('@/lib/whatsapp/google-sheets')
    const token = await getFreshTokenForAccount(accountId, googleAccountId)

    // Format appointment date/time
    const scheduledAt = new Date(appt.scheduled_at)
    const dateStr = scheduledAt.toLocaleDateString('ar-SA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' })
    const timeStr = scheduledAt.toLocaleTimeString('ar-SA', { timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit' })
    const createdAt = new Date(appt.created_at || new Date()).toLocaleString('ar-SA', { timeZone: 'Asia/Baghdad' })

    const rowValues = [
      appt.patient_name || '',
      appt.patient_phone || '',
      dateStr,
      timeStr,
      (appt.staff as any)?.name || '',
      (appt.service as any)?.name || '',
      appt.status || 'confirmed',
      appt.calendar_event_id || '',
      createdAt,
      appt.booking_source || 'dashboard'
    ]

    const sheetName = settings.sheets_worksheet_name || 'Appointments'
    const spreadsheetId = linkedSheet.spreadsheet_id || settings.sheets_spreadsheet_id

    if (!spreadsheetId) {
      console.warn('[Sheets Sync] No spreadsheet ID configured.')
      return
    }

    const appendRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:J:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: [rowValues] }),
      }
    )

    if (appendRes.ok) {
      console.log('[Sheets Sync] Successfully appended appointment row for:', appt.patient_name)
      // Log success
      try {
        await db.from('appointment_logs').insert({
          account_id: accountId,
          appointment_id: appointmentId,
          operation: 'sheets_synced',
          description: `Appointment synced to Google Sheets (${sheetName}) for ${appt.patient_name}.`
        })
      } catch (_logErr) {}
    } else {
      const errBody = await appendRes.text()
      console.error('[Sheets Sync] Google Sheets append failed:', errBody)
    }
  } catch (err: any) {
    console.error('[Sheets Sync] Failed to sync appointment to sheets:', err.message)
  }
}

