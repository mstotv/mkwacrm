import { createClient } from '@supabase/supabase-js';
import { sendTextMessage } from './meta-api';
import { sendEvolutionTextMessage } from './evolution-api';

import { hasFeatureAccess } from '@/lib/auth/features';

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
      let replyText = '';

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
            messages: [
              { role: 'system', content: aiConfig.system_prompt || 'You are a helpful customer assistant.' },
              { role: 'user', content: messageText },
            ],
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
            messages: [
              { role: 'system', content: aiConfig.system_prompt || 'You are a helpful assistant.' },
              { role: 'user', content: messageText },
            ],
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

      if (replyText) {
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
