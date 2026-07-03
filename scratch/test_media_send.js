const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config({ path: '.env.local' });

// Decryption helper matching wacrm logic
function decrypt(text) {
  if (!text) return '';
  try {
    const parts = text.split(':');
    if (parts.length !== 3) return ''; // not encrypted or old format
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Decryption failed:', err);
    return '';
  }
}

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: config, error } = await supabase
    .from('whatsapp_config')
    .select('*')
    .eq('connection_type', 'evolution')
    .single();

  if (error || !config) {
    console.error('No evolution config found:', error);
    return;
  }

  const token = decrypt(config.access_token);
  const instanceName = config.phone_number_id;
  const apiUrl = config.evolution_api_url || 'https://evo.magicaikrd.com';
  const apikey = token || process.env.EVOLUTION_API_KEY;

  const targetNumber = '9647730611400';

  console.log('\n--- Sending Media Message ---');
  try {
    const res = await fetch(`${apiUrl}/message/sendMedia/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey
      },
      body: JSON.stringify({
        number: targetNumber,
        mediatype: 'image',
        media: 'https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?w=400',
        caption: 'Hello! This is a real media attachment test from Evolution API!'
      })
    });
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Send media failed:', err);
  }
}

main();
