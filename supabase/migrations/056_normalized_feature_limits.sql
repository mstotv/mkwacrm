-- ============================================================
-- 056_normalized_feature_limits.sql
--
-- Migration script to extend plan_feature_assignments for fully
-- normalized feature management per plan.
-- ============================================================

-- Revert JSONB modules if they were added
ALTER TABLE subscription_plans
  DROP COLUMN IF EXISTS modules;

-- Extend the junction table
ALTER TABLE plan_feature_assignments
  ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS usage_limit INTEGER NOT NULL DEFAULT -1,
  ADD COLUMN IF NOT EXISTS bulk_limit INTEGER NOT NULL DEFAULT -1,
  ADD COLUMN IF NOT EXISTS show_on_landing BOOLEAN NOT NULL DEFAULT true;
