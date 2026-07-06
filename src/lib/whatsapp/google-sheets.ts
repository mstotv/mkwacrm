import { supabaseAdmin } from '@/lib/automations/admin-client'
import { encrypt, decrypt } from '@/lib/whatsapp/encryption'

export interface GoogleAccount {
  id: string
  email: string
  name: string
  avatar_url: string
  access_token: string
  refresh_token: string
  expires_at: string
  calendar_id?: string
}

export interface LinkedSpreadsheet {
  id: string
  google_account_id: string
  spreadsheet_id: string
  title: string
  url: string
  created_at: string
}

export async function getGoogleSheetsConfig(accountId: string) {
  const db = supabaseAdmin()
  const { data: config } = await db
    .from('google_sheets_config')
    .select('linked_accounts, linked_spreadsheets')
    .eq('account_id', accountId)
    .maybeSingle()

  if (!config) return { accounts: [], sheets: [] }

  let accounts: GoogleAccount[] = []
  let sheets: LinkedSpreadsheet[] = []

  if (config.linked_accounts) {
    const rawAccounts = Array.isArray(config.linked_accounts) 
      ? config.linked_accounts 
      : JSON.parse(config.linked_accounts as any)

    accounts = rawAccounts.map((a: any) => {
      let decryptedAccess = ''
      let decryptedRefresh = ''
      try {
        decryptedAccess = a.access_token ? decrypt(a.access_token) : ''
      } catch (e) {
        decryptedAccess = a.access_token || '' // fallback if not encrypted
      }
      try {
        decryptedRefresh = a.refresh_token ? decrypt(a.refresh_token) : ''
      } catch (e) {
        decryptedRefresh = a.refresh_token || '' // fallback if not encrypted
      }
      return {
        ...a,
        access_token: decryptedAccess,
        refresh_token: decryptedRefresh
      }
    })
  }

  if (config.linked_spreadsheets) {
    sheets = Array.isArray(config.linked_spreadsheets)
      ? config.linked_spreadsheets
      : JSON.parse(config.linked_spreadsheets as any)
  }

  return { accounts, sheets }
}

export async function saveGoogleSheetsConfig(accountId: string, accounts: GoogleAccount[], sheets: LinkedSpreadsheet[]) {
  const db = supabaseAdmin()

  // Encrypt sensitive tokens before saving
  const encryptedAccounts = accounts.map(a => ({
    ...a,
    access_token: a.access_token ? encrypt(a.access_token) : '',
    refresh_token: a.refresh_token ? encrypt(a.refresh_token) : ''
  }))

  const { error } = await db
    .from('google_sheets_config')
    .upsert({
      account_id: accountId,
      linked_accounts: encryptedAccounts as any,
      linked_spreadsheets: sheets as any,
      spreadsheet_id: 'json_store',
      sheet_name: 'multi_account'
    }, { onConflict: 'account_id' })

  if (error) throw error
}

export async function getFreshTokenForAccount(accountId: string, googleAccountId: string): Promise<string> {
  const { accounts, sheets } = await getGoogleSheetsConfig(accountId)
  const accountIndex = accounts.findIndex(a => a.id === googleAccountId)
  if (accountIndex === -1) {
    throw new Error('Google Account not found or disconnected.')
  }

  const account = accounts[accountIndex]
  const isExpired = account.expires_at ? new Date(account.expires_at).getTime() < Date.now() + 30000 : true

  if (!isExpired && account.access_token) {
    return account.access_token
  }

  if (!account.refresh_token) {
    throw new Error(`Token expired and no refresh token available for account ${account.email}.`)
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
      refresh_token: account.refresh_token,
      grant_type: 'refresh_token',
    }).toString()
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Failed to refresh Google token for ${account.email}: ${data.error_description || data.error}`)
  }

  account.access_token = data.access_token
  account.expires_at = new Date(Date.now() + data.expires_in * 1000).toISOString()
  if (data.refresh_token) {
    account.refresh_token = data.refresh_token
  }

  accounts[accountIndex] = account
  await saveGoogleSheetsConfig(accountId, accounts, sheets)

  return account.access_token
}
