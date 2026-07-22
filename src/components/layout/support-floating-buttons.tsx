'use client';

import React, { useState } from 'react';
import { useSiteSettings } from '@/hooks/use-site-settings';
import { usePathname } from 'next/navigation';
import { X, Send, ChevronRight, MessageSquare } from 'lucide-react';

export function SupportFloatingButtons() {
  const { settings } = useSiteSettings();
  const pathname = usePathname();

  // Hide completely on admin routes
  if (pathname?.startsWith('/admin')) {
    return null;
  }

  const {
    support_whatsapp_enabled,
    support_whatsapp_number,
    support_telegram_enabled,
    support_telegram_username,
  } = settings;

  // Widget States
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [chatLang, setChatLang] = useState<'ar' | 'en' | null>(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [problem, setProblem] = useState('');

  // Render nothing if both are disabled or missing info
  if (!support_whatsapp_enabled && !support_telegram_enabled) return null;

  const handleTelegramClick = () => {
    if (support_telegram_username) {
      window.open(`https://t.me/${support_telegram_username}`, '_blank');
    }
  };

  const handleWhatsappSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1 && !email) return;
    if (step === 2 && !phone) return;
    
    if (step < 3) {
      setStep(step + 1);
      return;
    }

    if (!problem) return;

    // Final Step -> Open WhatsApp
    let message = '';
    if (chatLang === 'ar') {
      message = `*طلب دعم فني جديد*\n*البريد الإلكتروني:* ${email}\n*رقم الهاتف:* ${phone}\n*المشكلة/السؤال:*\n${problem}`;
    } else {
      message = `*New Support Request*\n*Email:* ${email}\n*Phone:* ${phone}\n*Message:*\n${problem}`;
    }
    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${support_whatsapp_number}?text=${encoded}`, '_blank');
    
    // Reset and close
    setIsOpen(false);
    setTimeout(() => {
      setStep(0);
      setChatLang(null);
      setEmail('');
      setPhone('');
      setProblem('');
    }, 300);
  };

  const isAr = chatLang === 'ar';

  return (
    <>
      {/* WhatsApp Chat Widget Modal */}
      {support_whatsapp_enabled && support_whatsapp_number && (
        <div className={`fixed bottom-24 right-6 z-50 w-[340px] rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 transition-all duration-300 origin-bottom-right ${isOpen ? 'scale-100 opacity-100 visible' : 'scale-75 opacity-0 invisible'}`}>
          {/* Header */}
          <div className="flex items-center justify-between bg-[#25D366] p-4 rounded-t-2xl text-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                <MessageSquare className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-sm">MK Whats</h3>
                <p className="text-xs text-white/80">Online | متاح</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 min-h-[250px] flex flex-col justify-end bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl">
            {/* Step 0: Language Selection */}
            {step === 0 && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl rounded-bl-none shadow-sm text-sm text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-700">
                  Welcome to MK Whats! How can we help you today?
                  <br /><br />
                  مرحباً بك في الدعم الفني، يرجى اختيار اللغة لمتابعة المحادثة:
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setChatLang('ar'); setStep(1); }} className="flex-1 bg-[#25D366] text-white py-2.5 rounded-xl text-sm font-bold hover:bg-[#20b958] transition-colors shadow-sm">العربية</button>
                  <button onClick={() => { setChatLang('en'); setStep(1); }} className="flex-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm">English</button>
                </div>
              </div>
            )}

            {/* Step 1: Email */}
            {step === 1 && (
              <form onSubmit={handleWhatsappSubmit} className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl rounded-bl-none shadow-sm text-sm text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-700 inline-block">
                  {isAr ? 'يرجى كتابة بريدك الإلكتروني:' : 'Please enter your email address:'}
                </div>
                <div className="flex gap-2 relative">
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={isAr ? 'name@example.com' : 'name@example.com'}
                    className={`w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm focus:border-[#25D366] focus:ring-1 focus:ring-[#25D366] outline-none ${isAr ? 'text-right' : 'text-left'}`}
                  />
                  <button type="submit" className={`absolute top-1.5 bottom-1.5 ${isAr ? 'left-1.5' : 'right-1.5'} bg-[#25D366] text-white w-9 rounded-lg flex items-center justify-center hover:bg-[#20b958] transition-colors`}>
                    <ChevronRight className={`w-5 h-5 ${isAr ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </form>
            )}

            {/* Step 2: Phone */}
            {step === 2 && (
              <form onSubmit={handleWhatsappSubmit} className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl rounded-bl-none shadow-sm text-sm text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-700 inline-block">
                  {isAr ? 'يرجى كتابة رقم هاتفك مع الرمز الدولي:' : 'Please enter your phone number with country code:'}
                </div>
                <div className="flex gap-2 relative">
                  <input
                    type="tel"
                    required
                    autoFocus
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1234567890"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm focus:border-[#25D366] focus:ring-1 focus:ring-[#25D366] outline-none text-left"
                    dir="ltr"
                  />
                  <button type="submit" className={`absolute top-1.5 bottom-1.5 ${isAr ? 'left-1.5' : 'right-1.5'} bg-[#25D366] text-white w-9 rounded-lg flex items-center justify-center hover:bg-[#20b958] transition-colors`}>
                    <ChevronRight className={`w-5 h-5 ${isAr ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </form>
            )}

            {/* Step 3: Problem */}
            {step === 3 && (
              <form onSubmit={handleWhatsappSubmit} className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl rounded-bl-none shadow-sm text-sm text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-700 inline-block">
                  {isAr ? 'يرجى كتابة سؤالك أو مشكلتك بالتفصيل:' : 'Please describe your question or problem in detail:'}
                </div>
                <div className="relative">
                  <textarea
                    required
                    autoFocus
                    rows={3}
                    value={problem}
                    onChange={(e) => setProblem(e.target.value)}
                    placeholder={isAr ? 'اكتب هنا...' : 'Type here...'}
                    className={`w-full resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 pr-12 text-sm focus:border-[#25D366] focus:ring-1 focus:ring-[#25D366] outline-none ${isAr ? 'text-right' : 'text-left'}`}
                  />
                  <button type="submit" className={`absolute bottom-2 ${isAr ? 'left-2' : 'right-2'} bg-[#25D366] text-white p-2 rounded-lg flex items-center justify-center hover:bg-[#20b958] transition-colors`} title={isAr ? 'إرسال عبر واتساب' : 'Send via WhatsApp'}>
                    <Send className={`w-4 h-4 ${isAr ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* WhatsApp Floating Button - Bottom Right */}
      {support_whatsapp_enabled && support_whatsapp_number && (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-all duration-300 hover:scale-110 active:scale-95 ${isOpen ? 'bg-slate-800 shadow-slate-800/30 rotate-90' : 'bg-[#25D366] shadow-[#25D366]/30'}`}
          aria-label="Contact us on WhatsApp"
        >
          {isOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-7 w-7"
            >
              <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.274.072.376-.043c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.099.824zm-3.423-14.416c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm.082 19.165c-1.353 0-2.678-.344-3.843-.997l-4.249 1.115 1.135-4.143c-.717-1.218-1.095-2.604-1.095-4.04 0-4.407 3.585-7.994 7.992-7.994 4.409 0 8.001 3.589 8.001 7.996 0 4.407-3.593 7.993-8.001 7.993z" />
            </svg>
          )}
        </button>
      )}

      {/* Telegram Button - Bottom Left */}
      {support_telegram_enabled && support_telegram_username && (
        <button
          onClick={handleTelegramClick}
          className="fixed bottom-6 left-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#0088cc] text-white shadow-lg shadow-[#0088cc]/30 transition-transform hover:scale-110 active:scale-95"
          aria-label="Contact us on Telegram"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-7 w-7 pr-1"
          >
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.223-.548.223l.188-2.85 5.18-4.676c.223-.198-.054-.309-.346-.116l-6.405 4.027-2.766-.86c-.602-.188-.616-.602.126-.893l10.812-4.168c.5-.188.95.108.824.906z" />
          </svg>
        </button>
      )}
    </>
  );
}
