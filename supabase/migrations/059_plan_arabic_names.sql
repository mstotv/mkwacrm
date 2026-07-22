-- Add display_name_ar to subscription_plans
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS display_name_ar TEXT;

-- Update existing plans with fallback values
UPDATE subscription_plans
SET display_name_ar = display_name
WHERE display_name_ar IS NULL;
