import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function verifyPlisioSignature(body: any, receivedHash: string, secretKey: string): boolean {
  const data = { ...body };
  delete data.verify_hash;

  // 1. ksort equivalent: sort keys alphabetically
  const sorted: any = {};
  Object.keys(data).sort().forEach(key => {
    sorted[key] = data[key];
  });
  const serializedSorted = JSON.stringify(sorted);
  const hashSorted = crypto.createHmac('sha1', secretKey).update(serializedSorted).digest('hex');
  if (hashSorted === receivedHash) return true;

  // 2. Unsorted fallback
  const serializedUnsorted = JSON.stringify(data);
  const hashUnsorted = crypto.createHmac('sha1', secretKey).update(serializedUnsorted).digest('hex');
  if (hashUnsorted === receivedHash) return true;

  console.error('[Plisio Webhook] Signature verification failed.', {
    receivedHash,
    hashSorted,
    hashUnsorted
  });
  return false;
}

export async function POST(request: Request) {
  // Use service role client to bypass RLS policies for updates
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return []; },
        setAll() {}
      }
    }
  );

  try {
    const rawBody = await request.text();
    let body: any = {};
    
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      // Fallback if Plisio sends form-urlencoded (though json=true is passed)
      const params = new URLSearchParams(rawBody);
      params.forEach((val, key) => {
        body[key] = val;
      });
    }

    const verifyHash = body.verify_hash;
    if (!verifyHash) {
      console.warn('[Plisio Webhook] Missing verify_hash in payload');
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    const secretKey = process.env.PLISIO_SECRET_KEY;
    if (!secretKey) {
      console.error('[Plisio Webhook] PLISIO_SECRET_KEY is not defined in environment');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Verify signature
    const isValid = verifyPlisioSignature(body, verifyHash, secretKey);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 422 });
    }

    const { status, txn_id, order_number } = body;
    if (!order_number || !status) {
      return NextResponse.json({ error: 'Missing status or order number' }, { status: 400 });
    }

    // Find the payment request in the DB
    const { data: paymentRequest, error: reqError } = await supabase
      .from('payment_requests')
      .select('*')
      .eq('order_number', order_number)
      .maybeSingle();

    if (reqError || !paymentRequest) {
      console.warn(`[Plisio Webhook] Payment request not found for order: ${order_number}`);
      return NextResponse.json({ error: 'Payment request not found' }, { status: 404 });
    }

    // Only process state changes if not already finalized
    if (paymentRequest.status === 'pending') {
      if (status === 'completed') {
        // 1) Update payment request status
        await supabase
          .from('payment_requests')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', paymentRequest.id);

        // 2) Find account_id for the user
        const { data: profile } = await supabase
          .from('profiles')
          .select('account_id')
          .eq('user_id', paymentRequest.user_id)
          .maybeSingle();

        if (profile?.account_id) {
          const accountId = profile.account_id;
          
          // 3) Create or update account subscription
          let periodEnd: string | null = null;
          const cycle = paymentRequest.billing_cycle || 'monthly';
          if (cycle !== 'lifetime') {
            const date = new Date();
            if (cycle === 'yearly') {
              date.setDate(date.getDate() + 365);
            } else if (cycle === 'monthly') {
              date.setDate(date.getDate() + 30);
            } else if (cycle.startsWith('custom_days_')) {
              const days = parseInt(cycle.replace('custom_days_', ''), 10);
              date.setDate(date.getDate() + (isNaN(days) ? 30 : days));
            } else {
              date.setDate(date.getDate() + 30);
            }
            periodEnd = date.toISOString();
          }

          const { data: existingSub } = await supabase
            .from('account_subscriptions')
            .select('id')
            .eq('account_id', accountId)
            .maybeSingle();

          let subscriptionId = '';

          if (existingSub) {
            const { data: updatedSub } = await supabase
              .from('account_subscriptions')
              .update({
                plan_id: paymentRequest.plan_id,
                status: 'active',
                current_period_start: new Date().toISOString(),
                current_period_end: periodEnd,
                payment_method: 'plisio',
                updated_at: new Date().toISOString(),
              })
              .eq('account_id', accountId)
              .select('id')
              .single();
            
            subscriptionId = updatedSub?.id || '';
          } else {
            const { data: insertedSub } = await supabase
              .from('account_subscriptions')
              .insert({
                account_id: accountId,
                plan_id: paymentRequest.plan_id,
                status: 'active',
                current_period_start: new Date().toISOString(),
                current_period_end: periodEnd,
                payment_method: 'plisio',
              })
              .select('id')
              .single();
            
            subscriptionId = insertedSub?.id || '';
          }

          // 4) Insert record into payment_history
          await supabase
            .from('payment_history')
            .insert({
              account_id: accountId,
              subscription_id: subscriptionId || null,
              amount: paymentRequest.amount,
              currency: 'USD',
              status: 'paid',
              payment_method: 'plisio',
              plisio_invoice_id: txn_id,
              plan_id: paymentRequest.plan_id,
              billing_period: paymentRequest.billing_cycle,
              description: `Paid for Plan ${paymentRequest.plan_id} (${paymentRequest.billing_cycle}) via Plisio crypto invoice`,
              paid_at: new Date().toISOString()
            });

          console.log(`[Plisio Webhook] Plan successfully activated for account: ${accountId}`);
        } else {
          console.error(`[Plisio Webhook] Account ID profile not found for user: ${paymentRequest.user_id}`);
        }

      } else if (['error', 'cancelled', 'expired'].includes(status)) {
        // Finalize payment request as failed
        await supabase
          .from('payment_requests')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .eq('id', paymentRequest.id);

        console.log(`[Plisio Webhook] Payment request failed with status: ${status}`);
      } else {
        // Other states (new, pending, pending internal)
        console.log(`[Plisio Webhook] Payment request progress: ${status}`);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Plisio Webhook] Error:', err);
    return NextResponse.json({ error: err.message || 'Webhook internal error' }, { status: 500 });
  }
}
