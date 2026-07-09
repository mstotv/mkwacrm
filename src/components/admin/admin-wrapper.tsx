'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { canEditSettings } from '@/lib/auth/roles';
import type { AccountRole } from '@/lib/auth/roles';

// Admin authentication wrapper to protect admin routes
function AdminWrapper({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          // Not logged in - redirect to login
          setTimeout(() => {
            window.location.href = '/login';
          }, 0);
          return;
        }

        // Get user profile with account role
        const { data: profile } = await supabase
          .from('profiles')
          .select('account_role')
          .eq('user_id', user.id)
          .single();

        if (!profile?.account_role) {
          // No role assigned - log out
          await supabase.auth.signOut();
          window.location.href = '/login';
          return;
        }

        const isAuthorized = canEditSettings(profile.account_role as AccountRole);
        setIsAdmin(isAuthorized);
        setUser(user);
      } catch (error) {
        console.error('Admin auth error:', error);
        // Unauthorized - redirect to login
        setTimeout(() => {
          window.location.href = '/login';
        }, 0);
      } finally {
        setIsLoading(false);
      }
    };

    checkAdminAccess();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-violet-500 mx-auto"></div>
          <p className="mt-4 text-slate-400">جاري التحقق من الصلاحيات...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 max-w-md w-full">
          <div className="text-center">
            <div className="w-20 h-20 bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">403 - غير مخول</h1>
            <p className="text-slate-400 mb-6">يطلب هذا المسار صلاحية "الأدمن" أو الأعلى.</p>
            <p className="text-sm text-slate-500">إذا كنت تعتقد أنك يجب أن يكون لديك صلاحية الأدمن، يرجى الاتصال بمالك المنصة.</p>
            <div className="mt-6">
              <a 
                href="/dashboard"
                className="inline-block px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
              >
                العودة إلى لوحة التحكم
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children};</>;
}

export default AdminWrapper;
