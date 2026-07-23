import { createClient } from '@supabase/supabase-js';
import { sendTextMessage } from './meta-api';
import { sendEvolutionTextMessage } from './evolution-api';

import { hasFeatureAccess } from '@/lib/auth/features';
import { startFollowUpBackgroundWorker } from '@/lib/follow-ups/runner';

// Admin client to safely read configurations and update messages
const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface AutoResponderArgs {
  accountId: string;
  contactId: string;
  conversationId: string;
  messageText: string;
  senderPhone: string;
  phoneNumberId: string;
  accessToken: string;
  configOwnerUserId: string;
  parentMessageId?: string;
}

export async function runAutoResponder(args: AutoResponderArgs) {
  // Ensure in-app follow-up worker is running
  startFollowUpBackgroundWorker();

  const {
    accountId,
    contactId,
    conversationId,
    messageText,
    senderPhone,
    phoneNumberId,
    accessToken,
    configOwnerUserId,
    parentMessageId,
  } = args;

  if (!messageText) return;

  try {
    // 1) First check: Keyword Auto Replies
    const { data: keywordReplies } = await adminSupabase
      .from('auto_replies')
      .select('*')
      .eq('account_id', accountId)
      .eq('is_active', true);

    const cleanText = messageText.trim().toLowerCase();

    if (keywordReplies && keywordReplies.length > 0) {
      for (const reply of keywordReplies) {
        const keyword = reply.keyword.trim().toLowerCase();
        let isMatch = false;

        if (reply.match_type === 'exact') {
          isMatch = cleanText === keyword;
        } else {
          // Default: contains
          isMatch = cleanText.includes(keyword);
        }

        if (isMatch) {
          console.log(`[AutoResponder] Keyword match found for "${reply.keyword}": sending reply.`);
          await sendAndSaveReply({
            replyText: reply.reply_text,
            senderPhone,
            phoneNumberId,
            accessToken,
            conversationId,
            accountId,
            configOwnerUserId,
            parentMessageId,
          });
          return; // Stop processing further (AI is bypassed on keyword matches)
        }
      }
    }

    // 2) Second check: AI Auto Reply (OpenAI & DeepSeek) - only for Pro subscribers (admins bypass this)
    const hasAccess = await hasFeatureAccess(adminSupabase, accountId, 'ai_reply', configOwnerUserId);

    if (hasAccess) {
      const { data: aiConfig } = await adminSupabase
        .from('ai_config')
        .select('*')
        .eq('account_id', accountId)
        .eq('is_active', true)
        .maybeSingle();

      if (aiConfig && aiConfig.api_key) {
        console.log(`[AutoResponder] AI Bot active for account ${accountId}. Calling ${aiConfig.provider}...`);

      // ─── Build conversation history ──────────────────────────────
      const history = await buildConversationHistory(conversationId);

      // ─── Build follow-up context with current date/time ─────────
      let followUpContext = '';
      let accountData: any = null;
      try {
        const { data: acct } = await adminSupabase
          .from('accounts')
          .select('follow_up_action_type, follow_up_reminder_template, follow_up_default_time')
          .eq('id', accountId)
          .maybeSingle();
        accountData = acct;

        const now = new Date();
        const currentDayTime = now.toLocaleString('ar-SA', {
          timeZone: 'Asia/Baghdad',
          dateStyle: 'full',
          timeStyle: 'short',
        });
        
        const isAM = now.getHours() < 12;
        const timeExplanation = isAM 
          ? `ملاحظة زمنية حاسمة: الوقت الحالي هو في الصباح الصباحي (${currentDayTime}). أي مواعيد مسائية لليوم الحالي (مثل الساعة 5:00 عصراً أو مساءً اليوم) لا زالت في المستقبل وقادمة ولم تنتهِ بعد! لا ترفض الحجز لليوم بحجة انتهاء الدوام.` 
          : `الوقت الحالي: ${currentDayTime}.`;

        followUpContext = `\n\n**تعليمات حاسمة ومؤكدة لجدولة التذكيرات والمواعيد (MANDATORY SYSTEM DIRECTIVE):**
${timeExplanation}
أنت مساعد ذكي واحترافي يمتلك ميزة التذكيرات والمتابعة التلقائية وتأكيد المواعيد عبر النظام.
إذا طلب العميل التذكير أو التواصل لاحقاً أو تأكيد حجز (مثال: "ذكرني بعد 10 دقائق"، "اريد ان تراسلني بعد دقيقتين"، "نعم فعل التذكير"، "احجز لي اليوم 5 عصراً"):
1. يمنع منعاً باتاً الاعتذار أو القول "لا أستطيع المراسلة" أو "لا يمكنني التذكير" أو "انتهى وقت الاستقبال".
2. أجب فوراً بلباقة وتأكيد واضح (مثال: "أبشر، تم تأكيد طلبك وسأقوم بتذكيرك والتواصل معك في الوقت المحدد").
3. أدرج التاج التالي بدقة في نهاية ردك:
[SCHEDULE_FOLLOW_UP: السبب | الوقت النسبي | YYYY-MM-DDTHH:mm]

أمثلة توضيحية:
- العميل: "ذكرني بعد دقيقتين" → [SCHEDULE_FOLLOW_UP: تذكير بموعد | بعد دقيقتين | ${new Date(Date.now() + 2 * 60 * 1000).toISOString().substring(0, 16)}]
- العميل: "نعم" (بعد سؤال البوت عن التذكير) → [SCHEDULE_FOLLOW_UP: تذكير بموعد الحجز | بعد دقيقتين | ${new Date(Date.now() + 2 * 60 * 1000).toISOString().substring(0, 16)}]
- العميل: "احجز لي اليوم الساعة 5 العصر" → [SCHEDULE_FOLLOW_UP: حجز موعد 5 عصراً | اليوم 5 عصراً | ${new Date().toISOString().substring(0, 10)}T17:00]`;
      } catch (acctErr) {
        console.error('[AutoResponder] Failed to load account context for follow-up:', acctErr);
      }

      // ─── Build system prompt ─────────────────────────────────────
      const basePrompt = aiConfig.system_prompt || 'أنت مساعد ذكي لخدمة العملاء. أجب على الأسئلة بدقة ولباقة باللغة العربية.';
      const brevityInstruction = '\n\n**تعليمات أسلوب الرد:**\n- أجب دائماً بإيجاز ولباقة (جملة أو جملتين فقط).';
      const compiledSystemPrompt = `${basePrompt}${followUpContext}${brevityInstruction}`;

      // ─── Build LLM messages ──────────────────────────────────────
      const llmMessages: { role: string; content: string }[] = [
        { role: 'system', content: compiledSystemPrompt },
        ...history,
      ];

      // If the incoming message isn't in history yet, append it
      if (
        history.length === 0 ||
        history[history.length - 1].content !== messageText
      ) {
        llmMessages.push({ role: 'user', content: messageText });
      }

      // ─── Query AI model ──────────────────────────────────────────
      let replyText = '';

      if (aiConfig.provider === 'openai') {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${aiConfig.api_key}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: llmMessages,
            max_tokens: 500,
          }),
        });

        const resData = await response.json();
        if (response.ok && resData.choices?.[0]?.message?.content) {
          replyText = resData.choices[0].message.content.trim();
        } else {
          console.error('[AutoResponder] OpenAI API error:', resData.error || resData);
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
            max_tokens: 500,
          }),
        });

        const resData = await response.json();
        if (response.ok && resData.choices?.[0]?.message?.content) {
          replyText = resData.choices[0].message.content.trim();
        } else {
          console.error('[AutoResponder] DeepSeek API error:', resData.error || resData);
        }
      }

      // ─── Process SCHEDULE_FOLLOW_UP tag & Intent Fallback ───────
      if (replyText) {
        let followUpScheduled = false;

        // Check if previous assistant message asked about reminder confirmation
        const lastBotMessage = history.length > 0 ? history[history.length - 1] : null;
        const lastBotAskedReminder = lastBotMessage?.role === 'assistant' && 
          /تذكير|تواصل|موعد|جدولة|نعم/i.test(lastBotMessage.content);

        const isAffirmative = /^(نعم|اي|أجل|اجل|تم|اوكي|أكيد|اكيد|فعل|موافق|تأكيد|تاكيد)$/i.test(messageText.trim());

        // Detect if user explicitly requested a reminder / follow-up or confirmed one
        const isReminderIntent =
          isAffirmative && lastBotAskedReminder ||
          /ذكرني|ذكّرني|نكرني|تذكرني|تذكير|راسلني|تراسلني|تواصل معي|كلمني/i.test(messageText) ||
          /بعد\s*(\d+|دقيق|ساع|يوم|شهر|اسبوع|أسبوع)/i.test(messageText) ||
          /دقيقتين|دقيقتان|ساعتين|ساعتان|غداً|غدا|بكرة|بكره/i.test(messageText);

        const followUpMatch = replyText.match(/\[SCHEDULE_FOLLOW_UP:\s*([^|]+)\|\s*([^|]+)\|\s*([^\]]+)\]/);

        if (followUpMatch) {
          const reason = followUpMatch[1].trim();
          const relativeDesc = followUpMatch[2].trim();
          const targetDateStr = followUpMatch[3].trim();

          try {
            let scheduledAt = parseRelativeTime(relativeDesc || messageText);
            if (targetDateStr && targetDateStr.includes(':') && !isNaN(new Date(targetDateStr).getTime())) {
              const parsedTarget = new Date(targetDateStr);
              if (parsedTarget.getTime() > Date.now()) {
                scheduledAt = parsedTarget;
              }
            }

            const actionType = accountData?.follow_up_action_type || 'both';

            const { error: fupErr } = await adminSupabase.from('follow_ups').insert({
              account_id: accountId,
              contact_id: contactId,
              conversation_id: conversationId,
              reason,
              scheduled_at: scheduledAt.toISOString(),
              action_type: actionType,
              status: 'pending',
            });

            if (!fupErr) {
              followUpScheduled = true;
              console.log('[AutoResponder] ✅ Follow-up scheduled via AI tag:', reason, '→', scheduledAt.toISOString());
            }
          } catch (err: any) {
            console.error('[AutoResponder] Error inserting AI follow-up:', err.message);
          }

          // Strip the tag from replyText
          replyText = replyText.replace(/\[SCHEDULE_FOLLOW_UP:\s*[^\]]+\]/, '').trim();
        } else if (isReminderIntent) {
          // Guaranteed Code Fallback: User asked for reminder or confirmed "نعم", code schedules it directly
          try {
            const scheduledAt = parseRelativeTime(messageText);
            const actionType = accountData?.follow_up_action_type || 'both';

            const { error: fupErr } = await adminSupabase.from('follow_ups').insert({
              account_id: accountId,
              contact_id: contactId,
              conversation_id: conversationId,
              reason: 'تذكير ومتابعة موعد العميل',
              scheduled_at: scheduledAt.toISOString(),
              action_type: actionType,
              status: 'pending',
            });

            if (!fupErr) {
              followUpScheduled = true;
              console.log('[AutoResponder] ✅ Follow-up scheduled via intent fallback:', messageText, '→', scheduledAt.toISOString());
            }
          } catch (err: any) {
            console.error('[AutoResponder] Error in fallback follow-up insertion:', err.message);
          }
        }

        // Also check if reply text mentions confirmed appointment or reminder
        if (!followUpScheduled && /تم تفعيل خدمة التذكير|تم تسجيلك|تأكيد موعدك/i.test(replyText)) {
          try {
            const scheduledAt = parseRelativeTime(replyText);
            const actionType = accountData?.follow_up_action_type || 'both';

            await adminSupabase.from('follow_ups').insert({
              account_id: accountId,
              contact_id: contactId,
              conversation_id: conversationId,
              reason: 'تذكير موعد مؤكد',
              scheduled_at: scheduledAt.toISOString(),
              action_type: actionType,
              status: 'pending',
            });
            console.log('[AutoResponder] ✅ Follow-up scheduled via reply text confirmation');
          } catch (_) {}
        }

        // Sanitize any refusal hallucinations if a follow-up was scheduled or requested
        if (followUpScheduled || isReminderIntent) {
          const refusalPhrases = ['لا أستطيع المراسلة', 'لا يمكنني المراسلة', 'لا أستطيع التذكير', 'لا يمكنني التذكير', 'انتهى وقت استقبال المواعيد'];
          if (refusalPhrases.some((phrase) => replyText.includes(phrase))) {
            replyText = 'أبشر، تم تسجيل طلبك وجدولة التذكير وسأقوم بمراسلتك والتواصل معك في الوقت المحدد بإذن الله 👍';
          }
        }

        await sendAndSaveReply({
          replyText,
          senderPhone,
          phoneNumberId,
          accessToken,
          conversationId,
          accountId,
          configOwnerUserId,
          parentMessageId,
        });
      }
    }
  }
  } catch (err) {
    console.error('[AutoResponder] Error running auto responder logic:', err);
  }
}

/**
 * Build conversation history from the last 20 messages in the conversation.
 * Maps sender_type to OpenAI roles: customer → user, agent/bot → assistant.
 */
async function buildConversationHistory(
  conversationId: string
): Promise<{ role: string; content: string }[]> {
  try {
    const { data: messages, error } = await adminSupabase
      .from('messages')
      .select('sender_type, content_text, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(20);

    if (error || !messages) return [];

    return messages
      .filter((m) => m.content_text)
      .map((m) => ({
        role: m.sender_type === 'customer' ? 'user' : 'assistant',
        content: m.content_text,
      }));
  } catch {
    return [];
  }
}

/**
 * Parse relative time expressions like "بعد دقيقتين", "بعد 10 دقائق", "غداً", "بعد ساعتين"
 * into an absolute Date.
 */
export function parseRelativeTime(relativeDesc: string): Date {
  const now = new Date();
  const rawDesc = relativeDesc.trim().toLowerCase();

  // Convert Arabic numerals (٠١٢٣٤٥٦٧٨٩) to Latin (0123456789)
  const desc = rawDesc.replace(/[٠-٩]/g, (d) =>
    (d.charCodeAt(0) - 1632).toString()
  );

  // 1. Dual minutes: "دقيقتين", "دقيقتان"
  if (desc.includes('دقيقتين') || desc.includes('دقيقتان')) {
    return new Date(now.getTime() + 2 * 60 * 1000);
  }

  // 2. Single minute: "دقيقة" without number
  if (desc.includes('دقيقة') && !/\d/.test(desc)) {
    return new Date(now.getTime() + 1 * 60 * 1000);
  }

  // 3. Dual hours: "ساعتين", "ساعتان"
  if (desc.includes('ساعتين') || desc.includes('ساعتان')) {
    return new Date(now.getTime() + 2 * 60 * 60 * 1000);
  }

  // 4. Single hour: "ساعة" without number
  if (desc.includes('ساعة') && !desc.includes('نصف') && !desc.includes('نص') && !/\d/.test(desc)) {
    return new Date(now.getTime() + 1 * 60 * 60 * 1000);
  }

  // 5. Half hour: "نصف ساعة" or "نص ساعة"
  if (desc.includes('نصف ساعة') || desc.includes('نص ساعة')) {
    return new Date(now.getTime() + 30 * 60 * 1000);
  }

  // 6. Match "بعد X دقيقة/دقائق" or "X دقيقة"
  const minuteMatch = desc.match(/(\d+)\s*(دقيق|d|min|minute)/);
  if (minuteMatch) {
    return new Date(now.getTime() + parseInt(minuteMatch[1], 10) * 60 * 1000);
  }

  // 7. Match "بعد X ساعة/ساعات" or "X ساعة"
  const hourMatch = desc.match(/(\d+)\s*(ساع|h|hr|hour)/);
  if (hourMatch) {
    return new Date(now.getTime() + parseInt(hourMatch[1], 10) * 60 * 60 * 1000);
  }

  // 8. Match "بعد X يوم/أيام" or "X يوم"
  const dayMatch = desc.match(/(\d+)\s*(يوم|أيام|day)/);
  if (dayMatch) {
    return new Date(now.getTime() + parseInt(dayMatch[1], 10) * 24 * 60 * 60 * 1000);
  }

  // 9. Match "غداً" or "بكرة" or "بكره"
  if (desc.includes('غد') || desc.includes('بكر') || desc.includes('tomorrow')) {
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    tomorrow.setHours(10, 0, 0, 0);
    return tomorrow;
  }

  // 10. Match "الأسبوع القادم" / "الاسبوع الجاي"
  if (desc.includes('أسبوع') || desc.includes('اسبوع') || desc.includes('week')) {
    return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  // Fallback: 10 minutes from now if unparseable
  return new Date(now.getTime() + 10 * 60 * 1000);
}

interface SendAndSaveArgs {
  replyText: string;
  senderPhone: string;
  phoneNumberId: string;
  accessToken: string;
  conversationId: string;
  accountId: string;
  configOwnerUserId: string;
  parentMessageId?: string;
}

async function sendAndSaveReply(args: SendAndSaveArgs) {
  const {
    replyText,
    senderPhone,
    phoneNumberId,
    accessToken,
    conversationId,
    accountId,
    configOwnerUserId,
    parentMessageId,
  } = args;

  try {
    // 1) Send message via appropriate API (Meta or Evolution)
    const { data: config } = await adminSupabase
      .from('whatsapp_config')
      .select('connection_type, evolution_api_url')
      .eq('account_id', accountId)
      .maybeSingle();

    let messageId = '';

    if (config?.connection_type === 'evolution') {
      const evoResult = await sendEvolutionTextMessage(
        phoneNumberId,
        accessToken,
        senderPhone,
        replyText,
        config.evolution_api_url
      );
      messageId = evoResult.messageId;
    } else {
      const metaResult = await sendTextMessage({
        phoneNumberId,
        accessToken,
        to: senderPhone,
        text: replyText,
        contextMessageId: parentMessageId,
      });
      messageId = metaResult.messageId;
    }

    if (messageId) {
      // 2) Save outbound message to DB as agent/system
      const { error: msgError } = await adminSupabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_type: 'agent',
          content_type: 'text',
          content_text: replyText,
          message_id: messageId,
          status: 'sent',
          created_at: new Date().toISOString(),
        });

      if (msgError) console.error('[AutoResponder] Error inserting AI message reply:', msgError);

      // 3) Update conversation last text and timestamp
      const { error: convError } = await adminSupabase
        .from('conversations')
        .update({
          last_message_text: replyText,
          last_message_at: new Date().toISOString(),
          unread_count: 0, // Reset to zero because bot has replied
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);

      if (convError) console.error('[AutoResponder] Error updating conversation on AI reply:', convError);
    }
  } catch (err) {
    console.error('[AutoResponder] Failed to send or save autoreply:', err);
  }
}
