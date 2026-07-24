import { supabaseAdmin } from '@/lib/automations/admin-client'
import { encrypt, decrypt } from '@/lib/whatsapp/encryption'

export interface GoogleCalendarEvent {
  id: string
  htmlLink: string
  status: string
}

export async function getFreshTokenForCalendarAccount(accountId: string): Promise<string> {
  const db = supabaseAdmin()
  const { data: acc, error } = await db
    .from('appointment_google_accounts')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle()

  if (error || !acc) {
    throw new Error('Google Calendar Account not connected for this account.')
  }

  let decryptedAccess = ''
  let decryptedRefresh = ''
  try {
    decryptedAccess = acc.access_token ? decrypt(acc.access_token) : ''
  } catch (e) {
    decryptedAccess = acc.access_token
  }
  try {
    decryptedRefresh = acc.refresh_token ? decrypt(acc.refresh_token) : ''
  } catch (e) {
    decryptedRefresh = acc.refresh_token
  }

  const isExpired = acc.expires_at ? new Date(acc.expires_at).getTime() < Date.now() + 30000 : true

  if (!isExpired && decryptedAccess) {
    return decryptedAccess
  }

  if (!decryptedRefresh) {
    throw new Error(`Token expired and no refresh token available for calendar account ${acc.email}.`)
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials missing on the server.')
  }

  // Refresh token
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: decryptedRefresh,
      grant_type: 'refresh_token',
    }).toString()
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Failed to refresh Google Calendar token for ${acc.email}: ${data.error_description || data.error}`)
  }

  const newAccess = data.access_token
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()
  const encryptedAccess = encrypt(newAccess)
  
  const updatePayload: any = {
    access_token: encryptedAccess,
    expires_at: expiresAt,
    updated_at: new Date().toISOString()
  }

  if (data.refresh_token) {
    updatePayload.refresh_token = encrypt(data.refresh_token)
  }

  await db
    .from('appointment_google_accounts')
    .update(updatePayload)
    .eq('account_id', accountId)

  return newAccess
}

export async function fetchCalendarBusySlots(
  token: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<{ start: string; end: string }[]> {
  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        items: [{ id: calendarId }]
      })
    })

    const data = await res.json()
    if (!res.ok) {
      console.error('[Google Calendar API] FreeBusy error:', data)
      return []
    }

    const busy = data.calendars?.[calendarId]?.busy || []
    return busy.map((b: any) => ({
      start: b.start,
      end: b.end
    }))
  } catch (err) {
    console.error('[Google Calendar API] Failed to fetch busy slots:', err)
    return []
  }
}

export async function createCalendarEvent(
  token: string,
  calendarId: string,
  summary: string,
  description: string,
  scheduledAt: string,
  durationMinutes: number
): Promise<GoogleCalendarEvent | null> {
  try {
    const startDateTime = new Date(scheduledAt)
    const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60 * 1000)

    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        summary,
        description,
        start: {
          dateTime: startDateTime.toISOString(),
          timeZone: 'Asia/Baghdad'
        },
        end: {
          dateTime: endDateTime.toISOString(),
          timeZone: 'Asia/Baghdad'
        }
      })
    })

    const data = await res.json()
    if (!res.ok) {
      console.error('[Google Calendar API] Create event failed:', data)
      return null
    }

    return {
      id: data.id,
      htmlLink: data.htmlLink,
      status: data.status
    }
  } catch (err) {
    console.error('[Google Calendar API] Error creating event:', err)
    return null
  }
}

export async function updateCalendarEvent(
  token: string,
  calendarId: string,
  eventId: string,
  summary: string,
  description: string,
  scheduledAt: string,
  durationMinutes: number
): Promise<GoogleCalendarEvent | null> {
  try {
    const startDateTime = new Date(scheduledAt)
    const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60 * 1000)

    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        summary,
        description,
        start: {
          dateTime: startDateTime.toISOString(),
          timeZone: 'Asia/Baghdad'
        },
        end: {
          dateTime: endDateTime.toISOString(),
          timeZone: 'Asia/Baghdad'
        }
      })
    })

    const data = await res.json()
    if (!res.ok) {
      console.error('[Google Calendar API] Update event failed:', data)
      return null
    }

    return {
      id: data.id,
      htmlLink: data.htmlLink,
      status: data.status
    }
  } catch (err) {
    console.error('[Google Calendar API] Error updating event:', err)
    return null
  }
}

export async function deleteCalendarEvent(
  token: string,
  calendarId: string,
  eventId: string
): Promise<boolean> {
  try {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (res.status === 204 || res.ok) {
      return true
    }

    const data = await res.json().catch(() => ({}))
    console.error('[Google Calendar API] Delete event failed:', data)
    return false
  } catch (err) {
    console.error('[Google Calendar API] Error deleting event:', err)
    return false
  }
}
