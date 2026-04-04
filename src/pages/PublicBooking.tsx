import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, CheckCircle2, Loader2, MapPin, Sparkles, Star } from "lucide-react";
import { toast } from "sonner";
import { ClientForm } from "@/components/public-booking/ClientForm";
import { DateSelector } from "@/components/public-booking/DateSelector";
import { PaymentPixScreen } from "@/components/public-booking/PaymentPixScreen";
import { ProfessionalCard } from "@/components/public-booking/ProfessionalCard";
import { ServiceCard } from "@/components/public-booking/ServiceCard";
import { TimeSlot } from "@/components/public-booking/TimeSlot";
import { api } from "@/lib/api-client";
import { generatePixPayload } from "@/lib/pix-utils";
import { getServiceIconOption } from "@/lib/service-icons";
import { cn } from "@/lib/utils";

type Professional = { id: string; name: string; business_name: string | null; bio: string | null; phone: string | null; avatar_url: string | null; logo_url: string | null; cover_url: string | null; primary_color: string | null; bg_color: string | null; text_color: string | null; component_color: string | null; slug: string | null; account_type: "autonomous" | "salon"; welcome_title: string | null; welcome_description: string | null; confirmation_message: string | null; booking_advance_weeks: number | null };
type Employee = { id: string; name: string; specialty: string | null; avatar_url: string | null };
type Service = { id: string; name: string; description: string | null; price: number; duration_minutes: number; category: string | null; icon_key?: string | null };
type Slot = { start_time: string; end_time: string };
type PaymentConfig = { pix_key: string | null; pix_beneficiary_name: string | null; signal_enabled: boolean; signal_type: "percentage" | "fixed"; signal_value: number; accept_pix: boolean };
type ServiceFavoriteRow = { service_id: string };
type RpcSuccess = { success?: boolean; error?: string };
type SlotsRpc = RpcSuccess & { slots?: Slot[] };
type BookingRpc = RpcSuccess & { booking_id?: string };

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const cleanPhone = (value: string) => value.replace(/\D/g, "").slice(0, 11);
const maskPhone = (value: string) => { const digits = cleanPhone(value); if (digits.length <= 2) return digits; if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`; return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`; };
const waPhone = (value?: string | null) => { const digits = (value || "").replace(/\D/g, ""); if (!digits) return ""; return digits.startsWith("55") ? digits : `55${digits}`; };
const timeSP = (value: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
const stepTitles = { 1: "Seus dados", 2: "Escolha os serviços", 3: "Escolha data e hora", 4: "Confirme o agendamento" } as const;

const PublicBooking = () => {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeServices, setEmployeeServices] = useState<{ employee_id: string; service_id: string }[]>([]);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const [step, setStep] = useState(1);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [signalScreen, setSignalScreen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [pixTimeLeft, setPixTimeLeft] = useState(300);
  const [pixCopied, setPixCopied] = useState(false);
  const [signalConfirmLeft, setSignalConfirmLeft] = useState<number | null>(null);
  const accent = professional?.component_color || professional?.primary_color || "#c026d3";
  const bgColor = professional?.bg_color || "#fff1f7";
  const isSalon = professional?.account_type === "salon";

  useEffect(() => { const load = async () => { if (!slug) return; const { data: prof, error } = await api.from("professionals").select("id,name,business_name,bio,phone,avatar_url,logo_url,cover_url,primary_color,bg_color,text_color,component_color,slug,account_type,welcome_title,welcome_description,confirmation_message,booking_advance_weeks").eq("slug", slug).single(); if (error || !prof) { setNotFound(true); setLoading(false); return; } const [svc, emp, pay] = await Promise.all([api.from("services").select("*").eq("professional_id", prof.id).eq("active", true).order("sort_order", { ascending: true }), prof.account_type === "salon" ? api.from("salon_employees").select("id,name,specialty,avatar_url").eq("salon_id", prof.id).eq("is_active", true).order("name") : Promise.resolve({ data: [] }), api.rpc("get_public_payment_config", { p_professional_id: prof.id } as Record<string, unknown>)]); let empSvc: { data: { employee_id: string; service_id: string }[] } = { data: [] }; if (prof.account_type === "salon" && emp.data && emp.data.length > 0) { const employeeIds = (emp.data as Employee[]).map((employee) => employee.id); const employeeServicesResponse = await api.from("employee_services").select("employee_id,service_id").in("employee_id", employeeIds); empSvc = { data: (employeeServicesResponse.data || []) as { employee_id: string; service_id: string }[] }; } const payCfg = (pay.data || null) as PaymentConfig | null; setProfessional(prof as Professional); setServices(((svc.data || []) as Service[]).map((service) => ({ ...service, icon_key: service.icon_key || null }))); setEmployees((emp.data || []) as Employee[]); setEmployeeServices((empSvc.data || []) as { employee_id: string; service_id: string }[]); setPaymentConfig(payCfg); setLoading(false); }; load(); }, [slug]);

  useEffect(() => { const loadFavorites = async () => { if (!professional?.id || cleanPhone(clientPhone).length < 10) { setFavoriteIds([]); return; } const { data } = await api.rpc("get_public_client_service_favorites", { p_professional_id: professional.id, p_client_phone: cleanPhone(clientPhone) } as Record<string, unknown>); setFavoriteIds(((data || []) as ServiceFavoriteRow[]).map((item) => item.service_id)); }; loadFavorites(); }, [clientPhone, professional?.id]);
  useEffect(() => { if (!signalScreen || pixTimeLeft <= 0) return; const id = window.setInterval(() => setPixTimeLeft((value) => (value <= 1 ? 0 : value - 1)), 1000); return () => window.clearInterval(id); }, [signalScreen, pixTimeLeft]);
  useEffect(() => { if (signalConfirmLeft === null) return; if (signalConfirmLeft <= 0 && bookingId) { api.rpc("confirm_public_signal_booking", { p_booking_id: bookingId } as Record<string, unknown>).then(({ data }) => { const result = (data || {}) as RpcSuccess; if (result.success) { setConfirmed(true); setSignalScreen(false); toast.success("Agendamento confirmado."); } else { toast.error(result.error || "Não foi possível confirmar."); } setSignalConfirmLeft(null); }); return; } const id = window.setInterval(() => setSignalConfirmLeft((value) => (value === null ? null : value <= 1 ? 0 : value - 1)), 1000); return () => window.clearInterval(id); }, [bookingId, signalConfirmLeft]);

  const selectedServices = useMemo(() => services.filter((service) => serviceIds.includes(service.id)), [services, serviceIds]);
  const favoriteServices = useMemo(() => services.filter((service) => favoriteIds.includes(service.id)), [favoriteIds, services]);
  const selectedEmployee = useMemo(() => employees.find((employee) => employee.id === employeeId) || null, [employeeId, employees]);
  const filteredEmployees = useMemo(() => { if (!isSalon) return []; if (!serviceIds.length) return employees; return employees.filter((employee) => { const assigned = employeeServices.filter((item) => item.employee_id === employee.id); if (!assigned.length) return true; const set = new Set(assigned.map((item) => item.service_id)); return serviceIds.every((serviceId) => set.has(serviceId)); }); }, [employeeServices, employees, isSalon, serviceIds]);

  useEffect(() => { if (employeeId && !filteredEmployees.some((employee) => employee.id === employeeId)) { setEmployeeId(null); setSlot(null); } }, [employeeId, filteredEmployees]);

  const totalPrice = selectedServices.reduce((sum, service) => sum + Number(service.price), 0);
  const totalDuration = selectedServices.reduce((sum, service) => sum + Number(service.duration_minutes), 0);
  const signalAmount = useMemo(() => !paymentConfig?.signal_enabled ? 0 : paymentConfig.signal_type === "percentage" ? Math.round(totalPrice * paymentConfig.signal_value) / 100 : Math.min(paymentConfig.signal_value || 0, totalPrice), [paymentConfig, totalPrice]);
  const needsSignal = Boolean(paymentConfig?.signal_enabled && paymentConfig.accept_pix && paymentConfig.pix_key && signalAmount > 0);
  const days = useMemo(() => Array.from({ length: Math.max(7, Math.min((professional?.booking_advance_weeks || 3) * 7, 21)) }).map((_, index) => addDays(new Date(), index)), [professional?.booking_advance_weeks]);

  useEffect(() => { const loadSlots = async () => { if (!professional?.id || !selectedDate || !serviceIds.length || (isSalon && !employeeId)) { setSlots([]); return; } setLoadingSlots(true); setSlot(null); const { data } = await api.rpc("get_available_slots_v2", { p_professional_id: professional.id, p_service_ids: serviceIds, p_date: format(selectedDate, "yyyy-MM-dd"), p_employee_id: employeeId } as Record<string, unknown>); setSlots((((data || {}) as SlotsRpc).slots || []) as Slot[]); setLoadingSlots(false); }; loadSlots(); }, [employeeId, isSalon, professional?.id, selectedDate, serviceIds]);

  const pixPayload = useMemo(() => !needsSignal || !paymentConfig?.pix_key || !professional ? "" : generatePixPayload({ pixKey: paymentConfig.pix_key, beneficiaryName: paymentConfig.pix_beneficiary_name || professional.name || "Beneficiário", amount: signalAmount, city: "SAO PAULO", txId: (bookingId || "AGENDA").replace(/-/g, "").slice(0, 25), description: `Sinal ${professional.business_name || professional.name}`.slice(0, 72) } as never), [bookingId, needsSignal, paymentConfig, professional, signalAmount]);
  const whatsappLink = useMemo(() => { if (!professional?.phone || !slot) return ""; const msg = ["Oi! Acabei de pagar o sinal.", "", `Cliente: ${clientName}`, `WhatsApp: ${maskPhone(clientPhone)}`, `Serviços: ${selectedServices.map((service) => service.name).join(", ")}`, `Profissional: ${selectedEmployee?.name || professional.name}`, `Data: ${format(new Date(slot.start_time), "dd/MM/yyyy")}`, `Horário: ${timeSP(slot.start_time)}`, `Valor do sinal: ${money(signalAmount)}`, "", "Estou enviando o comprovante agora."].join("\n"); return `https://wa.me/${waPhone(professional.phone)}?text=${encodeURIComponent(msg)}`; }, [clientName, clientPhone, professional, selectedEmployee?.name, selectedServices, signalAmount, slot]);

  const toggleFavorite = async (serviceId: string) => { if (!professional?.id || !clientName.trim() || cleanPhone(clientPhone).length < 10) { toast.error("Preencha nome e WhatsApp antes de favoritar."); return; } const { data } = await api.rpc("toggle_public_service_favorite", { p_professional_id: professional.id, p_client_name: clientName.trim(), p_client_phone: cleanPhone(clientPhone), p_service_id: serviceId } as Record<string, unknown>); const result = (data || {}) as RpcSuccess & { favorited?: boolean }; if (result.success) setFavoriteIds((current) => result.favorited ? [...current, serviceId] : current.filter((id) => id !== serviceId)); };
  const submitBooking = async () => { if (!professional?.id || !slot) return; if (!serviceIds.length) return toast.error("Selecione ao menos um serviço."); if (cleanPhone(clientPhone).length < 10) return toast.error("WhatsApp inválido."); setSubmitting(true); const payload = { p_professional_id: professional.id, p_service_ids: serviceIds, p_start_time: slot.start_time, p_client_name: clientName.trim(), p_client_phone: cleanPhone(clientPhone), p_employee_id: employeeId || null, p_requires_signal: needsSignal, p_signal_amount: signalAmount }; console.log("PAYLOAD BOOKING:", payload); const { data, error } = await api.rpc("create_public_booking_v2", payload); setSubmitting(false); if (error) { console.error(error); return toast.error("Erro na requisição."); } const result = data as BookingRpc; if (!result?.success) return toast.error(result?.error || "Erro ao criar agendamento."); setBookingId(result.booking_id || null); if (needsSignal) { setPixTimeLeft(300); setSignalScreen(true); toast.success("Pague o sinal para reservar a vaga."); return; } setConfirmed(true); toast.success("Agendamento confirmado."); };
  const onSignalPaid = async () => { if (!bookingId) return; await api.rpc("mark_public_signal_payment_sent", { p_booking_id: bookingId } as Record<string, unknown>); if (whatsappLink) window.open(whatsappLink, "_blank", "noopener,noreferrer"); setSignalConfirmLeft(40); toast.success("Envie o comprovante no WhatsApp. A reserva será confirmada em instantes."); };
  const resetAll = () => { setStep(1); setClientName(""); setClientPhone(""); setFavoriteIds([]); setServiceIds([]); setEmployeeId(null); setSelectedDate(null); setSlot(null); setSlots([]); setBookingId(null); setSignalScreen(false); setConfirmed(false); setPixTimeLeft(300); setSignalConfirmLeft(null); };

  const bookingDateLabel = slot ? format(new Date(slot.start_time), "dd 'de' MMMM", { locale: ptBR }) : "-";
  const bookingDateShortLabel = slot ? format(new Date(slot.start_time), "dd/MM/yyyy") : "-";
  const bookingTimeLabel = slot ? timeSP(slot.start_time) : "-";
  const professionalLabel = selectedEmployee?.name || professional?.name || "-";
  const greetingTitle = professional?.welcome_title || professional?.business_name || professional?.name || "";
  const greetingDescription = professional?.welcome_description || professional?.bio || "Agende seu horário em poucos passos com uma experiência simples e mobile.";
  const canMoveFromStep1 = clientName.trim().length > 0 && cleanPhone(clientPhone).length >= 10;

  if (loading) return <CenteredState><div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-lg"><Loader2 className="h-7 w-7 animate-spin text-[#bc2b98]" /></div></CenteredState>;
  if (notFound || !professional) return <CenteredState><div className="rounded-[30px] bg-white px-8 py-10 text-center shadow-[0_26px_70px_-28px_rgba(15,23,42,0.4)]"><p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#c671b4]">Link indisponível</p><h1 className="mt-3 text-2xl font-black text-slate-900">Página não encontrada</h1><p className="mt-3 text-sm leading-6 text-slate-500">O link público deste profissional não está disponível no momento.</p></div></CenteredState>;

  return (
    <div
      className="min-h-screen px-3 py-4 sm:px-6 sm:py-6"
      style={{ background: `radial-gradient(circle at top, ${accent}18 0%, transparent 32%), linear-gradient(180deg, ${bgColor} 0%, #fff8fd 100%)` }}
    >
      <div className="mx-auto max-w-[430px]">
        <div className="overflow-hidden rounded-[38px] bg-[#fffdfd] shadow-[0_32px_90px_-30px_rgba(15,23,42,0.38)]">
          {signalScreen ? null : confirmed ? <GradientHeader title="Reserva confirmada" /> : step === 1 ? <HeroHeader accent={accent} coverUrl={professional.cover_url} description={greetingDescription} logoUrl={professional.logo_url || professional.avatar_url} title={greetingTitle} /> : <GradientHeader title={stepTitles[step as 1 | 2 | 3 | 4]} onBack={() => setStep((current) => Math.max(1, current - 1))} />}

          {signalScreen ? (
            <PaymentPixScreen
              accent={accent}
              clientName={clientName}
              code={pixPayload || paymentConfig?.pix_key || ""}
              dateLabel={bookingDateShortLabel}
              onCopy={async () => { await navigator.clipboard.writeText(pixPayload || paymentConfig?.pix_key || ""); setPixCopied(true); toast.success("Código PIX copiado."); setTimeout(() => setPixCopied(false), 1500); }}
              onPaid={onSignalPaid}
              paidCountdown={signalConfirmLeft}
              paymentCountdown={pixTimeLeft}
              pixCopied={pixCopied}
              professionalName={professionalLabel}
              remainingAmountLabel={money(totalPrice - signalAmount)}
              signalAmountLabel={money(signalAmount)}
              timeLabel={bookingTimeLabel}
              totalAmountLabel={money(totalPrice)}
            />
          ) : confirmed && slot ? (
            <div className="px-5 pb-6 pt-5">
              <div className="mb-5 flex gap-2">{[1, 2, 3, 4].map((item) => <div key={item} className="h-2 flex-1 rounded-full bg-[#d89fcb]" />)}</div>
              <div className="rounded-[30px] bg-[#fff6fb] p-5 shadow-[0_20px_48px_-28px_rgba(190,24,93,0.35)]">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 size={30} /></div>
                <h2 className="mt-4 text-center text-[26px] font-black leading-tight text-slate-900">Tudo certo, {clientName.split(" ")[0] || "cliente"}.</h2>
                <p className="mt-2 text-center text-sm leading-6 text-slate-500">{professional.confirmation_message || "Seu horário já está reservado."}</p>
                <div className="mt-6 space-y-3">
                  {selectedServices.map((service) => {
                    const icon = getServiceIconOption(service.icon_key, service.name, service.category);
                    return (
                      <div key={service.id} className="flex items-center gap-4 rounded-[24px] bg-white px-4 py-4 shadow-[0_16px_34px_-26px_rgba(15,23,42,0.38)]">
                        <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-[#fdf2fa] text-2xl">{icon.emoji}</div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-bold text-slate-900">{service.name}</p>
                          <p className="mt-1 text-[12px] text-slate-400">ID: {bookingId?.slice(0, 8).toUpperCase() || "AGENDA"}</p>
                        </div>
                        <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-[11px] font-bold text-emerald-600">Confirmado</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-5 rounded-[26px] bg-white p-4 shadow-[0_18px_38px_-26px_rgba(15,23,42,0.34)]">
                  <SummaryRow label="Profissional" value={professionalLabel} />
                  <SummaryRow label="Data" value={bookingDateShortLabel} />
                  <SummaryRow label="Horário" value={bookingTimeLabel} />
                  <SummaryRow label="WhatsApp" value={maskPhone(clientPhone)} />
                  <SummaryRow label="Valor total" value={money(totalPrice)} last />
                </div>
                <PrimaryAction accent={accent} className="mt-6" onClick={resetAll}>Fazer novo agendamento</PrimaryAction>
              </div>
            </div>
          ) : (
            <div className="px-5 pb-6 pt-4">
              <StepProgress accent={accent} step={step} />

              {step === 1 ? (
                <div className="pt-5">
                  <SectionIntro eyebrow="Etapa 1" title="Antes de começar" subtitle="Informe seu nome e WhatsApp para continuar o agendamento." />
                  <ClientForm clientName={clientName} clientPhone={clientPhone} onClientNameChange={setClientName} onClientPhoneChange={(value) => setClientPhone(maskPhone(value))} />
                  <div className="mt-5 rounded-[26px] bg-[#fff6fb] p-4 shadow-[0_18px_40px_-28px_rgba(190,24,93,0.34)]">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#bc2b98] shadow-sm"><Sparkles size={18} /></div>
                      <div>
                        <p className="text-[13px] font-bold text-slate-900">Experiência rápida no celular</p>
                        <p className="mt-1 text-[13px] leading-5 text-slate-500">Seus dados ajudam a salvar favoritos e agilizam os próximos agendamentos.</p>
                      </div>
                    </div>
                  </div>
                  <PrimaryAction accent={accent} className="mt-6" onClick={() => { if (!canMoveFromStep1) { toast.error("Preencha nome e WhatsApp para continuar."); return; } setStep(2); }}>Escolher serviços</PrimaryAction>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="pt-5">
                  <SectionIntro eyebrow="Etapa 2" title="Escolha os serviços" subtitle="Selecione um ou mais serviços e favorite os seus preferidos." />
                  {favoriteServices.length > 0 ? (
                    <div className="mb-5 space-y-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#a98ba3]">Favoritos</p>
                      <div className="space-y-3">
                        {favoriteServices.slice(0, 3).map((service) => {
                          const icon = getServiceIconOption(service.icon_key, service.name, service.category);
                          const selected = serviceIds.includes(service.id);
                          return (
                            <div key={service.id} className="flex items-center gap-3 rounded-[24px] bg-white px-4 py-4 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.32)]">
                              <div className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-[#fdf2fa] text-2xl">{icon.emoji}</div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[14px] font-bold text-slate-900">{service.name}</p>
                                <div className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-400"><MapPin size={12} /><span className="truncate">{professional.business_name || professional.name}</span></div>
                                <div className="mt-2 flex items-center gap-1 text-[#bc2b98]"><Star size={12} className="fill-current" /><Star size={12} className="fill-current" /><Star size={12} className="fill-current" /><Star size={12} className="fill-current" /><Star size={12} className="fill-current opacity-40" /></div>
                              </div>
                              <button type="button" onClick={() => setServiceIds((current) => current.includes(service.id) ? current.filter((id) => id !== service.id) : [...current, service.id])} className="h-10 rounded-full px-4 text-[12px] font-bold text-white" style={{ background: selected ? "linear-gradient(90deg,#7c3aed,#d946ef)" : `linear-gradient(90deg, ${accent}, #ff9db8)` }}>{selected ? "Selecionado" : "Agendar"}</button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3">
                    {services.map((service) => {
                      const icon = getServiceIconOption(service.icon_key, service.name, service.category);
                      return (
                        <ServiceCard
                          key={service.id}
                          accent={accent}
                          badge={favoriteIds.includes(service.id) ? "Favorito" : undefined}
                          description={service.description || service.category}
                          durationLabel={`${service.duration_minutes} min`}
                          favorite={favoriteIds.includes(service.id)}
                          icon={icon.emoji}
                          name={service.name}
                          priceLabel={money(Number(service.price))}
                          selected={serviceIds.includes(service.id)}
                          onToggleFavorite={() => toggleFavorite(service.id)}
                          onToggleSelect={() => setServiceIds((current) => current.includes(service.id) ? current.filter((id) => id !== service.id) : [...current, service.id])}
                        />
                      );
                    })}
                  </div>
                  <PrimaryAction accent={accent} className="mt-6" onClick={() => { if (!serviceIds.length) { toast.error("Selecione ao menos um serviço."); return; } setStep(3); }}>Agendar horário</PrimaryAction>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="space-y-5 pt-5">
                  <DateSelector accent={accent} days={days} selectedDate={selectedDate} onSelect={(date) => { setSelectedDate(date); setSlot(null); }} />
                  <div className="space-y-4">
                    <SectionIntro eyebrow="Horários" title="Horários disponíveis" subtitle={isSalon ? "Escolha o profissional para liberar os horários disponíveis." : "Os horários já consideram a duração total dos serviços."} />
                    <div className="grid grid-cols-3 gap-3">{slots.map((item) => <TimeSlot key={item.start_time} accent={accent} label={timeSP(item.start_time)} selected={slot?.start_time === item.start_time} onClick={() => setSlot(item)} />)}</div>
                    {loadingSlots ? <div className="flex items-center justify-center rounded-[24px] bg-white px-4 py-6 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.28)]"><Loader2 className="h-5 w-5 animate-spin text-[#bc2b98]" /></div> : null}
                    {!loadingSlots && !slots.length ? <div className="rounded-[24px] bg-white px-4 py-5 text-[13px] leading-6 text-slate-500 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.28)]">{isSalon ? "Escolha a profissional abaixo para ver os horários." : "Escolha uma data para visualizar os horários disponíveis."}</div> : null}
                  </div>
                  {isSalon ? (
                    <div className="space-y-4">
                      <SectionIntro eyebrow="Equipe" title="Escolha o profissional" subtitle="Deslize e selecione quem vai realizar o atendimento." />
                      <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {filteredEmployees.map((employee) => <ProfessionalCard key={employee.id} accent={accent} avatarUrl={employee.avatar_url} name={employee.name} selected={employeeId === employee.id} specialty={employee.specialty} onClick={() => { setEmployeeId(employee.id); setSlot(null); }} />)}
                      </div>
                    </div>
                  ) : null}
                  <PrimaryAction accent={accent} onClick={() => { if (isSalon && !employeeId) return toast.error("Selecione a profissional."); if (!selectedDate || !slot) return toast.error("Escolha dia e horário."); setStep(4); }}>Revisar agendamento</PrimaryAction>
                </div>
              ) : null}

              {step === 4 && slot ? (
                <div className="space-y-5 pt-5">
                  <SectionIntro eyebrow="Etapa 4" title="Confira os detalhes" subtitle="Revise seu agendamento antes de confirmar a reserva." />
                  <div className="space-y-3">
                    <DetailCard label="Cliente" value={clientName} />
                    <DetailCard label="WhatsApp" value={maskPhone(clientPhone)} />
                    <DetailCard label="Serviços" value={selectedServices.map((service) => service.name).join(", ")} />
                    <DetailCard label="Profissional" value={professionalLabel} />
                    <DetailCard label="Data" value={bookingDateLabel} />
                    <DetailCard label="Horário" value={bookingTimeLabel} />
                  </div>
                  <div className="rounded-[28px] bg-[#121a31] p-5 text-white shadow-[0_28px_54px_-28px_rgba(15,23,42,0.8)]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/56">Total previsto</p>
                    <p className="mt-3 text-[38px] font-black leading-none">{money(totalPrice)}</p>
                    <p className="mt-3 text-[14px] text-white/72">{totalDuration} min no total</p>
                    {needsSignal ? <div className="mt-4 rounded-full bg-white/10 px-4 py-3 text-sm font-semibold text-white/90">Sinal: {money(signalAmount)}</div> : null}
                  </div>
                  <PrimaryAction accent={accent} disabled={submitting} onClick={submitBooking}>{submitting ? "Salvando..." : needsSignal ? "Reservar vaga" : "Confirmar agendamento"}</PrimaryAction>
                  <button type="button" onClick={() => setStep(3)} className="h-12 w-full rounded-full border border-[#eed8eb] bg-white text-[13px] font-bold text-slate-600 transition hover:bg-[#fff7fb]">Ajustar horário</button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function CenteredState({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#fef5fb_0%,#ffffff_100%)] px-6">{children}</div>;
}

function HeroHeader({ accent, coverUrl, description, logoUrl, title }: { accent: string; coverUrl: string | null; description: string; logoUrl: string | null; title: string }) {
  return (
    <section className="relative h-[250px] overflow-hidden" style={{ backgroundImage: coverUrl ? `linear-gradient(180deg, rgba(8,15,31,0.08), rgba(8,15,31,0.55)), url(${coverUrl})` : `linear-gradient(135deg, ${accent}, #ff9db8)` }}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.24),transparent_30%)]" />
      <div className="relative flex h-full flex-col justify-end p-5 text-white">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[22px] bg-white/18 shadow-[0_18px_40px_-26px_rgba(15,23,42,0.8)] backdrop-blur-sm">{logoUrl ? <img src={logoUrl} alt={title} className="h-full w-full object-cover" /> : <span className="text-2xl font-black">{title.slice(0, 1).toUpperCase()}</span>}</div>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.36em] text-white/72">Agendamento online</p>
        <h1 className="mt-2 text-[38px] font-black leading-[1.02]">{title}</h1>
        <p className="mt-3 max-w-[320px] text-[14px] leading-6 text-white/82">{description}</p>
      </div>
    </section>
  );
}

function GradientHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <section className="bg-[linear-gradient(180deg,#bc2b98_0%,#f1a1c5_100%)] px-5 pb-6 pt-5 text-white">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className={cn("flex h-10 w-10 items-center justify-center rounded-full bg-white/12 transition", onBack ? "opacity-100" : "pointer-events-none opacity-0")}><ArrowLeft size={18} /></button>
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-white/70">Aura Salon</p>
          <h1 className="mt-2 text-[18px] font-black uppercase tracking-[0.08em]">{title}</h1>
        </div>
        <div className="h-10 w-10" />
      </div>
    </section>
  );
}

function StepProgress({ accent, step }: { accent: string; step: number }) {
  return <div className="flex gap-2.5">{[1, 2, 3, 4].map((item) => <div key={item} className={cn("h-2 flex-1 rounded-full transition-opacity", step >= item ? "opacity-100" : "opacity-30")} style={{ backgroundColor: accent }} />)}</div>;
}

function SectionIntro({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#a88aa2]">{eyebrow}</p>
      <h2 className="mt-2 text-[28px] font-black leading-[1.05] text-slate-900">{title}</h2>
      <p className="mt-2 text-[14px] leading-6 text-slate-500">{subtitle}</p>
    </div>
  );
}

function PrimaryAction({ accent, children, className, disabled, onClick }: { accent: string; children: ReactNode; className?: string; disabled?: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={cn("h-14 w-full rounded-full text-[15px] font-bold text-white shadow-[0_24px_40px_-24px_rgba(190,24,93,0.7)] transition hover:opacity-95 disabled:opacity-60", className)} style={{ background: `linear-gradient(90deg, ${accent}, #ff9db8)` }}>{children}</button>;
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[24px] bg-white px-4 py-4 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.32)]"><p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-400">{label}</p><p className="mt-2 text-[16px] font-bold leading-6 text-slate-900">{value || "-"}</p></div>;
}

function SummaryRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return <div className={cn("flex items-center justify-between gap-4 py-3", last ? "" : "border-b border-[#f2e5ee]")}><span className="text-[12px] font-semibold uppercase tracking-[0.24em] text-slate-400">{label}</span><span className="text-right text-[14px] font-bold text-slate-900">{value}</span></div>;
}

export default PublicBooking;
