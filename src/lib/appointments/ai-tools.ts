import { supabaseAdmin } from '@/lib/automations/admin-client'
import { checkAvailability, findAvailableSlots, syncAppointmentToSheets } from './booking-engine'
import { getFreshTokenForCalendarAccount, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from './google-calendar'
import { notifyAppointmentOnceViaTelegram } from '@/lib/notifications/telegram'

// 1. OpenAI-style Tool Definitions
export const APPOINTMENT_AI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'getDoctors',
      description: 'Get the list of doctors / staff members and their IDs.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getServices',
      description: 'Get the list of services with duration, price, and IDs.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getWorkingHours',
      description: 'Get regular opening and closing working hours of the clinic.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'checkAvailability',
      description: 'Verify if a specific date and time slot is available for booking.',
      parameters: {
        type: 'object',
        properties: {
          dateTime: { type: 'string', description: 'ISO date time string (e.g. YYYY-MM-DDTHH:MM)' },
          serviceId: { type: 'string', description: 'UUID of the service' },
          staffId: { type: 'string', description: 'UUID of the staff/doctor' }
        },
        required: ['dateTime']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'findAvailableSlots',
      description: 'Find all available open time slots on a specific date.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date string (YYYY-MM-DD)' },
          serviceId: { type: 'string', description: 'UUID of the service' },
          staffId: { type: 'string', description: 'UUID of the staff/doctor' }
        },
        required: ['date']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createAppointment',
      description: 'Book and confirm a new appointment for a patient.',
      parameters: {
        type: 'object',
        properties: {
          patientName: { type: 'string', description: 'Full name of the patient' },
          patientPhone: { type: 'string', description: 'Phone number of the patient' },
          dateTime: { type: 'string', description: 'ISO date time string (YYYY-MM-DDTHH:MM)' },
          serviceId: { type: 'string', description: 'UUID of the service' },
          staffId: { type: 'string', description: 'UUID of the staff/doctor' }
        },
        required: ['patientName', 'dateTime']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getAppointment',
      description: 'Look up an existing appointment by patient phone number.',
      parameters: {
        type: 'object',
        properties: {
          patientPhone: { type: 'string', description: 'Patient phone number' }
        },
        required: ['patientPhone']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'updateAppointment',
      description: 'Update properties of an existing appointment.',
      parameters: {
        type: 'object',
        properties: {
          appointmentId: { type: 'string', description: 'UUID of the appointment' },
          patientName: { type: 'string' },
          patientPhone: { type: 'string' }
        },
        required: ['appointmentId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cancelAppointment',
      description: 'Cancel a scheduled appointment.',
      parameters: {
        type: 'object',
        properties: {
          appointmentId: { type: 'string', description: 'UUID of the appointment to cancel' }
        },
        required: ['appointmentId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'rescheduleAppointment',
      description: 'Reschedule an existing appointment to a new date and time.',
      parameters: {
        type: 'object',
        properties: {
          appointmentId: { type: 'string', description: 'UUID of the appointment' },
          newDateTime: { type: 'string', description: 'New ISO date time string (YYYY-MM-DDTHH:MM)' }
        },
        required: ['appointmentId', 'newDateTime']
      }
    }
  },
  {
    type: 'type',
    function: {
      name: 'deleteAppointment',
      description: 'Permanently delete an appointment record.',
      parameters: {
        type: 'object',
        properties: {
          appointmentId: { type: 'string', description: 'UUID of the appointment' }
        },
        required: ['appointmentId']
      }
    }
  }
]

// 2. Tool Execution Dispatcher
export async function executeAppointmentTool(
  accountId: string,
  contactId: string,
  conversationId: string,
  contactName: string,
  contactPhone: string,
  toolName: string,
  args: any
): Promise<any> {
  const db = supabaseAdmin()
  console.log(`[AI Tool Exec] ${toolName} for account ${accountId} with args:`, args)

  try {
    switch (toolName) {
      case 'getDoctors': {
        const { data } = await db
          .from('appointment_staff')
          .select('id, name, email, is_active')
          .eq('account_id', accountId)
          .eq('is_active', true)
        return { doctors: data || [] }
      }

      case 'getServices': {
        const { data } = await db
          .from('appointment_services')
          .select('id, name, duration_minutes, price, description')
          .eq('account_id', accountId)
        return { services: data || [] }
      }

      case 'getWorkingHours': {
        const { data } = await db
          .from('appointment_working_hours')
          .select('day_of_week, opening_time, closing_time, is_active')
          .eq('account_id', accountId)
          .eq('is_active', true)
        return { workingHours: data || [] }
      }

      case 'checkAvailability': {
        const result = await checkAvailability(accountId, args.dateTime, args.serviceId, args.staffId)
        return result
      }

      case 'findAvailableSlots': {
        const slots = await findAvailableSlots(accountId, args.date, args.serviceId, args.staffId)
        return { availableSlots: slots }
      }

      case 'createAppointment': {
        const { patientName, patientPhone, dateTime, serviceId, staffId } = args
        
        // Check availability
        const avail = await checkAvailability(accountId, dateTime, serviceId, staffId)
        if (!avail.available) {
          return { error: `Slot is unavailable: ${avail.reason}` }
        }

        // Get duration
        let duration = 30
        let serviceName = 'General Appointment'
        if (serviceId) {
          const { data: srv } = await db
            .from('appointment_services')
            .select('name, duration_minutes')
            .eq('id', serviceId)
            .maybeSingle()
          if (srv) {
            duration = srv.duration_minutes
            serviceName = srv.name
          }
        }

        let staffName = 'Any Staff'
        if (staffId) {
          const { data: stf } = await db
            .from('appointment_staff')
            .select('name')
            .eq('id', staffId)
            .maybeSingle()
          if (stf) staffName = stf.name
        }

        // Connect to Google Calendar
        let calendarEventId: string | null = null
        let htmlLink: string | undefined
        try {
          const { data: gAcc } = await db
            .from('appointment_google_accounts')
            .select('*')
            .eq('account_id', accountId)
            .maybeSingle()

          if (gAcc) {
            const freshToken = await getFreshTokenForCalendarAccount(accountId)
            const summary = `${serviceName} with ${staffName}`
            const description = `Patient: ${patientName}\nPhone: ${patientPhone || contactPhone}\nBooked automatically via WhatsApp AI.`
            const gEvent = await createCalendarEvent(freshToken, gAcc.calendar_id, summary, description, dateTime, duration)
            if (gEvent?.id) {
              calendarEventId = gEvent.id
              htmlLink = gEvent.htmlLink
            }
          }
        } catch (gErr) {
          console.error('[AI Tool] Google calendar sync failed:', gErr)
        }

        // Save DB
        const { data: appt, error } = await db
          .from('appointments')
          .insert({
            account_id: accountId,
            contact_id: contactId,
            conversation_id: conversationId,
            patient_name: patientName,
            patient_phone: patientPhone || contactPhone,
            scheduled_at: dateTime,
            staff_id: staffId || null,
            service_id: serviceId || null,
            status: 'confirmed',
            calendar_event_id: calendarEventId,
            booking_source: 'whatsapp',
            created_by_ai: true
          })
          .select()
          .single()

        if (error) throw error

        // Sync sheet
        await syncAppointmentToSheets(accountId, appt.id)

        // Send Telegram Notification once
        try {
          await notifyAppointmentOnceViaTelegram(
            accountId,
            contactName,
            contactPhone,
            dateTime,
            `الخدمة: ${serviceName} | الطبيب: ${staffName}`,
            patientName,
            patientPhone || contactPhone,
            calendarEventId || undefined,
            htmlLink
          )
        } catch (tErr) {
          console.error('[AI Tool] Telegram notify failed:', tErr)
        }

        return { success: true, appointment: appt }
      }

      case 'getAppointment': {
        const { data } = await db
          .from('appointments')
          .select('*, staff:appointment_staff(name), service:appointment_services(name)')
          .eq('account_id', accountId)
          .eq('patient_phone', args.patientPhone)
          .eq('status', 'confirmed')
          .order('scheduled_at', { ascending: true })
        return { appointments: data || [] }
      }

      case 'updateAppointment': {
        const { appointmentId, patientName, patientPhone } = args
        const updates: any = { updated_at: new Date().toISOString() }
        if (patientName !== undefined) updates.patient_name = patientName
        if (patientPhone !== undefined) updates.patient_phone = patientPhone

        const { data, error } = await db
          .from('appointments')
          .update(updates)
          .eq('id', appointmentId)
          .eq('account_id', accountId)
          .select()
          .single()

        if (error) throw error
        return { success: true, appointment: data }
      }

      case 'cancelAppointment': {
        const { appointmentId } = args
        
        const { data: current } = await db
          .from('appointments')
          .select('*')
          .eq('id', appointmentId)
          .eq('account_id', accountId)
          .maybeSingle()

        if (!current) return { error: 'Appointment not found.' }

        // Cancel Google Event
        if (current.calendar_event_id) {
          try {
            const { data: gAcc } = await db
              .from('appointment_google_accounts')
              .select('*')
              .eq('account_id', accountId)
              .maybeSingle()

            if (gAcc) {
              const freshToken = await getFreshTokenForCalendarAccount(accountId)
              await deleteCalendarEvent(freshToken, gAcc.calendar_id, current.calendar_event_id)
            }
          } catch (gErr) {
            console.error('[AI Tool] Google calendar delete failed:', gErr)
          }
        }

        const { data, error } = await db
          .from('appointments')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', appointmentId)
          .select()
          .single()

        if (error) throw error
        return { success: true, appointment: data }
      }

      case 'rescheduleAppointment': {
        const { appointmentId, newDateTime } = args

        const { data: current } = await db
          .from('appointments')
          .select('*')
          .eq('id', appointmentId)
          .eq('account_id', accountId)
          .maybeSingle()

        if (!current) return { error: 'Appointment not found.' }

        // Check availability
        const avail = await checkAvailability(accountId, newDateTime, current.service_id, current.staff_id)
        if (!avail.available) {
          return { error: `Slot is unavailable: ${avail.reason}` }
        }

        // Reschedule Google Event
        if (current.calendar_event_id) {
          try {
            const { data: gAcc } = await db
              .from('appointment_google_accounts')
              .select('*')
              .eq('account_id', accountId)
              .maybeSingle()

            if (gAcc) {
              const freshToken = await getFreshTokenForCalendarAccount(accountId)
              let duration = 30
              if (current.service_id) {
                const { data: srv } = await db
                  .from('appointment_services')
                  .select('duration_minutes')
                  .eq('id', current.service_id)
                  .maybeSingle()
                if (srv) duration = srv.duration_minutes
              }
              await updateCalendarEvent(freshToken, gAcc.calendar_id, current.calendar_event_id, 'Rescheduled Appointment', 'Rescheduled via WhatsApp AI', newDateTime, duration)
            }
          } catch (gErr) {
            console.error('[AI Tool] Google calendar reschedule failed:', gErr)
          }
        }

        const { data, error } = await db
          .from('appointments')
          .update({
            scheduled_at: newDateTime,
            status: 'rescheduled',
            updated_at: new Date().toISOString()
          })
          .eq('id', appointmentId)
          .select()
          .single()

        if (error) throw error
        return { success: true, appointment: data }
      }

      case 'deleteAppointment': {
        const { appointmentId } = args

        const { data: current } = await db
          .from('appointments')
          .select('calendar_event_id')
          .eq('id', appointmentId)
          .eq('account_id', accountId)
          .maybeSingle()

        if (current?.calendar_event_id) {
          try {
            const { data: gAcc } = await db
              .from('appointment_google_accounts')
              .select('*')
              .eq('account_id', accountId)
              .maybeSingle()

            if (gAcc) {
              const freshToken = await getFreshTokenForCalendarAccount(accountId)
              await deleteCalendarEvent(freshToken, gAcc.calendar_id, current.calendar_event_id)
            }
          } catch (gErr) {
            console.error('[AI Tool] Google calendar delete failed:', gErr)
          }
        }

        const { error } = await db
          .from('appointments')
          .delete()
          .eq('id', appointmentId)

        if (error) throw error
        return { success: true }
      }

      default:
        return { error: 'Unknown tool requested.' }
    }
  } catch (err: any) {
    console.error(`[AI Tool Exec Error] Exception executing ${toolName}:`, err.message)
    return { error: err.message }
  }
}
