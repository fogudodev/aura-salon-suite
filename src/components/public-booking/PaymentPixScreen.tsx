import { Copy, MessageCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";

type PaymentPixScreenProps = {
  accent: string;
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
  accent,
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
    <div className="space-y-5 px-5 pb-6 pt-5">
      <section className="rounded-[28px] bg-[linear-gradient(180deg,#bc2b98_0%,#f1a1c5_100%)] px-5 pb-6 pt-5 text-white shadow-[0_24px_52px_-24px_rgba(190,24,93,0.55)]">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.32em] text-white/72">Pagamento PIX</p>
        <h2 className="mt-2 text-center text-[26px] font-black leading-tight">Reserve sua vaga</h2>
        <p className="mt-2 text-center text-[13px] leading-5 text-white/80">
          Escaneie o QR Code, copie o codigo e finalize no seu banco.
        </p>

        <div className="mt-5 rounded-[28px] bg-white p-5 text-slate-900">
          <div className="mx-auto flex w-fit rounded-[26px] border border-[#f2e4ef] bg-white p-4 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.45)]">
            <QRCodeSVG value={code} size={208} />
          </div>

          <div className="mt-5 rounded-[24px] bg-[#faf5f9] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">Codigo copia e cola</p>
            <p className="mt-2 break-all text-[12px] leading-6 text-slate-600">{code}</p>
            <button
              type="button"
              onClick={onCopy}
              className={cn(
                "mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full text-[13px] font-bold text-white transition",
                pixCopied ? "bg-emerald-500" : "",
              )}
              style={pixCopied ? undefined : { background: `linear-gradient(90deg, ${accent}, #ff9db8)` }}
            >
              <Copy size={15} />
              {pixCopied ? "Codigo copiado" : "Copiar codigo"}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[26px] border border-[#f0e2ed] bg-white p-5 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.28)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">Tempo restante</p>
            <p className="mt-1 text-[24px] font-black text-slate-900">{formatCountdown(paymentCountdown)}</p>
          </div>
          <div className="rounded-full bg-[#fff1fb] px-3 py-1.5 text-[11px] font-bold text-[#bc2b98]">
            {signalAmountLabel}
          </div>
        </div>

        <div className="mt-4 h-2.5 rounded-full bg-[#f5dceb]">
          <div
            className="h-2.5 rounded-full transition-all duration-1000"
            style={{
              width: `${(paymentCountdown / 300) * 100}%`,
              background:
                paymentCountdown <= 60
                  ? "linear-gradient(90deg,#fb7185,#f97316)"
                  : `linear-gradient(90deg, ${accent}, #ff9db8)`,
            }}
          />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <InfoCard label="Cliente" value={clientName} />
          <InfoCard label="Profissional" value={professionalName} />
          <InfoCard label="Data" value={dateLabel} />
          <InfoCard label="Horario" value={timeLabel} />
        </div>

        <div className="mt-5 space-y-3 rounded-[24px] bg-[#faf5f9] p-4">
          <AmountRow label="Total dos servicos" value={totalAmountLabel} />
          <AmountRow label="Sinal agora" value={signalAmountLabel} />
          <AmountRow label="Restante no atendimento" value={remainingAmountLabel} />
        </div>

        <button
          type="button"
          disabled={paymentCountdown <= 0}
          onClick={onPaid}
          className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full text-[15px] font-bold text-white transition disabled:opacity-60"
          style={{ background: `linear-gradient(90deg, ${accent}, #ff9db8)` }}
        >
          <MessageCircle size={18} />
          Ja paguei
        </button>

        <p className="mt-3 text-center text-[12px] leading-5 text-slate-500">
          Depois de tocar no botao, o WhatsApp da profissional sera aberto para o envio do comprovante.
        </p>

        {paidCountdown !== null ? (
          <div className="mt-4 rounded-[22px] bg-emerald-50 px-4 py-3 text-[13px] font-medium text-emerald-700">
            Comprovante enviado. Sua reserva sera confirmada automaticamente em {paidCountdown}s.
          </div>
        ) : null}
      </section>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-[#f2e4ef] bg-white px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-1 text-[13px] font-bold text-slate-900">{value}</p>
    </div>
  );
}

function AmountRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[18px] bg-white px-4 py-3">
      <span className="text-[12px] font-medium text-slate-500">{label}</span>
      <span className="text-[13px] font-bold text-slate-900">{value}</span>
    </div>
  );
}
