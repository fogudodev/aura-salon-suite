import type { PublicPageTheme } from "@/lib/public-page-theme";
import { cn } from "@/lib/utils";

type TimeSlotProps = {
  theme: PublicPageTheme;
  label: string;
  selected: boolean;
  onClick: () => void;
};

export function TimeSlot({ theme, label, selected, onClick }: TimeSlotProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-11 rounded-full border text-[13px] font-bold transition",
        selected ? "shadow-[0_20px_30px_-18px_rgba(190,24,93,0.55)]" : "",
      )}
      style={
        selected
          ? {
              borderColor: theme.accent,
              background: theme.accentGradient,
              color: theme.inverseText,
              boxShadow: `0 20px 30px -18px ${theme.accentShadow}`,
            }
          : {
              borderColor: theme.border,
              backgroundColor: theme.surface,
              color: theme.textMuted,
            }
      }
    >
      {label}
    </button>
  );
}
