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
  'ai',
  'google-sheets',
  'google-calendar',
] as const;
type TabValue = (typeof TAB_VALUES)[number];

function isTabValue(v: string | null): v is TabValue {
  return !!v && (TAB_VALUES as readonly string[]).includes(v);
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const canEditSettings = useCan('edit-settings');

  const queryTab = searchParams.get('tab');
  const resolved: TabValue = isTabValue(queryTab) ? queryTab : 'profile';
  
  // Controlled tab state for instant UI changes
  const [tab, setTab] = useState<TabValue>(() => {
    return resolved === 'custom-fields' && !canEditSettings ? 'profile' : resolved;
  });

  // Synchronize state when queryTab changes (deep link, back button, etc)
  useEffect(() => {
    const nextTab = isTabValue(queryTab) ? queryTab : 'profile';
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
        <TabsList className="border border-slate-700 bg-slate-900 flex-wrap h-auto gap-1 p-1">
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
            Templates
          </TabsTrigger>
          <TabsTrigger
            value="tags"
            className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
          >
            <Tag className="size-4" />
            Tags
          </TabsTrigger>
          {canEditSettings && (
            <TabsTrigger
              value="custom-fields"
              className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
            >
              <SlidersHorizontal className="size-4" />
              Custom Fields
            </TabsTrigger>
          )}
          <TabsTrigger
            value="deals"
            className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
          >
            <Coins className="size-4" />
            Deals
          </TabsTrigger>
          <TabsTrigger
            value="appearance"
            className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
          >
            <Palette className="size-4" />
            Appearance
          </TabsTrigger>
          <TabsTrigger
            value="members"
            className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
          >
            <UsersRound className="size-4" />
            Members
          </TabsTrigger>
          <TabsTrigger
            value="billing"
            className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
          >
            <CreditCard className="size-4" />
            {t('settings.billingTab')}
          </TabsTrigger>
          <TabsTrigger
            value="ai"
            className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
          >
            <Brain className="size-4" />
            {t('settings.aiTab')}
          </TabsTrigger>
          <TabsTrigger
            value="google-sheets"
            className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
          >
            <FileSpreadsheet className="size-4" />
            Google Sheets
          </TabsTrigger>
          <TabsTrigger
            value="google-calendar"
            className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
          >
            <Calendar className="size-4" />
            Google Calendar
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

        <TabsContent value="ai">
          <AIPanel />
        </TabsContent>

        <TabsContent value="google-sheets">
          <GoogleSheetsPanel />
        </TabsContent>

        <TabsContent value="google-calendar">
          <GoogleCalendarPanel />
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
