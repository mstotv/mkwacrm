import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/whatsapp/encryption';
import { setEvolutionWebhook } from '@/lib/whatsapp/evolution-api';

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

/**
 * POST /api/whatsapp/evolution/webhook-update
 * Re-registers the Evolution webhook with the current public site URL.
 * Call this after deploying to a new domain.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

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

    if (!config || config.connection_type !== 'evolution') {
      return NextResponse.json({ error: 'No Evolution config found' }, { status: 404 });
    }

    // Build webhook URL from current request origin (works correctly in production)
    const url = new URL(request.url);
    const webhookUrl = `${url.protocol}//${url.host}/api/whatsapp/webhook/evolution`;

    const token = decrypt(config.access_token);
    const instanceName = config.phone_number_id;
    const apiUrl = config.evolution_api_url;

    const success = await setEvolutionWebhook(instanceName, token, webhookUrl, apiUrl);

    return NextResponse.json({
      success,
      webhookUrl,
      instanceName,
    });
  } catch (error: any) {
    console.error('Webhook update error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
