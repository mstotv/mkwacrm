'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  Check,
  X,
  Loader2,
  FileText,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { templateStatusConfig } from '@/lib/template-status';

interface PendingTemplate {
  id: string;
  name: string;
  category: string;
  language: string;
  header_type: string | null;
  header_content: string | null;
  header_media_url: string | null;
  body_text: string;
  footer_text: string | null;
  buttons: any[] | null;
  created_at: string;
  account_id: string;
  user_id: string;
  // Mapped details
  accountName?: string;
  userName?: string;
  userEmail?: string;
}

export default function PendingTemplatesPage() {
  const supabase = createClient();
  const { profile, loading: authLoading } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<PendingTemplate[]>([]);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (profile?.platform_role !== 'super_admin' && profile?.platform_role !== 'assistant_admin') {
      setLoading(false);
      return;
    }
    loadPendingTemplates();
  }, [authLoading, profile]);

  async function loadPendingTemplates() {
    try {
      setLoading(true);
      
      const { data: tempRows, error } = await supabase
        .from('message_templates')
        .select('*')
        .eq('status', 'PENDING_REVIEW')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!tempRows || tempRows.length === 0) {
        setTemplates([]);
        return;
      }

      // Fetch accounts and profiles in parallel
      const accountIds = Array.from(new Set(tempRows.map(r => r.account_id).filter(Boolean)));
      const userIds = Array.from(new Set(tempRows.map(r => r.user_id).filter(Boolean)));

      const [accountsRes, profilesRes] = await Promise.all([
        accountIds.length > 0
          ? supabase.from('accounts').select('id, name').in('id', accountIds)
          : Promise.resolve({ data: [] }),
        userIds.length > 0
          ? supabase.from('profiles').select('user_id, full_name, email').in('user_id', userIds)
          : Promise.resolve({ data: [] }),
      ]);

      const accountsMap = new Map(accountsRes.data?.map(a => [a.id, a.name]) || []);
      const profilesMap = new Map(profilesRes.data?.map(p => [p.user_id, p]) || []);

      const mapped: PendingTemplate[] = tempRows.map(row => {
        const profileInfo = profilesMap.get(row.user_id) as any;
        return {
          ...row,
          accountName: accountsMap.get(row.account_id) || 'حساب غير معروف',
          userName: profileInfo?.full_name || 'مستخدم غير معروف',
          userEmail: profileInfo?.email || '',
        };
      });

      setTemplates(mapped);
    } catch (err) {
      console.error('Error fetching pending templates:', err);
      toast.error('حدث خطأ أثناء تحميل القوالب المعلقة');
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(id: string, action: 'approve' | 'reject') {
    if (processingId) return;
    try {
      setProcessingId(id);
      
      const res = await fetch(`/api/admin/templates/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          reason: action === 'reject' ? rejectReason : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'فشلت عملية المراجعة');
      }

      toast.success(
        action === 'approve'
          ? 'تمت الموافقة على القالب وتفعيله بنجاح!'
          : 'تم رفض القالب وإعادته للمستخدم.'
      );

      // Reset states
      setRejectId(null);
      setRejectReason('');
      
      // Reload template list
      await loadPendingTemplates();
    } catch (err: any) {
      console.error('Review error:', err);
      toast.error(err.message || 'فشلت عملية المراجعة');
    } finally {
      setProcessingId(null);
    }
  }

  if (loading || authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-500">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-violet-400 mx-auto" />
          <p className="mt-2 text-xs">جاري تحميل القوالب المعلقة...</p>
        </div>
      </div>
    );
  }

  const isPlatformAdmin =
    profile?.platform_role === 'super_admin' ||
    profile?.platform_role === 'assistant_admin';

  if (!isPlatformAdmin) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 p-8 text-center text-white">
        <div className="max-w-md space-y-4 rounded-2xl border border-red-900/40 bg-red-950/20 p-6">
          <AlertTriangle className="h-10 w-10 text-red-500 mx-auto" />
          <h2 className="text-lg font-bold">غير مسموح بالدخول</h2>
          <p className="text-xs text-slate-400">
            هذه الصفحة مخصصة لمدراء المنصة فقط. ليس لديك الصلاحيات اللازمة للوصول إليها.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-5xl text-white">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6 text-violet-400" /> قوالب الرسائل المعلقة للمراجعة
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          مراجعة والموافقة على قوالب الرسائل المرسلة من العملاء لتفعيلها على خادم Evolution API
        </p>
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-slate-800 bg-slate-900/30">
          <FileText className="h-12 w-12 text-slate-700 mb-3" />
          <p className="text-slate-400 font-medium">لا توجد قوالب معلقة بانتظار المراجعة</p>
          <p className="text-xs text-slate-500 mt-1">قوالب الرسائل الجديدة ستظهر هنا فور إرسالها من المستخدمين.</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {templates.map((template) => (
            <div
              key={template.id}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-6 relative overflow-hidden"
            >
              {/* Tenant context header */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-violet-400 bg-violet-600/10 px-2 py-0.5 rounded border border-violet-600/20">
                      الحساب: {template.accountName}
                    </span>
                    <span className="text-xs text-slate-400">
                      بواسطة: {template.userName} ({template.userEmail})
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <h3 className="text-base font-bold text-white">{template.name}</h3>
                    <span className="text-xs text-slate-500 uppercase font-mono">{template.language}</span>
                    <span className="text-xs bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded px-1.5 py-0.2">
                      {template.category}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-slate-500">
                  تاريخ الإرسال: {new Date(template.created_at).toLocaleDateString('ar-EG', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>

              {/* Template Preview Box */}
              <div className="space-y-3 p-4 rounded-xl bg-slate-950/40 border border-slate-800 text-sm">
                {/* Header preview */}
                {template.header_type === 'text' && template.header_content && (
                  <div className="font-bold text-white border-b border-slate-800/50 pb-2">
                    {template.header_content}
                  </div>
                )}
                {template.header_type && template.header_type !== 'text' && template.header_media_url && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/20 p-2 rounded border border-slate-700/30">
                    <ExternalLink className="h-3 w-3" />
                    <span>مرفق ({template.header_type}):</span>
                    <a
                      href={template.header_media_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-400 hover:underline break-all"
                    >
                      {template.header_media_url}
                    </a>
                  </div>
                )}

                {/* Body Text */}
                <div className="text-slate-200 whitespace-pre-wrap leading-relaxed py-1">
                  {template.body_text}
                </div>

                {/* Footer Text */}
                {template.footer_text && (
                  <div className="text-xs text-slate-500 border-t border-slate-800/50 pt-2 italic">
                    {template.footer_text}
                  </div>
                )}

                {/* Buttons Preview */}
                {template.buttons && template.buttons.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800/50">
                    {template.buttons.map((btn, bIdx) => (
                      <span
                        key={bIdx}
                        className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-1 text-slate-300 flex items-center gap-1"
                      >
                        {btn.type === 'QUICK_REPLY' && '↩️'}
                        {btn.type === 'URL' && '🔗'}
                        {btn.type === 'PHONE_NUMBER' && '📞'}
                        {btn.type === 'COPY_CODE' && '📋'}
                        {btn.text}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Review Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                {rejectId === template.id ? (
                  <div className="flex-1 flex gap-2 items-center">
                    <input
                      type="text"
                      placeholder="أدخل سبب الرفض هنا..."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:border-red-500 focus:outline-none"
                    />
                    <button
                      onClick={() => handleReview(template.id, 'reject')}
                      disabled={processingId === template.id}
                      className="rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2 text-xs font-bold text-white flex items-center gap-1"
                    >
                      {processingId === template.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                      تأكيد الرفض
                    </button>
                    <button
                      onClick={() => {
                        setRejectId(null);
                        setRejectReason('');
                      }}
                      className="rounded-lg bg-slate-800 hover:bg-slate-750 px-3 py-2 text-xs font-bold text-slate-300"
                    >
                      إلغاء
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => setRejectId(template.id)}
                      disabled={processingId === template.id}
                      className="rounded-lg border border-red-900/50 hover:bg-red-950/20 px-4 py-2 text-xs font-bold text-red-400 transition"
                    >
                      رفض القالب
                    </button>
                    <button
                      onClick={() => handleReview(template.id, 'approve')}
                      disabled={processingId === template.id}
                      className="rounded-lg bg-violet-600 hover:bg-violet-500 px-5 py-2 text-xs font-bold text-white flex items-center gap-1.5 transition shadow-lg shadow-violet-600/10"
                    >
                      {processingId === template.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      الموافقة وتفعيل القالب
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
