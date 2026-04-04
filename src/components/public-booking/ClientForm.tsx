import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ClientFormProps = {
  clientName: string;
  clientPhone: string;
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
  onClientNameChange,
  onClientPhoneChange,
}: ClientFormProps) {
  return (
    <div className="space-y-5">
      <AppInput
        label="Nome"
        value={clientName}
        placeholder="Como devemos te chamar?"
        onChange={onClientNameChange}
      />
      <AppInput
        label="WhatsApp"
        value={clientPhone}
        placeholder="(11) 99999-9999"
        inputMode="tel"
        onChange={onClientPhoneChange}
      />
    </div>
  );
}
