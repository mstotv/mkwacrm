import type { MessageTemplate } from '@/types';

function replaceTemplateVariables(text: string, params: string[]): string {
  if (!text) return '';
  if (!params || params.length === 0) return text;
  let result = text;
  params.forEach((param, index) => {
    const placeholder = `{{${index + 1}}}`;
    result = result.split(placeholder).join(param);
  });
  return result;
}

export function formatEvolutionTemplate(
  templateRow: MessageTemplate,
  templateMessageParams?: any,
  templateParams?: string[]
): string {
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

export function getEvolutionTemplateMedia(
  templateRow: MessageTemplate,
  templateMessageParams?: any
): { url: string; type: 'image' | 'video' | 'document' } | null {
  if (!templateRow.header_type || templateRow.header_type === 'text') {
    return null;
  }
  const url = templateMessageParams?.headerMediaUrl || templateRow.header_media_url;
  if (!url) return null;
  return {
    url,
    type: templateRow.header_type as 'image' | 'video' | 'document'
  };
}
