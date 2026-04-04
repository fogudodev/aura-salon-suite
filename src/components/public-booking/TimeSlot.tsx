import { cn } from "@/lib/utils";

type TimeSlotProps = {
  accent: string;
  label: string;
  selected: boolean;
  onClick: () => void;
};

export function TimeSlot({ accent, label, selected, onClick }: TimeSlotProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-11 rounded-full border text-[13px] font-bold transition",
        selected
          ? "border-transparent text-white shadow-[0_20px_30px_-18px_rgba(190,24,93,0.55)]"
          : "border-[#efe3ee] bg-white text-slate-600",
      )}
      style={selected ? { background: `linear-gradient(90deg, ${accent}, #ff9db8)` } : undefined}
    >
      {label}
    </button>
  );
}
