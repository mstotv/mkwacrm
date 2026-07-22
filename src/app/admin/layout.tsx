import { AdminSidebar } from '@/components/layout/admin-sidebar';
import type { ReactNode } from 'react';
import { AdminLanguageProvider } from '@/contexts/admin-language-provider';

export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminLanguageProvider>
      {/* Dynamic theme wrapper for the layout */}
      <div className="flex flex-col md:flex-row h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-white overflow-hidden transition-colors duration-200">
        <AdminSidebar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </AdminLanguageProvider>
  );
}
