import { cn } from "@/lib/utils";

type ConversationCategory = 'sales' | 'support' | 'complaint' | 'refund' | 'general' | 'unknown';

interface CategoryBadgeProps {
  category?: ConversationCategory;
  className?: string;
  showText?: boolean;
}

const config: Record<ConversationCategory, { emoji: string; color: string; label: string }> = {
  sales: { emoji: "💰", color: "bg-green-500/10 text-green-500 border-green-500/20", label: "Sales" },
  support: { emoji: "🛠️", color: "bg-blue-500/10 text-blue-500 border-blue-500/20", label: "Support" },
  complaint: { emoji: "⚠️", color: "bg-red-500/10 text-red-500 border-red-500/20", label: "Complaint" },
  refund: { emoji: "💳", color: "bg-orange-500/10 text-orange-500 border-orange-500/20", label: "Refund" },
  general: { emoji: "ℹ️", color: "bg-slate-500/10 text-slate-500 border-slate-500/20", label: "General" },
  unknown: { emoji: "❓", color: "bg-slate-500/10 text-slate-500 border-slate-500/20", label: "Unknown" },
};

export function CategoryBadge({ category, className, showText = false }: CategoryBadgeProps) {
  if (!category) return null;

  const current = config[category] || config.unknown;

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
