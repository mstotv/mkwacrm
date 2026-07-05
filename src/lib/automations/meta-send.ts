import { sendTextMessage, sendTemplateMessage } from '@/lib/whatsapp/meta-api'
import { sendEvolutionTextMessage } from '@/lib/whatsapp/evolution-api'
import { decrypt } from '@/lib/whatsapp/encryption'
import {
  sanitizePhoneForMeta,
  isValidE164,
  phoneVariants,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils'
import { supabaseAdmin } from './admin-client'

// ------------------------------------------------------------
// Automation-side sender (Meta Cloud API + Evolution API).
//
// Mirrors the logic in src/app/api/whatsapp/send/route.ts but uses
// the service-role client (engine has no cookies) and accepts the
// user / conversation / contact identifiers the engine already has
// on hand. Kept here (rather than refactoring the user-facing send
// route) to avoid risk to the working manual-send path — they can
// converge in a later refactor.
//
// Connection-type routing: the whatsapp_config row carries a
// `connection_type` column ('meta' | 'evolution'). When set to
// 'evolution', sends go through the Evolution REST API instead of
// Meta's Cloud API — same pattern used in /api/whatsapp/send and
// the auto-responder.
// ------------------------------------------------------------

interface SendTextArgs {
  /** Account-level tenancy key. Drives contact + whatsapp_config
   *  lookups so an automation authored by user A still sends through
   *  the WhatsApp number user B saved on the same account. */
  accountId: string
  /** Original author of the automation/flow — used for INSERT audit
   *  columns (messages.sender_id-ish) and for resolving the agent's
   *  identity in logs. Not consulted for tenancy. */
  userId: string
  conversationId: string
  contactId: string
  text: string
}

interface SendTemplateArgs {
  accountId: string
  userId: string
  conversationId: string
  contactId: string
  templateName: string
  language?: string
  params?: string[]
}

export async function engineSendText(args: SendTextArgs): Promise<{ whatsapp_message_id: string }> {
  return engineSend({ ...args, kind: 'text' })
}

export async function engineSendTemplate(
  args: SendTemplateArgs,
): Promise<{ whatsapp_message_id: string }> {
  return engineSend({ ...args, kind: 'template' })
}

type SendInput =
  | (SendTextArgs & { kind: 'text' })
  | (SendTemplateArgs & { kind: 'template' })

async function engineSend(input: SendInput): Promise<{ whatsapp_message_id: string }> {
  const db = supabaseAdmin()

  // Scope the contact + config lookups by account_id, not user_id.
  // The engine uses the service-role client (bypassing RLS); without
  // this filter, an authenticated user could fire their own
  // automations against another tenant's contact UUID and send via
  // their own WhatsApp config to that contact's phone. The 017
  // migration moved both tables to account-scoped tenancy, so the
  // check is the same defense-in-depth as before, just keyed on the
  // new tenancy column.
  const { data: contact, error: contactErr } = await db
    .from('contacts')
    .select('id, phone')
    .eq('id', input.contactId)
    .eq('account_id', input.accountId)
    .maybeSingle()
  if (contactErr || !contact?.phone) {
    throw new Error('contact not found for this account')
  }

  const sanitized = sanitizePhoneForMeta(contact.phone)
  if (!isValidE164(sanitized)) {
    throw new Error(`contact phone invalid: ${contact.phone}`)
  }

  const { data: config, error: configErr } = await db
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', input.accountId)
    .single()
  if (configErr || !config) {
    throw new Error('WhatsApp not configured for this account')
  }

  const accessToken = decrypt(config.access_token)
  const isEvolution = config.connection_type === 'evolution'

  // ── Build the per-phone attempt function ──────────────────────
  // Evolution and Meta have different send APIs; the attempt closure
  // hides the difference so the retry loop below is identical.
  const attempt = async (phone: string): Promise<string> => {
    if (isEvolution) {
      // Evolution API path — send everything as plain text.
      // Templates are rendered as text because Evolution uses
      // regular WhatsApp (Baileys), not Meta's Business API, so
      // there is no concept of pre-approved template sends.
      let textToSend = ''
      if (input.kind === 'template') {
        // Build a human-readable text from the template name +
        // any provided params, since we can't send a Meta-style
        // template via Evolution.
        const paramList = input.params?.length
          ? ` (${input.params.join(', ')})`
          : ''
        textToSend = `[Template: ${input.templateName}]${paramList}`
        console.log(
          '[automations] Evolution: template send_template rendered as text:',
          input.templateName,
        )
      } else {
        textToSend = input.text
      }
      const r = await sendEvolutionTextMessage(
        config.phone_number_id, // Evolution instance name
        accessToken,            // Evolution instance token
        phone,
        textToSend,
        config.evolution_api_url, // Custom Evolution API URL
      )
      return r.messageId
    }

    // Meta Cloud API path — original behaviour, unchanged.
    if (input.kind === 'template') {
      const r = await sendTemplateMessage({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: phone,
        templateName: input.templateName,
        language: input.language,
        params: input.params,
      })
      return r.messageId
    }
    const r = await sendTextMessage({
      phoneNumberId: config.phone_number_id,
      accessToken,
      to: phone,
      text: input.text,
    })
    return r.messageId
  }

  // Same phone-variant retry as /api/whatsapp/send — Meta sandbox and
  // numbers registered with/without a trunk 0 both require this to
  // reliably land a message.
  const variants = phoneVariants(sanitized)
  let workingPhone = sanitized
  let waMessageId = ''
  let lastError: unknown = null
  for (const v of variants) {
    try {
      waMessageId = await attempt(v)
      workingPhone = v
      lastError = null
      break
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!isRecipientNotAllowedError(msg)) throw err
      lastError = err
    }
  }
  if (lastError) throw lastError

  if (workingPhone !== sanitized) {
    await db.from('contacts').update({ phone: workingPhone }).eq('id', contact.id)
  }

  // Persist the sent message so it appears in the inbox with a real
  // message id. sender_type='bot' distinguishes automation sends
  // from manual agent sends.
  const content_type =
    input.kind === 'template' && !isEvolution ? 'template' : 'text'
  const content_text =
    input.kind === 'text'
      ? input.text
      : isEvolution
        // Evolution templates are sent as text, so persist the rendered text
        ? `[Template: ${input.templateName}]`
        : null
  const template_name =
    input.kind === 'template' ? input.templateName : null

  const { error: msgErr } = await db.from('messages').insert({
    conversation_id: input.conversationId,
    sender_type: 'bot',
    content_type,
    content_text,
    template_name,
    message_id: waMessageId,
    status: 'sent',
  })
  if (msgErr) {
    // The message was already sent; record the DB error but don't
    // pretend the send failed. The engine wraps this in a log line.
    throw new Error(`sent but DB insert failed: ${msgErr.message}`)
  }

  await db
    .from('conversations')
    .update({
      last_message_text:
        input.kind === 'template' ? `[template:${input.templateName}]` : input.text,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.conversationId)

  return { whatsapp_message_id: waMessageId }
}
