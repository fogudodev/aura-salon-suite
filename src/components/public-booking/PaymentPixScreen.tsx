import { Copy, MessageCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { PublicPageTheme } from "@/lib/public-page-theme";
import { cn } from "@/lib/utils";

type PaymentPixScreenProps = {
  theme: PublicPageTheme;
  clientName: string;
  code: string;
  dateLabel: string;
  onCopy: () => void;
  onPaid: () => void;
  paidCountdown: number | null;
  paymentCountdown: number;
  pixCopied: boolean;
  professionalName: string;
  remainingAmountLabel: string;
  signalAmountLabel: string;
  timeLabel: string;
  totalAmountLabel: string;
};

function formatCountdown(value: number) {
  const minutes = String(Math.floor(value / 60)).padStart(2, "0");
  const seconds = String(value % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function PaymentPixScreen({
  theme,
  clientName,
  code,
  dateLabel,
  onCopy,
  onPaid,
  paidCountdown,
  paymentCountdown,
  pixCopied,
  professionalName,
  remainingAmountLabel,
  signalAmountLabel,
  timeLabel,
  totalAmountLabel,
}: PaymentPixScreenProps) {
  return (
    <div className="space-y-5 px-5 pb-6 pt-5" style={{ color: theme.text }}>
      <section
        className="rounded-[28px] px-5 pb-6 pt-5 shadow-[0_24px_52px_-24px_rgba(190,24,93,0.55)]"
        style={{ background: theme.accentGradientVertical, color: theme.inverseText, boxShadow: `0 24px 52px -24px ${theme.accentShadow}` }}
      >
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.32em]" style={{ color: "rgba(255,255,255,0.72)" }}>Pagamento PIX</p>
        <h2 className="mt-2 text-center text-[26px] font-black leading-tight">Reserve sua vaga</h2>
        <p className="mt-2 text-center text-[13px] leading-5" style={{ color: "rgba(255,255,255,0.82)" }}>
          Escaneie o QR Code, copie o código e finalize no seu banco.
        </p>

        <div className="mt-5 rounded-[28px] p-5" style={{ backgroundColor: theme.surface, color: theme.text }}>
          <div className="mx-auto flex w-fit rounded-[26px] p-4 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.45)]" style={{ border: `1px solid ${theme.border}`, backgroundColor: "#ffffff" }}>
            <QRCodeSVG value={code} size={208} />
          </div>

          <div className="mt-5 rounded-[24px] p-4" style={{ backgroundColor: theme.surfaceAlt }}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ color: theme.textSoft }}>Código copia e cola</p>
            <p className="mt-2 break-all text-[12px] leading-6" style={{ color: theme.textMuted }}>{code}</p>
            <button
              type="button"
              onClick={onCopy}
              className={cn(
                "mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full text-[13px] font-bold transition",
                pixCopied ? "" : "",
              )}
              style={pixCopied ? { backgroundColor: "#10b981", color: "#ffffff" } : { background: theme.accentGradient, color: theme.inverseText }}
            >
              <Copy size={15} />
              {pixCopied ? "Código copiado" : "Copiar código"}
            </button>
          </div>
        </div>
      </section>

      <section
        className="rounded-[26px] p-5 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.28)]"
        style={{ border: `1px solid ${theme.border}`, backgroundColor: theme.surface }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ color: theme.textSoft }}>Tempo restante</p>
            <p className="mt-1 text-[24px] font-black" style={{ color: theme.text }}>{formatCountdown(paymentCountdown)}</p>
          </div>
          <div className="rounded-full px-3 py-1.5 text-[11px] font-bold" style={{ backgroundColor: theme.surfaceMuted, color: theme.accentStrong }}>
            {signalAmountLabel}
          </div>
        </div>

        <div className="mt-4 h-2.5 rounded-full" style={{ backgroundColor: theme.surfaceAlt }}>
          <div
            className="h-2.5 rounded-full transition-all duration-1000"
            style={{
              width: `${(paymentCountdown / 300) * 100}%`,
              background: paymentCountdown <= 60 ? "linear-gradient(90deg,#fb7185,#f97316)" : theme.accentGradient,
            }}
          />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <InfoCard theme={theme} label="Cliente" value={clientName} />
          <InfoCard theme={theme} label="Profissional" value={professionalName} />
          <InfoCard theme={theme} label="Data" value={dateLabel} />
          <InfoCard theme={theme} label="Horário" value={timeLabel} />
        </div>

        <div className="mt-5 space-y-3 rounded-[24px] p-4" style={{ backgroundColor: theme.surfaceAlt }}>
          <AmountRow theme={theme} label="Total dos serviços" value={totalAmountLabel} />
          <AmountRow theme={theme} label="Sinal agora" value={signalAmountLabel} />
          <AmountRow theme={theme} label="Restante no atendimento" value={remainingAmountLabel} />
        </div>

        <button
          type="button"
          disabled={paymentCountdown <= 0}
          onClick={onPaid}
          className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full text-[15px] font-bold transition disabled:opacity-60"
          style={{ background: theme.accentGradient, color: theme.inverseText }}
        >
          <MessageCircle size={18} />
          Já paguei
        </button>

        <p className="mt-3 text-center text-[12px] leading-5" style={{ color: theme.textMuted }}>
          Depois de tocar no botão, o WhatsApp da profissional será aberto para o envio do comprovante.
        </p>

        {paidCountdown !== null ? (
          <div className="mt-4 rounded-[22px] px-4 py-3 text-[13px] font-medium" style={{ backgroundColor: theme.successSoft, color: theme.successText }}>
            Comprovante enviado. Sua reserva será confirmada automaticamente em {paidCountdown}s.
          </div>
        ) : null}
      </section>
    </div>
  );
}

function InfoCard({ theme, label, value }: { theme: PublicPageTheme; label: string; value: string }) {
  return (
    <div className="rounded-[20px] px-4 py-3" style={{ border: `1px solid ${theme.border}`, backgroundColor: theme.surface }}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: theme.textSoft }}>{label}</p>
      <p className="mt-1 text-[13px] font-bold" style={{ color: theme.text }}>{value}</p>
    </div>
  );
}

function AmountRow({ theme, label, value }: { theme: PublicPageTheme; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[18px] px-4 py-3" style={{ backgroundColor: theme.surface }}>
      <span className="text-[12px] font-medium" style={{ color: theme.textMuted }}>{label}</span>
      <span className="text-[13px] font-bold" style={{ color: theme.text }}>{value}</span>
    </div>
  );
}
