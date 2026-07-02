import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { encrypt, decrypt } from '@/lib/whatsapp/encryption';
import {
  createEvolutionInstance,
  getEvolutionQrCode,
  getEvolutionInstanceStatus,
  deleteEvolutionInstance,
  setEvolutionWebhook,
} from '@/lib/whatsapp/evolution-api';

async function resolveAccountId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data?.account_id) return null;
  return data.account_id as string;
}

let _adminClient: any = null;
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _adminClient;
}

/** Build the public webhook URL for this deployment. */
function buildWebhookUrl(request: Request): string {
  // Prefer explicit env var (important for production)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl && siteUrl !== 'https://crm.example.com') {
    return `${siteUrl.replace(/\/+$/, '')}/api/whatsapp/webhook/evolution`;
  }
  // Derive from incoming request host
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/whatsapp/webhook/evolution`;
}

/**
 * POST /api/whatsapp/evolution/instance
 * Creates the Evolution API Instance, sets up webhook, and saves configuration.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accountId = await resolveAccountId(supabase, user.id);
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { instance_name, instance_token, phone, evolution_api_url } = body;

    if (!instance_name || !instance_token || !phone) {
      return NextResponse.json(
        { error: 'Instance Name, Token, and Phone number are required' },
        { status: 400 }
      );
    }

    // Verify instance name is not taken by another account
    const { data: claimed, error: claimedError } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('account_id')
      .eq('phone_number_id', instance_name)
      .neq('account_id', accountId)
      .maybeSingle();

    if (claimedError) {
      console.error('Claim check failed:', claimedError);
      return NextResponse.json({ error: 'Failed to validate instance name' }, { status: 500 });
    }

    if (claimed) {
      return NextResponse.json(
        { error: 'This Instance Name is already in use by another account.' },
        { status: 409 }
      );
    }

    // ─── Step 1: Create instance on Evolution server ───────────────────────
    let qrcodeBase64 = '';
    try {
      const createResult = await createEvolutionInstance(
        instance_name,
        instance_token,
        phone,
        evolution_api_url
      );
      console.log('[Evolution] Instance create result:', {
        alreadyExists: createResult.alreadyExists,
        hasQr: !!createResult.qrBase64,
      });
      if (createResult.qrBase64) {
        qrcodeBase64 = createResult.qrBase64;
      }
    } catch (err: any) {
      console.warn('[Evolution] Instance creation failed:', err.message);
      // Instance might already exist — continue to fetch QR
    }

    // ─── Step 2: Set up webhook automatically ──────────────────────────────
    const webhookUrl = buildWebhookUrl(request);
    console.log('[Evolution] Setting webhook to:', webhookUrl);
    await setEvolutionWebhook(instance_name, instance_token, webhookUrl, evolution_api_url);

    // ─── Step 3: Fetch QR if not already got from create response ──────────
    if (!qrcodeBase64) {
      try {
        const qrData = await getEvolutionQrCode(instance_name, instance_token, evolution_api_url);
        if (!qrData.connected) {
          qrcodeBase64 = qrData.base64;
        }
        console.log('[Evolution] QR fetch result:', {
          connected: qrData.connected,
          hasQr: !!qrData.base64,
        });
      } catch (qrErr: any) {
        console.warn('[Evolution] QR fetch failed:', qrErr.message);
      }
    }

    // ─── Step 4: Save configuration to database ────────────────────────────
    const encryptedToken = encrypt(instance_token);

    const baseRow = {
      phone_number_id: instance_name,
      access_token: encryptedToken,
      connection_type: 'evolution',
      evolution_api_url: evolution_api_url || null,
      evolution_phone: phone,
      status: 'disconnected',
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from('whatsapp_config')
      .select('id')
      .eq('account_id', accountId)
      .maybeSingle();

    if (existing) {
      const { error: updateError } = await supabase
        .from('whatsapp_config')
        .update(baseRow)
        .eq('account_id', accountId);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from('whatsapp_config')
        .insert({ account_id: accountId, user_id: user.id, ...baseRow });
      if (insertError) throw insertError;
    }

    return NextResponse.json({
      success: true,
      qrcode: qrcodeBase64,
      status: 'disconnected',
      webhook_url: webhookUrl,
    });
  } catch (error: any) {
    console.error('Error in Evolution POST:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/whatsapp/evolution/instance
 * Checks session status and returns a fresh QR Code if disconnected.
 */
export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accountId = await resolveAccountId(supabase, user.id);
    if (!accountId) {
      return NextResponse.json({ error: 'No account linked' }, { status: 403 });
    }

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    if (configError || !config) {
      return NextResponse.json({ connected: false, status: 'disconnected', reason: 'no_config' });
    }

    if (config.connection_type !== 'evolution') {
      return NextResponse.json({ connected: false, status: 'disconnected', reason: 'not_evolution' });
    }

    // Decrypt token — fall back to empty string if corrupt (non-ASCII masked token)
    const rawToken = decrypt(config.access_token);
    const token = /^[\x00-\x7F]*$/.test(rawToken) ? rawToken : '';
    const instanceName = config.phone_number_id;
    const apiUrl = config.evolution_api_url;

    // Probe connection state
    const connState = await getEvolutionInstanceStatus(instanceName, token, apiUrl);

    if (connState.status === 'open' || connState.status === 'connected') {
      if (config.status !== 'connected') {
        await supabase
          .from('whatsapp_config')
          .update({ status: 'connected', connected_at: new Date().toISOString() })
          .eq('account_id', accountId);
      }
      return NextResponse.json({ connected: true, status: 'connected' });
    }

    if (config.status !== 'disconnected') {
      await supabase
        .from('whatsapp_config')
        .update({ status: 'disconnected', connected_at: null })
        .eq('account_id', accountId);
    }

    // Fetch fresh QR
    let qrcodeBase64 = '';
    try {
      const qrData = await getEvolutionQrCode(instanceName, token, apiUrl);
      qrcodeBase64 = qrData.base64;
    } catch (err: any) {
      console.warn('[Evolution] Failed to fetch QR code in GET:', err.message);
    }

    return NextResponse.json({ connected: false, status: 'disconnected', qrcode: qrcodeBase64 });
  } catch (error: any) {
    console.error('Error in Evolution GET:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/whatsapp/evolution/instance
 * Logs out and removes the instance from Evolution and the database.
 */
export async function DELETE() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accountId = await resolveAccountId(supabase, user.id);
    if (!accountId) {
      return NextResponse.json({ error: 'No account linked' }, { status: 403 });
    }

    const { data: config } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    if (config && config.connection_type === 'evolution') {
      const token = decrypt(config.access_token);
      const instanceName = config.phone_number_id;
      const apiUrl = config.evolution_api_url;
      try {
        await deleteEvolutionInstance(instanceName, token, apiUrl);
      } catch (err) {
        console.warn('Failed to delete session on Evolution API server:', err);
      }
    }

    const { error: deleteError } = await supabase
      .from('whatsapp_config')
      .delete()
      .eq('account_id', accountId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in Evolution DELETE:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
