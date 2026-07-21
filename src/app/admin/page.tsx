'use client';

import { useEffect, useState } from 'react';
import AdminWrapper from '@/components/admin/admin-wrapper';
import { createClient } from '@/lib/supabase/client';
import { useAdminLanguage } from '@/contexts/admin-language-provider';
import {
  Users,
  CreditCard,
  TrendingUp,
  Activity,
  ArrowUpRight,
} from 'lucide-react';

interface Stats {
  totalAccounts: number;
  activeSubscriptions: number;
  freeAccounts: number;
  newThisMonth: number;
}

interface RecentAccount {
  id: string;
  name: string;
  created_at: string;
  plan: string;
}

const localDict = {
  ar: {
    title: 'لوحة تحكم الإدارة',
    desc: 'نظرة عامة على منصة MitaKurd for WhatsApp Auto',
    totalAccounts: 'إجمالي الحسابات',
    totalAccountsDesc: 'منذ الإطلاق',
    activeSubscriptions: 'الاشتراكات النشطة',
    activeSubscriptionsDesc: 'مدفوعة حالياً',
    newThisMonth: 'جديد هذا الشهر',
    newThisMonthDesc: 'مستخدمون جدد',
    freeAccounts: 'الحسابات المجانية',
    freeAccountsDesc: 'خطة مجانية',
    recentAccounts: 'آخر الحسابات المسجّلة',
    viewAll: 'عرض الكل',
    loading: 'جاري التحميل...',
    noAccounts: 'لا توجد حسابات بعد',
    free: 'مجاني',
  },
  en: {
    title: 'Admin Dashboard',
    desc: 'Overview of MitaKurd for WhatsApp Auto platform',
    totalAccounts: 'Total Accounts',
    totalAccountsDesc: 'Since launch',
    activeSubscriptions: 'Active Subscriptions',
    activeSubscriptionsDesc: 'Currently paid',
    newThisMonth: 'New This Month',
    newThisMonthDesc: 'New users',
    freeAccounts: 'Free Accounts',
    freeAccountsDesc: 'Free plan',
    recentAccounts: 'Recent Registered Accounts',
    viewAll: 'View All',
    loading: 'Loading...',
    noAccounts: 'No accounts yet',
    free: 'Free',
  }
};

export default function AdminDashboardPage() {
  const { lang, dir } = useAdminLanguage();
  const t = localDict[lang];

  const [stats, setStats] = useState<Stats>({
    totalAccounts: 0,
    activeSubscriptions: 0,
    freeAccounts: 0,
    newThisMonth: 0,
  });
  const [recentAccounts, setRecentAccounts] = useState<RecentAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // Authorization check
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('admin-payload')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: 'account_role=eq.admin' },
        () => {
          checkAdminRole();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const checkAdminRole = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('account_role')
        .eq('user_id', user.id)
        .single();
      
      if (!profile?.account_role || profile.account_role !== 'admin') {
        await supabase.auth.signOut();
        window.location.href = '/login';
      }
    }
  };

  useEffect(() => {
    const supabase = createClient();

    async function fetchStats() {
      try {
        const { count: totalAccounts } = await supabase
          .from('accounts')
          .select('*', { count: 'exact', head: true });

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const { count: newThisMonth } = await supabase
          .from('accounts')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', startOfMonth.toISOString());

        const { count: activeSubscriptions } = await supabase
          .from('account_subscriptions')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active');

        const { data: recent } = await supabase
          .from('accounts')
          .select('id, name, created_at')
          .order('created_at', { ascending: false })
          .limit(5);

        setStats({
          totalAccounts: totalAccounts ?? 0,
          activeSubscriptions: activeSubscriptions ?? 0,
          freeAccounts: (totalAccounts ?? 0) - (activeSubscriptions ?? 0),
          newThisMonth: newThisMonth ?? 0,
        });

        setRecentAccounts(
          (recent ?? []).map(a => ({
            ...a,
            plan: 'Free',
          }))
        );
      } catch (err) {
        console.error('Admin stats error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  const statCards = [
    {
      label: t.totalAccounts,
      value: stats.totalAccounts,
      icon: Users,
      color: 'violet',
      desc: t.totalAccountsDesc,
    },
    {
      label: t.activeSubscriptions,
      value: stats.activeSubscriptions,
      icon: CreditCard,
      color: 'emerald',
      desc: t.activeSubscriptionsDesc,
    },
    {
      label: t.newThisMonth,
      value: stats.newThisMonth,
      icon: TrendingUp,
      color: 'blue',
      desc: t.newThisMonthDesc,
    },
    {
      label: t.freeAccounts,
      value: stats.freeAccounts,
      icon: Activity,
      color: 'amber',
      desc: t.freeAccountsDesc,
    },
  ];

  const colorMap: Record<string, string> = {
    violet: 'from-violet-500 to-purple-600',
    emerald: 'from-emerald-500 to-green-600',
    blue: 'from-blue-500 to-cyan-600',
    amber: 'from-amber-500 to-orange-500',
  };

  return (
    <AdminWrapper>
      <div className="p-8 space-y-8" dir={dir}>
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t.title}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t.desc}
          </p>
        </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 transition hover:border-slate-300 dark:hover:border-slate-700 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-500">
                    {card.label}
                  </p>
                  <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                    {loading ? '...' : card.value.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{card.desc}</p>
                </div>
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${colorMap[card.color]} shadow-lg`}
                >
                  <Icon className="h-5 w-5 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Accounts */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-4">
          <h2 className="font-semibold text-slate-900 dark:text-white">{t.recentAccounts}</h2>
          <a
            href="/admin/users"
            className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300"
          >
            {t.viewAll} <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {loading ? (
            <div className="px-6 py-8 text-center text-sm text-slate-500">
              {t.loading}
            </div>
          ) : recentAccounts.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-slate-500">
              {t.noAccounts}
            </div>
          ) : (
            recentAccounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between px-6 py-4"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{account.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {new Date(account.created_at).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs text-slate-600 dark:text-slate-400">
                  {account.plan === 'Free' ? t.free : account.plan}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
    </AdminWrapper>
  );
}
