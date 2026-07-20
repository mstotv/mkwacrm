'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, Eye, EyeOff, Send, Save, Trash2, Info, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/hooks/use-language';
import { createClient } from '@/lib/supabase/client';

export function TelegramNotificationsPanel() {
  const { t } = useLanguage();
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);
  const [showToken, setShowToken] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [tokenMasked, setTokenMasked] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showHowTo, setShowHowTo] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const getAuthHeaders = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    return { Authorization: `Bearer ${session.access_token}` };
  };

  const loadConfig = async () => {
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      const res = await fetch('/api/settings/telegram', { headers });
      const data = await res.json();
      
      if (res.ok && data.configured) {
        setConfigured(true);
        setChatId(data.chat_id || '');
        setIsEnabled(data.is_enabled ?? true);
        setTokenMasked(data.bot_token_masked || '');
        setBotToken(''); // Don't fill the actual token
      } else {
        setConfigured(false);
      }
    } catch (err) {
      console.error('Failed to load Telegram config:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    const tokenToTest = botToken.trim();
    const chatToTest = chatId.trim();

    if (!tokenToTest && !configured) {
      toast.error(t('settings.telegramBotToken') + ' مطلوب');
      return;
    }
    if (!chatToTest) {
      toast.error(t('settings.telegramChatId') + ' مطلوب');
      return;
    }

    // If configured and no new token entered, we need the saved token
    // But test endpoint needs raw token - user must enter it
    if (!tokenToTest) {
      toast.error('أدخل الـ Bot Token للاختبار. لا يمكن اختبار الـ Token المحفوظ لأسباب أمنية.');
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/settings/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_token: tokenToTest, chat_id: chatToTest }),
      });
      const data = await res.json();

      if (data.success) {
        setTestResult({ ok: true, message: t('settings.telegramTestSuccess') });
        toast.success(t('settings.telegramTestSuccess'));
      } else {
        setTestResult({ ok: false, message: data.error || 'Unknown error' });
        toast.error(data.error || 'Test failed');
      }
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message });
      toast.error(err.message);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const chatToSave = chatId.trim();

    if (!chatToSave) {
      toast.error(t('settings.telegramChatId') + ' مطلوب');
      return;
    }
    if (!configured && !botToken.trim()) {
      toast.error(t('settings.telegramBotToken') + ' مطلوب');
      return;
    }

    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const body: any = {
        chat_id: chatToSave,
        is_enabled: isEnabled,
      };
      // Only send token if user typed a new one
      if (botToken.trim()) {
        body.bot_token = botToken.trim();
      }

      const res = await fetch('/api/settings/telegram', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(t('settings.telegramSaveSuccess'));
        setBotToken('');
        await loadConfig();
      } else {
        toast.error(data.error || 'Save failed');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('هل أنت متأكد من حذف إعدادات تيليجرام؟ لن تصلك إشعارات بعد الآن.')) {
      return;
    }

    setDeleting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/settings/telegram', {
        method: 'DELETE',
        headers,
      });
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(t('settings.telegramDeleteSuccess'));
        setConfigured(false);
        setBotToken('');
        setChatId('');
        setIsEnabled(true);
        setTokenMasked('');
        setTestResult(null);
      } else {
        toast.error(data.error || 'Delete failed');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-slate-700 bg-slate-900">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-slate-700 bg-slate-900">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-blue-500/10">
              <Bell className="size-5 text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-white">{t('settings.telegramTitle')}</CardTitle>
              <CardDescription className="text-slate-400 mt-1">
                {t('settings.telegramDescription')}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Toggle */}
          <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <Bell className="size-4 text-blue-400" />
              <span className="text-sm font-medium text-slate-200">{t('settings.telegramEnabled')}</span>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={isEnabled}
                onChange={(e) => setIsEnabled(e.target.checked)}
              />
              <div className="peer h-6 w-11 rounded-full bg-slate-600 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-blue-500 peer-checked:after:translate-x-full" />
            </label>
          </div>

          {/* Bot Token */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">
              {t('settings.telegramBotToken')}
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder={
                  configured
                    ? `${t('settings.telegramBotTokenPlaceholder')} (${tokenMasked})`
                    : t('settings.telegramBotTokenPlaceholder')
                }
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2.5 pr-10 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-200 transition-colors"
              >
                {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {configured && (
              <p className="text-xs text-slate-500">
                Token محفوظ ومشفّر. اتركه فارغاً للحفاظ على Token الحالي، أو أدخل token جديداً لتحديثه.
              </p>
            )}
          </div>

          {/* Chat ID */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">
              {t('settings.telegramChatId')}
            </label>
            <input
              type="text"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder={t('settings.telegramChatIdPlaceholder')}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              dir="ltr"
            />
          </div>

          {/* Test Result */}
          {testResult && (
            <div
              className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
                testResult.ok
                  ? 'border-green-700 bg-green-900/30 text-green-300'
                  : 'border-red-700 bg-red-900/30 text-red-300'
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleTest}
              disabled={testing}
              variant="outline"
              className="border-blue-600 text-blue-400 hover:bg-blue-950 hover:text-blue-300"
            >
              {testing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {t('settings.telegramTestBtn')}
            </Button>

            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {t('settings.telegramSave')}
            </Button>

            {configured && (
              <Button
                onClick={handleDelete}
                disabled={deleting}
                variant="outline"
                className="border-red-600 text-red-400 hover:bg-red-950 hover:text-red-300"
              >
                {deleting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                {t('settings.telegramDelete')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* How-To Guide */}
      <Card className="border-slate-700 bg-slate-900">
        <CardContent className="pt-5">
          <button
            onClick={() => setShowHowTo(!showHowTo)}
            className="flex w-full items-center gap-2 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors"
          >
            <Info className="size-4" />
            {t('settings.telegramHowTo')}
            <span className={`transition-transform ${showHowTo ? 'rotate-180' : ''}`}>▼</span>
          </button>

          {showHowTo && (
            <div className="mt-4 space-y-3 rounded-lg bg-slate-800/50 p-4 text-sm text-slate-300">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-blue-400 font-bold">1.</span>
                <div>
                  <span className="font-semibold text-white">Bot Token:</span>{' '}
                  {t('settings.telegramHowToToken')}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-blue-400 font-bold">2.</span>
                <div>
                  <span className="font-semibold text-white">Chat ID:</span>{' '}
                  {t('settings.telegramHowToChatId')}
                </div>
              </div>
              <div className="mt-3 flex items-start gap-2 rounded border border-amber-700/50 bg-amber-900/20 px-3 py-2 text-amber-300">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{t('settings.telegramHowToStart')}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
