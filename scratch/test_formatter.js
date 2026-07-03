function replaceTemplateVariables(text, params) {
  if (!text) return '';
  if (!params || params.length === 0) return text;
  let result = text;
  params.forEach((param, index) => {
    const placeholder = `{{${index + 1}}}`;
    result = result.split(placeholder).join(param);
  });
  return result;
}

function formatEvolutionTemplate(
  templateRow,
  templateMessageParams,
  templateParams
) {
  let fullText = '';

  // 1. Header
  if (templateRow.header_type === 'text' && templateRow.header_content) {
    let headerText = templateRow.header_content;
    if (templateMessageParams?.headerText) {
      headerText = templateMessageParams.headerText;
    } else {
      // fallback variable replacement in header
      const headerParams = templateMessageParams?.header || [];
      if (headerParams.length > 0) {
        headerText = replaceTemplateVariables(headerText, headerParams);
      }
    }
    fullText += `*${headerText}*\n\n`;
  } else if (templateRow.header_type) {
    const mediaUrl = templateMessageParams?.headerMediaUrl || templateRow.header_media_url;
    if (mediaUrl) {
      fullText += `[${templateRow.header_type.toUpperCase()}: ${mediaUrl}]\n\n`;
    }
  }

  // 2. Body
  let bodyText = templateRow.body_text || '';
  const bodyParams = templateMessageParams?.body ?? templateParams ?? [];
  if (bodyParams.length > 0) {
    bodyText = replaceTemplateVariables(bodyText, bodyParams);
  }
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
          btnUrl = replaceTemplateVariables(btnUrl, [btnParam]);
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

const mockTemplate = {
  name: 'test_template',
  category: 'Marketing',
  language: 'en_US',
  header_type: 'text',
  header_content: 'Welcome {{1}}!',
  body_text: 'Hello {{1}}, thank you for choosing our product {{2}}. Your code is {{3}}.',
  footer_text: 'This is a footer message',
  buttons: [
    { type: 'QUICK_REPLY', text: 'Yes, please' },
    { type: 'URL', text: 'Check website', url: 'https://mysite.com/ref={{1}}' },
    { type: 'PHONE_NUMBER', text: 'Call Us', phone_number: '+123456789' },
    { type: 'COPY_CODE', text: 'Copy Promo', example: 'PROMO50' }
  ]
};

const mockMessageParams = {
  headerText: 'Welcome Mustafa!',
  body: ['Mustafa', 'Antigravity AI CRM', 'AGENT-007'],
  buttonParams: {
    1: 'mustafa_id'
  }
};

const mockLegacyParams = ['Mustafa', 'Antigravity AI CRM', 'AGENT-007'];

function test() {
  console.log('--- Test 1: Full structured template formatting ---');
  const formatted1 = formatEvolutionTemplate(mockTemplate, mockMessageParams);
  console.log(formatted1);
  console.log('\n--- Test 2: Legacy parameters formatting ---');
  const formatted2 = formatEvolutionTemplate(mockTemplate, null, mockLegacyParams);
  console.log(formatted2);
}

test();
