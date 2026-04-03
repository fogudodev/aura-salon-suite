import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, CheckCircle2, Copy, Heart, Loader2, MessageCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { generatePixPayload } from "@/lib/pix-utils";
import { cn } from "@/lib/utils";
import { getServiceIconOption } from "@/lib/service-icons";

type Professional = { id: string; name: string; business_name: string | null; bio: string | null; phone: string | null; avatar_url: string | null; logo_url: string | null; cover_url: string | null; primary_color: string | null; bg_color: string | null; text_color: string | null; component_color: string | null; slug: string | null; account_type: "autonomous" | "salon"; welcome_title: string | null; welcome_description: string | null; confirmation_message: string | null; booking_advance_weeks: number | null };
type Employee = { id: string; name: string; specialty: string | null; avatar_url: string | null };
type Service = { id: string; name: string; description: string | null; price: number; duration_minutes: number; category: string | null; icon_key?: string | null };
type Slot = { start_time: string; end_time: string };
type PaymentConfig = { pix_key: string | null; pix_beneficiary_name: string | null; signal_enabled: boolean; signal_type: "percentage" | "fixed"; signal_value: number; accept_pix: boolean };
type ServiceFavoriteRow = { service_id: string };
type RpcSuccess = { success?: boolean; error?: string };
type SlotsRpc = RpcSuccess & { slots?: Slot[] };
type BookingRpc = RpcSuccess & { booking_id?: string };

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const cleanPhone = (v: string) => v.replace(/\D/g, "").slice(0, 11);
const maskPhone = (v: string) => { const d = cleanPhone(v); if (d.length <= 2) return d; if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`; return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; };
const waPhone = (v?: string | null) => { const d = (v || "").replace(/\D/g, ""); if (!d) return ""; return d.startsWith("55") ? d : `55${d}`; };
const timeSP = (v: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(v));

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base outline-none transition focus:border-slate-400" /></label>;
}

function PrimaryButton({ accent, className, disabled, onClick, children }: { accent: string; className?: string; disabled?: boolean; onClick: () => void; children: import("react").ReactNode }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={cn("h-14 w-full rounded-full text-base font-bold text-white shadow-lg transition hover:opacity-95 disabled:opacity-70", className)} style={{ background: `linear-gradient(90deg, ${accent}, #f7a4c4)` }}>{children}</button>;
}

function SectionHeader({ eyebrow, title, subtitle, light = false }: { eyebrow: string; title: string; subtitle?: string; light?: boolean }) {
  return (
    <div className="mb-5">
      <p className={cn("text-[11px] font-semibold uppercase tracking-[0.32em]", light ? "text-white/70" : "text-slate-400")}>{eyebrow}</p>
      <h3 className={cn("mt-2 text-2xl font-black", light ? "text-white" : "text-slate-900")}>{title}</h3>
      {subtitle ? <p className={cn("mt-1.5 text-sm", light ? "text-white/80" : "text-slate-500")}>{subtitle}</p> : null}
    </div>
  );
}

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

  useEffect(() => {
    const load = async () => {
      if (!slug) return;
      const { data: prof, error } = await api
        .from("professionals")
        .select("id,name,business_name,bio,phone,avatar_url,logo_url,cover_url,primary_color,bg_color,text_color,component_color,slug,account_type,welcome_title,welcome_description,confirmation_message,booking_advance_weeks")
        .eq("slug", slug)
        .single();

      if (error || !prof) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const [svc, emp, pay, empSvc, sub] = await Promise.all([
        api.from("services").select("*").eq("professional_id", prof.id).eq("active", true).order("sort_order", { ascending: true }),
        prof.account_type === "salon"
          ? api.from("salon_employees").select("id,name,specialty,avatar_url").eq("salon_id", prof.id).eq("is_active", true).order("name")
          : Promise.resolve({ data: [] }),
        api.from("payment_config").select("pix_key,pix_beneficiary_name,signal_enabled,signal_type,signal_value,accept_pix").eq("professional_id", prof.id).maybeSingle(),
        prof.account_type === "salon"
          ? api.from("employee_services").select("employee_id,service_id").eq("salon_id", prof.id)
          : Promise.resolve({ data: [] }),
        api.from("subscriptions").select("plan_id").eq("professional_id", prof.id).eq("status", "active").maybeSingle(),
      ]);

      const payCfg = (pay.data || null) as PaymentConfig | null;
      if (payCfg && !["enterprise", "pro"].includes(sub.data?.plan_id || "")) payCfg.signal_enabled = false;

      setProfessional(prof as Professional);
      setServices(((svc.data || []) as Service[]).map((s) => ({ ...s, icon_key: s.icon_key || null })));
      setEmployees((emp.data || []) as Employee[]);
      setEmployeeServices((empSvc.data || []) as { employee_id: string; service_id: string }[]);
      setPaymentConfig(payCfg);
      setLoading(false);
    };

    load();
  }, [slug]);

  useEffect(() => {
    const loadFavorites = async () => {
      if (!professional?.id || cleanPhone(clientPhone).length < 10) {
        setFavoriteIds([]);
        return;
      }
      const { data } = await api.rpc("get_public_client_service_favorites", {
        p_professional_id: professional.id,
        p_client_phone: cleanPhone(clientPhone),
      } as Record<string, unknown>);
      setFavoriteIds(((data || []) as ServiceFavoriteRow[]).map((x) => x.service_id));
    };
    loadFavorites();
  }, [clientPhone, professional?.id]);

  useEffect(() => {
    if (!signalScreen || pixTimeLeft <= 0) return;
    const id = window.setInterval(() => setPixTimeLeft((v) => (v <= 1 ? 0 : v - 1)), 1000);
    return () => window.clearInterval(id);
  }, [signalScreen, pixTimeLeft]);

  useEffect(() => {
    if (signalConfirmLeft === null) return;
    if (signalConfirmLeft <= 0 && bookingId) {
      api.rpc("confirm_public_signal_booking", { p_booking_id: bookingId } as Record<string, unknown>).then(({ data }) => {
        const result = (data || {}) as RpcSuccess;
        if (result.success) {
          setConfirmed(true);
          setSignalScreen(false);
          toast.success("Agendamento confirmado.");
        } else {
          toast.error(result.error || "Nao foi possivel confirmar.");
        }
        setSignalConfirmLeft(null);
      });
      return;
    }
    const id = window.setInterval(() => setSignalConfirmLeft((v) => (v === null ? null : v <= 1 ? 0 : v - 1)), 1000);
    return () => window.clearInterval(id);
  }, [bookingId, signalConfirmLeft]);

  const selectedServices = useMemo(() => services.filter((s) => serviceIds.includes(s.id)), [services, serviceIds]);
  const selectedEmployee = useMemo(() => employees.find((e) => e.id === employeeId) || null, [employees, employeeId]);
  const filteredEmployees = useMemo(() => {
    if (!isSalon) return [];
    if (!serviceIds.length) return employees;
    return employees.filter((e) => {
      const assigned = employeeServices.filter((x) => x.employee_id === e.id);
      if (!assigned.length) return true;
      const set = new Set(assigned.map((x) => x.service_id));
      return serviceIds.every((id) => set.has(id));
    });
  }, [employeeServices, employees, isSalon, serviceIds]);

  useEffect(() => {
    if (employeeId && !filteredEmployees.some((e) => e.id === employeeId)) {
      setEmployeeId(null);
      setSlot(null);
    }
  }, [employeeId, filteredEmployees]);

  const totalPrice = selectedServices.reduce((sum, s) => sum + Number(s.price), 0);
  const totalDuration = selectedServices.reduce((sum, s) => sum + Number(s.duration_minutes), 0);
  const signalAmount = useMemo(
    () => !paymentConfig?.signal_enabled ? 0 : paymentConfig.signal_type === "percentage" ? Math.round(totalPrice * paymentConfig.signal_value) / 100 : Math.min(paymentConfig.signal_value || 0, totalPrice),
    [paymentConfig, totalPrice],
  );
  const needsSignal = Boolean(paymentConfig?.signal_enabled && paymentConfig.accept_pix && paymentConfig.pix_key && signalAmount > 0);
  const days = useMemo(
    () => Array.from({ length: Math.max(7, Math.min((professional?.booking_advance_weeks || 3) * 7, 21)) }).map((_, i) => addDays(new Date(), i)),
    [professional?.booking_advance_weeks],
  );

  useEffect(() => {
    const loadSlots = async () => {
      if (!professional?.id || !selectedDate || !serviceIds.length || (isSalon && !employeeId)) {
        setSlots([]);
        return;
      }
      setLoadingSlots(true);
      setSlot(null);
      const { data } = await api.rpc("get_available_slots_v2", {
        p_professional_id: professional.id,
        p_service_ids: serviceIds,
        p_date: format(selectedDate, "yyyy-MM-dd"),
        p_employee_id: employeeId,
      } as Record<string, unknown>);
      setSlots((((data || {}) as SlotsRpc).slots || []) as Slot[]);
      setLoadingSlots(false);
    };
    loadSlots();
  }, [employeeId, isSalon, professional?.id, selectedDate, serviceIds]);

  const pixPayload = useMemo(
    () => !needsSignal || !paymentConfig?.pix_key || !professional
      ? ""
      : generatePixPayload({
          pixKey: paymentConfig.pix_key,
          beneficiaryName: paymentConfig.pix_beneficiary_name || professional.name || "Beneficiario",
          amount: signalAmount,
          city: "SAO PAULO",
          txid: (bookingId || "AGENDA").replace(/-/g, "").slice(0, 25),
          description: `Sinal ${professional.business_name || professional.name}`.slice(0, 72),
        }),
    [bookingId, needsSignal, paymentConfig, professional, signalAmount],
  );

  const whatsappLink = useMemo(() => {
    if (!professional?.phone || !slot) return "";
    const msg = [
      "Oi! Acabei de pagar o sinal.",
      "",
      `Cliente: ${clientName}`,
      `WhatsApp: ${maskPhone(clientPhone)}`,
      `Servicos: ${selectedServices.map((s) => s.name).join(", ")}`,
      `Profissional: ${selectedEmployee?.name || professional.name}`,
      `Data: ${format(new Date(slot.start_time), "dd/MM/yyyy")}`,
      `Horario: ${timeSP(slot.start_time)}`,
      `Valor do sinal: ${money(signalAmount)}`,
      "",
      "Estou enviando o comprovante agora.",
    ].join("\n");
    return `https://wa.me/${waPhone(professional.phone)}?text=${encodeURIComponent(msg)}`;
  }, [clientName, clientPhone, professional, selectedEmployee?.name, selectedServices, signalAmount, slot]);

  const toggleFavorite = async (serviceId: string) => {
    if (!professional?.id || !clientName.trim() || cleanPhone(clientPhone).length < 10) {
      toast.error("Preencha nome e WhatsApp antes de favoritar.");
      return;
    }
    const { data } = await api.rpc("toggle_public_service_favorite", {
      p_professional_id: professional.id,
      p_client_name: clientName.trim(),
      p_client_phone: cleanPhone(clientPhone),
      p_service_id: serviceId,
    } as Record<string, unknown>);
    const result = (data || {}) as RpcSuccess & { favorited?: boolean };
    if (result.success) {
      setFavoriteIds((cur) => result.favorited ? [...cur, serviceId] : cur.filter((id) => id !== serviceId));
    }
  };

  const submitBooking = async () => {
    if (!professional?.id || !slot) return;
    setSubmitting(true);
    const { data } = await api.rpc("create_public_booking_v2", {
      p_professional_id: professional.id,
      p_service_ids: serviceIds,
      p_start_time: slot.start_time,
      p_client_name: clientName.trim(),
      p_client_phone: cleanPhone(clientPhone),
      p_employee_id: employeeId,
      p_requires_signal: needsSignal,
      p_signal_amount: signalAmount,
    } as Record<string, unknown>);
    setSubmitting(false);
    const result = (data || {}) as BookingRpc;
    if (!result.success) return void toast.error(result.error || "Erro ao criar agendamento.");
    setBookingId(result.booking_id || null);
    if (needsSignal) {
      setPixTimeLeft(300);
      setSignalScreen(true);
      toast.success("Pague o sinal para reservar a vaga.");
      return;
    }
    setConfirmed(true);
    toast.success("Agendamento confirmado.");
  };

  const onSignalPaid = async () => {
    if (!bookingId) return;
    await api.rpc("mark_public_signal_payment_sent", { p_booking_id: bookingId } as Record<string, unknown>);
    if (whatsappLink) window.open(whatsappLink, "_blank", "noopener,noreferrer");
    setSignalConfirmLeft(40);
    toast.success("Envie o comprovante no WhatsApp. A reserva sera confirmada em instantes.");
  };

  const resetAll = () => {
    setStep(1);
    setClientName("");
    setClientPhone("");
    setFavoriteIds([]);
    setServiceIds([]);
    setEmployeeId(null);
    setSelectedDate(null);
    setSlot(null);
    setSlots([]);
    setBookingId(null);
    setSignalScreen(false);
    setConfirmed(false);
    setPixTimeLeft(300);
    setSignalConfirmLeft(null);
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-100"><Loader2 className="h-10 w-10 animate-spin text-slate-500" /></div>;
  if (notFound || !professional) return <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6"><div className="rounded-[32px] bg-white p-8 text-center shadow-xl"><h1 className="text-2xl font-bold text-slate-900">Pagina nao encontrada</h1><p className="mt-3 text-sm text-slate-500">O link publico nao esta disponivel.</p></div></div>;

  return (
    <div className="min-h-screen px-4 py-6 md:px-6" style={{ background: `radial-gradient(circle at top, ${accent}22 0%, transparent 34%), linear-gradient(180deg, ${bgColor} 0%, #ffffff 100%)` }}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row">
        <aside className="lg:w-[340px]">
          <div className="overflow-hidden rounded-[36px] bg-white shadow-[0_24px_80px_-24px_rgba(15,23,42,0.35)]">
            <div className="relative h-64 bg-cover bg-center" style={{ backgroundImage: professional.cover_url ? `linear-gradient(180deg, rgba(15,23,42,0.2), rgba(15,23,42,0.65)), url(${professional.cover_url})` : `linear-gradient(135deg, ${accent}, #f8a5c2)` }}>
              <div className="absolute inset-0 p-6 text-white">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[22px] bg-white/20 shadow-lg">
                  {professional.logo_url ? <img src={professional.logo_url} alt={professional.name} className="h-full w-full object-cover" /> : professional.avatar_url ? <img src={professional.avatar_url} alt={professional.name} className="h-full w-full object-cover" /> : <span className="text-2xl font-bold">{professional.name.slice(0, 1).toUpperCase()}</span>}
                </div>
                <p className="mt-6 text-xs font-semibold uppercase tracking-[0.32em] text-white/70">Agendamento online</p>
                <h1 className="mt-2 text-3xl font-black leading-tight">{professional.welcome_title || professional.business_name || professional.name}</h1>
                <p className="mt-3 text-sm text-white/80">{professional.welcome_description || professional.bio || "Escolha seus servicos e reserve seu horario em poucos passos."}</p>
              </div>
            </div>
            <div className="space-y-5 p-6">
              <div className="flex gap-2">{[1, 2, 3, 4].map((i) => <div key={i} className={cn("h-2 flex-1 rounded-full", step >= i ? "opacity-100" : "opacity-25")} style={{ backgroundColor: accent }} />)}</div>
              <div className="rounded-[28px] border border-slate-100 bg-slate-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Resumo</p>
                <div className="mt-4 space-y-3">
                  {[
                    ["Cliente", clientName || "-"],
                    ["WhatsApp", maskPhone(clientPhone) || "-"],
                    ["Servicos", selectedServices.map((s) => s.name).join(", ") || "-"],
                    ["Profissional", selectedEmployee?.name || (isSalon ? "-" : professional.name)],
                    ["Horario", slot ? `${format(new Date(slot.start_time), "dd/MM/yyyy")} as ${timeSP(slot.start_time)}` : "-"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-[22px] bg-white p-3 shadow-sm">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</p>
                      <p className="mt-1 text-sm font-bold text-slate-800">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[28px] bg-slate-900 p-5 text-white">
                <p className="text-xs uppercase tracking-[0.24em] text-white/60">Total previsto</p>
                <p className="mt-2 text-3xl font-black">{money(totalPrice)}</p>
                <p className="mt-2 text-sm text-white/70">{totalDuration} min no total</p>
                {needsSignal && <p className="mt-4 rounded-2xl bg-white/10 px-3 py-2 text-sm text-white/80">Sinal: <strong>{money(signalAmount)}</strong></p>}
              </div>
            </div>
          </div>
        </aside>
        <main className="flex-1 lg:max-w-[760px]">
          {!signalScreen && !confirmed && (
            <div className="rounded-[36px] bg-white p-4 shadow-[0_24px_80px_-24px_rgba(15,23,42,0.25)] md:p-8">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Etapa {step} de 4</p>
                  <h2 className="mt-2 text-3xl font-black text-slate-900">{step === 1 ? "Seus dados" : step === 2 ? "Escolha seus servicos" : step === 3 ? "Data, horario e profissional" : "Revise e confirme"}</h2>
                </div>
                {step > 1 && <button type="button" onClick={() => setStep((v) => Math.max(1, v - 1))} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"><ArrowLeft size={16} />Voltar</button>}
              </div>

              {step === 1 && (
                <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-[32px] bg-[linear-gradient(180deg,#fff7fb_0%,#ffffff_100%)] p-6 space-y-4">
                    <SectionHeader eyebrow="Boas-vindas" title="Comece com seu nome e WhatsApp" subtitle="Esses dados ficam associados ao seu histórico para agilizar o próximo agendamento." />
                    <Field label="Seu nome" value={clientName} onChange={setClientName} placeholder="Ex: Maria Oliveira" />
                    <Field label="WhatsApp" value={maskPhone(clientPhone)} onChange={setClientPhone} placeholder="(11) 99999-9999" />
                    <PrimaryButton accent={accent} onClick={() => { if (clientName.trim().length < 2) return toast.error("Informe seu nome."); if (cleanPhone(clientPhone).length < 10) return toast.error("Informe um WhatsApp valido."); setStep(2); }}>Continuar</PrimaryButton>
                  </div>
                  <div className="rounded-[32px] border border-slate-100 bg-slate-50 p-6">
                    <SectionHeader eyebrow="Fluxo" title="Seu atendimento em 4 passos" />
                    <div className="mt-4 space-y-4">
                      {["Informe nome e WhatsApp para agilizar os proximos atendimentos.", "Escolha um ou varios servicos no mesmo agendamento.", "Selecione horario e a profissional desejada.", "Confirme a reserva e pague o sinal, se estiver ativo."].map((t, i) => (
                        <div key={t} className="flex items-start gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: accent }}>{i + 1}</div>
                          <p className="text-sm text-slate-600">{t}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <SectionHeader eyebrow="Serviços" title="Monte seu pedido" subtitle="Você pode combinar vários serviços no mesmo horário e favoritar seus preferidos." />
                  <div className="mb-6 flex flex-wrap gap-2">
                    {favoriteIds.length > 0 && favoriteIds.map((id) => services.find((s) => s.id === id)).filter(Boolean).map((s) => (
                      <button key={s!.id} type="button" onClick={() => setServiceIds((cur) => cur.includes(s!.id) ? cur.filter((id) => id !== s!.id) : [...cur, s!.id])} className={cn("rounded-full border px-4 py-2 text-sm font-semibold", serviceIds.includes(s!.id) ? "border-transparent text-white" : "border-rose-200 bg-white text-rose-500")} style={serviceIds.includes(s!.id) ? { backgroundColor: accent } : undefined}>{s!.name}</button>
                    ))}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {services.map((s) => {
                      const icon = getServiceIconOption(s.icon_key, s.name, s.category);
                      const selected = serviceIds.includes(s.id);
                      const fav = favoriteIds.includes(s.id);
                      return (
                        <article key={s.id} className={cn("relative overflow-hidden rounded-[28px] border p-4 transition-all", selected ? "border-transparent shadow-lg" : "border-slate-200 bg-white hover:border-slate-300")} style={selected ? { background: `linear-gradient(180deg, ${accent}16 0%, #ffffff 100%)` } : undefined}>
                          <button type="button" onClick={() => toggleFavorite(s.id)} className={cn("absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border", fav ? "border-rose-200 bg-rose-50 text-rose-500" : "border-slate-200 bg-white text-slate-400")}><Heart size={16} className={fav ? "fill-current" : ""} /></button>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-slate-50 text-3xl shadow-sm">{icon.emoji}</div>
                            {selected ? <span className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-white" style={{ backgroundColor: accent }}>Selecionado</span> : null}
                          </div>
                          <h3 className="mt-4 text-lg font-bold text-slate-900">{s.name}</h3>
                          <p className="mt-1 min-h-[36px] text-sm text-slate-500">{s.description || s.category || "Servico de beleza personalizado"}</p>
                          <div className="mt-4 flex items-end justify-between gap-3">
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">From</p>
                              <p className="text-xl font-black text-slate-900">{money(Number(s.price))}</p>
                            </div>
                            <div className="rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600">{s.duration_minutes} min</div>
                          </div>
                          <button type="button" onClick={() => setServiceIds((cur) => cur.includes(s.id) ? cur.filter((id) => id !== s.id) : [...cur, s.id])} className={cn("mt-4 h-11 w-full rounded-full text-sm font-bold transition", selected ? "text-white shadow-lg" : "bg-slate-100 text-slate-800 hover:bg-slate-200")} style={selected ? { background: `linear-gradient(90deg, ${accent}, #f7a4c4)` } : undefined}>{selected ? "Remover servico" : "Adicionar servico"}</button>
                        </article>
                      );
                    })}
                  </div>
                  <div className="mt-6 flex justify-end"><PrimaryButton accent={accent} className="w-auto px-8" onClick={() => { if (!serviceIds.length) return toast.error("Selecione ao menos um servico."); setStep(3); }}>Continuar para agenda</PrimaryButton></div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-8">
                  <div className="overflow-hidden rounded-[32px] bg-[linear-gradient(180deg,#cf3faa_0%,#f39cc3_100%)] p-5 text-white">
                    <SectionHeader eyebrow="Agenda" title="Select date & time" subtitle="Escolha a melhor data, horário e profissional para o seu atendimento." light />
                    <div className="mb-5 flex gap-3 overflow-x-auto pb-2">
                      {days.map((d) => {
                        const selected = selectedDate && format(selectedDate, "yyyy-MM-dd") === format(d, "yyyy-MM-dd");
                        return <button key={d.toISOString()} type="button" onClick={() => { setSelectedDate(d); setSlot(null); }} className={cn("min-w-[92px] rounded-[24px] border px-4 py-3 text-left backdrop-blur", selected ? "border-white/20 bg-white text-fuchsia-700 shadow-lg" : "border-white/15 bg-white/10 text-white")}><span className={cn("block text-xs uppercase tracking-[0.22em]", selected ? "text-fuchsia-400" : "text-white/70")}>{format(d, "EEE", { locale: ptBR })}</span><span className="mt-2 block text-2xl font-black">{format(d, "dd")}</span><span className={cn("block text-xs", selected ? "text-fuchsia-500" : "text-white/70")}>{format(d, "MMM", { locale: ptBR })}</span></button>;
                      })}
                    </div>
                  </div>
                  {isSalon && (
                    <div>
                      <SectionHeader eyebrow="Equipe" title="Choose specialist" subtitle="A profissional aparece com foto e especialidade, como no fluxo mobile do app." />
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {filteredEmployees.map((e) => <button key={e.id} type="button" onClick={() => { setEmployeeId(e.id); setSlot(null); }} className={cn("overflow-hidden rounded-[26px] border p-3 text-left", employeeId === e.id ? "border-transparent shadow-lg" : "border-slate-200 bg-white hover:border-slate-300")} style={employeeId === e.id ? { background: `linear-gradient(180deg, ${accent}18 0%, #ffffff 100%)` } : undefined}><div className="flex items-center gap-3">{e.avatar_url ? <img src={e.avatar_url} alt={e.name} className="h-20 w-20 rounded-[20px] object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-[20px] bg-slate-100 text-2xl font-bold text-slate-700">{e.name.slice(0, 1).toUpperCase()}</div>}<div><p className="text-lg font-bold text-slate-900">{e.name}</p><p className="mt-1 text-sm text-slate-500">{e.specialty || "Atendimento personalizado"}</p>{employeeId === e.id ? <span className="mt-3 inline-block rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-white" style={{ backgroundColor: accent }}>Selecionada</span> : null}</div></div></button>)}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="mb-4 flex items-center justify-between"><SectionHeader eyebrow="Horários" title="Available slots" subtitle="Os horários já consideram duração total e conflitos." />{loadingSlots && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}</div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {slots.map((s) => <button key={s.start_time} type="button" onClick={() => setSlot(s)} className={cn("h-14 rounded-full border text-sm font-bold", slot?.start_time === s.start_time ? "border-transparent text-white shadow-lg" : "border-slate-200 bg-white text-slate-700")} style={slot?.start_time === s.start_time ? { background: `linear-gradient(90deg, ${accent}, #f7a4c4)` } : undefined}>{timeSP(s.start_time)}</button>)}
                      {!loadingSlots && !slots.length && <div className="col-span-full rounded-[28px] border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">Escolha servicos, data e {isSalon ? "profissional" : "dia"} para ver os horarios.</div>}
                    </div>
                  </div>
                  <div className="flex justify-end"><PrimaryButton accent={accent} className="w-auto px-8" onClick={() => { if (isSalon && !employeeId) return toast.error("Selecione a profissional."); if (!selectedDate || !slot) return toast.error("Escolha dia e horario."); setStep(4); }}>Revisar agendamento</PrimaryButton></div>
                </div>
              )}

              {step === 4 && slot && (
                <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-[32px] bg-[linear-gradient(180deg,#fff7fb_0%,#ffffff_100%)] p-6 space-y-4">
                    {[
                      ["Cliente", clientName],
                      ["WhatsApp", maskPhone(clientPhone)],
                      ["Servicos", selectedServices.map((s) => s.name).join(", ")],
                      ["Duracao", `${totalDuration} min`],
                      ["Data", format(new Date(slot.start_time), "dd 'de' MMMM", { locale: ptBR })],
                      ["Horario", timeSP(slot.start_time)],
                      ["Profissional", selectedEmployee?.name || professional.name],
                    ].map(([l, v]) => <div key={l} className="flex items-start justify-between gap-4 rounded-[24px] border border-white/70 bg-white/90 px-4 py-4 shadow-sm"><span className="text-sm font-semibold text-slate-500">{l}</span><span className="text-right text-sm font-bold text-slate-900">{v}</span></div>)}
                    {needsSignal && <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Este profissional trabalha com sinal. Voce vai receber um QR Code PIX para reservar a vaga.</div>}
                  </div>
                  <div className="rounded-[32px] bg-slate-900 p-6 text-white">
                    <p className="text-xs uppercase tracking-[0.24em] text-white/55">Fechamento</p>
                    <div className="mt-5 space-y-4">
                      {[["Total dos servicos", money(totalPrice)], ...(needsSignal ? [["Sinal agora", money(signalAmount)], ["Restante no atendimento", money(totalPrice - signalAmount)]] : [])].map(([l, v]) => <div key={l} className="flex items-center justify-between gap-4 rounded-[22px] border border-white/10 bg-white/5 px-4 py-3"><span className="text-sm text-white/70">{l}</span><span className="text-sm font-bold text-white">{v}</span></div>)}
                    </div>
                    <PrimaryButton accent={accent} className="mt-8" disabled={submitting} onClick={submitBooking}>{submitting ? "Salvando..." : needsSignal ? "Reservar vaga" : "Confirmar agendamento"}</PrimaryButton>
                    <button type="button" onClick={() => setStep(3)} className="mt-3 h-12 w-full rounded-full border border-white/20 text-sm font-semibold text-white/80 transition hover:bg-white/10">Ajustar horario</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {signalScreen && (
            <div className="rounded-[36px] bg-white p-5 shadow-[0_24px_80px_-24px_rgba(15,23,42,0.25)] md:p-8">
              <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[32px] bg-[linear-gradient(180deg,#fff7fb_0%,#ffffff_100%)] p-6">
                  <SectionHeader eyebrow="Reserva com sinal" title="Garanta sua vaga agora" subtitle="Escaneie o QR Code ou copie o código PIX. Depois, envie o comprovante no WhatsApp da profissional." />
                  <div className="mt-6 rounded-[30px] bg-white p-5 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.35)]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Pagamento instantâneo</p>
                        <p className="mt-1 text-lg font-black text-slate-900">{money(signalAmount)}</p>
                      </div>
                      <div className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-600">PIX</div>
                    </div>
                    <div className="mt-5 flex justify-center">
                      <div className="rounded-[28px] border border-slate-100 bg-white p-4 shadow-sm">
                        <QRCodeSVG value={pixPayload || paymentConfig?.pix_key || ""} size={220} />
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 rounded-[24px] border border-slate-100 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Código copia e cola</p>
                    <p className="mt-2 break-all text-sm leading-6 text-slate-600">{pixPayload || paymentConfig?.pix_key}</p>
                    <button type="button" onClick={async () => { await navigator.clipboard.writeText(pixPayload || paymentConfig?.pix_key || ""); setPixCopied(true); toast.success("Codigo PIX copiado."); setTimeout(() => setPixCopied(false), 1500); }} className="mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: pixCopied ? "#10b981" : accent }}><Copy size={14} />{pixCopied ? "Copiado" : "Copiar codigo"}</button>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[22px] border border-slate-100 bg-white px-4 py-3 shadow-sm">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Cliente</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">{clientName}</p>
                    </div>
                    <div className="rounded-[22px] border border-slate-100 bg-white px-4 py-3 shadow-sm">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Horário</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">{slot ? timeSP(slot.start_time) : "-"}</p>
                    </div>
                    <div className="rounded-[22px] border border-slate-100 bg-white px-4 py-3 shadow-sm">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Profissional</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">{selectedEmployee?.name || professional.name}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-[32px] bg-slate-900 p-6 text-white">
                  <p className="text-xs uppercase tracking-[0.24em] text-white/55">Reserva protegida</p>
                  <p className="mt-2 text-4xl font-black">{money(signalAmount)}</p>
                  <p className="mt-3 text-sm text-white/70">Assim que o comprovante for enviado no WhatsApp, o sistema confirma automaticamente sua reserva.</p>
                  <div className="mt-6 rounded-[24px] border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white/70">Tempo para pagamento</span>
                      <span className="font-mono text-lg font-bold">{String(Math.floor(pixTimeLeft / 60)).padStart(2, "0")}:{String(pixTimeLeft % 60).padStart(2, "0")}</span>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-white/10">
                      <div className="h-2 rounded-full transition-all duration-1000" style={{ width: `${(pixTimeLeft / 300) * 100}%`, background: pixTimeLeft <= 60 ? "linear-gradient(90deg,#fb7185,#f97316)" : "linear-gradient(90deg,#ffffff,#fbcfe8)" }} />
                    </div>
                    <p className="mt-3 text-xs text-white/60">Se o tempo acabar, basta gerar uma nova reserva.</p>
                  </div>
                  <div className="mt-6 rounded-[24px] bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04))] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/55">Resumo financeiro</p>
                    <div className="mt-4 space-y-3">{[["Reserva total", money(totalPrice)], ["Sinal", money(signalAmount)], ["Restante", money(totalPrice - signalAmount)]].map(([l, v]) => <div key={l} className="flex items-center justify-between gap-4 rounded-[18px] border border-white/10 bg-white/5 px-4 py-3"><span className="text-sm text-white/70">{l}</span><span className="text-sm font-bold text-white">{v}</span></div>)}</div>
                  </div>
                  <button type="button" disabled={pixTimeLeft <= 0} onClick={onSignalPaid} className="mt-8 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-white text-base font-bold text-slate-900 transition hover:bg-white/90 disabled:opacity-60"><MessageCircle size={18} />PAGAMENTO EFETUADO</button>
                  <p className="mt-3 text-center text-xs text-white/60">O botão abre o WhatsApp da profissional com a mensagem pronta para envio do comprovante.</p>
                  {signalConfirmLeft !== null && <div className="mt-4 rounded-[24px] border border-white/10 bg-emerald-500/10 p-4 text-sm text-white/80">Comprovante enviado. Continue nesta tela: a confirmação automática acontece em {signalConfirmLeft}s.</div>}
                </div>
              </div>
            </div>
          )}

          {confirmed && slot && (
            <div className="rounded-[36px] bg-white p-5 shadow-[0_24px_80px_-24px_rgba(15,23,42,0.25)] md:p-8">
              <div className="mx-auto max-w-3xl rounded-[34px] bg-[linear-gradient(180deg,#fff7fb_0%,#ffffff_100%)] p-8 text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 size={40} /></div>
                <p className="mt-6 text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Agendamento confirmado</p>
                <h2 className="mt-2 text-4xl font-black text-slate-900">Tudo certo, {clientName.split(" ")[0] || "cliente"}.</h2>
                <p className="mt-4 text-sm text-slate-500">{professional.confirmation_message || "Seu horario ja esta reservado."}</p>
                <div className="mt-8 grid gap-4 text-left md:grid-cols-2">{[["Servicos", selectedServices.map((s) => s.name).join(", ")], ["Profissional", selectedEmployee?.name || professional.name], ["Data", format(new Date(slot.start_time), "dd/MM/yyyy")], ["Horario", timeSP(slot.start_time)], ["WhatsApp", maskPhone(clientPhone)], ["Valor", money(totalPrice)]].map(([l, v]) => <div key={l} className="rounded-[26px] border border-slate-100 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{l}</p><p className="mt-2 text-base font-bold text-slate-900">{v}</p></div>)}</div>
                <PrimaryButton accent={accent} className="mt-8 w-auto px-8" onClick={resetAll}>Fazer novo agendamento</PrimaryButton>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default PublicBooking;
