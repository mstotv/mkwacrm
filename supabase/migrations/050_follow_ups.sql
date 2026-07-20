-- ============================================================
-- 050_follow_ups.sql
--
-- Set up follow_ups table and account-level settings for follow-up behavior.
-- ============================================================

-- Add follow-up settings columns to accounts table
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS follow_up_action_type TEXT NOT NULL DEFAULT 'both' CHECK (follow_up_action_type IN ('auto_reminder', 'notify_owner', 'both')),
  ADD COLUMN IF NOT EXISTS follow_up_reminder_template TEXT NOT NULL DEFAULT 'مرحباً {name}، تواصلنا معك سابقاً بخصوص {reason}، هل ما زلت مهتماً؟',
  ADD COLUMN IF NOT EXISTS follow_up_default_time TEXT NOT NULL DEFAULT '10:00';

-- Create follow_ups table
CREATE TABLE IF NOT EXISTS follow_ups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  action_type TEXT NOT NULL DEFAULT 'both' CHECK (action_type IN ('auto_reminder', 'notify_owner', 'both')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

-- Select policy
DROP POLICY IF EXISTS "Members can view own account follow ups" ON follow_ups;
CREATE POLICY "Members can view own account follow ups"
  ON follow_ups
  FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

-- Insert/Update/Delete policy (for agents/admins)
DROP POLICY IF EXISTS "Members can manage own account follow ups" ON follow_ups;
CREATE POLICY "Members can manage own account follow ups"
  ON follow_ups
  FOR ALL
  USING (is_account_member(account_id, 'agent'));

-- Create index
CREATE INDEX IF NOT EXISTS idx_follow_ups_account_id ON follow_ups(account_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_scheduled_at ON follow_ups(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status ON follow_ups(status);
