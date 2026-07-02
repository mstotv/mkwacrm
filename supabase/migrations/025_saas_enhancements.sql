-- ============================================================
-- 025_saas_enhancements.sql
--
-- Migration script to add landing page customization, support ticket
-- system tables, platform-level assistant role, account blocking,
-- and extend plans and payment logging.
-- ============================================================

-- 1) Extend profiles platform role check constraint
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_platform_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_platform_role_check
  CHECK (platform_role IN ('super_admin', 'assistant_admin', 'user'));

-- 2) Extend payment_history table
ALTER TABLE payment_history
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES subscription_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_period TEXT CHECK (billing_period IN ('monthly', 'yearly'));

-- 3) Extend accounts table with is_blocked
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;

-- 4) Extend subscription_plans with features arrays
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS features_ar JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS features_en JSONB DEFAULT '[]';

-- Update existing plans with features lists
UPDATE subscription_plans
SET features_ar = '["رقم واتساب واحد", "1,000 رسالة/شهر", "500 جهة اتصال", "رد تلقائي بالكلمات المفتاحية", "استيراد/تصدير CSV", "دعم بالبريد الإلكتروني"]',
    features_en = '["1 WhatsApp Number", "1,000 Messages/month", "500 Contacts", "Keyword Auto-Reply", "CSV Import/Export", "Email Support"]'
WHERE name = 'free';

UPDATE subscription_plans
SET features_ar = '["رقم واتساب واحد", "10,000 رسالة/شهر", "1,000 جهة اتصال", "رد تلقائي بالكلمات المفتاحية", "استيراد/تصدير CSV", "دعم بالبريد الإلكتروني"]',
    features_en = '["1 WhatsApp Number", "10,000 Messages/month", "1,000 Contacts", "Keyword Auto-Reply", "CSV Import/Export", "Email Support"]'
WHERE name = 'starter';

UPDATE subscription_plans
SET features_ar = '["3 أرقام واتساب", "10,000 رسالة/شهر", "5,000 جهة اتصال", "رد ذكي بالذكاء الاصطناعي", "حملات البث الجماعي", "جدولة الرسائل", "مزامنة Google Sheets", "دعم ذو أولوية"]',
    features_en = '["3 WhatsApp Numbers", "10,000 Messages/month", "5,000 Contacts", "AI Auto-Reply (OpenAI/DeepSeek)", "Broadcast Campaigns", "Scheduled Messages", "Google Sheets Sync", "Priority Support"]'
WHERE name = 'pro';

-- 5) Create landing_page_settings table
CREATE TABLE IF NOT EXISTS landing_page_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  badge_ar TEXT,
  badge_en TEXT,
  title_ar TEXT,
  title_en TEXT,
  title_highlight_ar TEXT,
  title_highlight_en TEXT,
  subtitle_ar TEXT,
  subtitle_en TEXT,
  cta_ar TEXT,
  cta_en TEXT,
  theme_colors JSONB NOT NULL DEFAULT '{"primary": "#8B5CF6", "background": "#020617", "card": "#0F172A", "text": "#F8FAFC"}',
  features JSONB NOT NULL DEFAULT '[]',
  faqs JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial settings
INSERT INTO landing_page_settings (
  id, badge_ar, badge_en, title_ar, title_en, title_highlight_ar, title_highlight_en, subtitle_ar, subtitle_en, cta_ar, cta_en, theme_colors, features, faqs
)
VALUES (
  'd0000000-0000-0000-0000-000000000001',
  '🚀 منصة واتساب CRM الأولى للأعمال النامية',
  '🚀 The #1 WhatsApp CRM for Growing Businesses',
  'طوّر أعمالك عبر',
  'Supercharge Your',
  'واتساب بزنس',
  'WhatsApp Business',
  'منصة متكاملة لإدارة المحادثات، الرد التلقائي بالذكاء الاصطناعي، حملات البث الجماعي، وتنمية علاقاتك مع العملاء — كل ذلك من لوحة تحكم واحدة.',
  'All-in-one platform to manage conversations, automate replies with AI, broadcast campaigns, and grow your customer relationships — all from a single dashboard.',
  'ابدأ مجاناً',
  'Get Started Free',
  '{"primary": "#8B5CF6", "background": "#020617", "card": "#0F172A", "text": "#F8FAFC"}',
  '[]',
  '[]'
) ON CONFLICT (id) DO NOTHING;

-- 6) Create support_tickets and support_messages tables
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved')),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('user', 'admin', 'assistant')),
  message_text TEXT,
  attachments JSONB NOT NULL DEFAULT '[]', -- [{name, url, type}]
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE landing_page_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- 7) RLS Policies
-- Landing page settings
DROP POLICY IF EXISTS "Anyone can select landing page settings" ON landing_page_settings;
CREATE POLICY "Anyone can select landing page settings" ON landing_page_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Platform admins can manage landing page settings" ON landing_page_settings;
CREATE POLICY "Platform admins can manage landing page settings" ON landing_page_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND platform_role = 'super_admin'
    )
  );

-- Support Tickets
DROP POLICY IF EXISTS "Members can select support tickets" ON support_tickets;
CREATE POLICY "Members can select support tickets" ON support_tickets
  FOR SELECT USING (
    is_account_member(account_id, 'viewer') OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND platform_role IN ('super_admin', 'assistant_admin')
    )
  );

DROP POLICY IF EXISTS "Members can insert support tickets" ON support_tickets;
CREATE POLICY "Members can insert support tickets" ON support_tickets
  FOR INSERT WITH CHECK (
    is_account_member(account_id, 'agent') OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND platform_role IN ('super_admin', 'assistant_admin')
    )
  );

DROP POLICY IF EXISTS "Members can update support tickets" ON support_tickets;
CREATE POLICY "Members can update support tickets" ON support_tickets
  FOR UPDATE USING (
    is_account_member(account_id, 'agent') OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND platform_role IN ('super_admin', 'assistant_admin')
    )
  );

-- Support Messages
DROP POLICY IF EXISTS "Members can select support messages" ON support_messages;
CREATE POLICY "Members can select support messages" ON support_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.id = ticket_id AND (
        is_account_member(t.account_id, 'viewer') OR
        EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.user_id = auth.uid() AND p.platform_role IN ('super_admin', 'assistant_admin')
        )
      )
    )
  );

DROP POLICY IF EXISTS "Members can insert support messages" ON support_messages;
CREATE POLICY "Members can insert support messages" ON support_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.id = ticket_id AND (
        is_account_member(t.account_id, 'agent') OR
        EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.user_id = auth.uid() AND p.platform_role IN ('super_admin', 'assistant_admin')
        )
      )
    )
  );

-- 8) Storage configuration for support files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'support',
  'support',
  TRUE,
  10485760, -- 10 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'application/pdf']
) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Support files are readable" ON storage.objects;
CREATE POLICY "Support files are readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'support');

DROP POLICY IF EXISTS "Authenticated users can upload support files" ON storage.objects;
CREATE POLICY "Authenticated users can upload support files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'support' AND
    auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "Users can delete support files" ON storage.objects;
CREATE POLICY "Users can delete support files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'support' AND
    (auth.uid()::text = (storage.foldername(name))[1] OR
     EXISTS (
       SELECT 1 FROM profiles
       WHERE user_id = auth.uid() AND platform_role IN ('super_admin', 'assistant_admin')
     ))
  );
