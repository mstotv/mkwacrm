const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fadogxelpjdstacymngd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhZG9neGVscGpkc3RhY3ltbmdkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjkwOTQ0NywiZXhwIjoyMDk4NDg1NDQ3fQ.SqPc2zcdeC2gt4fphcfjVDjv0UkDTDyDaxMTWMXffbc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('platform_role, account:accounts(is_blocked)')
      .eq('user_id', 'e3dd1155-47bf-4484-80f2-0b9fc9339599')
      .maybeSingle();

    console.log('Error:', error);
    console.log('Data:', data);
  } catch (e) {
    console.error(e);
  }
}

test();
