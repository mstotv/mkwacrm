-- ============================================================
-- 024_advanced_features_schema
--
-- Set up tables for AI config, auto replies, scheduled messages,
-- google sheets integration, and extend contacts/conversations.
-- ============================================================

-- 1) AI Config table
CREATE TABLE IF NOT EXISTS ai_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'openai', -- openai, deepseek
  api_key TEXT,                            -- Encrypted/Plain API key
  bot_name TEXT DEFAULT 'AI Assistant',
  system_prompt TEXT,                      -- Training data / context
  training_data_url TEXT,                  -- URL to Excel training file
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id)
);

-- 2) Auto Replies (Keyword Bot)
CREATE TABLE IF NOT EXISTS auto_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  reply_text TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'contains', -- exact, contains
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3) Scheduled Messages
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  send_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, failed
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4) Google Sheets Config
CREATE TABLE IF NOT EXISTS google_sheets_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  spreadsheet_id TEXT NOT NULL,
  sheet_name TEXT DEFAULT 'Contacts',
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id)
);

-- 5) Extend Contacts
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS customer_points INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_segment TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS sync_to_google_sheets BOOLEAN DEFAULT false;

-- Check constraint for segments
ALTER TABLE contacts
  DROP CONSTRAINT IF EXISTS contacts_customer_segment_check;
ALTER TABLE contacts
  ADD CONSTRAINT contacts_customer_segment_check
  CHECK (customer_segment IN ('vip', 'normal', 'inactive'));

-- 6) Extend Conversations for status
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';

ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_status_check;
ALTER TABLE conversations
  ADD CONSTRAINT conversations_status_check
  CHECK (status IN ('open', 'pending', 'closed'));

-- Enable RLS
ALTER TABLE ai_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_sheets_config ENABLE ROW LEVEL SECURITY;

-- Add RLS Policies (Admins+ for configs, agents+ for operations)
CREATE POLICY "Members can manage own AI config" ON ai_config
  FOR ALL USING (is_account_member(account_id, 'admin'));

CREATE POLICY "Members can manage own auto replies" ON auto_replies
  FOR ALL USING (is_account_member(account_id, 'agent'));

CREATE POLICY "Members can manage own scheduled messages" ON scheduled_messages
  FOR ALL USING (is_account_member(account_id, 'agent'));

CREATE POLICY "Members can manage own Sheets config" ON google_sheets_config
  FOR ALL USING (is_account_member(account_id, 'admin'));
