"use client";

import { Check, Moon, Sun, Monitor } from "lucide-react";

import { useTheme, type ColorMode } from "@/hooks/use-theme";
import { THEMES, type ThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";

/**
 * Appearance panel — color-theme picker + dark/light mode toggle.
 *
 * Click a card → applies + persists immediately.
 * Click the mode toggle → switches dark/light instantly.
 */
export function AppearancePanel() {
  const { theme, setTheme, colorMode, setColorMode } = useTheme();
  const isDark = colorMode === "dark";

  return (
    <section className="space-y-8">
      {/* ── Dark / Light Mode Toggle ─────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">وضع العرض</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            اختر بين الوضع الداكن أو الفاتح حسب تفضيلك. يُحفظ الاختيار على هذا الجهاز.
          </p>
        </div>

        <div className="flex gap-3">
          {/* Dark Mode Card */}
          <button
            type="button"
            onClick={() => setColorMode("dark")}
            aria-pressed={isDark}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-3 rounded-xl border-2 p-4 transition-all duration-200",
              isDark
                ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
                : "border-border bg-card hover:border-border/80 hover:bg-muted/40",
            )}
          >
            {/* Preview */}
            <div className="w-full rounded-lg overflow-hidden border border-border/50 h-20 bg-slate-900 flex flex-col">
              <div className="h-3 bg-slate-800 flex items-center px-2 gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                <span className="h-1.5 w-8 rounded-full bg-slate-700" />
              </div>
              <div className="flex-1 flex gap-2 p-2">
                <div className="w-5 rounded bg-slate-800" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-1.5 w-3/4 rounded-full bg-slate-700" />
                  <div className="h-1.5 w-1/2 rounded-full bg-slate-800" />
                  <div className="h-1.5 w-2/3 rounded-full bg-slate-700" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Moon className="h-4 w-4 text-foreground" />
              <span className="text-sm font-semibold text-foreground">داكن</span>
            </div>
            {isDark && (
              <span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                <Check className="h-3 w-3 text-primary-foreground" />
              </span>
            )}
          </button>

          {/* Light Mode Card */}
          <button
            type="button"
            onClick={() => setColorMode("light")}
            aria-pressed={!isDark}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-3 rounded-xl border-2 p-4 transition-all duration-200",
              !isDark
                ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
                : "border-border bg-card hover:border-border/80 hover:bg-muted/40",
            )}
          >
            {/* Preview */}
            <div className="w-full rounded-lg overflow-hidden border border-gray-200 h-20 bg-white flex flex-col">
              <div className="h-3 bg-gray-100 flex items-center px-2 gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                <span className="h-1.5 w-8 rounded-full bg-gray-200" />
              </div>
              <div className="flex-1 flex gap-2 p-2">
                <div className="w-5 rounded bg-gray-100" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-1.5 w-3/4 rounded-full bg-gray-200" />
                  <div className="h-1.5 w-1/2 rounded-full bg-gray-100" />
                  <div className="h-1.5 w-2/3 rounded-full bg-gray-200" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Sun className="h-4 w-4 text-foreground" />
              <span className="text-sm font-semibold text-foreground">فاتح</span>
            </div>
            {!isDark && (
              <span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                <Check className="h-3 w-3 text-primary-foreground" />
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* ── Color Theme Picker ───────────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">لون التطبيق</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            اختر لون التمييز المستخدم في جميع أنحاء التطبيق. يُحفظ الاختيار على هذا الجهاز.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {THEMES.map((t) => (
            <ThemeCard
              key={t.id}
              id={t.id}
              name={t.name}
              tagline={t.tagline}
              swatch={t.swatch}
              isActive={t.id === theme}
              onPick={() => setTheme(t.id)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ThemeCard({
  id,
  name,
  tagline,
  swatch,
  isActive,
  onPick,
}: {
  id: ThemeId;
  name: string;
  tagline: string;
  swatch: string;
  isActive: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={isActive}
      aria-label={`Use ${name} theme`}
      className={cn(
        "flex flex-col gap-3 rounded-xl border-2 bg-card p-4 text-left transition-all duration-200",
        isActive
          ? "border-primary/70 ring-2 ring-primary/30 shadow-lg shadow-primary/10"
          : "border-border hover:border-border/80 hover:bg-muted/30",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          aria-hidden
          className="h-9 w-9 shrink-0 rounded-full shadow-md"
          style={{
            background: swatch,
            boxShadow: `0 0 0 3px ${swatch}22, inset 0 0 0 1px oklch(1 0 0 / 0.15)`,
          }}
        />
        {isActive && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
            <Check className="h-3 w-3" />
            مفعّل
          </span>
        )}
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">{name}</div>
        <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {tagline}
        </div>
      </div>
      <div
        className="mt-1 flex h-2 overflow-hidden rounded-full"
        aria-hidden
      >
        <span className="flex-1" style={{ background: swatch }} />
        <span className="w-3 bg-muted" />
        <span className="w-3 bg-muted/70" />
        <span className="w-3 bg-muted/40" />
      </div>
      <span className="sr-only">Theme id: {id}</span>
    </button>
  );
}
