/**
 * Diagnostic script for Evolution API webhook + AI responder issues.
 * 
 * Usage:  node scripts/diagnose-webhook.js
 * 
 * This script checks:
 * 1. WhatsApp config (connection_type, status, webhook URL registered in Evolution)
 * 2. AI config (is_active, provider, api_key present)
 * 3. Recent conversations & messages in DB
 * 4. Evolution API webhook registration status
 * 5. Feature access for ai_reply
 */

const { createClient } = require('@supabase/supabase-js');

// Load env from .env.local
const fs = require('fs');
const path = require('path');
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

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SERVICE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║     🔍 WaCRM Webhook & AI Diagnostic Tool                ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ─── 1) WhatsApp Configs ───────────────────────────────────────────
  console.log('━━━ 1. WhatsApp Configurations ━━━');
  const { data: configs, error: configErr } = await supabase
    .from('whatsapp_config')
    .select('id, account_id, user_id, phone_number_id, connection_type, status, evolution_api_url, created_at, updated_at, connected_at');

  if (configErr) {
    console.error('❌ Error fetching whatsapp_config:', configErr.message);
  } else if (!configs || configs.length === 0) {
    console.error('❌ No whatsapp_config rows found! WhatsApp is not configured.');
  } else {
    for (const cfg of configs) {
      console.log(`\n  📱 Instance: ${cfg.phone_number_id}`);
      console.log(`     Account ID: ${cfg.account_id}`);
      console.log(`     Connection Type: ${cfg.connection_type}`);
      console.log(`     Status: ${cfg.status}`);
      console.log(`     Evolution API URL: ${cfg.evolution_api_url || 'DEFAULT (' + EVO_API_URL + ')'}`);
      console.log(`     Connected At: ${cfg.connected_at || 'Never'}`);
      console.log(`     Updated At: ${cfg.updated_at}`);

      // Check Evolution webhook registration
      if (cfg.connection_type === 'evolution') {
        const evoUrl = (cfg.evolution_api_url || EVO_API_URL).replace(/\/+$/, '');
        const instanceName = cfg.phone_number_id;
        
        console.log(`\n  🔗 Checking Evolution webhook registration...`);
        try {
          const webhookRes = await fetch(`${evoUrl}/webhook/find/${instanceName}`, {
            method: 'GET',
            headers: { 'apikey': EVO_API_KEY },
          });
          
          if (webhookRes.ok) {
            const webhookData = await webhookRes.json();
            console.log(`     Webhook URL: ${JSON.stringify(webhookData?.url || webhookData?.webhook?.url || webhookData, null, 2)}`);
            console.log(`     Webhook Enabled: ${webhookData?.enabled ?? webhookData?.webhook?.enabled ?? 'unknown'}`);
            console.log(`     Webhook Events: ${JSON.stringify(webhookData?.events || webhookData?.webhook?.events || 'unknown')}`);
            
            const registeredUrl = webhookData?.url || webhookData?.webhook?.url || '';
            if (!registeredUrl) {
              console.log('     ⚠️  WARNING: No webhook URL registered in Evolution!');
              console.log('        → This means Evolution is NOT sending events to your app.');
              console.log('        → Fix: Go to Settings > WhatsApp and reconnect, or call POST /api/whatsapp/evolution/webhook-update');
            } else if (registeredUrl.includes('localhost')) {
              console.log('     ⚠️  WARNING: Webhook URL points to localhost!');
              console.log('        → Evolution cannot reach localhost from the internet.');
              console.log('        → Fix: Update webhook URL to your public domain.');
            } else {
              console.log('     ✅ Webhook URL looks valid (non-localhost)');
            }
          } else {
            // Try alternate endpoint
            const webhookRes2 = await fetch(`${evoUrl}/webhook/${instanceName}`, {
              method: 'GET',
              headers: { 'apikey': EVO_API_KEY },
            });
            
            if (webhookRes2.ok) {
              const webhookData2 = await webhookRes2.json();
              console.log(`     Webhook data: ${JSON.stringify(webhookData2, null, 2)}`);
            } else {
              console.log(`     ⚠️  Could not fetch webhook info (HTTP ${webhookRes.status})`);
              const txt = await webhookRes.text();
              console.log(`     Response: ${txt.substring(0, 200)}`);
            }
          }
        } catch (err) {
          console.log(`     ❌ Failed to connect to Evolution API at ${evoUrl}: ${err.message}`);
        }

        // Also check instance connection state
        console.log(`\n  📡 Checking Evolution instance connection state...`);
        try {
          const stateRes = await fetch(`${evoUrl}/instance/connectionState/${instanceName}`, {
            method: 'GET',
            headers: { 'apikey': EVO_API_KEY },
          });
          if (stateRes.ok) {
            const stateData = await stateRes.json();
            const state = stateData?.instance?.state || stateData?.state || 'unknown';
            console.log(`     Connection State: ${state}`);
            if (state !== 'open') {
              console.log('     ⚠️  WARNING: Instance is NOT connected! State:', state);
            } else {
              console.log('     ✅ Instance is connected (state: open)');
            }
          }
        } catch (err) {
          console.log(`     ❌ Failed to check instance state: ${err.message}`);
        }
      }
    }
  }

  // ─── 2) AI Configurations ────────────────────────────────────────────
  console.log('\n\n━━━ 2. AI Configuration ━━━');
  const { data: aiConfigs, error: aiErr } = await supabase
    .from('ai_config')
    .select('id, account_id, provider, is_active, system_prompt, created_at');

  if (aiErr) {
    console.error('❌ Error fetching ai_config:', aiErr.message);
  } else if (!aiConfigs || aiConfigs.length === 0) {
    console.log('  ⚠️  No AI configurations found. AI auto-reply is not set up.');
  } else {
    for (const ai of aiConfigs) {
      console.log(`\n  🤖 AI Config for Account: ${ai.account_id}`);
      console.log(`     Provider: ${ai.provider}`);
      console.log(`     Active: ${ai.is_active}`);
      console.log(`     Has System Prompt: ${!!ai.system_prompt}`);
      console.log(`     System Prompt (first 100 chars): ${(ai.system_prompt || '').substring(0, 100)}`);
      
      if (!ai.is_active) {
        console.log('     ⚠️  WARNING: AI config is NOT active! Enable it in Settings > Integrations > AI.');
      }
    }
  }

  // ─── 3) Auto Replies (Keywords) ──────────────────────────────────────
  console.log('\n\n━━━ 3. Keyword Auto Replies ━━━');
  const { data: autoReplies, error: arErr } = await supabase
    .from('auto_replies')
    .select('id, account_id, keyword, match_type, is_active');

  if (arErr) {
    console.error('❌ Error fetching auto_replies:', arErr.message);
  } else if (!autoReplies || autoReplies.length === 0) {
    console.log('  ℹ️  No keyword auto-replies configured.');
  } else {
    console.log(`  Found ${autoReplies.length} auto-reply rule(s):`);
    for (const ar of autoReplies) {
      console.log(`     "${ar.keyword}" (${ar.match_type}) - Active: ${ar.is_active} [Account: ${ar.account_id}]`);
    }
  }

  // ─── 4) Subscription & Feature Access ────────────────────────────────
  console.log('\n\n━━━ 4. Subscription & AI Feature Access ━━━');
  if (configs && configs.length > 0) {
    for (const cfg of configs) {
      const { data: sub } = await supabase
        .from('account_subscriptions')
        .select('status, plan_id, subscription_plans(name)')
        .eq('account_id', cfg.account_id)
        .maybeSingle();

      if (sub) {
        console.log(`\n  💳 Account ${cfg.account_id}:`);
        console.log(`     Plan: ${sub.subscription_plans?.name || 'unknown'}`);
        console.log(`     Status: ${sub.status}`);

        // Check ai_reply feature
        if (sub.plan_id) {
          const { data: featureAssignment } = await supabase
            .from('plan_feature_assignments')
            .select('id, feature:plan_features_library!inner(feature_key)')
            .eq('plan_id', sub.plan_id)
            .eq('plan_features_library.feature_key', 'ai_reply')
            .maybeSingle();

          if (featureAssignment) {
            console.log('     ✅ AI Reply feature is ENABLED for this plan.');
          } else {
            console.log('     ⚠️  WARNING: AI Reply feature is NOT assigned to this plan!');
            console.log('        → The AI auto-responder will NOT run for this account.');
            console.log('        → Fix: Add "ai_reply" feature to this plan in Admin > Subscriptions.');
          }
        }
      } else {
        console.log(`\n  ⚠️  No subscription found for account ${cfg.account_id}`);
        console.log('     → The system will check the "free" plan for features.');
      }

      // Check if user is platform admin (bypass check)
      const { data: profile } = await supabase
        .from('profiles')
        .select('platform_role')
        .eq('user_id', cfg.user_id)
        .maybeSingle();

      if (profile) {
        console.log(`     User role: ${profile.platform_role || 'user'}`);
        if (profile.platform_role === 'super_admin' || profile.platform_role === 'assistant_admin') {
          console.log('     ✅ User is platform admin — AI features are available regardless of plan.');
        }
      }
    }
  }

  // ─── 5) Recent Activity ──────────────────────────────────────────────
  console.log('\n\n━━━ 5. Recent Activity (last 5 conversations & messages) ━━━');
  const { data: recentConvs } = await supabase
    .from('conversations')
    .select('id, account_id, last_message_text, last_message_at, unread_count, status, contact:contacts(name, phone)')
    .order('last_message_at', { ascending: false })
    .limit(5);

  if (recentConvs && recentConvs.length > 0) {
    for (const conv of recentConvs) {
      console.log(`\n  💬 ${conv.contact?.name || conv.contact?.phone || 'Unknown'}`);
      console.log(`     Last Message: ${(conv.last_message_text || '').substring(0, 60)}`);
      console.log(`     Last Activity: ${conv.last_message_at}`);
      console.log(`     Unread: ${conv.unread_count} | Status: ${conv.status}`);

      // Check last message timestamp
      if (conv.last_message_at) {
        const diff = Date.now() - new Date(conv.last_message_at).getTime();
        const hours = Math.round(diff / 3600000);
        if (hours > 24) {
          console.log(`     ⚠️  Last activity was ${hours} hours ago. If you sent messages recently, they are NOT being received.`);
        }
      }
    }
  } else {
    console.log('  ⚠️  No conversations found at all.');
  }

  // Check latest messages
  const { data: recentMsgs } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_type, content_text, content_type, status, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (recentMsgs && recentMsgs.length > 0) {
    console.log('\n  📨 Last 10 messages:');
    for (const msg of recentMsgs) {
      const age = Math.round((Date.now() - new Date(msg.created_at).getTime()) / 60000);
      console.log(`     [${msg.sender_type}] ${(msg.content_text || `[${msg.content_type}]`).substring(0, 50)} (${age} min ago) - Status: ${msg.status}`);
    }
  }

  // ─── 6) Automations (Workflows) ──────────────────────────────────────
  console.log('\n\n━━━ 6. Automations / Workflows ━━━');
  const { data: automations } = await supabase
    .from('automations')
    .select('id, account_id, name, trigger_type, is_active, execution_count, created_at');

  if (!automations || automations.length === 0) {
    console.log('  ℹ️  No automations found.');
  } else {
    console.log(`  Found ${automations.length} automation(s):`);
    for (const auto of automations) {
      console.log(`\n     🔄 "${auto.name}"`);
      console.log(`        Trigger: ${auto.trigger_type} | Active: ${auto.is_active} | Executions: ${auto.execution_count}`);
    }
  }

  // ─── 7) Flows ────────────────────────────────────────────────────────
  console.log('\n\n━━━ 7. Flows ━━━');
  const { data: flows } = await supabase
    .from('flows')
    .select('id, account_id, name, is_active, execution_count, created_at');

  if (!flows || flows.length === 0) {
    console.log('  ℹ️  No flows found.');
  } else {
    console.log(`  Found ${flows.length} flow(s):`);
    for (const flow of flows) {
      console.log(`     🔀 "${flow.name}" - Active: ${flow.is_active} | Executions: ${flow.execution_count}`);
    }
  }

  console.log('\n\n╔══════════════════════════════════════════════════════════╗');
  console.log('║     ✅ Diagnosis Complete                                ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
