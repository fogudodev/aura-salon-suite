import type { InputHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ClientFormProps = {
  clientName: string;
  clientPhone: string;
  checkingClient: boolean;
  isRecognizedClient: boolean;
  recognizedClientName: string | null;
  showNameField: boolean;
  onClientNameChange: (value: string) => void;
  onClientPhoneChange: (value: string) => void;
};

type AppInputProps = {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
};

function AppInput({ label, value, placeholder, onChange, inputMode }: AppInputProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.3em] text-[#9f8da2]">
        {label}
      </span>
      <input
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-16 w-full rounded-[24px] border border-[#f0e5ef] bg-white px-5 text-[15px] font-medium text-slate-900 outline-none transition",
          "shadow-[0_12px_24px_-18px_rgba(190,24,93,0.25)] placeholder:text-slate-400 focus:border-[#d48bc6] focus:ring-4 focus:ring-[#f8d2ea]",
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
  onClientNameChange,
  onClientPhoneChange,
}: ClientFormProps) {
  return (
    <div className="space-y-5">
      <AppInput
        label="WhatsApp"
        value={clientPhone}
        placeholder="(11) 99999-9999"
        inputMode="tel"
        onChange={onClientPhoneChange}
      />

      {checkingClient ? (
        <div className="flex items-center gap-3 rounded-[24px] border border-[#efe0ec] bg-white px-4 py-4 text-[13px] text-slate-500 shadow-[0_16px_32px_-24px_rgba(15,23,42,0.25)]">
          <Loader2 className="h-4 w-4 animate-spin text-[#bc2b98]" />
          <span>Procurando seu cadastro...</span>
        </div>
      ) : null}

      {isRecognizedClient && recognizedClientName ? (
        <div className="rounded-[24px] bg-[#fff6fb] px-4 py-4 shadow-[0_18px_36px_-26px_rgba(190,24,93,0.35)]">
          <p className="text-[16px] font-bold text-slate-900">
            Bem-vindo de volta, {recognizedClientName}!
          </p>
          <p className="mt-1 text-[13px] leading-5 text-slate-500">
            Encontramos seu cadastro e vamos agilizar seu atendimento.
          </p>
        </div>
      ) : null}

      {showNameField ? (
        <AppInput
          label="Nome"
          value={clientName}
          placeholder="Como devemos te chamar?"
          onChange={onClientNameChange}
        />
      ) : null}

      {!checkingClient && !isRecognizedClient && !showNameField ? (
        <p className="text-[12px] leading-5 text-slate-400">
          Digite um WhatsApp válido para verificar se já existe um cadastro.
        </p>
      ) : null}
    </div>
  );
}
