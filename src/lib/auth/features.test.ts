import { describe, it, expect, vi } from 'vitest';
import { hasFeatureAccess } from './features';

describe('hasFeatureAccess', () => {
  const mockSupabase = (profileData: any, subData: any, assignmentData: any) => {
    return {
      from: vi.fn().mockImplementation((table: string) => {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockImplementation(async () => {
            if (table === 'profiles') {
              return { data: profileData, error: null };
            }
            if (table === 'account_subscriptions') {
              return { data: subData, error: null };
            }
            if (table === 'subscription_plans') {
              return { data: { id: 'free-plan-id' }, error: null };
            }
            if (table === 'plan_feature_assignments') {
              return { data: assignmentData, error: null };
            }
            return { data: null, error: null };
          }),
        };
      }),
    };
  };

  it('should grant access to platform admins immediately', async () => {
    const supabase = mockSupabase({ platform_role: 'super_admin' }, null, null);
    const result = await hasFeatureAccess(supabase, 'acc-id', 'ai_reply', 'user-id');
    expect(result).toBe(true);
  });

  it('should deny access if no subscription and no assignment on free plan', async () => {
    const supabase = mockSupabase(null, null, null);
    const result = await hasFeatureAccess(supabase, 'acc-id', 'ai_reply', 'user-id');
    expect(result).toBe(false);
  });

  it('should grant access if active subscription and plan has the feature key assigned', async () => {
    const supabase = mockSupabase(
      null,
      { status: 'active', plan_id: 'pro-plan-id' },
      { id: 'assign-id' }
    );
    const result = await hasFeatureAccess(supabase, 'acc-id', 'ai_reply', 'user-id');
    expect(result).toBe(true);
  });

  it('should deny access if active subscription but plan does not have feature key assigned', async () => {
    const supabase = mockSupabase(
      null,
      { status: 'active', plan_id: 'starter-plan-id' },
      null
    );
    const result = await hasFeatureAccess(supabase, 'acc-id', 'ai_reply', 'user-id');
    expect(result).toBe(false);
  });
});
