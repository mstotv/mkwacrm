import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log('Adding new integration features...');

  const newFeatures = [
    {
      name_en: 'Google Sheets Integration',
      name_ar: 'ربط جوجل شيتس (Google Sheets)',
      feature_key: 'google_sheets',
      sort_order: 7
    },
    {
      name_en: 'Google Calendar Integration',
      name_ar: 'ربط تقويم جوجل (Google Calendar)',
      feature_key: 'google_calendar',
      sort_order: 8
    },
    {
      name_en: 'Telegram Notifications',
      name_ar: 'إشعارات تيليجرام',
      feature_key: 'telegram_notifications',
      sort_order: 9
    }
  ];

  const { error } = await supabase.from('plan_features_library').insert(newFeatures);

  if (error) {
    console.error('Error inserting features:', error.message);
  } else {
    console.log('Added integrations successfully!');
  }
}

run();
