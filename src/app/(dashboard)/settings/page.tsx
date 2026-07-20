'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Settings,
  MessageSquare,
  Tag,
  User,
  Palette,
  UsersRound,
  Coins,
  SlidersHorizontal,
  CreditCard,
  Brain,
  FileSpreadsheet,
  Calendar,
  Bell,
  ChevronDown,
  Link2,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useCan } from '@/hooks/use-can';
import { useLanguage } from '@/hooks/use-language';
import { WhatsAppConfig } from '@/components/settings/whatsapp-config';
import { TemplateManager } from '@/components/settings/template-manager';
import { TagManager } from '@/components/settings/tag-manager';
import { ProfileForm } from '@/components/settings/profile-form';
import { PasswordForm } from '@/components/settings/password-form';
import { SessionsCard } from '@/components/settings/sessions-card';
import { AppearancePanel } from '@/components/settings/appearance-panel';
import { MembersTab } from '@/components/settings/members-tab';
import { DealsSettings } from '@/components/settings/deals-settings';
import { CustomFieldsSettings } from '@/components/settings/custom-fields-settings';
import { BillingPanel } from '@/components/settings/billing-panel';
import { AIPanel } from '@/components/settings/ai-panel';
import { GoogleSheetsPanel } from '@/components/settings/google-sheets-panel';
import { GoogleCalendarPanel } from '@/components/settings/google-calendar-panel';
import { TelegramNotificationsPanel } from '@/components/settings/telegram-notifications-panel';

const TAB_VALUES = [
  'profile',
  'whatsapp',
  'templates',
  'tags',
  'custom-fields',
  'deals',
  'appearance',
  'members',
  'billing',
  'integrations',
] as const;
type TabValue = (typeof TAB_VALUES)[number];

function isTabValue(v: string | null): v is TabValue {
  return !!v && (TAB_VALUES as readonly string[]).includes(v);
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, language } = useLanguage();
  const canEditSettings = useCan('edit-settings');

  const queryTab = searchParams.get('tab');
  const getResolvedTab = (q: string | null): TabValue => {
    if (isTabValue(q)) return q;
    if (
      q === 'google-sheets' ||
      q === 'google-calendar' ||
      q === 'telegram-notifications' ||
      q === 'ai'
    ) {
      return 'integrations';
    }
    return 'profile';
  };
  const resolved = getResolvedTab(queryTab);

  
  // Controlled tab state for instant UI changes
  const [tab, setTab] = useState<TabValue>(() => {
    return resolved === 'custom-fields' && !canEditSettings ? 'profile' : resolved;
  });

  // Synchronize state when queryTab changes (deep link, back button, etc)
  useEffect(() => {
    const nextTab = getResolvedTab(queryTab);
    const validatedTab = nextTab === 'custom-fields' && !canEditSettings ? 'profile' : nextTab;
    setTab(validatedTab);
  }, [queryTab, canEditSettings]);

  const onChange = (next: TabValue) => {
    const validatedTab = next === 'custom-fields' && !canEditSettings ? 'profile' : next;
    setTab(validatedTab);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', validatedTab);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{t('settings.title')}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {t('settings.subTitle')}
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => onChange(v as TabValue)}>
        {/* Mobile/Tablet Dropdown Select (rendered below lg breakpoint) */}
        <div className="block lg:hidden w-full mb-6">
          <label htmlFor="settings-section-select" className="sr-only">
            Select settings section
          </label>
          <div className="relative">
            <select
              id="settings-section-select"
              value={tab}
              onChange={(e) => onChange(e.target.value as TabValue)}
              className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 pr-10 text-sm text-white shadow-lg focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all font-semibold"
              style={{ direction: language === 'ar' ? 'rtl' : 'ltr' }}
            >
              <option value="profile">👤 {t('settings.profileTab')}</option>
              <option value="whatsapp">🟢 {t('settings.whatsappTab')}</option>
              <option value="templates">💬 {t('settings.templatesTab') || 'Templates'}</option>
              <option value="tags">🏷️ {t('settings.tagsTab') || 'Tags'}</option>
              {canEditSettings && (
                <option value="custom-fields">📋 {t('settings.customFieldsTab') || 'Custom Fields'}</option>
              )}
              <option value="deals">💼 {t('settings.dealsTab') || 'Deals'}</option>
              <option value="appearance">🎨 {t('settings.appearanceTab') || 'Appearance'}</option>
              <option value="members">👥 {t('settings.membersTab') || 'Members'}</option>
              <option value="billing">💳 {t('settings.billingTab')}</option>
              <option value="integrations">🔗 {t('settings.integrationsTab') || 'Integrations'}</option>
            </select>

            {/* Custom dropdown indicator chevron */}
            <div className={`pointer-events-none absolute inset-y-0 ${language === 'ar' ? 'left-3' : 'right-3'} flex items-center px-2 text-slate-400`}>
              <ChevronDown className="size-4" />
            </div>
          </div>
        </div>

        {/* Desktop TabsList (lg breakpoint and wider) */}
        <TabsList className="hidden lg:flex border border-slate-700 bg-slate-900 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger
            value="profile"
            className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
          >
            <User className="size-4" />
            {t('settings.profileTab')}
          </TabsTrigger>
          <TabsTrigger
            value="whatsapp"
            className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
          >
            <Settings className="size-4" />
            {t('settings.whatsappTab')}
          </TabsTrigger>
          <TabsTrigger
            value="templates"
            className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
          >
            <MessageSquare className="size-4" />
            {t('settings.templatesTab') || 'Templates'}
          </TabsTrigger>
          <TabsTrigger
            value="tags"
            className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
          >
            <Tag className="size-4" />
            {t('settings.tagsTab') || 'Tags'}
          </TabsTrigger>
          {canEditSettings && (
            <TabsTrigger
              value="custom-fields"
              className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
            >
              <SlidersHorizontal className="size-4" />
              {t('settings.customFieldsTab') || 'Custom Fields'}
            </TabsTrigger>
          )}
          <TabsTrigger
            value="deals"
            className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
          >
            <Coins className="size-4" />
            {t('settings.dealsTab') || 'Deals'}
          </TabsTrigger>
          <TabsTrigger
            value="appearance"
            className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
          >
            <Palette className="size-4" />
            {t('settings.appearanceTab') || 'Appearance'}
          </TabsTrigger>
          <TabsTrigger
            value="members"
            className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
          >
            <UsersRound className="size-4" />
            {t('settings.membersTab') || 'Members'}
          </TabsTrigger>
          <TabsTrigger
            value="billing"
            className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
          >
            <CreditCard className="size-4" />
            {t('settings.billingTab')}
          </TabsTrigger>
          <TabsTrigger
            value="integrations"
            className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
          >

            <Link2 className="size-4 text-violet-400" />
            {t('settings.integrationsTab') || 'Integrations'}
          </TabsTrigger>
        </TabsList>




        <TabsContent value="profile" className="space-y-6">
          <ProfileForm />
          <PasswordForm />
          <SessionsCard />
        </TabsContent>

        <TabsContent value="whatsapp">
          <WhatsAppConfig />
        </TabsContent>

        <TabsContent value="templates">
          <TemplateManager />
        </TabsContent>

        <TabsContent value="tags">
          <TagManager />
        </TabsContent>

        {canEditSettings && (
          <TabsContent value="custom-fields">
            <CustomFieldsSettings />
          </TabsContent>
        )}

        <TabsContent value="deals">
          <DealsSettings />
        </TabsContent>

        <TabsContent value="appearance">
          <AppearancePanel />
        </TabsContent>

        <TabsContent value="members">
          <MembersTab />
        </TabsContent>

        <TabsContent value="billing">
          <BillingPanel />
        </TabsContent>

        <TabsContent value="integrations" className="space-y-6">
          <Tabs defaultValue="ai" className="w-full">
            <TabsList className="border border-slate-800 bg-slate-950/40 p-1 mb-6 flex-wrap h-auto gap-1">
              <TabsTrigger value="ai" className="text-xs py-1.5 px-3">
                <Brain className={`size-3.5 ${language === 'ar' ? 'ml-1' : 'mr-1'}`} />
                {t('settings.aiTab')}
              </TabsTrigger>
              <TabsTrigger value="google-sheets" className="text-xs py-1.5 px-3">
                <FileSpreadsheet className={`size-3.5 ${language === 'ar' ? 'ml-1' : 'mr-1'}`} />
                Google Sheets
              </TabsTrigger>
              <TabsTrigger value="google-calendar" className="text-xs py-1.5 px-3">
                <Calendar className={`size-3.5 ${language === 'ar' ? 'ml-1' : 'mr-1'}`} />
                Google Calendar
              </TabsTrigger>
              <TabsTrigger value="telegram-notifications" className="text-xs py-1.5 px-3">
                <Bell className={`size-3.5 ${language === 'ar' ? 'ml-1' : 'mr-1'}`} />
                {t('settings.telegramTab')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="ai" className="mt-2 animate-in fade-in duration-200">
              <AIPanel />
            </TabsContent>

            <TabsContent value="google-sheets" className="mt-2 animate-in fade-in duration-200">
              <GoogleSheetsPanel />
            </TabsContent>
            
            <TabsContent value="google-calendar" className="mt-2 animate-in fade-in duration-200">
              <GoogleCalendarPanel />
            </TabsContent>
            
            <TabsContent value="telegram-notifications" className="mt-2 animate-in fade-in duration-200">
              <TelegramNotificationsPanel />
            </TabsContent>
          </Tabs>
        </TabsContent>

      </Tabs>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-slate-400">Loading settings...</p>
        </div>
      </div>
    }>
      <SettingsPageInner />
    </Suspense>
  );
}
