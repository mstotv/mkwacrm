"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { CheckCircle, Loader2, MessageSquare, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function BillingSuccessPage() {
  const { user, profile, profileLoading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [activated, setActivated] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    if (profileLoading || !user || !profile?.account_id) return;

    let intervalId: NodeJS.Timeout;

    const checkSubscription = async () => {
      try {
        // Query the latest payment request status
        const { data: latestRequest } = await supabase
          .from('payment_requests')
          .select('status')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Also query the active subscription status in database via secure API to bypass RLS select limitations
        const resSub = await fetch('/api/billing/subscription');
        const resSubData = await resSub.json();
        const subscription = resSubData.subscription || null;

        if (latestRequest?.status === 'completed' || subscription?.status === 'active') {
          setActivated(true);
          setChecking(false);
          clearInterval(intervalId);
        }
      } catch (err) {
        console.error('Error verifying subscription activation:', err);
      }
    };

    // Run initial check
    checkSubscription();

    // Set up polling interval (every 3 seconds)
    intervalId = setInterval(() => {
      setElapsed(prev => {
        const next = prev + 3;
        if (next >= 40) {
          // Timeout polling after 40 seconds
          setChecking(false);
          clearInterval(intervalId);
        }
        return next;
      });
      checkSubscription();
    }, 3000);

    return () => clearInterval(intervalId);
  }, [user, profile, profileLoading]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        
        {/* Brand logo */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10">
            <MessageSquare className="h-6 w-6 text-green-500" />
          </div>
        </div>

        {checking ? (
          <div className="space-y-4">
            <div className="flex justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-green-500" />
            </div>
            <h1 className="text-xl font-bold text-white">جاري تأكيد عملية الدفع</h1>
            <p className="text-sm text-slate-400">
              تم استلام معاملتك الرقمية بنجاح. نحن الآن بانتظار تأكيد الشبكة وتفعيل اشتراكك تلقائياً...
            </p>
            <div className="text-xs text-slate-500">
              الوقت المنقضي: {elapsed} ثانية
            </div>
          </div>
        ) : activated ? (
          <div className="space-y-5 animate-in fade-in zoom-in duration-300">
            <div className="flex justify-center">
              <CheckCircle className="h-16 w-16 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-white">تم تفعيل اشتراكك بنجاح!</h1>
            <p className="text-sm text-slate-400">
              شكراً لك! تم استلام وتأكيد دفعتك وتفعيل باقتك المحدثة بالكامل. يمكنك البدء باستخدام جميع المزايا الآن.
            </p>
            <div className="pt-2">
              <Link href="/dashboard">
                <Button className="w-full bg-green-600 text-white hover:bg-green-700">
                  الذهاب للوحة التحكم
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-5 animate-in fade-in zoom-in duration-300">
            <div className="flex justify-center">
              <AlertCircle className="h-16 w-16 text-amber-500" />
            </div>
            <h1 className="text-xl font-bold text-white">المعاملة قيد التأكيد</h1>
            <p className="text-sm text-slate-400 text-right leading-relaxed">
              تستغرق شبكة العملات الرقمية بعض الوقت لتأكيد التحويل. لا تقلق، سيتم تفعيل حسابك تلقائياً فور اكتمال التأكيدات على الشبكة. يمكنك إغلاق هذه الصفحة والتوجه إلى لوحة التحكم لمتابعة العمل.
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <Link href="/dashboard">
                <Button className="w-full bg-green-600 text-white hover:bg-green-700">
                  متابعة إلى لوحة التحكم
                </Button>
              </Link>
              <Link href="/settings?tab=billing">
                <Button variant="outline" className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">
                  عرض تفاصيل الفواتير
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
