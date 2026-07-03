-- ============================================================
-- 032_telegram_auth.sql — Telegram login widget support
-- ============================================================

-- 1) Add telegram_id and telegram_username to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS telegram_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS telegram_username TEXT;

-- Index for fast lookup by telegram_id
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_id ON profiles(telegram_id);
