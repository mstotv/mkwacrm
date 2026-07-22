'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useSiteSettings } from '@/hooks/use-site-settings';
import { useTheme } from '@/hooks/use-theme';
import { useAdminLanguage } from '@/contexts/admin-language-provider';
import { adminDict } from '@/locales/admin';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  BarChart3,
  Settings,
  ChevronRight,
  ChevronLeft,
  Zap,
  Moon,
  Sun,
  Globe,
  Key,
  Menu,
  X
} from 'lucide-react';
import { useEffect, useState, useRef, useCallback } from 'react';

export function AdminSidebar() {
  const pathname = usePathname();
  const { profile } = useAuth();
  const { settings } = useSiteSettings();
  const { colorMode, toggleColorMode } = useTheme();
  const { lang, setLang, dir } = useAdminLanguage();
  const t = adminDict[lang].sidebar;

  const [mounted, setMounted] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280); // Default to a bit wider (280px)
  const [isResizing, setIsResizing] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    setMounted(true);
    const savedWidth = localStorage.getItem('adminSidebarWidth');
    if (savedWidth) {
      setSidebarWidth(Number(savedWidth));
    }
  }, []);

  const startResizing = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (e: MouseEvent) => {
      if (isResizing && sidebarRef.current) {
        let newWidth;
        if (dir === 'rtl') {
          // In RTL, the mouse X decreases as the sidebar grows
          const sidebarRightEdge = sidebarRef.current.getBoundingClientRect().right;
          newWidth = sidebarRightEdge - e.clientX;
        } else {
          // In LTR, the mouse X increases as the sidebar grows
          const sidebarLeftEdge = sidebarRef.current.getBoundingClientRect().left;
          newWidth = e.clientX - sidebarLeftEdge;
        }
        
        if (newWidth >= 240 && newWidth <= 600) {
          setSidebarWidth(newWidth);
          localStorage.setItem('adminSidebarWidth', newWidth.toString());
        }
      }
    },
    [isResizing, dir]
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  const role = profile?.platform_role;

  const NAV_ITEMS = [
    { href: '/admin', label: t.dashboard, icon: LayoutDashboard, exact: true },
    { href: '/admin/users', label: t.users, icon: Users },
    { href: '/admin/subscriptions', label: t.subscriptions, icon: CreditCard },
    { href: '/admin/features', label: t.features, icon: Key },
    { href: '/admin/analytics', label: t.analytics, icon: BarChart3 },
    { href: '/admin/settings', label: t.settings, icon: Settings },
  ];

  const filteredItems = NAV_ITEMS.filter((item) => {
    if (role === 'assistant_admin') {
      return false; 
    }
    return true;
  });

  return (
    <>
      {/* Mobile Header */}
      <div className="md:hidden flex h-14 shrink-0 items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMobileOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold text-slate-900 dark:text-white truncate">
            {settings.site_name}
          </span>
        </div>
      </div>

      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div 
          className="md:hidden fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        ref={sidebarRef}
        style={{ width: `${sidebarWidth}px` }}
        className={`fixed inset-y-0 ${dir === 'rtl' ? 'right-0 border-l' : 'left-0 border-r'} z-50 flex h-full flex-col border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 transition-transform duration-300 shrink-0 md:relative md:translate-x-0 ${isMobileOpen ? 'translate-x-0' : (dir === 'rtl' ? 'translate-x-full' : '-translate-x-full')}`}
      >
        {/* Resizer Handle */}
        <div 
          onMouseDown={startResizing}
          className={`absolute top-0 bottom-0 w-2 cursor-col-resize hidden md:flex items-center justify-center transition-colors group z-50 ${dir === 'rtl' ? '-left-1' : '-right-1'}`}
        >
        <div className={`h-full w-0.5 bg-transparent group-hover:bg-violet-500/50 ${isResizing ? 'bg-violet-500' : ''}`} />
      </div>

      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 px-6 py-5">
        {settings.logo_url ? (
          <img src={settings.logo_url} alt="Logo" className="h-9 w-9 object-contain rounded-xl shrink-0" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg">
            <Zap className="h-5 w-5 text-white" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{settings.site_name}</p>
          <p className="text-xs text-violet-600 dark:text-violet-400">
            {role === 'super_admin' ? 'Super Admin' : 'Assistant Admin'}
          </p>
        </div>
        <button
          onClick={() => setIsMobileOpen(false)}
          className="md:hidden flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
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
                  ? 'bg-violet-100 dark:bg-violet-600/20 text-violet-700 dark:text-violet-300 ring-1 ring-violet-200 dark:ring-violet-600/30'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-violet-600 dark:text-violet-400' : ''}`} />
              <span className="flex-1 whitespace-nowrap overflow-hidden text-ellipsis">{item.label}</span>
              {isActive && (
                dir === 'rtl' ? <ChevronLeft className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400 flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400 flex-shrink-0" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Toggles (Language & Theme) */}
      <div className="border-t border-slate-200 dark:border-slate-800 p-4 space-y-2">
        {mounted && (
          <button
            onClick={toggleColorMode}
            className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-300"
          >
            <div className="flex items-center gap-2">
              {colorMode === 'dark' ? <Sun className="h-4 w-4 flex-shrink-0" /> : <Moon className="h-4 w-4 flex-shrink-0" />}
              <span className="whitespace-nowrap overflow-hidden text-ellipsis">{colorMode === 'dark' ? t.themeLight : t.themeDark}</span>
            </div>
          </button>
        )}

        <button
          onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
          className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-300"
        >
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 flex-shrink-0" />
            <span className="font-mono whitespace-nowrap overflow-hidden text-ellipsis">{t.languageSwitch}</span>
          </div>
        </button>
      </div>

      {/* Back to App */}
      <div className="border-t border-slate-200 dark:border-slate-800 p-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300 whitespace-nowrap overflow-hidden text-ellipsis"
        >
          {dir === 'rtl' ? '←' : '→'} {lang === 'ar' ? 'العودة إلى التطبيق' : 'Back to App'}
        </Link>
      </div>
    </aside>
    </>
  );
}
