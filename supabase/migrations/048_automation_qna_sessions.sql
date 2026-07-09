-- ============================================================
-- 048_automation_qna_sessions.sql — User Input Flow / Q&A Sessions
-- ============================================================

CREATE TABLE IF NOT EXISTS automation_qna_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  log_id UUID REFERENCES automation_logs(id) ON DELETE SET NULL,
  parent_step_id UUID REFERENCES automation_steps(id) ON DELETE SET NULL,
  branch TEXT,
  next_step_position INTEGER NOT NULL,
  current_question_index INTEGER NOT NULL DEFAULT 0,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  vars JSONB NOT NULL DEFAULT '{}'::jsonb,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_qna_sessions_contact_status
  ON automation_qna_sessions(contact_id, status);

ALTER TABLE automation_qna_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Account members can manage Q&A sessions" ON automation_qna_sessions;
CREATE POLICY "Account members can manage Q&A sessions" ON automation_qna_sessions FOR ALL
  USING (is_account_member(account_id));

DROP TRIGGER IF EXISTS set_updated_at ON automation_qna_sessions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON automation_qna_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
