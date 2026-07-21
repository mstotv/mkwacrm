'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check, Loader2, FileText, Globe } from 'lucide-react'
import { toast } from 'sonner'
import { useLanguage } from '@/hooks/use-language'

interface SitePage {
  slug: string
  title_en: string
  title_ar: string
  content_en: string
  content_ar: string
}

export function SitePagesPanel() {
  const [pages, setPages] = useState<SitePage[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeSlug, setActiveSlug] = useState<string>('privacy')
  const { t, language } = useLanguage()
  const isRtl = language === 'ar'

  useEffect(() => {
    fetchPages()
  }, [])

  async function fetchPages() {
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('site_pages').select('*').order('slug')
    
    if (error) {
      console.error('Failed to fetch site pages:', error)
      toast.error('Failed to load pages. Make sure migration 051 is applied.')
    } else if (data) {
      setPages(data)
      if (data.length > 0 && !data.find(p => p.slug === activeSlug)) {
        setActiveSlug(data[0].slug)
      }
    }
    setLoading(false)
  }

  async function handleSave() {
    const activePage = pages.find(p => p.slug === activeSlug)
    if (!activePage) return

    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('site_pages')
      .update({
        title_en: activePage.title_en,
        title_ar: activePage.title_ar,
        content_en: activePage.content_en,
        content_ar: activePage.content_ar,
        updated_at: new Date().toISOString()
      })
      .eq('slug', activeSlug)

    if (error) {
      console.error('Save error:', error)
      toast.error('Failed to save page changes')
    } else {
      toast.success('Page updated successfully')
    }
    setSaving(false)
  }

  function updateActivePage(field: keyof SitePage, value: string) {
    setPages(prev => prev.map(p => {
      if (p.slug === activeSlug) {
        return { ...p, [field]: value }
      }
      return p
    }))
  }

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    )
  }

  const activePage = pages.find(p => p.slug === activeSlug)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">إدارة صفحات الموقع (Site Pages)</h2>
        <p className="mt-1 text-sm text-slate-400">
          تعديل محتوى الصفحات الثابتة مثل سياسة الخصوصية، شروط الخدمة، ومن نحن. تدعم إدخال HTML الأساسي.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar: Page List */}
        <div className="w-full md:w-64 flex-shrink-0 space-y-2">
          {pages.map(p => (
            <button
              key={p.slug}
              onClick={() => setActiveSlug(p.slug)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-right ${
                activeSlug === p.slug 
                  ? 'bg-primary text-white font-medium shadow-md shadow-primary/20' 
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <FileText className={`h-4 w-4 ${activeSlug === p.slug ? 'text-white' : 'text-slate-500'}`} />
              <span className="flex-1 text-left" dir="ltr">{p.slug}</span>
            </button>
          ))}
          {pages.length === 0 && (
            <div className="text-sm text-amber-500 bg-amber-500/10 p-4 rounded-xl border border-amber-500/20">
              لا توجد صفحات. يرجى التأكد من تشغيل ملف التحديث (Migration 051) في قاعدة بيانات Supabase.
            </div>
          )}
        </div>

        {/* Main Editor Area */}
        {activePage && (
          <div className="flex-1 space-y-6 bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Globe className="h-4 w-4 text-emerald-500" />
                تحرير: {activePage.slug}
              </h3>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 bg-primary hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                حفظ التغييرات
              </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              {/* Arabic Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🇸🇦</span>
                  <h4 className="font-medium text-slate-200">النسخة العربية</h4>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">عنوان الصفحة</label>
                  <input
                    type="text"
                    dir="rtl"
                    value={activePage.title_ar}
                    onChange={(e) => updateActivePage('title_ar', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">المحتوى (يدعم HTML)</label>
                  <textarea
                    dir="rtl"
                    rows={12}
                    value={activePage.content_ar}
                    onChange={(e) => updateActivePage('content_ar', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors resize-y"
                    placeholder="يمكنك كتابة النصوص هنا أو استخدام وسوم HTML مثل <b> و <p> و <br>"
                  />
                </div>
              </div>

              {/* English Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🇺🇸</span>
                  <h4 className="font-medium text-slate-200">English Version</h4>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Page Title</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={activePage.title_en}
                    onChange={(e) => updateActivePage('title_en', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Content (HTML supported)</label>
                  <textarea
                    dir="ltr"
                    rows={12}
                    value={activePage.content_en}
                    onChange={(e) => updateActivePage('content_en', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors resize-y"
                    placeholder="You can write text here or use HTML tags like <b>, <p>, <br>"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
