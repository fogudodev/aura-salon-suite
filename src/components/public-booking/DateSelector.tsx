import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PublicPageTheme } from "@/lib/public-page-theme";
import { cn } from "@/lib/utils";

type DateSelectorProps = {
  theme: PublicPageTheme;
  days: Date[];
  selectedDate: Date | null;
  onSelect: (date: Date) => void;
};

export function DateSelector({ theme, days, selectedDate, onSelect }: DateSelectorProps) {
  const referenceDate = selectedDate || days[0] || new Date();
  const monthLabel = format(referenceDate, "MMMM, yyyy", { locale: ptBR });

  return (
    <section
      className="rounded-[32px] px-5 pb-5 pt-4"
      style={{ background: theme.accentGradientVertical, color: theme.inverseText }}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)" }}
        >
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em]" style={{ color: "rgba(255,255,255,0.72)" }}>Agenda</p>
          <h2 className="mt-1 text-lg font-black capitalize">{monthLabel}</h2>
        </div>
        <button
          type="button"
          disabled
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)" }}
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
                selected ? "shadow-lg" : "",
              )}
              style={
                selected
                  ? {
                      backgroundColor: theme.surface,
                      color: theme.accentStrong,
                      boxShadow: `0 18px 28px -18px ${theme.accentShadow}`,
                    }
                  : { backgroundColor: "rgba(255,255,255,0.08)", color: theme.inverseText }
              }
            >
              <span
                className="block text-[10px] font-semibold uppercase tracking-[0.24em]"
                style={{ color: selected ? theme.accentSoft : "rgba(255,255,255,0.72)" }}
              >
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
