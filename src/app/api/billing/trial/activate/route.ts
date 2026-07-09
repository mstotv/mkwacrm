import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { planId } = body;

    if (!planId) {
      return NextResponse.json({ error: 'Missing planId parameter' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {}
        }
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1) Find account_id for the user and platform role
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id, account_role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'User is not linked to any account' }, { status: 403 });
    }

    if (profile.account_role !== 'owner') {
      return NextResponse.json({ error: 'Only account owner can activate trial' }, { status: 403 });
    }

    const accountId = profile.account_id;

    // 2) Fetch plan to check if free trial is available
    const { data: plan } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', planId)
      .maybeSingle();

    if (!plan) {
      return NextResponse.json({ error: 'Subscription plan not found' }, { status: 404 });
    }

    const trialDays = plan.trial_period_days || 0;
    if (trialDays <= 0) {
      return NextResponse.json({ error: 'This plan does not offer a free trial' }, { status: 400 });
    }

    // 3) Check if account already had a trial
    const { data: existingSub } = await supabase
      .from('account_subscriptions')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    if (existingSub?.trial_ends_at) {
      return NextResponse.json({
        error: 'لقد استهلكت بالفعل الفترة التجريبية المجانية لهذا الحساب ولا يمكن تفعيلها مرة أخرى'
      }, { status: 400 });
    }

    // 4) Activate free trial
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

    let result;
    if (existingSub) {
      const { data, error } = await supabase
        .from('account_subscriptions')
        .update({
          plan_id: planId,
          status: 'trial',
          current_period_start: new Date().toISOString(),
          current_period_end: trialEndsAt.toISOString(),
          trial_ends_at: trialEndsAt.toISOString(),
          payment_method: 'trial',
          updated_at: new Date().toISOString(),
        })
        .eq('account_id', accountId)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from('account_subscriptions')
        .insert({
          account_id: accountId,
          plan_id: planId,
          status: 'trial',
          current_period_start: new Date().toISOString(),
          current_period_end: trialEndsAt.toISOString(),
          trial_ends_at: trialEndsAt.toISOString(),
          payment_method: 'trial',
        })
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    return NextResponse.json({ success: true, subscription: result });
  } catch (err: any) {
    console.error('[Trial Activation] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
