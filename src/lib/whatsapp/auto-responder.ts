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

        const currentDayTime = new Date().toLocaleString('ar-SA', {
          timeZone: 'Asia/Baghdad',
          dateStyle: 'full',
          timeStyle: 'short',
        });

        followUpContext = `\n\n**معلومات المتابعة التلقائية (AI Follow-up):**
تاريخ ووقت اليوم الحالي هو: ${currentDayTime} (تنسيق ISO: ${new Date().toISOString()}).
إذا أبدى العميل رغبة في التذكير أو المتابعة بعد فترة معينة (مثال: "ذكرني بعد 10 دقائق"، "تواصل معي بعد يومين"، "بكرة كلمني"، "بعد ساعة"، "اريد ان تراسلني بعد دقيقتين"), يجب عليك:
1. الرد بتأكيد أنك ستذكّره أو تواصل معه في الوقت المطلوب.
2. إضافة التاج التالي بدقة في نهاية ردك:
[SCHEDULE_FOLLOW_UP: السبب | الوقت النسبي | YYYY-MM-DDTHH:mm]
حيث:
- السبب: وصف مختصر لسبب المتابعة (مثال: تذكير بموعد الحجز).
- الوقت النسبي: ما قاله العميل (مثال: بعد دقيقتين، بعد 10 دقائق، غداً، بعد ساعتين).
- YYYY-MM-DDTHH:mm: التاريخ والوقت الفعلي المحسوب بناءً على الوقت الحالي.

أمثلة:
- إذا كان الآن 2026-07-23T04:30 وقال العميل "ذكرني بعد دقيقتين" → [SCHEDULE_FOLLOW_UP: تذكير لحجز موعد | بعد دقيقتين | 2026-07-23T04:32]
- إذا كان الآن 2026-07-23T04:30 وقال العميل "ذكرني بعد 10 دقائق" → [SCHEDULE_FOLLOW_UP: تذكير حسب طلب العميل | بعد 10 دقائق | 2026-07-23T04:40]
- إذا كان الآن 2026-07-23T04:30 وقال العميل "ذكرني بكرة" → [SCHEDULE_FOLLOW_UP: تذكير حسب طلب العميل | غداً | 2026-07-24T10:00]

هام جداً: يجب أن تضيف التاج دائماً عند طلب التذكير. لا تقل أبداً "لا أستطيع التذكير".`;
      } catch (acctErr) {
        console.error('[AutoResponder] Failed to load account context for follow-up:', acctErr);
      }

      // ─── Build system prompt ─────────────────────────────────────
      const basePrompt = aiConfig.system_prompt || 'You are a helpful customer assistant.';
      const brevityInstruction = '\n\n**تعليمات هامة:**\n- أجب دائماً بإيجاز شديد (جملتين إلى ثلاث جمل كحد أقصى).\n- Always answer very briefly (maximum 2 to 3 sentences).';
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

      // ─── Process SCHEDULE_FOLLOW_UP tag ──────────────────────────
      if (replyText) {
        const followUpMatch = replyText.match(/\[SCHEDULE_FOLLOW_UP:\s*([^|]+)\|\s*([^|]+)\|\s*([^\]]+)\]/);
        if (followUpMatch) {
          const reason = followUpMatch[1].trim();
          const relativeDesc = followUpMatch[2].trim();
          const targetDateStr = followUpMatch[3].trim();

          try {
            // First check relative time parsing for accuracy
            let scheduledAt = parseRelativeTime(relativeDesc || messageText);
            
            // If parseRelativeTime used fallback and targetDateStr is valid ISO with time:
            if (targetDateStr && targetDateStr.includes(':') && !isNaN(new Date(targetDateStr).getTime())) {
              const parsedTarget = new Date(targetDateStr);
              // Only override if targetDateStr is in the future
              if (parsedTarget.getTime() > Date.now()) {
                scheduledAt = parsedTarget;
              }
            }

            // Determine action type from account settings
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

            if (fupErr) {
              console.error('[AutoResponder] Follow-up insert failed:', fupErr.message);
            } else {
              console.log('[AutoResponder] ✅ Follow-up scheduled:', reason, '→', scheduledAt.toISOString());
            }
          } catch (err: any) {
            console.error('[AutoResponder] Error calculating follow-up:', err.message);
          }

          // Clean the tag from the reply text so the customer doesn't see it
          replyText = replyText.replace(/\[SCHEDULE_FOLLOW_UP:\s*[^\]]+\]/, '').trim();
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
function parseRelativeTime(relativeDesc: string): Date {
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
