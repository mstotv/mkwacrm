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
  X,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { useAdminLanguage } from '@/contexts/admin-language-provider';

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

const localDict = {
  ar: {
    title: 'الحسابات والوكالات',
    desc: 'إدارة حسابات المنصة وإنشاء حسابات جديدة بشكل يدوي.',
    searchPlaceholder: 'ابحث عن حساب...',
    createAccount: 'إنشاء حساب يدوي',
    totalAccounts: 'إجمالي الحسابات',
    activeAccounts: 'الحسابات النشطة',
    blockedAccounts: 'الحسابات المحظورة',
    loading: 'جاري التحميل...',
    noAccounts: 'لم يتم العثور على حسابات.',
    accountName: 'اسم الحساب / الوكالة',
    ownerInfo: 'المالك',
    planAndRole: 'الخطة والدور',
    statusAndDate: 'الحالة وتاريخ الإنشاء',
    actions: 'إجراءات',
    admin: 'مساعد أدمن',
    user: 'مستخدم عادي',
    freePlan: 'خطة مجانية',
    activeSub: 'نشط',
    expiredSub: 'مُعطل',
    createTitle: 'إنشاء حساب جديد وتفعيل اشتراك',
    accNameLabel: 'اسم الوكالة/الحساب',
    ownerNameLabel: 'اسم المالك',
    emailLabel: 'البريد الإلكتروني للمالك',
    passLabel: 'كلمة المرور',
    planLabel: 'الخطة والاشتراك',
    durationLabel: 'مدة الاشتراك',
    monthly: 'شهري (30 يوم)',
    yearly: 'سنوي (365 يوم)',
    cancel: 'إلغاء',
    createBtn: 'إنشاء وتفعيل',
    creating: 'جاري الإنشاء...',
    editPlanTitle: 'تعديل الخطة والاشتراك',
    expiresAt: 'تاريخ الانتهاء',
    savePlan: 'حفظ التعديلات',
    saving: 'جاري الحفظ...',
    toastLoadErr: 'حدث خطأ في تحميل الحسابات',
    toastBlockOk: 'تم حظر الحساب بنجاح',
    toastUnblockOk: 'تم إلغاء حظر الحساب بنجاح',
    toastRoleAdmin: 'تم ترقية المستخدم إلى مساعد أدمن',
    toastRoleUser: 'تم إلغاء صلاحية المساعد عن المستخدم',
    toastRoleErr: 'حدث خطأ في تحديث صلاحيات المنصة للمالك',
    toastCreateErrReq: 'الرجاء إدخال الحقول المطلوبة',
    toastCreateOk: 'تم إنشاء الحساب والمشترك بنجاح!',
    toastCreateFail: 'فشل إنشاء الحساب: ',
    toastUpdateOk: 'تم تحديث خطة الحساب بنجاح!',
    toastUpdateFail: 'حدث خطأ أثناء تعديل خطة الحساب',
    blockAcc: 'حظر / إلغاء حظر الحساب',
    editPlan: 'تعديل خطة الحساب',
    toggleAdmin: 'ترقية / سحب صلاحيات الأدمن المساعد',
  },
  en: {
    title: 'Accounts & Agencies',
    desc: 'Manage platform accounts and manually create new ones.',
    searchPlaceholder: 'Search for an account...',
    createAccount: 'Manual Create Account',
    totalAccounts: 'Total Accounts',
    activeAccounts: 'Active Accounts',
    blockedAccounts: 'Blocked Accounts',
    loading: 'Loading...',
    noAccounts: 'No accounts found.',
    accountName: 'Account / Agency Name',
    ownerInfo: 'Owner',
    planAndRole: 'Plan & Role',
    statusAndDate: 'Status & Date',
    actions: 'Actions',
    admin: 'Asst. Admin',
    user: 'Normal User',
    freePlan: 'Free Plan',
    activeSub: 'Active',
    expiredSub: 'Blocked',
    createTitle: 'Create New Account & Subscription',
    accNameLabel: 'Agency/Account Name',
    ownerNameLabel: 'Owner Name',
    emailLabel: 'Owner Email',
    passLabel: 'Password',
    planLabel: 'Plan & Subscription',
    durationLabel: 'Subscription Duration',
    monthly: 'Monthly (30 days)',
    yearly: 'Yearly (365 days)',
    cancel: 'Cancel',
    createBtn: 'Create & Activate',
    creating: 'Creating...',
    editPlanTitle: 'Edit Account Plan',
    expiresAt: 'Expiration Date',
    savePlan: 'Save Changes',
    saving: 'Saving...',
    toastLoadErr: 'Failed to load accounts',
    toastBlockOk: 'Account blocked successfully',
    toastUnblockOk: 'Account unblocked successfully',
    toastRoleAdmin: 'User promoted to Assistant Admin',
    toastRoleUser: 'User demoted to Normal User',
    toastRoleErr: 'Failed to update platform role',
    toastCreateErrReq: 'Please fill all required fields',
    toastCreateOk: 'Account and subscription created successfully!',
    toastCreateFail: 'Failed to create account: ',
    toastUpdateOk: 'Account plan updated successfully!',
    toastUpdateFail: 'Failed to edit account plan',
    blockAcc: 'Block / Unblock Account',
    editPlan: 'Edit Account Plan',
    toggleAdmin: 'Toggle Assistant Admin Role',
  }
};

export default function AdminAccountsPage() {
  const { lang, dir } = useAdminLanguage();
  const t = localDict[lang];

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
          owner_email: owner?.email || (lang === 'ar' ? 'غير محدد' : 'Unknown'),
          owner_name: owner?.full_name || (lang === 'ar' ? 'غير معروف' : 'Unknown'),
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
      toast.error(t.toastLoadErr);
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
      toast.success(nextStatus ? t.toastBlockOk : t.toastUnblockOk);
    } catch (err: any) {
      toast.error(t.toastLoadErr);
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
      toast.success(nextRole === 'assistant_admin' ? t.toastRoleAdmin : t.toastRoleUser);
    } catch (err: any) {
      toast.error(t.toastRoleErr);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName || !createOwner || !createEmail || !createPassword || !createPlan) {
      toast.error(t.toastCreateErrReq);
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

      toast.success(t.toastCreateOk);
      setShowCreateModal(false);
      setCreateName('');
      setCreateOwner('');
      setCreateEmail('');
      setCreatePassword('');
      loadAccounts();
    } catch (err: any) {
      toast.error(t.toastCreateFail + err.message);
    } finally {
      setCreating(false);
    }
  };

  const openEditPlan = (account: Account) => {
    setEditingAccount(account);
    setEditPlanId(account.plan_id || '');
    if (account.current_period_end) {
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

      toast.success(t.toastUpdateOk);
      setShowEditModal(false);
      loadAccounts();
    } catch (err: any) {
      toast.error(t.toastUpdateFail);
    } finally {
      setUpdatingPlan(false);
    }
  };

  const filtered = accounts.filter(a => {
    const s = search.toLowerCase();
    return a.name.toLowerCase().includes(s) || a.owner_email.toLowerCase().includes(s);
  });

  return (
    <div className="p-8 space-y-6" dir={dir}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t.title}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t.desc}</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition"
        >
          <Plus className="h-4 w-4" /> {t.createAccount}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative flex-1 w-full max-w-md">
          <Search className={`absolute ${dir === 'rtl' ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400`} />
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-2 ${dir === 'rtl' ? 'pr-9 pl-4' : 'pl-9 pr-4'} text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500`}
          />
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto overflow-x-auto text-sm text-slate-600 dark:text-slate-400">
          <div className="bg-slate-100 dark:bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 whitespace-nowrap">
            {t.totalAccounts} <span className="font-bold text-slate-900 dark:text-white ml-1 mr-1">{accounts.length}</span>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-500/20 whitespace-nowrap">
            {t.activeAccounts} <span className="font-bold">{accounts.filter(a => !a.is_blocked).length}</span>
          </div>
          <div className="bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-500/20 whitespace-nowrap">
            {t.blockedAccounts} <span className="font-bold">{accounts.filter(a => a.is_blocked).length}</span>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-950/40 text-xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className={`px-6 py-4 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>{t.accountName}</th>
                <th className={`px-6 py-4 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>{t.ownerInfo}</th>
                <th className={`px-6 py-4 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>{t.planAndRole}</th>
                <th className={`px-6 py-4 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>{t.statusAndDate}</th>
                <th className={`px-6 py-4 ${dir === 'rtl' ? 'text-left' : 'text-right'}`}>{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-violet-500 mx-auto" />
                    <p className="mt-2 text-slate-500">{t.loading}</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                    {t.noAccounts}
                  </td>
                </tr>
              ) : (
                filtered.map((acc) => (
                  <tr key={acc.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className={`px-6 py-4 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 dark:text-white">{acc.name}</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">{acc.id.substring(0,8)}...</span>
                      </div>
                    </td>
                    <td className={`px-6 py-4 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
                      <div className="flex flex-col">
                        <span className="text-sm text-slate-800 dark:text-slate-200">{acc.owner_name}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{acc.owner_email}</span>
                      </div>
                    </td>
                    <td className={`px-6 py-4 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
                      <div className="flex flex-col gap-1.5 items-start">
                        {acc.plan_id ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 ring-1 ring-inset ring-violet-200 dark:ring-violet-500/20">
                            {acc.plan_display_name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {t.freePlan}
                          </span>
                        )}
                        <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${acc.platform_role === 'assistant_admin' ? 'bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400' : 'text-slate-500'}`}>
                          {acc.platform_role === 'assistant_admin' ? t.admin : t.user}
                        </span>
                      </div>
                    </td>
                    <td className={`px-6 py-4 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
                      <div className="flex flex-col gap-1.5 items-start">
                        {acc.is_blocked ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400">
                            <ShieldAlert className="h-3 w-3" /> {t.expiredSub}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                            <ShieldCheck className="h-3 w-3" /> {t.activeSub}
                          </span>
                        )}
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          {new Date(acc.created_at).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                        </div>
                      </div>
                    </td>
                    <td className={`px-6 py-4 ${dir === 'rtl' ? 'text-left' : 'text-right'}`}>
                      <div className={`flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ${dir === 'rtl' ? 'justify-start' : 'justify-end'}`}>
                        {/* Toggle Admin Role */}
                        {acc.platform_role !== 'super_admin' && (
                           <button
                             onClick={() => handleTogglePlatformRole(acc)}
                             className={`p-1.5 rounded transition ${
                               acc.platform_role === 'assistant_admin'
                                 ? 'bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-500/20'
                                 : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-indigo-400 dark:hover:text-indigo-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                             }`}
                             title={t.toggleAdmin}
                           >
                             <Crown className="h-4 w-4" />
                           </button>
                        )}
                        
                        {/* Edit Plan */}
                        <button
                          onClick={() => openEditPlan(acc)}
                          className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded transition"
                          title={t.editPlan}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>

                        {/* Block/Unblock */}
                        <button
                          onClick={() => handleToggleBlock(acc)}
                          className={`p-1.5 rounded transition ${
                            acc.is_blocked 
                              ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-500/20' 
                              : 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-500/20'
                          }`}
                          title={t.blockAcc}
                        >
                          {acc.is_blocked ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl relative">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="h-5 w-5 text-violet-500" /> {t.createTitle}
              </h2>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateAccount} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{t.accNameLabel}</label>
                <input
                  type="text"
                  required
                  value={createName}
                  onChange={e => setCreateName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none"
                  placeholder="e.g. Acme Agency"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{t.ownerNameLabel}</label>
                  <input
                    type="text"
                    required
                    value={createOwner}
                    onChange={e => setCreateOwner(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{t.emailLabel}</label>
                  <input
                    type="email"
                    required
                    value={createEmail}
                    onChange={e => setCreateEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none"
                    dir="ltr"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{t.passLabel}</label>
                <input
                  type="password"
                  required
                  value={createPassword}
                  onChange={e => setCreatePassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none"
                  dir="ltr"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{t.planLabel}</label>
                  <select
                    value={createPlan}
                    onChange={e => setCreatePlan(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none"
                  >
                    {plans.map(p => (
                      <option key={p.id} value={p.id}>{p.display_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{t.durationLabel}</label>
                  <select
                    value={createPeriod}
                    onChange={e => setCreatePeriod(e.target.value as 'monthly'|'yearly')}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none"
                  >
                    <option value="monthly">{t.monthly}</option>
                    <option value="yearly">{t.yearly}</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-800 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium disabled:opacity-50 transition"
                >
                  {creating ? t.creating : t.createBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PLAN MODAL */}
      {showEditModal && editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl relative">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Pencil className="h-5 w-5 text-violet-500" /> {t.editPlanTitle}
              </h2>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleUpdatePlan} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{t.planLabel}</label>
                <select
                  value={editPlanId}
                  onChange={e => setEditPlanId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none"
                >
                  <option value="free">{t.freePlan}</option>
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>{p.display_name}</option>
                  ))}
                </select>
              </div>
              {editPlanId !== 'free' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{t.expiresAt}</label>
                  <input
                    type="date"
                    required
                    value={editPeriodEnd}
                    onChange={e => setEditPeriodEnd(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none"
                    dir="ltr"
                  />
                </div>
              )}
              <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-800 mt-6">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={updatingPlan}
                  className="flex-1 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium disabled:opacity-50 transition"
                >
                  {updatingPlan ? t.saving : t.savePlan}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
