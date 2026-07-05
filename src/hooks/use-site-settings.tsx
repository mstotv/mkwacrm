'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface SiteSettings {
  site_name: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
}

interface SiteSettingsContextType {
  settings: SiteSettings;
  updateSettings: (newSettings: Partial<SiteSettings>) => void;
}

const SiteSettingsContext = createContext<SiteSettingsContextType | undefined>(undefined);

export function SiteSettingsProvider({
  children,
  initialSettings,
}: {
  children: React.ReactNode;
  initialSettings: SiteSettings;
}) {
  const [settings, setSettings] = useState<SiteSettings>(initialSettings);

  const updateSettings = (newSettings: Partial<SiteSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  // Keep state in sync with server changes if initialSettings changes
  useEffect(() => {
    setSettings(initialSettings);
  }, [initialSettings]);

  // Sync site name changes to the browser tab title dynamically
  useEffect(() => {
    if (typeof document !== 'undefined' && settings.site_name) {
      const currentTitle = document.title;
      if (currentTitle) {
        const parts = currentTitle.split(' — ');
        if (parts.length > 1) {
          document.title = `${parts[0]} — ${settings.site_name}`;
        } else if (parts[0] !== settings.site_name) {
          document.title = settings.site_name;
        }
      } else {
        document.title = settings.site_name;
      }
    }
  }, [settings.site_name]);

  // Client-side realtime sync
  useEffect(() => {
    const supabase = createClient();

    async function fetchSettings() {
      const { data } = await supabase.from('site_settings').select('*').maybeSingle();
      if (data) {
        setSettings(data);
      }
    }

    fetchSettings();

    // Subscribe to realtime database changes so it updates instantly!
    const channel = supabase
      .channel('site_settings_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'site_settings' },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            setSettings(payload.new as SiteSettings);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <SiteSettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

export function useSiteSettings() {
  const context = useContext(SiteSettingsContext);
  if (context === undefined) {
    throw new Error('useSiteSettings must be used within a SiteSettingsProvider');
  }
  return context;
}
