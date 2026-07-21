import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log('Cleaning up old features...');
  
  // Delete all assignments
  await supabase.from('plan_feature_assignments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  
  // Delete all features
  await supabase.from('plan_features_library').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  console.log('Inserting generic scalable features...');

  const genericFeatures = [
    {
      name_en: 'WhatsApp Numbers',
      name_ar: 'أرقام الواتساب',
      feature_key: 'whatsapp_numbers',
      sort_order: 1
    },
    {
      name_en: 'Messages / Month',
      name_ar: 'الرسائل شهرياً',
      feature_key: 'messages_limit',
      sort_order: 2
    },
    {
      name_en: 'Contacts',
      name_ar: 'جهات الاتصال',
      feature_key: 'contacts_limit',
      sort_order: 3
    },
    {
      name_en: 'Team Agents',
      name_ar: 'أعضاء الفريق',
      feature_key: 'agents_limit',
      sort_order: 4
    },
    {
      name_en: 'Broadcasts / Month',
      name_ar: 'حملات البث شهرياً',
      feature_key: 'broadcasts_limit',
      sort_order: 5
    },
    {
      name_en: 'AI Automations',
      name_ar: 'أتمتة الذكاء الاصطناعي',
      feature_key: 'ai_automations',
      sort_order: 6
    }
  ];

  const { error } = await supabase.from('plan_features_library').insert(genericFeatures);

  if (error) {
    console.error('Error inserting features:', error.message);
  } else {
    console.log('Cleanup and seed completed successfully! Check the Admin UI.');
  }
}

run();
