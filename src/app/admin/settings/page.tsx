'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Palette, Globe, Plus, Trash2, Save, Loader2, Shield, Upload, RefreshCw, LayoutTemplate } from 'lucide-react';
import { toast } from 'sonner';

interface ThemeColors {
  primary: string;
  primary_hover: string;
  background: string;
  card: string;
  card_hover: string;
  text: string;
}

interface FeatureItem {
  title_ar: string;
  title_en: string;
  desc_ar: string;
  desc_en: string;
}

interface FaqItem {
  q_ar: string;
  q_en: string;
  a_ar: string;
  a_en: string;
}

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'site' | 'landing'>('site');

  // Site Settings (Visual Identity)
  const [siteName, setSiteName] = useState('MKWhats');
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#8B5CF6');
  const [secondaryColor, setSecondaryColor] = useState('#1e293b');
  const [accentColor, setAccentColor] = useState('#0f172a');
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Support Floating Buttons
  const [supportWhatsappNumber, setSupportWhatsappNumber] = useState('');
  const [supportWhatsappEnabled, setSupportWhatsappEnabled] = useState(false);
  const [supportTelegramUsername, setSupportTelegramUsername] = useState('');
  const [supportTelegramEnabled, setSupportTelegramEnabled] = useState(false);

  // Landing Page Header Details
  const [badgeAr, setBadgeAr] = useState('');
  const [badgeEn, setBadgeEn] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [titleHighlightAr, setTitleHighlightAr] = useState('');
  const [titleHighlightEn, setTitleHighlightEn] = useState('');
  const [subtitleAr, setSubtitleAr] = useState('');
  const [subtitleEn, setSubtitleEn] = useState('');
  const [ctaAr, setCtaAr] = useState('');
  const [ctaEn, setCtaEn] = useState('');

  // Landing Page Custom Colors
  const [colors, setColors] = useState<ThemeColors>({
    primary: '#8B5CF6',
    primary_hover: '#7C3AED',
    background: '#020617',
    card: '#0F172A',
    card_hover: '#1E293B',
    text: '#F8FAFC',
  });

  // Features list
  const [features, setFeatures] = useState<FeatureItem[]>([]);
  const [newFeatArTitle, setNewFeatArTitle] = useState('');
  const [newFeatEnTitle, setNewFeatEnTitle] = useState('');
  const [newFeatArDesc, setNewFeatArDesc] = useState('');
  const [newFeatEnDesc, setNewFeatEnDesc] = useState('');

  // FAQs list
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [newFaqArQ, setNewFaqArQ] = useState('');
  const [newFaqEnQ, setNewFaqEnQ] = useState('');
  const [newFaqArA, setNewFaqArA] = useState('');
  const [newFaqEnA, setNewFaqEnA] = useState('');

  const [requireTemplateReview, setRequireTemplateReview] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);

      // 1. Load Site settings
      const { data: siteData, error: siteError } = await supabase
        .from('site_settings')
        .select('*')
        .maybeSingle();

      if (siteError) throw siteError;

      if (siteData) {
        setSiteName(siteData.site_name || '');
        setLogoUrl(siteData.logo_url || '');
        setPrimaryColor(siteData.primary_color || '#8B5CF6');
        setSecondaryColor(siteData.secondary_color || '#1e293b');
        setAccentColor(siteData.accent_color || '#0f172a');
        
        setSupportWhatsappNumber(siteData.support_whatsapp_number || '');
        setSupportWhatsappEnabled(!!siteData.support_whatsapp_enabled);
        setSupportTelegramUsername(siteData.support_telegram_username || '');
        setSupportTelegramEnabled(!!siteData.support_telegram_enabled);
      }

      // 2. Load Landing Page settings
      const { data: landingData, error: landingError } = await supabase
        .from('landing_page_settings')
        .select('*')
        .eq('id', 'd0000000-0000-0000-0000-000000000001')
        .maybeSingle();

      if (landingError) throw landingError;

      if (landingData) {
        setBadgeAr(landingData.badge_ar || '');
        setBadgeEn(landingData.badge_en || '');
        setTitleAr(landingData.title_ar || '');
        setTitleEn(landingData.title_en || '');
        setTitleHighlightAr(landingData.title_highlight_ar || '');
        setTitleHighlightEn(landingData.title_highlight_en || '');
        setSubtitleAr(landingData.subtitle_ar || '');
        setSubtitleEn(landingData.subtitle_en || '');
        setCtaAr(landingData.cta_ar || '');
        setCtaEn(landingData.cta_en || '');
        setRequireTemplateReview(!!landingData.require_template_review);
        setColors({
          primary: landingData.theme_colors?.primary || '#8B5CF6',
          primary_hover: landingData.theme_colors?.primary_hover || '#7C3AED',
          background: landingData.theme_colors?.background || '#020617',
          card: landingData.theme_colors?.card || '#0F172A',
          card_hover: landingData.theme_colors?.card_hover || '#1E293B',
          text: landingData.theme_colors?.text || '#F8FAFC',
        });
        setFeatures(landingData.features || []);
        setFaqs(landingData.faqs || []);
      }
    } catch (err) {
      toast.error('خطأ في تحميل إعدادات المنصة');
    } finally {
      setLoading(false);
    }
  }

  // Handle logo file upload
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingLogo(true);
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `site/logo-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      setLogoUrl(publicUrl);
      toast.success('تم رفع الشعار بنجاح!');
    } catch (err: any) {
      toast.error(`فشل رفع الصورة: ${err.message}`);
    } finally {
      setUploadingLogo(false);
    }
  };

  // Save visual site settings
  const handleSaveSiteSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const { error } = await supabase
        .from('site_settings')
        .upsert({
          id: 'd3b07384-d113-48b6-b514-41d9c15e85c1',
          site_name: siteName.trim() || 'MKWhats',
          logo_url: logoUrl.trim(),
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          accent_color: accentColor,
          support_whatsapp_number: supportWhatsappNumber,
          support_whatsapp_enabled: supportWhatsappEnabled,
          support_telegram_username: supportTelegramUsername,
          support_telegram_enabled: supportTelegramEnabled,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      toast.success('تم حفظ إعدادات الهوية البصرية للموقع بنجاح!');
      
      // Force page refresh to update inline style block in layout.tsx
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      toast.error('حدث خطأ أثناء حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  // Restore site settings to system defaults
  const handleRestoreSiteDefaults = async () => {
    if (!confirm('هل أنت متأكد من رغبتك في استعادة الألوان والإعدادات الافتراضية للموقع؟')) return;
    try {
      setSaving(true);
      const { error } = await supabase
        .from('site_settings')
        .upsert({
          id: 'd3b07384-d113-48b6-b514-41d9c15e85c1',
          site_name: 'MKWhats',
          logo_url: '',
          primary_color: '#8B5CF6',
          secondary_color: '#1e293b',
          accent_color: '#0f172a',
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      setSiteName('MKWhats');
      setLogoUrl('');
      setPrimaryColor('#8B5CF6');
      setSecondaryColor('#1e293b');
      setAccentColor('#0f172a');
      toast.success('تمت استعادة الإعدادات الافتراضية بنجاح!');
      
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      toast.error('حدث خطأ أثناء استعادة الإعدادات الافتراضية');
    } finally {
      setSaving(false);
    }
  };

  const handleColorChange = (key: keyof ThemeColors, value: string) => {
    setColors(prev => ({ ...prev, [key]: value }));
  };

  const addFeature = () => {
    if (!newFeatArTitle || !newFeatEnTitle || !newFeatArDesc || !newFeatEnDesc) {
      toast.error('الرجاء ملء تفاصيل الميزة بالكامل باللغتين');
      return;
    }
    const item: FeatureItem = {
      title_ar: newFeatArTitle.trim(),
      title_en: newFeatEnTitle.trim(),
      desc_ar: newFeatArDesc.trim(),
      desc_en: newFeatEnDesc.trim(),
    };
    setFeatures(prev => [...prev, item]);
    setNewFeatArTitle('');
    setNewFeatEnTitle('');
    setNewFeatArDesc('');
    setNewFeatEnDesc('');
  };

  const removeFeature = (idx: number) => {
    setFeatures(prev => prev.filter((_, i) => i !== idx));
  };

  const addFaq = () => {
    if (!newFaqArQ || !newFaqEnQ || !newFaqArA || !newFaqEnA) {
      toast.error('الرجاء تعبئة بيانات السؤال والجواب بالكامل باللغتين');
      return;
    }
    const item: FaqItem = {
      q_ar: newFaqArQ.trim(),
      q_en: newFaqEnQ.trim(),
      a_ar: newFaqArA.trim(),
      a_en: newFaqEnA.trim(),
    };
    setFaqs(prev => [...prev, item]);
    setNewFaqArQ('');
    setNewFaqEnQ('');
    setNewFaqArA('');
    setNewFaqEnA('');
  };

  const removeFaq = (idx: number) => {
    setFaqs(prev => prev.filter((_, i) => i !== idx));
  };

  // Save landing page content
  const handleSaveLandingSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const { error } = await supabase
        .from('landing_page_settings')
        .upsert({
          id: 'd0000000-0000-0000-0000-000000000001',
          badge_ar: badgeAr,
          badge_en: badgeEn,
          title_ar: titleAr,
          title_en: titleEn,
          title_highlight_ar: titleHighlightAr,
          title_highlight_en: titleHighlightEn,
          subtitle_ar: subtitleAr,
          subtitle_en: subtitleEn,
          cta_ar: ctaAr,
          cta_en: ctaEn,
          theme_colors: colors,
          features: features,
          faqs: faqs,
          require_template_review: requireTemplateReview,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      toast.success('تم حفظ وتحديث صفحة الهبوط بنجاح!');
    } catch (err) {
      toast.error('حدث خطأ أثناء حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin text-violet-400 mx-auto" />
        <p className="mt-2 text-xs">جاري التحميل...</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-5xl text-white">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">إعدادات المنصة وتخصيص الموقع</h1>
        <p className="mt-1 text-sm text-slate-400">التحكم بهوية الموقع البصرية، الشعار، الألوان وتعديل نصوص صفحة الهبوط</p>
      </div>

      {/* Tabs Menu */}
      <div className="flex gap-2 border-b border-slate-800 pb-px">
        <button
          type="button"
          onClick={() => setActiveTab('site')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'site'
              ? 'border-violet-500 text-violet-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Palette className="h-4 w-4" /> هوية الموقع البصرية (Site Settings)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('landing')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'landing'
              ? 'border-violet-500 text-violet-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutTemplate className="h-4 w-4" /> محتوى صفحة الهبوط (Landing Page)
        </button>
      </div>

      {activeTab === 'site' ? (
        /* ==================== SITE SETTINGS FORM ==================== */
        <form onSubmit={handleSaveSiteSettings} className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-6">
            <h2 className="text-lg font-bold flex items-center gap-2 text-violet-400 border-b border-slate-800 pb-3">
              <Palette className="h-5 w-5" /> الهوية والشعار والألوان الرئيسية للمنصة
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Site Name and Logo Box */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">اسم الموقع الرسمي</label>
                  <input
                    type="text"
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                    required
                    placeholder="مثال: MKWhats"
                    className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">يظهر هذا الاسم في ترويسة الموقع، العناوين، الفوتر وفي علامة التبويب (Tab) للمتصفح.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">شعار الموقع (Logo)</label>
                  <div className="flex gap-4 items-start">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={logoUrl}
                        onChange={(e) => setLogoUrl(e.target.value)}
                        placeholder="رابط الشعار المباشر (أو ارفعه من الزر الجانبي)"
                        className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none pr-10"
                      />
                    </div>
                    
                    <label className="shrink-0 flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-4 py-2 text-sm font-medium cursor-pointer transition">
                      {uploadingLogo ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      <span>رفع صورة</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        disabled={uploadingLogo}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Logo Preview */}
              <div className="flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-xl bg-slate-950/20 p-6 text-center">
                <span className="text-xs text-slate-400 mb-3">معاينة الشعار الحالي</span>
                {logoUrl ? (
                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl max-w-[200px]">
                    <img src={logoUrl} alt="Site Logo Preview" className="max-h-20 object-contain mx-auto" />
                  </div>
                ) : (
                  <div className="text-slate-500 text-xs py-4">لم يتم تحديد شعار مخصص بعد. سيتم عرض الأيقونة الافتراضية.</div>
                )}
              </div>
            </div>

            {/* Colors Section */}
            <div className="border-t border-slate-800 pt-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-300">ألوان الموقع الأساسية (CSS Variables Theme)</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Primary Color Picker */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-slate-300">اللون الرئيسي (Primary)</label>
                    <span className="text-[10px] text-violet-400 font-mono">{primaryColor}</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-10 h-10 rounded border-0 bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-700 bg-slate-850 px-2.5 text-xs text-white focus:border-violet-500 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                {/* Secondary Color Picker */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-slate-300">اللون الثانوي (Secondary)</label>
                    <span className="text-[10px] text-violet-400 font-mono">{secondaryColor}</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="w-10 h-10 rounded border-0 bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-700 bg-slate-850 px-2.5 text-xs text-white focus:border-violet-500 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                {/* Accent Color Picker */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-slate-300">اللون الجانبي (Accent)</label>
                    <span className="text-[10px] text-violet-400 font-mono">{accentColor}</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="w-10 h-10 rounded border-0 bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-700 bg-slate-850 px-2.5 text-xs text-white focus:border-violet-500 focus:outline-none font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* New Section for Support */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-6 mt-6">
            <h2 className="text-lg font-bold flex items-center gap-2 text-violet-400 border-b border-slate-800 pb-3">
              <span className="text-xl">💬</span> أزرار التواصل والدعم الفني (Support Buttons)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4 bg-slate-950/20 p-5 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-slate-300">زر واتساب العائم (WhatsApp)</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={supportWhatsappEnabled}
                      onChange={(e) => setSupportWhatsappEnabled(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                  </label>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">رقم الواتساب للتواصل (بالصيغة الدولية بدون +)</label>
                  <input
                    type="text"
                    value={supportWhatsappNumber}
                    onChange={(e) => setSupportWhatsappNumber(e.target.value)}
                    placeholder="مثال: 966500000000"
                    disabled={!supportWhatsappEnabled}
                    className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-sm text-white focus:border-green-500 focus:outline-none disabled:opacity-50"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">سيظهر الزر في الزاوية اليمنى السفلية للمنصة.</p>
                </div>
              </div>

              <div className="space-y-4 bg-slate-950/20 p-5 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-slate-300">زر تليجرام العائم (Telegram)</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={supportTelegramEnabled}
                      onChange={(e) => setSupportTelegramEnabled(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                  </label>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">معرف تليجرام (Username بدون @)</label>
                  <input
                    type="text"
                    value={supportTelegramUsername}
                    onChange={(e) => setSupportTelegramUsername(e.target.value)}
                    placeholder="مثال: wacrm_support"
                    disabled={!supportTelegramEnabled}
                    className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">سيظهر الزر في الزاوية اليسرى السفلية للمنصة.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Submit buttons */}
          <div className="flex justify-between items-center pt-4">
            <button
              type="button"
              onClick={handleRestoreSiteDefaults}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white px-5 py-3 text-sm font-semibold transition"
            >
              <RefreshCw className="h-4 w-4" /> استعادة الإعدادات الافتراضية للموقع
            </button>

            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-violet-650 hover:bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              ) : (
                <Save className="h-4 w-4 text-white" />
              )}
              {saving ? 'جاري حفظ الإعدادات...' : 'حفظ هوية الموقع وتطبيق الألوان فوراً'}
            </button>
          </div>
        </form>
      ) : (
        /* ==================== LANDING PAGE FORM ==================== */
        <form onSubmit={handleSaveLandingSettings} className="space-y-6">
          {/* Texts section */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-6">
            <h2 className="text-lg font-bold flex items-center gap-2 text-violet-400">
              <Globe className="h-5 w-5" /> النصوص والترجمات الرئيسيّة
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Arabic Block */}
              <div className="space-y-4 rounded-xl bg-slate-950/20 p-4 border border-slate-800">
                <h3 className="text-sm font-bold text-slate-300">النسخة العربية (AR)</h3>
                
                <div>
                  <label className="block text-xs text-slate-400 mb-1">شارة البطل (Hero Badge)</label>
                  <input
                    type="text"
                    value={badgeAr}
                    onChange={(e) => setBadgeAr(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">عنوان البطل (Hero Title)</label>
                  <input
                    type="text"
                    value={titleAr}
                    onChange={(e) => setTitleAr(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">العنوان البارز الملون (Highlight)</label>
                  <input
                    type="text"
                    value={titleHighlightAr}
                    onChange={(e) => setTitleHighlightAr(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">الوصف الفرعي (Subtitle)</label>
                  <textarea
                    rows={3}
                    value={subtitleAr}
                    onChange={(e) => setSubtitleAr(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">زر البدء (CTA Button)</label>
                  <input
                    type="text"
                    value={ctaAr}
                    onChange={(e) => setCtaAr(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* English Block */}
              <div className="space-y-4 rounded-xl bg-slate-950/20 p-4 border border-slate-800">
                <h3 className="text-sm font-bold text-slate-300 font-mono">English Version (EN)</h3>

                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-mono">Hero Badge</label>
                  <input
                    type="text"
                    value={badgeEn}
                    onChange={(e) => setBadgeEn(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-mono">Hero Title</label>
                  <input
                    type="text"
                    value={titleEn}
                    onChange={(e) => setTitleEn(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-mono">Highlight Title</label>
                  <input
                    type="text"
                    value={titleHighlightEn}
                    onChange={(e) => setTitleHighlightEn(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-mono">Subtitle</label>
                  <textarea
                    rows={3}
                    value={subtitleEn}
                    onChange={(e) => setSubtitleEn(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none resize-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-mono">CTA Button</label>
                  <input
                    type="text"
                    value={ctaEn}
                    onChange={(e) => setCtaEn(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Features Block */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-6">
            <h2 className="text-lg font-bold flex items-center gap-2 text-violet-400">
              <Plus className="h-5 w-5" /> إدارة المزايا (Features) في اللاندينج بيج
            </h2>

            <div className="rounded-xl border border-slate-800 p-4 bg-slate-950/20 space-y-4">
              <span className="block text-xs font-bold text-slate-300">إضافة ميزة جديدة</span>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <span className="block text-[11px] font-bold text-slate-400">العربية (AR)</span>
                  <input
                    type="text"
                    placeholder="عنوان الميزة بالعربية"
                    value={newFeatArTitle}
                    onChange={(e) => setNewFeatArTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none"
                  />
                  <textarea
                    rows={2}
                    placeholder="وصف الميزة بالعربية"
                    value={newFeatArDesc}
                    onChange={(e) => setNewFeatArDesc(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none resize-none"
                  />
                </div>
                <div className="space-y-3">
                  <span className="block text-[11px] font-bold text-slate-400 font-mono">English (EN)</span>
                  <input
                    type="text"
                    placeholder="Feature title in English"
                    value={newFeatEnTitle}
                    onChange={(e) => setNewFeatEnTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none font-mono"
                  />
                  <textarea
                    rows={2}
                    placeholder="Feature description in English"
                    value={newFeatEnDesc}
                    onChange={(e) => setNewFeatEnDesc(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none resize-none font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={addFeature}
                  className="rounded-lg bg-violet-650 hover:bg-violet-600 px-4 py-2 text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Plus className="h-4 w-4" /> إضافة ميزة
                </button>
              </div>
            </div>

            {/* List features added */}
            <div className="space-y-2">
              {features.map((feat, idx) => (
                <div key={idx} className="flex gap-4 items-center justify-between bg-slate-950/40 rounded-xl p-4 border border-slate-850 group">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-xs font-bold text-violet-400">{feat.title_ar}</h4>
                      <p className="text-xs text-slate-400 mt-1">{feat.desc_ar}</p>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-pink-400 font-mono">{feat.title_en}</h4>
                      <p className="text-xs text-slate-400 mt-1 font-mono">{feat.desc_en}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFeature(idx)}
                    className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {features.length === 0 && (
                <div className="text-center py-6 text-slate-650 text-xs">لا توجد مزايا مخصصة بعد.</div>
              )}
            </div>
          </div>

          {/* FAQ Block */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-6">
            <h2 className="text-lg font-bold flex items-center gap-2 text-violet-400">
              <Plus className="h-5 w-5" /> الأسئلة الشائعة (FAQs) في اللاندينج بيج
            </h2>

            <div className="rounded-xl border border-slate-800 p-4 bg-slate-950/20 space-y-4">
              <span className="block text-xs font-bold text-slate-300">إضافة سؤال جديد</span>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <span className="block text-[11px] font-bold text-slate-400">العربية (AR)</span>
                  <input
                    type="text"
                    placeholder="السؤال بالعربية"
                    value={newFaqArQ}
                    onChange={(e) => setNewFaqArQ(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none"
                  />
                  <textarea
                    rows={2}
                    placeholder="الجواب بالعربية"
                    value={newFaqArA}
                    onChange={(e) => setNewFaqArA(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none resize-none"
                  />
                </div>
                <div className="space-y-3">
                  <span className="block text-[11px] font-bold text-slate-400 font-mono">English (EN)</span>
                  <input
                    type="text"
                    placeholder="Question in English"
                    value={newFaqEnQ}
                    onChange={(e) => setNewFaqEnQ(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none font-mono"
                  />
                  <textarea
                    rows={2}
                    placeholder="Answer in English"
                    value={newFaqEnA}
                    onChange={(e) => setNewFaqEnA(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none resize-none font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={addFaq}
                  className="rounded-lg bg-violet-650 hover:bg-violet-600 px-4 py-2 text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Plus className="h-4 w-4" /> إضافة للأسئلة
                </button>
              </div>
            </div>

            {/* List FAQs added */}
            <div className="space-y-2">
              {faqs.map((faq, idx) => (
                <div key={idx} className="flex gap-4 items-center justify-between bg-slate-950/40 rounded-xl p-4 border border-slate-850 group">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-xs font-bold text-violet-400">س: {faq.q_ar}</h4>
                      <p className="text-xs text-slate-400 mt-1">ج: {faq.a_ar}</p>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-pink-400 font-mono">Q: {faq.q_en}</h4>
                      <p className="text-xs text-slate-400 mt-1 font-mono">A: {faq.a_en}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFaq(idx)}
                    className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {faqs.length === 0 && (
                <div className="text-center py-6 text-slate-650 text-xs">لا توجد أسئلة شائعة مخصصة بعد.</div>
              )}
            </div>
          </div>

          {/* Template Review Section */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-6">
            <h2 className="text-lg font-bold flex items-center gap-2 text-violet-400">
              <Shield className="h-5 w-5" /> إعدادات مراجعة القوالب (Evolution API)
            </h2>
            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-950/20 border border-slate-800">
              <div className="space-y-1">
                <label htmlFor="require-review-toggle" className="block text-sm font-semibold text-slate-200">
                  طلب الموافقة الإدارية على قوالب الرسائل
                </label>
                <span className="block text-xs text-slate-400">
                  عند تفعيل هذا الخيار، لن يتمكن المستخدمون من إرسال القوالب المربوطة بـ Evolution API حتى يتم مراجعتها والموافقة عليها يدوياً من لوحة التحكم الخاصة بك.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  id="require-review-toggle"
                  type="checkbox"
                  checked={requireTemplateReview}
                  onChange={(e) => setRequireTemplateReview(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600"></div>
              </label>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-violet-650 hover:bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              ) : (
                <Save className="h-4 w-4 text-white" />
              )}
              {saving ? 'جاري حفظ التخصيصات...' : 'حفظ ونشر التعديلات على صفحة الهبوط فورًا'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
