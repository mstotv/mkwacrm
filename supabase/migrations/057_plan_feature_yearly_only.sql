-- ============================================================
-- 057_plan_feature_yearly_only.sql
--
-- Adds yearly_only boolean to plan_feature_assignments
-- so features can be hidden on the monthly toggle.
-- ============================================================

ALTER TABLE plan_feature_assignments
  ADD COLUMN IF NOT EXISTS yearly_only BOOLEAN NOT NULL DEFAULT false;
