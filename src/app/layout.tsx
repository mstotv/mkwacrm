import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { Toaster } from "sonner";
import "./globals.css";
import { ThemeProvider } from "@/hooks/use-theme";
import { LanguageProvider } from "@/hooks/use-language";
import { DEFAULT_THEME, STORAGE_KEY, THEME_IDS } from "@/lib/themes";

const MODE_STORAGE_KEY = "wacrm.colorMode";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "wacrm",
    template: "%s — wacrm",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
      </head>
      <body className="min-h-full bg-background text-foreground font-sans">
        <LanguageProvider>
          <ThemeProvider>
            {children}
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

