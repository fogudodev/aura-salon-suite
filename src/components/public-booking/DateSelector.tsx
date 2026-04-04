import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type DateSelectorProps = {
  accent: string;
  days: Date[];
  selectedDate: Date | null;
  onSelect: (date: Date) => void;
};

export function DateSelector({ accent, days, selectedDate, onSelect }: DateSelectorProps) {
  const referenceDate = selectedDate || days[0] || new Date();
  const monthLabel = format(referenceDate, "MMMM, yyyy", { locale: ptBR });

  return (
    <section
      className="rounded-[32px] px-5 pb-5 pt-4 text-white"
      style={{ background: "linear-gradient(180deg,#bc2b98 0%,#f2a3c7 100%)" }}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">Agenda</p>
          <h2 className="mt-1 text-lg font-black capitalize">{monthLabel}</h2>
        </div>
        <button
          type="button"
          disabled
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="mt-5 flex gap-2.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {days.map((day) => {
          const selected = selectedDate && format(selectedDate, "yyyy-MM-dd") === format(day, "yyyy-MM-dd");

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelect(day)}
              className={cn(
                "min-w-[62px] rounded-[22px] px-3 py-3 text-center transition",
                selected ? "bg-white text-[#bc2b98] shadow-lg" : "bg-white/8 text-white",
              )}
              style={selected ? { boxShadow: `0 18px 28px -18px ${accent}aa` } : undefined}
            >
              <span className={cn("block text-[10px] font-semibold uppercase tracking-[0.24em]", selected ? "text-[#cf72b3]" : "text-white/72")}>
                {format(day, "EEE", { locale: ptBR }).slice(0, 3)}
              </span>
              <span className="mt-2 block text-[22px] font-black leading-none">{format(day, "dd")}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
