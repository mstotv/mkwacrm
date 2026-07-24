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
            calendarContext = `

**تعليمات تقنية لإدارة وحجز المواعيد (Technical Calendar API Instructions - Business-Neutral):**
- تاريخ اليوم الحالي هو: ${new Date().toISOString().split('T')[0]}
- تتوفر لديك أداة للتحقق من المواعيد وحجزها في تقويم عيادة/مركز العمل.
- **الأوقات المزدحمة المحجوزة حالياً (يُمنع الحجز فيها):**
${busySlotsText}
- **شروط حجز موعد جديد:**
  * استخدم أداة الحجز فقط إذا طلب العميل **صراحة** حجز موعد أو موعد زيارة أو تحديد وقت محدد للقاء.
  * **يُمنع منعاً باتاً** استخدام وسوم المواعيد أو إرفاقها لطلبات الشراء العادية، أو حجز المنتجات المادية (مثل الأحذية أو الملابس)، أو طلبات التوصيل/الطعام.
  * لحجز موعد متفق عليه، أدرج الوسم التالي بدقة في نهاية ردك: [BOOK_APPOINTMENT: YYYY-MM-DDTHH:mm:ss] (مثال: [BOOK_APPOINTMENT: 2026-07-25T15:00:00]).
  * إذا كان الحجز لشخص آخر، استخدم الصيغة: [BOOK_APPOINTMENT: YYYY-MM-DDTHH:mm:ss | patient_name | patient_phone].
- **شروط إلغاء أو معرفة المواعيد:**
  * عندما يطلب العميل معرفة مواعيده أو إلغاءها، استخدم الوسم: [FIND_MY_APPOINTMENTS] للبحث أولاً.
  * بعد استلام النتائج، لإلغاء موعد محدد بناءً على طلب العميل، استخدم الوسم: [CANCEL_APPOINTMENT: appointment_id].`
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

        followUpContext = `

**تعليمات تقنية لجدولة التذكيرات والمتابعة (Technical Follow-up Instructions - Business-Neutral):**
- الوقت والتاريخ الحالي هو: ${currentDayTime}
- تتوفر لديك أداة لجدولة تذكيرات لمتابعة العملاء لاحقاً.
- **شروط استدعاء الأداة:**
  * استخدم هذه الأداة **فقط** إذا طلب العميل صراحة تذكيره أو الاتصال به لاحقاً (مثال: "ذكرني بعد ساعة", "تواصل معي غداً", "سأفكر وأرد عليكم لاحقاً").
  * **يُمنع تماماً** جدولة متابعات للمشتريات العادية أو الاستفسارات العامة ما لم يطلب العميل تذكيراً صريحاً.
  * لجدولة تذكير، أدرج الوسم التالي بدقة في نهاية ردك: [SCHEDULE_FOLLOW_UP: السبب | الوقت النسبي | YYYY-MM-DDTHH:mm] (مثال: [SCHEDULE_FOLLOW_UP: تذكير بموعد الحجز | بعد ساعتين | ${new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().substring(0, 16)}]).`
      } catch (acctErr) {
        console.error('[automations] Failed to load account context for follow-up:', acctErr)
      }

      const systemPrompt =
        cfg.system_prompt ||
        aiConfig.system_prompt ||
        'You are a helpful customer assistant.'

      const generalTechnicalInstructions = `

**توجيهات تشغيلية حاسمة (General Operational Directives - Mandatory):**
1. **الالتزام المطلق بالهوية:** نطاق عملك وهويتك يتم تحديدها **حصرياً** بواسطة رسالة النظام (System Prompt) المكتوبة أعلاه من قبل المستخدم. لا تفترض أي تخصص آخر (مثل حجز المواعيد أو الخدمات الطبية) ما لم تطلب رسالة النظام ذلك صراحة.
2. **منع الاختلاق وتأكيد المعلومات (No Hallucinations):** لا تفترض أو تخترع أي تفاصيل لم يذكرها العميل صراحة (مثل طريقة الدفع، تكلفة الشحن، المقاس، اللون، الكمية، أو العناوين). إذا كانت هناك تفاصيل ضرورية ناقصة لإتمام الطلب، اسأل العميل عنها بلباقة بدلاً من افتراض قيم افتراضية أو اختلاقها.
3. **عدم تأكيد إجراءات غير منفذة:** لا تؤكد للعميل إتمام أي إجراء يتطلب استدعاء أداة (مثل حجز موعد أو جدولة تذكير) ما لم تقم بإرفاق الوسم (Tag) البرمجي المقابل له في ردك.
4. **الفصل التام بين السياقات:** لا تخلط بين حجز المواعيد (في التقويم) وتأكيد طلبات شراء المنتجات. يُمنع منعاً باتاً استدعاء أدوات الكالندر أو حجز المواعيد عند شراء أو تأكيد طلب منتج مادي.
`

      // Append default brevity instruction to system prompt
      const brevityInstruction = '\n\n**تعليمات هامة لأسلوب الرد / Important reply instructions:**\n- أجب دائماً بإيجاز شديد (جملتين إلى ثلاث جمل كحد أقصى)، بما يكفي لإعطاء العميل المعلومة الكافية دون إطالة أو حشو.\n- Always answer very briefly (maximum 2 to 3 sentences), enough to give the customer sufficient information without lengthiness.'
      const compiledSystemPrompt = `${systemPrompt}${calendarContext}${followUpContext}${generalTechnicalInstructions}${brevityInstruction}`

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
      let loopCount = 0
      const maxLoops = 3
      const aiConfigUpdatedMessages = [...llmMessages]
      let appointmentBookedSuccessfully = false
      let hasBookTag = false

      while (loopCount < maxLoops) {
        replyText = ''

        if (aiConfig.provider === 'openai') {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${aiConfig.api_key}`,
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: aiConfigUpdatedMessages,
              max_tokens: 500,
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
              messages: aiConfigUpdatedMessages,
              max_tokens: 500,
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

        // --- 1. Intercept FIND_MY_APPOINTMENTS tag ---
        if (replyText.includes('[FIND_MY_APPOINTMENTS]')) {
          console.log('[automations] Tag Intercepted: FIND_MY_APPOINTMENTS')
          const { data: appts } = await db
            .from('appointments')
            .select('id, patient_name, patient_phone, scheduled_at')
            .eq('contact_id', args.contactId)
            .eq('status', 'confirmed')
            .order('scheduled_at', { ascending: true })

          let apptText = ''
          if (!appts || appts.length === 0) {
            apptText = 'لا توجد مواعيد مؤكدة حالياً لهذه المحادثة.'
          } else {
            apptText = 'النتائج الفعلية للمواعيد المؤكدة المرتبطة بك في قاعدة البيانات:\n' + appts.map((ap, idx) => {
              const d = new Date(ap.scheduled_at)
              const formatted = d.toLocaleString('ar-SA', { timeZone: 'Asia/Baghdad', dateStyle: 'full', timeStyle: 'short' })
              return `- [رقم الموعد: ${ap.id}] صاحب الموعد: ${ap.patient_name} (${ap.patient_phone || 'بدون هاتف'}) | الوقت: ${formatted}`
            }).join('\n')
          }

          aiConfigUpdatedMessages.push({ role: 'assistant', content: replyText })
          aiConfigUpdatedMessages.push({ 
            role: 'user', 
            content: `[FIND_MY_APPOINTMENTS_RESULT]\n${apptText}\n\nالرجاء صياغة رد للعميل بناءً على هذه المواعيد الحقيقية فقط وسؤاله أي موعد يقصد إن وجد أكثر من موعد، أو تأكيد رغبته في الإلغاء إن كان هناك موعد واحد.` 
          })

          loopCount++
          continue
        }

        // --- 2. Intercept CANCEL_APPOINTMENT tag ---
        const cancelMatch = replyText.match(/\[CANCEL_APPOINTMENT:\s*([^\]]+)\]/)
        if (cancelMatch) {
          const appointmentId = cancelMatch[1].trim()
          console.log('[automations] Tag Intercepted: CANCEL_APPOINTMENT for ID:', appointmentId)
          let cancelResultText = ''
          
          try {
            const { data: appt } = await db
              .from('appointments')
              .select('*')
              .eq('id', appointmentId)
              .maybeSingle()

            if (appt) {
              if (googleToken) {
                const deleted = await deleteCalendarEvent(args.automation.account_id, googleToken, calendarId, appt.calendar_event_id)
                if (deleted) {
                  await db
                    .from('appointments')
                    .update({ status: 'cancelled' })
                    .eq('id', appointmentId)
                  cancelResultText = 'تم إلغاء الموعد بنجاح من تقويم Google Calendar وقاعدة البيانات.'
                } else {
                  cancelResultText = 'فشل إلغاء الموعد من Google Calendar.'
                }
              } else {
                cancelResultText = 'فشل الإلغاء لعدم وجود حساب Google مرتبط بالمنصة.'
              }
            } else {
              cancelResultText = 'لم يتم العثور على الموعد المحدد في قاعدة البيانات (قد يكون ملغياً بالفعل).'
            }
          } catch (err: any) {
            cancelResultText = `خطأ أثناء معالجة الإلغاء: ${err.message}`
          }

          aiConfigUpdatedMessages.push({ role: 'assistant', content: replyText })
          aiConfigUpdatedMessages.push({ 
            role: 'user', 
            content: `[CANCEL_APPOINTMENT_RESULT]\nالنتيجة: ${cancelResultText}\n\nأبلغ العميل بنتيجة الإلغاء بلباقة واختصار.` 
          })

          loopCount++
          continue
        }

        // --- 3. Intercept BOOK_APPOINTMENT tag ---
        const appointmentMatch = replyText.match(/\[BOOK_APPOINTMENT:\s*([^\]]+)\]/)
        if (appointmentMatch && googleToken) {
          hasBookTag = true
          const parts = appointmentMatch[1].split('|').map(p => p.trim())
          const appointmentTime = parts[0]
          let patientName = parts[1] || ''
          let patientPhone = parts[2] || ''

          try {
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

            if (!patientName) patientName = contactName
            if (!patientPhone) patientPhone = contactPhone

            const summary = `موعد مع: ${patientName}`
            let description = `تم الحجز تلقائياً عبر واتساب.`
            if (patientName !== contactName || patientPhone !== contactPhone) {
              description += `\nالحجز عبر واتساب رقم: ${contactPhone} (${contactName})\nلصاحب الموعد الفعلي: ${patientName} | رقم هاتف صاحب الموعد: ${patientPhone}`
            } else {
              description += `\nالاسم: ${contactName}\nالهاتف: ${contactPhone}`
            }

            console.log('[Calendar] Booking event at:', appointmentTime)
            const eventResult = await createCalendarEvent(
              args.automation.account_id,
              googleToken,
              calendarId,
              summary,
              description,
              appointmentTime,
              conversationId,
              args.contactId || undefined,
              patientName,
              patientPhone
            )
            
            const eventId = eventResult?.id
            const htmlLink = eventResult?.htmlLink
            
            if (eventId) {
              appointmentBookedSuccessfully = true
              console.log('[Calendar] Booked event successfully. Event ID:', eventId)

              // Send Telegram notification
              notifyAccountViaTelegram(
                args.automation.account_id,
                formatAppointmentNotification(
                  contactName,
                  contactPhone,
                  appointmentTime,
                  description,
                  patientName,
                  patientPhone,
                  eventId,
                  htmlLink
                )
              ).catch(err => console.error('[Telegram] Appointment notification failed:', err))
            }
          } catch (bookErr: any) {
            console.error('[Calendar] Auto booking failed:', bookErr)
          }

          replyText = replyText.replace(/\[BOOK_APPOINTMENT:\s*[^\]]+\]/, '').trim()
        }

        break
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

      // ─── Smart Order Data Extraction from Full Conversation ─────
      // After the AI reply is ready, extract structured order/customer data
      // from the FULL conversation so that subsequent steps (Google Sheets,
      // Telegram) can access them via contact.* fields and vars.order_* variables.
      try {
        // 1) Read full conversation history (last 20 messages) for extraction
        const { data: extractMsgs } = await db
          .from('messages')
          .select('sender_type, content_text')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(20)

        const extractHistory = (extractMsgs ?? [])
          .reverse()
          .map(m => `${m.sender_type === 'customer' ? 'العميل' : 'المساعد'}: ${m.content_text || ''}`)
          .filter(line => line.length > 5)
          .join('\n')

        if (extractHistory.length > 50) {
          // 2) Build extraction prompt (business-neutral, extracts ALL mentioned details)
          const extractionSystemPrompt = `You are a precise data extraction assistant. Read the following conversation between a customer and an AI assistant, then extract ALL mentioned customer and order details into a single flat JSON object.

Keys to extract (use null if not mentioned):
- customer_name: Full name of the customer
- customer_phone: Phone number
- customer_address: Delivery/location address
- product_name: Name of the product or service requested
- product_color: Color mentioned
- product_size: Size/measurement mentioned
- quantity: Quantity mentioned
- unit_price: Unit price mentioned
- shipping_cost: Shipping/delivery cost mentioned
- total_price: Total price mentioned
- payment_method: Payment method mentioned
- notes: Any additional notes or special requests

IMPORTANT: Only extract values explicitly mentioned in the conversation. Do NOT invent or assume any values. Return raw JSON only, no markdown.`

          const extractionUserMessage = `Extract all customer and order details from this conversation:\n\n${extractHistory}`

          let extractedJson: any = null
          const extractMessages = [
            { role: 'system', content: extractionSystemPrompt },
            { role: 'user', content: extractionUserMessage }
          ]

          // 3) Call AI model for extraction (same provider/key as the main AI)
          if (aiConfig.provider === 'openai') {
            const extractRes = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${aiConfig.api_key}`,
              },
              body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: extractMessages,
                response_format: { type: 'json_object' },
                max_tokens: 400,
              }),
            })
            const extractData = await extractRes.json()
            if (extractRes.ok && extractData.choices?.[0]?.message?.content) {
              extractedJson = JSON.parse(extractData.choices[0].message.content.trim())
            }
          } else if (aiConfig.provider === 'deepseek') {
            const extractRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${aiConfig.api_key}`,
              },
              body: JSON.stringify({
                model: 'deepseek-chat',
                messages: extractMessages,
                response_format: { type: 'json_object' },
                max_tokens: 400,
              }),
            })
            const extractData = await extractRes.json()
            if (extractRes.ok && extractData.choices?.[0]?.message?.content) {
              extractedJson = JSON.parse(extractData.choices[0].message.content.trim())
            }
          }

          if (extractedJson) {
            console.log('[automations] Extracted order data from conversation:', JSON.stringify(extractedJson))

            // 4) Save all extracted fields as workflow context variables (vars.order_*)
            const fieldMap: Record<string, string> = {
              customer_name: 'order_customer_name',
              customer_phone: 'order_customer_phone',
              customer_address: 'order_customer_address',
              product_name: 'order_product_name',
              product_color: 'order_product_color',
              product_size: 'order_product_size',
              quantity: 'order_quantity',
              unit_price: 'order_unit_price',
              shipping_cost: 'order_shipping_cost',
              total_price: 'order_total_price',
              payment_method: 'order_payment_method',
              notes: 'order_notes',
            }

            for (const [jsonKey, varKey] of Object.entries(fieldMap)) {
              if (extractedJson[jsonKey] != null) {
                args.context.vars[varKey] = String(extractedJson[jsonKey])
              }
            }

            // Build a formatted order summary for vars.order_summary
            const summaryParts: string[] = []
            if (extractedJson.customer_name) summaryParts.push(`الاسم: ${extractedJson.customer_name}`)
            if (extractedJson.customer_phone) summaryParts.push(`الهاتف: ${extractedJson.customer_phone}`)
            if (extractedJson.product_name) summaryParts.push(`المنتج: ${extractedJson.product_name}`)
            if (extractedJson.product_color) summaryParts.push(`اللون: ${extractedJson.product_color}`)
            if (extractedJson.product_size) summaryParts.push(`المقاس: ${extractedJson.product_size}`)
            if (extractedJson.quantity) summaryParts.push(`الكمية: ${extractedJson.quantity}`)
            if (extractedJson.unit_price) summaryParts.push(`السعر: ${extractedJson.unit_price}`)
            if (extractedJson.shipping_cost) summaryParts.push(`الشحن: ${extractedJson.shipping_cost}`)
            if (extractedJson.total_price) summaryParts.push(`الإجمالي: ${extractedJson.total_price}`)
            if (extractedJson.customer_address) summaryParts.push(`العنوان: ${extractedJson.customer_address}`)
            if (extractedJson.payment_method) summaryParts.push(`الدفع: ${extractedJson.payment_method}`)
            if (extractedJson.notes) summaryParts.push(`ملاحظات: ${extractedJson.notes}`)
            args.context.vars.order_summary = summaryParts.join('\n')

            // 5) Update the contact database record so contact.* fields work in Google Sheets mappings
            if (args.contactId) {
              const contactUpdate: Record<string, any> = {}
              if (extractedJson.customer_name) contactUpdate.name = String(extractedJson.customer_name).trim()
              if (extractedJson.customer_address) contactUpdate.address = String(extractedJson.customer_address).trim()
              if (extractedJson.product_color) contactUpdate.color = String(extractedJson.product_color).trim()

              if (Object.keys(contactUpdate).length > 0) {
                contactUpdate.updated_at = new Date().toISOString()
                const { error: updateErr } = await db
                  .from('contacts')
                  .update(contactUpdate)
                  .eq('id', args.contactId)
                  .eq('account_id', args.automation.account_id)
                if (updateErr) {
                  console.error('[automations] Failed to update contact with extracted order data:', updateErr)
                } else {
                  console.log('[automations] Updated contact record with extracted data:', Object.keys(contactUpdate).join(', '))
                }
              }
            }
          }
        }
      } catch (extractErr: any) {
        // Non-critical: extraction failure should NOT block the AI reply from being sent
        console.error('[automations] Order data extraction failed (non-blocking):', extractErr.message)
      }

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
            case 'order_summary':
              resolvedValue = String(args.context?.vars?.['order_summary'] || '')
              break
            case 'product_name':
              resolvedValue = String(args.context?.vars?.['order_product_name'] || '')
              break
            case 'product_color':
              resolvedValue = String(args.context?.vars?.['order_product_color'] || contactData?.color || '')
              break
            case 'product_size':
              resolvedValue = String(args.context?.vars?.['order_product_size'] || '')
              break
            case 'quantity':
              resolvedValue = String(args.context?.vars?.['order_quantity'] || '')
              break
            case 'total_price':
              resolvedValue = String(args.context?.vars?.['order_total_price'] || '')
              break
            case 'payment_method':
              resolvedValue = String(args.context?.vars?.['order_payment_method'] || '')
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

      // Send Telegram notification with all saved fields
      try {
        let contactName = 'عميل واتساب'
        let contactPhone = ''
        if (args.contactId) {
          const { data: cData } = await db
            .from('contacts')
            .select('name, phone')
            .eq('id', args.contactId)
            .maybeSingle()
          if (cData) {
            contactName = cData.name || contactName
            contactPhone = cData.phone || ''
          }
        }

        // Enrich Telegram notification with extracted order data from AI
        const enrichedFields: Record<string, string> = { ...rowValues }
        const orderVars = args.context?.vars || {}
        const orderFieldLabels: Record<string, string> = {
          order_customer_name: 'اسم العميل',
          order_product_name: 'المنتج',
          order_product_color: 'اللون',
          order_product_size: 'المقاس',
          order_quantity: 'الكمية',
          order_unit_price: 'السعر',
          order_shipping_cost: 'الشحن',
          order_total_price: 'الإجمالي',
          order_customer_address: 'العنوان',
          order_payment_method: 'طريقة الدفع',
          order_notes: 'ملاحظات',
        }
        for (const [varKey, label] of Object.entries(orderFieldLabels)) {
          const val = orderVars[varKey]
          if (val && String(val).trim() && !Object.values(enrichedFields).includes(String(val))) {
            enrichedFields[label] = String(val)
          }
        }

        await notifyAccountViaTelegram(
          args.automation.account_id,
          formatOrderNotification(contactName, contactPhone, enrichedFields)
        )
      } catch (tgErr) {
        console.error('[Telegram] Failed to send Sheet row notification:', tgErr)
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
  startTimeIso: string,
  conversationId?: string,
  contactId?: string,
  patientName?: string,
  patientPhone?: string
): Promise<{ id: string; htmlLink?: string }> {
  try {
    // Extract numbers to construct local start date strictly to avoid default JS timezone shift
    const match = startTimeIso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    let startStr = '';
    let endStr = '';

    if (match) {
      const [_, y, m, d, h, min] = match;
      startStr = `${y}-${m}-${d}T${h}:${min}:00+03:00`;
      
      const startDate = new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min));
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour duration
      const pad = (n: number) => String(n).padStart(2, '0');
      endStr = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}T${pad(endDate.getHours())}:${pad(endDate.getMinutes())}:00+03:00`;
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
        return `${year}-${month}-${day}T${hour}:${minute}:${second}+03:00`;
      };

      startStr = formatToBaghdadISO(start);
      endStr = formatToBaghdadISO(end);
    }

    console.log('[Calendar API] Sending event to Google Calendar:', { calendarId, startStr, endStr, summary });

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
      console.error('[Google Calendar API Error] HTTP', res.status, data);
      throw new Error(data.error?.message || JSON.stringify(data))
    }

    const eventId = data.id
    const htmlLink = data.htmlLink

    // Save record in appointments table
    if (conversationId && contactId) {
      const db = supabaseAdmin()
      const cleanPatientName = patientName || summary.replace('موعد مع العميل: ', '').replace('موعد مع: ', '').trim()
      
      // We parse the local time string or startTimeIso into ISO standard timestamp to store in DB
      let dbScheduledAt = startStr;
      if (!startStr.includes('+')) {
        // Assume Baghdad offset +03:00 if not specified
        dbScheduledAt = `${startStr}+03:00`;
      }

      const { error: dbErr } = await db.from('appointments').insert({
        account_id: accountId,
        conversation_id: conversationId,
        contact_id: contactId,
        patient_name: cleanPatientName || 'عميل واتساب',
        patient_phone: patientPhone || '',
        calendar_event_id: eventId,
        scheduled_at: dbScheduledAt,
        status: 'confirmed',
      })
      if (dbErr) {
        console.error('[Calendar] Failed to save appointment record:', dbErr.message)
      } else {
        console.log('[Calendar] Saved appointment record in DB for event:', eventId)
      }
    }

    return { id: eventId, htmlLink }
  } catch (err: any) {
    console.error('[Calendar] Event creation failed:', err)
    throw new Error(`Failed to create Google Calendar event: ${err.message}`)
  }
}

export async function deleteCalendarEvent(
  accountId: string,
  token: string,
  calendarId: string,
  eventId: string
): Promise<boolean> {
  try {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!res.ok) {
      if (res.status === 410 || res.status === 404) {
        console.warn('[Calendar] Event already deleted or not found in Google Calendar:', eventId)
        return true
      }
      const data = await res.json()
      throw new Error(data.error?.message || JSON.stringify(data))
    }

    return true
  } catch (err: any) {
    console.error('[Calendar] Event deletion failed:', err)
    throw new Error(`Failed to delete Google Calendar event: ${err.message}`)
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
