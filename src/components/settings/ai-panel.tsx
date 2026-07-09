'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useLanguage } from '@/hooks/use-language';
import {
  Bot,
  Save,
  AlertCircle,
  Sparkles,
  BrainCircuit,
  KeyRound,
  FileSpreadsheet,
  Upload,
  Trash2,
  FileText,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { getEffectiveSubscriptionPlanLabel, isActiveSubscription } from '@/lib/auth/subscription';

function normalizeSubscription(subscription: any) {
  if (!subscription) return null;
  const normalized = { ...subscription };
  if (Array.isArray(normalized.plan)) {
    normalized.plan = normalized.plan[0] ?? null;
  }
  return normalized;
}

interface AIConfig {
  id?: string;
  provider: string;
  api_key: string;
  bot_name: string;
  system_prompt: string;
  is_active: boolean;
}

interface TrainingEntry {
  question: string;
  answer: string;
}

export function AIPanel() {
  const { account, accountRole, profileLoading } = useAuth();
  const { t } = useLanguage();
  const [config, setConfig] = useState<AIConfig>({
    provider: 'openai',
    api_key: '',
    bot_name: 'مساعد الذكاء الاصطناعي',
    system_prompt: 'أنت مساعد ذكي لخدمة العملاء. أجب على الأسئلة بدقة ولباقة باللغة العربية.',
    is_active: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trainingEntries, setTrainingEntries] = useState<TrainingEntry[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [subscription, setSubscription] = useState<any>(null);

  const handleTestConnection = async () => {
    if (!config.api_key) {
      toast.error('الرجاء إدخال مفتاح الـ API أولاً');
      return;
    }
    setTestingKey(true);
    toast.loading('جاري فحص الاتصال بالـ API...');

    try {
      const res = await fetch('/api/settings/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: config.provider,
          apiKey: config.api_key,
        }),
      });

      const resData = await res.json();
      toast.dismiss();

      if (resData.success) {
        toast.success(`تم الاتصال بنجاح! رد البوت: "${resData.response}"`);
      } else {
        toast.error(`فشل الاتصال: ${resData.error}`);
      }
    } catch (err: any) {
      toast.dismiss();
      toast.error('خطأ أثناء الاتصال بالخادم الرئيسي');
    } finally {
      setTestingKey(false);
    }
  };

  useEffect(() => {
    // Wait until profile is fully loaded
    if (profileLoading) return;
    if (!account?.id) {
      setLoading(false);
      return;
    }
    const accountId = account.id;
    const supabase = createClient();
    let isMounted = true;

    async function loadAIConfigAndSub() {
      try {
        // Load active subscription and plan via API to bypass RLS select issues
        const resSub = await fetch('/api/billing/subscription');
        const resSubData = await resSub.json();
        const subData = resSubData.subscription || null;

        if (!isMounted) return;

        if (subData) {
          setSubscription(normalizeSubscription(subData));
        }

        // Load AI Config
        const { data } = await supabase
          .from('ai_config')
          .select('*')
          .eq('account_id', accountId)
          .maybeSingle();

        if (!isMounted) return;

        if (data) {
          setConfig({
            id: data.id,
            provider: data.provider || 'openai',
            api_key: data.api_key || '',
            bot_name: data.bot_name || 'AI Assistant',
            system_prompt: data.system_prompt || '',
            is_active: data.is_active ?? false,
          });
          // Parse existing training data from system_prompt
          const parsed = parseTrainingFromPrompt(data.system_prompt || '');
          setTrainingEntries(parsed);
        }
      } catch (err) {
        console.error('Error loading AI config and subscription:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadAIConfigAndSub();

    const channel = supabase
      .channel(`ai-subscription-${accountId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'account_subscriptions',
          filter: `account_id=eq.${accountId}`,
        },
        () => {
          void loadAIConfigAndSub();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [account?.id, profileLoading]);

  // Parse training Q&A from system_prompt (marked with special delimiters)
  function parseTrainingFromPrompt(prompt: string): TrainingEntry[] {
    const entries: TrainingEntry[] = [];
    const trainingSection = prompt.match(/<!-- TRAINING_DATA_START -->([\s\S]*?)<!-- TRAINING_DATA_END -->/);
    if (!trainingSection) return entries;
    const lines = trainingSection[1].trim().split('\n');
    let currentQ = '';
    for (const line of lines) {
      if (line.startsWith('Q: ')) {
        currentQ = line.substring(3).trim();
      } else if (line.startsWith('A: ') && currentQ) {
        entries.push({ question: currentQ, answer: line.substring(3).trim() });
        currentQ = '';
      }
    }
    return entries;
  }

  // Build training section for system_prompt
  function buildTrainingSection(entries: TrainingEntry[]): string {
    if (entries.length === 0) return '';
    const lines = entries.map(e => `Q: ${e.question}\nA: ${e.answer}`).join('\n');
    return `\n\n<!-- TRAINING_DATA_START -->\nفيما يلي بيانات التدريب (الأسئلة الشائعة). عندما يسأل العميل سؤالاً مشابهاً، استخدم الإجابة المقابلة:\n${lines}\n<!-- TRAINING_DATA_END -->`;
  }

  // Remove old training section and append new one
  function updatePromptWithTraining(basePrompt: string, entries: TrainingEntry[]): string {
    const cleaned = basePrompt.replace(/\n*<!-- TRAINING_DATA_START -->[\s\S]*?<!-- TRAINING_DATA_END -->/, '').trim();
    return cleaned + buildTrainingSection(entries);
  }

  // Handle Excel/CSV file upload
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);

    try {
      const fileName = file.name.toLowerCase();
      let newEntries: TrainingEntry[] = [];

      if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
        // CSV/TXT parsing
        const text = await file.text();
        const lines = text.split('\n').filter(l => l.trim());
        for (const line of lines) {
          // Split by comma, tab, or pipe
          const parts = line.split(/[,\t|]/).map(p => p.trim().replace(/^"|"$/g, ''));
          if (parts.length >= 2 && parts[0] && parts[1]) {
            // Skip header row
            if (parts[0].toLowerCase() === 'question' || parts[0].toLowerCase() === 'سؤال') continue;
            newEntries.push({ question: parts[0], answer: parts[1] });
          }
        }
      } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        // Read Excel as CSV-like text using ArrayBuffer
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        // Simple XLSX extraction - look for shared strings in the XML
        // For production, use a library. Here we do a pragmatic text extraction.
        const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        // Try to find readable text patterns
        const matches = text.match(/[^\x00-\x1F\x80-\xFF]{2,}/g);
        if (matches && matches.length >= 2) {
          // Try pairing consecutive readable strings as Q&A
          for (let i = 0; i < matches.length - 1; i += 2) {
            const q = matches[i].trim();
            const a = matches[i + 1]?.trim();
            if (q && a && q.length > 1 && a.length > 1) {
              // Skip common Excel metadata
              if (q.includes('xl/') || q.includes('Content_Types') || q.includes('workbook')) continue;
              newEntries.push({ question: q, answer: a });
            }
          }
        }

        // If XLSX parsing yielded no results, inform user to use CSV
        if (newEntries.length === 0) {
          toast.error('لم نتمكن من قراءة ملف Excel مباشرة. يرجى تصدير الملف كـ CSV وإعادة الرفع.');
          setUploadingFile(false);
          e.target.value = '';
          return;
        }
      }

      if (newEntries.length === 0) {
        toast.error('لم يتم العثور على بيانات تدريب في الملف. تأكد من وجود عمودين: سؤال وجواب.');
        setUploadingFile(false);
        e.target.value = '';
        return;
      }

      // Merge with existing entries (avoid duplicates)
      const merged = [...trainingEntries];
      for (const entry of newEntries) {
        const exists = merged.some(
          e => e.question.toLowerCase() === entry.question.toLowerCase()
        );
        if (!exists) merged.push(entry);
      }

      setTrainingEntries(merged);

      // Update system prompt
      setConfig(prev => ({
        ...prev,
        system_prompt: updatePromptWithTraining(prev.system_prompt, merged),
      }));

      toast.success(`تم استيراد ${newEntries.length} سؤال وجواب بنجاح! اضغط حفظ لتأكيد التدريب.`);
    } catch (err) {
      console.error('Error parsing file:', err);
      toast.error('حدث خطأ أثناء قراءة الملف.');
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  }, [trainingEntries]);

  // Add manual Q&A entry
  const addManualEntry = () => {
    setTrainingEntries(prev => [...prev, { question: '', answer: '' }]);
  };

  // Update entry
  const updateEntry = (index: number, field: 'question' | 'answer', value: string) => {
    setTrainingEntries(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Remove entry
  const removeEntry = (index: number) => {
    setTrainingEntries(prev => {
      const updated = prev.filter((_, i) => i !== index);
      setConfig(c => ({
        ...c,
        system_prompt: updatePromptWithTraining(c.system_prompt, updated),
      }));
      return updated;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account?.id) return;
    setSaving(true);
    const supabase = createClient();

    // Rebuild training data into system prompt before saving
    const finalPrompt = updatePromptWithTraining(config.system_prompt, trainingEntries);

    try {
      if (config.id) {
        const { error } = await supabase
          .from('ai_config')
          .update({
            provider: config.provider,
            api_key: config.api_key,
            bot_name: config.bot_name,
            system_prompt: finalPrompt,
            is_active: config.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('ai_config')
          .insert({
            account_id: account.id,
            provider: config.provider,
            api_key: config.api_key,
            bot_name: config.bot_name,
            system_prompt: finalPrompt,
            is_active: config.is_active,
          })
          .select()
          .single();

        if (error) throw error;
        if (data) {
          setConfig(prev => ({ ...prev, id: data.id }));
        }
      }

      toast.success(t('common.success', 'تم حفظ إعدادات الذكاء الاصطناعي بنجاح!'));
    } catch (err: any) {
      console.error('Error saving AI config:', err);
      toast.error(err.message || t('common.error', 'فشل حفظ الإعدادات'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
      </div>
    );
  }

  const isOwnerOrAdmin = accountRole === 'owner' || accountRole === 'admin';
  const isProPlan = isActiveSubscription(subscription) && subscription?.plan?.name === 'pro';
  const planLabel = getEffectiveSubscriptionPlanLabel(subscription);

  return (
    <div className="space-y-6">
      {/* Plan Alert Banner */}
      {!isProPlan && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5 text-sm text-slate-300 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-amber-400 block">ميزة الردود التلقائية بالذكاء الاصطناعي معطلة للمستقبلين</span>
            المجيب التلقائي الذكي (OpenAI / DeepSeek) متاح فقط للمشتركين في الباقة الاحترافية (Pro). باقتك الحالية هي: <strong className="text-white">({planLabel || 'Free المجانية'})</strong>.
            يمكنك إدخال وتجربة المفتاح وفحص الاتصال، ولكن لن يقوم البوت بالرد التلقائي على الواتساب للعملاء إلا بعد ترقية باقة الاشتراك.
          </div>
        </div>
      )}

      {/* Intro Header */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
            <BrainCircuit className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-lg flex items-center gap-2">
              تفعيل ردود الذكاء الاصطناعي
              <Sparkles className="h-4 w-4 text-violet-400 animate-pulse" />
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              قم بربط مفتاح الـ API الخاص بك لـ OpenAI أو DeepSeek للرد على محادثات عملائك تلقائياً وبذكاء بناءً على التعليمات التي تحددها.
            </p>
          </div>
        </div>
      </div>

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Provider and Mode */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
            <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
              <Bot className="h-4.5 w-4.5 text-violet-400" />
              إعدادات البوت والخدمة
            </h4>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">مزود الخدمة (AI Provider)</label>
              <select
                disabled={!isOwnerOrAdmin}
                value={config.provider}
                onChange={e => setConfig(prev => ({ ...prev, provider: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
              >
                <option value="openai">OpenAI (GPT-4o / GPT-4o-mini)</option>
                <option value="deepseek">DeepSeek (DeepSeek Chat)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">اسم البوت (المساعد)</label>
              <input
                type="text"
                disabled={!isOwnerOrAdmin}
                value={config.bot_name}
                onChange={e => setConfig(prev => ({ ...prev, bot_name: e.target.value }))}
                placeholder="مثال: مجيب العملاء الذكي"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-violet-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">مفتاح API الخاص بك (API Key)</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  disabled={!isOwnerOrAdmin}
                  value={config.api_key}
                  onChange={e => setConfig(prev => ({ ...prev, api_key: e.target.value }))}
                  placeholder="sk-..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2 pl-10 pr-4 text-sm text-white placeholder-slate-650 focus:border-violet-500 focus:outline-none font-mono"
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                يتم تشفير هذا المفتاح وحفظه بشكل آمن للغاية لتشغيل الاستعلامات لحسابك فقط.
              </p>
              {isOwnerOrAdmin && config.api_key && (
                <button
                  type="button"
                  disabled={testingKey}
                  onClick={handleTestConnection}
                  className="mt-2 text-xs text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1 bg-violet-500/10 px-2.5 py-1 rounded-md transition border border-violet-500/20"
                >
                  {testingKey ? 'جاري الفحص...' : 'فحص الاتصال بالـ API'}
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <input
                type="checkbox"
                id="is_active"
                disabled={!isOwnerOrAdmin}
                checked={config.is_active}
                onChange={e => setConfig(prev => ({ ...prev, is_active: e.target.checked }))}
                className="h-4.5 w-4.5 rounded border-slate-700 bg-slate-800 text-violet-600 focus:ring-violet-500"
              />
              <label htmlFor="is_active" className="text-sm font-medium text-white cursor-pointer select-none">
                تفعيل الرد التلقائي بالذكاء الاصطناعي حالاً
              </label>
            </div>
          </div>

          {/* System Prompt Training */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
            <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
              <BrainCircuit className="h-4.5 w-4.5 text-violet-400" />
              تدريب وتوجيه البوت (System Prompt)
            </h4>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">التعليمات وسياق الشركة</label>
              <textarea
                rows={7}
                disabled={!isOwnerOrAdmin}
                value={config.system_prompt}
                onChange={e => setConfig(prev => ({ ...prev, system_prompt: e.target.value }))}
                placeholder="أدخل هنا معلومات شركتك، الأسعار، الخدمات، وسياسات الرد لكي يتعلمها البوت ويجيب العملاء بناءً عليها..."
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-violet-500 focus:outline-none resize-none"
              />
            </div>

            <div className="flex items-start gap-2.5 rounded-lg bg-violet-600/10 border border-violet-800/30 p-3 text-xs text-violet-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-violet-400 mt-0.5" />
              <div>
                <span className="font-semibold">نصيحة ذهبية للتدريب:</span> اكتب بوضوح تفاصيل مثل (ساعات العمل، طرق التوصيل، رابط شيت الأسعار، وكيفية تصدير الطلبات للعميل) لضمان ردود احترافية.
              </div>
            </div>
          </div>
        </div>

        {/* ===== Excel/CSV Training Upload Section ===== */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-white flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
              تدريب البوت عبر ملف Excel / CSV
            </h4>
            {isOwnerOrAdmin && (
              <button
                type="button"
                onClick={addManualEntry}
                className="flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition"
              >
                <FileText className="h-3.5 w-3.5" />
                إضافة يدوية
              </button>
            )}
          </div>

          {/* Upload area */}
          {isOwnerOrAdmin && (
            <div className="relative">
              <label className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-700 hover:border-violet-500/50 bg-slate-900/30 hover:bg-violet-500/5 p-6 cursor-pointer transition-all">
                {uploadingFile ? (
                  <Loader2 className="h-8 w-8 text-violet-400 animate-spin" />
                ) : (
                  <Upload className="h-8 w-8 text-slate-500" />
                )}
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-300">
                    {uploadingFile ? 'جاري قراءة الملف...' : 'اسحب ملف هنا أو اضغط للاختيار'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    يدعم ملفات CSV, TXT, XLSX — كل صف يجب أن يحتوي على: سؤال، جواب
                  </p>
                </div>
                <input
                  type="file"
                  accept=".csv,.txt,.xlsx,.xls"
                  onChange={handleFileUpload}
                  disabled={uploadingFile}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>
            </div>
          )}

          {/* Training entries list */}
          {trainingEntries.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  {trainingEntries.length} سؤال وجواب محمّل للتدريب
                </p>
              </div>
              <div className="max-h-[320px] overflow-y-auto space-y-2 rounded-lg pr-1">
                {trainingEntries.map((entry, i) => (
                  <div
                    key={i}
                    className="flex gap-2 items-start rounded-lg border border-slate-800 bg-slate-900/60 p-3 group"
                  >
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">س</span>
                        <input
                          type="text"
                          value={entry.question}
                          onChange={e => updateEntry(i, 'question', e.target.value)}
                          disabled={!isOwnerOrAdmin}
                          placeholder="السؤال..."
                          className="flex-1 bg-transparent border-none text-sm text-white placeholder-slate-600 focus:outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded">ج</span>
                        <input
                          type="text"
                          value={entry.answer}
                          onChange={e => updateEntry(i, 'answer', e.target.value)}
                          disabled={!isOwnerOrAdmin}
                          placeholder="الجواب..."
                          className="flex-1 bg-transparent border-none text-sm text-white placeholder-slate-600 focus:outline-none"
                        />
                      </div>
                    </div>
                    {isOwnerOrAdmin && (
                      <button
                        type="button"
                        onClick={() => removeEntry(i)}
                        className="shrink-0 p-1.5 rounded-md hover:bg-red-500/10 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {trainingEntries.length === 0 && (
            <div className="text-center py-6 text-slate-500 text-sm">
              <FileSpreadsheet className="h-10 w-10 mx-auto mb-2 opacity-30" />
              لا توجد بيانات تدريب حالياً. ارفع ملف Excel أو CSV أو أضف أسئلة يدوياً.
            </div>
          )}
        </div>

        {/* Save Button */}
        {isOwnerOrAdmin && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition duration-150"
            >
              <Save className="h-4 w-4" />
              {saving ? 'جاري الحفظ...' : 'حفظ التغييرات وإطلاق البوت'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
