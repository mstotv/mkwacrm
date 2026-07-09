-- 1) Add feature_key column to plan_features_library
ALTER TABLE plan_features_library ADD COLUMN IF NOT EXISTS feature_key TEXT UNIQUE;

-- 2) Populate initial keys for known standard features
UPDATE plan_features_library SET feature_key = 'ai_reply' WHERE name_en = 'AI Auto-Reply (OpenAI/DeepSeek)';
UPDATE plan_features_library SET feature_key = 'google_sheets' WHERE name_en = 'Google Sheets Sync';
UPDATE plan_features_library SET feature_key = 'broadcast' WHERE name_en = 'Broadcast Campaigns';
UPDATE plan_features_library SET feature_key = 'google_calendar' WHERE name_en = 'Google Calendar Sync';
UPDATE plan_features_library SET feature_key = 'scheduled_messages' WHERE name_en = 'Scheduled Messages';
UPDATE plan_features_library SET feature_key = 'keyword_auto_responder' WHERE name_en = 'Keyword Auto-Reply';
UPDATE plan_features_library SET feature_key = 'csv_import_export' WHERE name_en = 'CSV Import/Export';

-- 3) Ensure 'Google Calendar Sync' exists in the library for future assignments
INSERT INTO plan_features_library (name_ar, name_en, feature_key, sort_order)
VALUES ('مزامنة تقويم جوجل', 'Google Calendar Sync', 'google_calendar', 8)
ON CONFLICT (feature_key) DO NOTHING;

-- 4) Create trigger to automatically sync features_ar/features_en changes to library & assignments
CREATE OR REPLACE FUNCTION sync_plan_features_trigger()
RETURNS TRIGGER AS $$
DECLARE
  feat_ar TEXT;
  feat_en TEXT;
  feat_id UUID;
  idx INTEGER;
  ar_arr JSONB;
  en_arr JSONB;
  assigned_feat_ids UUID[] := '{}';
BEGIN
  ar_arr := COALESCE(NEW.features_ar, '[]'::jsonb);
  en_arr := COALESCE(NEW.features_en, '[]'::jsonb);

  -- Loop through the features and sync
  FOR idx IN 0..GREATEST(jsonb_array_length(ar_arr), jsonb_array_length(en_arr)) - 1 LOOP
    feat_ar := COALESCE(ar_arr->>idx, '');
    feat_en := COALESCE(en_arr->>idx, '');

    IF feat_ar = '' AND feat_en = '' THEN
      CONTINUE;
    END IF;

    -- Find or insert feature in library
    SELECT id INTO feat_id
    FROM plan_features_library
    WHERE name_ar = feat_ar OR name_en = feat_en
    LIMIT 1;

    IF feat_id IS NULL THEN
      INSERT INTO plan_features_library (name_ar, name_en, sort_order)
      VALUES (feat_ar, feat_en, idx)
      RETURNING id INTO feat_id;
    END IF;

    -- Track assigned feature ID
    assigned_feat_ids := array_append(assigned_feat_ids, feat_id);

    -- Insert assignment
    INSERT INTO plan_feature_assignments (plan_id, feature_id)
    VALUES (NEW.id, feat_id)
    ON CONFLICT (plan_id, feature_id) DO NOTHING;
  END LOOP;

  -- Clean up assignments for features that were removed
  DELETE FROM plan_feature_assignments
  WHERE plan_id = NEW.id AND NOT (feature_id = ANY(assigned_feat_ids));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_plan_features ON subscription_plans;
CREATE TRIGGER sync_plan_features
AFTER INSERT OR UPDATE OF features_ar, features_en ON subscription_plans
FOR EACH ROW EXECUTE FUNCTION sync_plan_features_trigger();
