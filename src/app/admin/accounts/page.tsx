'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Search,
  UserCheck,
  UserX,
  Plus,
  Pencil,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Trash2,
  Crown,
} from 'lucide-react';
import { toast } from 'sonner';

interface Account {
  id: string;
  name: string;
  created_at: string;
  is_blocked: boolean;
  owner_email: string;
  owner_name: string;
  owner_user_id: string;
  platform_role: string;
  plan_id?: string;
  plan_name?: string;
  plan_display_name?: string;
  current_period_end?: string;
}

interface Plan {
  id: string;
  name: string;
  display_name: string;
}

export default function AdminAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Manual Creation dialog states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createOwner, setCreateOwner] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createPlan, setCreatePlan] = useState('');
  const [createPeriod, setCreatePeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [creating, setCreating] = useState(false);

  // Edit Plan dialog states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editPlanId, setEditPlanId] = useState('');
  const [editPeriodEnd, setEditPeriodEnd] = useState('');
  const [updatingPlan, setUpdatingPlan] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    loadPlans();
    loadAccounts();
  }, []);

  async function loadPlans() {
    const { data } = await supabase.from('subscription_plans').select('id, name, display_name');
    if (data) {
      setPlans(data);
      if (data.length > 0) setCreatePlan(data[0].id);
    }
  }

  async function loadAccounts() {
    try {
      setLoading(true);
      // Fetch accounts and join with profiles and account subscriptions
      const { data, error } = await supabase
        .from('accounts')
        .select(`
          id,
          name,
          created_at,
          is_blocked,
          profiles!profiles_account_id_fkey(user_id, email, full_name, platform_role, account_role),
          subscription:account_subscriptions(
            plan_id,
            status,
            current_period_end,
            plan:subscription_plans(name, display_name)
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mapped: Account[] = (data || []).map((a: any) => {
        const profilesArr = Array.isArray(a.profiles) ? a.profiles : [];
        const owner = profilesArr.find((p: any) => p.account_role === 'owner') || profilesArr[0];
        const sub = Array.isArray(a.subscription) ? a.subscription[0] : a.subscription;
        
        return {
          id: a.id,
          name: a.name,
          created_at: a.created_at,
          is_blocked: a.is_blocked || false,
          owner_email: owner?.email || 'غير محدد',
          owner_name: owner?.full_name || 'غير معروف',
          owner_user_id: owner?.user_id || '',
          platform_role: owner?.platform_role || 'user',
          plan_id: sub?.plan_id,
          plan_name: sub?.plan?.name,
          plan_display_name: sub?.plan?.display_name || 'Free',
          current_period_end: sub?.current_period_end,
        };
      });

      setAccounts(mapped);
    } catch (err: any) {
      toast.error('حدث خطأ في تحميل الحسابات');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleToggleBlock = async (account: Account) => {
    try {
      const nextStatus = !account.is_blocked;
      const { error } = await supabase
        .from('accounts')
        .update({ is_blocked: nextStatus })
        .eq('id', account.id);

      if (error) throw error;

      setAccounts(prev =>
        prev.map(a => (a.id === account.id ? { ...a, is_blocked: nextStatus } : a))
      );
      toast.success(nextStatus ? 'تم حظر الحساب بنجاح' : 'تم إلغاء حظر الحساب بنجاح');
    } catch (err: any) {
      toast.error('فشل تغيير حالة الحظر للحساب');
    }
  };

  const handleTogglePlatformRole = async (account: Account) => {
    if (!account.owner_user_id) return;
    try {
      const nextRole = account.platform_role === 'assistant_admin' ? 'user' : 'assistant_admin';
      
      const { error } = await supabase
        .from('profiles')
        .update({ platform_role: nextRole })
        .eq('user_id', account.owner_user_id);

      if (error) throw error;

      setAccounts(prev =>
        prev.map(a => (a.id === account.id ? { ...a, platform_role: nextRole } : a))
      );
      toast.success(
        nextRole === 'assistant_admin'
          ? 'تم ترقية المستخدم إلى مساعد أدمن'
          : 'تم إلغاء صلاحية المساعد عن المستخدم'
      );
    } catch (err: any) {
      toast.error('حدث خطأ في تحديث صلاحيات المنصة للمالك');
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName || !createOwner || !createEmail || !createPassword || !createPlan) {
      toast.error('الرجاء إدخال الحقول المطلوبة');
      return;
    }

    try {
      setCreating(true);
      const res = await fetch('/api/admin/accounts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName,
          ownerName: createOwner,
          email: createEmail,
          password: createPassword,
          planId: createPlan,
          billingPeriod: createPeriod,
        }),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to create account');

      toast.success('تم إنشاء الحساب والمشترك بنجاح!');
      setShowCreateModal(false);
      // Reset fields
      setCreateName('');
      setCreateOwner('');
      setCreateEmail('');
      setCreatePassword('');
      loadAccounts();
    } catch (err: any) {
      toast.error('فشل إنشاء الحساب: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  const openEditPlan = (account: Account) => {
    setEditingAccount(account);
    setEditPlanId(account.plan_id || '');
    if (account.current_period_end) {
      // Format as YYYY-MM-DD
      const dateStr = new Date(account.current_period_end).toISOString().split('T')[0];
      setEditPeriodEnd(dateStr);
    } else {
      setEditPeriodEnd('');
    }
    setShowEditModal(true);
  };

  const handleUpdatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount || !editPlanId) return;

    try {
      setUpdatingPlan(true);
      const formattedDate = editPeriodEnd
        ? new Date(editPeriodEnd).toISOString()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      // Use the API route with service_role key to bypass RLS
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_plan',
          accountId: editingAccount.id,
          planId: editPlanId,
          expiresAt: formattedDate,
          targetUserId: editingAccount.owner_user_id,
          targetEmail: editingAccount.owner_email,
        }),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to update plan');

      toast.success('تم تحديث خطة الاشتراك بنجاح');
      setShowEditModal(false);
      loadAccounts();
    } catch (err: any) {
      toast.error('حدث خطأ أثناء تعديل الاشتراك: ' + (err.message || ''));
      console.error('Update plan error:', err);
    } finally {
      setUpdatingPlan(false);
    }
  };

  const filtered = accounts.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.owner_email.toLowerCase().includes(search.toLowerCase()) ||
      a.owner_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">الحسابات والعملاء</h1>
          <p className="mt-1 text-sm text-slate-400">إدارة حسابات المشتركين وحظرهم وتعديل خططهم</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-lg bg-violet-650 hover:bg-violet-600 px-4 py-2 text-sm font-medium text-white transition shadow-lg"
        >
          <Plus className="h-4.5 w-4.5" /> إضافة حساب جديد
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="بحث بالاسم، اسم المالك أو الإيميل..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
        />
      </div>

      {/* Accounts Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <table className="w-full text-sm text-right">
          <thead>
            <tr className="border-b border-slate-800 text-slate-450 bg-slate-950/20">
              <th className="px-6 py-4 text-xs font-semibold uppercase">اسم الحساب</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase">المالك</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase">خطة الاشتراك</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase">نهاية الاشتراك</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase">الحالة</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase">تاريخ الانضمام</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase">الصلاحية</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase text-left">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-850">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-16 text-center text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin text-violet-400 mx-auto" />
                  <p className="mt-2 text-xs">جاري التحميل...</p>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-500">
                  لا توجد حسابات مسجلة بعد.
                </td>
              </tr>
            ) : (
              filtered.map((account) => (
                <tr
                  key={account.id}
                  className={`hover:bg-slate-800/40 transition-colors ${
                    account.is_blocked ? 'bg-red-950/10 text-slate-400' : ''
                  }`}
                >
                  <td className="px-6 py-4">
                    <p className={`font-semibold ${account.is_blocked ? 'line-through' : 'text-white'}`}>
                      {account.name}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5 font-mono">{account.id.slice(0, 13)}...</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-slate-200">{account.owner_name}</p>
                    <p className="text-xs text-slate-500 font-mono">{account.owner_email}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="rounded-full bg-slate-800 border border-slate-700 px-2.5 py-1 text-xs text-slate-300">
                      {account.plan_display_name}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-300 font-mono text-xs">
                    {account.current_period_end
                      ? new Date(account.current_period_end).toLocaleDateString('ar-IQ')
                      : 'Free / غير محدد'}
                  </td>
                  <td className="px-6 py-4">
                    {account.is_blocked ? (
                      <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
                        <UserX className="h-3.5 w-3.5" />
                        محظور
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                        <UserCheck className="h-3.5 w-3.5" />
                        نشط
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-xs">
                    {new Date(account.created_at).toLocaleDateString('ar-IQ')}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                        account.platform_role === 'super_admin'
                          ? 'bg-violet-500/10 text-violet-400 border-violet-500/20'
                          : account.platform_role === 'assistant_admin'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {account.platform_role === 'super_admin'
                        ? 'سوبر أدمن'
                        : account.platform_role === 'assistant_admin'
                        ? 'مساعد أدمن'
                        : 'مستخدم'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-1.5">
                      {/* Edit subscription */}
                      <button
                        onClick={() => openEditPlan(account)}
                        className="rounded-lg p-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white transition"
                        title="تعديل خطة الاشتراك"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>

                      {/* Toggle Assistant status */}
                      {account.platform_role !== 'super_admin' ? (
                        <button
                          onClick={() => handleTogglePlatformRole(account)}
                          className={`rounded-lg p-1.5 transition ${
                            account.platform_role === 'assistant_admin'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white'
                          }`}
                          title={
                            account.platform_role === 'assistant_admin'
                              ? 'إلغاء كمساعد أدمن'
                              : 'ترقية كمساعد أدمن (للرد على التذاكر)'
                          }
                        >
                          {account.platform_role === 'assistant_admin' ? (
                            <ShieldAlert className="h-3.5 w-3.5" />
                          ) : (
                            <ShieldCheck className="h-3.5 w-3.5" />
                          )}
                        </button>
                      ) : (
                        <div className="w-8 h-8 flex items-center justify-center text-violet-400 bg-violet-950/20 border border-violet-800/30 rounded-lg" title="سوبر أدمن">
                          <Crown className="w-3.5 h-3.5" />
                        </div>
                      )}

                      {/* Block/Unblock toggle */}
                      <button
                        onClick={() => handleToggleBlock(account)}
                        className={`rounded-lg p-1.5 transition ${
                          account.is_blocked
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20'
                        }`}
                        title={account.is_blocked ? 'إلغاء الحظر' : 'حظر الحساب'}
                      >
                        {account.is_blocked ? (
                          <UserCheck className="h-3.5 w-3.5" />
                        ) : (
                          <UserX className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* CREATE NEW ACCOUNT MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold mb-4">إنشاء حساب مستخدم ومشترك جديد</h3>
            
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">اسم الشركة / الحساب</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: شركة الرواد للتجارة"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full rounded-xl border border-slate-750 bg-slate-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">اسم المالك</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: أحمد علي"
                  value={createOwner}
                  onChange={(e) => setCreateOwner(e.target.value)}
                  className="w-full rounded-xl border border-slate-750 bg-slate-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">البريد الإلكتروني للمالك</label>
                <input
                  type="email"
                  required
                  placeholder="owner@example.com"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-750 bg-slate-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">كلمة المرور للمالك</label>
                <input
                  type="password"
                  required
                  placeholder="********"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-750 bg-slate-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">الباقة / الخطة</label>
                  <select
                    value={createPlan}
                    onChange={(e) => setCreatePlan(e.target.value)}
                    className="w-full rounded-xl border border-slate-750 bg-slate-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                  >
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">مدة الاشتراك</label>
                  <select
                    value={createPeriod}
                    onChange={(e) => setCreatePeriod(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-750 bg-slate-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                  >
                    <option value="monthly">شهري (30 يوم)</option>
                    <option value="yearly">سنوي (365 يوم)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg bg-slate-800 hover:bg-slate-750 px-4 py-2 text-sm text-slate-300 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex items-center gap-1.5 rounded-lg bg-violet-650 hover:bg-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-lg transition disabled:bg-slate-800 disabled:text-slate-500"
                >
                  {creating ? 'جاري الإنشاء...' : 'تأكيد الإنشاء'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PLAN MODAL */}
      {showEditModal && editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold mb-1">تعديل اشتراك الحساب</h3>
            <p className="text-xs text-slate-400 mb-4">الشركة: {editingAccount.name}</p>
            
            <form onSubmit={handleUpdatePlan} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">باقة الاشتراك</label>
                <select
                  value={editPlanId}
                  onChange={(e) => setEditPlanId(e.target.value)}
                  className="w-full rounded-xl border border-slate-750 bg-slate-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">تاريخ نهاية الاشتراك</label>
                <input
                  type="date"
                  required
                  value={editPeriodEnd}
                  onChange={(e) => setEditPeriodEnd(e.target.value)}
                  className="w-full rounded-xl border border-slate-750 bg-slate-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="rounded-lg bg-slate-800 hover:bg-slate-750 px-4 py-2 text-sm text-slate-300 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={updatingPlan}
                  className="flex items-center gap-1.5 rounded-lg bg-violet-650 hover:bg-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-lg transition disabled:bg-slate-800 disabled:text-slate-500"
                >
                  {updatingPlan ? 'جاري التعديل...' : 'تحديث الاشتراك'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
