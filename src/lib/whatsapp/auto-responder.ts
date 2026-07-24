import { createClient } from '@supabase/supabase-js';
import { sendTextMessage } from './meta-api';
import { sendEvolutionTextMessage } from './evolution-api';

import { hasFeatureAccess } from '@/lib/auth/features';
import { startFollowUpBackgroundWorker } from '@/lib/follow-ups/runner';
import { getGoogleSheetsConfig, getFreshTokenForAccount } from '@/lib/whatsapp/google-sheets';
import { fetchCalendarBusySlots, createCalendarEvent, deleteCalendarEvent } from '@/lib/automations/engine';
import { getBaghdadParts, createDateFromBaghdadParts, parseLocalTimeString } from './timezone-utils';
import { notifyAccountViaTelegram, notifyOrderOnceViaTelegram, formatOrderNotification, formatAppointmentNotification } from '@/lib/notifications/telegram';

// Admin client to safely read configurations and update messages
const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface SaveOrderData {
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  product_name?: string | null;
  product_color?: string | null;
  product_size?: string | null;
  quantity?: string | number | null;
  unit_price?: string | number | null;
  shipping_cost?: string | number | null;
  total_price?: string | number | null;
  payment_method?: string | null;
  notes?: string | null;
}

// Memory cache to guarantee Telegram notifications & Sheet appends run ONCE per order/appointment (TTL: 12h)
const recentOrderNotificationsMap = new Map<string, number>();
const recentAppointmentNotificationsMap = new Map<string, number>();

function isAlreadyNotified(cacheMap: Map<string, number>, key: string): boolean {
  const now = Date.now();
  const ttl = 12 * 60 * 60 * 1000; // 12 hours
  const timestamp = cacheMap.get(key);
  if (timestamp && (now - timestamp < ttl)) {
    return true;
  }
  return false;
}

function markAsNotified(cacheMap: Map<string, number>, key: string) {
  cacheMap.set(key, Date.now());
  if (cacheMap.size > 500) {
    const now = Date.now();
    const ttl = 12 * 60 * 60 * 1000;
    for (const [k, ts] of cacheMap.entries()) {
      if (now - ts > ttl) cacheMap.delete(k);
    }
  }
}

export async function saveOrderAndNotifyTelegram(
  accountId: string,
  contactId: string,
  orderData: SaveOrderData
) {
  try {
    const orderHash = `${accountId}_${contactId}_${String(orderData.product_name || '').trim()}_${String(orderData.total_price || '').trim()}`;
    if (isAlreadyNotified(recentOrderNotificationsMap, orderHash)) {
      console.log('[AutoResponder Order] Notification skipped: already sent once for this order.');
      return;
    }
    markAsNotified(recentOrderNotificationsMap, orderHash);

    let contactName = orderData.customer_name || 'عميل واتساب';
    let contactPhone = orderData.customer_phone || '';

    // Load contact info if missing
    if (contactId) {
      const { data: contact } = await adminSupabase
        .from('contacts')
        .select('name, phone, address')
        .eq('id', contactId)
        .maybeSingle();
      if (contact) {
        if (!contactName || contactName === 'عميل واتساب') contactName = contact.name || 'عميل واتساب';
        if (!contactPhone) contactPhone = contact.phone || '';
      }
    }

    const formattedOrderFields: Record<string, string> = {};
    if (orderData.product_name) formattedOrderFields['المنتج / الخدمة'] = String(orderData.product_name);
    if (orderData.customer_address) formattedOrderFields['العنوان'] = String(orderData.customer_address);
    if (orderData.product_color) formattedOrderFields['اللون'] = String(orderData.product_color);
    if (orderData.product_size) formattedOrderFields['المقاس'] = String(orderData.product_size);
    if (orderData.quantity) formattedOrderFields['الكمية'] = String(orderData.quantity);
    if (orderData.unit_price) formattedOrderFields['سعر الوحدة'] = String(orderData.unit_price);
    if (orderData.total_price) formattedOrderFields['المبلغ الإجمالي'] = String(orderData.total_price);
    if (orderData.payment_method) formattedOrderFields['طريقة الدفع'] = String(orderData.payment_method);
    if (orderData.notes) formattedOrderFields['ملاحظات'] = String(orderData.notes);

    // 1. Send Telegram Notification for the Order ONCE
    try {
      await notifyOrderOnceViaTelegram(
        accountId,
        contactId,
        contactName,
        contactPhone,
        formattedOrderFields
      );
      console.log('[AutoResponder Order] Telegram order notification dispatched via unified once-service');
    } catch (tgErr: any) {
      console.error('[AutoResponder Order] Telegram order notification error:', tgErr.message);
    }

    // 2. Append to Google Sheets if connected
    try {
      const { accounts, sheets } = await getGoogleSheetsConfig(accountId);
      if (sheets && sheets.length > 0 && accounts && accounts.length > 0) {
        const linkedSheet = sheets[0];
        const googleAccountId = linkedSheet.google_account_id || accounts[0].id;
        const token = await getFreshTokenForAccount(accountId, googleAccountId);

        const nowStr = new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Baghdad' });
        const rowValues = [
          nowStr,
          contactName,
          contactPhone,
          orderData.customer_address || '',
          orderData.product_name || '',
          orderData.product_color || orderData.product_size || '',
          String(orderData.quantity || 1),
          String(orderData.total_price || orderData.unit_price || ''),
          orderData.notes || 'طلب منفذ عبر الذكاء الاصطناعي'
        ];

        const sheetName = 'Sheet1';
        const appendRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${linkedSheet.spreadsheet_id}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              values: [rowValues],
            }),
          }
        );

        if (appendRes.ok) {
          console.log('[AutoResponder Order] Successfully appended order row to Google Sheet:', linkedSheet.title);
        } else {
          const errBody = await appendRes.text();
          console.warn('[AutoResponder Order] Google Sheet append error:', errBody);
        }
      }
    } catch (sheetErr: any) {
      console.error('[AutoResponder Order] Sheet append error (non-blocking):', sheetErr.message);
    }
  } catch (err: any) {
    console.error('[AutoResponder Order] Unexpected error in saveOrderAndNotifyTelegram:', err.message);
  }
}

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
          const nowInstant = new Date();
          const todayBaghdad = getBaghdadParts(nowInstant);
          const todayStr = `${todayBaghdad.year}-${String(todayBaghdad.month).padStart(2, '0')}-${String(todayBaghdad.day).padStart(2, '0')}`;
          const busyInfo = busySlotsText || '(لا توجد مواعيد محجوزة مسبقاً في التقويم حالياً)';

          calendarContext = `

**تعليمات تقنية لإدارة وحجز المواعيد (Technical Calendar API Instructions - Business-Neutral):**
- تاريخ اليوم الحالي بتوقيت العيادة/العمل هو: ${todayStr}
- تتوفر لديك أداة للتحقق من المواعيد وحجزها في تقويم جوجل (Google Calendar).
- **الأوقات المزدحمة المحجوزة حالياً في التقويم (يُمنع الحجز فيها):**
${busyInfo}
- **شروط حجز موعد جديد:**
  * استخدم أداة الحجز فقط إذا طلب العميل **صراحة** حجز موعد أو موعد زيارة أو تحديد وقت محدد للقاء.
  * لحجز موعد متفق عليه، أدرج الوسم التالي بدقة في نهاية ردك: [BOOK_APPOINTMENT: YYYY-MM-DDTHH:mm:ss] (مثال: [BOOK_APPOINTMENT: ${todayStr}T15:00:00]).
  * إذا كان الحجز لشخص آخر، استخدم الصيغة: [BOOK_APPOINTMENT: YYYY-MM-DDTHH:mm:ss | patient_name | patient_phone].
- **شروط إلغاء أو معرفة المواعيد:**
  * عندما يطلب العميل معرفة مواعيده أو إلغاءها، استخدم الوسم: [FIND_MY_APPOINTMENTS] للبحث أولاً.
  * بعد استلام النتائج، لإلغاء موعد محدد بناءً على طلب العميل، استخدم الوسم: [CANCEL_APPOINTMENT: appointment_id].`;
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

        followUpContext = `

**تعليمات تقنية لجدولة التذكيرات والمتابعة (Technical Follow-up Instructions - Business-Neutral):**
- الوقت والتاريخ الحالي هو: ${currentDayTime}
- تتوفر لديك أداة لجدولة تذكيرات لمتابعة العملاء لاحقاً.
- **شروط استدعاء الأداة:**
  * استخدم هذه الأداة **فقط** إذا طلب العميل صراحة تذكيره أو الاتصال به لاحقاً (مثال: "ذكرني بعد ساعة", "تواصل معي غداً", "سأفكر وأرد عليكم لاحقاً").
  * لجدولة تذكير، أدرج الوسم التالي بدقة في نهاية ردك: [SCHEDULE_FOLLOW_UP: السبب | الوقت النسبي | YYYY-MM-DDTHH:mm] (مثال: [SCHEDULE_FOLLOW_UP: تذكير بموعد الحجز | بعد ساعتين | ${new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().substring(0, 16)}]).`;
      } catch (acctErr) {
        console.error('[AutoResponder] Failed to load account context for follow-up:', acctErr);
      }

      // ─── Build order context ─────────
      const orderContext = `

**تعليمات تقنية لإدارة وتأكيد طلبات الشراء (Technical Order Instructions):**
- أنت قادر على استقبال وتأكيد طلبات الشراء والخدمات من العملاء.
- عند اتفاقك مع العميل على شراء منتج/خدمة وتوفر بياناته الحقيقية (كالاسم، العنوان، السعر أو الكمية)، أدرج الوسم البرمجي التالي فوراً في نهاية ردك:
[CREATE_ORDER: اسم المنتج | السعر الإجمالي | العنوان | ملاحظات ومواصفات]
(مثال: [CREATE_ORDER: حذاء ركض أنيق | 35000 | بغداد - الكرادة | المقاس 42 أسود]).`;

      // ─── Build system prompt ─────────────────────────────────────
      const basePrompt = aiConfig.system_prompt || 'أنت مساعد ذكي لخدمة العملاء. أجب على الأسئلة بدقة ولباقة باللغة العربية.';
      
      const generalTechnicalInstructions = `

**توجيهات تشغيلية حاسمة (General Operational Directives - Mandatory):**
1. **الفصل التام والواضح بين الخدمات:**
   - **لطلبات الشراء والمنتجات والتوصيل:** استخدم فقط نظام الطلبات [CREATE_ORDER]. يُمنع منعاً باتاً استدعاء وسوم المواعيد أو التحدث عن حجز تقويم لطلبات الشراء.
   - **لحجز المواعيد والزيارات والاستشارات:** استخدم فقط وسوم المواعيد [BOOK_APPOINTMENT].
2. **منع الاختلاق وتأكيد المعلومات (No Hallucinations):** لا تفترض تفاصيل ناقصة لم يذكرها العميل صراحة (مثل طريقة الدفع، تكلفة الشحن، المقاس، اللون، الكمية، أو العناوين). إذا كانت هناك تفاصيل ضرورية ناقصة لإتمام الطلب أو الموعد، اسأل العميل عنها بلباقة بدلاً من اختلاقها.
3. **عدم تأكيد إجراءات غير منفذة:** لا تؤكد للعميل إتمام أي إجراء يتطلب استدعاء أداة (مثل حجز موعد، أو تسجيل طلب، أو جدولة تذكير) ما لم تقم بإرفاق الوسم (Tag) البرمجي المقابل له في ردك.
`;

      const brevityInstruction = '\n\n**تعليمات أسلوب الرد:**\n- أجب دائماً بإيجاز ولباقة (جملة أو جملتين فقط).';
      const compiledSystemPrompt = `${basePrompt}${calendarContext}${orderContext}${followUpContext}${generalTechnicalInstructions}${brevityInstruction}`;

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
      let hasOrderTag = false;

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

        // --- 0. Intercept CREATE_ORDER tag ---
        const orderMatch = replyText.match(/\[CREATE_ORDER:\s*([^\]]+)\]/);
        if (orderMatch) {
          hasOrderTag = true;
          const parts = orderMatch[1].split('|').map(p => p.trim());
          const productName = parts[0] || '';
          const totalPrice = parts[1] || '';
          const address = parts[2] || '';
          const notes = parts[3] || '';

          console.log('[AutoResponder Order] Intercepted CREATE_ORDER tag:', { productName, totalPrice, address, notes });

          await saveOrderAndNotifyTelegram(accountId, contactId, {
            product_name: productName,
            total_price: totalPrice,
            customer_address: address,
            notes: notes
          });

          replyText = replyText.replace(/\[CREATE_ORDER:\s*([^\]]+)\]/, '').trim();
        }

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

          let bookingErrorDetail = '';

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

            // Freshly resolve Google Account token and Calendar ID to guarantee valid credentials
            const { accounts } = await getGoogleSheetsConfig(accountId);
            if (!accounts || accounts.length === 0) {
              throw new Error('حساب Google Calendar غير مرتبط بالمنصة في الإعدادات.');
            }

            const freshGoogleAccountId = accounts[0].id;
            const freshToken = await getFreshTokenForAccount(accountId, freshGoogleAccountId);
            const freshCalendarId = accounts[0].calendar_id || 'primary';

            const summary = `موعد مع: ${patientName}`;
            let description = `تم الحجز تلقائياً عبر واتساب.`;
            if (patientName !== contactName || patientPhone !== contactPhone) {
              description += `\nالحجز عبر واتساب رقم: ${contactPhone} (${contactName})\nلصاحب الموعد الفعلي: ${patientName} | رقم هاتف صاحب الموعد: ${patientPhone}`;
            } else {
              description += `\nالاسم: ${contactName}\nالهاتف: ${contactPhone}`;
            }

            console.log('[AutoResponder Calendar] Booking event at:', appointmentTime, 'using calendar:', freshCalendarId);
            const eventResult = await createCalendarEvent(
              accountId,
              freshToken,
              freshCalendarId,
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
              console.log('[AutoResponder Calendar] Booked event successfully in Google Calendar. ID:', eventId);

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
              replyText = `تم تسجيل وحجز موعدك بنجاح في تقويم العمل (Google Calendar):\nالتاريخ: ${formattedDate}\nالوقت: ${formattedTime} 👍`;

              // Send Telegram notification ONCE per confirmed appointment
              const apptHash = `${accountId}_${contactId}_${appointmentTime}`;
              if (!isAlreadyNotified(recentAppointmentNotificationsMap, apptHash)) {
                markAsNotified(recentAppointmentNotificationsMap, apptHash);
                try {
                  await notifyAccountViaTelegram(
                    accountId,
                    formatAppointmentNotification(contactName, contactPhone, appointmentTime, description, patientName, patientPhone, eventId, htmlLink)
                  );
                  console.log('[AutoResponder Calendar] Telegram appointment notification sent successfully (Once)');
                } catch (telErr) {
                  console.error('[AutoResponder Calendar] Telegram notification failed:', telErr);
                }
              } else {
                console.log('[AutoResponder Calendar] Telegram notification skipped: already sent once for this appointment.');
              }
            } else {
              bookingErrorDetail = 'لم يتم الحصول على معرف الموعد من Google API.';
            }
          } catch (bookErr: any) {
            console.error('[AutoResponder Calendar] Auto booking failed:', bookErr.message);
            bookingErrorDetail = bookErr.message;
          }

          // STRICT CALENDAR PROTECTION: If event creation in Google Calendar failed, OVERRIDE replyText completely!
          if (!appointmentBookedSuccessfully) {
            console.warn('[AutoResponder Calendar] Booking failed. OVERRIDING replyText so customer is not misled.');
            replyText = `عذراً، لم نتمكن من تثبيت وحجز هذا الموعد في التقويم حالياً (${bookingErrorDetail || 'خطأ في النظام'}). يرجى اختيار موعد آخر أو التواصل مع مركز الخدمة لتأكيده 👍`;
          } else {
            replyText = replyText.replace(/\[BOOK_APPOINTMENT:\s*[^\]]+\]/, '').trim();
          }
        }

        break;
      }

      // ─── Code Fallback for Appointment Booking if AI omitted tag ───
      if (!appointmentBookedSuccessfully && !hasBookTag && /تم (حجز|تسجيل|تأكيد|تثبيت) (موعدك|الموعد)|حجز موعدك|موعدك.*الساعة/i.test(replyText)) {
        try {
          console.log('[AutoResponder Calendar Fallback] AI confirmed appointment without tag. Executing fallback booking parser...');

          let contactName = 'عميل واتساب';
          let contactPhone = senderPhone || '';
          if (contactId) {
            const { data: contactData } = await adminSupabase
              .from('contacts')
              .select('name, phone')
              .eq('id', contactId)
              .maybeSingle();
            if (contactData) {
              contactName = contactData.name || contactName;
              contactPhone = contactData.phone || contactPhone;
            }
          }

          const fullText = `${messageText} ${replyText}`;
          let targetHour = 17;
          let targetMinute = 0;

          const timeMatch = fullText.match(/الساعة\s*(\d{1,2})(?::(\d{2}))?/i) || fullText.match(/(\d{1,2}):(\d{2})/);
          if (timeMatch) {
            let h = parseInt(timeMatch[1], 10);
            const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
            if (/مساء|عصر|م/i.test(fullText) && h < 12) h += 12;
            targetHour = h;
            targetMinute = m;
          }

          const nowInstant = new Date();
          let targetDate = new Date(nowInstant.getTime() + 24 * 60 * 60 * 1000);
          if (/اليوم/i.test(fullText) && !/غد|بكر/i.test(fullText)) {
            targetDate = nowInstant;
          }

          const baghdadParts = getBaghdadParts(targetDate);
          const scheduledDate = createDateFromBaghdadParts(
            baghdadParts.year,
            baghdadParts.month,
            baghdadParts.day,
            targetHour,
            targetMinute,
            0
          );

          const appointmentISO = scheduledDate.toISOString().substring(0, 19);

          const { accounts } = await getGoogleSheetsConfig(accountId);
          if (accounts && accounts.length > 0) {
            const freshGoogleAccountId = accounts[0].id;
            const freshToken = await getFreshTokenForAccount(accountId, freshGoogleAccountId);
            const freshCalendarId = accounts[0].calendar_id || 'primary';

            const summary = `موعد مع: ${contactName}`;
            const description = `تم التثبيت والحجز عبر واتساب.\nالاسم: ${contactName}\nالهاتف: ${contactPhone}`;

            const eventResult = await createCalendarEvent(
              accountId,
              freshToken,
              freshCalendarId,
              summary,
              description,
              appointmentISO,
              conversationId,
              contactId,
              contactName,
              contactPhone
            );

            const eventId = eventResult?.id;
            const htmlLink = eventResult?.htmlLink;

            if (eventId) {
              appointmentBookedSuccessfully = true;
              console.log('[AutoResponder Calendar Fallback] Successfully booked appointment via code fallback! Event ID:', eventId);

              const apptHash = `${accountId}_${contactId}_${appointmentISO}`;
              if (!isAlreadyNotified(recentAppointmentNotificationsMap, apptHash)) {
                markAsNotified(recentAppointmentNotificationsMap, apptHash);
                try {
                  await notifyAccountViaTelegram(
                    accountId,
                    formatAppointmentNotification(contactName, contactPhone, appointmentISO, description, contactName, contactPhone, eventId, htmlLink)
                  );
                  console.log('[AutoResponder Calendar Fallback] Telegram appointment notification sent successfully (Once)');
                } catch (telErr) {
                  console.error('[AutoResponder Calendar Fallback] Telegram notification error:', telErr);
                }
              }
            }
          }
        } catch (fbErr: any) {
          console.error('[AutoResponder Calendar Fallback] Error in fallback appointment booking:', fbErr.message);
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

        // ─── Strict Calendar Protection: Intercept fake/hallucinated appointment confirmations ───
        // Only trigger if the reply specifically pertains to calendar appointments / visits AND does NOT pertain to product orders / delivery.
        const isAppointmentContext = /(موعد|الموعد|حجز موعد|تأكيد الموعد|تسجيل الموعد|تثبيت الموعد|حجزنا لك موعد|موعدك مؤكد|موعدك جاهز|موعدك محجوز|زيارتك)/i.test(replyText);
        const isOrderContext = /(طلب|طلبك|طلبات|الطلب|شراء|المنتج|المنتجات|التوصيل|الشحن|عنوانك|سعر الوحدة)/i.test(replyText);

        const mentionsAppointmentConfirmation = isAppointmentContext && !isOrderContext && /تم (حجز|تسجيل|تأكيد|تحديد|تثبيت|إضافة|ضبط)|حجزنا|سجلنا|تثبت موعدك|موعدك/i.test(replyText);

        if (mentionsAppointmentConfirmation && (!hasBookTag || !appointmentBookedSuccessfully)) {
          console.warn('[AutoResponder] Strict Calendar Protection triggered: AI hallucinated appointment confirmation.');
          replyText = 'عذراً، لم نتمكن من حجز هذا الموعد في التقويم حالياً (قد يكون الوقت غير متاح أو محجوزاً مسبقاً). يرجى مراجعة الأوقات المتاحة واختيار موعد آخر مناسب 👍';
        }

        // ─── Smart Order Data Extraction from Full Conversation ─────
        // Extract structured order/customer data from the conversation and update contact record
        try {
          const extractHistory = history
            .map(m => `${m.role === 'user' ? 'العميل' : 'المساعد'}: ${m.content}`)
            .filter(line => line.length > 5)
            .join('\n');

          if (extractHistory.length > 50) {
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

IMPORTANT: Only extract values explicitly mentioned in the conversation. Do NOT invent or assume any values. Return raw JSON only, no markdown.`;

            const extractionUserMessage = `Extract all customer and order details from this conversation:\n\n${extractHistory}`;

            let extractedJson: any = null;
            const extractMessages = [
              { role: 'system', content: extractionSystemPrompt },
              { role: 'user', content: extractionUserMessage }
            ];

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
              });
              const extractData = await extractRes.json();
              if (extractRes.ok && extractData.choices?.[0]?.message?.content) {
                extractedJson = JSON.parse(extractData.choices[0].message.content.trim());
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
              });
              const extractData = await extractRes.json();
              if (extractRes.ok && extractData.choices?.[0]?.message?.content) {
                extractedJson = JSON.parse(extractData.choices[0].message.content.trim());
              }
            }

            if (extractedJson && contactId) {
              console.log('[AutoResponder] Extracted order data:', JSON.stringify(extractedJson));

              // Update contact record with extracted data
              const contactUpdate: Record<string, any> = {};
              if (extractedJson.customer_name) contactUpdate.name = String(extractedJson.customer_name).trim();
              if (extractedJson.customer_address) contactUpdate.address = String(extractedJson.customer_address).trim();
              if (extractedJson.product_color) contactUpdate.color = String(extractedJson.product_color).trim();

              if (Object.keys(contactUpdate).length > 0) {
                contactUpdate.updated_at = new Date().toISOString();
                const { error: updateErr } = await adminSupabase
                  .from('contacts')
                  .update(contactUpdate)
                  .eq('id', contactId)
                  .eq('account_id', accountId);
                if (updateErr) {
                  console.error('[AutoResponder] Failed to update contact with extracted data:', updateErr);
                } else {
                  console.log('[AutoResponder] Updated contact record:', Object.keys(contactUpdate).join(', '));
                }
              }

              // Save order to Google Sheets & send Telegram notification if not already handled by CREATE_ORDER tag or appointment booking
              if (!hasOrderTag && !hasBookTag && !appointmentBookedSuccessfully && (extractedJson.product_name || (extractedJson.total_price && extractedJson.customer_address))) {
                console.log('[AutoResponder Order] Triggering fallback order save & Telegram notification');
                await saveOrderAndNotifyTelegram(accountId, contactId, extractedJson);
              }
            }
          }
        } catch (extractErr: any) {
          console.error('[AutoResponder] Order data extraction failed (non-blocking):', extractErr.message);
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
