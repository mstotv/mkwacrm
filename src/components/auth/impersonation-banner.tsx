'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { LogOut, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

export function ImpersonationBanner() {
  const [impersonating, setImpersonating] = useState(false);
  const [targetEmail, setTargetEmail] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  const supabase = createClient();

  useEffect(() => {
    const checkImpersonation = () => {
      const stored = localStorage.getItem('wacrm_impersonator_admin');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setAdminEmail(parsed.admin_email || 'الأدمن');
          setImpersonating(true);
          
          // Get current user email (which is the target user)
          supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) {
              setTargetEmail(user.email || '');
            }
          });
        } catch (e) {
          localStorage.removeItem('wacrm_impersonator_admin');
        }
      } else {
        setImpersonating(false);
      }
    };

    checkImpersonation();
    // Poll or listen to local storage changes to keep state reactive
    window.addEventListener('storage', checkImpersonation);
    return () => {
      window.removeEventListener('storage', checkImpersonation);
    };
  }, []);

  const handleStopImpersonating = async () => {
    const stored = localStorage.getItem('wacrm_impersonator_admin');
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored);

      // 1. Log stop action to backend using admin credentials context before changing session
      await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'impersonate_stop',
          targetEmail: targetEmail,
        }),
      });

      // 2. Clear target session and set admin session
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: parsed.access_token,
        refresh_token: parsed.refresh_token,
      });

      if (sessionError) throw sessionError;

      // 3. Clear localStorage key
      localStorage.removeItem('wacrm_impersonator_admin');
      toast.success('تمت العودة لحساب الأدمن بنجاح!');

      // Redirect back to admin users manager
      setTimeout(() => {
        window.location.href = '/admin/users';
      }, 500);

    } catch (err: any) {
      toast.error('حدث خطأ أثناء العودة لحساب الأدمن');
      console.error(err);
    }
  };

  if (!impersonating) return null;

  return (
    <div className="bg-amber-600 text-white font-sans text-xs sm:text-sm font-semibold flex items-center justify-between px-6 py-2.5 w-full z-[9999] relative border-b border-amber-500 shadow-md">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4.5 w-4.5 animate-pulse text-white" />
        <span>
          أنت تتصفح الموقع حالياً كـ <strong className="underline">{targetEmail}</strong> (وضع المحاكاة). حساب الأدمن الخاص بك هو <strong>{adminEmail}</strong>.
        </span>
      </div>
      
      <button
        type="button"
        onClick={handleStopImpersonating}
        className="flex items-center gap-1.5 rounded-lg bg-amber-800 hover:bg-amber-900 border border-amber-700 px-3.5 py-1 text-xs font-bold text-white transition shadow-inner"
      >
        <LogOut className="h-3.5 w-3.5 text-white" />
        الخروج والعودة لحساب الأدمن
      </button>
    </div>
  );
}
