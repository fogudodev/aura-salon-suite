import type { PublicPageTheme } from "@/lib/public-page-theme";
import { cn } from "@/lib/utils";

type ProfessionalCardProps = {
  theme: PublicPageTheme;
  avatarUrl?: string | null;
  name: string;
  selected: boolean;
  specialty?: string | null;
  onClick: () => void;
};

export function ProfessionalCard({
  theme,
  avatarUrl,
  name,
  selected,
  specialty,
  onClick,
}: ProfessionalCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative h-[132px] w-[102px] shrink-0 overflow-hidden rounded-[22px] border text-left transition",
        selected ? "shadow-[0_24px_42px_-24px_rgba(190,24,93,0.7)]" : "",
      )}
      style={{
        borderColor: selected ? theme.accent : theme.border,
        backgroundColor: theme.surface,
        boxShadow: selected ? `0 24px 42px -24px ${theme.accentShadow}` : undefined,
      }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center text-3xl font-black"
          style={{ backgroundColor: theme.surfaceMuted, color: theme.accentStrong }}
        >
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 px-3 pb-3 pt-8" style={{ background: theme.mediaOverlay }}>
        <p className="truncate text-[13px] font-bold" style={{ color: theme.text }}>{name}</p>
        <p className="truncate text-[10px] font-medium" style={{ color: theme.textMuted }}>{specialty || "Especialista"}</p>
      </div>

      {selected ? (
        <span
          className="absolute right-2 top-2 rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.22em]"
          style={{ background: theme.accentGradient, color: theme.inverseText }}
        >
          Ok
        </span>
      ) : null}
    </button>
  );
}
