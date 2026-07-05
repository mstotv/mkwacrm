"use client";

import Link from 'next/link';
import { XCircle, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function BillingFailedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        
        {/* Brand logo */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10">
            <MessageSquare className="h-6 w-6 text-red-500" />
          </div>
        </div>

        <div className="space-y-5 animate-in fade-in zoom-in duration-300">
          <div className="flex justify-center">
            <XCircle className="h-16 w-16 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-white">فشلت عملية الدفع</h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            تم إلغاء عملية الدفع بالعملات الرقمية أو انتهت صلاحية الفاتورة المحددة دون سداد. لم يتم خصم أي مبالغ ولم يتم تعديل باقة الاشتراك.
          </p>
          <div className="pt-2 flex flex-col gap-2">
            <Link href="/settings?tab=billing">
              <Button className="w-full bg-green-600 text-white hover:bg-green-700">
                المحاولة مرة أخرى (اختيار خطة)
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline" className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">
                العودة للوحة التحكم
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
