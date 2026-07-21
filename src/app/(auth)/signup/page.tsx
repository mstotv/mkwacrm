"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { useLanguage } from "@/hooks/use-language";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MessageSquare, CheckCircle, UsersRound, Loader2 } from "lucide-react";
import { TelegramLoginWidget, TelegramUser } from "@/components/auth/telegram-widget";
import { useRouter } from "next/navigation";

// `useSearchParams` opts the component out of static prerendering
// unless wrapped in Suspense — same pattern as /login.
export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageInner />
    </Suspense>
  );
}

function SignupPageInner() {
  const searchParams = useSearchParams();
  const { settings } = useSiteSettings();
  const { language } = useLanguage();
  const isAr = language === 'ar';
  // When the user lands here from `/join/<token>` we carry the
  // invite token in the query so it survives the signup → email
  // verification → redirect round-trip. `emailRedirectTo` below
  // points back at /join/<token> so the user lands on the redeem
  // step after verifying instead of being dropped on /dashboard.
  const inviteToken = searchParams.get("invite");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleTelegramAuth = async (user: TelegramUser) => {
    setTelegramLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'فشل التسجيل عبر تليجرام');
      }

      // Complete Supabase OTP Magiclink verification
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: resData.token_hash,
        type: 'magiclink'
      });

      if (verifyError) throw verifyError;

      // Redirect
      if (inviteToken) {
        router.push(`/join/${encodeURIComponent(inviteToken)}`);
      } else {
        router.push("/dashboard");
      }
    } catch (err: any) {
      setError(err.message || 'حدث خطأ غير متوقع أثناء التسجيل');
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(isAr ? "كلمات المرور غير متطابقة" : "Passwords do not match");
      return;
    }

    if (!acceptTerms || !acceptPrivacy) {
      setError(isAr ? "يجب الموافقة على شروط الخدمة وسياسة الخصوصية لإنشاء حساب." : "You must agree to the Terms of Service and Privacy Policy to create an account.");
      return;
    }

    if (password.length < 6) {
      setError(isAr ? "يجب أن تتكون كلمة المرور من 6 أحرف على الأقل" : "Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    // If we have an invite token, point Supabase's verification
    // email back at the join page so the user can accept after
    // verifying. Without a token, Supabase uses its default
    // redirect (the app root).
    const emailRedirectTo = inviteToken
      ? `${window.location.origin}/join/${encodeURIComponent(inviteToken)}`
      : undefined;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <Card className="w-full max-w-md border-slate-800 bg-slate-900">
          <CardHeader className="items-center text-center">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <CheckCircle className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-xl text-white">
              {isAr ? "تفقد بريدك الإلكتروني" : "Check your email"}
            </CardTitle>
            <CardDescription className="text-slate-400">
              {isAr ? (
                <>لقد أرسلنا رابط التأكيد إلى <span className="text-white">{email}</span>. يرجى التحقق من صندوق الوارد والضغط على الرابط لتأكيد حسابك.</>
              ) : (
                <>We&apos;ve sent a confirmation link to{" "}
                <span className="text-white">{email}</span>. Please check your
                inbox and click the link to verify your account.</>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={
                inviteToken
                  ? `/login?invite=${encodeURIComponent(inviteToken)}`
                  : "/login"
              }
            >
              <Button
                variant="outline"
                className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                {isAr ? "العودة لتسجيل الدخول" : "Back to sign in"}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <Card className="w-full max-w-md border-slate-800 bg-slate-900">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex items-center justify-center">
            {settings.logo_url ? (
              <img src={settings.logo_url} alt="Logo" className="h-12 w-12 object-contain rounded-xl" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                {inviteToken ? (
                  <UsersRound className="h-6 w-6 text-primary" />
                ) : (
                  <MessageSquare className="h-6 w-6 text-primary" />
                )}
              </div>
            )}
          </div>
          <CardTitle className="text-xl text-white">
            {inviteToken ? (isAr ? "إنشاء حساب والانضمام" : "Create account & join") : (isAr ? "إنشاء حساب" : "Create account")}
          </CardTitle>
          <CardDescription className="text-slate-400">
            {inviteToken
              ? (isAr ? "قم بتأكيد بريدك الإلكتروني، ثم اقبل الدعوة للانضمام إلى الفريق." : "Verify your email, then accept the invitation to join your team.")
              : (isAr ? `ابدأ مع ${settings.site_name} لأتمتة واتساب` : `Get started with ${settings.site_name} for WhatsApp Auto`)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="fullName" className="text-slate-300">
                {isAr ? "الاسم الكامل" : "Full name"}
              </Label>
              <Input
                id="fullName"
                type="text"
                placeholder={isAr ? "الاسم الكامل" : "John Doe"}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-slate-300">
                {isAr ? "البريد الإلكتروني" : "Email"}
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password" className="text-slate-300">
                {isAr ? "كلمة المرور" : "Password"}
              </Label>
              <Input
                id="password"
                type="password"
                placeholder={isAr ? "6 أحرف على الأقل" : "At least 6 characters"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="confirmPassword" className="text-slate-300">
                {isAr ? "تأكيد كلمة المرور" : "Confirm password"}
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder={isAr ? "أعد كتابة كلمة المرور" : "Repeat your password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>

            <div className="flex flex-col gap-3 my-2 bg-slate-950/50 p-4 rounded-xl border border-slate-800">
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative flex items-center justify-center mt-0.5">
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="h-5 w-5 rounded border border-slate-600 bg-slate-800 peer-checked:bg-primary peer-checked:border-primary transition-colors flex items-center justify-center">
                    <CheckCircle className="h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                  </div>
                </div>
                <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                  {isAr ? (
                    <>أوافق على <Link href="/p/terms" target="_blank" className="text-primary hover:underline">شروط الخدمة (Terms of Service)</Link></>
                  ) : (
                    <>I agree to the <Link href="/p/terms" target="_blank" className="text-primary hover:underline">Terms of Service</Link></>
                  )}
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative flex items-center justify-center mt-0.5">
                  <input
                    type="checkbox"
                    checked={acceptPrivacy}
                    onChange={(e) => setAcceptPrivacy(e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="h-5 w-5 rounded border border-slate-600 bg-slate-800 peer-checked:bg-primary peer-checked:border-primary transition-colors flex items-center justify-center">
                    <CheckCircle className="h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                  </div>
                </div>
                <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                  {isAr ? (
                    <>أوافق على <Link href="/p/privacy" target="_blank" className="text-primary hover:underline">سياسة الخصوصية (Privacy Policy)</Link></>
                  ) : (
                    <>I agree to the <Link href="/p/privacy" target="_blank" className="text-primary hover:underline">Privacy Policy</Link></>
                  )}
                </span>
              </label>
            </div>

            <Button
              type="submit"
              disabled={loading || telegramLoading}
              className="mt-2 h-12 md:h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? (isAr ? "جاري إنشاء الحساب..." : "Creating account...") : (isAr ? "إنشاء حساب" : "Create account")}
            </Button>
          </form>

          {/* Telegram Sign Up Option */}
          {process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME && (
            <>
              <div className="relative my-4 flex items-center justify-center">
                <div className="absolute w-full border-t border-slate-800" />
                <span className="relative bg-slate-900 px-3 text-xs text-slate-500 uppercase">
                  {isAr ? "أو التسجيل عبر تليجرام" : "Or sign up with Telegram"}
                </span>
              </div>
              <div className="relative mt-2">
                {(!acceptTerms || !acceptPrivacy) && (
                  <div
                    className="absolute inset-0 z-10 flex items-center justify-center cursor-not-allowed group"
                    onClick={() => setError(isAr ? "يجب الموافقة على شروط الخدمة وسياسة الخصوصية لإنشاء حساب عبر تليجرام." : "You must agree to the Terms and Privacy Policy to sign up with Telegram.")}
                  >
                    <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 text-white text-xs py-1 px-3 rounded shadow-lg pointer-events-none whitespace-nowrap">
                      {isAr ? "الرجاء الموافقة على الشروط والخصوصية أولاً" : "Please accept the Terms and Privacy Policy first"}
                    </div>
                  </div>
                )}
                <div className={(!acceptTerms || !acceptPrivacy) ? "opacity-40 grayscale pointer-events-none transition-all" : "transition-all"}>
                  {telegramLoading ? (
                    <div className="flex justify-center py-2">
                      <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
                    </div>
                  ) : (
                    <TelegramLoginWidget
                      botUsername={process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME}
                      onAuth={handleTelegramAuth}
                    />
                  )}
                </div>
              </div>
            </>
          )}

          <p className="mt-6 text-center text-sm text-slate-400">
            {isAr ? "لديك حساب بالفعل؟ " : "Already have an account? "}
            <Link
              href={
                inviteToken
                  ? `/login?invite=${encodeURIComponent(inviteToken)}`
                  : "/login"
              }
              className="text-primary hover:text-primary/80"
            >
              {isAr ? "تسجيل الدخول" : "Sign in"}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
