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
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { accountId, planId, amount, billingPeriod } = body;

    if (!accountId || !planId || !amount) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Double check user belongs to account and is owner/admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_role')
      .eq('user_id', user.id)
      .eq('account_id', accountId)
      .maybeSingle();

    if (!profile || (profile.account_role !== 'owner' && profile.account_role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden. Owner or Admin role required.' }, { status: 403 });
    }

    // Prepare Plisio payment invoice request
    // Reference: Plisio API requirements
    const plisioSecretKey = process.env.PLISIO_SECRET_KEY || 'MOCK_SECRET_KEY';
    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/webhooks/plisio`;
    
    // In production, you would fetch Plisio API. Since we are in dev, if no key exists, we'll return a mock URL.
    let paymentUrl = '';
    let plisioInvoiceId = `plisio_${Math.random().toString(36).substring(2, 11)}`;

    if (process.env.PLISIO_SECRET_KEY) {
      // Direct API fetch to Plisio
      const params = new URLSearchParams({
        api_key: plisioSecretKey,
        amount: amount.toString(),
        currency: 'USD',
        order_number: plisioInvoiceId,
        order_name: `MitaKurd AutoWA - Plan Subscription`,
        callback_url: callbackUrl,
        success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/settings?tab=billing&success=true`,
      });

      const plisioRes = await fetch(`https://plisio.net/api/v1/invoices/new?${params.toString()}`);
      const plisioData = await plisioRes.json();

      if (plisioData.status === 'success' && plisioData.data) {
        paymentUrl = plisioData.data.payment_url;
        plisioInvoiceId = plisioData.data.txn_id || plisioInvoiceId;
      } else {
        throw new Error(plisioData.data?.message || 'Plisio API returned error');
      }
    } else {
      // Mock payment URL for testing
      paymentUrl = `https://plisio.net/invoice/mock_payment_${plisioInvoiceId}`;
    }

    // Insert pending payment history
    const { data: paymentRecord, error: payError } = await supabase
      .from('payment_history')
      .insert({
        account_id: accountId,
        amount: amount,
        currency: 'USD',
        status: 'pending',
        payment_method: 'plisio',
        plisio_invoice_id: plisioInvoiceId,
        plan_id: planId,
        billing_period: billingPeriod,
        description: `Plisio Crypto invoice for Plan ${planId} (${billingPeriod})`,
      })
      .select()
      .single();

    if (payError) throw payError;

    // Simulate auto-activation in development if no key exists so the developer/user can see it work!
    if (!process.env.PLISIO_SECRET_KEY) {
      // Let's create/update the active subscription automatically after 5 seconds to simulate a webhook
      setTimeout(async () => {
        const adminSupabase = createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { cookies: { getAll() { return []; }, setAll() {} } }
        );

        // Update payment history
        await adminSupabase
          .from('payment_history')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('plisio_invoice_id', plisioInvoiceId);

        // Update or insert subscription
        const periodEnd = new Date();
        periodEnd.setDate(periodEnd.getDate() + (billingPeriod === 'yearly' ? 365 : 30));

        const { data: existingSub } = await adminSupabase
          .from('account_subscriptions')
          .select('id')
          .eq('account_id', accountId)
          .maybeSingle();

        if (existingSub) {
          await adminSupabase
            .from('account_subscriptions')
            .update({
              plan_id: planId,
              status: 'active',
              current_period_start: new Date().toISOString(),
              current_period_end: periodEnd.toISOString(),
              payment_method: 'plisio',
              updated_at: new Date().toISOString(),
            })
            .eq('account_id', accountId);
        } else {
          await adminSupabase
            .from('account_subscriptions')
            .insert({
              account_id: accountId,
              plan_id: planId,
              status: 'active',
              current_period_start: new Date().toISOString(),
              current_period_end: periodEnd.toISOString(),
              payment_method: 'plisio',
            });
        }
      }, 3000);
    }

    return NextResponse.json({
      success: true,
      payment_url: paymentUrl,
      invoice_id: plisioInvoiceId,
    });
  } catch (err: any) {
    console.error('Invoice creation failed:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
