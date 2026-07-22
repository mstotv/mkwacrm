import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/public/plans
 *
 * Public endpoint (no auth required) that returns all active subscription plans
 * with their assigned features from the centralized feature library.
 *
 * Used by the landing page pricing section for live display.
 * Returns Cache-Control: no-store so admin changes appear instantly.
 */
export async function GET() {
  try {
    // Use service role or anon key for public read
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Fetch active plans ordered by sort_order then price
    const { data: plans, error: plansError } = await supabase
      .from('subscription_plans')
      .select('id, name, display_name, display_name_ar, description, price_monthly, price_yearly, original_price_monthly, original_price_yearly, sort_order, limits, features_ar, features_en, highlighted, trial_period_days, badge_type')
      .eq('is_active', true)
      .order('price_monthly', { ascending: true });

    if (plansError) {
      console.error('Error fetching plans:', plansError);
      return NextResponse.json({ error: 'Failed to fetch plans' }, { status: 500 });
    }

    // Fetch all feature assignments with feature details, specifically those shown on landing
    const { data: assignments, error: assignError } = await supabase
      .from('plan_feature_assignments')
      .select('plan_id, is_enabled, usage_limit, bulk_limit, show_on_landing, yearly_only, feature:plan_features_library(id, name_ar, name_en, sort_order)')
      .eq('is_enabled', true)
      .eq('show_on_landing', true);

    if (assignError) {
      console.error('Error fetching feature assignments:', assignError);
      // Fallback
      return NextResponse.json({ plans: plans || [] }, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // Group feature assignments by plan_id
    const featuresByPlan: Record<string, any[]> = {};
    for (const assignment of (assignments || [])) {
      const planId = assignment.plan_id;
      const feature = assignment.feature as any;
      if (!feature) continue;

      if (!featuresByPlan[planId]) {
        featuresByPlan[planId] = [];
      }
      featuresByPlan[planId].push({
        id: feature.id,
        name_ar: feature.name_ar,
        name_en: feature.name_en,
        sort_order: feature.sort_order ?? 0,
        usage_limit: assignment.usage_limit,
        bulk_limit: assignment.bulk_limit,
        yearly_only: assignment.yearly_only,
      });
    }

    for (const planId of Object.keys(featuresByPlan)) {
      featuresByPlan[planId].sort((a, b) => a.sort_order - b.sort_order);
    }

    // Merge plans with their features
    const enrichedPlans = (plans || []).map((plan: any) => {
      const libraryFeatures = featuresByPlan[plan.id] || [];

      return {
        id: plan.id,
        name: plan.name,
        display_name: plan.display_name,
        display_name_ar: plan.display_name_ar,
        description: plan.description,
        price_monthly: plan.price_monthly,
        price_yearly: plan.price_yearly,
        original_price_monthly: plan.original_price_monthly,
        original_price_yearly: plan.original_price_yearly,
        trial_period_days: plan.trial_period_days,
        sort_order: plan.sort_order,
        limits: plan.limits,
        highlighted: plan.highlighted,
        badge_type: plan.badge_type,
        features: libraryFeatures,
      };
    });

    return NextResponse.json({ plans: enrichedPlans }, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('Public plans API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
