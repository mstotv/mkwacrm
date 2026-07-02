-- ============================================================
-- 026_saas_fixes.sql
--
-- Fixes for RLS policies preventing subscription plans loading
-- and first-time AI configuration inserts.
-- ============================================================

-- 1) Fix RLS for subscription_plans (Public access for active plans)
ALTER TABLE subscription_plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active plans" ON subscription_plans;
CREATE POLICY "Anyone can view active plans" ON subscription_plans
  FOR SELECT TO public USING (is_active = true);

-- 2) Fix RLS for ai_config (Flexible manage for account admins/owners)
ALTER TABLE ai_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE ai_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can manage own AI config" ON ai_config;
CREATE POLICY "Members can manage own AI config" ON ai_config
  FOR ALL TO authenticated
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));
