const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const accountId = "8f1b4c79-f5a2-4050-be62-3e7f69075dd9"; // support@mita.com account id from the DB check
  
  console.log("Querying account_subscriptions for account:", accountId);
  const { data: subData, error } = await supabase
    .from('account_subscriptions')
    .select(`
      status,
      current_period_end,
      plan:subscription_plans(*)
    `)
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) {
    console.error("❌ Database query failed:", error);
  } else {
    console.log("✅ Database query succeeded!");
    console.log("Result:", JSON.stringify(subData, null, 2));
  }
}

run();
