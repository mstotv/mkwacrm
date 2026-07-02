'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Palette, Globe, Plus, Trash2, Save, Loader2 } from 'lucide-react';
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

  // Custom Colors
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

  const supabase = createClient();

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('landing_page_settings')
        .select('*')
        .eq('id', 'd0000000-0000-0000-0000-000000000001')
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setBadgeAr(data.badge_ar || '');
        setBadgeEn(data.badge_en || '');
        setTitleAr(data.title_ar || '');
        setTitleEn(data.title_en || '');
        setTitleHighlightAr(data.title_highlight_ar || '');
        setTitleHighlightEn(data.title_highlight_en || '');
        setSubtitleAr(data.subtitle_ar || '');
        setSubtitleEn(data.subtitle_en || '');
        setCtaAr(data.cta_ar || '');
        setCtaEn(data.cta_en || '');
        setColors({
          primary: data.theme_colors?.primary || '#8B5CF6',
          primary_hover: data.theme_colors?.primary_hover || '#7C3AED',
          background: data.theme_colors?.background || '#020617',
          card: data.theme_colors?.card || '#0F172A',
          card_hover: data.theme_colors?.card_hover || '#1E293B',
          text: data.theme_colors?.text || '#F8FAFC',
        });
        setFeatures(data.features || []);
        setFaqs(data.faqs || []);
      }
    } catch (err) {
      toast.error('خطأ في تحميل إعدادات صفحة الهبوط');
    } finally {
      setLoading(false);
    }
  }

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

  const handleSave = async (e: React.FormEvent) => {
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
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      toast.success('تم حفظ إعدادات وتخصيصات صفحة الهبوط بنجاح!');
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">إعدادات وتصميم صفحة الهبوط</h1>
          <p className="mt-1 text-sm text-slate-400">تخصيص الألوان، النصوص والمزايا التي تظهر لزوار موقعك</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
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
              <h3 className="text-sm font-bold text-slate-300">English Version (EN)</h3>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Hero Badge</label>
                <input
                  type="text"
                  value={badgeEn}
                  onChange={(e) => setBadgeEn(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Hero Title</label>
                <input
                  type="text"
                  value={titleEn}
                  onChange={(e) => setTitleEn(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Highlight Color Text</label>
                <input
                  type="text"
                  value={titleHighlightEn}
                  onChange={(e) => setTitleHighlightEn(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Subtitle</label>
                <textarea
                  rows={3}
                  value={subtitleEn}
                  onChange={(e) => setSubtitleEn(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs focus:border-violet-500 focus:outline-none resize-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Start Button (CTA)</label>
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

        {/* Colors Customization */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-6">
          <h2 className="text-lg font-bold flex items-center gap-2 text-violet-400">
            <Palette className="h-5 w-5" /> ألوان الهوية البصرية (Theme Palette)
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">اللون الأساسي (Primary)</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={colors.primary}
                  onChange={(e) => handleColorChange('primary', e.target.value)}
                  className="w-10 h-10 border-0 bg-transparent cursor-pointer rounded overflow-hidden"
                />
                <input
                  type="text"
                  value={colors.primary}
                  onChange={(e) => handleColorChange('primary', e.target.value)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-mono text-center focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">اللون الثانوي (Secondary / Accent)</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={colors.primary_hover} // fallback / secondary
                  onChange={(e) => handleColorChange('primary_hover', e.target.value)}
                  className="w-10 h-10 border-0 bg-transparent cursor-pointer rounded overflow-hidden"
                />
                <input
                  type="text"
                  value={colors.primary_hover}
                  onChange={(e) => handleColorChange('primary_hover', e.target.value)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-mono text-center focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">لون الخلفية (Background)</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={colors.background}
                  onChange={(e) => handleColorChange('background', e.target.value)}
                  className="w-10 h-10 border-0 bg-transparent cursor-pointer rounded overflow-hidden"
                />
                <input
                  type="text"
                  value={colors.background}
                  onChange={(e) => handleColorChange('background', e.target.value)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-mono text-center focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">لون بطاقة المزايا (Card Background)</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={colors.card}
                  onChange={(e) => handleColorChange('card', e.target.value)}
                  className="w-10 h-10 border-0 bg-transparent cursor-pointer rounded overflow-hidden"
                />
                <input
                  type="text"
                  value={colors.card}
                  onChange={(e) => handleColorChange('card', e.target.value)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-mono text-center focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">لون الكروت عند التحويم (Card Hover)</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={colors.card_hover}
                  onChange={(e) => handleColorChange('card_hover', e.target.value)}
                  className="w-10 h-10 border-0 bg-transparent cursor-pointer rounded overflow-hidden"
                />
                <input
                  type="text"
                  value={colors.card_hover}
                  onChange={(e) => handleColorChange('card_hover', e.target.value)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-mono text-center focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">لون النصوص (Text Color)</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={colors.text}
                  onChange={(e) => handleColorChange('text', e.target.value)}
                  className="w-10 h-10 border-0 bg-transparent cursor-pointer rounded overflow-hidden"
                />
                <input
                  type="text"
                  value={colors.text}
                  onChange={(e) => handleColorChange('text', e.target.value)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-mono text-center focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic features block */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-6">
          <h2 className="text-lg font-bold text-violet-400">قائمة المميزات المعروضة بالصفحة الرئيسية</h2>

          {/* Add feature form */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-350">إضافة ميزة جديدة</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="العنوان بالعربية..."
                value={newFeatArTitle}
                onChange={(e) => setNewFeatArTitle(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
              />
              <input
                type="text"
                placeholder="Title in English..."
                value={newFeatEnTitle}
                onChange={(e) => setNewFeatEnTitle(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500 font-mono"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="الوصف بالعربية..."
                value={newFeatArDesc}
                onChange={(e) => setNewFeatArDesc(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
              />
              <input
                type="text"
                placeholder="Description in English..."
                value={newFeatEnDesc}
                onChange={(e) => setNewFeatEnDesc(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500 font-mono"
              />
            </div>
            <button
              type="button"
              onClick={addFeature}
              className="flex items-center gap-1.5 rounded-lg bg-violet-650 hover:bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white transition self-end"
            >
              <Plus className="h-4 w-4" /> إضافة للجدول
            </button>
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
              <div className="text-center py-6 text-slate-650 text-xs">
                لا توجد مميزات مخصصة بعد. سيتم عرض المميزات الافتراضية لصفحة الهبوط.
              </div>
            )}
          </div>
        </div>

        {/* Dynamic FAQ block */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-6">
          <h2 className="text-lg font-bold text-violet-400">الأسئلة الشائعة المعروضة بالصفحة (FAQs)</h2>

          {/* Add FAQ form */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-350">إضافة سؤال وجواب جديد</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="السؤال بالعربية..."
                value={newFaqArQ}
                onChange={(e) => setNewFaqArQ(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
              />
              <input
                type="text"
                placeholder="Question in English..."
                value={newFaqEnQ}
                onChange={(e) => setNewFaqEnQ(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500 font-mono"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="الجواب بالعربية..."
                value={newFaqArA}
                onChange={(e) => setNewFaqArA(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
              />
              <input
                type="text"
                placeholder="Answer in English..."
                value={newFaqEnA}
                onChange={(e) => setNewFaqEnA(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500 font-mono"
              />
            </div>
            <button
              type="button"
              onClick={addFaq}
              className="flex items-center gap-1.5 rounded-lg bg-violet-650 hover:bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white transition self-end"
            >
              <Plus className="h-4 w-4" /> إضافة للأسئلة
            </button>
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
    </div>
  );
}
