-- ============================================================
-- 023_saas_subscriptions
--
-- Set up tables for managing SaaS plans, account subscriptions,
-- and payment logs.
-- ============================================================

-- 1) Subscription Plans
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,              -- 'free', 'starter', 'pro', 'enterprise'
  display_name TEXT NOT NULL,      -- 'مجاني', 'Starter', 'Pro'
  price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_yearly NUMERIC(10,2) NOT NULL DEFAULT 0,
  limits JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default plans
INSERT INTO subscription_plans (name, display_name, price_monthly, price_yearly, limits)
VALUES 
  ('free', 'Free', 0, 0, '{"contacts": 100, "broadcasts": 5, "agents": 1, "automations": 3}'),
  ('starter', 'Starter', 29, 290, '{"contacts": 1000, "broadcasts": 50, "agents": 3, "automations": 10}'),
  ('pro', 'Pro', 79, 790, '{"contacts": -1, "broadcasts": -1, "agents": 10, "automations": -1}')
ON CONFLICT (name) DO NOTHING;

-- 2) Account Subscriptions
CREATE TABLE IF NOT EXISTS account_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  status TEXT NOT NULL DEFAULT 'active', -- active, cancelled, expired, trial
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
  payment_method TEXT,             -- 'plisio', 'telegram', 'manual', 'free'
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id)
);

-- 3) Payment History
CREATE TABLE IF NOT EXISTS payment_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  subscription_id UUID REFERENCES account_subscriptions(id),
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL,           -- paid, pending, failed, refunded
  payment_method TEXT,
  plisio_invoice_id TEXT,
  description TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

-- Simple policies (Admins+ can read, super admin can write)
CREATE POLICY "Anyone can view active plans" ON subscription_plans
  FOR SELECT USING (is_active = true);

CREATE POLICY "Members can view own subscription" ON account_subscriptions
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

CREATE POLICY "Members can view own payments" ON payment_history
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

-- 4) Profile extension for platform role
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS platform_role TEXT NOT NULL DEFAULT 'user';

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_platform_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_platform_role_check
  CHECK (platform_role IN ('super_admin', 'user'));
