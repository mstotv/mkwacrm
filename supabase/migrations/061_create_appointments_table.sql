-- ============================================================
-- 061_create_appointments_table.sql
--
-- Set up appointments table to bind chat conversations to Google Calendar events.
-- ============================================================

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  patient_name TEXT NOT NULL,
  patient_phone TEXT,
  calendar_event_id TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Select policy: Members can view their own account's appointments
DROP POLICY IF EXISTS "Members can view own account appointments" ON appointments;
CREATE POLICY "Members can view own account appointments"
  ON appointments
  FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

-- Manage policy: Agents or Admins can insert/update/delete appointments
DROP POLICY IF EXISTS "Members can manage own account appointments" ON appointments;
CREATE POLICY "Members can manage own account appointments"
  ON appointments
  FOR ALL
  USING (is_account_member(account_id, 'agent'));

-- Indexes for lookup efficiency
CREATE INDEX IF NOT EXISTS idx_appointments_account_id ON appointments(account_id);
CREATE INDEX IF NOT EXISTS idx_appointments_contact_id ON appointments(contact_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON appointments(scheduled_at);
