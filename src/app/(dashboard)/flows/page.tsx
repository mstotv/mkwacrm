"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Workflow,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  MessageSquare,
  PlayCircle,
  PauseCircle,
  Archive,
  HelpCircle,
  UserPlus,
  FileText,
} from "lucide-react";

import { useCan } from "@/hooks/use-can";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { GatedButton } from "@/components/ui/gated-button";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Flows list page.
 *
 * Open to every authenticated user. Flows is in soft-GA — the "Beta"
 * chip in the header is the only remaining signal that the surface
 * is new. The previous per-account beta gate was removed in PR #134.
 */

interface FlowRow {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "archived";
  trigger_type: "keyword" | "first_inbound_message" | "manual";
  trigger_config: { keywords?: string[] } | Record<string, unknown>;
  execution_count: number;
  last_executed_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_LABELS: Record<FlowRow["status"], string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
};

const STATUS_COLORS: Record<FlowRow["status"], string> = {
  draft: "border-slate-700 bg-slate-800 text-slate-300",
  active: "border-emerald-600/40 bg-emerald-500/10 text-emerald-300",
  archived: "border-slate-700 bg-slate-800/50 text-slate-500",
};

interface TemplateSummary {
  slug: string;
  name: string;
  description: string;
  icon: "MessageSquare" | "HelpCircle" | "UserPlus";
  trigger_type: string;
  node_count: number;
}

const TEMPLATE_ICONS = {
  MessageSquare,
  HelpCircle,
  UserPlus,
} as const;

export default function FlowsPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const canCreate = useCan("send-messages");
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [flowsRes, tmplRes] = await Promise.all([
          fetch("/api/flows"),
          fetch("/api/flows/templates"),
        ]);
        if (!flowsRes.ok) {
          throw new Error(`Failed to load flows: ${flowsRes.status}`);
        }
        const flowsJson = (await flowsRes.json()) as { flows: FlowRow[] };
        if (!cancelled) setFlows(flowsJson.flows ?? []);
        // Templates endpoint is forward-looking — if it 404s on an
        // older deployment, gracefully fall through.
        if (tmplRes.ok) {
          const tmplJson = (await tmplRes.json()) as {
            templates: TemplateSummary[];
          };
          if (!cancelled) setTemplates(tmplJson.templates ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          toast.error(language === 'ar' ? 'فشل تحميل المسارات التفاعلية.' : "Couldn't load flows.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [language]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          trigger_type: "keyword",
          trigger_config: { keywords: [] },
        }),
      });
      if (!res.ok) throw new Error(`Create failed: ${res.status}`);
      const json = (await res.json()) as { flow: FlowRow };
      setCreateOpen(false);
      setNewName("");
      router.push(`/flows/${json.flow.id}`);
    } catch (err) {
      console.error(err);
      toast.error(language === 'ar' ? 'فشل إنشاء المسار التفاعلي.' : "Couldn't create flow.");
    } finally {
      setCreating(false);
    }
  }

  async function handleUseTemplate(slug: string) {
    setCreating(true);
    try {
      const res = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_slug: slug }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Clone failed: ${res.status}`);
      }
      const json = (await res.json()) as { flow: FlowRow };
      setCreateOpen(false);
      router.push(`/flows/${json.flow.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Clone failed";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(flow: FlowRow) {
    const confirmMsg = language === 'ar'
      ? `هل تريد حذف "${flow.name}"؟ أي تشغيل نشط سينتهي فوراً.`
      : `Delete "${flow.name}"? Any active runs will end immediately.`;
    const yes = window.confirm(confirmMsg);
    if (!yes) return;
    try {
      const res = await fetch(`/api/flows/${flow.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      setFlows((prev) => prev.filter((f) => f.id !== flow.id));
      toast.success(language === 'ar' ? 'تم حذف المسار التفاعلي.' : "Flow deleted.");
    } catch (err) {
      console.error(err);
      toast.error(language === 'ar' ? 'فشل حذف المسار التفاعلي.' : "Couldn't delete flow.");
    }
  }

  const getLocalizedTemplate = (slug: string, originalName: string, originalDesc: string) => {
    if (language === 'ar') {
      switch (slug) {
        case 'welcome':
          return {
            name: 'قائمة ترحيبية',
            description: 'ابدأ بمحادثة ترحيبية تعرض أزرار خيارات للعملاء الجدد.',
          }
        case 'faq':
          return {
            name: 'بوت الأسئلة الشائعة',
            description: 'ساعد العملاء في العثور على إجابات للأسئلة المتكررة عبر أزرار سريعة.',
          }
        case 'routing':
          return {
            name: 'توجيه المحادثات',
            description: 'صنف استفسار العميل ووجهه تلقائياً للقسم أو الموظف الصحيح.',
          }
        default:
          return { name: originalName, description: originalDesc }
      }
    }
    return { name: originalName, description: originalDesc }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-white">
              {language === 'ar' ? 'المسارات التفاعلية' : 'Flows'}
            </h1>
            <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
              Beta
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {language === 'ar'
              ? 'قم ببناء محادثات واتساب تفاعلية تعتمد على أزرار وخيارات التوجيه لتصنيف احتياجات العميل قبل تدخل الموظف.'
              : 'Build branching, button-driven WhatsApp conversations. Useful for menus, FAQs, and triage before a human steps in.'}
          </p>
        </div>
        <GatedButton
          canAct={canCreate}
          gateReason="create flows"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className={`${language === 'ar' ? 'ml-1' : 'mr-1'} h-4 w-4`} />
          {language === 'ar' ? 'مسار جديد' : 'New flow'}
        </GatedButton>
      </header>

      {flows.length === 0 ? (
        <EmptyState
          onCreate={() => setCreateOpen(true)}
          canCreate={canCreate}
          language={language}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flows.map((flow) => (
            <FlowCard
              key={flow.id}
              flow={flow}
              onEdit={() => router.push(`/flows/${flow.id}`)}
              onDelete={() => handleDelete(flow)}
              language={language}
            />
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-4xl bg-slate-900 text-slate-100" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>
          <DialogHeader>
            <DialogTitle className={language === 'ar' ? 'text-right' : 'text-left'}>
              {language === 'ar' ? 'إنشاء مسار تفاعلي جديد' : 'Create a new flow'}
            </DialogTitle>
            <DialogDescription className={`text-slate-400 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
              {language === 'ar' ? 'ابدأ من قالب جاهز أو ابدأ مساراً فارغاً بالكامل.' : 'Start from a template or build from scratch.'}
            </DialogDescription>
          </DialogHeader>

          {templates.length > 0 && (
            <div className="space-y-3">
              <p className={`text-xs uppercase tracking-wide text-slate-500 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                {language === 'ar' ? 'ابدأ من قالب' : 'Start from a template'}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((t) => {
                  const Icon = TEMPLATE_ICONS[t.icon] ?? FileText;
                  const localized = getLocalizedTemplate(t.slug, t.name, t.description)
                  return (
                    <button
                      key={t.slug}
                      type="button"
                      onClick={() => handleUseTemplate(t.slug)}
                      disabled={creating}
                      className={`flex flex-col gap-2.5 rounded-lg border border-slate-800 bg-slate-950 p-4 ${language === 'ar' ? 'text-right' : 'text-left'} transition-colors hover:border-primary/40 hover:bg-slate-800 disabled:opacity-50`}
                    >
                      <Icon className="h-5 w-5 text-primary" />
                      <span className="text-sm font-semibold text-white">
                        {localized.name}
                      </span>
                      <span className="text-xs leading-relaxed text-slate-400">
                        {localized.description}
                      </span>
                      <span className={`mt-auto border-t border-slate-800 pt-2 text-[11px] text-slate-500 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                        {t.node_count} {language === 'ar' ? 'عقدة' : (t.node_count === 1 ? "node" : "nodes")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2 border-t border-slate-800 pt-4">
            <p className={`text-xs uppercase tracking-wide text-slate-500 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
              {language === 'ar' ? 'أو ابدأ بمسار فارغ' : 'Or start blank'}
            </p>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={language === 'ar' ? 'مثال: قائمة الترحيب' : 'e.g. Welcome menu'}
              className={`bg-slate-800 ${language === 'ar' ? 'text-right' : 'text-left'}`}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {language === 'ar' ? 'إنشاء مسار فارغ' : 'Create blank flow'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({
  onCreate,
  canCreate,
  language,
}: {
  onCreate: () => void;
  canCreate: boolean;
  language: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900/50 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800">
        <Workflow className="h-6 w-6 text-slate-500" />
      </div>
      <h2 className="mt-4 text-base font-medium text-white">
        {language === 'ar' ? 'لا توجد مسارات تفاعلية بعد' : 'No flows yet'}
      </h2>
      <p className="mt-1 max-w-md text-sm text-slate-400">
        {language === 'ar'
          ? 'قم ببناء محادثتك الأولى — قائمة ترحيب، استعلام عن الطلب، أو بوت الأسئلة الشائعة. ينقر العملاء على الأزرار ويقوم البوت بتوجيههم للإجابة الصحيحة أو الموظف المناسب.'
          : 'Build your first conversation — a welcome menu, an order lookup, an FAQ bot. Customers tap buttons; the bot routes them to the right answer (or the right agent).'}
      </p>
      <GatedButton
        canAct={canCreate}
        gateReason="create flows"
        onClick={onCreate}
        className="mt-5"
      >
        <Plus className={`${language === 'ar' ? 'ml-1' : 'mr-1'} h-4 w-4`} />
        {language === 'ar' ? 'إنشاء مسارك الأول' : 'Create your first flow'}
      </GatedButton>
    </div>
  );
}

function FlowCard({
  flow,
  onEdit,
  onDelete,
  language,
}: {
  flow: FlowRow;
  onEdit: () => void;
  onDelete: () => void;
  language: string;
}) {
  const triggerSummary = describeTrigger(flow, language);
  const StatusIcon =
    flow.status === "active"
      ? PlayCircle
      : flow.status === "archived"
        ? Archive
        : PauseCircle;
  return (
    <div className="flex flex-col rounded-lg border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-700" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Workflow className="h-4 w-4 shrink-0 text-primary" />
          <h3 className={`truncate text-sm font-semibold text-white ${language === 'ar' ? 'text-right' : 'text-left'}`}>
            {flow.name}
          </h3>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 gap-1 text-[10px]",
            STATUS_COLORS[flow.status],
          )}
        >
          <StatusIcon className="h-3 w-3" />
          {getStatusLabel(flow.status, language)}
        </Badge>
      </div>

      <p className={`mt-2 line-clamp-2 text-xs text-slate-400 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
        {flow.description || triggerSummary}
      </p>

      <div className="mt-4 flex items-center gap-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <MessageSquare className="h-3 w-3" />
          {flow.execution_count} {language === 'ar' ? 'مرات تشغيل' : (flow.execution_count === 1 ? 'run' : 'runs')}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className={`${language === 'ar' ? 'ml-1.5' : 'mr-1.5'} h-3.5 w-3.5`} />
          {language === 'ar' ? 'تعديل' : 'Edit'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
        >
          <Trash2 className={`${language === 'ar' ? 'ml-1.5' : 'mr-1.5'} h-3.5 w-3.5`} />
          {language === 'ar' ? 'حذف' : 'Delete'}
        </Button>
      </div>
    </div>
  );
}

function getStatusLabel(status: string, language: string) {
  if (language === 'ar') {
    switch (status) {
      case 'draft': return 'مسودة'
      case 'active': return 'نشط'
      case 'archived': return 'مؤرشف'
      default: return status
    }
  }
  switch (status) {
    case 'draft': return 'Draft'
    case 'active': return 'Active'
    case 'archived': return 'Archived'
    default: return status
  }
}

function describeTrigger(flow: FlowRow, language: string): string {
  if (flow.trigger_type === "keyword") {
    const keywords = Array.isArray(flow.trigger_config.keywords)
      ? (flow.trigger_config.keywords as string[])
      : [];
    if (keywords.length === 0) return language === 'ar' ? "يتم التشغيل بواسطة كلمة مفتاحية (لم يتم التعيين)" : "Triggers on keyword (none set)";
    return language === 'ar' ? `يتم التشغيل بواسطة: ${keywords.join(", ")}` : `Triggers on: ${keywords.join(", ")}`;
  }
  if (flow.trigger_type === "first_inbound_message") {
    return language === 'ar' ? "يتم التشغيل عند استلام أول رسالة واردة من العميل على الإطلاق" : "Triggers on a contact's first-ever inbound message";
  }
  return language === 'ar' ? "تشغيل يدوي" : "Manual trigger";
}

