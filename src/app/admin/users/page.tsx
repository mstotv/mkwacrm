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

export default function AdminUsersPage() {
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

  // 1) IMPERSONATION Flow
  const handleImpersonate = async (user: UserData) => {
    if (!confirm(`هل أنت متأكد من رغبتك في الدخول كـ ${user.email}؟`)) return;

    try {
      // Fetch current admin session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('لم يتم العثور على جلسة الأدمن الحالية');
        return;
      }

      // Store current admin credentials
      localStorage.setItem('wacrm_impersonator_admin', JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        admin_email: session.user.email,
        admin_id: session.user.id
      }));

      // Request impersonation token from backend
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

      // Login as target user via OTP magiclink verify
      const { error: loginError } = await supabase.auth.verifyOtp({
        email: resData.email,
        token: resData.token_hash,
        type: 'magiclink'
      });

      if (loginError) throw loginError;

      toast.success(`جاري الدخول كـ ${user.email}...`);

      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 800);

    } catch (err: any) {
      localStorage.removeItem('wacrm_impersonator_admin');
      toast.error(err.message || 'فشل في عملية المحاكاة ودخول الجلسة');
    }
  };

  // 2) RESET PASSWORD Flow
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
      toast.success('تمت إعادة تعيين كلمة المرور بنجاح!');
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ أثناء إعادة تعيين كلمة المرور');
    } finally {
      setResettingPassword(false);
    }
  };

  // 3) PLAN UPDATE Flow
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

      toast.success('تم تفعيل الخطة الجديدة بنجاح للمستخدم!');
      setShowPlanModal(false);
      loadUsersData(); // Reload list
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ أثناء تفعيل الخطة');
    } finally {
      setUpdatingPlan(false);
    }
  };

  // 4) BLOCK/UNBLOCK Flow
  const handleToggleBlock = async (user: UserData) => {
    const isBlocking = !user.is_blocked;
    if (!confirm(`هل أنت متأكد من رغبتك في ${isBlocking ? 'حظر' : 'إلغاء حظر'} هذا الحساب؟`)) return;

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

      toast.success(isBlocking ? 'تم حظر المستخدم بنجاح' : 'تم إلغاء حظر المستخدم بنجاح');
      loadUsersData();
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ في تغيير حالة الحظر');
    }
  };

  // 5) DELETE Flow
  const handleDeleteUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    if (confirmEmailInput.trim().toLowerCase() !== selectedUser.email.toLowerCase()) {
      toast.error('البريد الإلكتروني المدخل غير مطابق للتأكيد');
      return;
    }

    setDeletingUser(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          targetUserId: selectedUser.id,
          targetEmail: selectedUser.email
        })
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to delete user');

      toast.success('تم حذف المستخدم وجميع بياناته نهائياً من المنصة!');
      setShowDeleteModal(false);
      loadUsersData();
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ أثناء حذف الحساب');
    } finally {
      setDeletingUser(false);
    }
  };

  // Filter & Search Logic
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesPlan = filterPlan === 'all' || u.plan_name === filterPlan;

    let matchesStatus = true;
    if (filterStatus !== 'all') {
      if (filterStatus === 'blocked') {
        matchesStatus = u.is_blocked;
      } else {
        matchesStatus = !u.is_blocked && u.subscription_status === filterStatus;
      }
    }

    return matchesSearch && matchesPlan && matchesStatus;
  });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin text-violet-400 mx-auto" />
        <p className="mt-2 text-xs">جاري تحميل قائمة المستخدمين...</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-7xl text-white">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">إدارة مستخدمي المنصة</h1>
        <p className="mt-1 text-sm text-slate-400">التحكم في حسابات المستخدمين، تعديل خططهم يدويًا، إعادة تعيين كلمة المرور والمحاكاة.</p>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap gap-4 items-center justify-between rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute right-3 top-2.5 h-4.5 w-4.5 text-slate-500" />
          <input
            type="text"
            placeholder="البحث بالاسم أو البريد الإلكتروني..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-850 px-10 py-2 text-xs text-white focus:border-violet-500 focus:outline-none"
          />
        </div>

        <div className="flex gap-3 flex-wrap">
          {/* Plan Filter */}
          <div>
            <select
              value={filterPlan}
              onChange={(e) => setFilterPlan(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs text-white focus:border-violet-500 focus:outline-none"
            >
              <option value="all">كل الخطط</option>
              {plans.map((p) => (
                <option key={p.id} value={p.name}>{p.display_name}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs text-white focus:border-violet-500 focus:outline-none"
            >
              <option value="all">كل الحالات</option>
              <option value="active">نشط</option>
              <option value="trial">تجريبي</option>
              <option value="expired">منتهي</option>
              <option value="blocked">محظور</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
        <table className="w-full text-right border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/20 text-slate-400">
              <th className="px-6 py-4 font-semibold">المستخدم</th>
              <th className="px-6 py-4 font-semibold">تاريخ التسجيل</th>
              <th className="px-6 py-4 font-semibold">الخطة الحالية</th>
              <th className="px-6 py-4 font-semibold">حالة الاشتراك</th>
              <th className="px-6 py-4 font-semibold">آخر تسجيل دخول</th>
              <th className="px-6 py-4 font-semibold text-left">التحكم والإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-200">
            {filteredUsers.map((u) => {
              // Status Styling
              let statusLabel = 'نشط';
              let statusStyle = 'bg-green-500/10 text-green-400 border-green-500/20';

              if (u.is_blocked) {
                statusLabel = 'محظور';
                statusStyle = 'bg-red-500/10 text-red-400 border-red-500/20';
              } else if (u.subscription_status === 'trial') {
                statusLabel = 'تجريبي';
                statusStyle = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
              } else if (u.subscription_status === 'expired') {
                statusLabel = 'منتهي';
                statusStyle = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
              }

              // Platform Role Check
              const isAdmin = u.platform_role === 'super_admin';

              return (
                <tr key={u.id} className="hover:bg-slate-950/10 transition group">
                  {/* Name and Email */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-400">
                        <User className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-white flex items-center gap-1">
                          {u.full_name}
                          {isAdmin && (
                            <span className="rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1 py-0.5 text-[9px] font-bold">
                              سوبر أدمن
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">{u.email}</div>
                      </div>
                    </div>
                  </td>

                  {/* Joined date */}
                  <td className="px-6 py-4 font-mono text-[11px] text-slate-400">
                    {formatDate(u.created_at)}
                  </td>

                  {/* Plan Badge */}
                  <td className="px-6 py-4">
                    <span className="rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1 text-xs font-semibold text-white uppercase">
                      {u.plan_display_name}
                    </span>
                  </td>

                  {/* Subscription status */}
                  <td className="px-6 py-4">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusStyle}`}>
                      {statusLabel}
                    </span>
                  </td>

                  {/* Last log in */}
                  <td className="px-6 py-4 font-mono text-[11px] text-slate-400">
                    {formatDate(u.last_sign_in_at)}
                  </td>

                  {/* Action buttons */}
                  <td className="px-6 py-4">
                    <div className="flex gap-2 justify-end">
                      {/* Impersonate */}
                      <button
                        type="button"
                        onClick={() => handleImpersonate(u)}
                        disabled={isAdmin}
                        title="تسجيل الدخول كالمستخدم (Impersonate)"
                        className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-violet-600/20 hover:border-violet-600 p-2 text-slate-400 hover:text-violet-400 transition disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <LogIn className="h-4 w-4" />
                      </button>

                      {/* Manual Subscription plan edit */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUser(u);
                          setEditPlanId(u.plan_id || plans[0]?.id || '');
                          setEditExpiresAt(u.current_period_end ? new Date(u.current_period_end).toISOString().substring(0, 10) : '');
                          setEditPerpetual(u.current_period_end ? new Date(u.current_period_end).getFullYear() > 2090 : true);
                          setShowPlanModal(true);
                        }}
                        disabled={isAdmin}
                        title="تعديل/تفعيل خطة الاشتراك"
                        className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-blue-600/20 hover:border-blue-600 p-2 text-slate-400 hover:text-blue-400 transition disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>

                      {/* Reset password */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUser(u);
                          setTempPassword('');
                          setShowResetModal(true);
                        }}
                        title="إعادة تعيين كلمة المرور"
                        className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-yellow-600/20 hover:border-yellow-600 p-2 text-slate-400 hover:text-yellow-400 transition"
                      >
                        <Key className="h-4 w-4" />
                      </button>

                      {/* Block / Unblock toggler */}
                      <button
                        type="button"
                        onClick={() => handleToggleBlock(u)}
                        disabled={isAdmin}
                        title={u.is_blocked ? 'إلغاء حظر الحساب' : 'حظر الحساب مؤقتاً'}
                        className={`rounded-lg border border-slate-700 bg-slate-800 p-2 transition disabled:opacity-30 disabled:cursor-not-allowed ${
                          u.is_blocked
                            ? 'hover:bg-green-600/20 hover:border-green-600 text-green-400'
                            : 'hover:bg-amber-600/20 hover:border-amber-600 text-slate-400 hover:text-amber-400'
                        }`}
                      >
                        {u.is_blocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                      </button>

                      {/* Delete permanently */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUser(u);
                          setConfirmEmailInput('');
                          setShowDeleteModal(true);
                        }}
                        disabled={isAdmin}
                        title="حذف الحساب نهائياً"
                        className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-red-650/20 hover:border-red-650 p-2 text-slate-400 hover:text-red-400 transition disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-500 text-sm">
                  لم يتم العثور على مستخدمين يطابقون الفلاتر المحددة.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ================= MODAL: RESET PASSWORD ================= */}
      {showResetModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => setShowResetModal(false)}
              className="absolute left-4 top-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Key className="h-5 w-5 text-yellow-400" /> إعادة تعيين كلمة المرور
            </h3>
            <p className="text-xs text-slate-400">
              سيقوم هذا الإجراء بتوليد كلمة مرور عشوائية جديدة مؤقتة للمستخدم وتحديثها فوراً في حساب الحماية (Auth).
            </p>

            <div className="rounded-xl bg-slate-950/40 p-4 border border-slate-850 space-y-2">
              <div className="text-xs text-slate-500">حساب المستخدم المستهدف:</div>
              <div className="text-sm font-semibold text-white">{selectedUser.full_name}</div>
              <div className="text-xs text-slate-400 font-mono">{selectedUser.email}</div>
            </div>

            {tempPassword && (
              <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-4 space-y-2 text-center">
                <span className="block text-[11px] font-bold text-green-400">كلمة المرور المؤقتة الجديدة:</span>
                <span className="block text-xl font-bold tracking-wider font-mono text-white select-all">
                  {tempPassword}
                </span>
                <span className="block text-[10px] text-slate-400">
                  انسخ كلمة المرور أعلاه وأعطها للمستخدم. يرجى الطلب منه تغييرها من إعدادات حسابه فور تسجيل دخوله.
                </span>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="rounded-lg bg-slate-800 hover:bg-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-300"
              >
                إغلاق النافذة
              </button>
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={resettingPassword}
                className="rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white px-5 py-2.5 text-xs font-semibold flex items-center gap-1.5"
              >
                {resettingPassword ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Key className="h-4 w-4" />
                )}
                {resettingPassword ? 'جاري التحديث...' : 'إعادة التعيين والتوليد الآن'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: EDIT MANUAL SUBSCRIPTION PLAN ================= */}
      {showPlanModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl relative">
            <button
              onClick={() => setShowPlanModal(false)}
              className="absolute left-4 top-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
              <Edit2 className="h-5 w-5 text-blue-400" /> تفعيل وتعديل خطة الاشتراك
            </h3>

            <form onSubmit={handleUpdatePlanSubmit} className="space-y-4">
              <div className="rounded-xl bg-slate-950/40 p-4 border border-slate-850">
                <div className="text-xs text-slate-500">الحساب المستهدف:</div>
                <div className="text-sm font-semibold text-white">{selectedUser.full_name}</div>
                <div className="text-xs text-slate-400">{selectedUser.email}</div>
              </div>

              {/* Plan dropdown */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">الخطة المطلوبة للتفعيل</label>
                <select
                  value={editPlanId}
                  onChange={(e) => setEditPlanId(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs text-white focus:border-violet-500 focus:outline-none"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>{p.display_name}</option>
                  ))}
                </select>
              </div>

              {/* Expiry end picker */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-400">تاريخ انتهاء الصلاحية</label>
                  <label className="flex items-center gap-1 text-xs cursor-pointer text-slate-400">
                    <input
                      type="checkbox"
                      checked={editPerpetual}
                      onChange={(e) => setEditPerpetual(e.target.checked)}
                      className="rounded border-slate-700 text-violet-650 bg-slate-800"
                    />
                    <span>بدون انتهاء (اشتراك دائم)</span>
                  </label>
                </div>
                {!editPerpetual && (
                  <div className="relative">
                    <Calendar className="absolute right-3 top-2.5 h-4.5 w-4.5 text-slate-500" />
                    <input
                      type="date"
                      value={editExpiresAt}
                      onChange={(e) => setEditExpiresAt(e.target.value)}
                      required={!editPerpetual}
                      className="w-full rounded-lg border border-slate-700 bg-slate-850 pr-10 pl-3 py-2 text-xs text-white focus:border-violet-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-850">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="rounded-lg bg-slate-800 hover:bg-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-300"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={updatingPlan}
                  className="rounded-lg bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 text-xs font-semibold flex items-center gap-1.5"
                >
                  {updatingPlan && <Loader2 className="h-4 w-4 animate-spin" />}
                  تفعيل الخطة فوراً
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: DELETE CONFIRM ================= */}
      {showDeleteModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-slate-900 p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => setShowDeleteModal(false)}
              className="absolute left-4 top-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-bold text-red-400 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> حذف الحساب نهائياً!
            </h3>
            <p className="text-xs text-slate-450">
              تحذير: سيقوم هذا الإجراء بحذف المستخدم نهائياً من سجلات الحماية (Auth)، وحذف جميع بياناته وأرقامه وملفاته الشخصية والمزايا من قاعدة البيانات. 
              <strong> هذا الإجراء لا يمكن التراجع عنه.</strong>
            </p>

            <div className="rounded-xl bg-red-500/5 p-4 border border-red-500/10 space-y-1">
              <div className="text-[10px] text-slate-500">حساب المستخدم المراد حذفه:</div>
              <div className="text-xs font-bold text-white">{selectedUser.full_name}</div>
              <div className="text-xs text-red-300 font-mono">{selectedUser.email}</div>
            </div>

            <form onSubmit={handleDeleteUserSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  لتأكيد الحذف، يرجى كتابة البريد الإلكتروني للمستخدم أدناه:
                </label>
                <input
                  type="text"
                  placeholder={selectedUser.email}
                  value={confirmEmailInput}
                  onChange={(e) => setConfirmEmailInput(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="rounded-lg bg-slate-800 hover:bg-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-300"
                >
                  تراجع
                </button>
                <button
                  type="submit"
                  disabled={deletingUser || confirmEmailInput.trim().toLowerCase() !== selectedUser.email.toLowerCase()}
                  className="rounded-lg bg-red-650 hover:bg-red-600 text-white px-5 py-2.5 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {deletingUser ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  حذف الحساب بشكل نهائي
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
