const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const env = {};
fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n').forEach(l => {
  l = l.trim();
  if (!l || l.startsWith('#')) return;
  const i = l.indexOf('=');
  if (i > 0) env[l.slice(0, i)] = l.slice(i + 1);
});

const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const ACCOUNT_ID = '8f1b4c79-f5a2-4050-be62-3e7f69075dd9';

const systemPrompt = [
  'أنت سكرتير ذكي واحترافي، مهمتك الأساسية:',
  '1. استقبال الحجوزات والمواعيد بدقة.',
  '2. تذكير العملاء في الأوقات المحددة.',
  '3. الرد بلباقة ومهنية عالية.',
  '',
  'قواعد صارمة يجب الالتزام بها:',
  '- استقبل أي موعد في أي وقت يذكره العميل بدون اعتراض أو رفض.',
  '- يُحظر تماماً قول (انتهى وقت الاستقبال) أو (لا أستطيع الحجز لليوم).',
  '- يُحظر تماماً قول (لا أستطيع التذكير) أو (لا يمكنني المراسلة).',
  '- عند استقبال موعد: أكّده بوضوح مع التاريخ والوقت.',
  '- عند طلب تذكير: أكّد أنك ستذكّر العميل في الوقت المطلوب.',
  '- أجب بإيجاز دائماً (1 إلى 3 جمل فقط).',
  '',
  'عند استقبال حجز جديد، اجمع هذه المعلومات:',
  '1. اسم العميل الكامل.',
  '2. رقم الهاتف.',
  '3. التاريخ والوقت المطلوب.',
  '4. نوع الخدمة أو الموعد (إن لزم).',
  '',
  'بعد جمع المعلومات، أكّد الموعد بصيغة: (تم تسجيل موعدك يوم [التاريخ] الساعة [الوقت]).',
].join('\n');

async function main() {
  console.log('Updating system_prompt in ai_config...');
  const { error } = await s
    .from('ai_config')
    .update({ system_prompt: systemPrompt, is_active: true })
    .eq('account_id', ACCOUNT_ID);

  if (error) {
    console.error('Failed:', error.message);
  } else {
    console.log('SUCCESS: system_prompt updated and AI enabled.');
  }

  // Verify
  const { data } = await s.from('ai_config').select('system_prompt, is_active').eq('account_id', ACCOUNT_ID).maybeSingle();
  console.log('is_active:', data?.is_active);
  console.log('system_prompt (first 100 chars):', data?.system_prompt?.substring(0, 100));
}

main().catch(console.error);
