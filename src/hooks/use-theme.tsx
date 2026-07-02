"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_THEME,
  STORAGE_KEY,
  isThemeId,
  type ThemeId,
} from "@/lib/themes";

export type ColorMode = "dark" | "light";
const MODE_KEY = "wacrm.colorMode";
const DEFAULT_MODE: ColorMode = "dark";

/**
 * ThemeProvider — wraps the whole app, owns the active theme state.
 *
 * It manages:
 * 1. data-theme attribute on <html> (violet, emerald, cobalt, amber, rose)
 * 2. data-mode attribute on <html> (dark, light)
 * 3. className classList ('dark' vs 'light') on <html> for Tailwind's variant detection.
 */

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (next: ThemeId) => void;
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  toggleColorMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const fromAttr = document.documentElement.dataset.theme;
  if (isThemeId(fromAttr)) return fromAttr;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isThemeId(stored)) return stored;
  } catch {
    // localStorage can throw in private-browsing / sandboxed contexts.
  }
  return DEFAULT_THEME;
}

function readInitialMode(): ColorMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  const fromAttr = document.documentElement.dataset.mode as ColorMode;
  if (fromAttr === "light" || fromAttr === "dark") return fromAttr;
  try {
    const stored = localStorage.getItem(MODE_KEY) as ColorMode;
    if (stored === "light" || stored === "dark") return stored;
  } catch {}
  return DEFAULT_MODE;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(readInitialTheme);
  const [colorMode, setColorModeState] = useState<ColorMode>(readInitialMode);

  const applyColorModeToDom = useCallback((mode: ColorMode) => {
    if (typeof document === "undefined") return;
    const htmlEl = document.documentElement;
    htmlEl.dataset.mode = mode;
    
    // Toggle standard tailwind class names
    if (mode === "dark") {
      htmlEl.classList.add("dark");
      htmlEl.classList.remove("light");
    } else {
      htmlEl.classList.add("light");
      htmlEl.classList.remove("dark");
    }
  }, []);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = next;
    }
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  const setColorMode = useCallback((mode: ColorMode) => {
    setColorModeState(mode);
    applyColorModeToDom(mode);
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {}
  }, [applyColorModeToDom]);

  const toggleColorMode = useCallback(() => {
    setColorModeState((prev) => {
      const next: ColorMode = prev === "dark" ? "light" : "dark";
      applyColorModeToDom(next);
      try {
        localStorage.setItem(MODE_KEY, next);
      } catch {}
      return next;
    });
  }, [applyColorModeToDom]);

  // Apply initial theme and mode attributes and classes on mount/state check
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = theme;
      applyColorModeToDom(colorMode);
    }
  }, [theme, colorMode, applyColorModeToDom]);

  // Sync theme changes from other tabs
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && isThemeId(e.newValue) && e.newValue !== theme) {
        setThemeState(e.newValue);
        document.documentElement.dataset.theme = e.newValue;
      }
      if (e.key === MODE_KEY) {
        const mode = e.newValue as ColorMode;
        if ((mode === "dark" || mode === "light") && mode !== colorMode) {
          setColorModeState(mode);
          applyColorModeToDom(mode);
        }
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [theme, colorMode, applyColorModeToDom]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, colorMode, setColorMode, toggleColorMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: DEFAULT_THEME,
      setTheme: () => {},
      colorMode: DEFAULT_MODE,
      setColorMode: () => {},
      toggleColorMode: () => {},
    };
  }
  return ctx;
}
