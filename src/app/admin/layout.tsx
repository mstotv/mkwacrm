import { AdminSidebar } from '@/components/layout/admin-sidebar';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

