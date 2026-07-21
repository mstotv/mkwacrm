-- ============================================================
-- 051_site_pages.sql — Site Pages CMS
-- ============================================================

CREATE TABLE IF NOT EXISTS site_pages (
  slug TEXT PRIMARY KEY,
  title_en TEXT NOT NULL DEFAULT '',
  title_ar TEXT NOT NULL DEFAULT '',
  content_en TEXT NOT NULL DEFAULT '',
  content_ar TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default pages
INSERT INTO site_pages (slug, title_en, title_ar, content_en, content_ar) VALUES
('privacy', 'Privacy Policy', 'سياسة الخصوصية', 'We value your privacy. Content goes here...', 'نحن نقدر خصوصيتك. المحتوى هنا...'),
('terms', 'Terms of Service', 'شروط الخدمة', 'By using our service, you agree to... Content goes here...', 'باستخدامك لخدمتنا، أنت توافق على... المحتوى هنا...'),
('about', 'About Us', 'من نحن', 'We are an innovative company... Content goes here...', 'نحن شركة مبتكرة... المحتوى هنا...'),
('contact', 'Contact Us', 'اتصل بنا', 'Reach us at support@example.com', 'تواصل معنا عبر البريد...'),
('docs', 'Documentation', 'التوثيق', 'Here is how to use our platform...', 'إليك كيفية استخدام منصتنا...'),
('company', 'Company', 'الشركة', 'Our company history...', 'تاريخ شركتنا...'),
('blog', 'Blog', 'المدونة', 'Read our latest news...', 'اقرأ أحدث أخبارنا...'),
('legal', 'Legal', 'قانوني', 'Legal information...', 'المعلومات القانونية...')
ON CONFLICT (slug) DO NOTHING;

-- Enable RLS
ALTER TABLE site_pages ENABLE ROW LEVEL SECURITY;

-- Public can read
DROP POLICY IF EXISTS site_pages_select ON site_pages;
CREATE POLICY site_pages_select ON site_pages FOR SELECT USING (true);

-- Super admins can update
DROP POLICY IF EXISTS site_pages_update ON site_pages;
CREATE POLICY site_pages_update ON site_pages FOR UPDATE 
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Super admins can insert/delete (optional but good to have)
DROP POLICY IF EXISTS site_pages_insert ON site_pages;
CREATE POLICY site_pages_insert ON site_pages FOR INSERT WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS site_pages_delete ON site_pages;
CREATE POLICY site_pages_delete ON site_pages FOR DELETE USING (is_super_admin());
