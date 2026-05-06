import { eachDayOfInterval, endOfWeek, format, isSameDay, startOfWeek } from "date-fns";
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
  const firstAvailable = days[0];
  const lastAvailable = days[days.length - 1];
  const visibleDays = firstAvailable && lastAvailable
    ? eachDayOfInterval({
        start: startOfWeek(firstAvailable, { locale: ptBR }),
        end: endOfWeek(lastAvailable, { locale: ptBR }),
      })
    : [];
  const availableKeys = new Set(days.map((day) => format(day, "yyyy-MM-dd")));

  return (
    <section className="rounded-[28px] px-4 pb-4 pt-3" style={{ backgroundColor: theme.surfaceMuted, color: theme.text }}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled
          className="flex h-10 w-10 items-center justify-center rounded-full border"
          style={{ borderColor: theme.border, backgroundColor: theme.surface, color: theme.textSoft }}
        >
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em]" style={{ color: theme.textSoft }}>Agenda</p>
          <h2 className="mt-1 text-lg font-black capitalize" style={{ color: theme.text }}>{monthLabel}</h2>
        </div>
        <button
          type="button"
          disabled
          className="flex h-10 w-10 items-center justify-center rounded-full border"
          style={{ borderColor: theme.border, backgroundColor: theme.surface, color: theme.textSoft }}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="mt-5 rounded-[24px] bg-white/80 p-4 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.22)]">
        <div className="mb-3 grid grid-cols-7 gap-2">
          {["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map((label) => (
            <span key={label} className="text-center text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: theme.textSoft }}>
              {label}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {visibleDays.map((day) => {
            const dayKey = format(day, "yyyy-MM-dd");
            const available = availableKeys.has(dayKey);
            const selected = Boolean(selectedDate && isSameDay(selectedDate, day));

            return (
              <button
                key={day.toISOString()}
                type="button"
                disabled={!available}
                onClick={() => onSelect(day)}
                className={cn(
                  "flex h-12 items-center justify-center rounded-[16px] text-[13px] font-bold transition",
                  !available ? "cursor-default opacity-45" : "",
                )}
                style={
                  selected
                    ? {
                        background: theme.accentGradient,
                        color: theme.inverseText,
                        boxShadow: `0 16px 26px -18px ${theme.accentShadow}`,
                      }
                    : available
                      ? { backgroundColor: theme.surface, color: theme.text }
                      : { backgroundColor: "transparent", color: theme.textSoft }
                }
              >
                {format(day, "dd")}
              </button>
            );
          })}
        </div>

        <div className="mt-4 rounded-[18px] px-4 py-3" style={{ backgroundColor: theme.surfaceMuted }}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: theme.textSoft }}>Dia selecionado</p>
          <p className="mt-1 text-[14px] font-bold capitalize" style={{ color: theme.text }}>
            {selectedDate ? format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR }) : "Escolha uma data para continuar"}
          </p>
        </div>
      </div>
    </section>
  );
}
