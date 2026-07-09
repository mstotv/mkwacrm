const { createClient } = require(require('path').join(process.cwd(), 'node_modules', '@supabase/supabase-js'));

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function testTrialActivationRLS() {
  const testEmail = 'telegram_1953151552@placeholder.local'; // Real user (owner of Valarant account)
  const starterPlanId = '84843eda-81c3-4804-be6d-5ee7c623b0a1'; // Starter plan id

  console.log('=== TESTING TRIAL ACTIVATION RLS (VALARANT) ===\n');

  // Sign in as user to get an anon client session
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: testEmail,
  });

  if (linkErr) {
    console.error('❌ Magic link generation failed:', linkErr.message);
    return;
  }

  const { data: sessionData, error: sessionErr } = await anonClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });

  if (sessionErr) {
    console.error('❌ Session verification failed:', sessionErr.message);
    return;
  }

  console.log(`✅ Signed in as: ${sessionData.user?.email}`);

  // Get user's account_id
  const { data: profile } = await anonClient
    .from('profiles')
    .select('account_id, account_role')
    .maybeSingle();
  
  console.log('User Profile:', profile);

  if (!profile || profile.account_role !== 'owner') {
    console.log('❌ Not an owner, cannot test.');
    await anonClient.auth.signOut();
    return;
  }

  // Let's try to update or insert account_subscriptions directly using the user's anon client (simulating route logic)
  const { data, error } = await anonClient
    .from('account_subscriptions')
    .update({
      plan_id: starterPlanId,
      status: 'trial',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      payment_method: 'trial',
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', profile.account_id)
    .select();

  console.log('User direct update result (should be empty [] due to RLS write protection):', { data, error });

  await anonClient.auth.signOut();
}

testTrialActivationRLS().catch(console.error);
