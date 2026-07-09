import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Centralized feature access check.
 * Checks whether an account has access to a specific technical feature flag.
 *
 * @param supabase The Supabase client (service role or client role)
 * @param accountId The target account UUID
 * @param featureKey The feature flag string (e.g., 'ai_reply', 'google_sheets', 'broadcast', 'google_calendar')
 * @param userId Optional user UUID. If provided and the user is a platform admin (super_admin/assistant_admin), the check is bypassed.
 * @returns boolean indicating feature availability
 */
export async function hasFeatureAccess(
  supabase: SupabaseClient | any,
  accountId: string,
  featureKey: string,
  userId?: string
): Promise<boolean> {
  // 1) Platform admin bypass (admins have access to everything)
  if (userId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('platform_role')
      .eq('user_id', userId)
      .maybeSingle();

    if (
      profile &&
      (profile.platform_role === 'super_admin' ||
        profile.platform_role === 'assistant_admin')
    ) {
      return true;
    }
  }

  // 2) Get active subscription for the account
  const { data: subscription } = await supabase
    .from('account_subscriptions')
    .select('status, plan_id')
    .eq('account_id', accountId)
    .maybeSingle();

  let planId: string | null = null;

  if (subscription && (subscription.status === 'active' || subscription.status === 'trial')) {
    planId = subscription.plan_id;
  } else {
    // Fallback: If no active subscription, look up features of the default 'free' plan
    const { data: freePlan } = await supabase
      .from('subscription_plans')
      .select('id')
      .eq('name', 'free')
      .maybeSingle();

    if (freePlan) {
      planId = freePlan.id;
    }
  }

  if (!planId) {
    return false;
  }

  // 3) Check if the plan is assigned to a feature with the target feature_key in library
  const { data: assignment, error } = await supabase
    .from('plan_feature_assignments')
    .select('id, feature:plan_features_library!inner(feature_key)')
    .eq('plan_id', planId)
    .eq('plan_features_library.feature_key', featureKey)
    .maybeSingle();

  if (error || !assignment) {
    return false;
  }

  return true;
}
