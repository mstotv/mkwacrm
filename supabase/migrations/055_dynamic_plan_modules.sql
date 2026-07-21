-- ============================================================
-- 055_dynamic_plan_modules.sql
--
-- Migration script to add a dynamic modules array to 
-- subscription_plans for advanced feature management.
-- ============================================================

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS modules JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS highlighted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS validity_days INTEGER DEFAULT 30;
