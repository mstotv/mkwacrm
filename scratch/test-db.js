const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fadogxelpjdstacymngd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhZG9neGVscGpkc3RhY3ltbmdkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjkwOTQ0NywiZXhwIjoyMDk4NDg1NDQ3fQ.SqPc2zcdeC2gt4fphcfjVDjv0UkDTDyDaxMTWMXffbc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  try {
    // Let's create an RPC or execute something if possible.
    // Wait, let's look at what tables exist or check if there is an error in fetching.
    // Let's see if there is any other table like account_subscriptions or payment_history.
    const { data: subs, error: errSub } = await supabase.from('account_subscriptions').select('*');
    console.log('--- SUBSCRIPTIONS (SERVICE ROLE) ---');
    console.log('Error:', errSub);
    console.log(subs);
  } catch (e) {
    console.error(e);
  }
}

test();
