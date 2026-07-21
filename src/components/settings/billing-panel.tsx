'use client';

import { useEffect, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useLanguage } from '@/hooks/use-language';
import { CreditCard, Check, ShieldAlert, Cpu, ExternalLink, Bot, Loader2, Zap, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { isActiveSubscription } from '@/lib/auth/subscription';

function normalizeSubscription(subscription: any) {
  if (!subscription) return null;
  const normalized = { ...subscription };
  if (Array.isArray(normalized.plan)) {
    normalized.plan = normalized.plan[0] ?? null;
  }
  return normalized;
}

interface Plan {
  id: string;
  name: string;
  display_name: string;
  price_monthly: number;
  price_yearly: number;
  limits: Record<string, number>;
  is_active: boolean;
  trial_period_days?: number;
  billing_options?: Array<{ type: string; price: number; days?: number }>;
  features?: Array<{
    id: string;
    name_ar: string;
    name_en: string;
    usage_limit: number;
    bulk_limit: number;
  }>;
}

interface UserSub {
  status: string;
  current_period_end: string | null;
  trial_ends_at?: string | null;
  plan: Plan;
}

export function BillingPanel() {
  const { account, accountRole, profileLoading } = useAuth();
  const { t, language } = useLanguage();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<UserSub | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCycles, setSelectedCycles] = useState<Record<string, string>>({});
  const [activatingTrialPlanId, setActivatingTrialPlanId] = useState<string | null>(null);

  useEffect(() => {
    if (profileLoading) return;
    if (!account?.id) {
      setLoading(false);
      return;
    }
    const accountId = account.id;
    const supabase = createClient();
    let isMounted = true;

    async function loadBillingData() {
      try {
        // Load plans from API to get normalized feature assignments
        const plansRes = await fetch('/api/public/plans', { cache: 'no-store' });
        let plansData = [];
        if (plansRes.ok) {
          const { plans } = await plansRes.json();
          plansData = plans || [];
        }

        // Load current subscription via API to bypass RLS select limitations
        const resSub = await fetch('/api/billing/subscription');
        const resSubData = await resSub.json();
        const subData = resSubData.subscription || null;

        if (!isMounted) return;

        const loadedPlans = (plansData as Plan[]) ?? [];
        setPlans(loadedPlans);

        // Initialize selected cycle per plan
        const initialCycles: Record<string, string> = {};
        loadedPlans.forEach((plan) => {
          const opts = plan.billing_options || [];
          if (opts.length > 0) {
            const first = opts[0];
            initialCycles[plan.id] = first.type === 'custom_days' ? `custom_days_${first.days}` : first.type;
          } else {
            initialCycles[plan.id] = 'monthly';
          }
        });
        setSelectedCycles(initialCycles);

        if (subData) {
          setSubscription(normalizeSubscription(subData));
        }
      } catch (err) {
        console.error('Error loading billing:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadBillingData();

    const channel = supabase
      .channel(`billing-subscription-${accountId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'account_subscriptions',
          filter: `account_id=eq.${accountId}`,
        },
        () => {
          void loadBillingData();
        }
      )
      .subscribe();

    const handleFocus = () => {
      void loadBillingData();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadBillingData();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [account?.id, profileLoading]);

  const handlePayCrypto = async (plan: Plan) => {
    if (!account?.id) return;
    const cycle = selectedCycles[plan.id] || 'monthly';
    toast.loading(t('common.loading', 'جاري تحويلك لبوابة الدفع...'));
    window.location.href = `/api/billing/plisio/create-invoice?planId=${plan.id}&billingPeriod=${cycle}`;
  };

  const handleStartTrial = async (planId: string) => {
    try {
      setActivatingTrialPlanId(planId);
      const res = await fetch('/api/billing/trial/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start trial');

      toast.success(language === 'ar' ? 'تم بدء الفترة التجريبية المجانية بنجاح!' : 'Free trial activated successfully!');
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ أثناء تفعيل الفترة التجريبية');
    } finally {
      setActivatingTrialPlanId(null);
    }
  };

  const limitLabel = (key: string) => {
    const map: Record<string, string> = {
      contacts: 'جهات الاتصال',
      broadcasts: 'البث الشهري',
      agents: 'أعضاء الحساب',
      automations: 'الأتمتة النشطة',
    };
    return map[key] ?? key;
  };

  const getCycleLabel = (cycle: string) => {
    if (cycle === 'monthly') return language === 'ar' ? ' / شهرياً' : ' / month';
    if (cycle === 'yearly') return language === 'ar' ? ' / سنوياً' : ' / year';
    if (cycle === 'lifetime') return language === 'ar' ? ' / مدى الحياة' : ' / lifetime';
    if (cycle.startsWith('custom_days_')) {
      const days = cycle.replace('custom_days_', '');
      return language === 'ar' ? ` / كل ${days} يوم` : ` / ${days} days`;
    }
    return '';
  };

  const getCycleDisplayName = (cycle: string) => {
    if (cycle === 'monthly') return language === 'ar' ? 'شهرياً' : 'Monthly';
    if (cycle === 'yearly') return language === 'ar' ? 'سنوياً' : 'Yearly';
    if (cycle === 'lifetime') return language === 'ar' ? 'مدى الحياة (دفعة واحدة)' : 'Lifetime (one-time)';
    if (cycle.startsWith('custom_days_')) {
      const days = cycle.replace('custom_days_', '');
      return language === 'ar' ? `كل ${days} يوم` : `Every ${days} days`;
    }
    return cycle;
  };

  const getPriceForCycle = (plan: Plan, cycle: string): number => {
    const opts = plan.billing_options || [];
    const matched = opts.find(o => {
      if (o.type === 'custom_days') {
        return cycle === `custom_days_${o.days}`;
      }
      return o.type === cycle;
    });
    if (matched) return matched.price;
    return cycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
      </div>
    );
  }

  const isOwner = accountRole === 'owner';
  const hasUsedTrial = !!subscription?.trial_ends_at;

  return (
    <div className="space-y-6">
      {/* Current Subscription Status */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-600/10 border border-violet-500/20 text-violet-400">
              <CreditCard className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-lg">
                {subscription ? subscription.plan.display_name : 'Free الخطة المجانية'}
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                {subscription
                  ? (subscription.current_period_end
                      ? `${subscription.status === 'trial' ? 'الفترة التجريبية تنتهي في' : 'ينتهي الاشتراك الحالي في'} ${new Date(subscription.current_period_end).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US')}`
                      : (language === 'ar' ? 'اشتراك مدى الحياة نشط' : 'Lifetime subscription active'))
                  : (language === 'ar' ? 'تستمتع بالخطة المجانية ذات الميزات المحدودة' : 'You are enjoying the Free plan with limited features')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
              isActiveSubscription(subscription)
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : subscription?.status === 'trial'
                ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            }`}>
              {isActiveSubscription(subscription)
                ? (language === 'ar' ? 'نشط' : 'Active')
                : subscription?.status === 'trial'
                ? (language === 'ar' ? 'فترة تجريبية' : 'Free Trial')
                : (language === 'ar' ? 'غير نشط' : 'Inactive')}
            </span>
          </div>
        </div>
      </div>

      {/* Pricing Options */}
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-white">ترقية باقة الاشتراك</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            اختر الخطة المناسبة لحجم أعمالك. يمكنك الترقية بضغطة واحدة والدفع الفوري بالعملات الرقمية.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = subscription?.plan.id === plan.id;
            const cycle = selectedCycles[plan.id] || 'monthly';
            const price = getPriceForCycle(plan, cycle);
            const cycleLabel = getCycleLabel(cycle);

            // Get billing options list (fallback to monthly/yearly if empty)
            const options = plan.billing_options && plan.billing_options.length > 0
              ? plan.billing_options
              : [
                  { type: 'monthly', price: plan.price_monthly },
                  { type: 'yearly', price: plan.price_yearly }
                ];

            const hasTrial = plan.trial_period_days && plan.trial_period_days > 0;
            const isTrialEligible = hasTrial && !hasUsedTrial && !isCurrent;

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border p-6 flex flex-col justify-between transition ${
                  plan.name === 'pro'
                    ? 'border-violet-500/50 bg-gradient-to-b from-violet-900/10 to-slate-900/90 shadow-xl'
                    : 'border-slate-800 bg-slate-900/40'
                }`}
              >
                {plan.name === 'pro' && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-600 px-3 py-0.5 text-xs font-bold text-white shadow-md animate-pulse">
                    الباقة الموصى بها
                  </div>
                )}

                <div>
                  <div className="flex items-start justify-between">
                    <h3 className="text-lg font-bold text-white">{plan.display_name}</h3>
                    {hasTrial && (
                      <span className="inline-flex items-center gap-1 rounded bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-400 border border-violet-500/20">
                        <Gift className="h-3 w-3" /> {plan.trial_period_days} أيام تجربة
                      </span>
                    )}
                  </div>

                  {/* Dropdown cycle selector inside card */}
                  {options.length > 1 && (
                    <div className="mt-4">
                      <label className="block text-[10px] text-slate-500 mb-1">دورة الفوترة:</label>
                      <select
                        value={cycle}
                        onChange={(e) => setSelectedCycles(prev => ({ ...prev, [plan.id]: e.target.value }))}
                        className="w-full rounded-lg border border-slate-700 bg-slate-850 px-2.5 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none"
                      >
                        {options.map((opt, idx) => {
                          const val = opt.type === 'custom_days' ? `custom_days_${opt.days}` : opt.type;
                          return (
                            <option key={idx} value={val}>
                              {getCycleDisplayName(val)} - {opt.price}$
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}

                  <div className="mt-4 flex items-end gap-1">
                    <span className="text-4xl font-extrabold text-white">${price}</span>
                    <span className="mb-1 text-slate-400 text-sm">
                      {cycleLabel}
                    </span>
                  </div>

                  <div className="mt-6 space-y-3">
                    {plan.features?.map((f: any) => (
                      <div key={f.id} className="flex items-center gap-2 text-sm text-slate-300">
                        <Check className="h-4 w-4 text-violet-400 shrink-0" />
                        <span className="text-slate-400">{language === 'ar' ? f.name_ar : f.name_en}:</span>
                        <span className="font-semibold ml-auto">
                          {f.usage_limit === -1 ? (language === 'ar' ? '∞ غير محدود' : '∞ Unlimited') : (f.usage_limit > 0 ? f.usage_limit.toLocaleString('ar') : '')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-8 space-y-2.5">
                  {!isOwner ? (
                    <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-300">
                      <ShieldAlert className="h-4 w-4 shrink-0" />
                      <span>{t('settings.onlyOwnerCanBilling', 'مالك الحساب فقط يمكنه تعديل خطة الاشتراك')}</span>
                    </div>
                  ) : isCurrent ? (
                    <button
                      disabled
                      className="w-full rounded-xl bg-slate-800 py-2.5 text-center text-sm font-semibold text-slate-500 cursor-not-allowed"
                    >
                      خطتك الحالية
                    </button>
                  ) : (
                    <>
                      {/* Free Trial Button if eligible */}
                      {isTrialEligible && (
                        <button
                          onClick={() => handleStartTrial(plan.id)}
                          disabled={activatingTrialPlanId !== null}
                          className="w-full flex items-center justify-center gap-2 rounded-xl bg-violet-650 hover:bg-violet-600 py-2.5 text-center text-sm font-bold text-white shadow-lg transition duration-150"
                        >
                          {activatingTrialPlanId === plan.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Zap className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                          )}
                          ابدأ تجربة مجانية {plan.trial_period_days} أيام
                        </button>
                      )}

                      {/* Crypto Checkout Button */}
                      <button
                        onClick={() => handlePayCrypto(plan)}
                        className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-850 hover:bg-slate-800 py-2.5 text-center text-sm font-semibold text-slate-350 shadow-md transition duration-150"
                      >
                        <Cpu className="h-4 w-4" />
                        اشترك بالعملات الرقمية
                      </button>

                      {/* Telegram support option */}
                      <a
                        href="https://t.me/MitaKurdSupportBot"
                        target="_blank"
                        rel="noreferrer"
                        className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-850 py-2 text-center text-xs font-semibold text-slate-400 transition duration-150"
                      >
                        <Bot className="h-3.5 w-3.5 text-sky-500" />
                        دفع وتفعيل يدوي تليجرام
                        <ExternalLink className="h-3 w-3 text-slate-650" />
                      </a>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
