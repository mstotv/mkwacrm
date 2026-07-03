-- ============================================================
-- 030_super_admin_rls.sql — Super Admin access to all tenants
-- ============================================================

-- Create is_super_admin helper function to bypass RLS recursion
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid() AND platform_role = 'super_admin'
  );
$$;

ALTER FUNCTION is_super_admin() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated, service_role;

-- 1) Allow super admins to view all accounts
DROP POLICY IF EXISTS accounts_select ON accounts;
CREATE POLICY accounts_select ON accounts FOR SELECT
  USING (
    is_account_member(id) OR is_super_admin()
  );

-- 2) Allow super admins to view all profiles
DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (
    auth.uid() = user_id OR 
    is_account_member(account_id) OR 
    is_super_admin()
  );

-- 3) Allow super admins to manage all subscriptions
DROP POLICY IF EXISTS "Admins can manage all subscriptions" ON account_subscriptions;
CREATE POLICY "Admins can manage all subscriptions" ON account_subscriptions FOR ALL
  TO authenticated
  USING (
    is_super_admin()
  );

-- 4) Allow super admins to view all payment history
DROP POLICY IF EXISTS "Admins can view all payment history" ON payment_history;
CREATE POLICY "Admins can view all payment history" ON payment_history FOR SELECT
  TO authenticated
  USING (
    is_super_admin()
  );
