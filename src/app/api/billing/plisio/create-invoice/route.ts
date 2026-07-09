import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const planId = searchParams.get('planId');
  const billingPeriod = searchParams.get('billingPeriod'); // 'monthly' or 'yearly'

  if (!planId || !billingPeriod) {
    return new Response('Invalid request parameters', { status: 400 });
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
    return new Response('Unauthorized', { status: 401 });
  }

  // Fetch plan
  const { data: plan } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('id', planId)
    .maybeSingle();

  if (!plan) {
    return new Response('Subscription plan not found', { status: 404 });
  }

  // Find price from billing_options
  let price = 0;
  const options = (plan.billing_options || []) as Array<{ type: string; price: number; days?: number }>;
  const matchedOpt = options.find((opt) => {
    if (opt.type === 'custom_days') {
      return billingPeriod === `custom_days_${opt.days}`;
    }
    return opt.type === billingPeriod;
  });

  if (matchedOpt) {
    price = Number(matchedOpt.price);
  } else {
    price = billingPeriod === 'yearly' ? Number(plan.price_yearly) : Number(plan.price_monthly);
  }

  const orderNumber = `sub_${user.id}_${plan.id}_${Date.now()}`;

  // 1) Save payment request in DB
  const { error: insertError } = await supabase
    .from('payment_requests')
    .insert({
      order_number: orderNumber,
      user_id: user.id,
      plan_id: plan.id,
      billing_cycle: billingPeriod,
      amount: price,
      status: 'pending'
    });

  if (insertError) {
    console.error('[Plisio Invoice] Database insert error:', insertError);
    return new Response('Internal Database Error', { status: 500 });
  }

  // 2) Call Plisio API
  const plisioSecretKey = process.env.PLISIO_SECRET_KEY;
  if (!plisioSecretKey) {
    console.error('[Plisio Invoice] PLISIO_SECRET_KEY is missing');
    return new Response('Billing Configuration Error', { status: 500 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const callbackUrl = `${siteUrl}/api/webhooks/plisio?json=true`;

  const plisioParams = new URLSearchParams({
    api_key: plisioSecretKey,
    order_name: `${plan.display_name} Plan - ${billingPeriod}`,
    order_number: orderNumber,
    source_currency: 'USD',
    source_amount: price.toString(),
    callback_url: callbackUrl,
    success_callback_url: callbackUrl,
    fail_callback_url: callbackUrl,
    success_invoice_url: `${siteUrl}/billing/success`,
    fail_invoice_url: `${siteUrl}/billing/failed`,
    email: user.email || ''
  });

  try {
    const plisioResponse = await fetch(`https://plisio.net/api/v1/invoices/new?${plisioParams.toString()}`);
    const resData = await plisioResponse.json();

    if (resData.status === 'success' && resData.data?.invoice_url) {
      return NextResponse.redirect(resData.data.invoice_url);
    } else {
      console.error('[Plisio Invoice] API returned error:', resData);
      return new Response(resData.data?.message || 'Invoice creation failed on Plisio', { status: 400 });
    }
  } catch (err: any) {
    console.error('[Plisio Invoice] Fetch exception:', err);
    return new Response('Failed to connect to billing provider', { status: 500 });
  }
}
