'use client'

import { ArrowLeft, Globe, Moon, Sun } from 'lucide-react'
import Link from 'next/link'
import { useLanguage } from '@/hooks/use-language'
import { useTheme } from '@/hooks/use-theme'

export function SitePageViewer({ page }: { page: any }) {
  const { language, setLanguage } = useLanguage()
  const { colorMode, toggleColorMode } = useTheme()

  const isRtl = language === 'ar'
  const title = language === 'ar' ? page.title_ar : page.title_en
  const content = language === 'ar' ? page.content_ar : page.content_en

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Simple Header */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium hover:text-emerald-500 transition-colors">
            <ArrowLeft className={`h-4 w-4 ${isRtl ? 'rotate-180' : ''}`} />
            {language === 'ar' ? 'العودة للرئيسية' : 'Back to Home'}
          </Link>
          <div className="flex items-center gap-4">
            <button onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors" title={language === 'ar' ? 'English' : 'العربية'}>
              <Globe className="h-4 w-4" />
            </button>
            <button onClick={toggleColorMode} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors" title={colorMode === 'dark' ? 'Light Mode' : 'Dark Mode'}>
              {colorMode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl sm:text-4xl font-bold mb-8">{title}</h1>
        <div 
          className="prose prose-slate dark:prose-invert max-w-none whitespace-pre-wrap leading-relaxed"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </main>
    </div>
  )
}
