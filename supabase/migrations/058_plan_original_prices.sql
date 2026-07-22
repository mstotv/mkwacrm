-- ============================================================
-- 058_plan_original_prices.sql
--
-- Adds original_price_monthly and original_price_yearly 
-- to subscription_plans for displaying discount strikethrough.
-- ============================================================

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS original_price_monthly DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS original_price_yearly DECIMAL(10, 2);
