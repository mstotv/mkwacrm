-- ============================================================
-- 045_support_social_links.sql — Floating Support Buttons
-- ============================================================

-- Add new columns for social support buttons to site_settings
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS support_whatsapp_number TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS support_whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS support_telegram_username TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS support_telegram_enabled BOOLEAN NOT NULL DEFAULT false;
