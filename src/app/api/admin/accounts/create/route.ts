import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify calling user is super_admin
  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('platform_role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!callerProfile || callerProfile.platform_role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden. Super Admin only.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { name, ownerName, email, password, planId, billingPeriod } = body;

    if (!name || !ownerName || !email || !password || !planId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Initialize Supabase Admin client to write bypassing RLS and using auth.admin
    const adminSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          getAll() { return []; },
          setAll() {}
        }
      }
    );

    // 1. Create auth user
    const { data: createdUser, error: createUserError } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: ownerName }
    });

    if (createUserError) throw createUserError;
    const newUserId = createdUser.user.id;

    // 2. Create account
    const { data: accountData, error: accountError } = await adminSupabase
      .from('accounts')
      .insert({
        name,
        owner_user_id: newUserId,
      })
      .select()
      .single();

    if (accountError) throw accountError;
    const newAccountId = accountData.id;

    // 3. Update / Insert Profile (Trigger might have already auto-inserted a profile row)
    // Check if profile exists
    const { data: existingProfile } = await adminSupabase
      .from('profiles')
      .select('id')
      .eq('user_id', newUserId)
      .maybeSingle();

    if (existingProfile) {
      const { error: profileError } = await adminSupabase
        .from('profiles')
        .update({
          full_name: ownerName,
          account_id: newAccountId,
          account_role: 'owner',
          platform_role: 'user',
        })
        .eq('id', existingProfile.id);
      if (profileError) throw profileError;
    } else {
      const { error: profileError } = await adminSupabase
        .from('profiles')
        .insert({
          user_id: newUserId,
          full_name: ownerName,
          email,
          account_id: newAccountId,
          account_role: 'owner',
          platform_role: 'user',
        });
      if (profileError) throw profileError;
    }

    // 4. Create active subscription
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + (billingPeriod === 'yearly' ? 365 : 30));

    const { error: subError } = await adminSupabase
      .from('account_subscriptions')
      .insert({
        account_id: newAccountId,
        plan_id: planId,
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: periodEnd.toISOString(),
        payment_method: 'manual',
      });

    if (subError) throw subError;

    return NextResponse.json({ success: true, accountId: newAccountId });
  } catch (err: any) {
    console.error('Account creation error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
