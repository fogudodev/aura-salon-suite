import type { InputHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import type { PublicPageTheme } from "@/lib/public-page-theme";
import { cn } from "@/lib/utils";

type ClientFormProps = {
  clientName: string;
  clientPhone: string;
  checkingClient: boolean;
  isRecognizedClient: boolean;
  recognizedClientName: string | null;
  showNameField: boolean;
  theme: PublicPageTheme;
  onClientNameChange: (value: string) => void;
  onClientPhoneChange: (value: string) => void;
};

type AppInputProps = {
  label: string;
  value: string;
  placeholder: string;
  labelColor: string;
  onChange: (value: string) => void;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
};

function AppInput({ label, value, placeholder, labelColor, onChange, inputMode }: AppInputProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.32em]" style={{ color: labelColor }}>
        {label}
      </span>
      <input
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-14 w-full rounded-[22px] border border-[#f1e3df] bg-white px-4 text-[15px] font-medium text-slate-900 outline-none transition",
          "shadow-[0_12px_24px_-18px_rgba(190,24,93,0.18)] placeholder:text-slate-400 focus:border-[#e7b3a3] focus:ring-4 focus:ring-[#f7ddd3]",
        )}
      />
    </label>
  );
}

export function ClientForm({
  clientName,
  clientPhone,
  checkingClient,
  isRecognizedClient,
  recognizedClientName,
  showNameField,
  theme,
  onClientNameChange,
  onClientPhoneChange,
}: ClientFormProps) {
  return (
    <div className="space-y-5" style={{ color: theme.text }}>
      <AppInput
        label="WhatsApp"
        value={clientPhone}
        placeholder="(11) 99999-9999"
        inputMode="tel"
        labelColor={theme.textMuted}
        onChange={onClientPhoneChange}
      />

      {checkingClient ? (
        <div
          className="flex items-center gap-3 rounded-[22px] px-4 py-4 text-[13px] shadow-[0_16px_32px_-24px_rgba(15,23,42,0.18)]"
          style={{ border: `1px solid ${theme.border}`, backgroundColor: theme.surface, color: theme.textMuted }}
        >
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: theme.accent }} />
          <span>Procurando seu cadastro...</span>
        </div>
      ) : null}

      {isRecognizedClient && recognizedClientName ? (
        <div
          className="rounded-[22px] px-4 py-4 shadow-[0_18px_36px_-26px_rgba(190,24,93,0.24)]"
          style={{ backgroundColor: theme.surfaceMuted, boxShadow: `0 18px 36px -26px ${theme.accentShadow}` }}
        >
          <p className="text-[16px] font-bold" style={{ color: theme.text }}>
            Bem-vindo de volta, {recognizedClientName}!
          </p>
          <p className="mt-1 text-[13px] leading-5" style={{ color: theme.textMuted }}>
            Encontramos seu cadastro e vamos agilizar seu atendimento.
          </p>
        </div>
      ) : null}

      {showNameField ? (
        <AppInput
          label="Nome"
          value={clientName}
          placeholder="Como devemos te chamar?"
          labelColor={theme.textMuted}
          onChange={onClientNameChange}
        />
      ) : null}

      {!checkingClient && !isRecognizedClient && !showNameField ? (
        <p className="text-[12px] leading-5" style={{ color: theme.textSoft }}>
          Digite um WhatsApp válido para verificar se já existe um cadastro.
        </p>
      ) : null}
    </div>
  );
}
