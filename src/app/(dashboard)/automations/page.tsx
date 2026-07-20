"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Zap,
  Plus,
  MoreVertical,
  Copy,
  Pencil,
  Trash2,
  FileText,
  MessageCircle,
  Clock,
  Users,
  PhoneCall,
  Loader2,
} from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { useCan } from "@/hooks/use-can"
import { useLanguage } from "@/hooks/use-language"
import type { Automation } from "@/types"
import { Button } from "@/components/ui/button"

import { GatedButton } from "@/components/ui/gated-button"
import { Switch } from "@/components/ui/switch"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AUTOMATION_TEMPLATES, type TemplateSlug } from "@/lib/automations/templates"
import { triggerMeta, formatRelative } from "@/lib/automations/trigger-meta"
import { cn } from "@/lib/utils"

const TEMPLATE_ORDER: TemplateSlug[] = [
  "welcome_message",
  "out_of_office",
  "lead_qualifier",
  "follow_up_reminder",
]

const TEMPLATE_ICON: Record<TemplateSlug, typeof Zap> = {
  welcome_message: MessageCircle,
  out_of_office: Clock,
  lead_qualifier: Users,
  follow_up_reminder: PhoneCall,
}

export default function AutomationsPage() {
  const router = useRouter()
  const { language } = useLanguage()
  const canCreate = useCan("send-messages")
  const [automations, setAutomations] = useState<Automation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Automation | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    try {
      const supabase = createClient()
      const { data, error: fetchErr } = await supabase
        .from("automations")
        .select("*")
        .order("created_at", { ascending: false })
      if (fetchErr) throw fetchErr
      setAutomations((data ?? []) as Automation[])
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === 'ar' ? 'فشل تحميل الأتمتة' : 'Failed to load automations'))
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function toggleActive(a: Automation, next: boolean) {
    // Optimistic flip so the switch feels instant.
    setAutomations((prev) =>
      prev?.map((x) => (x.id === a.id ? { ...x, is_active: next } : x)) ?? prev,
    )
    const res = await fetch(`/api/automations/${a.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_active: next }),
    })
    if (!res.ok) {
      // Roll back on error.
      setAutomations((prev) =>
        prev?.map((x) => (x.id === a.id ? { ...x, is_active: !next } : x)) ?? prev,
      )
      const body = await res.json().catch(() => ({}))
      toast.error(body?.error ?? (language === 'ar' ? 'فشل التحديث' : 'Failed to update'))
      return
    }
    toast.success(
      next
        ? (language === 'ar' ? 'تم تفعيل الأتمتة' : 'Automation activated')
        : (language === 'ar' ? 'تم إيقاف الأتمتة مؤقتاً' : 'Automation paused')
    )
  }

  async function duplicate(a: Automation) {
    const res = await fetch(`/api/automations/${a.id}/duplicate`, { method: "POST" })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body?.error ?? (language === 'ar' ? 'فشل التكرار' : 'Failed to duplicate'))
      return
    }
    toast.success(language === 'ar' ? 'تم تكرار الأتمتة بنجاح' : "Automation duplicated")
    load()
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    const res = await fetch(`/api/automations/${pendingDelete.id}`, { method: "DELETE" })
    setDeleting(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body?.error ?? (language === 'ar' ? 'فشل الحذف' : 'Failed to delete'))
      return
    }
    toast.success(language === 'ar' ? 'تم حذف الأتمتة' : "Automation deleted")
    setPendingDelete(null)
    load()
  }

  async function startFromTemplate(slug: TemplateSlug) {
    router.push(`/automations/new?template=${slug}`)
  }

  const getTemplateDetails = (slug: TemplateSlug) => {
    const details = {
      welcome_message: {
        name: language === 'ar' ? 'رسالة ترحيبية' : 'Welcome Message',
        description: language === 'ar' ? 'رد تلقائي للمراسلات لأول مرة بترحيب لطيف.' : 'Auto-reply to first-time contacts with a greeting.',
      },
      out_of_office: {
        name: language === 'ar' ? 'خارج أوقات العمل' : 'Out of Office',
        description: language === 'ar' ? 'رد تلقائي خارج ساعات العمل لضمان عدم بقاء العميل معلقاً.' : 'Auto-reply during off-hours so nobody is left waiting.',
      },
      lead_qualifier: {
        name: language === 'ar' ? 'تأهيل العملاء المحتملين' : 'Lead Qualifier',
        description: language === 'ar' ? 'اطرح أسئلة تأهيلية لفلترة وتصنيف العملاء الواردين.' : 'Ask qualification questions to filter inbound leads.',
      },
      follow_up_reminder: {
        name: language === 'ar' ? 'تذكير المتابعة' : 'Follow-up Reminder',
        description: language === 'ar' ? 'أرسل نغزة/تنبيه إذا لم يرد جهة الاتصال خلال 24 ساعة.' : 'Send a nudge if a contact has not replied within 24 hours.',
      },
    }
    return details[slug] || AUTOMATION_TEMPLATES[slug];
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>
        <p className="text-sm text-red-400">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {language === 'ar' ? 'إعادة المحاولة' : 'Retry'}
        </Button>
      </div>
    )
  }

  if (automations === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  const showTemplates = automations.length < 3

  return (
    <div className="space-y-6" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {language === 'ar' ? 'الأتمتة والردود' : 'Automations'}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {language === 'ar'
              ? 'أنشئ تدفقات عمل تفاعلية تستجيب تلقائياً لأحداث تطبيق واتساب.'
              : 'Build workflows that react to WhatsApp® events automatically.'}
          </p>
        </div>
        <GatedButton
          canAct={canCreate}
          gateReason="create automations"
          onClick={() => router.push("/automations/new")}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className={`${language === 'ar' ? 'ml-1' : 'mr-1'} h-4 w-4`} />
          {language === 'ar' ? 'إنشاء أتمتة' : 'Create Automation'}
        </GatedButton>
      </div>

      {showTemplates && (
        <section>
          <h2 className={`mb-3 text-sm font-semibold text-slate-300 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
            {language === 'ar' ? 'قوالب جاهزة سريعة البدء' : 'Quick-start templates'}
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {TEMPLATE_ORDER.map((slug) => {
              const details = getTemplateDetails(slug)
              const Icon = TEMPLATE_ICON[slug]
              return (
                <button
                  key={slug}
                  onClick={() => startFromTemplate(slug)}
                  className={`group flex flex-col items-start rounded-xl border border-slate-800 bg-slate-900 p-4 ${language === 'ar' ? 'text-right' : 'text-left'} transition-colors hover:border-primary/50 hover:bg-slate-900/80`}
                >
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/15">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-semibold text-white">{details.name}</div>
                  <p className="mt-1 text-xs text-slate-400">{details.description}</p>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {automations.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-900/40">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <p className="mt-3 text-sm font-medium text-white">{language === 'ar' ? 'لا توجد عمليات أتمتة مضافة بعد' : 'No automations yet'}</p>
          <p className="mt-1 text-xs text-slate-400">
            {language === 'ar' ? 'اختر قالباً جاهزاً من الأعلى أو ابدأ من الصفر.' : 'Pick a template above or create one from scratch.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {automations.map((a) => (
            <AutomationCard
              key={a.id}
              automation={a}
              onToggle={(next) => toggleActive(a, next)}
              onEdit={() => router.push(`/automations/${a.id}/edit`)}
              onDuplicate={() => duplicate(a)}
              onLogs={() => router.push(`/automations/${a.id}/logs`)}
              onDelete={() => setPendingDelete(a)}
              language={language}
            />
          ))}
        </ul>
      )}

      <Dialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <DialogContent style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>
          <DialogHeader>
            <DialogTitle className={language === 'ar' ? 'text-right' : 'text-left'}>
              {language === 'ar' ? 'حذف الأتمتة' : 'Delete automation'}
            </DialogTitle>
            <DialogDescription className={language === 'ar' ? 'text-right' : 'text-left'}>
              {language === 'ar' ? (
                <>
                  سيؤدي هذا إلى حذف الأتمتة{" "}
                  <span className="text-white font-semibold">{pendingDelete?.name}</span> وسجل
                  التشغيل الخاص بها بشكل نهائي. لا يمكن التراجع عن هذا الإجراء.
                </>
              ) : (
                <>
                  This permanently removes{" "}
                  <span className="text-white">{pendingDelete?.name}</span> and its execution
                  history. This cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
            >
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {language === 'ar' ? 'حذف' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AutomationCard({
  automation,
  onToggle,
  onEdit,
  onDuplicate,
  onLogs,
  onDelete,
  language,
}: {
  automation: Automation
  onToggle: (next: boolean) => void
  onEdit: () => void
  onDuplicate: () => void
  onLogs: () => void
  onDelete: () => void
  language: string
}) {
  const meta = triggerMeta(automation.trigger_type)

  const getTriggerLabel = (label: string) => {
    if (language === 'ar') {
      switch (label) {
        case 'New Message': return 'رسالة جديدة'
        case 'First Message from Contact': return 'الرسالة الأولى من جهة الاتصال'
        case 'Keyword Match': return 'مطابقة الكلمات المفتاحية'
        case 'New Contact': return 'جهة اتصال جديدة'
        case 'Conversation Assigned': return 'تعيين المحادثة'
        case 'Tag Added': return 'إضافة وسم'
        case 'Time-Based': return 'مبني على الوقت'
        default: return label
      }
    }
    return label
  }

  const formatRelativeTime = (iso: string | null | undefined) => {
    if (!iso) return language === 'ar' ? 'أبداً' : 'never'
    const then = new Date(iso).getTime()
    if (Number.isNaN(then)) return language === 'ar' ? 'أبداً' : 'never'
    const diffSec = Math.round((Date.now() - then) / 1000)
    if (diffSec < 60) return language === 'ar' ? 'الآن' : 'just now'
    if (diffSec < 3600) return language === 'ar' ? `منذ ${Math.floor(diffSec / 60)} د` : `${Math.floor(diffSec / 60)}m ago`
    if (diffSec < 86400) return language === 'ar' ? `منذ ${Math.floor(diffSec / 3600)} س` : `${Math.floor(diffSec / 3600)}h ago`
    if (diffSec < 2_592_000) return language === 'ar' ? `منذ ${Math.floor(diffSec / 86400)} يوم` : `${Math.floor(diffSec / 86400)}d ago`
    return new Date(iso).toLocaleDateString(language === 'ar' ? 'ar-SA' : undefined)
  }

  return (
    <li className="rounded-xl border border-slate-800 bg-slate-900 transition-colors hover:border-slate-700">
      <div className="flex items-center gap-4 p-4">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10"
          aria-hidden
        >
          <Zap className="h-5 w-5 text-primary" />
        </div>

        <button
          type="button"
          onClick={onEdit}
          className={`min-w-0 flex-1 ${language === 'ar' ? 'text-right' : 'text-left'}`}
        >
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-white">
              {automation.name}
            </span>
            {automation.is_active && (
              <span className="relative flex h-2 w-2" aria-label="active">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
            )}
          </div>
          {automation.description && (
            <p className="mt-0.5 truncate text-xs text-slate-400">{automation.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                meta.pillClass,
              )}
            >
              {getTriggerLabel(meta.label)}
            </span>
            <span className="tabular-nums">
              {automation.execution_count} {language === 'ar' ? 'مرات تشغيل' : (automation.execution_count === 1 ? 'run' : 'runs')}
            </span>
            <span aria-hidden>·</span>
            <span>{language === 'ar' ? 'آخر تشغيل: ' : 'last '}{formatRelativeTime(automation.last_executed_at)}</span>
          </div>
        </button>

        <div className="flex items-center gap-3">
          <Switch
            checked={automation.is_active}
            onCheckedChange={(v) => onToggle(!!v)}
            aria-label={automation.is_active ? "Deactivate" : "Activate"}
          />

          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Open menu"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-white data-[popup-open]:bg-slate-800"
            >
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align={language === 'ar' ? 'start' : 'end'}>
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className={`${language === 'ar' ? 'ml-2' : 'mr-2'} h-4 w-4`} />
                {language === 'ar' ? 'تعديل' : 'Edit'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className={`${language === 'ar' ? 'ml-2' : 'mr-2'} h-4 w-4`} />
                {language === 'ar' ? 'تكرار' : 'Duplicate'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onLogs}>
                <FileText className={`${language === 'ar' ? 'ml-2' : 'mr-2'} h-4 w-4`} />
                {language === 'ar' ? 'عرض السجلات' : 'View Logs'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 className={`${language === 'ar' ? 'ml-2' : 'mr-2'} h-4 w-4`} />
                {language === 'ar' ? 'حذف' : 'Delete'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  )
}

