'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Plus, Check, Pencil, AlertCircle, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Plan {
  id: string;
  name: string;
  display_name: string;
  price_monthly: number;
  price_yearly: number;
  limits: Record<string, number>;
  is_active: boolean;
  features_ar?: string[];
  features_en?: string[];
}

export default function AdminSubscriptionsPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states for creating/editing plan
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planName, setPlanName] = useState('');
  const [planDisplayName, setPlanDisplayName] = useState('');
  const [planPriceMonthly, setPlanPriceMonthly] = useState(0);
  const [planPriceYearly, setPlanPriceYearly] = useState(0);
  const [limitContacts, setLimitContacts] = useState(100);
  const [limitBroadcasts, setLimitBroadcasts] = useState(10);
  const [limitAgents, setLimitAgents] = useState(1);
  const [limitAutomations, setLimitAutomations] = useState(5);
  const [featuresAr, setFeaturesAr] = useState<string[]>([]);
  const [featuresEn, setFeaturesEn] = useState<string[]>([]);
  const [newFeatureAr, setNewFeatureAr] = useState('');
  const [newFeatureEn, setNewFeatureEn] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);

  // Manual activation states
  const [manualAccountId, setManualAccountId] = useState('');
  const [manualPlanId, setManualPlanId] = useState('');
  const [manualPaymentMethod, setManualPaymentMethod] = useState('manual');
  const [manualDuration, setManualDuration] = useState<'monthly' | 'yearly'>('monthly');
  const [activating, setActivating] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    loadPlans();
  }, []);

  async function loadPlans() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('price_monthly', { ascending: true });

      if (error) throw error;
      setPlans((data as Plan[]) || []);
      if (data && data.length > 0) setManualPlanId(data[0].id);
    } catch (err) {
      toast.error('حدث خطأ في تحميل خطط الأسعار');
    } finally {
      setLoading(false);
    }
  }

  const handleToggleActive = async (plan: Plan) => {
    try {
      const nextStatus = !plan.is_active;
      const { error } = await supabase
        .from('subscription_plans')
        .update({ is_active: nextStatus })
        .eq('id', plan.id);

      if (error) throw error;

      setPlans(prev =>
        prev.map(p => (p.id === plan.id ? { ...p, is_active: nextStatus } : p))
      );
      toast.success(nextStatus ? 'تم تفعيل الخطة' : 'تم تعطيل الخطة');
    } catch (err) {
      toast.error('فشل تغيير حالة الخطة');
    }
  };

  const openPlanModal = (plan: Plan | null) => {
    setEditingPlan(plan);
    if (plan) {
      setPlanName(plan.name);
      setPlanDisplayName(plan.display_name);
      setPlanPriceMonthly(plan.price_monthly);
      setPlanPriceYearly(plan.price_yearly);
      setLimitContacts(plan.limits.contacts ?? 100);
      setLimitBroadcasts(plan.limits.broadcasts ?? 10);
      setLimitAgents(plan.limits.agents ?? 1);
      setLimitAutomations(plan.limits.automations ?? 5);
      setFeaturesAr(plan.features_ar || []);
      setFeaturesEn(plan.features_en || []);
    } else {
      setPlanName('');
      setPlanDisplayName('');
      setPlanPriceMonthly(0);
      setPlanPriceYearly(0);
      setLimitContacts(100);
      setLimitBroadcasts(10);
      setLimitAgents(1);
      setLimitAutomations(5);
      setFeaturesAr([]);
      setFeaturesEn([]);
    }
    setShowPlanModal(true);
  };

  const addFeatureAr = () => {
    if (!newFeatureAr.trim()) return;
    setFeaturesAr(prev => [...prev, newFeatureAr.trim()]);
    setNewFeatureAr('');
  };

  const removeFeatureAr = (idx: number) => {
    setFeaturesAr(prev => prev.filter((_, i) => i !== idx));
  };

  const addFeatureEn = () => {
    if (!newFeatureEn.trim()) return;
    setFeaturesEn(prev => [...prev, newFeatureEn.trim()]);
    setNewFeatureEn('');
  };

  const removeFeatureEn = (idx: number) => {
    setFeaturesEn(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planName.trim() || !planDisplayName.trim()) {
      toast.error('الرجاء إدخال الحقول المطلوبة');
      return;
    }

    try {
      setSavingPlan(true);
      const planPayload = {
        name: planName.trim().toLowerCase(),
        display_name: planDisplayName.trim(),
        price_monthly: Number(planPriceMonthly),
        price_yearly: Number(planPriceYearly),
        limits: {
          contacts: Number(limitContacts),
          broadcasts: Number(limitBroadcasts),
          agents: Number(limitAgents),
          automations: Number(limitAutomations),
        },
        features_ar: featuresAr,
        features_en: featuresEn,
      };

      if (editingPlan) {
        const { error } = await supabase
          .from('subscription_plans')
          .update(planPayload)
          .eq('id', editingPlan.id);

        if (error) throw error;
        toast.success('تم تحديث خطة الأسعار والمميزات بنجاح');
      } else {
        const { error } = await supabase
          .from('subscription_plans')
          .insert({
            ...planPayload,
            is_active: true,
          });

        if (error) throw error;
        toast.success('تمت إضافة خطة الأسعار الجديدة بنجاح');
      }

      setShowPlanModal(false);
      loadPlans();
    } catch (err: any) {
      toast.error('حدث خطأ أثناء حفظ الخطة: ' + err.message);
    } finally {
      setSavingPlan(false);
    }
  };

  const handleManualActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualAccountId.trim() || !manualPlanId) {
      toast.error('الرجاء إدخال ID الحساب');
      return;
    }

    try {
      setActivating(true);

      // Verify account exists
      const { data: accountExists } = await supabase
        .from('accounts')
        .select('id')
        .eq('id', manualAccountId.trim())
        .maybeSingle();

      if (!accountExists) {
        toast.error('خطأ: ID الحساب غير موجود في النظام');
        return;
      }

      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + (manualDuration === 'yearly' ? 365 : 30));

      // Get target plan details for price logging
      const selectedPlanData = plans.find(p => p.id === manualPlanId);
      const price = manualDuration === 'yearly' ? selectedPlanData?.price_yearly : selectedPlanData?.price_monthly;

      // 1. Create / Update subscription
      const { data: existingSub } = await supabase
        .from('account_subscriptions')
        .select('id')
        .eq('account_id', manualAccountId.trim())
        .maybeSingle();

      let subId = '';

      if (existingSub) {
        const { data: updatedSub, error: subError } = await supabase
          .from('account_subscriptions')
          .update({
            plan_id: manualPlanId,
            status: 'active',
            current_period_start: new Date().toISOString(),
            current_period_end: periodEnd.toISOString(),
            payment_method: manualPaymentMethod,
            updated_at: new Date().toISOString(),
          })
          .eq('account_id', manualAccountId.trim())
          .select()
          .single();

        if (subError) throw subError;
        subId = updatedSub.id;
      } else {
        const { data: insertedSub, error: subError } = await supabase
          .from('account_subscriptions')
          .insert({
            account_id: manualAccountId.trim(),
            plan_id: manualPlanId,
            status: 'active',
            current_period_start: new Date().toISOString(),
            current_period_end: periodEnd.toISOString(),
            payment_method: manualPaymentMethod,
          })
          .select()
          .single();

        if (subError) throw subError;
        subId = insertedSub.id;
      }

      // 2. Insert into payment history
      const { error: payError } = await supabase
        .from('payment_history')
        .insert({
          account_id: manualAccountId.trim(),
          subscription_id: subId,
          amount: price || 0,
          currency: 'USD',
          status: 'paid',
          payment_method: manualPaymentMethod,
          plan_id: manualPlanId,
          billing_period: manualDuration,
          paid_at: new Date().toISOString(),
          description: `Manual activation by Super Admin. Plan: ${selectedPlanData?.display_name} (${manualDuration})`,
        });

      if (payError) throw payError;

      toast.success('تم تفعيل الاشتراك يدويًا بنجاح وتوثيق عملية الدفع');
      setManualAccountId('');
    } catch (err: any) {
      toast.error('حدث خطأ أثناء تفعيل الاشتراك: ' + err.message);
    } finally {
      setActivating(false);
    }
  };

  const limitLabel = (key: string) => {
    const map: Record<string, string> = {
      contacts: 'جهات الاتصال',
      broadcasts: 'البث الشهري',
      agents: 'الأعضاء',
      automations: 'الأتمتة النشطة',
    };
    return map[key] ?? key;
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">الاشتراكات وخطط الأسعار</h1>
          <p className="mt-1 text-sm text-slate-400">إدارة خطط أسعار SaaS، المزايا، وحدود استخدام كل خطة</p>
        </div>
        <button
          onClick={() => openPlanModal(null)}
          className="flex items-center gap-2 rounded-lg bg-violet-650 hover:bg-violet-600 px-4 py-2 text-sm font-medium text-white transition shadow-lg"
        >
          <Plus className="h-4.5 w-4.5" /> إضافة خطة جديدة
        </button>
      </div>

      {/* Plans list */}
      {loading ? (
        <div className="text-center py-16 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin text-violet-400 mx-auto" />
          <p className="mt-2 text-xs">جاري التحميل...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl border p-6 flex flex-col justify-between transition ${plan.name === 'pro'
                  ? 'border-violet-500/50 bg-gradient-to-b from-violet-900/10 to-slate-900/90 shadow-xl'
                  : 'border-slate-800 bg-slate-900/40'
                } ${!plan.is_active ? 'opacity-50' : ''}`}
            >
              {plan.name === 'pro' && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-600 px-3 py-0.5 text-xs font-bold text-white shadow-md">
                  الأكثر شعبية
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">{plan.display_name}</h3>
                  <span className="text-[10px] text-slate-500 font-mono font-bold uppercase">{plan.name}</span>
                </div>

                <div className="mt-2 flex items-end gap-1">
                  <span className="text-3xl font-extrabold text-white">${plan.price_monthly}</span>
                  <span className="mb-1 text-slate-400 text-sm">/شهر</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  ${plan.price_yearly}/سنوياً
                </p>

                {/* Limits list */}
                <div className="my-6 space-y-2.5 border-t border-b border-slate-850 py-4">
                  {Object.entries(plan.limits).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">{limitLabel(key)}</span>
                      <span className={`font-semibold ${value === -1 ? 'text-emerald-400' : 'text-slate-200'}`}>
                        {value === -1 ? '∞ غير محدود' : value.toLocaleString('ar')}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Features preview */}
                <div className="mb-6 space-y-1.5">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">المزايا المدرجة (العربية)</p>
                  {plan.features_ar && plan.features_ar.length > 0 ? (
                    <ul className="text-xs space-y-1">
                      {plan.features_ar.slice(0, 4).map((f, i) => (
                        <li key={i} className="text-slate-400 flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-violet-400" />
                          <span className="line-clamp-1">{f}</span>
                        </li>
                      ))}
                      {plan.features_ar.length > 4 && (
                        <li className="text-[10px] text-slate-500">+{plan.features_ar.length - 4} أخرى...</li>
                      )}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-650">لا توجد مزايا مضافة</p>
                  )}
                </div>
              </div>

              <div className="flex gap-2 border-t border-slate-850 pt-4 mt-auto">
                <button
                  onClick={() => openPlanModal(plan)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-750 transition"
                >
                  <Pencil className="h-3.5 w-3.5" /> تعديل خطة ومزايا
                </button>
                <button
                  onClick={() => handleToggleActive(plan)}
                  className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${plan.is_active
                      ? 'bg-emerald-600/10 text-emerald-400 border border-emerald-600/20'
                      : 'bg-red-600/10 text-red-500 border border-red-600/20'
                    }`}
                  title={plan.is_active ? 'تعطيل الخطة' : 'تفعيل الخطة'}
                >
                  <Check className="h-3.5 w-3.5" />
                  {plan.is_active ? 'نشطة' : 'معطلة'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manual Subscription activation */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="font-semibold text-white mb-4">تفعيل اشتراك يدوي لحساب</h2>
        <form onSubmit={handleManualActivate} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">ID الحساب (Account UUID)</label>
            <input
              type="text"
              required
              value={manualAccountId}
              onChange={(e) => setManualAccountId(e.target.value)}
              placeholder="مثال: aa74b889-..."
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-650 focus:border-violet-500 focus:outline-none font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">الباقة / الخطة</label>
            <select
              value={manualPlanId}
              onChange={(e) => setManualPlanId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
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
              value={manualDuration}
              onChange={(e) => setManualDuration(e.target.value as any)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
            >
              <option value="monthly">شهري (30 يوم)</option>
              <option value="yearly">سنوي (365 يوم)</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={activating}
            className="flex items-center justify-center gap-2 rounded-lg bg-violet-650 hover:bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition disabled:bg-slate-800 disabled:text-slate-500"
          >
            {activating ? 'جاري التفعيل...' : 'تفعيل الاشتراك وتأكيد الدفع'}
          </button>
        </form>
      </div>

      {/* PLAN DETAILS CREATE/EDIT MODAL */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <h3 className="text-lg font-bold mb-4">
              {editingPlan ? `تعديل باقة: ${editingPlan.display_name}` : 'إضافة باقة اشتراك SaaS جديدة'}
            </h3>

            <form onSubmit={handleSavePlan} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">الرمز التعريفي (اسم فريد بالإنجليزية)</label>
                  <input
                    type="text"
                    required
                    disabled={!!editingPlan}
                    placeholder="مثال: enterprise"
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                    className="w-full rounded-xl border border-slate-755 bg-slate-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">الاسم المعروض (Display Name)</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: خطة المؤسسات"
                    value={planDisplayName}
                    onChange={(e) => setPlanDisplayName(e.target.value)}
                    className="w-full rounded-xl border border-slate-755 bg-slate-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">السعر الشهري ($)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={planPriceMonthly}
                    onChange={(e) => setPlanPriceMonthly(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-755 bg-slate-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">السعر السنوي ($)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={planPriceYearly}
                    onChange={(e) => setPlanPriceYearly(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-755 bg-slate-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Plan limits */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-4 space-y-3">
                <h4 className="text-xs font-bold text-violet-400 uppercase tracking-wide">حدود الاستخدام للخطة (-1 يعني غير محدود)</h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">عدد جهات الاتصال (Contacts Limit)</label>
                    <input
                      type="number"
                      required
                      value={limitContacts}
                      onChange={(e) => setLimitContacts(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-750 bg-slate-800 px-3 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">عدد البث الشهري (Broadcasts Limit)</label>
                    <input
                      type="number"
                      required
                      value={limitBroadcasts}
                      onChange={(e) => setLimitBroadcasts(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-750 bg-slate-800 px-3 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">عدد الأعضاء المضافين (Agents Limit)</label>
                    <input
                      type="number"
                      required
                      value={limitAgents}
                      onChange={(e) => setLimitAgents(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-750 bg-slate-800 px-3 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">عدد عمليات الأتمتة (Automations Limit)</label>
                    <input
                      type="number"
                      required
                      value={limitAutomations}
                      onChange={(e) => setLimitAutomations(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-750 bg-slate-800 px-3 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Dynamic Features List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Arabic Features */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-4">
                  <h4 className="text-xs font-bold text-slate-350 mb-3">المزايا (بالعربية)</h4>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      placeholder="أدخل ميزة جديدة باللغة العربية..."
                      value={newFeatureAr}
                      onChange={(e) => setNewFeatureAr(e.target.value)}
                      className="flex-1 bg-slate-800 border border-slate-750 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-violet-500"
                    />
                    <button
                      type="button"
                      onClick={addFeatureAr}
                      className="bg-violet-650 hover:bg-violet-600 text-white rounded-lg px-3 py-1 text-xs transition"
                    >
                      إضافة
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {featuresAr.map((f, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 bg-slate-900/60 rounded px-2.5 py-1.5 text-xs">
                        <span className="line-clamp-1">{f}</span>
                        <button
                          type="button"
                          onClick={() => removeFeatureAr(idx)}
                          className="text-red-500 hover:text-red-400 font-bold"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {featuresAr.length === 0 && (
                      <p className="text-xs text-slate-600 text-center py-2">لا توجد مزايا مدرجة</p>
                    )}
                  </div>
                </div>

                {/* English Features */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-4">
                  <h4 className="text-xs font-bold text-slate-350 mb-3">Features (in English)</h4>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      placeholder="Add feature in English..."
                      value={newFeatureEn}
                      onChange={(e) => setNewFeatureEn(e.target.value)}
                      className="flex-1 bg-slate-800 border border-slate-750 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-violet-500"
                    />
                    <button
                      type="button"
                      onClick={addFeatureEn}
                      className="bg-violet-650 hover:bg-violet-600 text-white rounded-lg px-3 py-1 text-xs transition"
                    >
                      Add
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {featuresEn.map((f, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 bg-slate-900/60 rounded px-2.5 py-1.5 text-xs">
                        <span className="line-clamp-1">{f}</span>
                        <button
                          type="button"
                          onClick={() => removeFeatureEn(idx)}
                          className="text-red-500 hover:text-red-400 font-bold"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {featuresEn.length === 0 && (
                      <p className="text-xs text-slate-600 text-center py-2">No features added</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="rounded-lg bg-slate-800 hover:bg-slate-750 px-4 py-2 text-sm text-slate-300 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingPlan}
                  className="flex items-center gap-1.5 rounded-lg bg-violet-650 hover:bg-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-lg transition disabled:bg-slate-800 disabled:text-slate-500"
                >
                  <Save className="h-4 w-4" />
                  {savingPlan ? 'جاري الحفظ...' : 'حفظ التغييرات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
