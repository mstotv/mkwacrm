-- ============================================================
-- 031_site_settings.sql — Site Settings & Visual Identity
-- ============================================================

CREATE TABLE IF NOT EXISTS site_settings (
  id UUID PRIMARY KEY DEFAULT 'd3b07384-d113-48b6-b514-41d9c15e85c1'::uuid,
  site_name TEXT NOT NULL DEFAULT 'MK Whats',
  logo_url TEXT NOT NULL DEFAULT '',
  primary_color TEXT NOT NULL DEFAULT '#8B5CF6',
  secondary_color TEXT NOT NULL DEFAULT '#1e293b',
  accent_color TEXT NOT NULL DEFAULT '#0f172a',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Enforce a singleton pattern (only one row is allowed in the table)
  CONSTRAINT site_settings_singleton CHECK (id = 'd3b07384-d113-48b6-b514-41d9c15e85c1'::uuid)
);

-- Seed initial settings row if not present
INSERT INTO site_settings (id, site_name, logo_url, primary_color, secondary_color, accent_color)
VALUES ('d3b07384-d113-48b6-b514-41d9c15e85c1'::uuid, 'MK Whats', '', '#8B5CF6', '#1e293b', '#0f172a')
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- 1) Allow anyone (public/anonymous) to read site settings
DROP POLICY IF EXISTS site_settings_select ON site_settings;
CREATE POLICY site_settings_select ON site_settings FOR SELECT
  USING (true);

-- 2) Allow super admins to manage site settings
DROP POLICY IF EXISTS site_settings_all ON site_settings;
CREATE POLICY site_settings_all ON site_settings FOR ALL
  TO authenticated
  USING (
    is_super_admin()
  )
  WITH CHECK (
    is_super_admin()
  );
