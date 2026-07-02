import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return []; },
        setAll() {}
      }
    }
  );

  try {
    let status = '';
    let txn_id = '';
    let order_number = '';

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await request.json();
      status = body.status || '';
      txn_id = body.txn_id || '';
      order_number = body.order_number || '';
    } else {
      const text = await request.text();
      const params = new URLSearchParams(text);
      status = params.get('status') || '';
      txn_id = params.get('txn_id') || '';
      order_number = params.get('order_number') || '';
    }

    if (!txn_id || !status) {
      return NextResponse.json({ error: 'Missing webhook params' }, { status: 400 });
    }

    // We only activate/process if status is completed ('completed' or 'confirmed')
    if (status === 'completed' || status === 'confirmed') {
      // Find the payment history record
      const { data: paymentRecord, error: findError } = await supabase
        .from('payment_history')
        .select('*')
        .eq('plisio_invoice_id', txn_id)
        .maybeSingle();

      if (findError || !paymentRecord) {
        console.error('Payment history not found for txn:', txn_id);
        return NextResponse.json({ error: 'Payment record not found' }, { status: 404 });
      }

      if (paymentRecord.status !== 'paid') {
        // Update payment history
        await supabase
          .from('payment_history')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
          })
          .eq('id', paymentRecord.id);

        // Fetch corresponding plan and billing period from paymentRecord (or check descriptions for fallback)
        const planId = paymentRecord.plan_id;
        const isYearly = paymentRecord.billing_period === 'yearly' || paymentRecord.description?.includes('yearly') || false;
        const periodEnd = new Date();
        periodEnd.setDate(periodEnd.getDate() + (isYearly ? 365 : 30));

        let targetPlanId = planId;

        if (!targetPlanId) {
          // Get default subscription plan named 'starter' to map, or whatever is stored
          const { data: plan } = await supabase
            .from('subscription_plans')
            .select('id')
            .eq('name', 'starter')
            .single();
          targetPlanId = plan?.id;
        }

        if (targetPlanId) {
          // Update or insert subscription
          const { data: existingSub } = await supabase
            .from('account_subscriptions')
            .select('id')
            .eq('account_id', paymentRecord.account_id)
            .maybeSingle();

          if (existingSub) {
            await supabase
              .from('account_subscriptions')
              .update({
                plan_id: targetPlanId,
                status: 'active',
                current_period_start: new Date().toISOString(),
                current_period_end: periodEnd.toISOString(),
                payment_method: 'plisio',
                updated_at: new Date().toISOString(),
              })
              .eq('account_id', paymentRecord.account_id);
          } else {
            await supabase
              .from('account_subscriptions')
              .insert({
                account_id: paymentRecord.account_id,
                plan_id: targetPlanId,
                status: 'active',
                current_period_start: new Date().toISOString(),
                current_period_end: periodEnd.toISOString(),
                payment_method: 'plisio',
              });
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Webhook error:', err);
    return NextResponse.json({ error: err.message || 'Internal webhook error' }, { status: 500 });
  }
}
