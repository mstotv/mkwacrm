const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config({ path: '.env.local' });

// Decryption helper
function decrypt(text) {
  if (!text) return '';
  try {
    const parts = text.split(':');
    if (parts.length !== 3) return '';
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

// Standalone formatting helper matching evolution-formatter.ts
function formatEvolutionTemplate(templateRow, templateMessageParams) {
  let fullText = '';

  // 1. Header (Text header only, since media is sent separately)
  if (templateRow.header_type === 'text' && templateRow.header_content) {
    fullText += `*${templateRow.header_content}*\n\n`;
  }

  // 2. Body
  let bodyText = templateRow.body_text || '';
  const bodyParams = templateMessageParams?.body || [];
  bodyParams.forEach((param, index) => {
    const placeholder = `{{${index + 1}}}`;
    bodyText = bodyText.split(placeholder).join(param);
  });
  fullText += bodyText;

  // 3. Footer
  if (templateRow.footer_text) {
    fullText += `\n\n_${templateRow.footer_text}_`;
  }

  // 4. Buttons
  if (templateRow.buttons && templateRow.buttons.length > 0) {
    fullText += '\n\n';
    templateRow.buttons.forEach((btn, index) => {
      if (btn.type === 'QUICK_REPLY') {
        fullText += `${index + 1}. ↩️ ${btn.text}\n`;
      } else if (btn.type === 'URL') {
        let btnUrl = btn.url || '';
        if (templateMessageParams?.buttonParams?.[index]) {
          const btnParam = templateMessageParams.buttonParams[index];
          btnUrl = btnUrl.split('{{1}}').join(btnParam);
        }
        fullText += `${index + 1}. 🔗 ${btn.text}: ${btnUrl}\n`;
      } else if (btn.type === 'PHONE_NUMBER') {
        fullText += `${index + 1}. 📞 ${btn.text}: ${btn.phone_number}\n`;
      } else if (btn.type === 'COPY_CODE') {
        fullText += `${index + 1}. 📋 ${btn.text}: ${btn.example}\n`;
      }
    });
  }

  return fullText.trim();
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

  // Mock template data
  const mockTemplate = {
    header_type: 'image',
    header_media_url: 'https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?w=600',
    body_text: 'مرحباً {{1}}! 🌟\n\nنشكرك على استخدام نظام إدارة علاقات العملاء الذكي wacrm. طلبك الخاص بالرمز الترويجي {{2}} جاهز للاستخدام الآن.',
    footer_text: 'شركة Antigravity التقنية',
    buttons: [
      { type: 'QUICK_REPLY', text: 'تأكيد التسجيل' },
      { type: 'URL', text: 'زيارة موقعنا', url: 'https://mysite.com/ref={{1}}' },
      { type: 'PHONE_NUMBER', text: 'اتصل بنا', phone_number: '+9647730611400' }
    ]
  };

  const mockParams = {
    body: ['مصطفى', 'WACRM-2026'],
    buttonParams: {
      1: 'mustafa_ref'
    }
  };

  console.log('1. Sending real image attachment...');
  try {
    const resMedia = await fetch(`${apiUrl}/message/sendMedia/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey
      },
      body: JSON.stringify({
        number: targetNumber,
        mediatype: 'image',
        media: mockTemplate.header_media_url,
        caption: 'صورة المرفق الخاص بالقالب'
      })
    });
    const mediaData = await resMedia.json();
    console.log('Image Send Status:', resMedia.status, 'Message ID:', mediaData.key?.id || 'failed');
  } catch (err) {
    console.error('Media send error:', err);
  }

  console.log('\n2. Sending formatted text message with template fallback layout (Body + Buttons)...');
  try {
    const formattedText = formatEvolutionTemplate(mockTemplate, mockParams);
    console.log('\nGenerated Text Body:\n--------------------\n' + formattedText + '\n--------------------');

    const resText = await fetch(`${apiUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey
      },
      body: JSON.stringify({
        number: targetNumber,
        text: formattedText
      })
    });
    const textData = await resText.json();
    console.log('Text Send Response Status:', resText.status);
    console.log('Text Send Response:', JSON.stringify(textData, null, 2));
  } catch (err) {
    console.error('Text send error:', err);
  }
}

main();
