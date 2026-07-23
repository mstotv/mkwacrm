import { createClient } from '@supabase/supabase-js';
import { sendTextMessage } from './meta-api';
import { sendEvolutionTextMessage } from './evolution-api';

import { hasFeatureAccess } from '@/lib/auth/features';
import { startFollowUpBackgroundWorker } from '@/lib/follow-ups/runner';
import { getGoogleSheetsConfig, getFreshTokenForAccount } from '@/lib/whatsapp/google-sheets';
import { fetchCalendarBusySlots, createCalendarEvent } from '@/lib/automations/engine';
import { getBaghdadParts, createDateFromBaghdadParts, parseLocalTimeString } from './timezone-utils';

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

      // ─── Fetch calendar busy slots if a Google Account is connected ──────
      let calendarContext = '';
      let googleToken = '';
      let googleAccountId = '';
      let calendarId = 'primary';
      try {
        const { accounts } = await getGoogleSheetsConfig(accountId);
        if (accounts && accounts.length > 0) {
          googleAccountId = accounts[0].id;
          googleToken = await getFreshTokenForAccount(accountId, googleAccountId);
          calendarId = accounts[0].calendar_id || 'primary';
          const busySlotsText = await fetchCalendarBusySlots(accountId, googleToken, calendarId);
          if (busySlotsText) {
            calendarContext = `\n\n**معلومات المواعيد في تقويم Google Calendar (هام جداً):**
تاريخ اليوم الحالي هو: ${new Date().toISOString().split('T')[0]}
${busySlotsText}

**تعليمات الحجز والتقويم:**
- يُحظر تماماً اقتراح أو تأكيد أي موعد للعميل يقع في الأوقات المحجوزة أعلاه.
- لا يجوز أبداً تأكيد حجز أي موعد للعميل نصياً إلا بعد إرفاق التاج التالي بدقة في نهاية ردك:
[BOOK_APPOINTMENT: YYYY-MM-DDTHH:mm:ss]
حيث YYYY-MM-DDTHH:mm:ss هو تاريخ ووقت الموعد المتفق عليه بتنسيق ISO.
- إذا ذكر العميل أن الحجز لشخص آخر (أو باسم شخص آخر مثل: "أمي" أو "زوجتي" أو "باسم محمد")، يجب عليك استخراج الاسم والرقم (إن وجد) لصاحب الموعد الفعلي بشكل منفصل عن جهة اتصال واتساب الحالية وتمريره في التاج كالتالي:
[BOOK_APPOINTMENT: YYYY-MM-DDTHH:mm:ss | patient_name | patient_phone]
مثال: [BOOK_APPOINTMENT: 2026-07-25T15:00:00 | محمد علي | 07701234567]
- في حال كان الوقت المطلوب من العميل محجوزاً أو خارج ساعات العمل (من 2:00 ظهراً وحتى 8:00 مساءً)، اعتذر للعميل واقترح عليه موعداً بديلاً متوفراً حقيقياً من الأوقات المتاحة، ولا تخترع أي موعد وهمي.

**تعليمات البحث وإلغاء المواعيد:**
- عندما يطلب العميل معرفة مواعيده، أو إلغاء موعد، أو تعديله، يجب عليك أولاً وقبل كل شيء استدعاء التاج التالي للبحث في قاعدة البيانات:
[FIND_MY_APPOINTMENTS]
- يمنع منعاً باتاً افتراض أي تفاصيل موعد من الذاكرة النصية للمحادثة فقط عند الإلغاء؛ يجب دائماً استدعاء [FIND_MY_APPOINTMENTS] أولاً.
- بعد استدعاء التاج، سيرجع لك النظام النتائج في الرسالة التالية بصيغة [FIND_MY_APPOINTMENTS_RESULT].
- بمجرد حصولك على النتائج:
  * إذا لم يكن هناك موعد، أبلغ العميل بلباقة.
  * إذا كان هناك موعد واحد وطلب العميل إلغاءه، استدعِ التاج: [CANCEL_APPOINTMENT: appointment_id] (استبدل appointment_id بالمعرف الفعلي للموعد المسترجع).
  * إذا وجد أكثر من موعد، اعرضها واسأله أيها يقصد بالتحديد، ثم بعد استجابته استدعِ [CANCEL_APPOINTMENT: appointment_id] للموعد المختار.`;
          }
        }
      } catch (calErr) {
        console.error('[AutoResponder] Failed to load calendar context:', calErr);
      }

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
      const compiledSystemPrompt = `${basePrompt}${calendarContext}${followUpContext}${brevityInstruction}`;

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
      let loopCount = 0;
      const maxLoops = 3;
      const aiConfigUpdatedMessages = [...llmMessages];
      let appointmentBookedSuccessfully = false;
      let hasBookTag = false;

      while (loopCount < maxLoops) {
        replyText = '';

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
              messages: aiConfigUpdatedMessages,
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

        if (!replyText) break;

        // --- 1. Intercept FIND_MY_APPOINTMENTS tag ---
        if (replyText.includes('[FIND_MY_APPOINTMENTS]')) {
          console.log('[AutoResponder] Tag Intercepted: FIND_MY_APPOINTMENTS');
          const { data: appts } = await adminSupabase
            .from('appointments')
            .select('id, patient_name, patient_phone, scheduled_at')
            .eq('contact_id', contactId)
            .eq('status', 'confirmed')
            .order('scheduled_at', { ascending: true });

          let apptText = '';
          if (!appts || appts.length === 0) {
            apptText = 'لا توجد مواعيد مؤكدة حالياً لهذه المحادثة.';
          } else {
            apptText = 'النتائج الفعلية للمواعيد المؤكدة المرتبطة بك في قاعدة البيانات:\n' + appts.map((ap, idx) => {
              const d = new Date(ap.scheduled_at);
              const formatted = d.toLocaleString('ar-SA', { timeZone: 'Asia/Baghdad', dateStyle: 'full', timeStyle: 'short' });
              return `- [رقم الموعد: ${ap.id}] صاحب الموعد: ${ap.patient_name} (${ap.patient_phone || 'بدون هاتف'}) | الوقت: ${formatted}`;
            }).join('\n');
          }

          aiConfigUpdatedMessages.push({ role: 'assistant', content: replyText });
          aiConfigUpdatedMessages.push({ 
            role: 'user', 
            content: `[FIND_MY_APPOINTMENTS_RESULT]\n${apptText}\n\nالرجاء صياغة رد للعميل بناءً على هذه المواعيد الحقيقية فقط وسؤاله أي موعد يقصد إن وجد أكثر من موعد، أو تأكيد رغبته في الإلغاء إن كان هناك موعد واحد.` 
          });

          loopCount++;
          continue;
        }

        // --- 2. Intercept CANCEL_APPOINTMENT tag ---
        const cancelMatch = replyText.match(/\[CANCEL_APPOINTMENT:\s*([^\]]+)\]/);
        if (cancelMatch) {
          const appointmentId = cancelMatch[1].trim();
          console.log('[AutoResponder] Tag Intercepted: CANCEL_APPOINTMENT for ID:', appointmentId);
          let cancelResultText = '';
          
          try {
            const { data: appt } = await adminSupabase
              .from('appointments')
              .select('*')
              .eq('id', appointmentId)
              .maybeSingle();

            if (appt) {
              const { accounts } = await getGoogleSheetsConfig(accountId);
              if (accounts && accounts.length > 0) {
                const googleAccountId = accounts[0].id;
                const token = await getFreshTokenForAccount(accountId, googleAccountId);
                const calendarId = accounts[0].calendar_id || 'primary';

                const deleted = await deleteCalendarEvent(accountId, token, calendarId, appt.calendar_event_id);
                if (deleted) {
                  await adminSupabase
                    .from('appointments')
                    .update({ status: 'cancelled' })
                    .eq('id', appointmentId);
                  cancelResultText = 'تم إلغاء الموعد بنجاح من تقويم Google Calendar وقاعدة البيانات.';
                } else {
                  cancelResultText = 'فشل إلغاء الموعد من Google Calendar.';
                }
              } else {
                cancelResultText = 'فشل الإلغاء لعدم وجود حساب Google مرتبط بالمنصة.';
              }
            } else {
              cancelResultText = 'لم يتم العثور على الموعد المحدد في قاعدة البيانات (قد يكون ملغياً بالفعل).';
            }
          } catch (err: any) {
            cancelResultText = `خطأ أثناء معالجة الإلغاء: ${err.message}`;
          }

          aiConfigUpdatedMessages.push({ role: 'assistant', content: replyText });
          aiConfigUpdatedMessages.push({ 
            role: 'user', 
            content: `[CANCEL_APPOINTMENT_RESULT]\nالنتيجة: ${cancelResultText}\n\nأبلغ العميل بنتيجة الإلغاء بلباقة واختصار.` 
          });

          loopCount++;
          continue;
        }

        // --- 3. Intercept BOOK_APPOINTMENT tag ---
        const bookMatch = replyText.match(/\[BOOK_APPOINTMENT:\s*([^\]]+)\]/);
        if (bookMatch) {
          hasBookTag = true;
          const parts = bookMatch[1].split('|').map(p => p.trim());
          const appointmentTime = parts[0];
          let patientName = parts[1] || '';
          let patientPhone = parts[2] || '';

          try {
            let contactName = 'عميل واتساب';
            let contactPhone = '';
            const { data: contactData } = await adminSupabase
               .from('contacts')
               .select('name, phone')
               .eq('id', contactId)
               .maybeSingle();
            if (contactData) {
              contactName = contactData.name || contactName;
              contactPhone = contactData.phone || '';
            }

            if (!patientName) patientName = contactName;
            if (!patientPhone) patientPhone = contactPhone;

            const summary = `موعد مع: ${patientName}`;
            let description = `تم الحجز تلقائياً عبر واتساب.`;
            if (patientName !== contactName || patientPhone !== contactPhone) {
              description += `\nالحجز عبر واتساب رقم: ${contactPhone} (${contactName})\nلصاحب الموعد الفعلي: ${patientName} | رقم هاتف صاحب الموعد: ${patientPhone}`;
            } else {
              description += `\nالاسم: ${contactName}\nالهاتف: ${contactPhone}`;
            }

            console.log('[AutoResponder Calendar] Booking event at:', appointmentTime);
            const eventResult = await createCalendarEvent(
              accountId,
              googleToken,
              calendarId,
              summary,
              description,
              appointmentTime,
              conversationId,
              contactId,
              patientName,
              patientPhone
            );
            
            const eventId = eventResult?.id;
            const htmlLink = eventResult?.htmlLink;
            
            if (eventId) {
              appointmentBookedSuccessfully = true;
              console.log('[AutoResponder Calendar] Booked event successfully. ID:', eventId);

              // Construct Baghdad local confirmation message
              let formattedTime = '';
              let formattedDate = '';
              const partsMatch = appointmentTime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
              if (partsMatch) {
                const [_, y, m, d, h, min] = partsMatch;
                const dateObj = new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min));
                formattedTime = dateObj.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', hour12: true });
                formattedDate = dateObj.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
              } else {
                const dateObj = new Date(appointmentTime);
                formattedTime = dateObj.toLocaleTimeString('ar-SA', { timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit', hour12: true });
                formattedDate = dateObj.toLocaleDateString('ar-SA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: 'long', day: 'numeric' });
              }
              replyText = `تم تسجيل موعدك بنجاح في تقويم العيادة:\nالتاريخ: ${formattedDate}\nالوقت: ${formattedTime} 👍`;

              // Send Telegram notification
              try {
                const { notifyAccountViaTelegram, formatAppointmentNotification } = require('@/lib/notifications/telegram');
                await notifyAccountViaTelegram(
                  accountId,
                  formatAppointmentNotification(contactName, contactPhone, appointmentTime, description, patientName, patientPhone, eventId, htmlLink)
                );
              } catch (telErr) {
                console.error('[AutoResponder Calendar] Telegram notification failed:', telErr);
              }
            }
          } catch (bookErr: any) {
            console.error('[AutoResponder Calendar] Auto booking failed:', bookErr.message);
          }

          replyText = replyText.replace(/\[BOOK_APPOINTMENT:\s*[^\]]+\]/, '').trim();
        }

        break;
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
            if (targetDateStr && targetDateStr.includes(':') && !isNaN(parseLocalTimeString(targetDateStr).getTime())) {
              const parsedTarget = parseLocalTimeString(targetDateStr);
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

        // ─── Strict Calendar Protection: Intercept fake/hallucinated confirmations ───
        const mentionsAppointmentConfirmation = /تم تسجيل موعدك|تم تأكيد موعدك|تم حجز موعدك/i.test(replyText);
        if (mentionsAppointmentConfirmation && (!hasBookTag || !appointmentBookedSuccessfully)) {
          console.warn('[AutoResponder] Strict Calendar Protection triggered: AI hallucinated appointment confirmation.');
          replyText = 'عذراً، لم نتمكن من حجز هذا الموعد في التقويم حالياً (قد يكون الوقت غير متاح أو محجوزاً مسبقاً). يرجى مراجعة الأوقات المتاحة واختيار موعد آخر مناسب 👍';
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
    const tomorrowInstant = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowParts = getBaghdadParts(tomorrowInstant);
    return createDateFromBaghdadParts(tomorrowParts.year, tomorrowParts.month, tomorrowParts.day, 10, 0, 0);
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
