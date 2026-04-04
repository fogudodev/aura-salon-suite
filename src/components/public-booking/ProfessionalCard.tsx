import { cn } from "@/lib/utils";

type ProfessionalCardProps = {
  accent: string;
  avatarUrl?: string | null;
  name: string;
  selected: boolean;
  specialty?: string | null;
  onClick: () => void;
};

export function ProfessionalCard({
  accent,
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
        selected ? "border-transparent shadow-[0_24px_42px_-24px_rgba(190,24,93,0.7)]" : "border-[#efe1ec] bg-white",
      )}
      style={selected ? { boxShadow: `0 24px 42px -24px ${accent}99` } : undefined}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[#f9e9f4] text-3xl font-black text-[#b64399]">
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent_0%,rgba(15,23,42,0.88)_90%)] px-3 pb-3 pt-8 text-white">
        <p className="truncate text-[13px] font-bold">{name}</p>
        <p className="truncate text-[10px] font-medium text-white/70">{specialty || "Especialista"}</p>
      </div>

      {selected ? (
        <span
          className="absolute right-2 top-2 rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.22em] text-white"
          style={{ backgroundColor: accent }}
        >
          Ok
        </span>
      ) : null}
    </button>
  );
}
