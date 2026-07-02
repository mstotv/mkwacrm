const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fadogxelpjdstacymngd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhZG9neGVscGpkc3RhY3ltbmdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MDk0NDcsImV4cCI6MjA5ODQ4NTQ0N30.WqiNL-cx0zU5D45uv8hkkOWahv2norwsDLBzgvaCT0U'; // Anon key (RLS active)

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  try {
    const { data: plans, error: err1 } = await supabase.from('subscription_plans').select('*').eq('is_active', true);
    console.log('--- SELECT PLANS (ANON) ---');
    console.log('Error:', err1);
    console.log('Data:', plans);
  } catch (e) {
    console.error(e);
  }
}

test();
