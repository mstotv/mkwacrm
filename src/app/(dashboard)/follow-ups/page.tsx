'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/hooks/use-language';
import { useCan } from '@/hooks/use-can';
import { toast } from 'sonner';
import {
  Clock,
  CheckCircle,
  XCircle,
  Trash2,
  Calendar,
  User,
  MessageSquare,
  AlertCircle,
  Loader2,
  Check,
  X,
  Search,
  Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface FollowUp {
  id: string;
  account_id: string;
  contact_id: string;
  conversation_id: string;
  reason: string;
  scheduled_at: string;
  status: 'pending' | 'completed' | 'cancelled';
  action_type: 'auto_reminder' | 'notify_owner' | 'both';
  created_at: string;
  contacts?: {
    name: string | null;
    phone: string;
  } | null;
}

export default function FollowUpsPage() {
  const { t, language } = useLanguage();
  const canManage = useCan('send-messages');
  const [followUps, setFollowUps] = useState<FollowUp[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed' | 'cancelled'>('pending');
  const [searchQuery, setSearchQuery] = useState('');

  const [triggeringFollowUps, setTriggeringFollowUps] = useState(false);

  useEffect(() => {
    loadFollowUps();
  }, []);

  const loadFollowUps = async () => {
    try {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from('follow_ups')
        .select(`
          *,
          contacts (
            name,
            phone
          )
        `)
        .order('scheduled_at', { ascending: true });

      if (error) throw error;
      setFollowUps(data as FollowUp[]);
    } catch (err: any) {
      console.error('Failed to load follow-ups:', err);
      toast.error(language === 'ar' ? 'فشل تحميل المتابعات' : 'Failed to load follow-ups');
    } finally {
      setLoading(false);
    }
  };

  const handleRunCron = async () => {
    if (triggeringFollowUps) return;
    try {
      setTriggeringFollowUps(true);
      const res = await fetch('/api/follow-ups/cron');
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(
          language === 'ar'
            ? `تم تشغيل المعالجة بنجاح. المتابعات المرسلة: ${data.processed}`
            : `Follow-ups processed successfully. Dispatched: ${data.processed}`
        );
        // Reload list to see state update
        await loadFollowUps();
      } else {
        throw new Error(data.error || 'Failed to process');
      }
    } catch (err: any) {
      console.error('Error running manual follow-up cron:', err);
      toast.error(language === 'ar' ? 'فشل تشغيل المتابعات المستحقة يدوياً' : 'Failed to manually trigger due follow-ups');
    } finally {
      setTriggeringFollowUps(false);
    }
  };

  const handleUpdateStatus = async (id: string, nextStatus: 'completed' | 'cancelled') => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('follow_ups')
        .update({ status: nextStatus })
        .eq('id', id);

      if (error) throw error;

      toast.success(
        nextStatus === 'completed'
          ? (language === 'ar' ? 'تم تحديد المتابعة كمكتملة' : 'Follow-up marked as completed')
          : (language === 'ar' ? 'تم إلغاء المتابعة بنجاح' : 'Follow-up cancelled successfully')
      );

      setFollowUps(prev =>
        prev ? prev.map(f => (f.id === id ? { ...f, status: nextStatus } : f)) : null
      );
    } catch (err: any) {
      toast.error(err.message || (language === 'ar' ? 'فشل تحديث الحالة' : 'Failed to update status'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(language === 'ar' ? 'هل أنت متأكد من حذف هذه المتابعة نهائياً؟' : 'Are you sure you want to delete this follow-up permanently?')) return;

    try {
      const supabase = createClient();
      const { error } = await supabase.from('follow_ups').delete().eq('id', id);

      if (error) throw error;

      toast.success(language === 'ar' ? 'تم حذف المتابعة بنجاح' : 'Follow-up deleted successfully');
      setFollowUps(prev => (prev ? prev.filter(f => f.id !== id) : null));
    } catch (err: any) {
      toast.error(err.message || (language === 'ar' ? 'فشل حذف المتابعة' : 'Failed to delete follow-up'));
    }
  };

  const filtered = (followUps || []).filter(f => {
    const matchesFilter = filter === 'all' || f.status === filter;
    if (!matchesFilter) return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = f.contacts?.name?.toLowerCase() || '';
    const phone = f.contacts?.phone || '';
    const reason = f.reason.toLowerCase();

    return name.includes(q) || phone.includes(q) || reason.includes(q);
  });

  const getActionTypeBadge = (type: string) => {
    switch (type) {
      case 'auto_reminder':
        return <span className="rounded bg-violet-500/10 px-2 py-0.5 text-xs text-violet-400">
          {language === 'ar' ? 'تذكير تلقائي' : 'Auto Reminder'}
        </span>;
      case 'notify_owner':
        return <span className="rounded bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400">
          {language === 'ar' ? 'تنبيه المالك' : 'Notify Owner'}
        </span>;
      default:
        return <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
          {language === 'ar' ? 'كلاهما' : 'Both'}
        </span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-xs text-amber-400">
            <Clock className="size-3" />
            {language === 'ar' ? 'قيد الانتظار' : 'Pending'}
          </span>
        );
      case 'completed':
        return (
          <span className="flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-0.5 text-xs text-green-400">
            <CheckCircle className="size-3" />
            {language === 'ar' ? 'مكتملة' : 'Completed'}
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-0.5 text-xs text-red-400">
            <XCircle className="size-3" />
            {language === 'ar' ? 'ملغاة' : 'Cancelled'}
          </span>
        );
    }
  };

  const formatDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6" style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {language === 'ar' ? 'المتابعات المجدولة (Follow-ups)' : 'Scheduled Follow-ups'}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {language === 'ar' 
              ? 'إدارة ومتابعة طلبات العملاء الذين طلبوا العودة لاحقاً أو تأجيل اتخاذ القرار.' 
              : 'Manage and track customer requests who asked to be contacted later or postponed decisions.'}
          </p>
        </div>
        {canManage && (
          <Button
            onClick={handleRunCron}
            disabled={triggeringFollowUps}
            className="bg-violet-600 hover:bg-violet-500 text-white gap-2 text-xs h-9 w-fit"
          >
            {triggeringFollowUps ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            {language === 'ar' ? 'تشغيل المتابعات المستحقة الآن' : 'Run Due Follow-ups Now'}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative max-w-sm flex-1">
          <Search className={`absolute ${language === 'ar' ? 'right-3' : 'left-3'} top-1/2 size-4 -translate-y-1/2 text-slate-500`} />
          <input
            type="text"
            placeholder={language === 'ar' ? 'بحث باسم العميل، رقم الهاتف أو السبب...' : 'Search by client name, phone or reason...'}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className={`w-full rounded-lg border border-slate-700 bg-slate-900 py-2 ${language === 'ar' ? 'pr-9 pl-4' : 'pl-9 pr-4'} text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none`}
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {(['pending', 'completed', 'cancelled', 'all'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition ${
                filter === tab
                  ? 'bg-violet-600 border-violet-500 text-white shadow-lg'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {tab === 'pending'
                ? (language === 'ar' ? 'قيد الانتظار' : 'Pending')
                : tab === 'completed'
                  ? (language === 'ar' ? 'مكتملة' : 'Completed')
                  : tab === 'cancelled'
                    ? (language === 'ar' ? 'ملغاة' : 'Cancelled')
                    : (language === 'ar' ? 'الكل' : 'All')}
            </button>
          ))}
        </div>
      </div>

      <Card className="border-slate-800 bg-slate-900/60">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="border-b border-slate-800 bg-slate-950/40 text-xs font-semibold text-slate-400 uppercase">
                <tr>
                  <th className={`px-6 py-4 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                    {language === 'ar' ? 'العميل' : 'Client'}
                  </th>
                  <th className={`px-6 py-4 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                    {language === 'ar' ? 'السبب / التفاصيل' : 'Reason / Details'}
                  </th>
                  <th className={`px-6 py-4 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                    {language === 'ar' ? 'تاريخ المتابعة' : 'Follow-up Date'}
                  </th>
                  <th className="px-6 py-4 text-center">
                    {language === 'ar' ? 'نوع الإشعار' : 'Action Type'}
                  </th>
                  <th className="px-6 py-4 text-center">
                    {language === 'ar' ? 'الحالة' : 'Status'}
                  </th>
                  <th className="px-6 py-4 text-center">
                    {language === 'ar' ? 'الإجراءات' : 'Actions'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.map(followUp => (
                  <tr key={followUp.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className={`px-6 py-4 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                      <div className={`flex items-center gap-3 ${language === 'ar' ? 'justify-start' : ''}`}>
                        <div className="flex size-8 items-center justify-center rounded-full bg-slate-800 text-slate-300">
                          <User className="size-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-white text-xs">
                            {followUp.contacts?.name || (language === 'ar' ? 'عميل واتساب' : 'WhatsApp Client')}
                          </p>
                          <p className="text-[10px] text-slate-500" dir="ltr">
                            {followUp.contacts?.phone || ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className={`px-6 py-4 ${language === 'ar' ? 'text-right' : 'text-left'} text-xs font-medium text-slate-200`}>
                      {followUp.reason}
                    </td>
                    <td className={`px-6 py-4 ${language === 'ar' ? 'text-right' : 'text-left'} text-xs text-slate-400`}>
                      <div className={`flex items-center gap-1.5 ${language === 'ar' ? 'justify-start' : ''}`}>
                        <Calendar className="size-3.5 text-slate-500" />
                        {formatDateTime(followUp.scheduled_at)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {getActionTypeBadge(followUp.action_type)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center">
                        {getStatusBadge(followUp.status)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {followUp.status === 'pending' && canManage && (
                          <>
                            <button
                              onClick={() => handleUpdateStatus(followUp.id, 'completed')}
                              title={language === 'ar' ? 'تحديد كمكتمل' : 'Mark as Completed'}
                              className="flex size-7 items-center justify-center rounded-md border border-green-500/20 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition"
                            >
                              <Check className="size-4" />
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(followUp.id, 'cancelled')}
                              title={language === 'ar' ? 'إلغاء المتابعة' : 'Cancel Follow-up'}
                              className="flex size-7 items-center justify-center rounded-md border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                            >
                              <X className="size-4" />
                            </button>
                          </>
                        )}
                        {canManage && (
                          <button
                            onClick={() => handleDelete(followUp.id)}
                            title={language === 'ar' ? 'حذف' : 'Delete'}
                            className="flex size-7 items-center justify-center rounded-md border border-slate-700 bg-slate-800 text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Clock className="size-12 opacity-20 mb-3" />
              <p className="text-sm">
                {language === 'ar' ? 'لا توجد أي متابعات تطابق هذا الفلتر حالياً' : 'No follow-ups match this filter currently'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
