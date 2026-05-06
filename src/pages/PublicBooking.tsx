import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, CheckCircle2, Loader2, Sparkles, Star } from "lucide-react";
import { toast } from "sonner";
import { ClientForm } from "@/components/public-booking/ClientForm";
import { DateSelector } from "@/components/public-booking/DateSelector";
import { PaymentPixScreen } from "@/components/public-booking/PaymentPixScreen";
import { PublicPlatformReviewDialog } from "@/components/public-booking/PublicPlatformReviewDialog";
import { ProfessionalCard } from "@/components/public-booking/ProfessionalCard";
import { ServiceCard } from "@/components/public-booking/ServiceCard";
import { StarRatingInput } from "@/components/public-booking/StarRatingInput";
import { TimeSlot } from "@/components/public-booking/TimeSlot";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { generatePixPayload } from "@/lib/pix-utils";
import { buildPublicPageTheme, type PublicPageTheme } from "@/lib/public-page-theme";
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
type ClientLookupRpc = RpcSuccess & { found?: boolean; client_name?: string | null };
type PublicReviewContext = RpcSuccess & {
  booking_id?: string;
  professional_id?: string;
  professional_name?: string;
  client_name?: string | null;
  client_phone?: string | null;
  employee_id?: string | null;
  employee_name?: string | null;
  service_name?: string;
  booking_status?: string;
  professional_review_submitted?: boolean;
  platform_review_submitted?: boolean;
};
type PublicReviewSubmitRpc = RpcSuccess & { review_id?: string; already_submitted?: boolean };

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const cleanPhone = (value: string) => value.replace(/\D/g, "").slice(0, 11);
const maskPhone = (value: string) => { const digits = cleanPhone(value); if (digits.length <= 2) return digits; if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`; return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`; };
const waPhone = (value?: string | null) => { const digits = (value || "").replace(/\D/g, ""); if (!digits) return ""; return digits.startsWith("55") ? digits : `55${digits}`; };
const timeSP = (value: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
const stepTitles = {
  1: "Escolha o dia",
  2: "Escolha o profissional",
  3: "Escolha os serviços",
  4: "Escolha o horário",
  5: "Confirme o agendamento",
} as const;

const PublicBooking = () => {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
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
  const [clientLookupState, setClientLookupState] = useState<"idle" | "checking" | "recognized" | "new">("idle");
  const [recognizedClientName, setRecognizedClientName] = useState<string | null>(null);
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
  const [reviewContext, setReviewContext] = useState<PublicReviewContext | null>(null);
  const [professionalReviewRating, setProfessionalReviewRating] = useState(0);
  const [professionalReviewComment, setProfessionalReviewComment] = useState("");
  const [professionalReviewSubmitting, setProfessionalReviewSubmitting] = useState(false);
  const [professionalReviewSubmitted, setProfessionalReviewSubmitted] = useState(false);
  const [platformReviewOpen, setPlatformReviewOpen] = useState(false);
  const [platformReviewRating, setPlatformReviewRating] = useState(0);
  const [platformReviewComment, setPlatformReviewComment] = useState("");
  const [platformReviewSubmitting, setPlatformReviewSubmitting] = useState(false);
  const [platformReviewSubmitted, setPlatformReviewSubmitted] = useState(false);
  const autofilledClientNameRef = useRef(false);
  const activeClientLookupKeyRef = useRef("");
  const lastClientLookupKeyRef = useRef("");
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const isReviewMode = searchParams.get("review") === "true";
  const reviewBookingId = searchParams.get("booking");
  const preselectedReviewRating = useMemo(() => {
    const rating = Number(searchParams.get("rating") || "0");
    return rating >= 1 && rating <= 5 ? rating : 0;
  }, [searchParams]);
  const previewTheme = useMemo(() => {
    return {
      bgColor: searchParams.get("preview_bg_color"),
      componentColor: searchParams.get("preview_component_color"),
      textColor: searchParams.get("preview_text_color"),
    };
  }, [searchParams]);
  const theme = useMemo(() => buildPublicPageTheme({
    bgColor: previewTheme.bgColor || professional?.bg_color,
    componentColor: previewTheme.componentColor || professional?.component_color || professional?.primary_color,
    textColor: previewTheme.textColor || professional?.text_color,
  }), [previewTheme.bgColor, previewTheme.componentColor, previewTheme.textColor, professional?.bg_color, professional?.component_color, professional?.primary_color, professional?.text_color]);
  const isSalon = professional?.account_type === "salon";

  useEffect(() => {
    const load = async () => {
      if (!slug) return;

      setLoading(true);
      setNotFound(false);

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

      setProfessional(prof as Professional);

      if (isReviewMode) {
        if (!reviewBookingId) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        const { data: reviewData, error: reviewError } = await api.rpc("get_public_review_context", {
          p_slug: slug,
          p_booking_id: reviewBookingId,
        } as Record<string, unknown>);

        const context = (reviewData || null) as PublicReviewContext | null;
        if (reviewError || !context || context.success === false || !context.booking_id) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        setReviewContext(context);
        setProfessionalReviewSubmitted(Boolean(context.professional_review_submitted));
        setPlatformReviewSubmitted(Boolean(context.platform_review_submitted));
        setLoading(false);
        return;
      }

      const [svc, emp, pay] = await Promise.all([
        api.from("services").select("*").eq("professional_id", prof.id).eq("active", true).order("sort_order", { ascending: true }),
        prof.account_type === "salon"
          ? api.from("salon_employees").select("id,name,specialty,avatar_url").eq("salon_id", prof.id).eq("is_active", true).order("name")
          : Promise.resolve({ data: [] }),
        api.rpc("get_public_payment_config", { p_professional_id: prof.id } as Record<string, unknown>),
      ]);

      let empSvc: { data: { employee_id: string; service_id: string }[] } = { data: [] };
      if (prof.account_type === "salon" && emp.data && emp.data.length > 0) {
        const employeeIds = (emp.data as Employee[]).map((employee) => employee.id);
        const employeeServicesResponse = await api
          .from("employee_services")
          .select("employee_id,service_id")
          .in("employee_id", employeeIds);
        empSvc = {
          data: (employeeServicesResponse.data || []) as { employee_id: string; service_id: string }[],
        };
      }

      const payCfg = (pay.data || null) as PaymentConfig | null;
      setServices(((svc.data || []) as Service[]).map((service) => ({ ...service, icon_key: service.icon_key || null })));
      setEmployees((emp.data || []) as Employee[]);
      setEmployeeServices((empSvc.data || []) as { employee_id: string; service_id: string }[]);
      setPaymentConfig(payCfg);
      setLoading(false);
    };

    load();
  }, [isReviewMode, reviewBookingId, slug]);

  useEffect(() => {
    if (!isReviewMode) return;
    setProfessionalReviewRating(preselectedReviewRating);
  }, [isReviewMode, preselectedReviewRating]);

  useEffect(() => {
    const phoneDigits = cleanPhone(clientPhone);

    if (isReviewMode) return;
    if (!professional?.id) return;

    if (phoneDigits.length < 10) {
      setClientLookupState("idle");
      setRecognizedClientName(null);
      lastClientLookupKeyRef.current = "";

      if (autofilledClientNameRef.current) {
        setClientName("");
        autofilledClientNameRef.current = false;
      }

      return;
    }

    const lookupKey = `${professional.id}:${phoneDigits}`;
    if (lookupKey === lastClientLookupKeyRef.current) {
      return;
    }

    activeClientLookupKeyRef.current = lookupKey;
    setClientLookupState("checking");
    setRecognizedClientName(null);

    const timeoutId = window.setTimeout(async () => {
      const { data, error } = await api.rpc("get_public_client_by_phone", {
        p_professional_id: professional.id,
        p_client_phone: phoneDigits,
      } as Record<string, unknown>);

      if (activeClientLookupKeyRef.current !== lookupKey) {
        return;
      }

      lastClientLookupKeyRef.current = lookupKey;

      if (error) {
        setClientLookupState("new");
        if (autofilledClientNameRef.current) {
          setClientName("");
          autofilledClientNameRef.current = false;
        }
        return;
      }

      const result = (data || {}) as ClientLookupRpc;
      if (result.success !== false && result.found && result.client_name?.trim()) {
        const name = result.client_name.trim();
        setRecognizedClientName(name);
        setClientLookupState("recognized");
        setClientName(name);
        autofilledClientNameRef.current = true;
        return;
      }

      setRecognizedClientName(null);
      setClientLookupState("new");

      if (autofilledClientNameRef.current) {
        setClientName("");
        autofilledClientNameRef.current = false;
      }
    }, 350);

    return () => {
      activeClientLookupKeyRef.current = "";
      window.clearTimeout(timeoutId);
    };
  }, [clientPhone, isReviewMode, professional?.id]);

  useEffect(() => { const loadFavorites = async () => { if (isReviewMode || !professional?.id || cleanPhone(clientPhone).length < 10) { setFavoriteIds([]); return; } const { data } = await api.rpc("get_public_client_service_favorites", { p_professional_id: professional.id, p_client_phone: cleanPhone(clientPhone) } as Record<string, unknown>); setFavoriteIds(((data || []) as ServiceFavoriteRow[]).map((item) => item.service_id)); }; loadFavorites(); }, [clientPhone, isReviewMode, professional?.id]);
  useEffect(() => { if (!signalScreen || pixTimeLeft <= 0) return; const id = window.setInterval(() => setPixTimeLeft((value) => (value <= 1 ? 0 : value - 1)), 1000); return () => window.clearInterval(id); }, [signalScreen, pixTimeLeft]);
  useEffect(() => { if (signalConfirmLeft === null) return; if (signalConfirmLeft <= 0 && bookingId) { api.rpc("confirm_public_signal_booking", { p_booking_id: bookingId } as Record<string, unknown>).then(({ data }) => { const result = (data || {}) as RpcSuccess; if (result.success) { setConfirmed(true); setSignalScreen(false); toast.success("Agendamento confirmado."); } else { toast.error(result.error || "Não foi possível confirmar."); } setSignalConfirmLeft(null); }); return; } const id = window.setInterval(() => setSignalConfirmLeft((value) => (value === null ? null : value <= 1 ? 0 : value - 1)), 1000); return () => window.clearInterval(id); }, [bookingId, signalConfirmLeft]);

  useEffect(() => {
    if (isReviewMode || !confirmed || !bookingId || platformReviewSubmitted) return;

    const storageKey = `platform-review:${bookingId}`;
    const persistedState = window.sessionStorage.getItem(storageKey);
    if (persistedState === "dismissed" || persistedState === "submitted") return;

    const timeoutId = window.setTimeout(() => setPlatformReviewOpen(true), 700);
    return () => window.clearTimeout(timeoutId);
  }, [bookingId, confirmed, isReviewMode, platformReviewSubmitted]);

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

  useEffect(() => { const loadSlots = async () => { if (isReviewMode || !professional?.id || !selectedDate || !serviceIds.length || (isSalon && !employeeId)) { setSlots([]); return; } setLoadingSlots(true); setSlot(null); const { data } = await api.rpc("get_available_slots_v2", { p_professional_id: professional.id, p_service_ids: serviceIds, p_date: format(selectedDate, "yyyy-MM-dd"), p_employee_id: employeeId } as Record<string, unknown>); setSlots((((data || {}) as SlotsRpc).slots || []) as Slot[]); setLoadingSlots(false); }; loadSlots(); }, [employeeId, isReviewMode, isSalon, professional?.id, selectedDate, serviceIds]);

  const pixPayload = useMemo(() => !needsSignal || !paymentConfig?.pix_key || !professional ? "" : generatePixPayload({ pixKey: paymentConfig.pix_key, beneficiaryName: paymentConfig.pix_beneficiary_name || professional.name || "Beneficiário", amount: signalAmount, city: "SAO PAULO", txId: (bookingId || "AGENDA").replace(/-/g, "").slice(0, 25), description: `Sinal ${professional.business_name || professional.name}`.slice(0, 72) } as never), [bookingId, needsSignal, paymentConfig, professional, signalAmount]);
  const whatsappLink = useMemo(() => { if (!professional?.phone || !slot) return ""; const msg = ["Oi! Acabei de pagar o sinal.", "", `Cliente: ${clientName}`, `WhatsApp: ${maskPhone(clientPhone)}`, `Serviços: ${selectedServices.map((service) => service.name).join(", ")}`, `Profissional: ${selectedEmployee?.name || professional.name}`, `Data: ${format(new Date(slot.start_time), "dd/MM/yyyy")}`, `Horário: ${timeSP(slot.start_time)}`, `Valor do sinal: ${money(signalAmount)}`, "", "Estou enviando o comprovante agora."].join("\n"); return `https://wa.me/${waPhone(professional.phone)}?text=${encodeURIComponent(msg)}`; }, [clientName, clientPhone, professional, selectedEmployee?.name, selectedServices, signalAmount, slot]);

  const handlePlatformReviewOpenChange = (open: boolean) => {
    setPlatformReviewOpen(open);

    if (!open && bookingId && !platformReviewSubmitted) {
      window.sessionStorage.setItem(`platform-review:${bookingId}`, "dismissed");
    }
  };

  const submitProfessionalReview = async () => {
    if (!slug || !reviewBookingId) return;
    if (professionalReviewRating < 1 || professionalReviewRating > 5) {
      toast.error("Escolha de 1 a 5 estrelas para continuar.");
      return;
    }

    setProfessionalReviewSubmitting(true);
    const { data, error } = await api.rpc("submit_public_professional_review", {
      p_slug: slug,
      p_booking_id: reviewBookingId,
      p_rating: professionalReviewRating,
      p_comment: professionalReviewComment.trim() || null,
    } as Record<string, unknown>);
    setProfessionalReviewSubmitting(false);

    if (error) {
      toast.error("Não foi possível enviar sua avaliação agora.");
      return;
    }

    const result = (data || {}) as PublicReviewSubmitRpc;
    if (!result.success) {
      toast.error(result.error || "Não foi possível registrar sua avaliação.");
      return;
    }

    setProfessionalReviewSubmitted(true);
    toast.success(result.already_submitted ? "Sua avaliação já havia sido registrada." : "Avaliação enviada com sucesso.");
  };

  const submitPlatformReview = async () => {
    if (!slug || !bookingId) return;
    if (platformReviewRating < 1 || platformReviewRating > 5) {
      toast.error("Escolha de 1 a 5 estrelas para continuar.");
      return;
    }

    setPlatformReviewSubmitting(true);
    const { data, error } = await api.rpc("submit_public_platform_review", {
      p_slug: slug,
      p_booking_id: bookingId,
      p_rating: platformReviewRating,
      p_comment: platformReviewComment.trim() || null,
    } as Record<string, unknown>);
    setPlatformReviewSubmitting(false);

    if (error) {
      toast.error("Não foi possível enviar sua avaliação da plataforma.");
      return;
    }

    const result = (data || {}) as PublicReviewSubmitRpc;
    if (!result.success) {
      toast.error(result.error || "Não foi possível registrar sua avaliação.");
      return;
    }

    setPlatformReviewSubmitted(true);
    setPlatformReviewOpen(false);
    window.sessionStorage.setItem(`platform-review:${bookingId}`, "submitted");
    toast.success(result.already_submitted ? "Essa avaliação já havia sido enviada." : "Obrigado por avaliar a plataforma.");
  };

  const toggleFavorite = async (serviceId: string) => { if (!professional?.id || !clientName.trim() || cleanPhone(clientPhone).length < 10) { toast.error("Preencha nome e WhatsApp antes de favoritar."); return; } const { data } = await api.rpc("toggle_public_service_favorite", { p_professional_id: professional.id, p_client_name: clientName.trim(), p_client_phone: cleanPhone(clientPhone), p_service_id: serviceId } as Record<string, unknown>); const result = (data || {}) as RpcSuccess & { favorited?: boolean }; if (result.success) setFavoriteIds((current) => result.favorited ? [...current, serviceId] : current.filter((id) => id !== serviceId)); };
  const submitBooking = async () => { if (!professional?.id || !slot) return; if (!serviceIds.length) return toast.error("Selecione ao menos um serviço."); if (cleanPhone(clientPhone).length < 10) return toast.error("WhatsApp inválido."); setSubmitting(true); const payload = { p_professional_id: professional.id, p_service_ids: serviceIds, p_start_time: slot.start_time, p_client_name: clientName.trim(), p_client_phone: cleanPhone(clientPhone), p_employee_id: employeeId || null, p_requires_signal: needsSignal, p_signal_amount: signalAmount }; console.log("PAYLOAD BOOKING:", payload); const { data, error } = await api.rpc("create_public_booking_v2", payload); setSubmitting(false); if (error) { console.error(error); return toast.error("Erro na requisição."); } const result = data as BookingRpc; if (!result?.success) return toast.error(result?.error || "Erro ao criar agendamento."); setBookingId(result.booking_id || null); if (needsSignal) { setPixTimeLeft(300); setSignalScreen(true); toast.success("Pague o sinal para reservar a vaga."); return; } setConfirmed(true); toast.success("Agendamento confirmado."); };
  const onSignalPaid = async () => { if (!bookingId) return; await api.rpc("mark_public_signal_payment_sent", { p_booking_id: bookingId } as Record<string, unknown>); if (whatsappLink) window.open(whatsappLink, "_blank", "noopener,noreferrer"); setSignalConfirmLeft(40); toast.success("Envie o comprovante no WhatsApp. A reserva será confirmada em instantes."); };
  const resetAll = () => { setStep(1); setClientName(""); setClientPhone(""); setClientLookupState("idle"); setRecognizedClientName(null); setFavoriteIds([]); setServiceIds([]); setEmployeeId(null); setSelectedDate(null); setSlot(null); setSlots([]); setBookingId(null); setSignalScreen(false); setConfirmed(false); setPixTimeLeft(300); setSignalConfirmLeft(null); setPlatformReviewOpen(false); setPlatformReviewRating(0); setPlatformReviewComment(""); setPlatformReviewSubmitted(false); autofilledClientNameRef.current = false; activeClientLookupKeyRef.current = ""; lastClientLookupKeyRef.current = ""; };

  const bookingDateLabel = slot ? format(new Date(slot.start_time), "dd 'de' MMMM", { locale: ptBR }) : "-";
  const bookingDateShortLabel = slot ? format(new Date(slot.start_time), "dd/MM/yyyy") : "-";
  const bookingTimeLabel = slot ? timeSP(slot.start_time) : "-";
  const professionalLabel = selectedEmployee?.name || professional?.name || "-";
  const greetingTitle = professional?.welcome_title || professional?.business_name || professional?.name || "";
  const greetingDescription = professional?.welcome_description || professional?.bio || "Agende seu horário em poucos passos com uma experiência simples e mobile.";
  const isRecognizedClient = clientLookupState === "recognized";
  const showNameField = clientLookupState === "new";
  const canMoveFromStep1 = cleanPhone(clientPhone).length >= 10 && clientLookupState !== "checking" && (isRecognizedClient || clientName.trim().length >= 2);
  const canMoveFromStep2 = !isSalon || Boolean(employeeId);
  const canMoveFromStep3 = serviceIds.length > 0;
  const canMoveFromStep4 = Boolean(selectedDate && slot && (!isSalon || employeeId));
  const slotsEmptyMessage = !selectedDate
    ? "Escolha uma data para ver os horários disponíveis."
    : isSalon && !employeeId
      ? "Escolha um profissional para ver os horários disponíveis."
      : "Nenhum horário disponível para este dia.";
  const reviewBusinessName = professional?.business_name || professional?.name || "Profissional";
  const reviewProfessionalName = reviewContext?.professional_name || reviewBusinessName;
  const reviewCaregiverName = reviewContext?.employee_name || reviewProfessionalName;
  const reviewClientLabel = reviewContext?.client_name?.trim() || "cliente";
  const reviewServiceName = reviewContext?.service_name || "seu atendimento";
  const reviewReady = reviewContext?.booking_status === "completed";
  const reviewAlreadySubmitted = professionalReviewSubmitted || Boolean(reviewContext?.professional_review_submitted);
  const selectedDateLabel = selectedDate ? format(selectedDate, "dd 'de' MMMM", { locale: ptBR }) : "Escolha um dia";
  const selectedEmployeeLabel = selectedEmployee?.name || professional?.name || "Definir profissional";
  const stepMeta = {
    1: "Calendário",
    2: isSalon ? "Equipe" : "Atendimento",
    3: "Serviços",
    4: "Horários",
    5: "Resumo",
  } as const;

  if (loading) return <CenteredState><div className="flex h-16 w-16 items-center justify-center rounded-full shadow-lg" style={{ backgroundColor: theme.surface }}><Loader2 className="h-7 w-7 animate-spin" style={{ color: theme.accent }} /></div></CenteredState>;
  if (notFound || !professional) return <CenteredState><div className="rounded-[30px] px-8 py-10 text-center shadow-[0_26px_70px_-28px_rgba(15,23,42,0.4)]" style={{ backgroundColor: theme.surface }}><p className="text-[11px] font-semibold uppercase tracking-[0.32em]" style={{ color: theme.textMuted }}>Link indisponível</p><h1 className="mt-3 text-2xl font-black" style={{ color: theme.text }}>Página não encontrada</h1><p className="mt-3 text-sm leading-6" style={{ color: theme.textMuted }}>O link público deste profissional não está disponível no momento.</p></div></CenteredState>;
  if (isReviewMode) {
    return (
      <PublicProfessionalReviewScreen
        theme={theme}
        professional={professional}
        clientName={reviewClientLabel}
        serviceName={reviewServiceName}
        professionalName={reviewProfessionalName}
        caregiverName={reviewCaregiverName}
        bookingStatus={reviewContext?.booking_status || ""}
        submitted={reviewAlreadySubmitted}
        rating={professionalReviewRating}
        comment={professionalReviewComment}
        submitting={professionalReviewSubmitting}
        onRatingChange={setProfessionalReviewRating}
        onCommentChange={setProfessionalReviewComment}
        onSubmit={submitProfessionalReview}
        canSubmit={reviewReady}
      />
    );
  }

  return (
    <div
      className="min-h-screen px-3 py-3 sm:px-6 sm:py-6"
      style={{ background: theme.pageBackground }}
    >
      <div className="mx-auto max-w-[430px]">
        <div className="overflow-hidden rounded-[38px] shadow-[0_32px_90px_-30px_rgba(15,23,42,0.38)]" style={{ backgroundColor: theme.shell }}>
          {signalScreen ? null : confirmed ? <GradientHeader theme={theme} title="Reserva confirmada" eyebrow="Tudo pronto" /> : step === 1 ? <HeroHeader theme={theme} coverUrl={professional.cover_url} description={greetingDescription} logoUrl={professional.logo_url || professional.avatar_url} title={greetingTitle} /> : <GradientHeader theme={theme} title={stepTitles[step as 1 | 2 | 3 | 4 | 5]} eyebrow={stepMeta[step as 1 | 2 | 3 | 4 | 5]} onBack={() => setStep((current) => Math.max(1, current - 1))} />}

          {signalScreen ? (
            <PaymentPixScreen
              theme={theme}
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
              <div className="mb-5 flex gap-2">{[1, 2, 3, 4, 5].map((item) => <div key={item} className="h-2 flex-1 rounded-full" style={{ backgroundColor: theme.accent }} />)}</div>
              <div className="rounded-[32px] p-5 shadow-[0_22px_52px_-30px_rgba(190,24,93,0.35)]" style={{ backgroundColor: theme.surfaceMuted, boxShadow: `0 22px 52px -30px ${theme.accentShadow}` }}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: theme.textSoft }}>Agendamento concluído</p>
                    <p className="mt-1 text-[13px] font-medium" style={{ color: theme.textMuted }}>Reserva registrada com sucesso</p>
                  </div>
                  <span className="rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em]" style={{ backgroundColor: theme.surface, color: theme.accentStrong }}>
                    #{bookingId?.slice(0, 6).toUpperCase() || "AGENDA"}
                  </span>
                </div>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: theme.successSoft, color: theme.successText }}><CheckCircle2 size={30} /></div>
                <h2 className="mt-4 text-center text-[26px] font-black leading-tight" style={{ color: theme.text }}>Tudo certo, {clientName.split(" ")[0] || "cliente"}.</h2>
                <p className="mt-2 text-center text-sm leading-6" style={{ color: theme.textMuted }}>{professional.confirmation_message || "Seu horário já está reservado."}</p>
                <div className="mt-6 space-y-3">
                  {selectedServices.map((service) => {
                    const icon = getServiceIconOption(service.icon_key, service.name, service.category);
                    return (
                      <div key={service.id} className="flex items-center gap-4 rounded-[26px] px-4 py-4 shadow-[0_16px_34px_-26px_rgba(15,23,42,0.28)]" style={{ backgroundColor: theme.surface }}>
                        <div className="flex h-14 w-14 items-center justify-center rounded-[18px] text-2xl" style={{ backgroundColor: theme.surfaceAlt }}>{icon.emoji}</div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-bold" style={{ color: theme.text }}>{service.name}</p>
                          <p className="mt-1 text-[12px]" style={{ color: theme.textSoft }}>Reservado para {bookingDateShortLabel} às {bookingTimeLabel}</p>
                        </div>
                        <span className="rounded-full px-3 py-1.5 text-[11px] font-bold" style={{ backgroundColor: theme.successSoft, color: theme.successText }}>Confirmado</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-5 rounded-[26px] p-4 shadow-[0_18px_38px_-26px_rgba(15,23,42,0.34)]" style={{ backgroundColor: theme.surface }}>
                  <SummaryRow theme={theme} label="Profissional" value={professionalLabel} />
                  <SummaryRow theme={theme} label="Data" value={bookingDateShortLabel} />
                  <SummaryRow theme={theme} label="Horário" value={bookingTimeLabel} />
                  <SummaryRow theme={theme} label="WhatsApp" value={maskPhone(clientPhone)} />
                  <SummaryRow theme={theme} label="Valor total" value={money(totalPrice)} last />
                </div>
                <PrimaryAction theme={theme} className="mt-6" onClick={resetAll}>Fazer novo agendamento</PrimaryAction>
              </div>
            </div>
          ) : (
            <div className="px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">
              <StepProgress theme={theme} step={step} total={5} />

              {step === 1 ? (
                <div className="space-y-5 pt-5">
                  <SectionIntro theme={theme} eyebrow="Passo 1" title="Escolha o dia" subtitle="Comece pela data do atendimento. Seus dados entram aqui para liberar favoritos e concluir a reserva sem atrito." />
                  <div className="rounded-[18px] px-4 py-3" style={{ backgroundColor: theme.surfaceMuted }}>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: theme.textSoft }}>Como funciona</p>
                    <p className="mt-1 text-[13px] leading-5" style={{ color: theme.textMuted }}>Primeiro você escolhe o dia. Depois confirmamos seus dados para reconhecer cadastro anterior e manter os serviços favoritos disponíveis.</p>
                  </div>
                  <div className="rounded-[28px] p-4 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.24)]" style={{ backgroundColor: theme.surface }}>
                    <DateSelector theme={theme} days={days} selectedDate={selectedDate} onSelect={(date) => { setSelectedDate(date); setSlot(null); }} />
                  </div>
                  <div className="rounded-[28px] p-4 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.24)]" style={{ backgroundColor: theme.surface }}>
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full shadow-sm" style={{ backgroundColor: theme.surfaceMuted, color: theme.accent }}><Sparkles size={18} /></div>
                      <div>
                        <p className="text-[13px] font-bold" style={{ color: theme.text }}>Seus dados para o agendamento</p>
                        <p className="mt-1 text-[13px] leading-5" style={{ color: theme.textMuted }}>Primeiro verificamos seu WhatsApp. Se você já tiver cadastro, a experiência fica mais rápida e seus serviços preferidos aparecem automaticamente.</p>
                      </div>
                    </div>
                    <div className="mt-4">
                      <ClientForm theme={theme} clientName={clientName} clientPhone={clientPhone} checkingClient={clientLookupState === "checking"} isRecognizedClient={isRecognizedClient} recognizedClientName={recognizedClientName} showNameField={showNameField} onClientNameChange={(value) => setClientName(value)} onClientPhoneChange={(value) => { setClientPhone(maskPhone(value)); activeClientLookupKeyRef.current = ""; lastClientLookupKeyRef.current = ""; }} />
                    </div>
                  </div>
                  <PrimaryAction theme={theme} onClick={() => { if (!canMoveFromStep1) { toast.error(showNameField ? "Preencha seu nome para continuar." : "Informe um WhatsApp válido para continuar."); return; } if (!selectedDate) { toast.error("Escolha um dia para continuar."); return; } setStep(2); }}>Continuar</PrimaryAction>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="space-y-5 pt-5">
                  <SectionIntro theme={theme} eyebrow="Passo 2" title={isSalon ? "Escolha o profissional" : "Seu atendimento"} subtitle={isSalon ? "Selecione quem vai conduzir o atendimento. A disponibilidade continua sendo recalculada conforme os serviços escolhidos." : "Seu agendamento será atendido diretamente por este profissional."} />
                  <SelectionStrip theme={theme} items={[{ label: "Dia", value: selectedDateLabel }, { label: "WhatsApp", value: maskPhone(clientPhone) }]} />
                  {isSalon ? (
                    <div className="grid gap-3">
                      {filteredEmployees.map((employee) => <ProfessionalCard key={employee.id} theme={theme} avatarUrl={employee.avatar_url} name={employee.name} selected={employeeId === employee.id} specialty={employee.specialty} onClick={() => { setEmployeeId(employee.id); setSlot(null); }} />)}
                    </div>
                  ) : (
                    <div className="rounded-[28px] p-4 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.24)]" style={{ backgroundColor: theme.surface }}>
                      <div className="flex items-center gap-4">
                        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[20px]" style={{ backgroundColor: theme.surfaceMuted }}>
                          {professional.avatar_url || professional.logo_url ? <img src={professional.avatar_url || professional.logo_url || ""} alt={professional.name} className="h-full w-full object-cover" /> : <span className="text-2xl font-black" style={{ color: theme.accentStrong }}>{professional.name.slice(0, 1).toUpperCase()}</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-bold" style={{ color: theme.text }}>{professional.name}</p>
                          <p className="mt-1 text-[13px] leading-5" style={{ color: theme.textMuted }}>{professional.business_name || "Atendimento personalizado"}</p>
                          <div className="mt-2 flex items-center gap-1" style={{ color: theme.accent }}><Star size={12} className="fill-current" /><Star size={12} className="fill-current" /><Star size={12} className="fill-current" /><Star size={12} className="fill-current" /><Star size={12} className="fill-current opacity-40" /></div>
                        </div>
                      </div>
                    </div>
                  )}
                  <PrimaryAction theme={theme} onClick={() => { if (!canMoveFromStep2) { toast.error("Selecione a profissional."); return; } setStep(3); }}>Continuar</PrimaryAction>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="space-y-5 pt-5">
                  <SectionIntro theme={theme} eyebrow="Passo 3" title="Escolha os serviços" subtitle="Monte seu atendimento. Você pode selecionar mais de um serviço e favoritar os seus preferidos." />
                  <SelectionStrip theme={theme} items={[{ label: "Dia", value: selectedDateLabel }, { label: "Profissional", value: selectedEmployeeLabel }]} />
                  <div className="rounded-[24px] p-4" style={{ backgroundColor: theme.surfaceMuted }}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: theme.textSoft }}>Seleção atual</p>
                        <p className="mt-1 text-[16px] font-bold" style={{ color: theme.text }}>{selectedServices.length ? `${selectedServices.length} serviço(s)` : "Nenhum serviço ainda"}</p>
                        <p className="mt-1 text-[13px] leading-5" style={{ color: theme.textMuted }}>
                          {selectedServices.length ? `${totalDuration} min no total • ${money(totalPrice)}` : "Selecione pelo menos um serviço para liberar os horários."}
                        </p>
                      </div>
                      {selectedServices.length ? <span className="rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em]" style={{ backgroundColor: theme.surface, color: theme.accentStrong }}>Pronto para avançar</span> : null}
                    </div>
                    {selectedServices.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedServices.map((service) => (
                          <span key={service.id} className="rounded-full px-3 py-1.5 text-[11px] font-semibold" style={{ backgroundColor: theme.surface, color: theme.textMuted }}>
                            {service.name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {favoriteServices.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.28em]" style={{ color: theme.textMuted }}>Favoritos</p>
                      <div className="space-y-3">
                        {favoriteServices.slice(0, 3).map((service) => {
                          const icon = getServiceIconOption(service.icon_key, service.name, service.category);
                          return (
                            <ServiceCard
                              key={service.id}
                              theme={theme}
                              badge="Favorito"
                              description={service.description || service.category}
                              durationLabel={`${service.duration_minutes} min`}
                              favorite
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
                    </div>
                  ) : null}
                  <div className="space-y-3">
                    {services.map((service) => {
                      const icon = getServiceIconOption(service.icon_key, service.name, service.category);
                      return (
                        <ServiceCard
                          key={service.id}
                          theme={theme}
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
                  <PrimaryAction theme={theme} onClick={() => { if (!canMoveFromStep3) { toast.error("Selecione ao menos um serviço."); return; } setStep(4); }}>{selectedServices.length ? `Continuar com ${selectedServices.length} serviço(s)` : "Continuar"}</PrimaryAction>
                </div>
              ) : null}

              {step === 4 ? (
                <div className="space-y-5 pt-5">
                  <SectionIntro theme={theme} eyebrow="Passo 4" title="Escolha o horário" subtitle="Os horários abaixo já consideram a duração total dos serviços selecionados." />
                  <SelectionStrip theme={theme} items={[{ label: "Dia", value: selectedDateLabel }, { label: "Profissional", value: selectedEmployeeLabel }, { label: "Serviços", value: `${selectedServices.length} selecionado(s)` }]} />
                  <div className="rounded-[28px] p-4 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.24)]" style={{ backgroundColor: theme.surface }}>
                    {!loadingSlots && slots.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{slots.map((item) => <TimeSlot key={item.start_time} theme={theme} label={timeSP(item.start_time)} selected={slot?.start_time === item.start_time} onClick={() => setSlot(item)} />)}</div> : null}
                    {loadingSlots ? <div className="flex items-center justify-center rounded-[24px] px-4 py-8" style={{ backgroundColor: theme.surfaceMuted }}><Loader2 className="h-5 w-5 animate-spin" style={{ color: theme.accent }} /></div> : null}
                    {!loadingSlots && !slots.length ? <div className="rounded-[24px] px-4 py-5 text-[13px] leading-6" style={{ backgroundColor: theme.surfaceMuted, color: theme.textMuted }}>{slotsEmptyMessage}</div> : null}
                  </div>
                  <PrimaryAction theme={theme} onClick={() => { if (!canMoveFromStep4) { if (isSalon && !employeeId) return toast.error("Selecione a profissional."); return toast.error("Escolha dia e horário."); } setStep(5); }}>Continuar</PrimaryAction>
                </div>
              ) : null}

              {step === 5 && slot ? (
                <div className="space-y-5 pt-5">
                  <SectionIntro theme={theme} eyebrow="Passo 5" title="Confirme o agendamento" subtitle="Revise os detalhes finais. O fluxo de pagamento e confirmação continua exatamente o mesmo." />
                  <div className="space-y-3">
                    <DetailCard theme={theme} label="Cliente" value={clientName} />
                    <DetailCard theme={theme} label="WhatsApp" value={maskPhone(clientPhone)} />
                    <DetailCard theme={theme} label="Serviços" value={selectedServices.map((service) => service.name).join(", ")} />
                    <DetailCard theme={theme} label="Profissional" value={professionalLabel} />
                    <DetailCard theme={theme} label="Data" value={bookingDateLabel} />
                    <DetailCard theme={theme} label="Horário" value={bookingTimeLabel} />
                  </div>
                  <div className="rounded-[28px] p-5 shadow-[0_28px_54px_-28px_rgba(15,23,42,0.8)]" style={{ backgroundColor: theme.darkPanel, color: theme.darkPanelText }}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em]" style={{ color: theme.darkPanelMuted }}>Total previsto</p>
                    <p className="mt-3 text-[38px] font-black leading-none">{money(totalPrice)}</p>
                    <p className="mt-3 text-[14px]" style={{ color: theme.darkPanelMuted }}>{totalDuration} min no total</p>
                    {needsSignal ? <div className="mt-4 rounded-full px-4 py-3 text-sm font-semibold" style={{ backgroundColor: "rgba(255,255,255,0.1)", color: theme.darkPanelText }}>Sinal: {money(signalAmount)}</div> : null}
                  </div>
                  <PrimaryAction theme={theme} disabled={submitting} onClick={submitBooking}>{submitting ? "Salvando..." : needsSignal ? "Reservar vaga" : "Confirmar agendamento"}</PrimaryAction>
                  <button type="button" onClick={() => setStep(4)} className="h-12 w-full rounded-full border text-[13px] font-bold transition" style={{ borderColor: theme.border, backgroundColor: theme.surface, color: theme.textMuted }}>Ajustar horário</button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
      <PublicPlatformReviewDialog
        open={platformReviewOpen}
        onOpenChange={handlePlatformReviewOpenChange}
        theme={theme}
        businessName={professional.business_name || professional.name}
        rating={platformReviewRating}
        comment={platformReviewComment}
        submitting={platformReviewSubmitting}
        onRatingChange={setPlatformReviewRating}
        onCommentChange={setPlatformReviewComment}
        onSubmit={submitPlatformReview}
      />
    </div>
  );
};

function PublicProfessionalReviewScreen({
  theme,
  professional,
  clientName,
  serviceName,
  professionalName,
  caregiverName,
  bookingStatus,
  submitted,
  rating,
  comment,
  submitting,
  onRatingChange,
  onCommentChange,
  onSubmit,
  canSubmit,
}: {
  theme: PublicPageTheme;
  professional: Professional;
  clientName: string;
  serviceName: string;
  professionalName: string;
  caregiverName: string;
  bookingStatus: string;
  submitted: boolean;
  rating: number;
  comment: string;
  submitting: boolean;
  onRatingChange: (rating: number) => void;
  onCommentChange: (comment: string) => void;
  onSubmit: () => void;
  canSubmit: boolean;
}) {
  const firstName = clientName.split(" ")[0] || "cliente";

  return (
    <div
      className="min-h-screen px-3 py-4 sm:px-6 sm:py-6"
      style={{ background: theme.pageBackground }}
    >
      <div className="mx-auto max-w-[430px]">
        <div className="overflow-hidden rounded-[38px] shadow-[0_32px_90px_-30px_rgba(15,23,42,0.38)]" style={{ backgroundColor: theme.shell }}>
          <HeroHeader
            theme={theme}
            coverUrl={professional.cover_url}
            description="Sua opiniao ajuda a manter a experiencia de atendimento cada vez melhor."
            logoUrl={professional.logo_url || professional.avatar_url}
            title={professional.business_name || professional.name}
          />

          <div className="px-5 pb-6 pt-5">
            <div
              className="rounded-[30px] p-5 shadow-[0_20px_48px_-28px_rgba(190,24,93,0.35)]"
              style={{ backgroundColor: theme.surfaceMuted, boxShadow: `0 20px 48px -28px ${theme.accentShadow}` }}
            >
              {submitted ? (
                <>
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: theme.successSoft, color: theme.successText }}>
                    <CheckCircle2 size={30} />
                  </div>
                  <h2 className="mt-4 text-center text-[26px] font-black leading-tight" style={{ color: theme.text }}>
                    Obrigado, {firstName}.
                  </h2>
                  <p className="mt-2 text-center text-sm leading-6" style={{ color: theme.textMuted }}>
                    Sua avaliacao sobre {caregiverName} foi registrada com sucesso.
                  </p>
                </>
              ) : !canSubmit ? (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.32em]" style={{ color: theme.textMuted }}>
                    Avaliacao indisponivel por enquanto
                  </p>
                  <h2 className="mt-3 text-[28px] font-black leading-[1.04]" style={{ color: theme.text }}>
                    Vamos liberar a avaliacao assim que o atendimento for concluido.
                  </h2>
                  <p className="mt-3 text-sm leading-6" style={{ color: theme.textMuted }}>
                    O status atual deste agendamento e <strong>{bookingStatus || "em andamento"}</strong>. Assim que ele for concluido, o link de avaliacao funcionara normalmente.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.32em]" style={{ color: theme.textMuted }}>
                    Avaliacao do atendimento
                  </p>
                  <h2 className="mt-3 text-[28px] font-black leading-[1.04]" style={{ color: theme.text }}>
                    {firstName}, como foi seu atendimento com {caregiverName}?
                  </h2>
                  <p className="mt-3 text-sm leading-6" style={{ color: theme.textMuted }}>
                    Escolha de 1 a 5 estrelas para {serviceName}. Se quiser, deixe um comentario rapido sobre a sua experiencia.
                  </p>

                  <div className="mt-5 rounded-[24px] p-4 shadow-[0_16px_34px_-26px_rgba(15,23,42,0.32)]" style={{ backgroundColor: theme.surface }}>
                    <p className="text-[13px] font-semibold uppercase tracking-[0.18em]" style={{ color: theme.textMuted }}>
                      Sua nota
                    </p>
                    <StarRatingInput
                      value={rating}
                      onChange={onRatingChange}
                      className="mt-4"
                      activeColor={theme.accent}
                      inactiveColor={theme.textSoft}
                      size={30}
                    />
                  </div>

                  <div className="mt-4 rounded-[24px] p-4 shadow-[0_16px_34px_-26px_rgba(15,23,42,0.32)]" style={{ backgroundColor: theme.surface }}>
                    <SummaryRow theme={theme} label="Profissional" value={caregiverName} />
                    <SummaryRow theme={theme} label="Servico" value={serviceName} last />
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.28em]" style={{ color: theme.textMuted }}>
                      Comentario opcional
                    </label>
                    <Textarea
                      value={comment}
                      onChange={(event) => onCommentChange(event.target.value)}
                      placeholder="Conte em poucas palavras como foi seu atendimento."
                      className="min-h-[120px] rounded-[24px] border-0 px-4 py-3 text-sm leading-6 shadow-[0_16px_34px_-26px_rgba(15,23,42,0.32)] focus-visible:ring-0 focus-visible:ring-offset-0"
                      style={{ backgroundColor: theme.surface, color: theme.text }}
                    />
                  </div>

                  <PrimaryAction theme={theme} className="mt-6" disabled={submitting} onClick={onSubmit}>
                    {submitting ? "Enviando..." : "Enviar avaliacao"}
                  </PrimaryAction>
                </>
              )}

              <div className="mt-5 rounded-[24px] p-4 shadow-[0_16px_34px_-26px_rgba(15,23,42,0.32)]" style={{ backgroundColor: theme.surface }}>
                <SummaryRow theme={theme} label="Negocio" value={professionalName} />
                <SummaryRow theme={theme} label="Atendimento" value={serviceName} last />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CenteredState({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#fef5fb_0%,#ffffff_100%)] px-6">{children}</div>;
}

function HeroHeader({ theme, coverUrl, description, logoUrl, title }: { theme: ReturnType<typeof buildPublicPageTheme>; coverUrl: string | null; description: string; logoUrl: string | null; title: string }) {
  return (
    <section className="relative overflow-hidden px-5 pb-6 pt-5" style={{ background: theme.accentGradientVertical }}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.24),transparent_30%)]" />
      {coverUrl ? <div className="absolute inset-x-5 top-5 h-[126px] rounded-[28px] bg-cover bg-center opacity-20" style={{ backgroundImage: `url(${coverUrl})` }} /> : null}
      <div className="relative">
        <div className="flex items-center justify-center">
          <span className="rounded-full px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ backgroundColor: "rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.82)" }}>Agendamento online</span>
        </div>
        <div className="mt-6 rounded-[32px] px-5 py-5 shadow-[0_22px_46px_-28px_rgba(15,23,42,0.4)] backdrop-blur-sm" style={{ backgroundColor: "rgba(255,255,255,0.16)", color: theme.inverseText }}>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[22px] shadow-[0_18px_40px_-26px_rgba(15,23,42,0.8)]" style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>{logoUrl ? <img src={logoUrl} alt={title} className="h-full w-full object-cover" /> : <span className="text-2xl font-black">{title.slice(0, 1).toUpperCase()}</span>}</div>
            <div className="min-w-0">
              <h1 className="text-[30px] font-black leading-[1.02]">{title}</h1>
              <p className="mt-2 text-[13px] leading-5 text-white/82">{description}</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-[18px] px-4 py-3" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/65">Fluxo</p>
              <p className="mt-1 text-[13px] font-bold">Escolha dia, profissional, serviço e horário</p>
            </div>
            <div className="rounded-[18px] px-4 py-3" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/65">Reserva</p>
              <p className="mt-1 text-[13px] font-bold">Confirmação em poucos passos</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function GradientHeader({ theme, title, eyebrow, onBack }: { theme: ReturnType<typeof buildPublicPageTheme>; title: string; eyebrow?: string; onBack?: () => void }) {
  return (
    <section className="px-5 pb-6 pt-5" style={{ background: theme.accentGradientVertical, color: theme.inverseText }}>
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className={cn("flex h-10 w-10 items-center justify-center rounded-full transition", onBack ? "opacity-100" : "pointer-events-none opacity-0")} style={{ backgroundColor: "rgba(255,255,255,0.12)" }}><ArrowLeft size={18} /></button>
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.34em]" style={{ color: "rgba(255,255,255,0.72)" }}>{eyebrow || "App Gende"}</p>
          <h1 className="mt-2 text-[18px] font-black uppercase tracking-[0.08em]">{title}</h1>
          <div className="mx-auto mt-3 h-1 w-16 rounded-full bg-white/25" />
        </div>
        <div className="h-10 w-10" />
      </div>
    </section>
  );
}

function StepProgress({ theme, step, total = 4 }: { theme: ReturnType<typeof buildPublicPageTheme>; step: number; total?: number }) {
  return <div className="flex gap-2.5 rounded-full p-1.5" style={{ backgroundColor: theme.surfaceMuted }}>{Array.from({ length: total }, (_, index) => index + 1).map((item) => <div key={item} className="h-2 flex-1 rounded-full transition-opacity" style={{ backgroundColor: step >= item ? theme.accent : theme.accentFaint, opacity: step >= item ? 1 : 0.45 }} />)}</div>;
}

function SectionIntro({ theme, eyebrow, title, subtitle }: { theme: ReturnType<typeof buildPublicPageTheme>; eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.34em]" style={{ color: theme.textSoft }}>{eyebrow}</p>
      <h2 className="mt-2 text-[28px] font-black leading-[1.02] sm:text-[30px]" style={{ color: theme.text }}>{title}</h2>
      <p className="mt-2 max-w-[340px] text-[14px] leading-6" style={{ color: theme.textMuted }}>{subtitle}</p>
    </div>
  );
}

function PrimaryAction({ theme, children, className, disabled, onClick }: { theme: ReturnType<typeof buildPublicPageTheme>; children: ReactNode; className?: string; disabled?: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={cn("h-14 w-full rounded-full text-[15px] font-bold transition active:scale-[0.99] hover:opacity-95 disabled:opacity-60", className)} style={{ background: theme.accentGradient, color: theme.inverseText, boxShadow: `0 24px 40px -24px ${theme.accentShadow}` }}>{children}</button>;
}

function DetailCard({ theme, label, value }: { theme: ReturnType<typeof buildPublicPageTheme>; label: string; value: string }) {
  return <div className="rounded-[26px] px-4 py-4 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.24)]" style={{ backgroundColor: theme.surface }}><p className="text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: theme.textSoft }}>{label}</p><p className="mt-2 text-[15px] font-bold leading-6 sm:text-[16px]" style={{ color: theme.text }}>{value || "-"}</p></div>;
}

function SelectionStrip({ theme, items }: { theme: ReturnType<typeof buildPublicPageTheme>; items: Array<{ label: string; value: string }> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <div key={`${item.label}:${item.value}`} className="rounded-[22px] border px-4 py-3" style={{ borderColor: theme.border, backgroundColor: theme.surfaceMuted }}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ color: theme.textSoft }}>{item.label}</p>
          <p className="mt-1 truncate text-[12px] font-bold sm:text-[13px]" style={{ color: theme.text }}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function SummaryRow({ theme, label, value, last = false }: { theme: ReturnType<typeof buildPublicPageTheme>; label: string; value: string; last?: boolean }) {
  return <div className={cn("flex items-center justify-between gap-4 py-3", last ? "" : "border-b")} style={{ borderColor: last ? "transparent" : theme.border }}><span className="text-[12px] font-semibold uppercase tracking-[0.24em]" style={{ color: theme.textSoft }}>{label}</span><span className="text-right text-[14px] font-bold" style={{ color: theme.text }}>{value}</span></div>;
}

export default PublicBooking;
