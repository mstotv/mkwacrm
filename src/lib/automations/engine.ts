import type {
  Automation,
  AutomationLogStepResult,
  AutomationStep,
  AutomationTriggerType,
  ConditionStepConfig,
  KeywordMatchTriggerConfig,
  SendMessageStepConfig,
  SendTemplateStepConfig,
  SendWebhookStepConfig,
  TagStepConfig,
  UpdateContactFieldStepConfig,
  WaitStepConfig,
  CreateDealStepConfig,
  AssignConversationStepConfig,
  AiReplyStepConfig,
  SaveToGoogleSheetStepConfig,
  AiExtractInfoStepConfig,
  QuestionSequenceStepConfig,
} from '@/types'
import { supabaseAdmin } from './admin-client'
import { engineSendText, engineSendTemplate } from './meta-send'
import { getFreshTokenForAccount, getGoogleSheetsConfig } from '@/lib/whatsapp/google-sheets'
import { hasFeatureAccess } from '@/lib/auth/features'
import { parseRelativeTime } from '@/lib/whatsapp/auto-responder'
import { getBaghdadParts, createDateFromBaghdadParts, parseLocalTimeString } from '@/lib/whatsapp/timezone-utils'
import {
  notifyAccountViaTelegram,
  formatAppointmentNotification,
  formatOrderNotification,
} from '@/lib/notifications/telegram'

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------

export interface AutomationContext {
  /** Raw message text, for keyword_match + message_content conditions. */
  message_text?: string
  /** Conversation the event belongs to, if any. */
  conversation_id?: string
  /** Arbitrary variables accumulated during execution. */
  vars?: Record<string, unknown>
  /** The tag id that was added, for tag_added trigger. */
  tag_id?: string
  /** Agent the conversation was assigned to, for conversation_assigned. */
  agent_id?: string
}

export interface DispatchInput {
  /** Account-level tenancy key. Drives the lookup of which active
   *  automations to fire — `automations.account_id` is the tenant
   *  isolation after migration 017. Replaces the previous `userId`
   *  field; the per-automation user_id is read off each row when
   *  needed (sender identity for outbound messages, log audit). */
  accountId: string
  triggerType: AutomationTriggerType
  contactId?: string | null
  context?: AutomationContext
}

/**
 * Fire all active automations matching the given trigger for an
 * account.
 *
 * Must never throw — callers use fire-and-forget from the webhook.
 * All errors are caught and logged; per-automation failures are
 * recorded into automation_logs with status='failed'.
 */
async function dispatchActual(input: DispatchInput): Promise<void> {
  try {
    const db = supabaseAdmin()

    // Tenant isolation. `contactId` can be caller-supplied (the manual
    // POST /api/automations/engine entrypoint reads it straight from the
    // request body), and every step below runs through the service-role
    // client, which bypasses RLS. So before any step can touch the
    // contact, verify it actually belongs to this account. A foreign or
    // forged id is refused silently — callers are fire-and-forget, and a
    // distinct error would leak whether a given contact UUID exists.
    if (input.contactId) {
      const { data: owned, error: ownErr } = await db
        .from('contacts')
        .select('id')
        .eq('id', input.contactId)
        .eq('account_id', input.accountId)
        .maybeSingle()
      if (ownErr) {
        console.error('[automations] contact ownership check failed:', ownErr)
        return
      }
      if (!owned) {
        console.warn('[automations] contact not in account, refusing dispatch', input.contactId)
        return
      }
    }

    const { data: automations, error } = await db
      .from('automations')
      .select('*')
      .eq('account_id', input.accountId)
      .eq('trigger_type', input.triggerType)
      .eq('is_active', true)

    if (error) {
      console.error('[automations] fetch failed:', error)
      return
    }
    if (!automations || automations.length === 0) return

    for (const automation of automations as Automation[]) {
      if (!triggerMatches(automation, input.context)) continue
      try {
        await executeAutomation(automation, input)
      } catch (err) {
        console.error('[automations] execute failed:', automation.id, err)
      }
    }
  } catch (err) {
    console.error('[automations] dispatch failed:', err)
  }
}

const debounceMap = new Map<string, { timeoutId: NodeJS.Timeout; messages: string[] }>()
const DEBOUNCE_DELAY_MS = 6000

export async function runAutomationsForTrigger(input: DispatchInput): Promise<void> {
  if (input.contactId && (input.triggerType === 'new_message_received' || input.triggerType === 'keyword_match')) {
    const key = `${input.accountId}:${input.contactId}:${input.triggerType}`
    const existing = debounceMap.get(key)
    const currentText = input.context?.message_text || ''

    if (existing) {
      clearTimeout(existing.timeoutId)
      if (currentText && !existing.messages.includes(currentText)) {
        existing.messages.push(currentText)
      }
      
      existing.timeoutId = setTimeout(() => {
        debounceMap.delete(key)
        const combinedText = existing.messages.join('\n')
        dispatchActual({
          ...input,
          context: {
            ...input.context,
            message_text: combinedText
          }
        }).catch(err => console.error('[automations] debounced dispatch error:', err))
      }, DEBOUNCE_DELAY_MS)
      return
    } else {
      const messages = currentText ? [currentText] : []
      const timeoutId = setTimeout(() => {
        debounceMap.delete(key)
        const combinedText = messages.join('\n')
        dispatchActual({
          ...input,
          context: {
            ...input.context,
            message_text: combinedText
          }
        }).catch(err => console.error('[automations] debounced dispatch error:', err))
      }, DEBOUNCE_DELAY_MS)

      debounceMap.set(key, { timeoutId, messages })
      return
    }
  }

  return dispatchActual(input)
}

/**
 * Resume a run that was parked at a wait step. Called from the cron
 * endpoint after it grabs a due `automation_pending_executions` row.
 */
export async function resumePendingExecution(pending: {
  id: string
  automation_id: string
  /** Audit-only; the automation row carries account_id for tenancy. */
  user_id: string
  /** Account-scoped lookups read from the automation row, so this
   *  field is just here to mirror the row shape and keep the cron's
   *  pass-through self-documenting. */
  account_id: string
  contact_id: string | null
  log_id: string | null
  parent_step_id: string | null
  branch: 'yes' | 'no' | null
  next_step_position: number
  context: AutomationContext
}): Promise<void> {
  const db = supabaseAdmin()
  const { data: automation, error } = await db
    .from('automations')
    .select('*')
    .eq('id', pending.automation_id)
    .single()

  if (error || !automation) {
    console.error('[automations] resume: missing automation', pending.automation_id, error)
    await markPending(pending.id, 'failed')
    return
  }

  try {
    await executeStepsFrom({
      automation: automation as Automation,
      contactId: pending.contact_id,
      context: pending.context ?? {},
      parentStepId: pending.parent_step_id,
      branch: pending.branch,
      startPosition: pending.next_step_position,
      logId: pending.log_id,
      triggerEvent: 'resumed_wait',
    })
    await markPending(pending.id, 'done')
  } catch (err) {
    console.error('[automations] resume failed:', err)
    await markPending(pending.id, 'failed')
  }
}

// ------------------------------------------------------------
// Internal execution
// ------------------------------------------------------------

async function executeAutomation(automation: Automation, input: DispatchInput) {
  const db = supabaseAdmin()

  const { data: log, error: logErr } = await db
    .from('automation_logs')
    .insert({
      automation_id: automation.id,
      // Tenancy: matches automation.account_id (NOT NULL post-017).
      account_id: automation.account_id,
      // Audit: keeps the historical "author of this automation"
      // pointer so logs still attribute to the right user even
      // after teammates join the account.
      user_id: automation.user_id,
      contact_id: input.contactId ?? null,
      trigger_event: input.triggerType,
      steps_executed: [],
      status: 'success',
    })
    .select()
    .single()

  if (logErr || !log) {
    console.error('[automations] cannot create log:', logErr)
    return
  }

  await executeStepsFrom({
    automation,
    contactId: input.contactId ?? null,
    context: input.context ?? {},
    parentStepId: null,
    branch: null,
    startPosition: 0,
    logId: log.id,
    triggerEvent: input.triggerType,
  })

  // Atomic counter update via the SQL function from migration 007.
  // Doing this with a client-side read-modify-write raced when the
  // same automation fired for two contacts simultaneously — both
  // would read N and both write N+1, losing one count permanently.
  const { error: rpcErr } = await db.rpc('increment_automation_execution_count', {
    p_automation_id: automation.id,
  })
  if (rpcErr) {
    console.error('[automations] increment counter failed:', rpcErr)
  }
}

interface ExecuteArgs {
  automation: Automation
  contactId: string | null
  context: AutomationContext
  parentStepId: string | null
  branch: 'yes' | 'no' | null
  startPosition: number
  logId: string | null
  triggerEvent: string
}

async function executeStepsFrom(args: ExecuteArgs): Promise<void> {
  const db = supabaseAdmin()

  const baseQuery = db
    .from('automation_steps')
    .select('*')
    .eq('automation_id', args.automation.id)
    .gte('position', args.startPosition)
    .order('position', { ascending: true })

  const scoped =
    args.parentStepId === null
      ? baseQuery.is('parent_step_id', null)
      : baseQuery.eq('parent_step_id', args.parentStepId).eq('branch', args.branch ?? 'yes')

  const { data: steps, error: stepsErr } = await scoped

  if (stepsErr) {
    await finalizeLog(args.logId, 'failed', stepsErr.message)
    return
  }
  if (!steps || steps.length === 0) {
    if (args.parentStepId === null && args.logId) {
      await finalizeLog(args.logId, 'success', null)
    }
    return
  }

  const results: AutomationLogStepResult[] = []
  let status: 'success' | 'partial' | 'failed' = 'success'
  let errorMessage: string | null = null

  for (const step of steps as AutomationStep[]) {
    // `wait` is the suspension point: enqueue and stop processing this
    // scope. The cron endpoint will pick it up later.
    if (step.step_type === 'wait') {
      const cfg = step.step_config as WaitStepConfig
      const ms = waitMs(cfg)
      await db.from('automation_pending_executions').insert({
        automation_id: args.automation.id,
        // Tenancy: account_id required NOT NULL post-017.
        account_id: args.automation.account_id,
        user_id: args.automation.user_id,
        contact_id: args.contactId,
        log_id: args.logId,
        parent_step_id: args.parentStepId,
        branch: args.branch,
        next_step_position: step.position + 1,
        context: args.context,
        run_at: new Date(Date.now() + ms).toISOString(),
        status: 'pending',
      })
      results.push({
        step_id: step.id,
        step_type: step.step_type,
        status: 'success',
        detail: `waiting ${cfg.amount} ${cfg.unit}`,
      })
      status = 'partial'
      await appendResults(args.logId, results, status, errorMessage)
      return
    }

    if (step.step_type === 'question_sequence') {
      const cfg = step.step_config as QuestionSequenceStepConfig
      const questions = cfg.questions || []
      if (questions.length > 0) {
        const { data: activeSession } = await db
          .from('automation_qna_sessions')
          .select('*')
          .eq('contact_id', args.contactId)
          .eq('status', 'pending')
          .maybeSingle()

        if (!activeSession) {
          const firstQuestion = questions[0]
          const conversationId = await resolveConversationId(args)
          
          await engineSendText({
            accountId: args.automation.account_id,
            userId: args.automation.user_id,
            conversationId,
            contactId: args.contactId || '',
            text: firstQuestion.question_text,
          })

          await db.from('automation_qna_sessions').insert({
            account_id: args.automation.account_id,
            contact_id: args.contactId,
            automation_id: args.automation.id,
            log_id: args.logId,
            parent_step_id: args.parentStepId,
            branch: args.branch,
            next_step_position: step.position + 1,
            current_question_index: 0,
            questions,
            vars: {},
            context: args.context,
            status: 'pending',
          })

          results.push({
            step_id: step.id,
            step_type: step.step_type,
            status: 'success',
            detail: `Q&A Flow started. Paused waiting for response to: "${firstQuestion.question_text}"`,
          })
          
          status = 'partial'
          await appendResults(args.logId, results, status, errorMessage)
          return
        } else {
          results.push({
            step_id: step.id,
            step_type: step.step_type,
            status: 'success',
            detail: `Q&A Session active. Waiting for response.`,
          })
          status = 'partial'
          await appendResults(args.logId, results, status, errorMessage)
          return
        }
      }
    }

    try {
      if (step.step_type === 'condition') {
        const cfg = step.step_config as ConditionStepConfig
        const taken = await evaluateCondition(cfg, args)
        results.push({
          step_id: step.id,
          step_type: 'condition',
          status: 'success',
          detail: `branch=${taken ? 'yes' : 'no'}`,
        })
        // Recurse into the chosen branch at position 0 (children use their
        // own ordering within the branch scope).
        await executeStepsFrom({
          ...args,
          parentStepId: step.id,
          branch: taken ? 'yes' : 'no',
          startPosition: 0,
          logId: args.logId,
        })
        continue
      }

      const detail = await runStep(step, args)
      results.push({
        step_id: step.id,
        step_type: step.step_type,
        status: 'success',
        detail,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results.push({
        step_id: step.id,
        step_type: step.step_type,
        status: 'failed',
        detail: msg,
      })
      status = 'failed'
      errorMessage = msg
      break
    }
  }

  if (args.parentStepId === null) {
    await appendResults(args.logId, results, status, errorMessage)
  } else {
    // Nested branch — just append results; parent scope decides final status.
    await appendResults(args.logId, results, null, errorMessage)
  }
}

async function runStep(step: AutomationStep, args: ExecuteArgs): Promise<string> {
  const db = supabaseAdmin()

  switch (step.step_type) {
    case 'send_message': {
      const cfg = step.step_config as SendMessageStepConfig
      if (!args.contactId) throw new Error('send_message needs a contact')
      const text = interpolate(cfg.text, args)
      if (!text.trim()) throw new Error('send_message has empty text')
      const conversationId = await resolveConversationId(args)
      const { whatsapp_message_id } = await engineSendText({
        accountId: args.automation.account_id,
        userId: args.automation.user_id,
        conversationId,
        contactId: args.contactId,
        text,
      })
      return `sent via Meta (${whatsapp_message_id})`
    }

    case 'send_template': {
      const cfg = step.step_config as SendTemplateStepConfig
      if (!args.contactId) throw new Error('send_template needs a contact')
      if (!cfg.template_name) throw new Error('send_template needs template_name')
      const conversationId = await resolveConversationId(args)
      // Meta templates use positional {{1}}, {{2}}, … placeholders, so
      // we MUST emit params in strict numeric order. Lexicographic sort
      // of "1", "2", …, "10" yields "1", "10", "2", … which silently
      // scrambles every template with ≥10 variables.
      const params = cfg.variables
        ? Object.keys(cfg.variables)
            .sort((a, b) => {
              const na = Number(a)
              const nb = Number(b)
              const aNum = Number.isFinite(na)
              const bNum = Number.isFinite(nb)
              if (aNum && bNum) return na - nb
              if (aNum) return -1
              if (bNum) return 1
              return a.localeCompare(b)
            })
            .map((k) => String(cfg.variables![k]))
        : []
      const { whatsapp_message_id } = await engineSendTemplate({
        accountId: args.automation.account_id,
        userId: args.automation.user_id,
        conversationId,
        contactId: args.contactId,
        templateName: cfg.template_name,
        language: cfg.language,
        params,
      })
      return `template sent via Meta (${whatsapp_message_id})`
    }

    case 'add_tag': {
      // contact_tags has no account_id column; cross-tenant protection for
      // the attacker-supplied contactId comes from the ownership guard in
      // runAutomationsForTrigger.
      const cfg = step.step_config as TagStepConfig
      if (!args.contactId || !cfg.tag_id) throw new Error('add_tag needs contact + tag_id')
      await db
        .from('contact_tags')
        .upsert(
          { contact_id: args.contactId, tag_id: cfg.tag_id },
          { onConflict: 'contact_id,tag_id', ignoreDuplicates: true },
        )
      return `tag ${cfg.tag_id} added`
    }

    case 'remove_tag': {
      // See add_tag: tenant scoping relies on the runAutomationsForTrigger
      // ownership guard, since contact_tags carries no account_id.
      const cfg = step.step_config as TagStepConfig
      if (!args.contactId || !cfg.tag_id) throw new Error('remove_tag needs contact + tag_id')
      await db
        .from('contact_tags')
        .delete()
        .eq('contact_id', args.contactId)
        .eq('tag_id', cfg.tag_id)
      return `tag ${cfg.tag_id} removed`
    }

    case 'assign_conversation': {
      const cfg = step.step_config as AssignConversationStepConfig
      if (!args.contactId) throw new Error('assign_conversation needs a contact')
      let agentId = cfg.agent_id
      if (cfg.mode === 'round_robin') {
        // Pick any member of the account. The existing implementation
        // only ever returned the automation's author; preserving that
        // shape until a real round-robin algorithm replaces it.
        const { data: profiles } = await db
          .from('profiles')
          .select('user_id')
          .eq('account_id', args.automation.account_id)
          .limit(1)
        agentId = profiles?.[0]?.user_id
      }
      if (!agentId) return 'no agent resolved'
      await db
        .from('conversations')
        .update({ assigned_agent_id: agentId })
        .eq('account_id', args.automation.account_id)
        .eq('contact_id', args.contactId)
      return `assigned to ${agentId}`
    }

    case 'update_contact_field': {
      const cfg = step.step_config as UpdateContactFieldStepConfig
      if (!args.contactId) throw new Error('update_contact_field needs a contact')
      // Resolve workflow variables ({{ vars.* }}, {{ message.text }}) so custom
      // values can be populated dynamically from the triggering context.
      const value = interpolate(cfg.value, args)

      // Custom fields are encoded as `custom:<custom_field_id>`; anything else
      // is a built-in contact column.
      if (cfg.field.startsWith('custom:')) {
        const customFieldId = cfg.field.slice('custom:'.length)
        if (!customFieldId) {
          return `field ${cfg.field} not writable from automations`
        }
        // Defense in depth: the service-role client bypasses RLS, so confirm
        // the field definition belongs to this account before writing.
        const { data: field } = await db
          .from('custom_fields')
          .select('id')
          .eq('id', customFieldId)
          .eq('account_id', args.automation.account_id)
          .maybeSingle()
        if (!field) {
          return `field ${cfg.field} not writable from automations`
        }
        // Upsert on the table's UNIQUE(contact_id, custom_field_id) so repeated
        // runs overwrite rather than duplicate. Tenancy is enforced above and,
        // for the contact side, by the entry-point ownership guard.
        await db
          .from('contact_custom_values')
          .upsert(
            { contact_id: args.contactId, custom_field_id: customFieldId, value },
            { onConflict: 'contact_id,custom_field_id' },
          )
        return `custom field updated`
      }

      const allowed = new Set(['name', 'email', 'company'])
      if (!allowed.has(cfg.field)) {
        return `field ${cfg.field} not writable from automations`
      }
      // Defense in depth: scope the service-role write to the account so
      // a future caller that skips the entry-point ownership guard still
      // cannot write across tenants.
      await db
        .from('contacts')
        .update({ [cfg.field]: value, updated_at: new Date().toISOString() })
        .eq('id', args.contactId)
        .eq('account_id', args.automation.account_id)
      return `${cfg.field} updated`
    }

    case 'create_deal': {
      const cfg = step.step_config as CreateDealStepConfig
      if (!cfg.pipeline_id || !cfg.stage_id) throw new Error('create_deal needs pipeline + stage')
      // Match the account's configured default currency rather than
      // the static `deals.currency` DB default — keeps automation-
      // created deals consistent with the one-currency-per-account
      // rule (issue #218). Fall back to USD if the row is somehow
      // missing the value (pre-021 forks).
      const { data: acct } = await db
        .from('accounts')
        .select('default_currency')
        .eq('id', args.automation.account_id)
        .maybeSingle()
      await db.from('deals').insert({
        // Tenancy + audit, same split as automation_logs above.
        account_id: args.automation.account_id,
        user_id: args.automation.user_id,
        pipeline_id: cfg.pipeline_id,
        stage_id: cfg.stage_id,
        contact_id: args.contactId,
        title: interpolate(cfg.title, args),
        value: cfg.value ?? 0,
        currency: acct?.default_currency ?? 'USD',
        status: 'open',
      })
      return 'deal created'
    }

    case 'send_webhook': {
      const cfg = step.step_config as SendWebhookStepConfig
      if (!cfg.url) throw new Error('send_webhook needs url')
      const body = cfg.body_template ? interpolate(cfg.body_template, args) : JSON.stringify(args.context)
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cfg.headers ?? {}) },
        body,
      })
      if (!res.ok) throw new Error(`webhook returned ${res.status}`)
      return `webhook ${res.status}`
    }

    case 'close_conversation': {
      if (!args.contactId) throw new Error('close_conversation needs a contact')
      await db
        .from('conversations')
        .update({ status: 'closed', updated_at: new Date().toISOString() })
        .eq('account_id', args.automation.account_id)
        .eq('contact_id', args.contactId)
      return 'conversation closed'
    }

    case 'ai_reply': {
      const cfg = step.step_config as AiReplyStepConfig
      const conversationId = await resolveConversationId(args)

      // 1) Verify active paid subscription or admin status
      const hasAccess = await hasFeatureAccess(db, args.automation.account_id, 'ai_reply', args.automation.user_id)

      if (!hasAccess) {
        throw new Error('AI Reply action is only available for active paid subscriptions.')
      }

      // 2) Get AI Configuration (provider, API key, system prompt)
      const { data: aiConfig, error: aiErr } = await db
        .from('ai_config')
        .select('*')
        .eq('account_id', args.automation.account_id)
        .maybeSingle()

      if (aiErr) {
        throw new Error(`Failed to load AI configuration: ${aiErr.message}`)
      }
      if (!aiConfig || !aiConfig.api_key) {
        throw new Error('AI assistant is not configured. Please configure your API key in AI settings.')
      }

      // 3) Retrieve conversation history for context (up to 10 messages)
      const { data: recentMsgs } = await db
        .from('messages')
        .select('sender_type, content_text')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(10)

      const lastMsgText = args.context?.message_text

      const history = (recentMsgs ?? [])
        .reverse()
        .map((m) => {
          const role = m.sender_type === 'customer' ? 'user' : 'assistant'
          return { role, content: m.content_text || '' }
        })
        .filter((m) => m.content)
        // Prevent duplication if message_text contains combined debounced messages
        .filter((m) => {
          if (m.role === 'user' && lastMsgText && lastMsgText.includes(m.content) && lastMsgText !== m.content) {
            return false;
          }
          return true;
        })

      // Fetch calendar busy slots if a Google Account is connected
      let calendarContext = ''
      let googleToken = ''
      let googleAccountId = ''
      let calendarId = 'primary'
      try {
        const { accounts } = await getGoogleSheetsConfig(args.automation.account_id)
        if (accounts && accounts.length > 0) {
          googleAccountId = accounts[0].id
          googleToken = await getFreshTokenForAccount(args.automation.account_id, googleAccountId)
          calendarId = accounts[0].calendar_id || 'primary'
          const busySlotsText = await fetchCalendarBusySlots(args.automation.account_id, googleToken, calendarId)
          if (busySlotsText) {
            calendarContext = `\n\n**معلومات المواعيد في تقويم Google Calendar (هام جداً):**\nتاريخ اليوم الحالي هو: ${new Date().toISOString().split('T')[0]}\n${busySlotsText}\n\n**تعليمات الحجز:**\n- لا تقترح على العميل أي موعد يقع في الأوقات المحجوزة أعلاه.\n- عندما يتفق العميل معك على موعد محدد ويؤكده بوضوح، قم بتأكيد الموعد وأرفق في نهاية ردك الوسم التالي بدقة متناهية: [BOOK_APPOINTMENT: YYYY-MM-DDTHH:mm:ss] حيث YYYY-MM-DDTHH:mm:ss هو تاريخ ووقت الموعد المتفق عليه بتنسيق ISO (مثال: [BOOK_APPOINTMENT: 2026-07-07T14:30:00]).`
          }
        }
      } catch (calErr) {
        console.error('[automations] Failed to load calendar context:', calErr)
      }

      // Fetch account details for follow-up settings
      let followUpContext = ''
      let accountData: any = null
      try {
        const { data: acct } = await db
          .from('accounts')
          .select('follow_up_action_type, follow_up_reminder_template, follow_up_default_time')
          .eq('id', args.automation.account_id)
          .maybeSingle()
        accountData = acct

        const currentDayTime = new Date().toLocaleString('ar-SA', {
          timeZone: 'Asia/Riyadh',
          dateStyle: 'full',
          timeStyle: 'short'
        })

        followUpContext = `\n\n**معلومات المتابعة التلقائية (AI Follow-up):**
تاريخ ووقت اليوم الحالي هو: ${currentDayTime} (تنسيق ISO: ${new Date().toISOString()}).
إذا أبدى العميل رغبة في التفكير أو تأجيل اتخاذ القرار أو الموعد أو الشراء لوقت لاحق (مثال: "بفكر وأرد عليك بكرة"، "تواصل معي بعد يومين"، "بكلمك الأسبوع الجاي"، "سأعود لكم لاحقاً")، يجب عليك جدولة متابعة بإضافة التاج التالي بدقة متناهية في نهاية ردك:
[SCHEDULE_FOLLOW_UP: السبب | الوقت النسبي | YYYY-MM-DD]
حيث:
- السبب: وصف مختصر جداً لسبب المتابعة باللغة العربية (مثال: أراد التفكير بعرض السعر).
- الوقت النسبي: الوصف النسبي الذي ذكره العميل (مثال: غداً، بعد يومين، الأسبوع القادم).
- YYYY-MM-DD: هو التاريخ الفعلي المحسوب للمتابعة بناءً على تاريخ ووقت اليوم الموضح أعلاه.`
      } catch (acctErr) {
        console.error('[automations] Failed to load account context for follow-up:', acctErr)
      }

      const systemPrompt =
        cfg.system_prompt ||
        aiConfig.system_prompt ||
        'You are a helpful customer assistant.'

      // Append default brevity instruction to system prompt
      const brevityInstruction = '\n\n**تعليمات هامة لأسلوب الرد / Important reply instructions:**\n- أجب دائماً بإيجاز شديد (جملتين إلى ثلاث جمل كحد أقصى)، بما يكفي لإعطاء العميل المعلومة الكافية دون إطالة أو حشو.\n- Always answer very briefly (maximum 2 to 3 sentences), enough to give the customer sufficient information without lengthiness.'
      const compiledSystemPrompt = `${systemPrompt}${calendarContext}${followUpContext}${brevityInstruction}`

      const llmMessages = [
        { role: 'system', content: compiledSystemPrompt },
        ...history,
      ]

      // If the incoming message text isn't in history yet, append it as user message
      if (
        lastMsgText &&
        (history.length === 0 || history[history.length - 1].content !== lastMsgText)
      ) {
        llmMessages.push({ role: 'user', content: lastMsgText })
      }

      // 4) Query AI model
      let replyText = ''
      if (aiConfig.provider === 'openai') {
        // Future recommendation: Consider migrating to Responses API (v1/responses)
        // for reduced cost (40-80% savings) and optimized performance with modern models.
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${aiConfig.api_key}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: llmMessages,
            max_tokens: 200, // Reduced max_tokens to 200 for brevity and token savings
          }),
        })

        const resData = await response.json()
        if (response.ok && resData.choices?.[0]?.message?.content) {
          replyText = resData.choices[0].message.content.trim()
        } else {
          throw new Error(`OpenAI API error: ${resData.error?.message || JSON.stringify(resData)}`)
        }
      } else if (aiConfig.provider === 'deepseek') {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${aiConfig.api_key}`,
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: llmMessages,
            max_tokens: 200, // Reduced max_tokens to 200 for brevity and token savings
          }),
        })

        const resData = await response.json()
        if (response.ok && resData.choices?.[0]?.message?.content) {
          replyText = resData.choices[0].message.content.trim()
        } else {
          throw new Error(`DeepSeek API error: ${resData.error?.message || JSON.stringify(resData)}`)
        }
      } else {
        throw new Error(`Unsupported AI provider: ${aiConfig.provider}`)
      }

      if (!replyText) {
        throw new Error('AI generated an empty reply.')
      }

      // Check if the AI returned a BOOK_APPOINTMENT tag and we have google tokens
      const appointmentMatch = replyText.match(/\[BOOK_APPOINTMENT:\s*([^\]]+)\]/)
      if (appointmentMatch && googleToken) {
        const appointmentTime = appointmentMatch[1].trim()
        try {
          // Fetch contact details for event description
          let contactName = 'عميل واتساب'
          let contactPhone = ''
          if (args.contactId) {
            const { data: contactData } = await db
               .from('contacts')
               .select('name, phone')
               .eq('id', args.contactId)
               .maybeSingle()
            if (contactData) {
              contactName = contactData.name || contactName
              contactPhone = contactData.phone || ''
            }
          }

          const summary = `موعد مع العميل: ${contactName}`
          const description = `تم الحجز تلقائياً عبر واتساب.\nالاسم: ${contactName}\nالهاتف: ${contactPhone}`

          console.log('[Calendar] Attempting to book event at:', appointmentTime)
          const eventId = await createCalendarEvent(
            args.automation.account_id,
            googleToken,
            calendarId,
            summary,
            description,
            appointmentTime
          )
          console.log('[Calendar] Booked event successfully. Event ID:', eventId)

          // --- Telegram notification (fire-and-forget) ---
          notifyAccountViaTelegram(
            args.automation.account_id,
            formatAppointmentNotification(contactName, contactPhone, appointmentTime, description)
          ).catch(err => console.error('[Telegram] Appointment notification failed:', err))
        } catch (bookErr: any) {
          console.error('[Calendar] Auto booking failed:', bookErr)
        }

        // Clean the tag from the reply text so the customer doesn't see it
        replyText = replyText.replace(/\[BOOK_APPOINTMENT:\s*[^\]]+\]/, '').trim()
      }

      // Check if the AI returned a SCHEDULE_FOLLOW_UP tag
      const followUpMatch = replyText.match(/\[SCHEDULE_FOLLOW_UP:\s*([^|]+)\|\s*([^|]+)\|\s*([^\]]+)\]/)
      if (followUpMatch) {
        const reason = followUpMatch[1].trim()
        const relativeDesc = followUpMatch[2].trim()
        const targetDateStr = followUpMatch[3].trim()

        try {
          // Parse date using the helper first
          let scheduledAt = parseRelativeTime(relativeDesc || targetDateStr)
          
           // If parseRelativeTime returned fallback and targetDateStr is a valid specific ISO time, use it
          if (targetDateStr && targetDateStr.includes(':') && !isNaN(parseLocalTimeString(targetDateStr).getTime())) {
            const parsedTarget = parseLocalTimeString(targetDateStr)
            if (parsedTarget.getTime() > Date.now()) {
              scheduledAt = parsedTarget;
            }
          } else {
            // Apply default follow-up time ONLY if relativeDesc is NOT a short relative offset (minutes/hours)
            const isShortOffset = /دقيق|ساع|minute|hour|h|min/i.test(relativeDesc || '');
            if (!isShortOffset) {
              const defaultTimeStr = accountData?.follow_up_default_time || '10:00'
              const [hours, minutes] = defaultTimeStr.split(':').map(Number)
              const parts = getBaghdadParts(scheduledAt);
              scheduledAt = createDateFromBaghdadParts(parts.year, parts.month, parts.day, hours || 10, minutes || 0, 0);
            }
          }

          // Insert into follow_ups table
          const { error: fupErr } = await db.from('follow_ups').insert({
            account_id: args.automation.account_id,
            contact_id: args.contactId,
            conversation_id: conversationId,
            reason,
            scheduled_at: scheduledAt.toISOString(),
            action_type: accountData?.follow_up_action_type || 'both',
            status: 'pending'
          })

          if (fupErr) {
            console.error('[Follow-up] Database insert failed:', fupErr.message)
          } else {
            console.log('[Follow-up] Scheduled follow-up successfully:', reason, scheduledAt.toISOString())
          }
        } catch (err: any) {
          console.error('[Follow-up] Error calculating/saving follow-up:', err.message)
        }

        // Clean the tag from the reply text so the customer doesn't see it
        replyText = replyText.replace(/\[SCHEDULE_FOLLOW_UP:\s*[^\]]+\]/, '').trim()
      }

      // Save the AI reply to context variables so steps like google sheets can reference it
      if (!args.context.vars) {
        args.context.vars = {}
      }
      args.context.vars.ai_reply = replyText

      // 5) Send directly or create human-in-the-loop draft
      if (cfg.human_in_the_loop) {
        const draftId = `ai-draft-${crypto.randomUUID()}`
        const { error: insertErr } = await db.from('messages').insert({
          conversation_id: conversationId,
          sender_type: 'bot',
          content_type: 'text',
          content_text: replyText,
          message_id: draftId,
          status: 'sending',
        })
        if (insertErr) {
          throw new Error(`Failed to insert AI draft: ${insertErr.message}`)
        }
        return `Draft created for review (${draftId})`
      } else {
        const { whatsapp_message_id } = await engineSendText({
          accountId: args.automation.account_id,
          userId: args.automation.user_id,
          conversationId,
          contactId: args.contactId!,
          text: replyText,
        })
        return `AI reply sent (${whatsapp_message_id})`
      }
    }
    case 'ai_extract_info': {
      const cfg = step.step_config as AiExtractInfoStepConfig

      // 1) Verify subscription status or admin status
      const hasAccess = await hasFeatureAccess(db, args.automation.account_id, 'ai_reply', args.automation.user_id)

      if (!hasAccess) {
        throw new Error('AI Information Extraction is only available for active paid subscriptions.')
      }

      // 2) Get AI Configuration (provider, API key, system prompt)
      const { data: aiConfig, error: aiErr } = await db
        .from('ai_config')
        .select('*')
        .eq('account_id', args.automation.account_id)
        .maybeSingle()

      if (aiErr) {
        throw new Error(`Failed to load AI configuration: ${aiErr.message}`)
      }
      if (!aiConfig || !aiConfig.api_key) {
        throw new Error('AI assistant is not configured. Please configure your API key in AI settings.')
      }

      // 3) Parse incoming message text
      const messageToParse = args.context?.message_text || ''
      if (!messageToParse) {
        return 'No message content available to parse'
      }

      // 4) Construct Prompt for parsing contact details
      const systemPrompt = `You are a precise data extraction assistant. Your job is to extract contact information from the user's message.
Return the extracted information in JSON format with the following keys. Do NOT include any markdown formatting, code block markers, or extra text. Just raw JSON.
Keys:
- name: The person's full name (if mentioned).
- email: The email address (if mentioned).
- phone: The phone number (if mentioned).
- address: The physical address / location / delivery address (if mentioned).
- company: The company name (if mentioned).

Only extract values that are explicitly provided in the text. If a value is not mentioned, use null.
`
      let customInstructions = cfg.instructions || ''
      if (customInstructions) {
        customInstructions = `\n\nAdditional instructions:\n${customInstructions}`
      }
      const compiledSystemPrompt = `${systemPrompt}${customInstructions}`
      const userMessage = `Extract contact information from the following text:\n\n"${messageToParse}"`

      let parsedJson: any = {}
      if (aiConfig.provider === 'openai') {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${aiConfig.api_key}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: compiledSystemPrompt },
              { role: 'user', content: userMessage }
            ],
            response_format: { type: 'json_object' },
            max_tokens: 500,
          }),
        })

        const resData = await response.json()
        if (response.ok && resData.choices?.[0]?.message?.content) {
          parsedJson = JSON.parse(resData.choices[0].message.content.trim())
        } else {
          throw new Error(`OpenAI API error during extraction: ${resData.error?.message || JSON.stringify(resData)}`)
        }
      } else if (aiConfig.provider === 'deepseek') {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${aiConfig.api_key}`,
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: compiledSystemPrompt },
              { role: 'user', content: userMessage }
            ],
            response_format: { type: 'json_object' },
            max_tokens: 500,
          }),
        })

        const resData = await response.json()
        if (response.ok && resData.choices?.[0]?.message?.content) {
          parsedJson = JSON.parse(resData.choices[0].message.content.trim())
        } else {
          throw new Error(`DeepSeek API error during extraction: ${resData.error?.message || JSON.stringify(resData)}`)
        }
      } else {
        throw new Error(`Unsupported AI provider: ${aiConfig.provider}`)
      }

      // 5) Update database contact record if enabled
      const updatedFields: string[] = []
      if (cfg.update_contact !== false && args.contactId) {
        const updatePayload: Record<string, any> = {}
        if (parsedJson.name) {
          updatePayload.name = String(parsedJson.name).trim()
          updatedFields.push('name')
        }
        if (parsedJson.email) {
          updatePayload.email = String(parsedJson.email).trim()
          updatedFields.push('email')
        }
        if (parsedJson.phone) {
          updatePayload.phone = String(parsedJson.phone).trim()
          updatedFields.push('phone')
        }
        if (parsedJson.address) {
          updatePayload.address = String(parsedJson.address).trim()
          updatedFields.push('address')
        }
        if (parsedJson.company) {
          updatePayload.company = String(parsedJson.company).trim()
          updatedFields.push('company')
        }

        if (Object.keys(updatePayload).length > 0) {
          updatePayload.updated_at = new Date().toISOString()
          const { error: dbErr } = await db
            .from('contacts')
            .update(updatePayload)
            .eq('id', args.contactId)
            .eq('account_id', args.automation.account_id)
          
          if (dbErr) {
            console.error('[automations] Failed to update contact with extracted info:', dbErr)
          }
        }
      }

      // 6) Store parsed results in automation run variables context
      if (!args.context.vars) {
        args.context.vars = {}
      }
      args.context.vars.extracted_name = parsedJson.name || ''
      args.context.vars.extracted_email = parsedJson.email || ''
      args.context.vars.extracted_phone = parsedJson.phone || ''
      args.context.vars.extracted_address = parsedJson.address || ''
      args.context.vars.extracted_company = parsedJson.company || ''

      const statusMsg = updatedFields.length > 0
        ? `Extracted and updated fields: ${updatedFields.join(', ')}`
        : 'Extracted variables stored in vars'
      
      return statusMsg
    }
    case 'save_to_google_sheet': {
      const cfg = step.step_config as SaveToGoogleSheetStepConfig
      
      // 1) Verify Google Sheets feature access or admin status
      const hasAccess = await hasFeatureAccess(db, args.automation.account_id, 'google_sheets', args.automation.user_id)
      if (!hasAccess) {
        throw new Error('Google Sheets Integration is not available under your plan. Please upgrade.')
      }

      const spreadsheetId = cfg.spreadsheet_id
      if (!spreadsheetId) {
        throw new Error('No Google Spreadsheet selected in workflow step.')
      }

      const mappings = cfg.mappings || []
      for (const m of mappings) {
        if (!m.field) {
          throw new Error('Google Sheets mapping source field cannot be empty.')
        }
        if (!m.column || String(m.column).trim() === '') {
          throw new Error('Google Sheets mapping target column cannot be empty. Please specify a column (e.g. A, B or Name).')
        }
      }

      // Load config to find the Google Account ID for this spreadsheet
      const { sheets } = await getGoogleSheetsConfig(args.automation.account_id)
      const matchedSheet = sheets.find(s => s.spreadsheet_id === spreadsheetId)
      if (!matchedSheet) {
        throw new Error(`The spreadsheet ID ${spreadsheetId} is not linked to any Google account in Settings.`)
      }

      const googleAccountId = matchedSheet.google_account_id
      const sheetName = cfg.sheet_name || 'Sheet1'
      
      // Refresh token and call Google Sheets API
      let token = ''
      try {
        token = await getFreshTokenForAccount(args.automation.account_id, googleAccountId)
      } catch (tokenErr: any) {
        throw new Error(`Google authentication expired. Please reconnect your account in Settings: ${tokenErr.message}`)
      }

      const rowValues: Record<string, string> = {}

      // Fetch contact details if needed
      let contactData: any = null
      if (args.contactId) {
        const { data } = await db
          .from('contacts')
          .select('*')
          .eq('id', args.contactId)
          .maybeSingle()
        contactData = data
      }

      for (const m of mappings) {
        let resolvedValue = ''
        if (m.field.includes('{{')) {
          resolvedValue = interpolate(m.field, args)
        } else {
          switch (m.field) {
            case 'contact.name':
            case 'name':
              resolvedValue = contactData?.name || ''
              break
            case 'contact.phone':
            case 'phone':
              resolvedValue = contactData?.phone || ''
              break
            case 'contact.email':
            case 'email':
              resolvedValue = contactData?.email || ''
              break
            case 'contact.address':
            case 'address':
              resolvedValue = contactData?.address || ''
              break
            case 'contact.color':
            case 'color':
              resolvedValue = contactData?.color || ''
              break
            case 'contact.company':
            case 'company':
              resolvedValue = contactData?.company || ''
              break
            case 'message.text':
            case 'message_text':
              resolvedValue = args.context?.message_text || ''
              break
            default:
              resolvedValue = String(args.context?.vars?.[m.field] || m.field)
              break
          }
        }
        rowValues[m.column] = resolvedValue
      }

      // Fetch headers to map column names to indices
      let headers: string[] = []
      try {
        const headersRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (headersRes.ok) {
          const data = await headersRes.json()
          headers = data.values?.[0] || []
        }
      } catch (err) {
        console.warn('Failed to fetch headers, falling back to column letters only:', err)
      }

      // Convert letter to index helper
      const getColumnIndex = (col: string): number => {
        const clean = col.trim()
        if (/^[a-zA-Z]+$/.test(clean)) {
          let idx = 0
          const upper = clean.toUpperCase()
          for (let i = 0; i < upper.length; i++) {
            idx = idx * 26 + (upper.charCodeAt(i) - 64)
          }
          return idx - 1
        }
        const headerIdx = headers.findIndex(h => h.toLowerCase().trim() === clean.toLowerCase())
        return headerIdx
      }

      // Build row values array
      const maxIndex = Math.max(...mappings.map(m => getColumnIndex(m.column)).filter(idx => idx >= 0), 0)
      const rowValuesArr = new Array(maxIndex + 1).fill('')

      for (const m of mappings) {
        const idx = getColumnIndex(m.column)
        if (idx >= 0) {
          rowValuesArr[idx] = rowValues[m.column]
        }
      }

      // Append row to sheet
      const appendRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            values: [rowValuesArr],
          }),
        }
      )

      const appendData = await appendRes.json()
      if (!appendRes.ok) {
        throw new Error(`Google Sheets append failed: ${appendData.error?.message || JSON.stringify(appendData)}`)
      }

      return `Saved row to Google Sheet (${sheetName})`
    }

    default:
      return `unknown step: ${step.step_type}`
  }
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/**
 * Pick the conversation a send-type step should use. Prefer the id the
 * webhook handed us (it's the one that just got the inbound message);
 * fall back to the contact's conversation for resumed/wait paths and
 * manual engine POSTs. Throws if none exists — send steps have
 * no meaningful target without a conversation.
 */
async function resolveConversationId(args: ExecuteArgs): Promise<string> {
  const fromCtx = args.context.conversation_id
  if (fromCtx) return fromCtx
  if (!args.contactId) throw new Error('cannot resolve conversation: no contact')
  const { data, error } = await supabaseAdmin()
    .from('conversations')
    .select('id')
    .eq('account_id', args.automation.account_id)
    .eq('contact_id', args.contactId)
    .maybeSingle()
  if (error) throw new Error(`conversation lookup failed: ${error.message}`)
  if (!data?.id) throw new Error('no conversation for contact')
  return data.id as string
}

function triggerMatches(automation: Automation, ctx: AutomationContext | undefined): boolean {
  if (automation.trigger_type !== 'keyword_match') return true
  const cfg = automation.trigger_config as KeywordMatchTriggerConfig
  if (!cfg?.keywords || cfg.keywords.length === 0) return false
  const text = (ctx?.message_text ?? '').toString()
  if (!text) return false
  const haystack = cfg.case_sensitive ? text : text.toLowerCase()
  return cfg.keywords.some((raw) => {
    const k = cfg.case_sensitive ? raw : raw.toLowerCase()
    return cfg.match_type === 'exact' ? haystack === k : haystack.includes(k)
  })
}

async function evaluateCondition(cfg: ConditionStepConfig, args: ExecuteArgs): Promise<boolean> {
  const db = supabaseAdmin()
  switch (cfg.subject) {
    case 'tag_presence': {
      if (!args.contactId || !cfg.operand) return false
      // contact_tags has no account_id column (its RLS keys off the parent
      // contact), so tenant scoping here relies on the contact-ownership
      // guard in runAutomationsForTrigger.
      const { count } = await db
        .from('contact_tags')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', args.contactId)
        .eq('tag_id', cfg.operand)
      return (count ?? 0) > 0
    }
    case 'contact_field': {
      if (!args.contactId || !cfg.operand) return false
      // Scope to the account so the condition can't be turned into a
      // cross-tenant read oracle via the service-role client.
      const { data } = await db
        .from('contacts')
        .select(cfg.operand)
        .eq('id', args.contactId)
        .eq('account_id', args.automation.account_id)
        .maybeSingle()
      const v = (data as Record<string, unknown> | null)?.[cfg.operand]
      return v != null && String(v) === String(cfg.value ?? '')
    }
    case 'message_content': {
      const text = (args.context.message_text ?? '').toString()
      return text.toLowerCase().includes((cfg.value ?? '').toLowerCase())
    }
    case 'time_of_day': {
      // operand form "HH:mm-HH:mm" — true if now is within that window
      // (supports over-midnight ranges like "18:00-09:00").
      const [from, to] = (cfg.operand ?? '').split('-')
      if (!from || !to) return false
      const now = new Date()
      const mins = now.getHours() * 60 + now.getMinutes()
      const parse = (s: string) => {
        const [h, m] = s.split(':').map(Number)
        return (h || 0) * 60 + (m || 0)
      }
      const f = parse(from)
      const t = parse(to)
      return f <= t ? mins >= f && mins < t : mins >= f || mins < t
    }
    default:
      return false
  }
}

function waitMs(cfg: WaitStepConfig): number {
  const unitMs = cfg.unit === 'days' ? 86_400_000 : cfg.unit === 'hours' ? 3_600_000 : 60_000
  return Math.max(1_000, cfg.amount * unitMs)
}

function interpolate(s: string, args: ExecuteArgs): string {
  return s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const [ns, prop] = String(key).split('.')
    if (ns === 'message' && prop === 'text') return String(args.context.message_text ?? '')
    if (ns === 'vars' && prop) return String(args.context.vars?.[prop] ?? '')
    return ''
  })
}

async function appendResults(
  logId: string | null,
  newItems: AutomationLogStepResult[],
  status: 'success' | 'partial' | 'failed' | null,
  errorMessage: string | null,
) {
  if (!logId) return
  const db = supabaseAdmin()
  const { data: existing } = await db
    .from('automation_logs')
    .select('steps_executed, status')
    .eq('id', logId)
    .single()
  const merged = [
    ...((existing?.steps_executed as AutomationLogStepResult[] | undefined) ?? []),
    ...newItems,
  ]
  const update: Record<string, unknown> = { steps_executed: merged }
  // Only overwrite status on the outermost scope — nested branches pass null.
  if (status !== null) {
    update.status = status
  }
  if (errorMessage) update.error_message = errorMessage
  await db.from('automation_logs').update(update).eq('id', logId)
}

async function finalizeLog(
  logId: string | null,
  status: 'success' | 'partial' | 'failed',
  errorMessage: string | null,
) {
  if (!logId) return
  await supabaseAdmin()
    .from('automation_logs')
    .update({ status, error_message: errorMessage })
    .eq('id', logId)
}

async function markPending(id: string, status: 'done' | 'failed') {
  await supabaseAdmin()
    .from('automation_pending_executions')
    .update({ status })
    .eq('id', id)
}

// ------------------------------------------------------------
// Google Calendar Helpers
// ------------------------------------------------------------

export async function fetchCalendarBusySlots(accountId: string, token: string, calendarId: string): Promise<string> {
  try {
    const timeMin = new Date().toISOString()
    const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // next 7 days

    const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        items: [{ id: calendarId }],
      }),
    })

    if (!res.ok) {
      const errData = await res.json()
      console.error('[Calendar] Freebusy request failed:', errData)
      return ''
    }

    const data = await res.json()
    const busySlots = data.calendars?.[calendarId]?.busy || []
    if (busySlots.length === 0) {
      return 'لا توجد مواعيد محجوزة حالياً (جميع الأوقات متاحة).'
    }

    const formatted = busySlots
      .map((slot: any) => {
        const start = new Date(slot.start)
        const end = new Date(slot.end)
        const formatDate = (d: Date) => {
          const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Baghdad',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }).formatToParts(d);
          
          const year = parts.find(p => p.type === 'year')?.value;
          const month = parts.find(p => p.type === 'month')?.value;
          const day = parts.find(p => p.type === 'day')?.value;
          const hour = parts.find(p => p.type === 'hour')?.value;
          const minute = parts.find(p => p.type === 'minute')?.value;
          
          return `${year}-${month}-${day} الساعة ${hour}:${minute}`;
        }
        return `- محجوز من: ${formatDate(start)} إلى: ${formatDate(end)}`
      })
      .join('\n')

    return `الأوقات المحجوزة حالياً (غير المتاحة): \n${formatted}`
  } catch (err) {
    console.error('[Calendar] Error fetching busy slots:', err)
    return ''
  }
}

export async function createCalendarEvent(
  accountId: string,
  token: string,
  calendarId: string,
  summary: string,
  description: string,
  startTimeIso: string
): Promise<string> {
  try {
    // Extract numbers to construct local start date strictly to avoid default JS timezone shift
    const match = startTimeIso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    let startStr = '';
    let endStr = '';

    if (match) {
      const [_, y, m, d, h, min] = match;
      startStr = `${y}-${m}-${d}T${h}:${min}:00`;
      
      const startDate = new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min));
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour duration
      const pad = (n: number) => String(n).padStart(2, '0');
      endStr = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}T${pad(endDate.getHours())}:${pad(endDate.getMinutes())}:00`;
    } else {
      const start = new Date(startTimeIso);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      
      const formatToBaghdadISO = (date: Date) => {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Baghdad',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).formatToParts(date);
        const year = parts.find(p => p.type === 'year')?.value;
        const month = parts.find(p => p.type === 'month')?.value;
        const day = parts.find(p => p.type === 'day')?.value;
        const hour = parts.find(p => p.type === 'hour')?.value;
        const minute = parts.find(p => p.type === 'minute')?.value;
        const second = parts.find(p => p.type === 'second')?.value;
        return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
      };

      startStr = formatToBaghdadISO(start);
      endStr = formatToBaghdadISO(end);
    }

    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary,
        description,
        start: {
          dateTime: startStr,
          timeZone: 'Asia/Baghdad',
        },
        end: {
          dateTime: endStr,
          timeZone: 'Asia/Baghdad',
        },
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error?.message || JSON.stringify(data))
    }

    return data.id
  } catch (err: any) {
    console.error('[Calendar] Event creation failed:', err)
    throw new Error(`Failed to create Google Calendar event: ${err.message}`)
  }
}

export async function handleQnaSessionResponse(
  accountId: string,
  contactId: string,
  messageText: string,
  mediaUrl?: string
): Promise<boolean> {
  const db = supabaseAdmin()

  const { data: session, error } = await db
    .from('automation_qna_sessions')
    .select('*')
    .eq('contact_id', contactId)
    .eq('status', 'pending')
    .maybeSingle()

  if (error || !session) {
    return false
  }

  const questions = (session.questions || []) as Array<{
    question_text: string;
    field_name: string;
    expected_type?: 'text' | 'number' | 'media';
  }>
  const currentIndex = session.current_question_index
  const currentQuestion = questions[currentIndex]

  if (!currentQuestion) {
    await db.from('automation_qna_sessions').delete().eq('id', session.id)
    return false
  }

  let responseVal = messageText
  if (currentQuestion.expected_type === 'number') {
    const num = parseFloat(messageText.replace(/[^\d.-]/g, ''))
    if (!isNaN(num)) {
      responseVal = String(num)
    }
  } else if (currentQuestion.expected_type === 'media' && mediaUrl) {
    responseVal = mediaUrl
  }

  const updatedVars = {
    ...(session.vars || {}),
    [currentQuestion.field_name]: responseVal,
  }

  const nextIndex = currentIndex + 1

  if (nextIndex < questions.length) {
    const nextQuestion = questions[nextIndex]
    
    let conversationId = session.context?.conversation_id
    if (!conversationId) {
      const { data: conv } = await db
        .from('conversations')
        .select('id')
        .eq('contact_id', session.contact_id)
        .eq('account_id', session.account_id)
        .maybeSingle()
      conversationId = conv?.id
    }

    await engineSendText({
      accountId: session.account_id,
      userId: session.context?.user_id || session.account_id,
      conversationId: conversationId || '',
      contactId: session.contact_id,
      text: nextQuestion.question_text,
    })

    await db
      .from('automation_qna_sessions')
      .update({
        current_question_index: nextIndex,
        vars: updatedVars,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.id)

  } else {
    await db.from('automation_qna_sessions').delete().eq('id', session.id)

    const { data: automation } = await db
      .from('automations')
      .select('*')
      .eq('id', session.automation_id)
      .maybeSingle()

    if (automation) {
      const currentVars = session.context?.vars || {}
      const mergedVars = { ...currentVars, ...updatedVars }
      const updatedContext = {
        ...(session.context || {}),
        vars: mergedVars,
        message_text: messageText,
      }

      // --- Telegram notification for completed Q&A (fire-and-forget) ---
      try {
        let qnaContactName = 'عميل واتساب'
        let qnaContactPhone = ''
        if (session.contact_id) {
          const { data: cData } = await db
            .from('contacts')
            .select('name, phone')
            .eq('id', session.contact_id)
            .maybeSingle()
          if (cData) {
            qnaContactName = cData.name || qnaContactName
            qnaContactPhone = cData.phone || ''
          }
        }
        notifyAccountViaTelegram(
          session.account_id,
          formatOrderNotification(qnaContactName, qnaContactPhone, mergedVars)
        ).catch(err => console.error('[Telegram] Order notification failed:', err))
      } catch (tgErr) {
        console.error('[Telegram] Failed to prepare order notification:', tgErr)
      }

      await executeStepsFrom({
        automation: automation as Automation,
        contactId: session.contact_id,
        context: updatedContext,
        parentStepId: session.parent_step_id,
        branch: session.branch,
        startPosition: session.next_step_position,
        logId: session.log_id,
        triggerEvent: 'resumed_qna',
      })
    }
  }

  return true
}
