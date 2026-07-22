'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Plus, Trash, Pencil, Check, X, Loader2, Save, Key, GripVertical, Sparkles, Zap, ArrowRight, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminLanguage } from '@/contexts/admin-language-provider';

interface PlanModule {
  feature_id: string;
  name_ar: string;
  name_en: string;
  is_enabled: boolean;
  usage_limit: number;
  bulk_limit: number;
  show_on_landing: boolean;
  yearly_only: boolean;
}

interface PlanAssignment {
  feature_id: string;
  is_enabled: boolean;
  usage_limit: number;
  bulk_limit: number;
  show_on_landing: boolean;
  yearly_only?: boolean;
  feature?: { name_ar: string; name_en: string; sort_order: number };
}

interface Plan {
  id: string;
  name: string;
  display_name: string;
  price_monthly: number;
  price_yearly: number;
  original_price_monthly?: number;
  original_price_yearly?: number;
  is_active: boolean;
  assignments?: PlanAssignment[];
  highlighted?: boolean;
  validity_days?: number;
  trial_period_days?: number;
  billing_options?: any[];
  limits?: any;
}

const localDict = {
  ar: {
    title: 'باقات الاشتراكات',
    desc: 'إدارة خطط SaaS، والمزايا العامة، وحدود الباقات',
    addPackage: 'إضافة باقة',
    loading: 'جاري التحميل...',
    mostPopular: 'الأكثر شعبية',
    mo: 'شهر',
    yr: 'سنة',
    enabledFeatures: 'المزايا المُفعلة',
    feature: 'ميزة',
    more: 'المزيد...',
    noAssigned: 'لا توجد مزايا مخصصة',
    editPackage: 'إعدادات الباقة',
    active: 'نشط',
    disabled: 'مُعطل',
    manualTitle: 'تفعيل اشتراك يدوي',
    manualDesc: 'قم بتعيين باقة لحساب معين وتوثيق الدفع خارج المنصة.',
    accountUuid: 'معرف الحساب (UUID)',
    package: 'الباقة',
    duration: 'المدة',
    activateBtn: 'تفعيل الاشتراك',
    monthly30: 'شهري (30 يوم)',
    yearly365: 'سنوي (365 يوم)',
    everyDays: 'كل {days} يوم',
    savePackage: 'حفظ التغييرات',
    saving: 'جاري الحفظ...',
    cancel: 'إلغاء',
    createNew: 'إنشاء باقة جديدة',
    editTitle: 'تعديل الباقة',
    configLimits: 'تكوين حدود المزايا بناءً على المزايا العامة',
    packageDetails: 'تفاصيل الباقة',
    internalName: 'اسم الباقة (داخلي)',
    displayName: 'اسم العرض',
    monthlyPrice: 'السعر الشهري (USD)',
    yearlyPrice: 'السعر السنوي (USD)',
    validityDays: 'الصلاحية (بالأيام)',
    availableToPurchase: 'متاحة للشراء',
    highlightedPackage: 'باقة مميزة (Highlighted)',
    featuresAndLimits: 'المزايا والحدود',
    manageGlobal: 'إدارة المزايا العامة',
    enable: 'تفعيل',
    globalFeature: 'الميزة العامة',
    usageLimit: 'حد الاستخدام',
    bulkLimit: 'حد البث',
    landingPage: 'صفحة الهبوط',
    yearlyOnly: 'حصري للسنوي',
    noFeatures: 'لم يتم العثور على مزايا. اذهب إلى المزايا العامة لإضافتها.',
    unlimited: 'غير محدود',
    disabledLimit: 'مُعطل',
    toastLoadErr: 'حدث خطأ في تحميل خطط الأسعار',
    toastActive: 'تم تفعيل الخطة',
    toastDisabled: 'تم تعطيل الخطة',
    toastReqFields: 'الرجاء إدخال الحقول المطلوبة',
    toastUpdate: 'تم تحديث خطة الأسعار بنجاح',
    toastAdd: 'تمت إضافة خطة الأسعار الجديدة بنجاح',
    toastSaveErr: 'حدث خطأ أثناء حفظ الخطة: ',
    confirmManual: 'تأكيد تفعيل الاشتراك اليدوي لهذا الحساب؟ (لن يتم سحب أي مبلغ، ولكن سيبدأ الاشتراك في النظام)',
    toastManualOk: 'تم تفعيل الاشتراك يدويًا بنجاح وتوثيق عملية الدفع',
    toastManualErr: 'حدث خطأ أثناء تفعيل الاشتراك: ',
  },
  en: {
    title: 'Subscription Packages',
    desc: 'Manage SaaS plans, global features, and package limits',
    addPackage: 'Add Package',
    loading: 'Loading...',
    mostPopular: 'Most Popular',
    mo: 'mo',
    yr: 'yr',
    enabledFeatures: 'Enabled Features',
    feature: 'Feature',
    more: 'more...',
    noAssigned: 'No assigned features',
    editPackage: 'Configure',
    active: 'Active',
    disabled: 'Disabled',
    manualTitle: 'Manual Activation',
    manualDesc: 'Assign a plan to an account and log an off-platform payment.',
    accountUuid: 'Account UUID',
    package: 'Package',
    duration: 'Duration',
    activateBtn: 'Activate Subscription',
    monthly30: 'Monthly (30 days)',
    yearly365: 'Yearly (365 days)',
    everyDays: 'Every {days} days',
    savePackage: 'Save Changes',
    saving: 'Saving...',
    cancel: 'Cancel',
    createNew: 'Create New Package',
    editTitle: 'Edit Package',
    configLimits: 'Configure package limits based on global features',
    packageDetails: 'Package Details',
    internalName: 'Internal Name',
    displayName: 'Display Name',
    monthlyPrice: 'Monthly Price (USD)',
    yearlyPrice: 'Yearly Price (USD)',
    validityDays: 'Validity (Days)',
    availableToPurchase: 'Available to Purchase',
    highlightedPackage: 'Highlighted Package',
    featuresAndLimits: 'Features & Limits',
    manageGlobal: 'Manage Global Features',
    enable: 'Enable',
    globalFeature: 'Global Feature',
    usageLimit: 'Usage limit',
    bulkLimit: 'Bulk limit',
    landingPage: 'Landing Page',
    yearlyOnly: 'Yearly Only',
    noFeatures: 'No features found. Go to Global Features to add them.',
    unlimited: 'Unlimited',
    disabledLimit: 'Disabled',
    toastLoadErr: 'Failed to load plans',
    toastActive: 'Plan activated',
    toastDisabled: 'Plan disabled',
    toastReqFields: 'Please fill required fields',
    toastUpdate: 'Plan updated successfully',
    toastAdd: 'New plan added successfully',
    toastSaveErr: 'Error saving plan: ',
    confirmManual: 'Confirm manual activation for this account? (No money will be charged, but the subscription will start)',
    toastManualOk: 'Subscription activated manually and logged successfully',
    toastManualErr: 'Error activating subscription: ',
  }
};

export default function AdminSubscriptionsPage() {
  const { lang, dir } = useAdminLanguage();
  const t = localDict[lang];
  const isAr = lang === 'ar';

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);

  // Form states
  const [planName, setPlanName] = useState('');
  const [planDisplayName, setPlanDisplayName] = useState('');
  const [planDisplayNameAr, setPlanDisplayNameAr] = useState('');
  const [planPriceMonthly, setPlanPriceMonthly] = useState<number | ''>('');
  const [planPriceYearly, setPlanPriceYearly] = useState<number>(0);
  const [originalPriceMonthly, setOriginalPriceMonthly] = useState<number>(0);
  const [originalPriceYearly, setOriginalPriceYearly] = useState<number>(0);
  const [isActive, setIsActive] = useState(true);
  const [isHighlighted, setIsHighlighted] = useState(false);
  const [badgeType, setBadgeType] = useState<string>('');
  const [validityDays, setValidityDays] = useState<number>(30);

  const [trialEnabled, setTrialEnabled] = useState(false);
  const [trialPeriodDays, setTrialPeriodDays] = useState(7);

  const [billingOptions, setBillingOptions] = useState<any[]>([]);

  // Features / Modules
  const [libraryFeatures, setLibraryFeatures] = useState<any[]>([]);
  const [modules, setModules] = useState<PlanModule[]>([]);

  // Manual activate states
  const [manualAccountId, setManualAccountId] = useState('');
  const [manualPlanId, setManualPlanId] = useState('');
  const [manualDuration, setManualDuration] = useState('monthly');
  const [manualPaymentMethod, setManualPaymentMethod] = useState('bank_transfer');
  const [activating, setActivating] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    loadLibraryFeatures();
    loadPlans();
  }, []);

  useEffect(() => {
    if (!manualPlanId || plans.length === 0) return;
    const plan = plans.find(p => p.id === manualPlanId);
    const opts = plan?.billing_options || [];
    if (opts.length > 0) {
      const first = opts[0];
      setManualDuration(first.type === 'custom_days' ? `custom_days_${first.days}` : first.type);
    } else {
      setManualDuration('monthly');
    }
  }, [manualPlanId, plans]);

  async function loadLibraryFeatures() {
    try {
      const { data, error } = await supabase
        .from('plan_features_library')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      setLibraryFeatures(data || []);
    } catch (err: any) {
      toast.error(isAr ? 'فشل تحميل المزايا العامة' : 'Failed to load global features');
    }
  }

  async function loadPlans() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('subscription_plans')
        .select(`
          *,
          assignments:plan_feature_assignments (
            feature_id,
            is_enabled,
            usage_limit,
            bulk_limit,
            show_on_landing,
            yearly_only,
            feature:plan_features_library (name_ar, name_en, sort_order)
          )
        `)
        .order('price_monthly', { ascending: true });

      if (error) throw error;
      setPlans((data as Plan[]) || []);
      if (data && data.length > 0) setManualPlanId(data[0].id);
    } catch (err) {
      toast.error(t.toastLoadErr);
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
      toast.success(nextStatus ? t.toastActive : t.toastDisabled);
    } catch (err) {
      toast.error(isAr ? 'فشل تغيير حالة الخطة' : 'Failed to change plan status');
    }
  };

  const openPlanModal = (plan: Plan | null) => {
    setEditingPlan(plan);
    if (plan) {
      setPlanName(plan.name);
      setPlanDisplayName(plan.display_name);
      setPlanDisplayNameAr(plan.display_name_ar || plan.display_name);
      setPlanPriceMonthly(plan.price_monthly);
      setPlanPriceYearly(plan.price_yearly);
      setOriginalPriceMonthly(plan.original_price_monthly ?? 0);
      setOriginalPriceYearly(plan.original_price_yearly ?? 0);
      setIsActive(plan.is_active);
      setIsHighlighted(plan.highlighted ?? false);
      setBadgeType(plan.badge_type || (plan.highlighted ? 'popular' : ''));
      setValidityDays(plan.validity_days ?? 30);
      
      const mappedModules: PlanModule[] = libraryFeatures.map(feat => {
        const assignment = plan.assignments?.find((a: any) => a.feature_id === feat.id);
        return {
          feature_id: feat.id,
          name_ar: feat.name_ar,
          name_en: feat.name_en,
          is_enabled: assignment ? assignment.is_enabled : false,
          usage_limit: assignment ? assignment.usage_limit : -1,
          bulk_limit: assignment ? assignment.bulk_limit : -1,
          show_on_landing: assignment ? assignment.show_on_landing : true,
          yearly_only: assignment ? assignment.yearly_only : false,
        };
      });
      setModules(mappedModules);

      const trialDays = plan.trial_period_days || 0;
      setTrialEnabled(trialDays > 0);
      setTrialPeriodDays(trialDays > 0 ? trialDays : 7);

      const opts = plan.billing_options || [];
      if (opts.length > 0) {
        setBillingOptions(opts);
      } else {
        setBillingOptions([
          { type: 'monthly', price: plan.price_monthly },
          { type: 'yearly', price: plan.price_yearly }
        ]);
      }
    } else {
      setEditingPlan(null);
      setPlanName('');
      setPlanDisplayName('');
      setPlanDisplayNameAr('');
      setPlanPriceMonthly('');
      setPlanPriceYearly(0);
      setOriginalPriceMonthly(0);
      setOriginalPriceYearly(0);
      setIsActive(true);
      setIsHighlighted(false);
      setBadgeType('');
      setValidityDays(30);
      
      const defaultModules: PlanModule[] = libraryFeatures.map(feat => ({
        feature_id: feat.id,
        name_ar: feat.name_ar,
        name_en: feat.name_en,
        is_enabled: false,
        usage_limit: -1,
        bulk_limit: -1,
        show_on_landing: true,
        yearly_only: false,
      }));
      setModules(defaultModules);
      setTrialEnabled(false);
      setTrialPeriodDays(7);
      setBillingOptions([]);
    }
    setShowPlanModal(true);
  };

  const updateModule = (idx: number, field: keyof PlanModule, value: any) => {
    const newModules = [...modules];
    newModules[idx] = { ...newModules[idx], [field]: value };
    setModules(newModules);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planName.trim() || !planDisplayName.trim()) {
      toast.error(t.toastReqFields);
      return;
    }

    try {
      setSavingPlan(true);
      let monthlyPrice = Number(planPriceMonthly);
      let yearlyPrice = Number(planPriceYearly);
      
      const finalOptions = [...billingOptions];
      
      const monthlyIdx = finalOptions.findIndex(o => o.type === 'monthly');
      if (monthlyIdx >= 0) {
        finalOptions[monthlyIdx].price = monthlyPrice;
      } else {
        finalOptions.push({ type: 'monthly', price: monthlyPrice });
      }

      const yearlyIdx = finalOptions.findIndex(o => o.type === 'yearly');
      if (yearlyIdx >= 0) {
        finalOptions[yearlyIdx].price = yearlyPrice;
      } else {
        finalOptions.push({ type: 'yearly', price: yearlyPrice });
      }

      const planPayload = {
        name: planName.trim().toLowerCase(),
        display_name: planDisplayName.trim(),
        display_name_ar: planDisplayNameAr.trim(),
        price_monthly: monthlyPrice,
        price_yearly: yearlyPrice,
        original_price_monthly: originalPriceMonthly > 0 ? Number(originalPriceMonthly) : null,
        original_price_yearly: originalPriceYearly > 0 ? Number(originalPriceYearly) : null,
        trial_period_days: trialEnabled ? Number(trialPeriodDays) : 0,
        billing_options: finalOptions,
        is_active: isActive,
        highlighted: isHighlighted || badgeType === 'popular',
        badge_type: badgeType || null,
        validity_days: Number(validityDays),
        limits: { ...editingPlan?.limits, validity_days: validityDays },
      };

      let planIdToUse = editingPlan?.id;

      if (editingPlan) {
        const { error } = await supabase
          .from('subscription_plans')
          .update(planPayload)
          .eq('id', editingPlan.id);

        if (error) throw error;
        toast.success(t.toastUpdate);
      } else {
        const { data: insertedPlan, error } = await supabase
          .from('subscription_plans')
          .insert(planPayload)
          .select('id')
          .single();

        if (error) throw error;
        planIdToUse = insertedPlan.id;
        toast.success(t.toastAdd);
      }

      if (planIdToUse) {
        const assignmentsToSave = modules.map(mod => ({
          plan_id: planIdToUse,
          feature_id: mod.feature_id,
          is_enabled: mod.is_enabled,
          usage_limit: mod.usage_limit,
          bulk_limit: mod.bulk_limit,
          show_on_landing: mod.show_on_landing,
          yearly_only: mod.yearly_only,
        }));
        
        if (assignmentsToSave.length > 0) {
          const { error: assignError } = await supabase
            .from('plan_feature_assignments')
            .upsert(assignmentsToSave, { onConflict: 'plan_id, feature_id' });
            
          if (assignError) throw assignError;
        }
      }

      setShowPlanModal(false);
      loadPlans();
    } catch (err: any) {
      toast.error(t.toastSaveErr + err.message);
    } finally {
      setSavingPlan(false);
    }
  };

  const handleManualActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualAccountId.trim() || !manualPlanId) return;

    if (!confirm(t.confirmManual)) return;

    try {
      setActivating(true);
      const selectedPlanData = plans.find(p => p.id === manualPlanId);
      let periodEnd = '';
      
      if (manualDuration === 'yearly') {
        const d = new Date();
        d.setFullYear(d.getFullYear() + 1);
        periodEnd = d.toISOString();
      } else if (manualDuration.startsWith('custom_days_')) {
        const days = parseInt(manualDuration.replace('custom_days_', ''), 10);
        const d = new Date();
        d.setDate(d.getDate() + (isNaN(days) ? 30 : days));
        periodEnd = d.toISOString();
      } else {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        periodEnd = d.toISOString();
      }

      let price = 0;
      const opts = (selectedPlanData?.billing_options || []) as Array<{ type: string; price: number; days?: number }>;
      const matched = opts.find(o => {
        if (o.type === 'custom_days') {
          return manualDuration === `custom_days_${o.days}`;
        }
        return o.type === manualDuration;
      });
      if (matched) {
        price = Number(matched.price);
      } else {
        price = manualDuration === 'yearly' ? Number(selectedPlanData?.price_yearly || 0) : Number(selectedPlanData?.price_monthly || 0);
      }

      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_plan',
          accountId: manualAccountId.trim(),
          planId: manualPlanId,
          expiresAt: periodEnd,
          price: price,
          paymentMethod: manualPaymentMethod,
          billingPeriod: manualDuration,
          description: `Manual activation by Super Admin. Plan: ${selectedPlanData?.display_name} (${manualDuration})`,
        }),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to activate plan');

      toast.success(t.toastManualOk);
      setManualAccountId('');
    } catch (err: any) {
      toast.error(t.toastManualErr + err.message);
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="p-8 lg:p-10 space-y-10 min-h-full bg-slate-50/50 dark:bg-[#0B1121] transition-colors duration-200" dir={dir}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">{t.title}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xl leading-relaxed">{t.desc}</p>
        </div>
        <button
          onClick={() => openPlanModal(null)}
          className="group relative inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-violet-500 hover:shadow-lg hover:shadow-violet-500/25 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
        >
          <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
          {t.addPackage}
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500 mb-4" />
          <p className="text-sm font-medium animate-pulse">{t.loading}</p>
        </div>
      ) : (
        <div className="max-w-5xl grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:gap-8">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-3xl border transition-all duration-300 ${
                plan.highlighted
                  ? 'border-violet-500 shadow-xl shadow-violet-500/10 dark:shadow-violet-900/20 bg-white dark:bg-gradient-to-b dark:from-[#111827] dark:to-[#0B1121]'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-lg'
              } ${!plan.is_active ? 'opacity-50 grayscale-[0.5]' : ''}`}
            >
              {/* Highlight Badge */}
              {plan.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <div className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-1.5 text-xs font-bold tracking-wide text-white shadow-lg shadow-violet-500/30">
                    <Sparkles className="h-3.5 w-3.5" />
                    {t.mostPopular}
                  </div>
                </div>
              )}

              <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">{plan.display_name}</h3>
                  <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-1 rounded-md ${
                    plan.highlighted 
                      ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300' 
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}>
                    {plan.name}
                  </span>
                </div>

                <div className="mb-6 flex items-baseline gap-1.5">
                  <span className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">${plan.price_monthly}</span>
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400">/ {t.mo}</span>
                </div>
                {plan.price_yearly > 0 && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 font-medium">
                    ${plan.price_yearly} / {t.yr}
                  </p>
                )}

                <div className="h-px w-full bg-slate-100 dark:bg-slate-800 mb-6" />

                <div className="flex-1 flex flex-col">
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-300 uppercase tracking-wider mb-4">
                    {t.enabledFeatures}
                  </p>
                  {plan.assignments && plan.assignments.length > 0 ? (
                    <ul className="space-y-3.5 mb-8">
                      {plan.assignments.filter(a => a.is_enabled).slice(0, 6).map((a, i) => (
                        <li key={i} className="flex items-center justify-between group">
                          <div className="flex items-center gap-3">
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                              <Check className="h-3 w-3" strokeWidth={3} />
                            </div>
                            <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                              {isAr ? a.feature?.name_ar : a.feature?.name_en || t.feature}
                            </span>
                          </div>
                          {a.usage_limit > 0 && (
                            <span className="text-xs font-mono text-slate-500 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                              {a.usage_limit}
                            </span>
                          )}
                          {a.usage_limit === -1 && (
                            <span className="text-xs font-mono text-emerald-600 dark:text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              ∞
                            </span>
                          )}
                        </li>
                      ))}
                      {plan.assignments.filter(a => a.is_enabled).length > 6 && (
                        <li className="text-xs font-medium text-slate-500 dark:text-slate-500 mt-2">
                          +{plan.assignments.filter(a => a.is_enabled).length - 6} {t.more}
                        </li>
                      )}
                    </ul>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-slate-400 dark:text-slate-600">
                      <Zap className="h-8 w-8 mb-2 opacity-20" />
                      <p className="text-sm">{t.noAssigned}</p>
                    </div>
                  )}
                </div>

                <div className="mt-auto grid grid-cols-2 gap-3">
                  <button
                    onClick={() => openPlanModal(plan)}
                    className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-900 dark:text-white transition hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    <Pencil className="h-4 w-4 text-slate-500" />
                    {t.editPackage}
                  </button>
                  <button
                    onClick={() => handleToggleActive(plan)}
                    className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition border ${
                      plan.is_active
                        ? 'border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {plan.is_active ? t.active : t.disabled}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manual Subscription activation */}
      <div className="mt-12 overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] shadow-sm">
        <div className="border-b border-slate-100 dark:border-slate-800/60 px-8 py-6 bg-slate-50/50 dark:bg-[#111827]/50">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t.manualTitle}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t.manualDesc}</p>
        </div>
        
        <form onSubmit={handleManualActivate} className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
            <div className="md:col-span-4">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">
                {t.accountUuid}
              </label>
              <input
                type="text"
                required
                value={manualAccountId}
                onChange={(e) => setManualAccountId(e.target.value)}
                placeholder="e.g. aa74b889-..."
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1121] px-4 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-shadow font-mono"
              />
            </div>
            
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">
                {t.package}
              </label>
              <div className="relative">
                <select
                  value={manualPlanId}
                  onChange={(e) => setManualPlanId(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1121] px-4 py-3 pr-10 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-shadow cursor-pointer"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>{p.display_name} - ${p.price_monthly}/{t.mo}</option>
                  ))}
                </select>
                <div className={`pointer-events-none absolute inset-y-0 ${dir === 'rtl' ? 'left-0 pl-3' : 'right-0 pr-3'} flex items-center`}>
                  <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
              </div>
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">
                {t.duration}
              </label>
              <div className="relative">
                <select
                  value={manualDuration}
                  onChange={(e) => setManualDuration(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1121] px-4 py-3 pr-10 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-shadow cursor-pointer"
                >
                  {(() => {
                    const plan = plans.find(p => p.id === manualPlanId);
                    const opts = plan?.billing_options || [];
                    if (opts.length > 0) {
                      return opts.map((opt, idx) => {
                        let val = opt.type;
                        let label = `${opt.type} - $${opt.price}`;
                        if (opt.type === 'monthly') label = `${t.monthly30} - $${opt.price}`;
                        else if (opt.type === 'yearly') label = `${t.yearly365} - $${opt.price}`;
                        else if (opt.type === 'custom_days') {
                          val = `custom_days_${opt.days}`;
                          label = `${t.everyDays.replace('{days}', opt.days)} - $${opt.price}`;
                        }
                        return <option key={idx} value={val}>{label}</option>;
                      });
                    }
                    return (
                      <>
                        <option value="monthly">{t.monthly30}</option>
                        <option value="yearly">{t.yearly365}</option>
                      </>
                    );
                  })()}
                </select>
                <div className={`pointer-events-none absolute inset-y-0 ${dir === 'rtl' ? 'left-0 pl-3' : 'right-0 pr-3'} flex items-center`}>
                  <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
              </div>
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={activating}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 dark:bg-white px-4 py-3 text-sm font-semibold text-white dark:text-slate-900 transition hover:bg-slate-800 dark:hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white focus:ring-offset-2 dark:focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {activating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {t.activateBtn}
                    {dir === 'rtl' ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {showPlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setShowPlanModal(false)} />
          
          <div className="relative w-full max-w-6xl h-[90vh] rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1121] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <form onSubmit={handleSavePlan} className="flex flex-col flex-1 overflow-hidden">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 sm:px-8 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-white dark:bg-[#0F172A] z-10 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400">
                    <Pencil className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                      {editingPlan ? t.editTitle : t.createNew}
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{t.configLimits}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowPlanModal(false)}
                    className="rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={savingPlan}
                    className="flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition disabled:opacity-50"
                  >
                    {savingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {savingPlan ? t.saving : t.savePackage}
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8 bg-slate-50/50 dark:bg-[#0B1121]">
                
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-6 shadow-sm">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-mono text-slate-600 dark:text-slate-400">1</span>
                    {t.packageDetails}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">{t.internalName}</label>
                      <input
                        type="text"
                        required
                        value={planName}
                        onChange={(e) => setPlanName(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1121] px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none font-mono transition-shadow"
                        placeholder="e.g. basic, pro"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">{isAr ? 'الاسم الظاهر (إنجليزي)' : 'Display Name (English)'}</label>
                      <input
                        type="text"
                        required
                        value={planDisplayName}
                        onChange={(e) => setPlanDisplayName(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1121] px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-shadow"
                        placeholder="e.g. Pro Plan"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">{isAr ? 'الاسم الظاهر (عربي)' : 'Display Name (Arabic)'}</label>
                      <input
                        type="text"
                        required
                        value={planDisplayNameAr}
                        onChange={(e) => setPlanDisplayNameAr(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1121] px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-shadow"
                        placeholder="e.g. الخطة الأساسية"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">{t.monthlyPrice}</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={planPriceMonthly}
                          onChange={(e) => setPlanPriceMonthly(Number(e.target.value))}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1121] pl-8 pr-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none font-mono transition-shadow"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">{t.yearlyPrice}</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={planPriceYearly}
                          onChange={(e) => setPlanPriceYearly(Number(e.target.value))}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1121] pl-8 pr-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none font-mono transition-shadow"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6 pt-6 border-t border-slate-100 dark:border-slate-800/60">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">
                        {isAr ? 'السعر القديم المشطوب (شهري) - اختياري' : 'Original Monthly Price (Strikethrough)'}
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={originalPriceMonthly || ''}
                          onChange={(e) => setOriginalPriceMonthly(Number(e.target.value))}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1121] pl-8 pr-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none font-mono transition-shadow"
                          placeholder="e.g. 29.99"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">
                        {isAr ? 'السعر القديم المشطوب (سنوي) - اختياري' : 'Original Yearly Price (Strikethrough)'}
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={originalPriceYearly || ''}
                          onChange={(e) => setOriginalPriceYearly(Number(e.target.value))}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1121] pl-8 pr-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none font-mono transition-shadow"
                          placeholder="e.g. 299.99"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 pt-6 border-t border-slate-100 dark:border-slate-800/60">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">{t.validityDays}</label>
                      <input
                        type="number"
                        value={validityDays}
                        onChange={(e) => setValidityDays(Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1121] px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none font-mono transition-shadow"
                      />
                    </div>
                    <div className="flex flex-col justify-end pb-3">
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={isActive}
                            onChange={(e) => setIsActive(e.target.checked)}
                            className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-[#0B1121] transition-all checked:border-violet-600 checked:bg-violet-600 dark:checked:border-violet-500 dark:checked:bg-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                            id="isActiveCheck"
                          />
                          <Check className="pointer-events-none absolute h-3 w-3 text-white opacity-0 transition-opacity peer-checked:opacity-100" strokeWidth={3} />
                        </div>
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                          {t.availableToPurchase}
                        </span>
                      </label>
                    </div>
                    <div className="flex flex-col justify-end pb-3">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">
                        {isAr ? 'شعار التميز (Badge)' : 'Plan Badge'}
                      </label>
                      <select
                        value={badgeType}
                        onChange={(e) => {
                          setBadgeType(e.target.value);
                          if (e.target.value === 'popular') setIsHighlighted(true);
                          else setIsHighlighted(false);
                        }}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1121] px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-shadow cursor-pointer"
                      >
                        <option value="">{isAr ? 'بدون شعار' : 'None'}</option>
                        <option value="popular">{isAr ? 'الأكثر شيوعاً' : 'Most Popular'}</option>
                        <option value="bestseller">{isAr ? 'الأكثر مبيعاً' : 'Best Seller'}</option>
                        <option value="value">{isAr ? 'القيمة الأفضل' : 'Best Value'}</option>
                        <option value="recommended">{isAr ? 'نوصي به' : 'Recommended'}</option>
                        <option value="limited">{isAr ? 'عرض لفترة محدودة' : 'Limited Time'}</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-6 border-t border-slate-100 dark:border-slate-800/60">
                    <div className="flex flex-col justify-center pb-3">
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={trialEnabled}
                            onChange={(e) => setTrialEnabled(e.target.checked)}
                            className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-[#0B1121] transition-all checked:border-violet-600 checked:bg-violet-600 dark:checked:border-violet-500 dark:checked:bg-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                            id="trialEnabledCheck"
                          />
                          <Check className="pointer-events-none absolute h-3 w-3 text-white opacity-0 transition-opacity peer-checked:opacity-100" strokeWidth={3} />
                        </div>
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                          {isAr ? 'تفعيل التجربة المجانية' : 'Enable Free Trial'}
                        </span>
                      </label>
                    </div>
                    {trialEnabled && (
                      <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">
                          {isAr ? 'عدد أيام التجربة المجانية' : 'Free Trial Days'}
                        </label>
                        <input
                          type="number"
                          value={trialPeriodDays}
                          onChange={(e) => setTrialPeriodDays(Number(e.target.value))}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1121] px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none font-mono transition-shadow"
                          placeholder="e.g. 7"
                          min="1"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] shadow-sm overflow-hidden flex flex-col">
                  <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-mono text-slate-600 dark:text-slate-400">2</span>
                      {t.featuresAndLimits}
                    </h3>
                    <a
                      href="/admin/features"
                      className="flex items-center gap-2 rounded-lg bg-slate-100 dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                    >
                      <Plus className="h-4 w-4" /> {t.manageGlobal}
                    </a>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
                      <thead className="bg-slate-50 dark:bg-[#111827] text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="px-6 py-4 w-16 text-center">#</th>
                          <th className="px-6 py-4 w-24 text-center">{t.enable}</th>
                          <th className="px-6 py-4 min-w-[250px] text-right" dir={dir}>{t.globalFeature}</th>
                          <th className="px-6 py-4 w-40 text-center">{t.usageLimit}</th>
                          <th className="px-6 py-4 w-40 text-center">{t.bulkLimit}</th>
                          <th className="px-6 py-4 w-32 text-center">{t.landingPage}</th>
                          <th className="px-6 py-4 w-32 text-center">{t.yearlyOnly}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                        {modules.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                              {t.noFeatures}
                            </td>
                          </tr>
                        ) : modules.map((mod, idx) => (
                          <tr 
                            key={mod.feature_id} 
                            className={`group transition-all duration-200 ${mod.is_enabled ? 'bg-white dark:bg-[#0F172A] hover:bg-slate-50 dark:hover:bg-slate-800/40' : 'bg-slate-50/50 dark:bg-[#0B1121]/50 opacity-60 hover:opacity-100'}`}
                          >
                            <td className="px-6 py-4 text-center text-slate-400 dark:text-slate-600 font-mono text-xs">
                              {idx + 1}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex items-center justify-center">
                                <label className="relative flex items-center justify-center cursor-pointer">
                                  <input 
                                    type="checkbox" 
                                    checked={mod.is_enabled} 
                                    onChange={(e) => updateModule(idx, 'is_enabled', e.target.checked)}
                                    className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-[#0B1121] transition-all checked:border-violet-600 checked:bg-violet-600 dark:checked:border-violet-500 dark:checked:bg-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                                  />
                                  <Check className="pointer-events-none absolute h-3 w-3 text-white opacity-0 transition-opacity peer-checked:opacity-100" strokeWidth={3} />
                                </label>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right" dir={dir}>
                              <div className="flex flex-col gap-0.5">
                                <span className={`font-semibold ${mod.is_enabled ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                                  {isAr ? mod.name_ar : mod.name_en}
                                </span>
                                <span className="text-xs text-slate-400 dark:text-slate-500">
                                  {!isAr ? mod.name_ar : mod.name_en}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <div className={`flex flex-col items-center justify-center gap-2 ${!mod.is_enabled && 'opacity-50 pointer-events-none'}`}>
                                <input 
                                  type="number" 
                                  value={mod.usage_limit} 
                                  onChange={e => updateModule(idx, 'usage_limit', Number(e.target.value))} 
                                  className="w-20 bg-slate-50 dark:bg-[#0B1121] border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-center text-sm font-mono font-medium text-slate-900 dark:text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-shadow disabled:opacity-50" 
                                  title="-1 = Unlimited, 0 = Disabled"
                                  disabled={!mod.is_enabled}
                                />
                                {mod.usage_limit === -1 && (
                                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">{t.unlimited}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <div className={`flex flex-col items-center justify-center gap-2 ${!mod.is_enabled && 'opacity-50 pointer-events-none'}`}>
                                <input 
                                  type="number" 
                                  value={mod.bulk_limit} 
                                  onChange={e => updateModule(idx, 'bulk_limit', Number(e.target.value))} 
                                  className="w-20 bg-slate-50 dark:bg-[#0B1121] border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-center text-sm font-mono font-medium text-slate-900 dark:text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 focus:outline-none transition-shadow disabled:opacity-50" 
                                  title="-1 = Unlimited, 0 = Disabled"
                                  disabled={!mod.is_enabled}
                                />
                                {mod.bulk_limit === -1 && (
                                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">{t.unlimited}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button
                                type="button"
                                onClick={() => mod.is_enabled && updateModule(idx, 'show_on_landing', !mod.show_on_landing)}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${mod.show_on_landing ? 'bg-violet-600' : 'bg-slate-200 dark:bg-slate-700'} ${!mod.is_enabled && 'opacity-50 pointer-events-none'}`}
                              >
                                <span className="sr-only">Toggle</span>
                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${mod.show_on_landing ? (dir === 'rtl' ? '-translate-x-5' : 'translate-x-5') : 'translate-x-0'}`} />
                              </button>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button
                                type="button"
                                onClick={() => mod.is_enabled && updateModule(idx, 'yearly_only', !mod.yearly_only)}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${mod.yearly_only ? 'bg-violet-600' : 'bg-slate-200 dark:bg-slate-700'} ${!mod.is_enabled && 'opacity-50 pointer-events-none'}`}
                              >
                                <span className="sr-only">Toggle</span>
                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${mod.yearly_only ? (dir === 'rtl' ? '-translate-x-5' : 'translate-x-5') : 'translate-x-0'}`} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
