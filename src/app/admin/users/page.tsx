'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Search,
  Key,
  LogIn,
  Edit2,
  Lock,
  Unlock,
  Trash2,
  Loader2,
  Calendar,
  X,
  CheckCircle,
  AlertTriangle,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAdminLanguage } from '@/contexts/admin-language-provider';

interface UserData {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  full_name: string;
  platform_role: string;
  account_id: string | null;
  is_blocked: boolean;
  plan_id: string | null;
  plan_name: string;
  plan_display_name: string;
  subscription_status: string;
  current_period_end: string | null;
}

interface PlanData {
  id: string;
  name: string;
  display_name: string;
}

const localDict = {
  ar: {
    title: 'إدارة المستخدمين والصلاحيات',
    desc: 'تحكم كامل بحسابات الوكالات وعملائهم، بما في ذلك الحظر وإعادة تعيين كلمات المرور وتغيير الاشتراكات.',
    totalUsers: 'إجمالي المستخدمين:',
    searchPlaceholder: 'ابحث بالبريد الإلكتروني، الاسم، أو المُعرف (UUID)...',
    allPlans: 'جميع الخطط',
    allStatuses: 'كل الحالات',
    activeUsers: 'المستخدمون النشطون',
    blockedUsers: 'المستخدمون المحظورون',
    userInfo: 'المستخدم',
    planAndRole: 'الخطة والدور',
    statusAndDate: 'الحالة وتاريخ الانضمام',
    actions: 'إجراءات',
    admin: 'أدمن',
    user: 'مستخدم',
    freePlan: 'الخطة المجانية',
    activeSub: 'اشتراك نشط',
    expiredSub: 'اشتراك منتهي',
    trial: 'فترة تجريبية',
    impersonate: 'تسجيل الدخول كـ (Impersonate)',
    resetPass: 'إعادة تعيين كلمة المرور',
    changePlan: 'تغيير الخطة والاشتراك',
    block: 'حظر',
    unblock: 'إلغاء حظر',
    deleteUser: 'حذف المستخدم النهائي',
    loading: 'جاري التحميل...',
    noUsers: 'لا يوجد مستخدمين مطابقين للبحث.',
    resetTitle: 'إعادة تعيين كلمة مرور للمستخدم',
    tempPassMsg: 'تم إنشاء كلمة مرور مؤقتة للمستخدم بنجاح. يرجى تزويد المستخدم بهذه الكلمة فوراً:',
    copyPass: 'نسخ كلمة المرور المؤقتة',
    close: 'إغلاق',
    warningReset: 'تحذير: سيتم مسح كلمة المرور القديمة فوراً. هل أنت متأكد من المتابعة؟',
    confirmReset: 'نعم، قم بإنشاء كلمة مرور مؤقتة',
    cancel: 'إلغاء التغييرات',
    changePlanTitle: 'تفعيل اشتراك جديد يدوياً للمستخدم',
    targetUser: 'المستخدم المستهدف:',
    choosePlan: 'اختر الخطة الجديدة',
    expiresAt: 'تاريخ الانتهاء',
    lifetime: 'اشتراك مدى الحياة (بدون تاريخ انتهاء)',
    saveChanges: 'حفظ وتفعيل',
    saving: 'جاري الحفظ...',
    deleteTitle: 'حذف المستخدم النهائي',
    deleteWarning1: 'أنت على وشك حذف حساب هذا المستخدم نهائياً:',
    deleteWarning2: 'جميع بياناته المرتبطة سيتم حذفها.',
    confirmEmailLabel: 'يرجى كتابة البريد الإلكتروني للمستخدم لتأكيد الحذف:',
    deleteBtn: 'نعم، احذف المستخدم نهائياً',
  },
  en: {
    title: 'User Management & Roles',
    desc: 'Full control over agency accounts and their clients, including blocking, password resets, and plan changes.',
    totalUsers: 'Total Users:',
    searchPlaceholder: 'Search by email, name, or UUID...',
    allPlans: 'All Plans',
    allStatuses: 'All Statuses',
    activeUsers: 'Active Users',
    blockedUsers: 'Blocked Users',
    userInfo: 'User',
    planAndRole: 'Plan & Role',
    statusAndDate: 'Status & Joined Date',
    actions: 'Actions',
    admin: 'Admin',
    user: 'User',
    freePlan: 'Free Plan',
    activeSub: 'Active Sub',
    expiredSub: 'Expired Sub',
    trial: 'Trial',
    impersonate: 'Login as (Impersonate)',
    resetPass: 'Reset Password',
    changePlan: 'Change Plan',
    block: 'Block',
    unblock: 'Unblock',
    deleteUser: 'Delete Final User',
    loading: 'Loading...',
    noUsers: 'No users match your search.',
    resetTitle: 'Reset User Password',
    tempPassMsg: 'A temporary password was successfully generated. Provide this to the user immediately:',
    copyPass: 'Copy Temporary Password',
    close: 'Close',
    warningReset: 'Warning: Old password will be cleared immediately. Are you sure you want to proceed?',
    confirmReset: 'Yes, generate temporary password',
    cancel: 'Cancel',
    changePlanTitle: 'Manual Plan Activation',
    targetUser: 'Target User:',
    choosePlan: 'Choose New Plan',
    expiresAt: 'Expiration Date',
    lifetime: 'Lifetime (No Expiry)',
    saveChanges: 'Save & Activate',
    saving: 'Saving...',
    deleteTitle: 'Delete Final User',
    deleteWarning1: 'You are about to permanently delete this user account:',
    deleteWarning2: 'All associated data will be deleted.',
    confirmEmailLabel: 'Please type the user email to confirm deletion:',
    deleteBtn: 'Yes, permanently delete',
  }
};

export default function AdminUsersPage() {
  const { lang, dir } = useAdminLanguage();
  const t = localDict[lang];

  const [users, setUsers] = useState<UserData[]>([]);
  const [plans, setPlans] = useState<PlanData[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPlan, setFilterPlan] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Modal control states
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  
  // Reset password states
  const [showResetModal, setShowResetModal] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  // Edit Plan states
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editPlanId, setEditPlanId] = useState('');
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [editPerpetual, setEditPerpetual] = useState(false);
  const [updatingPlan, setUpdatingPlan] = useState(false);

  // Delete User states
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmEmailInput, setConfirmEmailInput] = useState('');
  const [deletingUser, setDeletingUser] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    loadUsersData();
  }, []);

  const loadUsersData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load users');

      setUsers(data.users || []);
      setPlans(data.plans || []);
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ في تحميل قائمة المستخدمين');
    } finally {
      setLoading(false);
    }
  };

  const handleImpersonate = async (user: UserData) => {
    if (!confirm(lang === 'ar' ? `هل أنت متأكد من رغبتك في الدخول كـ ${user.email}؟` : `Are you sure you want to login as ${user.email}?`)) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error(lang === 'ar' ? 'لم يتم العثور على جلسة الأدمن الحالية' : 'Admin session not found');
        return;
      }

      localStorage.setItem('wacrm_impersonator_admin', JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        admin_email: session.user.email,
        admin_id: session.user.id
      }));

      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'impersonate_start',
          targetUserId: user.id,
          targetEmail: user.email
        })
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to start impersonation');

      const { error: loginError } = await supabase.auth.verifyOtp({
        token_hash: resData.token_hash,
        type: 'magiclink'
      });

      if (loginError) throw loginError;

      toast.success(lang === 'ar' ? `جاري الدخول كـ ${user.email}...` : `Logging in as ${user.email}...`);

      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 800);

    } catch (err: any) {
      localStorage.removeItem('wacrm_impersonator_admin');
      toast.error(err.message || 'فشل في عملية المحاكاة ودخول الجلسة');
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    setResettingPassword(true);
    setTempPassword('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset_password',
          targetUserId: selectedUser.id,
          targetEmail: selectedUser.email
        })
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to reset password');

      setTempPassword(resData.tempPassword);
      toast.success(lang === 'ar' ? 'تمت إعادة تعيين كلمة المرور بنجاح!' : 'Password reset successfully!');
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ أثناء إعادة تعيين كلمة المرور');
    } finally {
      setResettingPassword(false);
    }
  };

  const handleUpdatePlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !selectedUser.account_id || !editPlanId) return;

    setUpdatingPlan(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_plan',
          accountId: selectedUser.account_id,
          planId: editPlanId,
          expiresAt: editPerpetual ? '2099-12-31T23:59:59Z' : editExpiresAt,
          targetUserId: selectedUser.id,
          targetEmail: selectedUser.email
        })
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to update plan');

      toast.success(lang === 'ar' ? 'تم تفعيل الخطة الجديدة بنجاح للمستخدم!' : 'Plan updated successfully!');
      setShowPlanModal(false);
      loadUsersData(); 
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ أثناء تفعيل الخطة');
    } finally {
      setUpdatingPlan(false);
    }
  };

  const handleToggleBlock = async (user: UserData) => {
    const isBlocking = !user.is_blocked;
    const msgAr = `هل أنت متأكد من رغبتك في ${isBlocking ? 'حظر' : 'إلغاء حظر'} هذا الحساب؟`;
    const msgEn = `Are you sure you want to ${isBlocking ? 'block' : 'unblock'} this user?`;
    if (!confirm(lang === 'ar' ? msgAr : msgEn)) return;

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isBlocking ? 'block' : 'unblock',
          accountId: user.account_id,
          targetUserId: user.id,
          targetEmail: user.email
        })
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to alter blocking status');

      toast.success(isBlocking ? (lang === 'ar' ? 'تم حظر المستخدم بنجاح' : 'User blocked') : (lang === 'ar' ? 'تم إلغاء حظر المستخدم بنجاح' : 'User unblocked'));
      loadUsersData();
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ في تغيير حالة الحظر');
    }
  };

  const handleDeleteUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    if (confirmEmailInput.trim().toLowerCase() !== selectedUser.email.toLowerCase()) {
      toast.error(lang === 'ar' ? 'البريد الإلكتروني المدخل غير مطابق للتأكيد' : 'Emails do not match');
      return;
    }

    setDeletingUser(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_user',
          targetUserId: selectedUser.id,
          targetEmail: selectedUser.email
        })
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to delete user');

      toast.success(lang === 'ar' ? 'تم حذف المستخدم وجميع بياناته بنجاح!' : 'User deleted permanently!');
      setShowDeleteModal(false);
      loadUsersData();
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ أثناء محاولة الحذف');
    } finally {
      setDeletingUser(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      const match = u.email.toLowerCase().includes(s) || u.full_name.toLowerCase().includes(s) || u.id.includes(s);
      if (!match) return false;
    }
    if (filterPlan !== 'all') {
      if (filterPlan === 'free' && u.plan_id) return false;
      if (filterPlan !== 'free' && u.plan_id !== filterPlan) return false;
    }
    if (filterStatus !== 'all') {
      if (filterStatus === 'blocked' && !u.is_blocked) return false;
      if (filterStatus === 'active' && u.is_blocked) return false;
    }
    return true;
  });

  return (
    <div className="p-8 space-y-6" dir={dir}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t.title}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t.desc}</p>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className={`absolute ${dir === 'rtl' ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400`} />
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-2 ${dir === 'rtl' ? 'pr-9 pl-4' : 'pl-9 pr-4'} text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filterPlan}
            onChange={(e) => setFilterPlan(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none"
          >
            <option value="all">{t.allPlans}</option>
            <option value="free">{t.freePlan}</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.display_name}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none"
          >
            <option value="all">{t.allStatuses}</option>
            <option value="active">{t.activeUsers}</option>
            <option value="blocked">{t.blockedUsers}</option>
          </select>
          <div className="text-sm text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 whitespace-nowrap">
            {t.totalUsers} <span className="font-bold text-slate-900 dark:text-white">{filteredUsers.length}</span>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-950/40 text-xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className={`px-6 py-4 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>{t.userInfo}</th>
                <th className={`px-6 py-4 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>{t.planAndRole}</th>
                <th className={`px-6 py-4 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>{t.statusAndDate}</th>
                <th className={`px-6 py-4 ${dir === 'rtl' ? 'text-left' : 'text-right'}`}>{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-violet-500 mx-auto" />
                    <p className="mt-2 text-slate-500 dark:text-slate-400">{t.loading}</p>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                    {t.noUsers}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    {/* INFO */}
                    <td className={`px-6 py-4 max-w-[200px] sm:max-w-xs ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 shrink-0 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center border border-slate-300 dark:border-slate-700">
                          <User className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-900 dark:text-white truncate">{user.full_name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5 truncate" title="User UUID">
                            {user.id.substring(0, 8)}...
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* PLAN */}
                    <td className={`px-6 py-4 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
                      <div className="flex flex-col gap-1.5 items-start">
                        {user.plan_id ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 ring-1 ring-inset ring-violet-200 dark:ring-violet-500/20">
                            {user.plan_display_name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {t.freePlan}
                          </span>
                        )}
                        <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">
                          {user.platform_role === 'super_admin' ? t.admin : t.user}
                        </span>
                      </div>
                    </td>

                    {/* STATUS */}
                    <td className={`px-6 py-4 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
                      <div className="flex flex-col gap-1.5 items-start">
                        {user.is_blocked ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400">
                            <Lock className="h-3 w-3" /> {t.blockedUsers}
                          </span>
                        ) : user.subscription_status === 'active' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                            <CheckCircle className="h-3 w-3" /> {t.activeSub}
                          </span>
                        ) : user.subscription_status === 'trialing' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400">
                            <CheckCircle className="h-3 w-3" /> {t.trial}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3" /> {t.expiredSub}
                          </span>
                        )}
                        <div className="flex items-center gap-1 text-[10px] text-slate-500">
                          <Calendar className="h-3 w-3" />
                          {new Date(user.created_at).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                        </div>
                      </div>
                    </td>

                    {/* ACTIONS */}
                    <td className={`px-6 py-4 ${dir === 'rtl' ? 'text-left' : 'text-right'}`}>
                      <div className={`flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ${dir === 'rtl' ? 'justify-start' : 'justify-end'}`}>
                        {/* Impersonate */}
                        <button
                          onClick={() => handleImpersonate(user)}
                          className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded transition"
                          title={t.impersonate}
                        >
                          <LogIn className="h-4 w-4" />
                        </button>
                        
                        {/* Reset Password */}
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setShowResetModal(true);
                          }}
                          className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded transition"
                          title={t.resetPass}
                        >
                          <Key className="h-4 w-4" />
                        </button>

                        {/* Edit Plan */}
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setEditPlanId(user.plan_id || 'free');
                            setEditExpiresAt(
                              user.current_period_end 
                                ? new Date(user.current_period_end).toISOString().slice(0, 16) 
                                : ''
                            );
                            setEditPerpetual(false);
                            setShowPlanModal(true);
                          }}
                          className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded transition"
                          title={t.changePlan}
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>

                        {/* Block / Unblock */}
                        <button
                          onClick={() => handleToggleBlock(user)}
                          className={`p-1.5 rounded transition ${
                            user.is_blocked 
                              ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-500/20' 
                              : 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-500/20'
                          }`}
                          title={user.is_blocked ? t.unblock : t.block}
                        >
                          {user.is_blocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                        </button>

                        {/* Delete User */}
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setConfirmEmailInput('');
                            setShowDeleteModal(true);
                          }}
                          className="p-1.5 bg-red-100 dark:bg-red-500/10 hover:bg-red-200 dark:hover:bg-red-500/20 text-red-700 dark:text-red-400 rounded transition"
                          title={t.deleteUser}
                        >
                          <Trash2 className="h-4 w-4" />
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

      {/* --- MODALS --- */}

      {/* 1. Reset Password Modal */}
      {showResetModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl relative">
            <button onClick={() => {setShowResetModal(false); setTempPassword('');}} className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 dark:hover:text-white">
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <Key className="h-5 w-5 text-violet-500" /> {t.resetTitle}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 break-all">
              {selectedUser.email}
            </p>

            {tempPassword ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg">
                  <p className="text-sm text-emerald-800 dark:text-emerald-400 mb-2">
                    {t.tempPassMsg}
                  </p>
                  <code className="block w-full p-3 bg-white dark:bg-emerald-950/50 text-center text-lg font-mono font-bold text-emerald-700 dark:text-emerald-300 rounded border border-emerald-200 dark:border-emerald-500/30">
                    {tempPassword}
                  </code>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(tempPassword);
                    toast.success('تم النسخ!');
                  }}
                  className="w-full py-2 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                >
                  {t.copyPass}
                </button>
                <button
                  onClick={() => {setShowResetModal(false); setTempPassword('');}}
                  className="w-full py-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm"
                >
                  {t.close}
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 p-3 rounded-lg border border-red-200 dark:border-red-500/20">
                  {t.warningReset}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowResetModal(false)}
                    className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                  >
                    {t.cancel}
                  </button>
                  <button
                    onClick={handleResetPassword}
                    disabled={resettingPassword}
                    className="flex-1 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium disabled:opacity-50 transition"
                  >
                    {resettingPassword ? t.loading : t.confirmReset}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Change Plan Modal */}
      {showPlanModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl relative">
            <button onClick={() => setShowPlanModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 dark:hover:text-white">
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-violet-500" /> {t.changePlanTitle}
            </h2>
            
            <form onSubmit={handleUpdatePlanSubmit} className="space-y-5 mt-6">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t.targetUser}</label>
                <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm text-slate-700 dark:text-slate-300 font-mono">
                  {selectedUser.email}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t.choosePlan}</label>
                <select
                  value={editPlanId}
                  onChange={(e) => setEditPlanId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none"
                  required
                >
                  <option value="free">{t.freePlan}</option>
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>{p.display_name}</option>
                  ))}
                </select>
              </div>

              {editPlanId !== 'free' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t.expiresAt}</label>
                    <input
                      type="datetime-local"
                      value={editExpiresAt}
                      onChange={(e) => setEditExpiresAt(e.target.value)}
                      disabled={editPerpetual}
                      required={!editPerpetual}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none disabled:opacity-50"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editPerpetual}
                      onChange={(e) => setEditPerpetual(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-violet-600 focus:ring-violet-500"
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.lifetime}</span>
                  </label>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={updatingPlan}
                  className="flex-1 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium disabled:opacity-50 transition"
                >
                  {updatingPlan ? t.saving : t.saveChanges}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Delete Modal */}
      {showDeleteModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-red-200 dark:border-red-900 bg-white dark:bg-slate-900 p-6 shadow-2xl relative">
            <button onClick={() => setShowDeleteModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 dark:hover:text-white">
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-xl font-bold text-red-600 dark:text-red-500 mb-4 flex items-center gap-2">
              <AlertTriangle className="h-6 w-6" /> {t.deleteTitle}
            </h2>
            
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-4 rounded-lg mb-6">
              <p className="text-sm text-red-800 dark:text-red-400 font-medium mb-1">
                {t.deleteWarning1} <span className="font-bold underline">{selectedUser.email}</span>
              </p>
              <p className="text-xs text-red-700 dark:text-red-300">
                {t.deleteWarning2}
              </p>
            </div>

            <form onSubmit={handleDeleteUserSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.confirmEmailLabel}
                </label>
                <input
                  type="text"
                  value={confirmEmailInput}
                  onChange={(e) => setConfirmEmailInput(e.target.value)}
                  placeholder={selectedUser.email}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-red-500 focus:outline-none font-mono"
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={deletingUser || confirmEmailInput.trim().toLowerCase() !== selectedUser.email.toLowerCase()}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium disabled:opacity-50 transition"
                >
                  {deletingUser ? t.loading : t.deleteBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
