import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGoogleSheetsConfig, saveGoogleSheetsConfig, getFreshTokenForAccount, LinkedSpreadsheet } from '@/lib/whatsapp/google-sheets'

function extractSpreadsheetId(input: string): string {
  const match = input.match(/\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : input.trim()
}

export async function GET() {
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

    const { accounts, sheets } = await getGoogleSheetsConfig(profile.account_id)

    // Mask sensitive tokens before sending to client
    const safeAccounts = accounts.map(a => ({
      id: a.id,
      email: a.email,
      name: a.name,
      avatar_url: a.avatar_url,
      connected: true,
      calendar_id: a.calendar_id || 'primary'
    }))

    return NextResponse.json({
      accounts: safeAccounts,
      sheets,
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
    const { action } = body

    const { accounts, sheets } = await getGoogleSheetsConfig(profile.account_id)

    if (action === 'link_existing') {
      const { urlOrId, googleAccountId } = body
      if (!urlOrId || !googleAccountId) {
        return NextResponse.json({ error: 'Spreadsheet Link/ID and Google Account are required' }, { status: 400 })
      }

      const spreadsheetId = extractSpreadsheetId(urlOrId)
      const token = await getFreshTokenForAccount(profile.account_id, googleAccountId)

      // Fetch spreadsheet title from Google API
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) {
        return NextResponse.json({ error: data.error?.message || 'Spreadsheet not found or access denied.' }, { status: res.status })
      }

      const title = data.properties?.title || 'Untitled Spreadsheet'

      const newSheet: LinkedSpreadsheet = {
        id: crypto.randomUUID(),
        google_account_id: googleAccountId,
        spreadsheet_id: spreadsheetId,
        title,
        url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        created_at: new Date().toISOString()
      }

      sheets.push(newSheet)
      await saveGoogleSheetsConfig(profile.account_id, accounts, sheets)
      return NextResponse.json({ success: true, sheet: newSheet })
    }

    if (action === 'create_new') {
      const { title, googleAccountId } = body
      if (!title || !googleAccountId) {
        return NextResponse.json({ error: 'Title and Google Account are required' }, { status: 400 })
      }

      const token = await getFreshTokenForAccount(profile.account_id, googleAccountId)

      // Create new spreadsheet via Google Sheets API
      const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: { title }
        })
      })

      const data = await res.json()
      if (!res.ok) {
        return NextResponse.json({ error: data.error?.message || 'Failed to create spreadsheet' }, { status: res.status })
      }

      const spreadsheetId = data.spreadsheetId
      const newSheet: LinkedSpreadsheet = {
        id: crypto.randomUUID(),
        google_account_id: googleAccountId,
        spreadsheet_id: spreadsheetId,
        title,
        url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        created_at: new Date().toISOString()
      }

      sheets.push(newSheet)
      await saveGoogleSheetsConfig(profile.account_id, accounts, sheets)
      return NextResponse.json({ success: true, sheet: newSheet })
    }

    if (action === 'unlink_sheet') {
      const { sheetId } = body
      const updatedSheets = sheets.filter(s => s.id !== sheetId)
      await saveGoogleSheetsConfig(profile.account_id, accounts, updatedSheets)
      return NextResponse.json({ success: true })
    }

    if (action === 'save_calendar_id') {
      const { googleAccountId, calendarId } = body
      if (!googleAccountId || !calendarId) {
        return NextResponse.json({ error: 'Google Account and Calendar ID are required' }, { status: 400 })
      }
      const accIdx = accounts.findIndex(a => a.id === googleAccountId)
      if (accIdx !== -1) {
        accounts[accIdx].calendar_id = calendarId
        await saveGoogleSheetsConfig(profile.account_id, accounts, sheets)
        return NextResponse.json({ success: true })
      }
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    if (action === 'unlink_account') {
      const { googleAccountId } = body
      const updatedAccounts = accounts.filter(a => a.id !== googleAccountId)
      // Also unlink sheets linked to this account
      const updatedSheets = sheets.filter(s => s.google_account_id !== googleAccountId)
      await saveGoogleSheetsConfig(profile.account_id, updatedAccounts, updatedSheets)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
