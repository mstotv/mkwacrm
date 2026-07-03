-- ============================================================
-- 029_plans_feature_library.sql
--
-- Creates a centralized Feature Library with many-to-many
-- relationship to subscription_plans. Adds admin write policies
-- and migrates existing JSON-based features to the new tables.
-- ============================================================

-- 1) Add sort_order and description to subscription_plans
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- 2) Centralized Feature Library
CREATE TABLE IF NOT EXISTS plan_features_library (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3) Many-to-many junction table
CREATE TABLE IF NOT EXISTS plan_feature_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES plan_features_library(id) ON DELETE CASCADE,
  UNIQUE(plan_id, feature_id)
);

-- 4) Enable RLS
ALTER TABLE plan_features_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_feature_assignments ENABLE ROW LEVEL SECURITY;

-- 5) RLS: Feature Library
DROP POLICY IF EXISTS "Anyone can view features library" ON plan_features_library;
CREATE POLICY "Anyone can view features library" ON plan_features_library
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Super admins manage features library" ON plan_features_library;
CREATE POLICY "Super admins manage features library" ON plan_features_library
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND platform_role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND platform_role = 'super_admin'
    )
  );

-- 6) RLS: Feature Assignments
DROP POLICY IF EXISTS "Anyone can view feature assignments" ON plan_feature_assignments;
CREATE POLICY "Anyone can view feature assignments" ON plan_feature_assignments
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Super admins manage feature assignments" ON plan_feature_assignments;
CREATE POLICY "Super admins manage feature assignments" ON plan_feature_assignments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND platform_role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND platform_role = 'super_admin'
    )
  );

-- 7) Admin write policy for subscription_plans (currently only SELECT exists)
DROP POLICY IF EXISTS "Super admins manage subscription plans" ON subscription_plans;
CREATE POLICY "Super admins manage subscription plans" ON subscription_plans
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND platform_role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND platform_role = 'super_admin'
    )
  );

-- Also allow admins to see inactive plans
DROP POLICY IF EXISTS "Admins can view all plans" ON subscription_plans;
CREATE POLICY "Admins can view all plans" ON subscription_plans
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND platform_role = 'super_admin'
    )
  );

-- 8) Migrate existing features from JSON arrays to the library
-- This DO block extracts unique features from features_ar/features_en,
-- inserts them into the library, then creates assignments.
DO $$
DECLARE
  plan_row RECORD;
  feat_ar TEXT;
  feat_en TEXT;
  feat_id UUID;
  idx INTEGER;
  ar_arr JSONB;
  en_arr JSONB;
BEGIN
  FOR plan_row IN SELECT id, features_ar, features_en FROM subscription_plans LOOP
    ar_arr := COALESCE(plan_row.features_ar, '[]'::jsonb);
    en_arr := COALESCE(plan_row.features_en, '[]'::jsonb);

    -- Use Arabic array length as primary (they should be same length)
    FOR idx IN 0..GREATEST(jsonb_array_length(ar_arr), jsonb_array_length(en_arr)) - 1 LOOP
      feat_ar := COALESCE(ar_arr->>idx, '');
      feat_en := COALESCE(en_arr->>idx, '');

      -- Skip empty entries
      IF feat_ar = '' AND feat_en = '' THEN
        CONTINUE;
      END IF;

      -- Check if this feature already exists in the library
      SELECT id INTO feat_id
      FROM plan_features_library
      WHERE name_ar = feat_ar AND name_en = feat_en
      LIMIT 1;

      -- If not found, insert it
      IF feat_id IS NULL THEN
        INSERT INTO plan_features_library (name_ar, name_en, sort_order)
        VALUES (feat_ar, feat_en, idx)
        RETURNING id INTO feat_id;
      END IF;

      -- Create the assignment (ignore conflicts from duplicates)
      INSERT INTO plan_feature_assignments (plan_id, feature_id)
      VALUES (plan_row.id, feat_id)
      ON CONFLICT (plan_id, feature_id) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
