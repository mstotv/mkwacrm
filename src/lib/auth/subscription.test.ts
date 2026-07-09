import { describe, it, expect } from 'vitest';
import { getEffectiveSubscriptionPlanLabel, isActiveSubscription } from './subscription';

describe('subscription helpers', () => {
  it('returns the paid plan label for active or trial subscriptions', () => {
    const subscription = {
      status: 'active',
      plan: { name: 'pro', display_name: 'Pro' },
    };

    expect(getEffectiveSubscriptionPlanLabel(subscription)).toBe('Pro');
    expect(isActiveSubscription(subscription)).toBe(true);
  });

  it('falls back to free when no active plan exists', () => {
    expect(getEffectiveSubscriptionPlanLabel(null)).toBe('Free');
    expect(isActiveSubscription({ status: 'expired', plan: { name: 'pro', display_name: 'Pro' } })).toBe(false);
  });
});
