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
        "relative overflow-hidden rounded-[24px] border p-4 text-left transition active:scale-[0.99]",
        selected ? "shadow-[0_24px_42px_-24px_rgba(190,24,93,0.45)]" : "shadow-[0_14px_30px_-24px_rgba(15,23,42,0.22)]",
      )}
      style={{
        borderColor: selected ? theme.accent : theme.border,
        backgroundColor: theme.surface,
        boxShadow: selected ? `0 24px 42px -24px ${theme.accentShadow}` : undefined,
      }}
    >
      <div className="flex min-h-[82px] items-center gap-3">
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="h-[68px] w-[68px] rounded-[20px] object-cover" />
        ) : (
          <div
            className="flex h-[68px] w-[68px] items-center justify-center rounded-[20px] text-2xl font-black"
            style={{ backgroundColor: theme.surfaceMuted, color: theme.accentStrong }}
          >
            {name.slice(0, 1).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold" style={{ color: theme.text }}>{name}</p>
          <p className="mt-1 truncate text-[11px] font-medium" style={{ color: theme.textMuted }}>{specialty || "Especialista"}</p>
          <div className="mt-2 flex items-center gap-1" style={{ color: theme.accent }}>
            <span className="text-[12px]">★</span>
            <span className="text-[12px]">★</span>
            <span className="text-[12px]">★</span>
            <span className="text-[12px]">★</span>
            <span className="text-[12px] opacity-40">★</span>
          </div>
        </div>
      </div>

      {selected ? (
        <span
          className="absolute right-3 top-3 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.22em]"
          style={{ background: theme.accentGradient, color: theme.inverseText }}
        >
          Selecionado
        </span>
      ) : null}
    </button>
  );
}
