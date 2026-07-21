import { cn } from "@/lib/utils";

type SentimentCategory = "positive" | "neutral" | "negative" | "frustrated";

interface SentimentBadgeProps {
  sentiment?: SentimentCategory;
  score?: number;
  className?: string;
  showText?: boolean;
}

const config: Record<SentimentCategory, { emoji: string; color: string; label: string }> = {
  positive: { emoji: "😊", color: "bg-green-500/10 text-green-500 border-green-500/20", label: "Positive" },
  neutral: { emoji: "😐", color: "bg-slate-500/10 text-slate-500 border-slate-500/20", label: "Neutral" },
  negative: { emoji: "😞", color: "bg-orange-500/10 text-orange-500 border-orange-500/20", label: "Negative" },
  frustrated: { emoji: "😡", color: "bg-red-500/10 text-red-500 border-red-500/20", label: "Frustrated" },
};

export function SentimentBadge({ sentiment, score, className, showText = false }: SentimentBadgeProps) {
  if (!sentiment) return null;

  const current = config[sentiment] || config.neutral;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        current.color,
        className
      )}
      title={`Score: ${score ?? 50}`}
    >
      <span>{current.emoji}</span>
      {showText && <span>{current.label}</span>}
    </div>
  );
}
