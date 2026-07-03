'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useSiteSettings } from '@/hooks/use-site-settings'
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
      copyright: '© 2026 WaCRM. All rights reserved.',
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
          title: 'رد ذكي بالـ AI',
          desc: 'اربط OpenAI أو DeepSeek للرد التلقائي على العملاء بردود ذكية ومتعلقة بالسياق على مدار الساعة.',
        },
        {
          title: 'محادثات ذكية',
          desc: 'بوتات الكلمات المفتاحية، جدولة الرسائل، وقوالب مخصصة — محادثاتك تعمل تلقائياً.',
        },
        {
          title: 'CRM متقدم',
          desc: 'استيراد/تصدير جهات الاتصال، تقييم VIP، حقول مخصصة، وسجل تفاعل كامل لكل عميل.',
        },
        {
          title: 'حملات البث',
          desc: 'أرسل رسائل جماعية بقوالب معتمدة، وتابع التسليم والقراءة والردود في الوقت الفعلي.',
        },
        {
          title: 'متعدد اللغات',
          desc: 'دعم كامل للعربية والإنجليزية مع تخطيط RTL. خدمة العملاء بلغتهم بسهولة.',
        },
        {
          title: 'آمن وموثوق',
          desc: 'تشفير كامل، صلاحيات متدرجة، وبنية تحتية على مستوى المؤسسات لحماية بياناتك.',
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
          name: 'المبتدئ',
          price: '$19',
          priceYearly: '$15',
          period: '/شهر',
          desc: 'مثالي للأعمال الصغيرة التي تبدأ للتو.',
          popular: false,
          features: [
            'رقم واتساب واحد',
            '1,000 رسالة/شهر',
            '500 جهة اتصال',
            'رد تلقائي بالكلمات المفتاحية',
            'استيراد/تصدير CSV',
            'دعم بالبريد الإلكتروني',
          ],
        },
        {
          name: 'الاحترافي',
          price: '$49',
          priceYearly: '$39',
          period: '/شهر',
          desc: 'للفرق النامية التي تحتاج الأتمتة.',
          features: [
            '3 أرقام واتساب',
            '10,000 رسالة/شهر',
            '5,000 جهة اتصال',
            'رد ذكي بالذكاء الاصطناعي',
            'حملات البث الجماعي',
            'جدولة الرسائل',
            'مزامنة Google Sheets',
            'دعم ذو أولوية',
          ],
          popular: true,
        },
        {
          name: 'المؤسسات',
          price: '$149',
          priceYearly: '$119',
          period: '/شهر',
          desc: 'قوة غير محدودة للمنظمات الكبيرة.',
          popular: false,
          features: [
            'أرقام غير محدودة',
            'رسائل غير محدودة',
            'جهات اتصال غير محدودة',
            'تدريب AI متقدم',
            'تكاملات مخصصة',
            'مدير حساب مخصص',
            'ضمان SLA',
            'خيار العلامة البيضاء',
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
      copyright: '© 2026 WaCRM. جميع الحقوق محفوظة.',
    },
  },
} as const

type Lang = 'en' | 'ar'

const featureIcons = [Bot, MessageSquare, Users, Zap, Globe, Shield]

/* ================================================================ */
export default function LandingPage() {
  const { settings } = useSiteSettings()
  const [lang, setLang] = useState<Lang>('en')
  const [isYearly, setIsYearly] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  const [dbSettings, setDbSettings] = useState<any>(null)
  const [dbPlans, setDbPlans] = useState<any[]>([])

  const isRtl = lang === 'ar'

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('wacrm_lang') : null
    if (saved === 'ar' || saved === 'en') setLang(saved)
  }, [])

  const toggleLang = useCallback(() => {
    const next = lang === 'en' ? 'ar' : 'en'
    setLang(next)
    localStorage.setItem('wacrm_lang', next)
  }, [lang])

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
        const pFeatures = lang === 'ar' ? (p.features_ar || []) : (p.features_en || [])
        return {
          name: lang === 'ar' ? p.display_name : p.name.charAt(0).toUpperCase() + p.name.slice(1),
          price: `$${p.price_monthly}`,
          priceYearly: `$${p.price_yearly}`,
          period: lang === 'ar' ? '/شهر' : '/mo',
          desc: p.description || (lang === 'ar' ? `خطة اشتراك ${p.display_name}` : `${p.display_name} subscription plan.`),
          popular: p.name === 'pro',
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
    <div dir={isRtl ? 'rtl' : 'ltr'} className="landing-root" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      <style>{`
        /* ========== LANDING PAGE CSS ========== */
        .landing-root {
          --ld-primary: ${dbSettings?.theme_colors?.primary || 'oklch(0.526 0.247 293)'};
          --ld-primary-hover: ${dbSettings?.theme_colors?.primary_hover || 'oklch(0.6 0.22 293)'};
          --ld-bg-dark: ${dbSettings?.theme_colors?.background || 'oklch(0.08 0.01 260)'};
          --ld-bg-card: ${dbSettings?.theme_colors?.card || 'oklch(0.13 0.015 260)'};
          --ld-bg-card-hover: ${dbSettings?.theme_colors?.card_hover || 'oklch(0.16 0.015 260)'};
          --ld-text: ${dbSettings?.theme_colors?.text || 'oklch(0.95 0 0)'};
          --ld-text-muted: oklch(0.6 0.01 260);
          --ld-border: oklch(0.22 0.01 260);
          --ld-gradient-1: ${dbSettings?.theme_colors?.primary || 'oklch(0.526 0.247 293)'};
          --ld-gradient-2: ${dbSettings?.theme_colors?.secondary || 'oklch(0.55 0.2 330)'};
          --ld-gradient-3: oklch(0.6 0.18 200);

          background: var(--ld-bg-dark);
          color: var(--ld-text);
          min-height: 100vh;
          overflow-x: hidden;
        }

        /* ===== NAV ===== */
        .ld-nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          padding: 1rem 2rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: all 0.3s ease;
        }
        .ld-nav.scrolled {
          background: oklch(0.08 0.01 260 / 0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid oklch(0.22 0.01 260 / 0.5);
          padding: 0.75rem 2rem;
        }
        .ld-nav-logo {
          font-size: 1.5rem;
          font-weight: 800;
          background: linear-gradient(135deg, var(--ld-gradient-1), var(--ld-gradient-2));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          text-decoration: none;
        }
        .ld-nav-links {
          display: flex;
          align-items: center;
          gap: 2rem;
        }
        .ld-nav-links a, .ld-nav-links button {
          color: var(--ld-text-muted);
          text-decoration: none;
          font-size: 0.9rem;
          font-weight: 500;
          transition: color 0.2s;
          background: none;
          border: none;
          cursor: pointer;
          font-family: inherit;
        }
        .ld-nav-links a:hover, .ld-nav-links button:hover {
          color: var(--ld-text);
        }
        .ld-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.6rem 1.4rem;
          border-radius: 10px;
          background: linear-gradient(135deg, var(--ld-gradient-1), var(--ld-gradient-2));
          color: white !important;
          font-weight: 600;
          font-size: 0.9rem;
          border: none;
          text-decoration: none;
          cursor: pointer;
          transition: all 0.3s ease;
          -webkit-text-fill-color: white !important;
        }
        .ld-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 32px oklch(0.526 0.247 293 / 0.35);
        }
        .ld-btn-outline {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.6rem 1.4rem;
          border-radius: 10px;
          background: transparent;
          color: var(--ld-text) !important;
          font-weight: 600;
          font-size: 0.9rem;
          border: 1px solid var(--ld-border);
          text-decoration: none;
          cursor: pointer;
          transition: all 0.3s ease;
          -webkit-text-fill-color: var(--ld-text) !important;
        }
        .ld-btn-outline:hover {
          border-color: var(--ld-primary);
          background: oklch(0.526 0.247 293 / 0.08);
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
          padding: 10rem 2rem 6rem;
          text-align: center;
          position: relative;
          max-width: 1200px;
          margin: 0 auto;
        }
        .ld-hero::before {
          content: '';
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 800px;
          height: 800px;
          background: radial-gradient(circle, oklch(0.526 0.247 293 / 0.12) 0%, transparent 60%);
          pointer-events: none;
        }
        .ld-hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1.2rem;
          border-radius: 999px;
          background: oklch(0.526 0.247 293 / 0.1);
          border: 1px solid oklch(0.526 0.247 293 / 0.2);
          font-size: 0.85rem;
          color: oklch(0.7 0.15 293);
          margin-bottom: 2rem;
          font-weight: 500;
        }
        .ld-hero h1 {
          font-size: clamp(2.5rem, 6vw, 4.5rem);
          font-weight: 800;
          line-height: 1.1;
          margin-bottom: 1.5rem;
          letter-spacing: -0.02em;
        }
        .ld-hero h1 span {
          background: linear-gradient(135deg, var(--ld-gradient-1), var(--ld-gradient-2), var(--ld-gradient-3));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .ld-hero p {
          font-size: 1.15rem;
          color: var(--ld-text-muted);
          max-width: 640px;
          margin: 0 auto 2.5rem;
          line-height: 1.7;
        }
        .ld-hero-ctas {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
          margin-bottom: 4rem;
        }
        .ld-hero-ctas .ld-btn-primary {
          padding: 0.85rem 2rem;
          font-size: 1rem;
        }
        .ld-hero-ctas .ld-btn-outline {
          padding: 0.85rem 2rem;
          font-size: 1rem;
        }
        .ld-hero-stats {
          display: flex;
          justify-content: center;
          gap: 4rem;
          flex-wrap: wrap;
        }
        .ld-hero-stat {
          text-align: center;
        }
        .ld-hero-stat strong {
          display: block;
          font-size: 2.2rem;
          font-weight: 800;
          background: linear-gradient(135deg, var(--ld-gradient-1), var(--ld-gradient-2));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .ld-hero-stat span {
          font-size: 0.85rem;
          color: var(--ld-text-muted);
        }

        /* ===== FEATURES ===== */
        .ld-features {
          padding: 6rem 2rem;
          max-width: 1200px;
          margin: 0 auto;
        }
        .ld-section-header {
          text-align: center;
          margin-bottom: 4rem;
        }
        .ld-section-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.4rem 1rem;
          border-radius: 999px;
          background: oklch(0.526 0.247 293 / 0.1);
          border: 1px solid oklch(0.526 0.247 293 / 0.2);
          font-size: 0.8rem;
          color: oklch(0.7 0.15 293);
          margin-bottom: 1rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .ld-section-header h2 {
          font-size: clamp(2rem, 4vw, 3rem);
          font-weight: 800;
          margin-bottom: 1rem;
          letter-spacing: -0.02em;
        }
        .ld-section-header p {
          font-size: 1.1rem;
          color: var(--ld-text-muted);
          max-width: 560px;
          margin: 0 auto;
        }
        .ld-features-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
        }
        .ld-feature-card {
          padding: 2rem;
          border-radius: 16px;
          background: var(--ld-bg-card);
          border: 1px solid var(--ld-border);
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }
        .ld-feature-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, var(--ld-gradient-1), var(--ld-gradient-2));
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        .ld-feature-card:hover {
          background: var(--ld-bg-card-hover);
          border-color: oklch(0.526 0.247 293 / 0.3);
          transform: translateY(-4px);
        }
        .ld-feature-card:hover::before {
          opacity: 1;
        }
        .ld-feature-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: linear-gradient(135deg, oklch(0.526 0.247 293 / 0.15), oklch(0.55 0.2 330 / 0.1));
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 1.2rem;
          color: oklch(0.7 0.2 293);
        }
        .ld-feature-card h3 {
          font-size: 1.15rem;
          font-weight: 700;
          margin-bottom: 0.6rem;
        }
        .ld-feature-card p {
          font-size: 0.9rem;
          color: var(--ld-text-muted);
          line-height: 1.6;
        }

        /* ===== PRICING ===== */
        .ld-pricing {
          padding: 6rem 2rem;
          max-width: 1200px;
          margin: 0 auto;
        }
        .ld-pricing-toggle {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          margin-bottom: 3rem;
        }
        .ld-pricing-toggle span {
          font-size: 0.95rem;
          color: var(--ld-text-muted);
          font-weight: 500;
        }
        .ld-pricing-toggle span.active {
          color: var(--ld-text);
        }
        .ld-toggle-track {
          width: 52px;
          height: 28px;
          border-radius: 999px;
          background: var(--ld-border);
          cursor: pointer;
          position: relative;
          transition: background 0.3s;
          border: none;
          padding: 0;
        }
        .ld-toggle-track.on {
          background: var(--ld-primary);
        }
        .ld-toggle-knob {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: white;
          transition: transform 0.3s;
        }
        .ld-toggle-track.on .ld-toggle-knob {
          transform: translateX(24px);
        }
        [dir="rtl"] .ld-toggle-track.on .ld-toggle-knob {
          transform: translateX(-24px);
        }
        [dir="rtl"] .ld-toggle-knob {
          left: auto;
          right: 3px;
        }
        .ld-pricing-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
          align-items: start;
        }
        .ld-plan-card {
          padding: 2.5rem 2rem;
          border-radius: 20px;
          background: var(--ld-bg-card);
          border: 1px solid var(--ld-border);
          transition: all 0.3s ease;
          position: relative;
        }
        .ld-plan-card.popular {
          border-color: var(--ld-primary);
          background: linear-gradient(180deg, oklch(0.16 0.02 293), var(--ld-bg-card));
          transform: scale(1.03);
        }
        .ld-plan-card:hover {
          transform: translateY(-4px);
        }
        .ld-plan-card.popular:hover {
          transform: scale(1.03) translateY(-4px);
        }
        .ld-plan-popular-badge {
          position: absolute;
          top: -14px;
          left: 50%;
          transform: translateX(-50%);
          padding: 0.35rem 1.2rem;
          border-radius: 999px;
          background: linear-gradient(135deg, var(--ld-gradient-1), var(--ld-gradient-2));
          color: white;
          font-size: 0.75rem;
          font-weight: 700;
          white-space: nowrap;
        }
        .ld-plan-name {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--ld-text-muted);
          margin-bottom: 0.5rem;
        }
        .ld-plan-price {
          font-size: 3rem;
          font-weight: 800;
          margin-bottom: 0.25rem;
          line-height: 1;
        }
        .ld-plan-price small {
          font-size: 1rem;
          font-weight: 500;
          color: var(--ld-text-muted);
        }
        .ld-plan-desc {
          font-size: 0.9rem;
          color: var(--ld-text-muted);
          margin-bottom: 2rem;
          line-height: 1.5;
        }
        .ld-plan-features {
          list-style: none;
          padding: 0;
          margin: 0 0 2rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .ld-plan-features li {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-size: 0.9rem;
          color: var(--ld-text-muted);
        }
        .ld-plan-features li svg {
          color: oklch(0.65 0.2 160);
          flex-shrink: 0;
        }
        .ld-plan-cta {
          width: 100%;
          padding: 0.85rem;
          border-radius: 12px;
          font-weight: 600;
          font-size: 0.95rem;
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
        }
        .ld-plan-cta.primary:hover {
          box-shadow: 0 8px 32px oklch(0.526 0.247 293 / 0.35);
        }
        .ld-plan-cta.outline {
          background: transparent;
          color: var(--ld-text);
          border: 1px solid var(--ld-border);
        }
        .ld-plan-cta.outline:hover {
          border-color: var(--ld-primary);
        }

        /* ===== FOOTER ===== */
        .ld-footer {
          border-top: 1px solid var(--ld-border);
          padding: 4rem 2rem 2rem;
          max-width: 1200px;
          margin: 0 auto;
        }
        .ld-footer-grid {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr;
          gap: 3rem;
          margin-bottom: 3rem;
        }
        .ld-footer-brand {
          max-width: 280px;
        }
        .ld-footer-brand h3 {
          font-size: 1.3rem;
          font-weight: 800;
          background: linear-gradient(135deg, var(--ld-gradient-1), var(--ld-gradient-2));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 0.75rem;
        }
        .ld-footer-brand p {
          font-size: 0.9rem;
          color: var(--ld-text-muted);
          line-height: 1.6;
        }
        .ld-footer-col h4 {
          font-size: 0.85rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 1rem;
          color: var(--ld-text);
        }
        .ld-footer-col a {
          display: block;
          font-size: 0.88rem;
          color: var(--ld-text-muted);
          text-decoration: none;
          margin-bottom: 0.6rem;
          transition: color 0.2s;
        }
        .ld-footer-col a:hover {
          color: var(--ld-text);
        }
        .ld-footer-bottom {
          border-top: 1px solid var(--ld-border);
          padding-top: 1.5rem;
          text-align: center;
          font-size: 0.8rem;
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
          background: oklch(0.08 0.01 260 / 0.95);
          backdrop-filter: blur(30px);
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2rem;
        }
        .ld-mobile-menu.open {
          display: flex;
        }
        .ld-mobile-menu a, .ld-mobile-menu button {
          color: var(--ld-text);
          text-decoration: none;
          font-size: 1.3rem;
          font-weight: 600;
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
        }
        [dir="rtl"] .ld-mobile-close {
          right: auto;
          left: 1.5rem;
        }

        /* ===== RESPONSIVENESS ===== */
        @media (max-width: 900px) {
          .ld-nav-links { display: none; }
          .ld-mobile-toggle { display: block; }
          .ld-features-grid { grid-template-columns: 1fr 1fr; }
          .ld-pricing-grid { grid-template-columns: 1fr; max-width: 440px; margin: 0 auto; }
          .ld-plan-card.popular { transform: none; }
          .ld-plan-card.popular:hover { transform: translateY(-4px); }
          .ld-footer-grid { grid-template-columns: 1fr 1fr; }
          .ld-hero-stats { gap: 2rem; }
        }
        @media (max-width: 600px) {
          .ld-features-grid { grid-template-columns: 1fr; }
          .ld-footer-grid { grid-template-columns: 1fr; }
          .ld-hero { padding-top: 8rem; }
        }

        /* ===== ANIMATIONS ===== */
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ld-animate {
          animation: fadeInUp 0.7s ease-out both;
        }
        .ld-animate-d1 { animation-delay: 0.1s; }
        .ld-animate-d2 { animation-delay: 0.2s; }
        .ld-animate-d3 { animation-delay: 0.3s; }
        .ld-animate-d4 { animation-delay: 0.4s; }
        .ld-animate-d5 { animation-delay: 0.5s; }
        .ld-animate-d6 { animation-delay: 0.6s; }
      `}</style>

      {/* ====== NAVBAR ====== */}
      <nav className={`ld-nav ${scrolled ? 'scrolled' : ''}`}>
        <a href="#" className="ld-nav-logo" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {settings.logo_url && (
            <img src={settings.logo_url} alt="Logo" style={{ height: '2rem', objectFit: 'contain', borderRadius: '0.375rem' }} />
          )}
          <span>{settings.site_name}</span>
        </a>
        <div className="ld-nav-links">
          <a href="#features">{t.nav.features}</a>
          <a href="#pricing">{t.nav.pricing}</a>
          <button onClick={toggleLang} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <Globe size={16} /> {lang === 'en' ? 'العربية' : 'English'}
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
        <button onClick={() => { toggleLang(); setMobileMenuOpen(false); }}>
          <Globe size={20} /> {lang === 'en' ? 'العربية' : 'English'}
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
        <div className="ld-hero-stats ld-animate ld-animate-d4">
          {t.hero.stats.map((s, i) => (
            <div key={i} className="ld-hero-stat">
              <strong>{s.value}</strong>
              <span>{s.label}</span>
            </div>
          ))}
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
          {t.pricing.plans.map((plan: any, i: number) => (
            <div key={i} className={`ld-plan-card ${plan.popular ? 'popular' : ''} ld-animate ld-animate-d${i + 1}`}>
              {plan.popular && <div className="ld-plan-popular-badge">{t.pricing.popular}</div>}
              <div className="ld-plan-name">{plan.name}</div>
              <div className="ld-plan-price">
                {isYearly ? plan.priceYearly : plan.price}
                <small>{plan.period}</small>
              </div>
              <div className="ld-plan-desc">{plan.desc}</div>
              <ul className="ld-plan-features">
                {plan.features.map((f: any, fi: number) => (
                  <li key={fi}><Check size={16} /> {f}</li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={`ld-plan-cta ${plan.popular ? 'primary' : 'outline'}`}
              >
                {i === 2 ? t.pricing.ctaEnterprise : t.pricing.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ====== FOOTER ====== */}
      <footer className="ld-footer">
        <div className="ld-footer-grid">
          <div className="ld-footer-brand">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {settings.logo_url && (
                <img src={settings.logo_url} alt="Logo" style={{ height: '1.5rem', objectFit: 'contain', borderRadius: '0.25rem' }} />
              )}
              <span>{settings.site_name}</span>
            </h3>
            <p>{t.footer.desc}</p>
          </div>
          <div className="ld-footer-col">
            <h4>{t.footer.product}</h4>
            <a href="#features">{t.footer.links.features}</a>
            <a href="#pricing">{t.footer.links.pricing}</a>
            <a href="#">{t.footer.links.docs}</a>
          </div>
          <div className="ld-footer-col">
            <h4>{t.footer.company}</h4>
            <a href="#">{t.footer.links.about}</a>
            <a href="#">{t.footer.links.contact}</a>
            <a href="#">{t.footer.links.blog}</a>
          </div>
          <div className="ld-footer-col">
            <h4>{t.footer.legal}</h4>
            <a href="#">{t.footer.links.privacy}</a>
            <a href="#">{t.footer.links.terms}</a>
          </div>
        </div>
        <div className="ld-footer-bottom">
          {t.footer.copyright.replace('WaCRM', settings.site_name)}
        </div>
      </footer>
    </div>
  )
}
