import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/whatsapp/encryption';
import { normalizePhone } from '@/lib/whatsapp/phone-utils';
import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe';
import { runAutomationsForTrigger, handleQnaSessionResponse } from '@/lib/automations/engine';
import { runAutoResponder } from '@/lib/whatsapp/auto-responder';
import { analyzeSentimentAndSave } from '@/lib/whatsapp/sentiment-analyzer';

let _adminClient: any = null;
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _adminClient;
}

async function findOrCreateContact(
  accountId: string,
  configOwnerUserId: string,
  phone: string,
  name: string
) {
  const existingContact = await findExistingContact(supabaseAdmin(), accountId, phone);

  if (existingContact) {
    if (name && name !== existingContact.name) {
      await supabaseAdmin()
        .from('contacts')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', existingContact.id);
    }
    return { contact: existingContact, wasCreated: false };
  }

  const { data: newContact, error: createError } = await supabaseAdmin()
    .from('contacts')
    .insert({
      account_id: accountId,
      user_id: configOwnerUserId,
      phone,
      name: name || phone,
    })
    .select()
    .single();

  if (createError) {
    if (isUniqueViolation(createError)) {
      const raced = await findExistingContact(supabaseAdmin(), accountId, phone);
      if (raced) return { contact: raced, wasCreated: false };
    }
    console.error('[Evolution Webhook] Error creating contact:', createError);
    return null;
  }

  return { contact: newContact, wasCreated: true };
}

async function findOrCreateConversation(
  accountId: string,
  configOwnerUserId: string,
  contactId: string
) {
  const { data: existing, error: findError } = await supabaseAdmin()
    .from('conversations')
    .select('*')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .maybeSingle();

  if (!findError && existing) {
    return existing;
  }

  const { data: newConv, error: createError } = await supabaseAdmin()
    .from('conversations')
    .insert({
      account_id: accountId,
      user_id: configOwnerUserId,
      contact_id: contactId,
    })
    .select()
    .single();

  if (createError) {
    console.error('[Evolution Webhook] Error creating conversation:', createError);
    return null;
  }

  return newConv;
}

/**
 * POST /api/whatsapp/webhook/evolution
 * Handles inbound/outbound event messages from Evolution API.
 * Supported events: QRCODE_UPDATED, CONNECTION_UPDATE, messages.upsert
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const event: string = body.event || '';
    const instanceName: string = body.instance || '';

    console.log('[Evolution Webhook] Received event:', event, 'for instance:', instanceName);

    // ─── Handle QR Code Updates ──────────────────────────────────────────
    if (event === 'qrcode.updated' || event === 'QRCODE_UPDATED') {
      const qrBase64: string =
        body.data?.qrcode?.base64 ||
        body.data?.qrcode?.code ||
        body.data?.base64 ||
        body.data?.code ||
        '';

      if (instanceName && qrBase64) {
        await supabaseAdmin()
          .from('whatsapp_config')
          .update({ status: 'disconnected', updated_at: new Date().toISOString() })
          .eq('phone_number_id', instanceName);

        console.log('[Evolution Webhook] QR updated for:', instanceName, '(base64 length:', qrBase64.length, ')');
      }

      return NextResponse.json({ status: 'qr_acknowledged' });
    }

    // ─── Handle Connection State Changes ────────────────────────────────
    if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
      const state: string = body.data?.state || body.data?.instance?.state || '';
      console.log('[Evolution Webhook] Connection update:', instanceName, '->', state);

      if (instanceName && state) {
        if (state === 'open') {
          await supabaseAdmin()
            .from('whatsapp_config')
            .update({
              status: 'connected',
              connected_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('phone_number_id', instanceName);
        } else if (state === 'close' || state === 'connecting') {
          await supabaseAdmin()
            .from('whatsapp_config')
            .update({
              status: 'disconnected',
              updated_at: new Date().toISOString(),
            })
            .eq('phone_number_id', instanceName);
        }
      }

      return NextResponse.json({ status: 'connection_acknowledged' });
    }

    // ─── Only process message upsert events below ────────────────────────
    if (event !== 'messages.upsert') {
      return NextResponse.json({ status: 'ignored_event', event });
    }

    const messageData = body.data;

    if (!instanceName || !messageData) {
      return NextResponse.json({ error: 'Missing instance or data' }, { status: 400 });
    }

    const key = messageData.key;
    if (!key || !key.remoteJid) {
      return NextResponse.json({ status: 'no_jid' });
    }

    const remoteJid = key.remoteJid;
    // Ignore group chats
    if (remoteJid.endsWith('@g.us')) {
      return NextResponse.json({ status: 'ignored_group_chat' });
    }

    // Resolve whatsapp config
    const { data: config, error: configError } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('*')
      .eq('phone_number_id', instanceName)
      .maybeSingle();

    if (configError || !config) {
      console.warn('[Evolution Webhook] Instance config not found for name:', instanceName);
      return NextResponse.json({ error: 'Instance not configured locally' }, { status: 200 });
    }

    const accountId = config.account_id;
    const configOwnerUserId = config.user_id;
    const accessToken = decrypt(config.access_token);

    // Extract sender phone
    const rawPhone = remoteJid.replace('@s.whatsapp.net', '');
    const senderPhone = normalizePhone(rawPhone);

    const fromMe = key.fromMe === true;

    // Parse message details
    const msg = messageData.message;
    if (!msg) {
      return NextResponse.json({ status: 'no_message_content' });
    }

    let contentText = '';
    let contentType = 'text';

    if (msg.conversation) {
      contentText = msg.conversation;
    } else if (msg.extendedTextMessage?.text) {
      contentText = msg.extendedTextMessage.text;
    } else if (msg.imageMessage) {
      contentText = msg.imageMessage.caption || '';
      contentType = 'image';
    } else if (msg.videoMessage) {
      contentText = msg.videoMessage.caption || '';
      contentType = 'video';
    } else if (msg.documentMessage) {
      contentText = msg.documentMessage.caption || msg.documentMessage.filename || '';
      contentType = 'document';
    } else if (msg.audioMessage) {
      contentType = 'audio';
    }

    const pushName = messageData.pushName || senderPhone;
    const timestamp = messageData.messageTimestamp 
      ? new Date(messageData.messageTimestamp * 1000).toISOString()
      : new Date().toISOString();

    // 1) Find or create Contact & Conversation
    const contactOutcome = await findOrCreateContact(
      accountId,
      configOwnerUserId,
      senderPhone,
      fromMe ? 'You' : pushName
    );

    if (!contactOutcome) {
      return NextResponse.json({ error: 'Failed to resolve contact' }, { status: 500 });
    }

    const contactRecord = contactOutcome.contact;
    const conversation = await findOrCreateConversation(
      accountId,
      configOwnerUserId,
      contactRecord.id
    );

    if (!conversation) {
      return NextResponse.json({ error: 'Failed to resolve conversation' }, { status: 500 });
    }

    if (fromMe) {
      // Outbound message (user typed in WhatsApp app directly)
      // Check if message already exists
      const { data: existingMsg } = await supabaseAdmin()
        .from('messages')
        .select('id')
        .eq('message_id', key.id)
        .maybeSingle();

      if (!existingMsg) {
        await supabaseAdmin()
          .from('messages')
          .insert({
            conversation_id: conversation.id,
            sender_type: 'agent',
            content_type: contentType,
            content_text: contentText,
            message_id: key.id,
            status: 'sent',
            created_at: timestamp,
          });

        await supabaseAdmin()
          .from('conversations')
          .update({
            last_message_text: contentText || `[${contentType}]`,
            last_message_at: timestamp,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversation.id);
      }
    } else {
      // Inbound message (customer sent to us)
      // Check if message already exists
      const { data: existingMsg } = await supabaseAdmin()
        .from('messages')
        .select('id')
        .eq('message_id', key.id)
        .maybeSingle();

      if (!existingMsg) {
        const { count: priorCustomerMsgCount } = await supabaseAdmin()
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conversation.id)
          .eq('sender_type', 'customer');

        const isFirstInboundMessage = (priorCustomerMsgCount ?? 0) === 0;

        await supabaseAdmin()
          .from('messages')
          .insert({
            conversation_id: conversation.id,
            sender_type: 'customer',
            content_type: contentType,
            content_text: contentText,
            message_id: key.id,
            status: 'delivered',
            created_at: timestamp,
          });

        await supabaseAdmin()
          .from('conversations')
          .update({
            last_message_text: contentText || `[${contentType}]`,
            last_message_at: timestamp,
            unread_count: (conversation.unread_count || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversation.id);

        // Try to dispatch to Q&A Session first
        const mediaUrl = msg.imageMessage?.url || msg.videoMessage?.url || msg.documentMessage?.url || msg.audioMessage?.url || null;
        const qnaConsumed = await handleQnaSessionResponse(
          accountId,
          contactRecord.id,
          contentText || '',
          mediaUrl || undefined
        );

        // Dispatch triggers and automations
        const automationTriggers: (
          | 'new_contact_created'
          | 'first_inbound_message'
          | 'new_message_received'
          | 'keyword_match'
        )[] = [];

        if (!qnaConsumed) {
          automationTriggers.push('new_message_received', 'keyword_match');
        }

        if (contactOutcome.wasCreated) {
          automationTriggers.unshift('new_contact_created');
        }
        if (isFirstInboundMessage) {
          automationTriggers.unshift('first_inbound_message');
        }

        for (const triggerType of automationTriggers) {
          runAutomationsForTrigger({
            accountId,
            triggerType,
            contactId: contactRecord.id,
            context: {
              message_text: contentText,
              conversation_id: conversation.id,
            },
          }).catch((err) => console.error('[Evolution Webhook Automations] failed:', err));
        }

        // Run auto responder
        if (!qnaConsumed) {
          runAutoResponder({
            accountId,
            contactId: contactRecord.id,
            conversationId: conversation.id,
            messageText: contentText || '',
            senderPhone: senderPhone,
            phoneNumberId: instanceName, // maps to instance name
            accessToken,
            configOwnerUserId,
            parentMessageId: key.id,
          }).catch((err) => console.error('[AutoResponder Evolution] execution failed:', err));
        }

        if (contentText) {
          analyzeSentimentAndSave(accountId, conversation.id, contentText)
            .catch((err) => console.error('[SentimentAnalysis Evolution] execution failed:', err));
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in Evolution webhook POST:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/whatsapp/webhook/evolution
 * Health check endpoint — confirms this webhook URL is publicly reachable.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'evolution-webhook',
    timestamp: new Date().toISOString(),
  });
}
