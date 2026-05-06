import { Heart } from "lucide-react";
import type { PublicPageTheme } from "@/lib/public-page-theme";
import { cn } from "@/lib/utils";

type ServiceCardProps = {
  theme: PublicPageTheme;
  badge?: string;
  description?: string | null;
  durationLabel: string;
  favorite: boolean;
  icon: string;
  name: string;
  priceLabel: string;
  selected: boolean;
  onToggleFavorite: () => void;
  onToggleSelect: () => void;
};

export function ServiceCard({
  theme,
  badge,
  description,
  durationLabel,
  favorite,
  icon,
  name,
  priceLabel,
  selected,
  onToggleFavorite,
  onToggleSelect,
}: ServiceCardProps) {
  return (
    <article
      className={cn(
        "relative rounded-[24px] border p-3.5 transition-all",
        selected ? "shadow-[0_22px_48px_-24px_rgba(190,24,93,0.45)]" : "shadow-[0_14px_30px_-24px_rgba(15,23,42,0.32)]",
      )}
      style={{
        borderColor: selected ? theme.accent : theme.border,
        backgroundColor: theme.surface,
        boxShadow: selected ? `0 24px 48px -24px ${theme.accentShadow}` : undefined,
      }}
    >
      <button
        type="button"
        aria-label={favorite ? "Desfavoritar servico" : "Favoritar servico"}
        onClick={onToggleFavorite}
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border transition"
        style={{
          borderColor: favorite ? theme.accentFaint : theme.border,
          backgroundColor: favorite ? theme.surfaceMuted : theme.surface,
          color: favorite ? theme.accent : theme.textSoft,
        }}
      >
        <Heart size={15} className={favorite ? "fill-current" : ""} />
      </button>

      {badge ? (
        <span
          className="absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.28em]"
          style={{ background: theme.accentGradient, color: theme.inverseText }}
        >
          {badge}
        </span>
      ) : null}

      <div className="flex min-h-[62px] items-start gap-3 pr-8">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] text-2xl shadow-inner"
          style={{ backgroundColor: theme.surfaceMuted }}
        >
          <span aria-hidden>{icon}</span>
        </div>
        <div className="min-w-0">
          <h3 className="text-[14px] font-bold leading-5" style={{ color: theme.text }}>{name}</h3>
          <p className="mt-1 text-[11px] font-medium leading-4" style={{ color: theme.textMuted }}>
            {description || "Atendimento personalizado"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: theme.textSoft }}>A partir de</p>
          <p className="mt-1 text-[15px] font-black" style={{ color: theme.text }}>{priceLabel}</p>
        </div>
        <span
          className="rounded-full px-3 py-1.5 text-[11px] font-semibold"
          style={{ backgroundColor: theme.surfaceAlt, color: theme.textMuted }}
        >
          {durationLabel}
        </span>
      </div>

      <button
        type="button"
        onClick={onToggleSelect}
        className={cn(
          "mt-4 h-11 w-full rounded-full text-[13px] font-bold transition",
          selected ? "" : "",
        )}
        style={
          selected
            ? { background: theme.accentGradient, color: theme.inverseText }
            : { backgroundColor: theme.surfaceAlt, color: theme.textMuted }
        }
      >
        {selected ? "Remover" : "Selecionar"}
      </button>
    </article>
  );
}
