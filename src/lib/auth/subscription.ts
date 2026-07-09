export interface SubscriptionPlanSummary {
  name?: string | null;
  display_name?: string | null;
}

export interface SubscriptionSummary {
  status?: string | null;
  plan?: SubscriptionPlanSummary | null;
}

export function isActiveSubscription(subscription: SubscriptionSummary | null | undefined): boolean {
  const status = subscription?.status?.toLowerCase();
  return status === 'active' || status === 'trial';
}

export function getEffectiveSubscriptionPlanLabel(
  subscription: SubscriptionSummary | null | undefined,
): string {
  if (isActiveSubscription(subscription) && subscription?.plan) {
    return subscription.plan.display_name || subscription.plan.name || 'Paid plan';
  }

  return 'Free';
}
