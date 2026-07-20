-- ============================================================
-- 049_telegram_notifications.sql
--
-- Per-account Telegram bot configuration for receiving
-- real-time notifications (appointment bookings, new orders).
-- Each account can link their own bot (Bot Token + Chat ID).
-- Bot tokens are stored encrypted (AES-256-GCM via app layer).
-- ============================================================

CREATE TABLE IF NOT EXISTS account_telegram_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  bot_token_encrypted TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id)
);

ALTER TABLE account_telegram_config ENABLE ROW LEVEL SECURITY;

-- Members can read their own account's config (UI needs to know
-- if telegram is enabled). Writes go through service_role API routes.
DROP POLICY IF EXISTS "Members can view own account telegram config" ON account_telegram_config;
CREATE POLICY "Members can view own account telegram config"
  ON account_telegram_config
  FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

-- Auto-update updated_at on row change.
DROP TRIGGER IF EXISTS set_updated_at ON account_telegram_config;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON account_telegram_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_account_telegram_config_account_id
  ON account_telegram_config(account_id);
