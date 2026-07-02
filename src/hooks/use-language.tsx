'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import arTranslations from '@/locales/ar.json';
import enTranslations from '@/locales/en.json';

type Language = 'ar' | 'en';
type Translations = typeof arTranslations;

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, defaultValue?: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const translations: Record<Language, Translations> = {
  ar: arTranslations,
  en: enTranslations,
};

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('ar'); // Default to Arabic as requested

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('app_language');
      if (stored === 'en' || stored === 'ar') {
        setLanguageState(stored);
      }
    }
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('app_language', lang);
      // Update HTML attributes for RTL/LTR compatibility
      document.documentElement.lang = lang;
      document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.documentElement.lang = language;
      document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    }
  }, [language]);

  // Deep key translation function: e.g., t('nav.dashboard')
  const t = useCallback((key: string, defaultValue?: string): string => {
    const keys = key.split('.');
    let current: any = translations[language];

    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = current[k];
      } else {
        return defaultValue || key;
      }
    }

    return typeof current === 'string' ? current : (defaultValue || key);
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    // Graceful fallback to avoid app crashes outside provider
    return {
      language: 'ar' as Language,
      setLanguage: () => {},
      t: (key: string, defaultValue?: string) => defaultValue || key,
    };
  }
  return context;
}
