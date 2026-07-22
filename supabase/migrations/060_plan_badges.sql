-- Add badge_type to subscription_plans
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS badge_type TEXT;

-- Migrate existing highlighted plans to 'popular'
UPDATE subscription_plans
SET badge_type = 'popular'
WHERE highlighted = true AND badge_type IS NULL;
