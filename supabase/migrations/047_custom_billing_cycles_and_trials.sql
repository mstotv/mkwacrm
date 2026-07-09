-- Add custom billing cycles and trial period support

-- 1) Add trial_period_days to subscription_plans
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS trial_period_days INTEGER NOT NULL DEFAULT 0;

-- 2) Add billing_options JSONB to subscription_plans
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS billing_options JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 3) Drop NOT NULL from account_subscriptions.current_period_end to support Lifetime plans (no expiration)
ALTER TABLE account_subscriptions ALTER COLUMN current_period_end DROP NOT NULL;

-- 4) Drop check constraint on billing_cycle from payment_requests to allow any billing cycle name
ALTER TABLE payment_requests DROP CONSTRAINT IF EXISTS payment_requests_billing_cycle_check;

-- 5) Backfill existing subscription plans billing_options
UPDATE subscription_plans
SET billing_options = jsonb_build_array(
  jsonb_build_object('type', 'monthly', 'price', price_monthly),
  jsonb_build_object('type', 'yearly', 'price', price_yearly)
)
WHERE billing_options = '[]'::jsonb OR billing_options IS NULL;
