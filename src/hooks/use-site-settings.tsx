'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

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
