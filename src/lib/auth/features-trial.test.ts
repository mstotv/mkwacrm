import { describe, it, expect, vi } from 'vitest';
import { hasFeatureAccess } from './features';

describe('hasFeatureAccess with trials', () => {
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

  it('should grant access when subscription status is trial', async () => {
    const supabase = mockSupabase(
      null,
      { status: 'trial', plan_id: 'pro-plan-id' },
      { id: 'assign-id' }
    );
    const result = await hasFeatureAccess(supabase, 'acc-id', 'ai_reply', 'user-id');
    expect(result).toBe(true);
  });

  it('should deny access when subscription is expired', async () => {
    const supabase = mockSupabase(
      null,
      { status: 'expired', plan_id: 'pro-plan-id' },
      null
    );
    const result = await hasFeatureAccess(supabase, 'acc-id', 'ai_reply', 'user-id');
    expect(result).toBe(false);
  });
});
