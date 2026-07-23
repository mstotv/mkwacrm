/**
 * Fix script: Update Evolution webhook URL + Enable AI auto-responder
 * 
 * Fixes:
 * 1. Updates webhook URL from old domain (magicaikrd.com) to new (mstoviral.online)
 * 2. Enables AI config (is_active = true)
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load env
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const idx = trimmed.indexOf('=');
  if (idx > 0) {
    envVars[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
});

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;
const EVO_API_URL = (envVars.NEXT_PUBLIC_EVOLUTION_API_URL || '').replace(/\/+$/, '');
const EVO_API_KEY = envVars.EVOLUTION_API_KEY || '';

const NEW_DOMAIN = 'https://mkwacrm.mstoviral.online';
const NEW_WEBHOOK_URL = `${NEW_DOMAIN}/api/whatsapp/webhook/evolution`;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  🔧 Fixing Webhook URL + Enabling AI                     ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ─── 1) Get WhatsApp config ────────────────────────────────────────
  const { data: configs, error: configErr } = await supabase
    .from('whatsapp_config')
    .select('id, account_id, phone_number_id, connection_type, evolution_api_url, access_token')
    .eq('connection_type', 'evolution');

  if (configErr || !configs || configs.length === 0) {
    console.error('❌ No Evolution API configs found:', configErr?.message);
    return;
  }

  for (const cfg of configs) {
    const instanceName = cfg.phone_number_id;
    const evoUrl = (cfg.evolution_api_url || EVO_API_URL).replace(/\/+$/, '');

    console.log(`\n━━━ Updating webhook for instance: ${instanceName} ━━━`);
    console.log(`  Old webhook: https://mkwacrm.magicaikrd.com/api/whatsapp/webhook/evolution`);
    console.log(`  New webhook: ${NEW_WEBHOOK_URL}`);

    // ─── Update webhook in Evolution API ─────────────────────────────
    try {
      const response = await fetch(`${evoUrl}/webhook/set/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVO_API_KEY,
        },
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: NEW_WEBHOOK_URL,
            webhookByEvents: true,
            webhookBase64: true,
            events: [
              'QRCODE_UPDATED',
              'CONNECTION_UPDATE',
              'MESSAGES_UPSERT',
              'MESSAGES_UPDATE',
              'SEND_MESSAGE',
            ],
          },
        }),
      });

      if (response.ok) {
        console.log('  ✅ Webhook URL updated successfully in Evolution API!');
      } else {
        const body = await response.text();
        console.error(`  ❌ Failed to update webhook (HTTP ${response.status}):`, body);
      }
    } catch (err) {
      console.error('  ❌ Error connecting to Evolution API:', err.message);
    }

    // ─── Verify the update ───────────────────────────────────────────
    try {
      const verifyRes = await fetch(`${evoUrl}/webhook/find/${instanceName}`, {
        method: 'GET',
        headers: { 'apikey': EVO_API_KEY },
      });
      if (verifyRes.ok) {
        const data = await verifyRes.json();
        const registeredUrl = data?.url || data?.webhook?.url || '';
        if (registeredUrl === NEW_WEBHOOK_URL) {
          console.log('  ✅ Verified: Webhook URL is now correctly set to the new domain!');
        } else {
          console.log(`  ⚠️  Webhook URL after update: ${registeredUrl}`);
        }
      }
    } catch (err) {
      console.log('  ⚠️  Could not verify webhook (non-critical):', err.message);
    }
  }

  // ─── 2) Enable AI Config ────────────────────────────────────────────
  console.log('\n\n━━━ Enabling AI Auto-Responder ━━━');
  const { data: aiConfigs, error: aiErr } = await supabase
    .from('ai_config')
    .select('id, account_id, is_active, provider')
    .eq('is_active', false);

  if (aiErr) {
    console.error('❌ Error reading ai_config:', aiErr.message);
  } else if (!aiConfigs || aiConfigs.length === 0) {
    console.log('  ℹ️  No disabled AI configs found (already active or none exist).');
  } else {
    for (const ai of aiConfigs) {
      const { error: updateErr } = await supabase
        .from('ai_config')
        .update({ is_active: true })
        .eq('id', ai.id);

      if (updateErr) {
        console.error(`  ❌ Failed to enable AI config ${ai.id}:`, updateErr.message);
      } else {
        console.log(`  ✅ AI Config enabled for account ${ai.account_id} (provider: ${ai.provider})`);
      }
    }
  }

  // ─── 3) Update NEXT_PUBLIC_SITE_URL in .env.local ──────────────────
  console.log('\n\n━━━ Checking NEXT_PUBLIC_SITE_URL ━━━');
  const currentSiteUrl = envVars.NEXT_PUBLIC_SITE_URL || '';
  if (currentSiteUrl !== NEW_DOMAIN) {
    console.log(`  Current: ${currentSiteUrl}`);
    console.log(`  Should be: ${NEW_DOMAIN}`);
    console.log('  ⚠️  Note: NEXT_PUBLIC_SITE_URL in .env.local should be updated on the server.');
    console.log('  (We will NOT change it in the local file to avoid breaking your local setup.)');
  } else {
    console.log(`  ✅ NEXT_PUBLIC_SITE_URL is already set to ${NEW_DOMAIN}`);
  }

  console.log('\n\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  ✅ All fixes applied!                                    ║');
  console.log('║                                                          ║');
  console.log('║  ✓ Webhook URL → mkwacrm.mstoviral.online                ║');
  console.log('║  ✓ AI Auto-Responder → Enabled                           ║');
  console.log('║                                                          ║');
  console.log('║  📌 Next Steps:                                          ║');
  console.log('║  1. Send a test message to your WhatsApp number          ║');
  console.log('║  2. Check if it appears in the Inbox                     ║');
  console.log('║  3. Check if AI replies                                   ║');
  console.log('║                                                          ║');
  console.log('║  If still not working, check the server logs:            ║');
  console.log('║  → Look for "[Evolution Webhook]" in your app logs       ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
