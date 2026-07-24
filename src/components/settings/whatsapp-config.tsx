'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Zap,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useLanguage } from '@/hooks/use-language';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import type { WhatsAppConfig as WhatsAppConfigType } from '@/types';

const MASKED_TOKEN = '••••••••••••••••';

type ConnectionStatus = 'connected' | 'disconnected' | 'unknown';
type ResetReason = 'token_corrupted' | 'meta_api_error' | null;

export function WhatsAppConfig() {
  const { t, language } = useLanguage();
  const supabase = createClient();
  // After multi-user, whatsapp_config is one-row-per-account, not
  // one-row-per-user. We pull `accountId` straight off the auth
  // context and key every read off it — so a teammate who just
  // joined an account sees the inviter's saved config without
  // having to re-enter anything.
  const { user, accountId, loading: authLoading, profileLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [config, setConfig] = useState<WhatsAppConfigType | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('unknown');
  const [resetReason, setResetReason] = useState<ResetReason>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const [activeTab, setActiveTab] = useState<'meta' | 'evolution'>('meta');

  // Meta states
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [pin, setPin] = useState('');
  const [tokenEdited, setTokenEdited] = useState(false);

  // Evolution states
  const [evoInstanceName, setEvoInstanceName] = useState('');
  const [evoInstanceToken, setEvoInstanceToken] = useState('');
  const [evoPhone, setEvoPhone] = useState('');
  const [evoApiUrl, setEvoApiUrl] = useState('');
  const [evoQrCode, setEvoQrCode] = useState('');
  const [evoTokenEdited, setEvoTokenEdited] = useState(false);
  const [evoPolling, setEvoPolling] = useState(false); // true while waiting for first QR
  const [evoWebhookUpdating, setEvoWebhookUpdating] = useState(false);

  const isRegistered = Boolean(config?.registered_at);
  const lastRegistrationError = config?.last_registration_error ?? null;

  const [verifyingRegistration, setVerifyingRegistration] = useState(false);
  type RegistrationProbe = {
    live: boolean;
    checks: Record<string, boolean | null>;
    errors?: string[];
    last_registration_error?: string | null;
    registered_at?: string | null;
    subscribed_apps_at?: string | null;
  };
  const [registrationProbe, setRegistrationProbe] =
    useState<RegistrationProbe | null>(null);

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/whatsapp/webhook`
      : '';

  const fetchConfig = useCallback(async (acctId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', acctId)
        .maybeSingle();

      if (error) {
        console.error('Failed to load config row:', error);
      }

      if (data) {
        setConfig(data);
        if (data.connection_type === 'evolution') {
          setEvoInstanceName(data.phone_number_id || '');
          setEvoPhone(data.evolution_phone || '');
          setEvoInstanceToken(MASKED_TOKEN);
          setEvoApiUrl(data.evolution_api_url || '');
          setEvoTokenEdited(false);
          setActiveTab('evolution');
        } else {
          setPhoneNumberId(data.phone_number_id || '');
          setWabaId(data.waba_id || '');
          setAccessToken(MASKED_TOKEN);
          setVerifyToken('');
          setPin('');
          setTokenEdited(false);
          setActiveTab('meta');
        }
      } else {
        setConfig(null);
        setPhoneNumberId('');
        setWabaId('');
        setAccessToken('');
        setVerifyToken('');
        setPin('');
        setTokenEdited(false);
        setEvoInstanceName('');
        setEvoInstanceToken('');
        setEvoPhone('');
        setEvoApiUrl('');
        setEvoQrCode('');
        setEvoTokenEdited(false);
        setActiveTab('meta');
      }
      setRegistrationProbe(null);

      // Verify health via appropriate API
      if (data) {
        try {
          if (data.connection_type === 'evolution') {
            const res = await fetch('/api/whatsapp/evolution/instance', { method: 'GET' });
            const payload = await res.json();

            if (payload.connected) {
              setConnectionStatus('connected');
              setEvoQrCode('');
            } else {
              setConnectionStatus('disconnected');
              if (payload.qrcode) {
                setEvoQrCode(payload.qrcode);
              }
            }
          } else {
            const res = await fetch('/api/whatsapp/config', { method: 'GET' });
            const payload = await res.json();

            if (payload.connected) {
              setConnectionStatus('connected');
              setResetReason(null);
              setStatusMessage('');
            } else {
              setConnectionStatus('disconnected');
              setResetReason(payload.needs_reset ? 'token_corrupted' : payload.reason === 'meta_api_error' ? 'meta_api_error' : null);
              setStatusMessage(payload.message || '');
            }
          }
        } catch (err) {
          console.error('Health check failed:', err);
          setConnectionStatus('disconnected');
        }
      } else {
        setConnectionStatus('disconnected');
        setResetReason(null);
        setStatusMessage('');
      }
    } catch (err) {
      console.error('fetchConfig error:', err);
      toast.error(t('whatsapp.toasts.loadFailed', 'Failed to load WhatsApp configuration'));
    } finally {
      setLoading(false);
    }
  }, [supabase, t]);

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user || !accountId) {
      setLoading(false);
      return;
    }
    fetchConfig(accountId);
  }, [authLoading, profileLoading, user, accountId, fetchConfig]);

  // Evolution status polling — runs whenever we are on the Evolution tab,
  // have a saved config, and haven't connected yet (or are waiting for QR).
  useEffect(() => {
    let intervalId: any;
    const shouldPoll =
      activeTab === 'evolution' &&
      config &&
      connectionStatus !== 'connected';

    if (shouldPoll) {
      // Poll every 3 seconds
      intervalId = setInterval(async () => {
        try {
          const res = await fetch('/api/whatsapp/evolution/instance');
          const data = await res.json();
          if (data.connected) {
            setConnectionStatus('connected');
            setEvoQrCode('');
            setEvoPolling(false);
            clearInterval(intervalId);
            toast.success(t('whatsapp.evolution.connectedSuccess', 'تم ربط واتساب بنجاح عبر Evolution API!'));
          } else if (data.qrcode) {
            setEvoQrCode(data.qrcode);
            setEvoPolling(false);
          }
        } catch (err) {
          console.error('Evolution status check failed:', err);
        }
      }, 3000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [activeTab, config, connectionStatus, t]);

  async function handleSave() {
    if (!phoneNumberId.trim()) {
      toast.error(t('whatsapp.toasts.phoneRequired', 'Phone Number ID is required'));
      return;
    }
    if (!config && (!accessToken.trim() || !tokenEdited)) {
      toast.error(t('whatsapp.toasts.tokenRequiredInitial', 'Access Token is required for initial setup'));
      return;
    }

    try {
      setSaving(true);
      const payload: Record<string, unknown> = {
        phone_number_id: phoneNumberId.trim(),
        waba_id: wabaId.trim() || null,
        verify_token: verifyToken.trim() || null,
        pin: pin.trim() || null,
      };

      if (tokenEdited && accessToken !== MASKED_TOKEN && accessToken.trim()) {
        payload.access_token = accessToken.trim();
      } else if (config) {
        toast.error(t('whatsapp.toasts.reenterToken', 'Please re-enter the Access Token to save changes'));
        setSaving(false);
        return;
      }

      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || t('whatsapp.toasts.saveFailed', 'Failed to save configuration'));
        setSaving(false);
        return;
      }

      if (data.registered === false && data.registration_error) {
        toast.error(
          `${t('whatsapp.toasts.metaRegisterFailed', "Saved, but Meta couldn't register the number:")} ${data.registration_error}`,
          { duration: 12000 },
        );
      } else {
        toast.success(
          data.phone_info?.verified_name
            ? `Live — ${data.phone_info.verified_name} can now receive events.`
            : t('whatsapp.toasts.connectedGeneral', 'WhatsApp connected. Events will start flowing within a minute.'),
        );
        setPin('');
      }

      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('Save error:', err);
      toast.error(t('whatsapp.toasts.saveFailed', 'Failed to save configuration'));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEvolution() {
    if (!evoInstanceName.trim() || !evoPhone.trim()) {
      toast.error(t('whatsapp.evolution.instanceAndPhoneRequired', 'اسم الجلسة ورقم الهاتف مطلوبان'));
      return;
    }
    if (!config && (!evoInstanceToken.trim() || !evoTokenEdited)) {
      toast.error(t('whatsapp.evolution.tokenRequiredInitial', 'Instance Token مطلوب عند الإعداد الأول'));
      return;
    }

    try {
      setSaving(true);
      setEvoQrCode('');   // clear previous QR
      setEvoPolling(false);

      const payload: Record<string, unknown> = {
        instance_name: evoInstanceName.trim(),
        phone: evoPhone.trim(),
        evolution_api_url: evoApiUrl.trim() || null,
      };

      if (evoTokenEdited && evoInstanceToken !== MASKED_TOKEN && evoInstanceToken.trim()) {
        payload.instance_token = evoInstanceToken.trim();
      } else if (config) {
        toast.error(t('whatsapp.evolution.reenterToken', 'الرجاء إعادة إدخال Instance Token لحفظ التغييرات'));
        setSaving(false);
        return;
      }

      const res = await fetch('/api/whatsapp/evolution/instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t('whatsapp.evolution.saveError', 'فشل في حفظ إعدادات Evolution'));
        setSaving(false);
        return;
      }

      if (data.qrcode) {
        // QR returned immediately from create response
        setEvoQrCode(data.qrcode);
        setEvoPolling(false);
        toast.success(t('whatsapp.evolution.sessionCreatedQr', 'تم إعداد الجلسة! امسح QR Code لربط هاتفك.'));
      } else {
        // QR not yet ready — start polling and show spinner
        setEvoPolling(true);
        toast.success(t('whatsapp.evolution.sessionCreatedFetchingQr', 'تم إعداد الجلسة، جاري جلب QR Code...'));
      }

      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('Save Evolution error:', err);
      toast.error(t('whatsapp.evolution.saveError', 'فشل في حفظ إعدادات Evolution'));
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    try {
      setTesting(true);
      const res = await fetch('/api/whatsapp/config', { method: 'GET' });
      const payload = await res.json();

      if (payload.connected) {
        setConnectionStatus('connected');
        setResetReason(null);
        setStatusMessage('');
        toast.success(
          payload.phone_info?.verified_name
            ? `${t('whatsapp.toasts.connectedTo', 'Connected to')} ${payload.phone_info.verified_name}`
            : t('whatsapp.toasts.connectionSuccess', 'API connection successful')
        );
      } else {
        setConnectionStatus('disconnected');
        setResetReason(payload.needs_reset ? 'token_corrupted' : payload.reason === 'meta_api_error' ? 'meta_api_error' : null);
        setStatusMessage(payload.message || '');
        toast.error(payload.message || t('whatsapp.toasts.connectionFailed', 'API connection failed'));
      }
    } catch (err) {
      console.error('Test connection error:', err);
      setConnectionStatus('disconnected');
      toast.error(t('whatsapp.toasts.testFailed', 'Connection test failed. Check network and try again.'));
    } finally {
      setTesting(false);
    }
  }

  async function handleVerifyRegistration() {
    setVerifyingRegistration(true);
    setRegistrationProbe(null);
    try {
      const res = await fetch('/api/whatsapp/config/verify-registration', {
        method: 'GET',
      });
      const data = (await res.json()) as RegistrationProbe;
      setRegistrationProbe(data);
      if (data.live) {
        toast.success(t('whatsapp.toasts.connectedVerified', 'Number is fully wired — Meta is delivering events.'));
      } else {
        toast.error(
          t('whatsapp.toasts.metaRegisterFailed', 'Number is not fully registered. See the checks below for which step failed.'),
          { duration: 8000 },
        );
      }
      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('verify-registration failed:', err);
      toast.error(t('whatsapp.toasts.verifyEndpointError', 'Could not reach the verification endpoint.'));
    } finally {
      setVerifyingRegistration(false);
    }
  }

  async function handleReset() {
    if (!confirm(t('whatsapp.toasts.resetConfirm', 'This will delete the current WhatsApp configuration. Continue?'))) {
      return;
    }

    try {
      setResetting(true);
      const endpoint = config?.connection_type === 'evolution'
        ? '/api/whatsapp/evolution/instance'
        : '/api/whatsapp/config';

      const res = await fetch(endpoint, { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || t('whatsapp.toasts.resetFailed', 'Failed to reset configuration'));
        return;
      }

      toast.success(t('whatsapp.toasts.resetSuccess', 'Configuration cleared. You can now re-enter your credentials.'));
      setConfig(null);
      setPhoneNumberId('');
      setWabaId('');
      setAccessToken('');
      setVerifyToken('');
      setPin('');
      setEvoInstanceName('');
      setEvoInstanceToken('');
      setEvoPhone('');
      setEvoApiUrl('');
      setEvoQrCode('');
      setTokenEdited(false);
      setEvoTokenEdited(false);
      setConnectionStatus('disconnected');
      setResetReason(null);
      setStatusMessage('');
    } catch (err) {
      console.error('Reset error:', err);
      toast.error(t('whatsapp.toasts.resetFailed', 'Failed to reset configuration'));
    } finally {
      setResetting(false);
    }
  }

  function handleCopyWebhookUrl() {
    navigator.clipboard.writeText(webhookUrl);
    toast.success(t('whatsapp.toasts.webhookCopied', 'Webhook URL copied to clipboard'));
  }

  async function handleUpdateWebhook() {
    try {
      setEvoWebhookUpdating(true);
      const res = await fetch('/api/whatsapp/evolution/webhook-update', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t('whatsapp.evolution.webhookUpdateFailed', 'فشل في تحديث الـ Webhook'));
      } else if (data.success) {
        toast.success(`${t('whatsapp.evolution.webhookUpdateSuccess', 'تم تحديث Webhook URL بنجاح:')}\n${data.webhookUrl}`);
      } else {
        toast.error(t('whatsapp.evolution.webhookSetError', 'فشل في ضبط Webhook على خادم Evolution'));
      }
    } catch (err) {
      toast.error(t('whatsapp.evolution.serverConnectionError', 'خطأ في الاتصال بالخادم'));
    } finally {
      setEvoWebhookUpdating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  const showResetBanner = resetReason === 'token_corrupted';

  return (
    <div className="space-y-6 mt-4">
      {/* Connection Type Selection Tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-4">
        <button
          type="button"
          onClick={() => setActiveTab('meta')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'meta'
              ? 'bg-violet-600/15 text-violet-400 border border-violet-850'
              : 'text-slate-400 hover:text-slate-350 hover:bg-slate-900/50'
          }`}
        >
          {t('whatsapp.tabs.meta', 'Meta Cloud API')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('evolution')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'evolution'
              ? 'bg-violet-600/15 text-violet-400 border border-violet-850'
              : 'text-slate-400 hover:text-slate-350 hover:bg-slate-900/50'
          }`}
        >
          {t('whatsapp.tabs.evolution', 'Evolution API (QR Code)')}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      {/* Main config form */}
      <div className="space-y-6">
        {/* Corrupted-token reset banner */}
        {showResetBanner && (
          <Alert className="bg-amber-950/40 border-amber-600/40">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 text-amber-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <AlertTitle className="text-amber-200 mb-1">
                  {t('whatsapp.resetBanner.title', "Stored token can't be decrypted")}
                </AlertTitle>
                <AlertDescription className="text-amber-100/80 text-sm">
                  {statusMessage}
                </AlertDescription>
                <Button
                  onClick={handleReset}
                  disabled={resetting}
                  size="sm"
                  className="mt-3 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {resetting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {t('whatsapp.resetBanner.buttonResetting', 'Resetting...')}
                    </>
                  ) : (
                    <>
                      <RotateCcw className="size-4" />
                      {t('whatsapp.resetBanner.button', 'Reset Configuration')}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Alert>
        )}

        {/* Connection Status */}
        <Alert className="bg-slate-900 border-slate-700">
          <div className="flex items-center gap-2">
            {connectionStatus === 'connected' ? (
              <CheckCircle2 className="size-4 text-primary" />
            ) : (
              <XCircle className="size-4 text-red-500" />
            )}
            <AlertTitle className="text-white mb-0">
              {connectionStatus === 'connected'
                ? t('whatsapp.status.valid', 'Credentials valid')
                : t('whatsapp.status.notConnected', 'Not Connected')}
            </AlertTitle>
          </div>
          <AlertDescription className="text-slate-400">
            {connectionStatus === 'connected'
              ? t('whatsapp.status.metaDesc', 'Your access token authenticates with Meta. See Registration status below for whether webhooks are actually wired.')
              : statusMessage ||
                 t('whatsapp.status.notConnectedDesc', 'Configure your Meta API credentials below to connect your WhatsApp Business account.')}
          </AlertDescription>
        </Alert>

         {/* Registration Status and Form depending on Tab */}
        {activeTab === 'meta' ? (
          <div className="space-y-6">
            {/* Registration Status — the "is it actually live?" check. */}
            {config && (
              <Alert
                className={
                  isRegistered
                    ? 'bg-emerald-950/30 border-emerald-700/50'
                    : 'bg-amber-950/30 border-amber-700/50'
                }
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    {isRegistered ? (
                      <CheckCircle2 className="size-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="size-4 text-amber-400" />
                    )}
                    <AlertTitle
                      className={
                        'mb-0 ' + (isRegistered ? 'text-emerald-200' : 'text-amber-200')
                      }
                    >
                      {isRegistered
                        ? t('whatsapp.meta.registeredTitle', 'Registered — Meta will deliver events to wacrm')
                        : t('whatsapp.meta.notRegisteredTitle', 'Not registered — Meta will not deliver events')}
                    </AlertTitle>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleVerifyRegistration}
                    disabled={verifyingRegistration}
                    className="border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800 h-7"
                  >
                    {verifyingRegistration ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Zap className="size-3.5" />
                    )}
                    {t('whatsapp.meta.verifyBtn', 'Verify with Meta')}
                  </Button>
                </div>
                <AlertDescription className="text-slate-400 mt-2 text-xs leading-relaxed">
                  {isRegistered ? (
                    <>
                      {t('whatsapp.meta.subscribedSince', 'Subscribed since')}{' '}
                      {config.registered_at
                        ? new Date(config.registered_at).toLocaleString()
                        : t('whatsapp.meta.unknownDate', 'unknown')}
                      . {t('whatsapp.meta.verifyPrompt', 'Click Verify with Meta if events stop arriving.')}
                    </>
                  ) : lastRegistrationError ? (
                    <>
                      {t('whatsapp.meta.lastAttemptFailed', 'Last attempt failed with:')}{' '}
                      <span className="text-red-300">
                        &quot;{lastRegistrationError}&quot;
                      </span>
                      . {t('whatsapp.meta.pinRetryPrompt', 'Enter (or correct) the 2-step PIN below and click Save Configuration to retry.')}
                    </>
                  ) : (
                    <>
                      {t('whatsapp.meta.oldConfigPrompt', 'This number was saved before registration tracking existed, or registration was skipped. Enter the 2-step PIN below and click Save Configuration to subscribe it.')}
                    </>
                  )}
                </AlertDescription>

                {registrationProbe && (
                  <div className="mt-3 rounded border border-slate-700 bg-slate-900/60 px-3 py-2 space-y-1.5 text-[11px]">
                    <p className="font-medium text-slate-200">
                      {t('whatsapp.meta.diagnostic', 'Diagnostic — last run:')}{' '}
                      <span className={registrationProbe.live ? 'text-emerald-400' : 'text-amber-400'}>
                        {registrationProbe.live ? t('whatsapp.meta.live', 'live') : t('whatsapp.meta.notLive', 'not live')}
                      </span>
                    </p>
                    <ul className="space-y-0.5 text-slate-400">
                      {Object.entries(registrationProbe.checks).map(([k, v]) => (
                        <li key={k} className="flex items-center gap-1.5">
                          {v === true ? (
                            <CheckCircle2 className="size-3 text-emerald-400 shrink-0" />
                          ) : v === false ? (
                            <XCircle className="size-3 text-red-400 shrink-0" />
                          ) : (
                            <span className="size-3 rounded-full border border-slate-600 shrink-0" />
                          )}
                          <code className="text-slate-300">{k}</code>
                        </li>
                      ))}
                    </ul>
                    {(registrationProbe.errors ?? []).length > 0 && (
                      <ul className="pt-1 space-y-0.5 text-red-300">
                        {registrationProbe.errors?.map((e, i) => (
                          <li key={i}>• {e}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </Alert>
            )}

            {/* API Credentials */}
            <Card className="bg-slate-900 border-slate-700 ring-0 ring-transparent">
              <CardHeader>
                <CardTitle className="text-white">{t('whatsapp.meta.apiCredentialsTitle', 'API Credentials')}</CardTitle>
                <CardDescription className="text-slate-400">
                  {t('whatsapp.meta.apiCredentialsDesc', 'Enter your Meta WhatsApp Business API credentials.')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">{t('whatsapp.meta.phoneNumberId', 'Phone Number ID')}</Label>
                  <Input
                    placeholder={t('whatsapp.meta.phoneNumberIdPlaceholder', 'e.g. 100234567890123')}
                    value={phoneNumberId}
                    onChange={(e) => setPhoneNumberId(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300">{t('whatsapp.meta.wabaId', 'WhatsApp Business Account ID')}</Label>
                  <Input
                    placeholder={t('whatsapp.meta.wabaIdPlaceholder', 'e.g. 100234567890456')}
                    value={wabaId}
                    onChange={(e) => setWabaId(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300">{t('whatsapp.meta.accessToken', 'Permanent Access Token')}</Label>
                  <div className="relative">
                    <Input
                      type={showToken ? 'text' : 'password'}
                      placeholder={t('whatsapp.meta.accessTokenPlaceholder', 'Enter your access token')}
                      value={accessToken}
                      onChange={(e) => {
                        setAccessToken(e.target.value);
                        setTokenEdited(true);
                      }}
                      onFocus={() => {
                        if (accessToken === MASKED_TOKEN) {
                          setAccessToken('');
                          setTokenEdited(true);
                        }
                      }}
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                    >
                      {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  {config && !tokenEdited && (
                    <p className="text-xs text-slate-500">
                      {t('whatsapp.meta.tokenHidden', 'Token is hidden for security. Re-enter it to update configuration.')}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300">{t('whatsapp.meta.verifyToken', 'Webhook Verify Token')}</Label>
                  <Input
                    placeholder={t('whatsapp.meta.verifyTokenPlaceholder', 'Create a custom verify token')}
                    value={verifyToken}
                    onChange={(e) => setVerifyToken(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                  />
                  <p className="text-xs text-slate-500">
                    {t('whatsapp.meta.verifyTokenHint', 'A custom string you create. Must match the token you set in Meta webhook settings.')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300">
                    {t('whatsapp.meta.pin', 'Two-step verification PIN')}
                    {!isRegistered && (
                      <span className="ml-1 text-red-400">*</span>
                    )}
                  </Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder={t('whatsapp.meta.pinPlaceholder', '6-digit PIN from Meta WhatsApp Manager')}
                    value={pin}
                    onChange={(e) =>
                      setPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 tracking-widest"
                  />
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {t('whatsapp.meta.pinHint', 'Required the first time you connect a number, and any time you swap to a different number. Leave blank to keep an existing registration untouched.')}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Webhook URL */}
            <Card className="bg-slate-900 border-slate-700 ring-0 ring-transparent">
              <CardHeader>
                <CardTitle className="text-white">{t('whatsapp.meta.webhookTitle', 'Webhook Configuration')}</CardTitle>
                <CardDescription className="text-slate-400">
                  {t('whatsapp.meta.webhookDesc', 'Use this URL as your webhook callback in the Meta App Dashboard.')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label className="text-slate-300">{t('whatsapp.meta.webhookUrlLabel', 'Webhook Callback URL')}</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={webhookUrl}
                      className="bg-slate-800 border-slate-700 text-slate-300 font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleCopyWebhookUrl}
                      className="shrink-0 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
                    >
                      <Copy className="size-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t('whatsapp.buttons.saving', 'Saving...')}
                  </>
                ) : (
                  t('whatsapp.buttons.save', 'Save Configuration')
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={testing || !config}
                className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
              >
                {testing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t('whatsapp.buttons.testing', 'Testing...')}
                  </>
                ) : (
                  <>
                    <Zap className="size-4" />
                    {t('whatsapp.buttons.test', 'Test API Connection')}
                  </>
                )}
              </Button>
              {config && (
                <Button
                  variant="outline"
                  onClick={handleReset}
                  disabled={resetting}
                  className="border-red-900 text-red-400 hover:text-red-300 hover:bg-red-950/40"
                >
                  {resetting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {t('whatsapp.buttons.resetting', 'Resetting...')}
                    </>
                  ) : (
                    <>
                      <RotateCcw className="size-4" />
                      {t('whatsapp.buttons.reset', 'Reset Configuration')}
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Evolution API Configuration Card */}
            <Card className="bg-slate-900 border-slate-700 ring-0 ring-transparent">
              <CardHeader>
                <CardTitle className="text-white">{t('whatsapp.evolution.title', 'إعدادات Evolution API')}</CardTitle>
                <CardDescription className="text-slate-400">
                  {t('whatsapp.evolution.desc', 'أدخل بيانات مثيل Evolution لربط هاتفك وحسابك عبر الباركود QR.')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-slate-300">{t('whatsapp.evolution.instanceName', 'اسم الجلسة / المثيل (Instance Name)')}</Label>
                    <Input
                      placeholder={t('whatsapp.evolution.instanceNamePlaceholder', 'e.g. MySession')}
                      value={evoInstanceName}
                      onChange={(e) => setEvoInstanceName(e.target.value)}
                      disabled={config?.status === 'connected'}
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300">{t('whatsapp.evolution.phone', 'رقم الهاتف (WhatsApp Phone)')}</Label>
                    <Input
                      placeholder={t('whatsapp.evolution.phonePlaceholder', 'e.g. 967771234567')}
                      value={evoPhone}
                      onChange={(e) => setEvoPhone(e.target.value)}
                      disabled={config?.status === 'connected'}
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300">{t('whatsapp.evolution.instanceToken', 'توكن المثيل (Instance Token)')}</Label>
                  <Input
                    type="password"
                    placeholder={config ? MASKED_TOKEN : t('whatsapp.evolution.tokenPlaceholder', 'أدخل توكن الأمان الخاص بالمثيل')}
                    value={evoInstanceToken}
                    onChange={(e) => {
                      setEvoInstanceToken(e.target.value);
                      setEvoTokenEdited(true);
                    }}
                    disabled={config?.status === 'connected'}
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300">{t('whatsapp.evolution.apiUrl', 'رابط خادم Evolution (اختياري)')}</Label>
                  <Input
                    placeholder={t('whatsapp.evolution.apiUrlPlaceholder', 'e.g. https://evolution.mycrm.com (اترك فارغاً لاستخدام الخادم الرئيسي)')}
                    value={evoApiUrl}
                    onChange={(e) => setEvoApiUrl(e.target.value)}
                    disabled={config?.status === 'connected'}
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                  />
                </div>

                {config?.status !== 'connected' && (
                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handleSaveEvolution}
                      disabled={saving}
                      className="bg-violet-650 hover:bg-violet-600 text-white shadow-lg transition"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          {t('whatsapp.evolution.savingBtn', 'جاري حفظ وإعداد الجلسة...')}
                        </>
                      ) : (
                        t('whatsapp.evolution.saveBtn', 'حفظ وإعداد الجلسة')
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Evolution Webhook Info */}
            <Card className="bg-slate-900 border-slate-700 ring-0 ring-transparent">
              <CardHeader>
                <CardTitle className="text-white">{t('whatsapp.evolution.webhookTitle', 'رابط الويب هوك الخاص بـ Evolution')}</CardTitle>
                <CardDescription className="text-slate-400">
                  {t('whatsapp.evolution.webhookDesc', 'يرجى تهيئة رابط الويب هوك التالي في إعدادات الـ Evolution (حدث MESSAGES_UPSERT).')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={`${webhookUrl}/evolution`}
                      className="bg-slate-800 border-slate-700 text-slate-300 font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(`${webhookUrl}/evolution`);
                        toast.success(t('whatsapp.evolution.webhookCopied', 'تم نسخ رابط ويب هوك Evolution!'));
                      }}
                      className="shrink-0 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
                    >
                      <Copy className="size-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* QR Scanner Display */}
            {connectionStatus !== 'connected' && evoQrCode && (
              <Card className="bg-slate-900 border-amber-500/20 p-6 text-center space-y-4">
                <div className="max-w-xs mx-auto space-y-3">
                  <h4 className="font-bold text-white text-base">{t('whatsapp.evolution.qrTitle', 'امسح الباركود لربط الهاتف')}</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {t('whatsapp.evolution.qrInstructions', 'افتح واتساب على هاتفك ← الأجهزة المرتبطة ← ربط جهاز ← ووجه الكاميرا نحو الشاشة.')}
                  </p>
                  <div className="bg-white p-4 rounded-2xl inline-block border border-slate-800 shadow-md">
                    <img
                      src={evoQrCode.startsWith('data:image') ? evoQrCode : `data:image/png;base64,${evoQrCode}`}
                      alt="WhatsApp Link QR Code"
                      className="size-48 object-contain mx-auto"
                    />
                  </div>
                  <p className="text-[10px] text-amber-400 animate-pulse">
                    {t('whatsapp.evolution.pollingStatus', 'يتم فحص حالة الاتصال تلقائياً كل 3 ثوانٍ...')}
                  </p>
                </div>
              </Card>
            )}

            {/* Waiting for QR — shown after save when QR not yet returned */}
            {connectionStatus !== 'connected' && !evoQrCode && evoPolling && (
              <Card className="bg-slate-900 border-slate-700 p-8 text-center">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="size-10 animate-spin text-violet-400" />
                  <p className="text-slate-300 text-sm font-medium">{t('whatsapp.evolution.fetchingQrTitle', 'جاري إنشاء الجلسة وجلب QR Code...')}</p>
                  <p className="text-slate-500 text-xs">{t('whatsapp.evolution.fetchingQrSub', 'قد يستغرق هذا بضع ثوانٍ')}</p>
                </div>
              </Card>
            )}

            {/* Evolution Action Buttons */}
            {config?.connection_type === 'evolution' && (
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={handleUpdateWebhook}
                  disabled={evoWebhookUpdating}
                  className="border-violet-800 text-violet-400 hover:text-violet-300 hover:bg-violet-950/40"
                  title={t('whatsapp.evolution.updateWebhookTooltip', 'يجب تشغيل هذا بعد نشر المنصة على رابط عام لضمان استقبال الرسائل')}
                >
                  {evoWebhookUpdating ? (
                    <><Loader2 className="size-4 animate-spin" />{t('whatsapp.evolution.updatingWebhook', 'جاري التحديث...')}</>
                  ) : (
                    <><Zap className="size-4" />{t('whatsapp.evolution.updateWebhookBtn', 'تحديث Webhook URL')}</>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleReset}
                  disabled={resetting}
                  className="border-red-900 text-red-400 hover:text-red-300 hover:bg-red-950/40"
                >
                  {resetting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {t('whatsapp.buttons.resetting', 'Resetting...')}
                    </>
                  ) : (
                    <>
                      <RotateCcw className="size-4" />
                      {t('whatsapp.evolution.disconnectBtn', 'قطع اتصال الجلسة وحذف الإعدادات')}
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Setup Instructions Sidebar */}
      <div>
        <Card className="bg-slate-900 border-slate-700 ring-0 ring-transparent">
          <CardHeader>
            <CardTitle className="text-white text-base">{t('whatsapp.instructions.title', 'Setup Instructions')}</CardTitle>
            <CardDescription className="text-slate-400">
              {t('whatsapp.instructions.desc', 'Follow these steps to connect your WhatsApp Business API.')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion>
              <AccordionItem className="border-slate-700">
                <AccordionTrigger className="text-slate-300 hover:text-white hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
                    {t('whatsapp.instructions.step1Title', 'Create a Meta App')}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-slate-400">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>{t('whatsapp.instructions.step1_1', 'Go to developers.facebook.com')}</li>
                    <li>{t('whatsapp.instructions.step1_2', 'Click "My Apps" and then "Create App"')}</li>
                    <li>{t('whatsapp.instructions.step1_3', 'Select "Business" as the app type')}</li>
                    <li>{t('whatsapp.instructions.step1_4', 'Fill in app details and create')}</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem className="border-slate-700">
                <AccordionTrigger className="text-slate-300 hover:text-white hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
                    {t('whatsapp.instructions.step2Title', 'Add WhatsApp Product')}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-slate-400">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>{t('whatsapp.instructions.step2_1', 'In your app dashboard, click "Add Product"')}</li>
                    <li>{t('whatsapp.instructions.step2_2', 'Find "WhatsApp" and click "Set Up"')}</li>
                    <li>{t('whatsapp.instructions.step2_3', 'Follow the setup wizard to link your business')}</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem className="border-slate-700">
                <AccordionTrigger className="text-slate-300 hover:text-white hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
                    {t('whatsapp.instructions.step3Title', 'Get API Credentials')}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-slate-400">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>{t('whatsapp.instructions.step3_1', 'Go to WhatsApp > API Setup')}</li>
                    <li>{t('whatsapp.instructions.step3_2', 'Copy your Phone Number ID')}</li>
                    <li>{t('whatsapp.instructions.step3_3', 'Copy your WhatsApp Business Account ID')}</li>
                    <li>{t('whatsapp.instructions.step3_4', 'Generate a Permanent Access Token from Business Settings > System Users')}</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem className="border-slate-700">
                <AccordionTrigger className="text-slate-300 hover:text-white hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">4</span>
                    {t('whatsapp.instructions.step4Title', 'Configure Webhooks')}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-slate-400">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>{t('whatsapp.instructions.step4_1', 'Go to WhatsApp > Configuration')}</li>
                    <li>{t('whatsapp.instructions.step4_2', 'Click "Edit" on the Webhook section')}</li>
                    <li>{t('whatsapp.instructions.step4_3', 'Paste the Webhook Callback URL from above')}</li>
                    <li>{t('whatsapp.instructions.step4_4', 'Enter the same Verify Token you set here')}</li>
                    <li>{t('whatsapp.instructions.step4_5', 'Subscribe to "messages" webhook field')}</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="mt-4 pt-4 border-t border-slate-700">
              <a
                href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
              >
                <ExternalLink className="size-3.5" />
                {t('whatsapp.instructions.docsLink', 'Meta WhatsApp API Documentation')}
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    </div>
  );
}
