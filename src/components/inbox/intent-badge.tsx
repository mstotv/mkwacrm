import { cn } from "@/lib/utils";

type IntentCategory = 'ready_to_buy' | 'hesitant' | 'not_interested' | 'wants_appointment' | 'info_seeking' | 'unknown';

interface IntentBadgeProps {
  intent?: IntentCategory;
  className?: string;
  showText?: boolean;
}

const config: Record<IntentCategory, { emoji: string; color: string; label: string }> = {
  ready_to_buy: { emoji: "🛒", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20", label: "Ready to Buy" },
  hesitant: { emoji: "🤔", color: "bg-amber-500/10 text-amber-500 border-amber-500/20", label: "Hesitant" },
  not_interested: { emoji: "🚫", color: "bg-slate-500/10 text-slate-500 border-slate-500/20", label: "Not Interested" },
  wants_appointment: { emoji: "📅", color: "bg-blue-500/10 text-blue-500 border-blue-500/20", label: "Wants Appointment" },
  info_seeking: { emoji: "ℹ️", color: "bg-violet-500/10 text-violet-500 border-violet-500/20", label: "Info Seeking" },
  unknown: { emoji: "❓", color: "bg-slate-500/10 text-slate-500 border-slate-500/20", label: "Unknown" },
};

export function IntentBadge({ intent, className, showText = false }: IntentBadgeProps) {
  if (!intent) return null;

  const current = config[intent] || config.unknown;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        current.color,
        className
      )}
      title={current.label}
    >
      <span>{current.emoji}</span>
      {showText && <span>{current.label}</span>}
    </div>
  );
}
