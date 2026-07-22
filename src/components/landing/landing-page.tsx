'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useSiteSettings } from '@/hooks/use-site-settings'
import { useTheme } from '@/hooks/use-theme'
import { useLanguage } from '@/hooks/use-language'
import {
  MessageSquare,
  Bot,
  Users,
  BarChart3,
  Globe,
  Shield,
  Zap,
  ArrowRight,
  Check,
  Star,
  Sparkles,
  Menu,
  X,
  Sun,
  Moon,
} from 'lucide-react'

/* ================================================================
 * i18n — self-contained translations for the landing page so it
 * works even when the visitor is not authenticated (no context).
 * ================================================================ */
const translations = {
  en: {
    nav: {
      features: 'Features',
      pricing: 'Pricing',
      login: 'Log In',
      signup: 'Start Free',
    },
    hero: {
      badge: '🚀 The #1 WhatsApp CRM for Growing Businesses',
      title: 'Supercharge Your',
      titleHighlight: 'WhatsApp Business',
      subtitle:
        'All-in-one platform to manage conversations, automate replies with AI, broadcast campaigns, and grow your customer relationships — all from a single dashboard.',
      cta: 'Get Started Free',
      ctaSecondary: 'See Pricing',
      stats: [
        { value: '10K+', label: 'Messages/day' },
        { value: '99.9%', label: 'Uptime' },
        { value: '50+', label: 'Countries' },
      ],
    },
    features: {
      badge: 'Why Choose Us',
      title: 'Everything You Need to Scale',
      subtitle: 'Built for teams who want to turn WhatsApp into a revenue channel.',
      items: [
        {
          title: 'AI Auto-Reply',
          desc: 'Connect OpenAI or DeepSeek to automatically respond to customers with intelligent, context-aware replies 24/7.',
        },
        {
          title: 'Smart Conversations',
          desc: 'Keyword-based bots, scheduled messages, and personalized templates — your conversations on autopilot.',
        },
        {
          title: 'Advanced CRM',
          desc: 'Import/export contacts, VIP scoring, custom fields, and full interaction history for every customer.',
        },
        {
          title: 'Broadcast Campaigns',
          desc: 'Send bulk messages with approved templates, track delivery, reads, and replies in real-time.',
        },
        {
          title: 'Multi-Language',
          desc: 'Full Arabic & English support with RTL layout. Serve customers in their language effortlessly.',
        },
        {
          title: 'Secure & Reliable',
          desc: 'End-to-end encryption, role-based access, and enterprise-grade infrastructure for your data.',
        },
      ],
    },
    pricing: {
      badge: 'Simple Pricing',
      title: 'Choose Your Plan',
      subtitle: 'Start free. Upgrade when you grow. No hidden fees.',
      monthly: 'Monthly',
      yearly: 'Yearly',
      popular: 'Most Popular',
      cta: 'Get Started',
      ctaEnterprise: 'Contact Us',
      plans: [
        {
          name: 'Starter',
          price: '$19',
          priceYearly: '$15',
          period: '/mo',
          desc: 'Perfect for small businesses getting started.',
          popular: false,
          features: [
            '1 WhatsApp Number',
            '1,000 Messages/month',
            '500 Contacts',
            'Keyword Auto-Reply',
            'CSV Import/Export',
            'Email Support',
          ],
        },
        {
          name: 'Professional',
          price: '$49',
          priceYearly: '$39',
          period: '/mo',
          desc: 'For growing teams that need automation.',
          features: [
            '3 WhatsApp Numbers',
            '10,000 Messages/month',
            '5,000 Contacts',
            'AI Auto-Reply (OpenAI/DeepSeek)',
            'Broadcast Campaigns',
            'Scheduled Messages',
            'Google Sheets Sync',
            'Priority Support',
          ],
          popular: true,
        },
        {
          name: 'Enterprise',
          price: '$149',
          priceYearly: '$119',
          period: '/mo',
          desc: 'Unlimited power for large organizations.',
          popular: false,
          features: [
            'Unlimited Numbers',
            'Unlimited Messages',
            'Unlimited Contacts',
            'Advanced AI Training',
            'Custom Integrations',
            'Dedicated Account Manager',
            'SLA Guarantee',
            'White-Label Option',
          ],
        },
      ],
    },
    footer: {
      desc: 'The intelligent WhatsApp CRM platform for modern businesses.',
      product: 'Product',
      company: 'Company',
      legal: 'Legal',
      links: {
        features: 'Features',
        pricing: 'Pricing',
        docs: 'Documentation',
        about: 'About Us',
        contact: 'Contact',
        blog: 'Blog',
        privacy: 'Privacy Policy',
        terms: 'Terms of Service',
      },
      copyright: '© 2026 MKWhats. All rights reserved.',
    },

  },
  ar: {
    nav: {
      features: 'المميزات',
      pricing: 'الأسعار',
      login: 'تسجيل الدخول',
      signup: 'ابدأ مجاناً',
    },
    hero: {
      badge: '🚀 منصة واتساب CRM الأولى للأعمال النامية',
      title: 'طوّر أعمالك عبر',
      titleHighlight: 'واتساب بزنس',
      subtitle:
        'منصة متكاملة لإدارة المحادثات، الرد التلقائي بالذكاء الاصطناعي، حملات البث الجماعي، وتنمية علاقاتك مع العملاء — كل ذلك من لوحة تحكم واحدة.',
      cta: 'ابدأ مجاناً',
      ctaSecondary: 'عرض الأسعار',
      stats: [
        { value: '+10K', label: 'رسالة/يومياً' },
        { value: '99.9%', label: 'وقت التشغيل' },
        { value: '+50', label: 'دولة' },
      ],
    },
    features: {
      badge: 'لماذا نحن',
      title: 'كل ما تحتاجه للنمو',
      subtitle: 'مصمم للفرق التي تريد تحويل واتساب إلى قناة إيرادات.',
      items: [
        {
          title: 'الرد التلقائي بالذكاء الاصطناعي (AI)',
          desc: 'اربط OpenAI أو DeepSeek للرد التلقائي على العملاء بردود ذكية ومتوافقة مع السياق على مدار الساعة.',
        },
        {
          title: 'محادثات ذكية',
          desc: 'بوتات الكلمات المفتاحية، جدولة الرسائل، وقوانين مخصصة — محادثاتك تعمل تلقائياً.',
        },
        {
          title: 'إدارة علاقات عملاء (CRM) متقدمة',
          desc: 'استيراد وتصدير جهات الاتصال، تقييم العملاء المميزين (VIP)، حقول مخصصة، وسجل تفاعل كامل لكل عميل.',
        },
        {
          title: 'حملات البث الجماعي',
          desc: 'أرسل رسائل جماعية باستخدام قوالب معتمدة، وتابع نسب التسليم والقراءة والردود في الوقت الفعلي.',
        },
        {
          title: 'دعم متعدد اللغات',
          desc: 'دعم كامل للغتين العربية والإنجليزية مع تخطيط متوافق مع اتجاه الكتابة (RTL). اخدم عملائك بلغتهم المفضلة دون عناء.',
        },
        {
          title: 'آمن وموثوق',
          desc: 'تشفير كامل للبيانات، صلاحيات وصول مستندة إلى الأدوار، وبنية تحتية قوية لحماية بياناتك.',
        },
      ],
    },
    pricing: {
      badge: 'أسعار بسيطة',
      title: 'اختر خطتك',
      subtitle: 'ابدأ مجاناً. ارتقِ عندما تنمو. بدون رسوم مخفية.',
      monthly: 'شهري',
      yearly: 'سنوي',
      popular: 'الأكثر شعبية',
      cta: 'ابدأ الآن',
      ctaEnterprise: 'تواصل معنا',
      plans: [
        {
          name: 'الخطة الأساسية',
          price: '$19',
          priceYearly: '$15',
          period: '/شهر',
          desc: 'مثالية للمشاريع الصغيرة التي تبدأ للتو.',
          popular: false,
          features: [
            'رقم واتساب واحد',
            '1,000 رسالة شهرياً',
            '500 جهة اتصال',
            'رد تلقائي بالكلمات المفتاحية',
            'استيراد وتصدير ملفات CSV',
            'دعم فني عبر البريد الإلكتروني',
          ],
        },
        {
          name: 'الخطة الاحترافية',
          price: '$49',
          priceYearly: '$39',
          period: '/شهر',
          desc: 'للفرق المتنامية التي تحتاج إلى أتمتة متكاملة.',
          features: [
            '3 أرقام واتساب',
            '10,000 رسالة شهرياً',
            '5,000 جهة اتصال',
            'رد تلقائي ذكي بالذكاء الاصطناعي (OpenAI/DeepSeek)',
            'حملات البث الجماعي المتقدمة',
            'جدولة وإرسال الرسائل المؤتمتة',
            'مزامنة مع Google Sheets',
            'دعم فني ذو أولوية',
          ],
          popular: true,
        },
        {
          name: 'خطة المؤسسات',
          price: '$149',
          priceYearly: '$119',
          period: '/شهر',
          desc: 'قوة وأتمتة غير محدودة للمؤسسات والشركات الكبيرة.',
          popular: false,
          features: [
            'أرقام واتساب غير محدودة',
            'رسائل غير محدودة',
            'جهات اتصال غير محدودة',
            'تدريب وتخصيص متقدم للذكاء الاصطناعي',
            'ربط وتكامل مخصص مع الأنظمة الأخرى',
            'مدير حساب فني مخصص',
            'اتفاقية مستوى الخدمة وضمان التشغيل (SLA)',
            'خيار العلامة البيضاء (White-Label)',
          ],
        },
      ],
    },
    footer: {
      desc: 'منصة واتساب CRM الذكية للأعمال الحديثة.',
      product: 'المنتج',
      company: 'الشركة',
      legal: 'قانوني',
      links: {
        features: 'المميزات',
        pricing: 'الأسعار',
        docs: 'التوثيق',
        about: 'من نحن',
        contact: 'اتصل بنا',
        blog: 'المدونة',
        privacy: 'سياسة الخصوصية',
        terms: 'شروط الخدمة',
      },
      copyright: '© 2026 MKWhats. جميع الحقوق محفوظة.',
    },

  },
} as const

type Lang = 'en' | 'ar'

const featureIcons = [Bot, MessageSquare, Users, Zap, Globe, Shield]

const marqueeBrands = [
  'Meta',
  'Evolution API',
  'WhatsApp',
  'Supabase',
  'ChatGPT',
  'DeepSeek',
  'Google',
  'Google Sheets',
  'Google Calendar',
  'Plisio',
  'Bitcoin',
  'USDT'
]

/* ================================================================ */
export default function LandingPage() {
  const { settings } = useSiteSettings()
  const { language, setLanguage } = useLanguage()
  const { colorMode, toggleColorMode } = useTheme()
  const [isYearly, setIsYearly] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  const [dbSettings, setDbSettings] = useState<any>(null)
  const [dbPlans, setDbPlans] = useState<any[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  const lang = language
  const isRtl = lang === 'ar'

  const toggleLang = useCallback(() => {
    const next = language === 'en' ? 'ar' : 'en'
    setLanguage(next)
  }, [language, setLanguage])

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  useEffect(() => {
    const supabase = createClient()
    async function loadLandingData() {
      try {
        // Load landing page settings from DB
        const { data: settings } = await supabase
          .from('landing_page_settings')
          .select('*')
          .eq('id', 'd0000000-0000-0000-0000-000000000001')
          .maybeSingle()
        if (settings) setDbSettings(settings)

        // Load plans from public API (includes library features, no cache)
        const plansRes = await fetch('/api/public/plans', { cache: 'no-store' })
        if (plansRes.ok) {
          const { plans } = await plansRes.json()
          if (plans) setDbPlans(plans)
        }
      } catch (err) {
        console.error('Error loading landing page data:', err)
      } finally {
        setIsLoaded(true)
      }
    }
    loadLandingData()
  }, [])

  const baseT = translations[lang]

  const t = useMemo(() => {
    if (!dbSettings) return baseT

    const badge = lang === 'ar' ? dbSettings.badge_ar : dbSettings.badge_en
    const title = lang === 'ar' ? dbSettings.title_ar : dbSettings.title_en
    const titleHighlight = lang === 'ar' ? dbSettings.title_highlight_ar : dbSettings.title_highlight_en
    const subtitle = lang === 'ar' ? dbSettings.subtitle_ar : dbSettings.subtitle_en
    const cta = lang === 'ar' ? dbSettings.cta_ar : dbSettings.cta_en

    const customFeatures = dbSettings.features || []
    let featuresItems: any = baseT.features.items
    if (customFeatures.length > 0) {
      featuresItems = customFeatures.map((f: any) => ({
        title: lang === 'ar' ? f.title_ar : f.title_en,
        desc: lang === 'ar' ? f.desc_ar : f.desc_en,
      }))
    }

    let plansItems: any = baseT.pricing.plans
    if (dbPlans && dbPlans.length > 0) {
      plansItems = dbPlans.map((p: any) => {
        // Map the new features object array
        let pFeatures: { text: string; yearlyOnly: boolean }[] = []
        if (p.features && Array.isArray(p.features)) {
          pFeatures = p.features.map((f: any) => {
            const featureName = lang === 'ar' ? f.name_ar : f.name_en;
            let text = featureName;
            if (f.usage_limit > 0) text = `${featureName} (${f.usage_limit})`;
            if (f.usage_limit === -1) text = `${featureName} (${lang === 'ar' ? 'غير محدود' : 'Unlimited'})`;
            return { text, yearlyOnly: !!f.yearly_only };
          });
        } else {
          // Fallback to legacy
          const legacyArr = lang === 'ar' ? (p.features_ar || []) : (p.features_en || []);
          pFeatures = legacyArr.map((text: string) => ({ text, yearlyOnly: false }));
        }

        return {
          name: lang === 'ar' ? (p.display_name_ar || p.display_name) : (p.display_name || p.name.charAt(0).toUpperCase() + p.name.slice(1)),
          price: `$${p.price_monthly}`,
          priceYearly: `$${p.price_yearly}`,
          originalPrice: p.original_price_monthly ? `$${p.original_price_monthly}` : null,
          originalPriceYearly: p.original_price_yearly ? `$${p.original_price_yearly}` : null,
          period: lang === 'ar' ? '/شهر' : '/mo',
          desc: p.description || (lang === 'ar' ? `خطة اشتراك ${p.display_name}` : `${p.display_name} subscription plan.`),
          badgeType: p.badge_type || (p.highlighted ? 'popular' : null),
          trialDays: p.trial_period_days || 0,
          features: pFeatures,
        }
      })
    }

    return {
      ...baseT,
      hero: {
        ...baseT.hero,
        badge: badge || baseT.hero.badge,
        title: title || baseT.hero.title,
        titleHighlight: titleHighlight || baseT.hero.titleHighlight,
        subtitle: subtitle || baseT.hero.subtitle,
        cta: cta || baseT.hero.cta,
      },
      features: {
        ...baseT.features,
        items: featuresItems,
      },
      pricing: {
        ...baseT.pricing,
        plans: plansItems,
      }
    }
  }, [lang, dbSettings, dbPlans, baseT])

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="landing-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&display=swap');

        /* ========== LANDING PAGE CSS ========== */
        .landing-root {
          --ld-primary: ${dbSettings?.theme_colors?.primary || '#10b981'};
          --ld-primary-hover: ${dbSettings?.theme_colors?.primary_hover || '#059669'};
          --ld-bg: #ffffff;
          --ld-bg-subtle: #f8fafc;
          --ld-card: #ffffff;
          --ld-card-hover: #f1f5f9;
          --ld-text: #0f172a;
          --ld-text-muted: #475569;
          --ld-border: #e2e8f0;
          --ld-gradient-1: ${dbSettings?.theme_colors?.primary || '#10b981'};
          --ld-gradient-2: ${dbSettings?.theme_colors?.secondary || '#0ea5e9'};
          --ld-gradient-3: #6366f1;

          background: var(--ld-bg);
          color: var(--ld-text);
          min-height: 100vh;
          overflow-x: hidden;
          font-family: 'Inter', 'Tajawal', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
        }

        html[data-mode="dark"] .landing-root,
        html.dark .landing-root {
          --ld-bg: #090d16;
          --ld-bg-subtle: #0f172a;
          --ld-card: #0f172a;
          --ld-card-hover: #1e293b;
          --ld-text: #f8fafc;
          --ld-text-muted: #94a3b8;
          --ld-border: #1e293b;
        }

        /* ===== NAV ===== */
        .ld-nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          padding: 1.25rem 2rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: all 0.3s ease;
          background: transparent;
        }
        .ld-nav.scrolled {
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(226, 232, 240, 0.8);
          padding: 0.85rem 2rem;
          box-shadow: 0 4px 30px rgba(0, 0, 0, 0.02);
        }
        html[data-mode="dark"] .ld-nav.scrolled,
        html.dark .ld-nav.scrolled {
          background: rgba(11, 15, 22, 0.85);
          border-bottom: 1px solid rgba(30, 41, 59, 0.8);
          box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
        }
        .ld-nav-logo {
          font-size: 1.5rem;
          font-weight: 800;
          background: linear-gradient(135deg, var(--ld-gradient-1), var(--ld-gradient-2));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .ld-nav-links {
          display: flex;
          align-items: center;
          gap: 1.75rem;
        }
        .ld-nav-links a:not([class*="ld-btn-"]), .ld-nav-links button:not([class*="ld-btn-"]) {
          color: var(--ld-text-muted);
          text-decoration: none;
          font-size: 0.95rem;
          font-weight: 600;
          transition: color 0.2s;
          background: none;
          border: none;
          cursor: pointer;
          font-family: inherit;
        }
        .ld-nav-links a:not([class*="ld-btn-"]):hover, .ld-nav-links button:not([class*="ld-btn-"]):hover {
          color: var(--ld-text);
        }
        .ld-btn-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.65rem 1.5rem;
          border-radius: 9999px;
          background: linear-gradient(135deg, var(--ld-gradient-1), var(--ld-gradient-2));
          color: white !important;
          font-weight: 700;
          font-size: 0.9rem;
          border: none;
          text-decoration: none;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 4px 14px rgba(16, 185, 129, 0.25);
          -webkit-text-fill-color: white !important;
        }
        .ld-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4);
        }
        .ld-btn-outline {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.65rem 1.5rem;
          border-radius: 9999px;
          background: var(--ld-card);
          color: var(--ld-text) !important;
          font-weight: 700;
          font-size: 0.9rem;
          border: 1px solid var(--ld-border);
          text-decoration: none;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          -webkit-text-fill-color: var(--ld-text) !important;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
        }
        .ld-btn-outline:hover {
          border-color: var(--ld-primary);
          background: rgba(16, 185, 129, 0.04);
          transform: translateY(-2px);
        }
        .ld-mobile-toggle {
          display: none;
          background: none;
          border: none;
          color: var(--ld-text);
          cursor: pointer;
          padding: 0.5rem;
        }

        /* ===== HERO ===== */
        .ld-hero {
          padding: 11rem 2rem 7rem;
          text-align: center;
          position: relative;
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          z-index: 1;
        }
        .ld-hero::before {
          content: '';
          position: absolute;
          top: -10%;
          left: 50%;
          transform: translateX(-50%);
          width: 100%;
          max-width: 1200px;
          height: 600px;
          background: radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, rgba(14, 165, 233, 0.06) 30%, rgba(99, 102, 241, 0.03) 60%, transparent 80%);
          pointer-events: none;
          z-index: -1;
        }
        .ld-hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1.2rem;
          border-radius: 999px;
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.15);
          font-size: 0.85rem;
          color: #059669;
          margin-bottom: 2rem;
          font-weight: 600;
          box-shadow: 0 2px 10px rgba(16, 185, 129, 0.05);
        }
        .ld-hero h1 {
          font-size: clamp(2.5rem, 6vw, 4.25rem);
          font-weight: 900;
          line-height: 1.15;
          margin-bottom: 1.5rem;
          letter-spacing: -0.03em;
          color: var(--ld-text);
          max-width: 900px;
        }
        .ld-hero h1 span {
          background: linear-gradient(135deg, var(--ld-gradient-1), var(--ld-gradient-2), var(--ld-gradient-3));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .ld-hero p {
          font-size: 1.2rem;
          color: var(--ld-text-muted);
          max-width: 720px;
          margin: 0 auto 2.5rem;
          line-height: 1.65;
        }
        .ld-hero-ctas {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
          margin-bottom: 4.5rem;
        }
        .ld-hero-ctas .ld-btn-primary {
          padding: 0.85rem 2rem;
          font-size: 1rem;
        }
        .ld-hero-ctas .ld-btn-outline {
          padding: 0.85rem 2rem;
          font-size: 1rem;
        }
 
        /* ===== MOCKUP SHOWCASE ===== */
        .ld-hero-mockup-wrapper {
          position: relative;
          width: 100%;
          max-width: 1000px;
          margin: 0 auto 5rem;
        }
        .ld-hero-mockup {
          background: var(--ld-card);
          border-radius: 20px;
          border: 1px solid var(--ld-border);
          box-shadow: 0 30px 60px -15px rgba(0, 0, 0, 0.12), 0 0 50px rgba(16, 185, 129, 0.04);
          padding: 6px;
          overflow: hidden;
          transition: transform 0.5s ease;
        }
        .ld-hero-mockup:hover {
          transform: translateY(-4px);
        }
        .ld-hero-mockup-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          background: var(--ld-bg-subtle);
          border-bottom: 1px solid var(--ld-border);
          border-top-left-radius: 14px;
          border-top-right-radius: 14px;
        }
        .ld-mockup-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
        .ld-mockup-dot.red { background: #ef4444; }
        .ld-mockup-dot.yellow { background: #f59e0b; }
        .ld-mockup-dot.green { background: #10b981; }
        .ld-mockup-address {
          flex-grow: 1;
          max-width: 480px;
          margin: 0 auto;
          background: var(--ld-bg);
          border: 1px solid var(--ld-border);
          border-radius: 6px;
          font-size: 0.75rem;
          color: var(--ld-text-muted);
          padding: 0.2rem 1rem;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.25rem;
        }
        .ld-hero-mockup:hover {
          transform: translateY(-4px);
        }
        .ld-hero-mockup-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          border-top-left-radius: 14px;
          border-top-right-radius: 14px;
        }
        .ld-mockup-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
        .ld-mockup-dot.red { background: #ef4444; }
        .ld-mockup-dot.yellow { background: #f59e0b; }
        .ld-mockup-dot.green { background: #10b981; }
        .ld-mockup-address {
          flex-grow: 1;
          max-width: 480px;
          margin: 0 auto;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          font-size: 0.75rem;
          color: #64748b;
          padding: 0.2rem 1rem;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.25rem;
        }
        .ld-hero-mockup img {
          width: 100%;
          height: auto;
          display: block;
          border-bottom-left-radius: 14px;
          border-bottom-right-radius: 14px;
        }

        /* ===== STATS ===== */
        .ld-hero-stats {
          display: flex;
          justify-content: center;
          gap: 5rem;
          flex-wrap: wrap;
          border-top: 1px solid var(--ld-border);
          padding-top: 3.5rem;
          width: 100%;
          max-width: 900px;
          margin: 0 auto;
        }
        .ld-hero-stat {
          text-align: center;
        }
        .ld-hero-stat strong {
          display: block;
          font-size: 2.5rem;
          font-weight: 900;
          background: linear-gradient(135deg, var(--ld-gradient-1), var(--ld-gradient-2));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 0.25rem;
        }
        .ld-hero-stat span {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--ld-text-muted);
        }

        /* ===== LOGO MARQUEE ===== */
        .ld-marquee-wrapper {
          width: 100%;
          overflow: hidden;
          padding: 4rem 0 1.5rem;
          position: relative;
          max-width: 900px;
          margin: 0 auto;
        }
        .ld-marquee-wrapper::before, .ld-marquee-wrapper::after {
          content: '';
          position: absolute;
          top: 0;
          bottom: 0;
          width: 100px;
          z-index: 2;
          pointer-events: none;
        }
        .ld-marquee-wrapper::before {
          left: 0;
          background: linear-gradient(to right, var(--ld-bg), transparent);
        }
        .ld-marquee-wrapper::after {
          right: 0;
          background: linear-gradient(to left, var(--ld-bg), transparent);
        }
        .ld-marquee-content {
          display: flex;
          gap: 3.5rem;
          width: max-content;
          animation: marquee 30s linear infinite;
        }
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        [dir="rtl"] .ld-marquee-content {
          animation: marquee-rtl 30s linear infinite;
        }
        @keyframes marquee-rtl {
          0% { transform: translateX(0); }
          100% { transform: translateX(50%); }
        }
        .ld-marquee-item {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--ld-text-muted);
          white-space: nowrap;
          opacity: 0.65;
          transition: opacity 0.2s, color 0.2s;
        }
        .ld-marquee-item:hover {
          opacity: 1;
          color: var(--ld-primary);
        }
        .ld-marquee-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--ld-primary);
          opacity: 0.8;
        }

        /* ===== FEATURES ===== */
        .ld-features {
          padding: 7rem 2rem;
          max-width: 1200px;
          margin: 0 auto;
          position: relative;
        }
        .ld-section-header {
          text-align: center;
          margin-bottom: 5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .ld-section-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.4rem 1rem;
          border-radius: 999px;
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.15);
          font-size: 0.8rem;
          color: #059669;
          margin-bottom: 1.25rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .ld-section-header h2 {
          font-size: clamp(2.25rem, 5vw, 3.25rem);
          font-weight: 900;
          margin-bottom: 1.25rem;
          letter-spacing: -0.03em;
          color: var(--ld-text);
          max-width: 800px;
        }
        .ld-section-header p {
          font-size: 1.15rem;
          color: var(--ld-text-muted);
          max-width: 600px;
          margin: 0 auto;
          line-height: 1.6;
        }
        .ld-features-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 2rem;
        }
        .ld-feature-card {
          padding: 2.5rem 2rem;
          border-radius: 20px;
          background: var(--ld-card);
          border: 1px solid var(--ld-border);
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.01);
        }
        .ld-feature-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(90deg, var(--ld-gradient-1), var(--ld-gradient-2));
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        .ld-feature-card:hover {
          border-color: rgba(16, 185, 129, 0.25);
          transform: translateY(-6px);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.05);
        }
        .ld-feature-card:hover::before {
          opacity: 1;
        }
        .ld-feature-icon {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(14, 165, 233, 0.08));
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 1.5rem;
          color: var(--ld-primary);
        }
        .ld-feature-card h3 {
          font-size: 1.3rem;
          font-weight: 850;
          margin-bottom: 0.75rem;
          color: var(--ld-text);
        }
        .ld-feature-card p {
          font-size: 0.95rem;
          color: var(--ld-text-muted);
          line-height: 1.6;
        }

        /* ===== PRICING ===== */
        .ld-pricing {
          padding: 7rem 2rem;
          max-width: 1200px;
          margin: 0 auto;
          position: relative;
        }
        .ld-pricing-toggle {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          margin-bottom: 4rem;
        }
        .ld-pricing-toggle span {
          font-size: 1rem;
          color: var(--ld-text-muted);
          font-weight: 600;
          transition: color 0.2s;
        }
        .ld-pricing-toggle span.active {
          color: var(--ld-text);
        }
        .ld-toggle-track {
          width: 64px;
          height: 34px;
          border-radius: 999px;
          background: #e2e8f0;
          cursor: pointer;
          position: relative;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          border: 1px solid rgba(0,0,0,0.05);
          padding: 0;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);
        }
        html[data-mode="dark"] .ld-toggle-track,
        html.dark .ld-toggle-track {
          background: rgba(30, 41, 59, 0.8);
          border-color: rgba(255,255,255,0.05);
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
        }
        .ld-toggle-track.on {
          background: linear-gradient(135deg, var(--ld-primary), #a855f7);
          box-shadow: 0 0 20px rgba(168, 85, 247, 0.5), inset 0 2px 4px rgba(0,0,0,0.1);
          border-color: transparent;
        }
        .ld-toggle-track:hover {
          transform: scale(1.05);
        }
        .ld-toggle-knob {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: white;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          box-shadow: 0 2px 8px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.02);
        }
        .ld-toggle-track.on .ld-toggle-knob {
          transform: translateX(30px);
          box-shadow: 0 2px 8px rgba(0,0,0,0.2), 0 0 10px rgba(255,255,255,0.4);
        }
        [dir="rtl"] .ld-toggle-track.on .ld-toggle-knob {
          transform: translateX(-30px);
        }
        [dir="rtl"] .ld-toggle-knob {
          left: auto;
          right: 3px;
        }
        .ld-pricing-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 2rem;
          align-items: stretch;
        }
        .ld-plan-card {
          padding: 3.25rem 2.25rem;
          border-radius: 24px;
          background: var(--ld-card);
          border: 1px solid var(--ld-border);
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative;
          display: flex;
          flex-direction: column;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.01);
        }
        .ld-plan-card.badge-popular {
          border-color: var(--ld-primary);
          background: linear-gradient(180deg, rgba(16, 185, 129, 0.03), var(--ld-card));
          transform: scale(1.04);
          box-shadow: 0 20px 40px rgba(16, 185, 129, 0.08);
          border-width: 2px;
        }
        .ld-plan-card.badge-bestseller {
          border-color: #F59E0B;
          background: linear-gradient(180deg, rgba(245, 158, 11, 0.03), var(--ld-card));
          transform: scale(1.04);
          box-shadow: 0 20px 40px rgba(245, 158, 11, 0.08);
          border-width: 2px;
        }
        .ld-plan-card.badge-value {
          border-color: #10B981;
          background: linear-gradient(180deg, rgba(16, 185, 129, 0.03), var(--ld-card));
          transform: scale(1.04);
          box-shadow: 0 20px 40px rgba(16, 185, 129, 0.08);
          border-width: 2px;
        }
        .ld-plan-card.badge-recommended {
          border-color: #3B82F6;
          background: linear-gradient(180deg, rgba(59, 130, 246, 0.03), var(--ld-card));
          transform: scale(1.04);
          box-shadow: 0 20px 40px rgba(59, 130, 246, 0.08);
          border-width: 2px;
        }
        .ld-plan-card.badge-limited {
          border-color: #EF4444;
          background: linear-gradient(180deg, rgba(239, 68, 68, 0.03), var(--ld-card));
          transform: scale(1.04);
          box-shadow: 0 20px 40px rgba(239, 68, 68, 0.08);
          border-width: 2px;
        }

        .ld-plan-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.05);
        }
        .ld-plan-card[class*="badge-"]:hover {
          transform: scale(1.04) translateY(-6px);
        }
        .ld-plan-card.badge-popular:hover { box-shadow: 0 24px 48px rgba(16, 185, 129, 0.12); }
        .ld-plan-card.badge-bestseller:hover { box-shadow: 0 24px 48px rgba(245, 158, 11, 0.12); }
        .ld-plan-card.badge-value:hover { box-shadow: 0 24px 48px rgba(16, 185, 129, 0.12); }
        .ld-plan-card.badge-recommended:hover { box-shadow: 0 24px 48px rgba(59, 130, 246, 0.12); }
        .ld-plan-card.badge-limited:hover { box-shadow: 0 24px 48px rgba(239, 68, 68, 0.12); }

        .ld-plan-dynamic-badge {
          position: absolute;
          top: -16px;
          left: 50%;
          transform: translateX(-50%);
          padding: 0.4rem 1.5rem;
          border-radius: 999px;
          color: white;
          font-size: 0.85rem;
          font-weight: 700;
          white-space: nowrap;
          animation: badge-float 3s ease-in-out infinite;
        }
        .ld-plan-dynamic-badge.popular {
          background: linear-gradient(135deg, var(--ld-gradient-1), var(--ld-gradient-2));
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
        }
        .ld-plan-dynamic-badge.bestseller {
          background: linear-gradient(135deg, #F59E0B, #D97706);
          box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
          animation: badge-pulse-gold 2s infinite;
        }
        .ld-plan-dynamic-badge.value {
          background: linear-gradient(135deg, #10B981, #059669);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }
        .ld-plan-dynamic-badge.recommended {
          background: linear-gradient(135deg, #3B82F6, #2563EB);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }
        .ld-plan-dynamic-badge.limited {
          background: linear-gradient(135deg, #EF4444, #DC2626);
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
          animation: badge-pulse-red 1.5s infinite;
        }

        @keyframes badge-float {
          0%, 100% { transform: translate(-50%, 0); }
          50% { transform: translate(-50%, -4px); }
        }
        @keyframes badge-pulse-gold {
          0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(245, 158, 11, 0); }
          100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
        }
        @keyframes badge-pulse-red {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
          70% { box-shadow: 0 0 0 15px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        .ld-plan-name {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--ld-text);
          margin-bottom: 0.75rem;
        }
        .ld-plan-price {
          font-size: 3.25rem;
          font-weight: 900;
          margin-bottom: 0.5rem;
          line-height: 1;
          color: var(--ld-text);
          display: flex;
          align-items: baseline;
        }
        .ld-plan-price small {
          font-size: 1.05rem;
          font-weight: 600;
          color: var(--ld-text-muted);
          margin-left: 0.25rem;
        }
        [dir="rtl"] .ld-plan-price small {
          margin-left: 0;
          margin-right: 0.25rem;
        }
        .ld-plan-desc {
          font-size: 0.95rem;
          color: var(--ld-text-muted);
          margin-bottom: 2.25rem;
          line-height: 1.6;
          min-height: 48px;
        }
        .ld-plan-features {
          list-style: none;
          padding: 0;
          margin: 0 0 2.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          flex-grow: 1;
        }
        .ld-plan-features li {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 0.95rem;
          color: var(--ld-text-muted);
        }
        .ld-plan-features li svg {
          color: #10b981;
          flex-shrink: 0;
        }
        .ld-plan-cta {
          width: 100%;
          padding: 0.9rem;
          border-radius: 14px;
          font-weight: 700;
          font-size: 1rem;
          cursor: pointer;
          text-align: center;
          text-decoration: none;
          display: block;
          font-family: inherit;
          transition: all 0.3s;
        }
        .ld-plan-cta.primary {
          background: linear-gradient(135deg, var(--ld-gradient-1), var(--ld-gradient-2));
          color: white;
          border: none;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
        }
        .ld-plan-cta.primary:hover {
          box-shadow: 0 8px 24px rgba(16, 185, 129, 0.35);
          transform: translateY(-2px);
        }
        .ld-plan-cta.outline {
          background: transparent;
          color: var(--ld-text);
          border: 1px solid var(--ld-border);
        }
        .ld-plan-cta.outline:hover {
          border-color: var(--ld-primary);
          background: rgba(16, 185, 129, 0.04);
          transform: translateY(-2px);
        }

        /* ===== FOOTER ===== */
        .ld-footer {
          border-top: 1px solid var(--ld-border);
          padding: 6rem 2rem 3rem;
          background: var(--ld-bg-subtle);
          width: 100%;
        }
        .ld-footer-container {
          max-width: 1200px;
          margin: 0 auto;
        }
        .ld-footer-grid {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr;
          gap: 4rem;
          margin-bottom: 4rem;
        }
        .ld-footer-brand {
          max-width: 320px;
        }
        .ld-footer-brand h3 {
          font-size: 1.5rem;
          font-weight: 900;
          background: linear-gradient(135deg, var(--ld-gradient-1), var(--ld-gradient-2));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 1rem;
        }
        .ld-footer-brand p {
          font-size: 0.95rem;
          color: var(--ld-text-muted);
          line-height: 1.6;
        }
        .ld-footer-col h4 {
          font-size: 0.9rem;
          font-weight: 750;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 1.25rem;
          color: var(--ld-text);
        }
        .ld-footer-col a {
          display: block;
          font-size: 0.95rem;
          color: var(--ld-text-muted);
          text-decoration: none;
          margin-bottom: 0.75rem;
          transition: color 0.2s;
        }
        .ld-footer-col a:hover {
          color: var(--ld-primary);
        }
        .ld-footer-bottom {
          border-top: 1px solid var(--ld-border);
          padding-top: 2rem;
          text-align: center;
          font-size: 0.9rem;
          color: var(--ld-text-muted);
        }

        /* ===== MOBILE MENU ===== */
        .ld-mobile-menu {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 200;
          background: var(--ld-bg);
          opacity: 0.98;
          backdrop-filter: blur(20px);
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2.5rem;
        }
        .ld-mobile-menu.open {
          display: flex;
        }
        .ld-mobile-menu a, .ld-mobile-menu button {
          color: var(--ld-text);
          text-decoration: none;
          font-size: 1.5rem;
          font-weight: 700;
          background: none;
          border: none;
          cursor: pointer;
          font-family: inherit;
        }
        .ld-mobile-close {
          position: absolute;
          top: 1.5rem;
          right: 1.5rem;
          background: none;
          border: none;
          color: var(--ld-text);
          cursor: pointer;
          padding: 0.5rem;
        }
        [dir="rtl"] .ld-mobile-close {
          right: auto;
          left: 1.5rem;
        }

        /* ===== RESPONSIVENESS ===== */
        @media (max-width: 1024px) {
          .ld-features-grid { grid-template-columns: repeat(2, 1fr); }
          .ld-pricing-grid { grid-template-columns: repeat(2, 1fr); }
          .ld-plan-card.popular { transform: none; }
          .ld-plan-card.popular:hover { transform: translateY(-6px); }
          .ld-footer-grid { grid-template-columns: 1.5fr 1fr 1fr; gap: 2rem; }
          .ld-hero { padding: 9rem 2rem 5rem; }
        }
        @media (max-width: 768px) {
          .ld-nav-links { display: none; }
          .ld-mobile-toggle { display: block; background: none; border: none; color: var(--ld-text); cursor: pointer; padding: 0.5rem; }
          .ld-features-grid { grid-template-columns: 1fr; }
          .ld-pricing-grid { grid-template-columns: 1fr; max-width: 440px; margin: 0 auto; }
          .ld-footer-grid { grid-template-columns: 1fr 1fr; }
          .ld-hero-stats { gap: 3rem; }
          .ld-hero { padding: 8rem 1.5rem 4rem; }
          .ld-hero h1 { font-size: clamp(2rem, 7vw, 3rem); }
        }
        @media (max-width: 480px) {
          .ld-footer-grid { grid-template-columns: 1fr; }
          .ld-hero { padding: 6rem 1rem 3rem; }
          .ld-hero-stats { gap: 2rem; flex-direction: column; }
          .ld-hero-ctas { flex-direction: column; width: 100%; }
          .ld-hero-ctas > * { width: 100%; }
          .ld-hero h1 { font-size: 1.85rem; }
          .ld-nav { padding: 1rem; }
        }

        /* ===== RTL SUPPORT ===== */
        [dir="rtl"] .ld-btn-primary svg {
          transform: rotate(180deg);
        }
        [dir="rtl"] .ld-plan-cta.primary svg {
          transform: rotate(180deg);
        }
        [dir="rtl"] .ld-plan-features li svg {
          order: -1;
        }

        /* ===== ANIMATIONS ===== */
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ld-animate {
          animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .ld-animate-d1 { animation-delay: 0.08s; }
        .ld-animate-d2 { animation-delay: 0.16s; }
        .ld-animate-d3 { animation-delay: 0.24s; }
        .ld-animate-d4 { animation-delay: 0.32s; }
        .ld-animate-d5 { animation-delay: 0.4s; }
        .ld-animate-d6 { animation-delay: 0.48s; }
      `}</style>

      {/* ====== NAVBAR ====== */}
      <nav className={`ld-nav ${scrolled ? 'scrolled' : ''}`}>
        <a href="#" className="ld-nav-logo">
          {settings.logo_url && (
            <img src={settings.logo_url} alt="Logo" style={{ height: '2.25rem', objectFit: 'contain', borderRadius: '0.375rem' }} />
          )}
          <span>{settings.site_name}</span>
        </a>
        <div className="ld-nav-links">
          <a href="#features">{t.nav.features}</a>
          <a href="#pricing">{t.nav.pricing}</a>
          <button onClick={toggleLang} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <Globe size={16} /> {lang === 'en' ? 'العربية' : 'English'}
          </button>
          <button onClick={toggleColorMode} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ld-text-muted)', padding: '0.25rem' }} title={colorMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {colorMode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <Link href="/login" className="ld-btn-outline">{t.nav.login}</Link>
          <Link href="/signup" className="ld-btn-primary">{t.nav.signup} <ArrowRight size={16} /></Link>
        </div>
        <button className="ld-mobile-toggle" onClick={() => setMobileMenuOpen(true)}>
          <Menu size={28} />
        </button>
      </nav>

      {/* ====== MOBILE MENU ====== */}
      <div className={`ld-mobile-menu ${mobileMenuOpen ? 'open' : ''}`}>
        <button className="ld-mobile-close" onClick={() => setMobileMenuOpen(false)}>
          <X size={32} />
        </button>
        <a href="#features" onClick={() => setMobileMenuOpen(false)}>{t.nav.features}</a>
        <a href="#pricing" onClick={() => setMobileMenuOpen(false)}>{t.nav.pricing}</a>
        <button onClick={() => { toggleLang(); setMobileMenuOpen(false); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
          <Globe size={20} /> {lang === 'en' ? 'العربية' : 'English'}
        </button>
        <button onClick={() => { toggleColorMode(); setMobileMenuOpen(false); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
          {colorMode === 'dark' ? <Sun size={20} /> : <Moon size={20} />} {colorMode === 'dark' ? (lang === 'ar' ? 'الوضع الفاتح' : 'Light Mode') : (lang === 'ar' ? 'الوضع الداكن' : 'Dark Mode')}
        </button>
        <Link href="/login" onClick={() => setMobileMenuOpen(false)}>{t.nav.login}</Link>
        <Link href="/signup" className="ld-btn-primary" onClick={() => setMobileMenuOpen(false)}>
          {t.nav.signup}
        </Link>
      </div>

      {/* ====== HERO ====== */}
      <section className="ld-hero">
        <div className="ld-hero-badge ld-animate">
          <Sparkles size={16} /> {t.hero.badge}
        </div>
        <h1 className="ld-animate ld-animate-d1">
          {t.hero.title}<br />
          <span>{t.hero.titleHighlight}</span>
        </h1>
        <p className="ld-animate ld-animate-d2">{t.hero.subtitle}</p>
        <div className="ld-hero-ctas ld-animate ld-animate-d3">
          <Link href="/signup" className="ld-btn-primary">
            {t.hero.cta} <ArrowRight size={18} />
          </Link>
          <a href="#pricing" className="ld-btn-outline">{t.hero.ctaSecondary}</a>
        </div>

        {/* Browser Mockup Showcase */}
        <div className="ld-hero-mockup-wrapper ld-animate ld-animate-d4">
          <div className="ld-hero-mockup">
            <div className="ld-hero-mockup-header">
              <span className="ld-mockup-dot red" />
              <span className="ld-mockup-dot yellow" />
              <span className="ld-mockup-dot green" />
              <div className="ld-mockup-address">
                <Shield size={12} />
                <span>{settings.site_name ? `${settings.site_name.toLowerCase().replace(/\s+/g, '')}.com/dashboard` : 'mkwhats.com/dashboard'}</span>
              </div>

            </div>
            <img src="/dashboard_mockup.png" alt="Platform Dashboard Preview" />
          </div>
        </div>

        <div className="ld-hero-stats ld-animate ld-animate-d5">
          {t.hero.stats.map((s, i) => (
            <div key={i} className="ld-hero-stat">
              <strong>{s.value}</strong>
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Logo Marquee Slider */}
        <div className="ld-marquee-wrapper ld-animate ld-animate-d6">
          <div className="ld-marquee-content">
            {marqueeBrands.map((b, i) => (
              <div key={i} className="ld-marquee-item">
                <span className="ld-marquee-dot" />
                <span>{b}</span>
              </div>
            ))}
            {/* Duplicated list for infinite looping */}
            {marqueeBrands.map((b, i) => (
              <div key={`dup-${i}`} className="ld-marquee-item">
                <span className="ld-marquee-dot" />
                <span>{b}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ====== FEATURES ====== */}
      <section className="ld-features" id="features">
        <div className="ld-section-header">
          <div className="ld-section-badge"><Star size={14} /> {t.features.badge}</div>
          <h2>{t.features.title}</h2>
          <p>{t.features.subtitle}</p>
        </div>
        <div className="ld-features-grid">
          {t.features.items.map((item: any, i: number) => {
            const Icon = featureIcons[i]
            return (
              <div key={i} className={`ld-feature-card ld-animate ld-animate-d${(i % 3) + 1}`}>
                <div className="ld-feature-icon"><Icon size={24} /></div>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* ====== PRICING ====== */}
      <section className="ld-pricing" id="pricing">
        <div className="ld-section-header">
          <div className="ld-section-badge"><BarChart3 size={14} /> {t.pricing.badge}</div>
          <h2>{t.pricing.title}</h2>
          <p>{t.pricing.subtitle}</p>
        </div>
        <div className="ld-pricing-toggle">
          <span className={!isYearly ? 'active' : ''}>{t.pricing.monthly}</span>
          <button className={`ld-toggle-track ${isYearly ? 'on' : ''}`} onClick={() => setIsYearly(!isYearly)}>
            <div className="ld-toggle-knob" />
          </button>
          <span className={isYearly ? 'active' : ''}>{t.pricing.yearly}</span>
        </div>
        <div className="ld-pricing-grid">
          {!isLoaded ? (
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
            </div>
          ) : (
            t.pricing.plans.map((plan: any, i: number) => (
              <div key={i} className={`ld-plan-card ${plan.badgeType ? `badge-${plan.badgeType}` : ''} ld-animate ld-animate-d${i + 1}`}>
                {plan.badgeType && (
                  <div className={`ld-plan-dynamic-badge ${plan.badgeType}`}>
                    {plan.badgeType === 'popular' && (lang === 'ar' ? 'الأكثر شيوعاً' : 'Most Popular')}
                    {plan.badgeType === 'bestseller' && (lang === 'ar' ? 'الأكثر مبيعاً' : 'Best Seller')}
                    {plan.badgeType === 'value' && (lang === 'ar' ? 'القيمة الأفضل' : 'Best Value')}
                    {plan.badgeType === 'recommended' && (lang === 'ar' ? 'نوصي به' : 'Recommended')}
                    {plan.badgeType === 'limited' && (lang === 'ar' ? 'عرض لفترة محدودة' : 'Limited Time')}
                  </div>
                )}
                
                <div className="flex justify-between items-start">
                  <div className="ld-plan-name">{plan.name}</div>
                  {plan.trialDays > 0 && (
                    <div className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold px-3 py-1 rounded-full border border-emerald-500/20">
                      {lang === 'ar' ? `مجاناً لـ ${plan.trialDays} أيام` : `${plan.trialDays} Days Free`}
                    </div>
                  )}
                </div>
                <div className="ld-plan-price">
                  {(isYearly && plan.originalPriceYearly) || (!isYearly && plan.originalPrice) ? (
                    <div className="flex flex-col items-start justify-center">
                      <span className="relative inline-block text-2xl text-slate-500 dark:text-slate-400 font-bold mb-1 after:absolute after:left-0 after:top-1/2 after:w-full after:h-[3px] after:bg-red-500 after:-rotate-[12deg]">
                        {isYearly ? plan.originalPriceYearly : plan.originalPrice}
                      </span>
                      <div>
                        {isYearly ? plan.priceYearly : plan.price}
                        <small>
                          {isYearly 
                            ? (lang === 'ar' ? ' / سنوياً' : ' / year') 
                            : (lang === 'ar' ? ' / شهرياً' : ' / month')}
                        </small>
                      </div>
                    </div>
                  ) : (
                    <>
                      {isYearly ? plan.priceYearly : plan.price}
                      <small>
                        {isYearly 
                          ? (lang === 'ar' ? ' / سنوياً' : ' / year') 
                          : (lang === 'ar' ? ' / شهرياً' : ' / month')}
                      </small>
                    </>
                  )}
                </div>
                <div className="ld-plan-desc">{plan.desc}</div>
                <ul className="ld-plan-features">
                  {plan.features
                    .filter((f: any) => !f.yearlyOnly || isYearly)
                    .map((f: any, fi: number) => (
                      <li key={fi}><Check size={16} /> {f.text}</li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`ld-plan-cta ${plan.popular ? 'primary' : 'outline'}`}
                >
                  {i === 2 ? t.pricing.ctaEnterprise : t.pricing.cta}
                </Link>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ====== FOOTER ====== */}
      <footer className="ld-footer">
        <div className="ld-footer-container">
          <div className="ld-footer-grid">
            <div className="ld-footer-brand">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {settings.logo_url && (
                  <img src={settings.logo_url} alt="Logo" style={{ height: '2.25rem', objectFit: 'contain', borderRadius: '0.375rem' }} />
                )}
                <span>{settings.site_name}</span>
              </h3>
              <p>{t.footer.desc}</p>
            </div>
            <div className="ld-footer-col">
              <h4>{t.footer.product}</h4>
              <a href="#features">{t.footer.links.features}</a>
              <a href="#pricing">{t.footer.links.pricing}</a>
              <Link href="/p/docs">{t.footer.links.docs}</Link>
            </div>
            <div className="ld-footer-col">
              <h4>{t.footer.company}</h4>
              <Link href="/p/about">{t.footer.links.about}</Link>
              <Link href="/p/contact">{t.footer.links.contact}</Link>
              <Link href="/p/blog">{t.footer.links.blog}</Link>
            </div>
            <div className="ld-footer-col">
              <h4>{t.footer.legal}</h4>
              <Link href="/p/privacy">{t.footer.links.privacy}</Link>
              <Link href="/p/terms">{t.footer.links.terms}</Link>
            </div>
          </div>
          <div className="ld-footer-bottom">
            <span>
              {language === 'ar' ? (
                <>
                  © 2026 {settings.site_name || 'MKWhats'}. جميع الحقوق محفوظة. تطوير{' '}
                  <a
                    href="https://instagram.com/Msto_viral"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-semibold"
                  >
                    @Msto_viral
                  </a>
                </>
              ) : (
                <>
                  © 2026 {settings.site_name || 'MKWhats'}. All rights reserved. Developed by{' '}
                  <a
                    href="https://instagram.com/Msto_viral"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-semibold"
                  >
                    @Msto_viral
                  </a>
                </>
              )}
            </span>
          </div>

        </div>
      </footer>
    </div>
  )
}
