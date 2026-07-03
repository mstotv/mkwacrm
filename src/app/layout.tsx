import type { Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { Toaster } from "sonner";
import "./globals.css";
import { ThemeProvider } from "@/hooks/use-theme";
import { LanguageProvider } from "@/hooks/use-language";
import { DEFAULT_THEME, STORAGE_KEY, THEME_IDS } from "@/lib/themes";
import { createClient } from "@/lib/supabase/server";
import { SiteSettingsProvider } from "@/hooks/use-site-settings";
import { ImpersonationBanner } from "@/components/auth/impersonation-banner";

const MODE_STORAGE_KEY = "wacrm.colorMode";


const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export async function generateMetadata() {
  const defaultSettings = { site_name: 'WaCRM' };
  let settings = defaultSettings;
  try {
    const supabase = await createClient();
    const { data } = await supabase.from('site_settings').select('site_name').maybeSingle();
    if (data) {
      settings = data;
    }
  } catch (e) {}

  return {
    title: {
      default: settings.site_name,
      template: `%s — ${settings.site_name}`,
    },
    description: "Self-hostable CRM template for WhatsApp.",
    robots: {
      index: false,
      follow: false,
    },
    icons: {
      icon: [{ url: "/icon" }],
    },
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#020617",
  colorScheme: "dark",
};

// Inline boot script — runs before React hydrates so the user's
// chosen theme and language/RTL dir are on the <html> element before first paint.
const THEME_BOOT_SCRIPT = `
(function(){
  try {
    var STORAGE_KEY = ${JSON.stringify(STORAGE_KEY)};
    var MODE_KEY = ${JSON.stringify("wacrm.colorMode")};
    var DEFAULT = ${JSON.stringify(DEFAULT_THEME)};
    var ALLOWED = ${JSON.stringify(THEME_IDS)};
    var savedTheme = localStorage.getItem(STORAGE_KEY);
    var theme = ALLOWED.indexOf(savedTheme) !== -1 ? savedTheme : DEFAULT;
    document.documentElement.dataset.theme = theme;

    // Restore color mode (dark / light) and apply class list
    var savedMode = localStorage.getItem(MODE_KEY);
    var mode = (savedMode === 'light' || savedMode === 'dark') ? savedMode : 'dark';
    document.documentElement.dataset.mode = mode;
    if (mode === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
    
    // Initial language and RTL detection
    var savedLang = localStorage.getItem('app_language') || 'ar';
    document.documentElement.lang = savedLang;
    document.documentElement.dir = savedLang === 'ar' ? 'rtl' : 'ltr';
  } catch (_e) {
    document.documentElement.dataset.theme = ${JSON.stringify(DEFAULT_THEME)};
    document.documentElement.dataset.mode = 'dark';
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
    document.documentElement.lang = 'ar';
    document.documentElement.dir = 'rtl';
  }
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const defaultSettings = {
    site_name: 'WaCRM',
    logo_url: '',
    primary_color: '#8B5CF6',
    secondary_color: '#1e293b',
    accent_color: '#0f172a'
  };

  let settings = defaultSettings;
  try {
    const supabase = await createClient();
    const { data } = await supabase.from('site_settings').select('*').maybeSingle();
    if (data) {
      settings = data;
    }
  } catch (e) {
    console.error("Failed to load site settings:", e);
  }

  return (
    <html
      lang="ar"
      dir="rtl"
      data-theme={DEFAULT_THEME}
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <Script
          id="theme-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }}
        />
        {/* Inject dynamic colors */}
        <style dangerouslySetInnerHTML={{ __html: `
          :root {
            --primary: ${settings.primary_color} !important;
            --primary-hover: ${settings.primary_color}cc !important;
            --ring: ${settings.primary_color} !important;
            ${settings.secondary_color ? `--secondary: ${settings.secondary_color} !important;` : ''}
            ${settings.accent_color ? `--accent: ${settings.accent_color} !important;` : ''}
          }
        `}} />
      </head>
      <body className="min-h-full bg-background text-foreground font-sans">
        <LanguageProvider>
          <ThemeProvider>
            <SiteSettingsProvider initialSettings={settings}>
              <ImpersonationBanner />
              {children}
            </SiteSettingsProvider>
            <Toaster
              theme="dark"
              position="top-right"
              toastOptions={{
                style: {
                  background: "rgb(30 41 59)",
                  border: "1px solid rgb(51 65 85)",
                  color: "white",
                },
              }}
            />
          </ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}


