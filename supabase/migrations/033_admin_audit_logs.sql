-- ============================================================
-- 033_admin_audit_logs.sql — Admin Impersonation & Audit Logs
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id UUID NOT NULL,
  admin_email TEXT NOT NULL,
  target_user_id UUID,
  target_email TEXT,
  action TEXT NOT NULL, -- 'impersonate_start', 'impersonate_stop', 'reset_password', 'manual_plan_update', 'block_account', 'unblock_account', 'delete_account'
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- 1) Allow super admins to read audit logs
DROP POLICY IF EXISTS admin_audit_logs_select ON admin_audit_logs;
CREATE POLICY admin_audit_logs_select ON admin_audit_logs FOR SELECT
  TO authenticated
  USING (
    is_super_admin()
  );

-- 2) Allow super admins to insert audit logs
DROP POLICY IF EXISTS admin_audit_logs_insert ON admin_audit_logs;
CREATE POLICY admin_audit_logs_insert ON admin_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    is_super_admin()
  );
