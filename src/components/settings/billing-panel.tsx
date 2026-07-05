'use client';

import { useEffect, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useLanguage } from '@/hooks/use-language';
import { CreditCard, Check, ShieldAlert, Cpu, ExternalLink, Bot, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Plan {
  id: string;
  name: string;
  display_name: string;
  price_monthly: number;
  price_yearly: number;
  limits: Record<string, number>;
  is_active: boolean;
}

interface UserSub {
  status: string;
  current_period_end: string;
  plan: Plan;
}

export function BillingPanel() {
  const { account, accountRole, profileLoading } = useAuth();
  const { t } = useLanguage();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<UserSub | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    // Wait until the profile is fully loaded before acting
    if (profileLoading) return;
    // If there's no account after profile loaded, stop loading
    if (!account?.id) {
      setLoading(false);
      return;
    }
    const accountId = account.id;
    const supabase = createClient();

    async function loadBillingData() {
      try {
        // Load plans
        const { data: plansData } = await supabase
          .from('subscription_plans')
          .select('*')
          .eq('is_active', true)
          .order('price_monthly', { ascending: true });

        // Load current subscription
        const { data: subData } = await supabase
          .from('account_subscriptions')
          .select(`
            status,
            current_period_end,
            plan:subscription_plans(*)
          `)
          .eq('account_id', accountId)
          .maybeSingle();

        setPlans((plansData as Plan[]) ?? []);
        if (subData) {
          setSubscription(subData as any);
        }
      } catch (err) {
        console.error('Error loading billing:', err);
      } finally {
        setLoading(false);
      }
    }

    loadBillingData();
  }, [account?.id, profileLoading]);

  const handlePayCrypto = async (plan: Plan) => {
    if (!account?.id) return;
    toast.loading(t('common.loading', 'جاري تحويلك لبوابة الدفع...'));
    window.location.href = `/api/billing/plisio/create-invoice?planId=${plan.id}&billingPeriod=${billingPeriod}`;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
      </div>
    );
  }

  const isOwner = accountRole === 'owner';

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
                  ? `ينتهي الاشتراك الحالي في ${new Date(subscription.current_period_end).toLocaleDateString('ar')}`
                  : 'تستمتع بالخطة المجانية ذات الميزات المحدودة'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${subscription?.status === 'active'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}>
              {subscription?.status === 'active' ? 'نشط' : 'غير نشط'}
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

          {/* Toggle Period */}
          <div className="flex items-center justify-center gap-2 pt-4">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`rounded-lg px-4 py-1.5 text-xs font-medium transition ${billingPeriod === 'monthly'
                  ? 'bg-violet-600 text-white shadow-lg'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
            >
              شهرياً
            </button>
            <button
              onClick={() => setBillingPeriod('yearly')}
              className={`rounded-lg px-4 py-1.5 text-xs font-medium transition ${billingPeriod === 'yearly'
                  ? 'bg-violet-600 text-white shadow-lg'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
            >
              سنوياً
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = subscription?.plan.id === plan.id;
            const price = billingPeriod === 'monthly' ? plan.price_monthly : plan.price_yearly;
            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border p-6 flex flex-col justify-between transition ${plan.name === 'pro'
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
                  <h3 className="text-lg font-bold text-white">{plan.display_name}</h3>
                  <div className="mt-4 flex items-end gap-1">
                    <span className="text-4xl font-extrabold text-white">${price}</span>
                    <span className="mb-1 text-slate-400 text-sm">/{billingPeriod === 'monthly' ? 'شهر' : 'سنة'}</span>
                  </div>

                  <div className="mt-6 space-y-3">
                    {Object.entries(plan.limits).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-2 text-sm text-slate-300">
                        <Check className="h-4 w-4 text-violet-400 shrink-0" />
                        <span className="text-slate-400">{limitLabel(key)}:</span>
                        <span className="font-semibold ml-auto">
                          {value === -1 ? '∞ غير محدود' : value.toLocaleString('ar')}
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
                      <button
                        onClick={() => handlePayCrypto(plan)}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 py-2.5 text-center text-sm font-semibold text-white shadow-lg transition duration-150"
                      >
                        <Cpu className="h-4 w-4" />
                        اشترك بالعملات الرقمية
                      </button>

                      {/* Telegram support option */}
                      <a
                        href="https://t.me/MitaKurdSupportBot"
                        target="_blank"
                        rel="noreferrer"
                        className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-850 hover:bg-slate-800 py-2.5 text-center text-sm font-semibold text-slate-300 transition duration-150"
                      >
                        <Bot className="h-4 w-4 text-sky-400" />
                        دفع وتفعيل يدوي تليجرام
                        <ExternalLink className="h-3 w-3 text-slate-500" />
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
