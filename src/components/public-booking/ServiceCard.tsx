import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

type ServiceCardProps = {
  accent: string;
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
  accent,
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
        selected
          ? "border-transparent bg-white shadow-[0_22px_48px_-24px_rgba(190,24,93,0.45)]"
          : "border-[#eed8eb] bg-white shadow-[0_14px_30px_-24px_rgba(15,23,42,0.32)]",
      )}
      style={selected ? { boxShadow: `0 24px 48px -24px ${accent}66` } : undefined}
    >
      <button
        type="button"
        aria-label={favorite ? "Desfavoritar servico" : "Favoritar servico"}
        onClick={onToggleFavorite}
        className={cn(
          "absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border transition",
          favorite
            ? "border-[#efb7dd] bg-[#fff1fb] text-[#ba1f8d]"
            : "border-[#f1e4ef] bg-white text-slate-400",
        )}
      >
        <Heart size={15} className={favorite ? "fill-current" : ""} />
      </button>

      {badge ? (
        <span className="absolute bottom-3 left-3 rounded-full bg-[#ba1f8d] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.28em] text-white">
          {badge}
        </span>
      ) : null}

      <div className="flex min-h-[62px] items-start gap-3 pr-8">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-[#fdf2fa] text-2xl shadow-inner">
          <span aria-hidden>{icon}</span>
        </div>
        <div className="min-w-0">
          <h3 className="text-[14px] font-bold leading-5 text-slate-900">{name}</h3>
          <p className="mt-1 text-[11px] font-medium leading-4 text-slate-400">{description || "Atendimento personalizado"}</p>
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">A partir de</p>
          <p className="mt-1 text-[15px] font-black text-slate-900">{priceLabel}</p>
        </div>
        <span className="rounded-full bg-[#faf4f9] px-3 py-1.5 text-[11px] font-semibold text-slate-500">
          {durationLabel}
        </span>
      </div>

      <button
        type="button"
        onClick={onToggleSelect}
        className={cn(
          "mt-4 h-11 w-full rounded-full text-[13px] font-bold transition",
          selected ? "text-white" : "bg-[#faf4f9] text-[#7f5b79]",
        )}
        style={selected ? { background: `linear-gradient(90deg, ${accent}, #ff9db8)` } : undefined}
      >
        {selected ? "Remover" : "Selecionar"}
      </button>
    </article>
  );
}
