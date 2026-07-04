"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSiteSettings } from "@/hooks/use-site-settings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MessageSquare, UsersRound, Loader2 } from "lucide-react";
import { TelegramLoginWidget, TelegramUser } from "@/components/auth/telegram-widget";

// `useSearchParams` opts the component out of static prerendering
// unless it sits under a Suspense boundary. We split the form into
// a child component so the outer page can prerender the chrome
// (background, card frame) while the form hydrates with the query
// string on the client.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const { settings } = useSiteSettings();
  // Forwarded from `/join/<token>` when the visitor already has an
  // account. After a successful sign-in we send them to the join
  // page to accept rather than to /dashboard.
  const inviteToken = searchParams.get("invite");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(false);
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
        throw new Error(resData.error || 'فشل تسجيل الدخول عبر تليجرام');
      }

      // Complete Supabase verification
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
      setError(err.message || 'حدث خطأ غير متوقع أثناء تسجيل الدخول');
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (inviteToken) {
      router.push(`/join/${encodeURIComponent(inviteToken)}`);
    } else {
      router.push("/dashboard");
    }
  };

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
            {inviteToken ? "Sign in to accept" : "Welcome back"}
          </CardTitle>
          <CardDescription className="text-slate-400">
            {inviteToken
              ? "Sign in and we'll take you to the invitation."
              : "Sign in to your account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-slate-300">
                Email
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
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-slate-300">
                  Password
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-sm text-primary hover:text-primary/80"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>

            <Button
              type="submit"
              disabled={loading || telegramLoading}
              className="mt-2 h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          {/* Telegram Login Option */}
          {process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME && (
            <>
              <div className="relative my-4 flex items-center justify-center">
                <div className="absolute w-full border-t border-slate-800" />
                <span className="relative bg-slate-900 px-3 text-xs text-slate-500 uppercase">
                  أو الدخول عبر تليجرام
                </span>
              </div>
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
            </>
          )}

          <p className="mt-6 text-center text-sm text-slate-400">
            Don&apos;t have an account?{" "}
            <Link
              href={
                inviteToken
                  ? `/signup?invite=${encodeURIComponent(inviteToken)}`
                  : "/signup"
              }
              className="text-primary hover:text-primary/80"
            >
              Create account
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
