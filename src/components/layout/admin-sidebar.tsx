'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useSiteSettings } from '@/hooks/use-site-settings';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  BarChart3,
  Settings,
  ChevronRight,
  Zap,
  LifeBuoy,
  FileText,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/admin', label: 'لوحة التحكم', icon: LayoutDashboard, exact: true },
  { href: '/admin/users', label: 'إدارة المستخدمين', icon: Users },
  { href: '/admin/subscriptions', label: 'الاشتراكات', icon: CreditCard },
  { href: '/admin/tickets', label: 'تذاكر الدعم الفني', icon: LifeBuoy },
  { href: '/admin/pending-templates', label: 'القوالب المعلقة', icon: FileText },
  { href: '/admin/analytics', label: 'الإحصائيات', icon: BarChart3 },
  { href: '/admin/settings', label: 'إعدادات المنصة', icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { profile } = useAuth();
  const { settings } = useSiteSettings();

  const role = profile?.platform_role;

  // Assistant admin only sees Support Tickets
  const filteredItems = NAV_ITEMS.filter((item) => {
    if (role === 'assistant_admin') {
      return item.href === '/admin/tickets';
    }
    return true;
  });

  return (
    <aside className="flex h-full w-64 flex-col border-r border-slate-800 bg-slate-950">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-slate-800 px-6 py-5">
        {settings.logo_url ? (
          <img src={settings.logo_url} alt="Logo" className="h-9 w-9 object-contain rounded-xl shrink-0" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg">
            <Zap className="h-5 w-5 text-white" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-bold text-white truncate">{settings.site_name}</p>
          <p className="text-xs text-violet-400">
            {role === 'super_admin' ? 'Super Admin' : 'Assistant Admin'}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {filteredItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-violet-600/20 text-violet-300 ring-1 ring-violet-600/30'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-violet-400' : ''}`} />
              <span className="flex-1">{item.label}</span>
              {isActive && <ChevronRight className="h-3.5 w-3.5 text-violet-400" />}
            </Link>
          );
        })}
      </nav>

      {/* Back to App */}
      <div className="border-t border-slate-800 p-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
        >
          ← العودة إلى التطبيق
        </Link>
      </div>
    </aside>
  );
}
