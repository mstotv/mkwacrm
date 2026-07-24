-- ============================================================
-- 062_create_isolated_appointments.sql
--
-- Set up database schema for the new isolated Appointments module.
-- ============================================================

-- 1. Drop existing basic appointments table if it exists to rebuild with full schema
DROP TABLE IF EXISTS appointments CASCADE;

-- 2. CREATE TABLE: appointment_google_accounts
CREATE TABLE IF NOT EXISTS appointment_google_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  timezone TEXT NOT NULL DEFAULT 'Asia/Baghdad',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_appointment_google_account UNIQUE (account_id)
);

ALTER TABLE appointment_google_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view appointment_google_accounts"
  ON appointment_google_accounts FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

CREATE POLICY "Members can manage appointment_google_accounts"
  ON appointment_google_accounts FOR ALL
  USING (is_account_member(account_id, 'agent'));


-- 3. CREATE TABLE: appointment_staff
CREATE TABLE IF NOT EXISTS appointment_staff (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  photo_url TEXT,
  email TEXT,
  google_calendar_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE appointment_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view appointment_staff"
  ON appointment_staff FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

CREATE POLICY "Members can manage appointment_staff"
  ON appointment_staff FOR ALL
  USING (is_account_member(account_id, 'agent'));


-- 4. CREATE TABLE: appointment_services
CREATE TABLE IF NOT EXISTS appointment_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  description TEXT,
  price NUMERIC(10, 2),
  color TEXT NOT NULL DEFAULT '#3b82f6',
  max_daily_capacity INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE appointment_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view appointment_services"
  ON appointment_services FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

CREATE POLICY "Members can manage appointment_services"
  ON appointment_services FOR ALL
  USING (is_account_member(account_id, 'agent'));


-- 5. CREATE TABLE: appointment_staff_services (Join Table)
CREATE TABLE IF NOT EXISTS appointment_staff_services (
  staff_id UUID NOT NULL REFERENCES appointment_staff(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES appointment_services(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, service_id)
);


-- 6. CREATE TABLE: appointments (Full Rebuild)
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  staff_id UUID REFERENCES appointment_staff(id) ON DELETE SET NULL,
  service_id UUID REFERENCES appointment_services(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL,
  patient_phone TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'rescheduled')),
  calendar_event_id TEXT,
  booking_source TEXT NOT NULL DEFAULT 'whatsapp' CHECK (booking_source IN ('whatsapp', 'dashboard')),
  created_by_ai BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view appointments"
  ON appointments FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

CREATE POLICY "Members can manage appointments"
  ON appointments FOR ALL
  USING (is_account_member(account_id, 'agent'));

CREATE INDEX IF NOT EXISTS idx_appointments_account_id ON appointments(account_id);
CREATE INDEX IF NOT EXISTS idx_appointments_staff_id ON appointments(staff_id);
CREATE INDEX IF NOT EXISTS idx_appointments_service_id ON appointments(service_id);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON appointments(scheduled_at);


-- 7. CREATE TABLE: appointment_working_hours
CREATE TABLE IF NOT EXISTS appointment_working_hours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES appointment_staff(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  opening_time TIME NOT NULL DEFAULT '09:00:00',
  closing_time TIME NOT NULL DEFAULT '17:00:00',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_working_hours UNIQUE (account_id, staff_id, day_of_week)
);

ALTER TABLE appointment_working_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view appointment_working_hours"
  ON appointment_working_hours FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

CREATE POLICY "Members can manage appointment_working_hours"
  ON appointment_working_hours FOR ALL
  USING (is_account_member(account_id, 'agent'));


-- 8. CREATE TABLE: appointment_breaks
CREATE TABLE IF NOT EXISTS appointment_breaks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES appointment_staff(id) ON DELETE CASCADE,
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
  specific_date DATE,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE appointment_breaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view appointment_breaks"
  ON appointment_breaks FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

CREATE POLICY "Members can manage appointment_breaks"
  ON appointment_breaks FOR ALL
  USING (is_account_member(account_id, 'agent'));


-- 9. CREATE TABLE: appointment_holidays
CREATE TABLE IF NOT EXISTS appointment_holidays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES appointment_staff(id) ON DELETE CASCADE,
  holiday_date DATE NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_holiday UNIQUE (account_id, staff_id, holiday_date)
);

ALTER TABLE appointment_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view appointment_holidays"
  ON appointment_holidays FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

CREATE POLICY "Members can manage appointment_holidays"
  ON appointment_holidays FOR ALL
  USING (is_account_member(account_id, 'agent'));


-- 10. CREATE TABLE: appointment_settings
CREATE TABLE IF NOT EXISTS appointment_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'Asia/Baghdad',
  max_daily_appointments INTEGER,
  max_hourly_appointments INTEGER,
  min_booking_notice_hours INTEGER NOT NULL DEFAULT 2,
  max_future_booking_days INTEGER NOT NULL DEFAULT 30,
  booking_interval_minutes INTEGER NOT NULL DEFAULT 30,
  sheets_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sheets_spreadsheet_id TEXT,
  sheets_worksheet_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_appointment_settings UNIQUE (account_id)
);

ALTER TABLE appointment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view appointment_settings"
  ON appointment_settings FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

CREATE POLICY "Members can manage appointment_settings"
  ON appointment_settings FOR ALL
  USING (is_account_member(account_id, 'agent'));


-- 11. CREATE TABLE: appointment_notifications
CREATE TABLE IF NOT EXISTS appointment_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('whatsapp', 'email')),
  recipient TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE appointment_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view appointment_notifications"
  ON appointment_notifications FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

CREATE POLICY "Members can manage appointment_notifications"
  ON appointment_notifications FOR ALL
  USING (is_account_member(account_id, 'agent'));


-- 12. CREATE TABLE: appointment_reminders
CREATE TABLE IF NOT EXISTS appointment_reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  reminder_time TIMESTAMPTZ NOT NULL,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('24h', '3h', '30m')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE appointment_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view appointment_reminders"
  ON appointment_reminders FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

CREATE POLICY "Members can manage appointment_reminders"
  ON appointment_reminders FOR ALL
  USING (is_account_member(account_id, 'agent'));


-- 13. CREATE TABLE: appointment_logs
CREATE TABLE IF NOT EXISTS appointment_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  operation TEXT NOT NULL CHECK (operation IN ('created', 'updated', 'cancelled', 'rescheduled', 'reminder_sent', 'google_sync', 'ai_action', 'api_error')),
  description TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE appointment_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view appointment_logs"
  ON appointment_logs FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

CREATE POLICY "Members can manage appointment_logs"
  ON appointment_logs FOR ALL
  USING (is_account_member(account_id, 'agent'));
