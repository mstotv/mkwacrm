'use client';

import { useAuth } from '@/hooks/use-auth';
import { ShieldAlert, LogOut } from 'lucide-react';

export default function BlockedPage() {
  const { signOut } = useAuth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-center">
      <div className="max-w-md rounded-2xl border border-red-500/20 bg-slate-900/40 p-8 shadow-2xl backdrop-blur-md">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-500">
          <ShieldAlert className="h-8 w-8 animate-bounce" />
        </div>
        
        <h1 className="mt-6 text-2xl font-bold text-white">تم تعليق الحساب</h1>
        <p className="mt-2 text-sm text-slate-400">
          تم حظر أو تعليق هذا الحساب بواسطة الإدارة بسبب انتهاء الاشتراك أو مخالفة الشروط. يرجى التواصل مع الدعم الفني لحل المشكلة.
        </p>

        <div className="my-6 border-t border-slate-800" />

        <h1 className="text-xl font-bold text-white">Account Suspended</h1>
        <p className="mt-2 text-sm text-slate-400">
          This account has been suspended or blocked by the administration. Please contact support to resolve this issue.
        </p>

        <button
          onClick={() => signOut()}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-500 py-2.5 text-sm font-semibold text-white transition duration-150"
        >
          <LogOut className="h-4 w-4" />
          تسجيل الخروج / Log Out
        </button>
      </div>
    </div>
  );
}
