const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  console.log("Signing in as support@mita.com...");
  const { data: { session }, error: signErr } = await supabase.auth.signInWithPassword({
    email: 'support@mita.com',
    password: '123456'
  });

  if (signErr) {
    console.error("❌ Sign in failed:", signErr);
    return;
  }

  console.log("✅ Signed in! User ID:", session.user.id);
  console.log("JWT Claims:", session.user.app_metadata, session.user.user_metadata);

  console.log("\nFetching profile using SELECT query...");
  const { data: profile, error: queryErr } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url, role, beta_features, account_id, account_role, platform_role, account:accounts!inner(id, name, default_currency)")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (queryErr) {
    console.error("❌ Profile query failed:", queryErr);
  } else {
    console.log("✅ Profile fetched successfully!");
    console.log("Profile data:", JSON.stringify(profile, null, 2));
  }
}

run();
