import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api-client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { generatePixPayload } from "@/lib/pix-utils";
import { QRCodeSVG } from "qrcode.react";
import UpsellSuggestions from "@/components/upsell/UpsellSuggestions";

/* ── Types ─────────────────────────────────────── */
type Professional = {
  id: string;
  name: string;
  business_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  logo_url: string | null;
  cover_url: string | null;
  primary_color: string | null;
  bg_color: string | null;
  text_color: string | null;
  component_color: string | null;
  slug: string | null;
  account_type: "autonomous" | "salon";
  welcome_title: string | null;
  welcome_description: string | null;
  welcome_message: string | null;
  confirmation_message: string | null;
  booking_advance_weeks?: number;
};

type Employee = {
  id: string;
  name: string;
  specialty: string | null;
  avatar_url: string | null;
};

type EmployeeStats = {
  completedBookings: number;
  avgRating: number | null;
  reviewCount: number;
};

type Service = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number;
  category: string | null;
};

type Slot = { start_time: string; end_time: string };

type PaymentConfig = {
  pix_key: string | null;
  pix_key_type: string | null;
  pix_beneficiary_name: string | null;
  signal_enabled: boolean;
  signal_type: string;
  signal_value: number;
  accept_pix: boolean;
};

/* ── Helpers ───────────────────────────────────── */
const DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DAYS_FULL = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const MONTHS_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Format a UTC ISO string as São Paulo time using Intl (handles DST correctly) */
const spFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const spDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "short",
  day: "numeric",
  month: "numeric",
  year: "numeric",
});

function formatTimeSP(utcStr: string): string {
  return spFormatter.format(new Date(utcStr));
}

function formatDateSP(utcStr: string) {
  const d = new Date(utcStr);
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "numeric",
    month: "numeric",
  }).formatToParts(d);
  const dayNum = Number(parts.find(p => p.type === "day")?.value || 0);
  const monthNum = Number(parts.find(p => p.type === "month")?.value || 1) - 1;
  // Map weekday abbreviation to DOW index
  const wdMap: Record<string, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, "sáb": 6, sab: 6 };
  const wd = (parts.find(p => p.type === "weekday")?.value || "").toLowerCase().replace(".", "");
  return { day: wdMap[wd] ?? 0, date: dayNum, month: monthNum };
}

/* ── Main Component ────────────────────────────── */
const PublicBooking = () => {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();

  // Data
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const [employeeServiceMap, setEmployeeServiceMap] = useState<{ employee_id: string; service_id: string }[]>([]);
  const [reviewStats, setReviewStats] = useState<{ avg: number; count: number } | null>(null);
  const [employeeStatsMap, setEmployeeStatsMap] = useState<Record<string, EmployeeStats>>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [waitlistEnabled, setWaitlistEnabled] = useState(false);

  // Wizard
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [animating, setAnimating] = useState(false);

  // Selections
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pixTimeLeft, setPixTimeLeft] = useState(300); // 5 minutes

  // Review
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);

  // PIX timer countdown
  useEffect(() => {
    if (!showPaymentModal || pixTimeLeft <= 0) return;
    const interval = setInterval(() => {
      setPixTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [showPaymentModal, pixTimeLeft]);

  const isSalon = professional?.account_type === "salon";
  const totalSteps = isSalon ? 5 : 4;
  const accent = professional?.component_color || professional?.primary_color || "#7C3AED";
  const accentLight = accent + "1a";
  const accentBorder = accent + "33";
  const textPrimary = professional?.text_color || "#1A1A2E";
  // Only append hex opacity suffix for valid 6-digit hex colors
  const isHex6 = /^#[0-9A-Fa-f]{6}$/.test(textPrimary);
  const textSecondary = isHex6 ? textPrimary + "b3" : textPrimary; // 70% opacity
  const textMuted = isHex6 ? textPrimary + "80" : textPrimary; // 50% opacity
  // Card text colors — always dark for readability on white backgrounds
  const cardTextPrimary = "#1A1A2E";
  const cardTextSecondary = "#1A1A2Eb3";
  const cardTextMuted = "#1A1A2E80";
  const colors = { textPrimary, textSecondary, textMuted, cardTextPrimary, cardTextSecondary, cardTextMuted };
  const cardBg = "rgba(255,255,255,0.95)";
  const cardBorder = `${accent}15`;
  const cardShadow = `0 4px 24px -4px ${accent}12, 0 1px 3px rgba(0,0,0,0.06)`;

  /* Steps mapping:
     Salon:      1=client, 2=employee, 3=service, 4=date, 5=confirm
     Autonomous: 1=client, 2=service, 3=date, 4=confirm */
  const serviceStep = isSalon ? 3 : 2;
  const dateStep = isSalon ? 4 : 3;
  const confirmStep = isSalon ? 5 : 4;

  const goNext = () => {
    if (animating) return;
    setDirection("forward");
    setAnimating(true);
    setTimeout(() => { setStep(s => Math.min(s + 1, confirmStep + 1)); setAnimating(false); }, 50);
  };
  const goBack = () => {
    if (animating || step === 1) return;
    setDirection("backward");
    setAnimating(true);
    setTimeout(() => { setStep(s => Math.max(s - 1, 1)); setAnimating(false); }, 50);
  };

  const animClass = direction === "forward" ? "animate-slide-in-right" : "animate-slide-in-left";

  /* ── Data Fetching ── */
  useEffect(() => {
    const fetchData = async () => {
      if (!slug) return;
      const { data: prof, error } = await api
        .from("professionals")
        .select("id, name, business_name, bio, avatar_url, logo_url, cover_url, primary_color, bg_color, text_color, component_color, slug, account_type, welcome_title, welcome_description, welcome_message, confirmation_message, booking_advance_weeks")
        .eq("slug", slug)
        .single();

      if (error || !prof) { setNotFound(true); setLoading(false); return; }
      setProfessional(prof);

      const [svcRes, empRes, payRes, empSvcRes, reviewRes, subRes] = await Promise.all([
        api.from("services").select("*").eq("professional_id", prof.id).eq("active", true).order("sort_order", { ascending: true }),
        prof.account_type === "salon"
          ? api.from("salon_employees").select("id, name, specialty, avatar_url").eq("salon_id", prof.id).eq("is_active", true).order("name")
          : Promise.resolve({ data: [] }),
        api.from("payment_config").select("pix_key, pix_key_type, pix_beneficiary_name, signal_enabled, signal_type, signal_value, accept_pix").eq("professional_id", prof.id).maybeSingle(),
        prof.account_type === "salon"
          ? api.from("employee_services").select("employee_id, service_id")
          : Promise.resolve({ data: [] }),
        api.from("reviews").select("rating").eq("professional_id", prof.id).eq("is_public", true),
        api.from("subscriptions").select("plan_id").eq("professional_id", prof.id).eq("status", "active").maybeSingle(),
      ]);
      setServices(svcRes.data || []);
      setEmployees(empRes.data || []);
      // Signal payment is Enterprise-only: disable for other plans
      const isEnterprise = subRes.data?.plan_id === "enterprise" || subRes.data?.plan_id === "pro";
      const payConfig = payRes.data || null;
      if (payConfig && !isEnterprise) {
        payConfig.signal_enabled = false;
      }
      setPaymentConfig(payConfig);
      setEmployeeServiceMap(empSvcRes.data || []);
      if (reviewRes.data && reviewRes.data.length > 0) {
        const avg = reviewRes.data.reduce((sum, r) => sum + r.rating, 0) / reviewRes.data.length;
        setReviewStats({ avg: Math.round(avg * 10) / 10, count: reviewRes.data.length });
      }
      // Fetch employee stats (completed bookings + individual reviews)
      if (prof.account_type === "salon" && empRes.data && empRes.data.length > 0) {
        const empIds = empRes.data.map((e: any) => e.id);
        const [bookingsRes, empReviewsRes] = await Promise.all([
          api.from("bookings").select("employee_id").eq("professional_id", prof.id).eq("status", "completed").in("employee_id", empIds),
          api.from("reviews").select("employee_id, rating").eq("professional_id", prof.id).eq("is_public", true).in("employee_id", empIds),
        ]);
        const statsMap: Record<string, EmployeeStats> = {};
        empIds.forEach((id: string) => {
          const bookings = (bookingsRes.data || []).filter((b: any) => b.employee_id === id);
          const reviews = (empReviewsRes.data || []).filter((r: any) => r.employee_id === id);
          const avg = reviews.length > 0 ? reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length : null;
          statsMap[id] = { completedBookings: bookings.length, avgRating: avg ? Math.round(avg * 10) / 10 : null, reviewCount: reviews.length };
        });
        setEmployeeStatsMap(statsMap);
      }
      // Check waitlist feature flag
      const { data: waitlistFlag } = await api
        .from("feature_flags" as any)
        .select("enabled")
        .eq("key", "waitlist")
        .maybeSingle();
      setWaitlistEnabled((waitlistFlag as any)?.enabled === true);
      setLoading(false);
    };
    fetchData();
  }, [slug]);

  // Review link handler
  useEffect(() => {
    if (!professional) return;
    const isReview = searchParams.get("review") === "true";
    const reviewBookingId = searchParams.get("booking");
    if (isReview && reviewBookingId) {
      setBookingId(reviewBookingId);
      setConfirmed(true);
      setStep(confirmStep);
      (async () => {
        const { data: booking } = await api.from("bookings").select("client_name, client_phone, employee_id").eq("id", reviewBookingId).single();
        if (booking) {
          setClientName(booking.client_name || "Cliente");
          setClientPhone(booking.client_phone || "");
          if (booking.employee_id && employees.length > 0) {
            const emp = employees.find(e => e.id === booking.employee_id);
            if (emp) setSelectedEmployee(emp);
          }
        }
      })();
    }
  }, [professional, employees, searchParams]);

  /* ── Fetch Slots ── */
  useEffect(() => {
    if (!selectedDate || !selectedService || !professional) return;
    const fetchSlots = async () => {
      setLoadingSlots(true);
      setSelectedSlot(null);
      setSelectedTime("");
      const { data } = await api.rpc("get_available_slots", {
        p_professional_id: professional.id,
        p_service_id: selectedService.id,
        p_date: format(selectedDate, "yyyy-MM-dd"),
      });
      if (data && typeof data === "object" && "success" in (data as any)) {
        const result = data as any;
        setSlots(result.success ? result.slots || [] : []);
      } else {
        setSlots([]);
      }
      setLoadingSlots(false);
    };
    fetchSlots();
  }, [selectedDate, selectedService, professional]);

  /* ── Booking Submission ── */
  const handleBook = async () => {
    if (!professional || !selectedService || !selectedSlot) return;
    if (clientName.trim().length < 2) { toast.error("Informe seu nome completo"); return; }
    const phoneClean = clientPhone.replace(/\D/g, "");
    if (phoneClean.length < 10) { toast.error("Informe um telefone válido com DDD"); return; }

    setSubmitting(true);
    const { data, error } = await api.rpc("create_public_booking", {
      p_professional_id: professional.id,
      p_service_id: selectedService.id,
      p_start_time: selectedSlot.start_time,
      p_client_name: clientName.trim(),
      p_client_phone: phoneClean,
    });
    if (error) { toast.error("Erro ao agendar. Tente novamente."); setSubmitting(false); return; }
    const result = data as { success: boolean; booking_id?: string; error?: string; price?: number; duration_minutes?: number; end_time?: string };
    if (result?.success && result.booking_id) {
      // Atomically set employee_id before exposing booking_id to client state
      if (isSalon && selectedEmployee) {
        const { error: empError } = await api.from("bookings").update({ employee_id: selectedEmployee.id }).eq("id", result.booking_id);
        if (empError) {
          console.error("Failed to assign employee:", empError);
        }
      }
      setBookingId(result.booking_id);
      // If signal payment, show modal; otherwise confirm directly
      if (paymentConfig?.signal_enabled && paymentConfig?.accept_pix && paymentConfig?.pix_key && getSignalAmount()) {
        setPixTimeLeft(300);
        setShowPaymentModal(true);
      } else {
        setConfirmed(true);
      }
    } else {
      toast.error(result?.error || "Erro ao agendar");
    }
    setSubmitting(false);
  };

  const getSignalAmount = () => {
    if (!paymentConfig?.signal_enabled || !selectedService) return null;
    if (paymentConfig.signal_type === "percentage") return (Number(selectedService.price) * paymentConfig.signal_value) / 100;
    return paymentConfig.signal_value;
  };

  const copyPixKey = () => {
    if (!paymentConfig?.pix_key) return;
    const amount = getSignalAmount();
    const payload = generatePixPayload({
      pixKey: paymentConfig.pix_key,
      beneficiaryName: paymentConfig.pix_beneficiary_name || professional?.name || "Beneficiario",
      amount: amount || undefined,
      txId: bookingId?.slice(0, 25) || "***",
    });
    navigator.clipboard.writeText(payload);
    setPixCopied(true);
    toast.success("Código PIX copiado!");
    setTimeout(() => setPixCopied(false), 3000);
  };

  const getPixPayload = () => {
    if (!paymentConfig?.pix_key) return null;
    const amount = getSignalAmount();
    return generatePixPayload({
      pixKey: paymentConfig.pix_key,
      beneficiaryName: paymentConfig.pix_beneficiary_name || professional?.name || "Beneficiario",
      amount: amount || undefined,
      txId: bookingId?.slice(0, 25) || "***",
    });
  };

  const handleSubmitReview = async () => {
    if (!professional || reviewSubmitted) return;
    setSubmittingReview(true);
    const { error } = await api.from("platform_reviews").insert({
      professional_id: professional.id,
      booking_id: bookingId,
      client_name: clientName.trim(),
      client_phone: clientPhone.replace(/\D/g, ""),
      rating: reviewRating,
      comment: reviewComment.trim() || null,
    });
    if (!error) { setReviewSubmitted(true); toast.success("Avaliação enviada! Obrigado."); }
    else toast.error("Erro ao enviar avaliação");
    setSubmittingReview(false);
  };

  const handleReset = () => {
    setStep(1);
    setSelectedEmployee(null);
    setSelectedService(null);
    setSelectedDate(null);
    setSelectedTime("");
    setSelectedSlot(null);
    setClientName("");
    setClientPhone("");
    setConfirmed(false);
    setBookingId(null);
    setShowPaymentModal(false);
    setReviewRating(5);
    setReviewComment("");
    setReviewSubmitted(false);
  };

  // Generate days for date picker based on booking_advance_weeks
  const advanceWeeks = professional?.booking_advance_weeks ?? 2;
  const totalDays = advanceWeeks * 7;
  const todayRef = useRef(new Date());
  // Update reference if day changed (user left page open past midnight)
  const now = new Date();
  if (now.toDateString() !== todayRef.current.toDateString()) {
    todayRef.current = now;
  }
  const today = todayRef.current;
  const days14 = useMemo(() => Array.from({ length: totalDays }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() + i); return d; }), [today, totalDays]);

  // Filter services by selected employee's assigned services (if salon & employee selected & has assignments)
  const filteredServices = useMemo(() => {
    if (!isSalon || !selectedEmployee) return services;
    const employeeAssignments = employeeServiceMap.filter(es => es.employee_id === selectedEmployee.id);
    // If employee has no assignments, show all services (backwards compatible)
    if (employeeAssignments.length === 0) return services;
    const assignedServiceIds = new Set(employeeAssignments.map(es => es.service_id));
    return services.filter(s => assignedServiceIds.has(s.id));
  }, [services, selectedEmployee, employeeServiceMap, isSalon]);

  const groupedServices = filteredServices.reduce<Record<string, Service[]>>((acc, s) => {
    const cat = s.category || "Geral";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  /* ── Loading / Not Found ── */
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#F8F5FF" }}>
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#7C3AED" }} />
    </div>
  );
  if (notFound || !professional) return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#F8F5FF" }}>
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2" style={{ color: "#1F1535" }}>Página não encontrada</h1>
        <p style={{ color: "#6B7280" }}>Verifique o link e tente novamente.</p>
      </div>
    </div>
  );

  const signalAmount = getSignalAmount();
  const totalPrice = selectedService ? Number(selectedService.price) : 0;
  const remainingValue = signalAmount ? totalPrice - signalAmount : totalPrice;

  /* ═══════════════════════════════════════════════ */
  /* ══ RENDER ═════════════════════════════════════ */
  /* ═══════════════════════════════════════════════ */
  return (
    <div className="phone-frame" style={{ background: `linear-gradient(160deg, ${accent}08 0%, #f8fafc 40%, ${accent}06 100%)`, fontFamily: "'Inter', 'Poppins', sans-serif" }}>
      {/* Desktop decorations */}
      <div className="hidden md:block fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-15" style={{ background: `radial-gradient(circle, ${accent} 0%, transparent 60%)` }} />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full opacity-15" style={{ background: `radial-gradient(circle, ${accent}80 0%, transparent 60%)` }} />
        {/* Desktop branding */}
        <div className="absolute top-8 left-8">
          <div className="flex items-center gap-3">
            {professional.logo_url ? (
              <img src={professional.logo_url} alt="" className="w-11 h-11 rounded-2xl object-cover shadow-md" />
            ) : (
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white text-lg font-bold shadow-md" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}bb)` }}>
                {(professional.business_name || professional.name)?.[0]?.toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-bold text-sm" style={{ color: textPrimary }}>{professional.business_name || professional.name}</p>
              {professional.bio && <p className="text-xs" style={{ color: accent }}>{professional.bio.slice(0, 40)}</p>}
              {reviewStats && (
                <div className="flex items-center gap-1 mt-0.5">
                  <Star size={11} className="fill-amber-400 text-amber-400" />
                  <span className="text-[11px] font-semibold" style={{ color: textPrimary }}>{reviewStats.avg}</span>
                  <span className="text-[10px]" style={{ color: textMuted }}>({reviewStats.count} avaliações)</span>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Steps indicator desktop */}
        <div className="absolute bottom-8 left-8 space-y-2.5">
          {(isSalon
            ? [{ n: 1, label: "Seus dados" }, { n: 2, label: "Profissional" }, { n: 3, label: "Serviço" }, { n: 4, label: "Data & Hora" }, { n: 5, label: "Confirmação" }]
            : [{ n: 1, label: "Seus dados" }, { n: 2, label: "Serviço" }, { n: 3, label: "Data & Hora" }, { n: 4, label: "Confirmação" }]
          ).map(s => (
            <div key={s.n} className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all" style={{ background: s.n <= step ? accent : `${accent}12`, color: s.n <= step ? "white" : accent, border: `1.5px solid ${s.n <= step ? accent : `${accent}25`}` }}>{s.n}</div>
              <span className="text-xs font-medium" style={{ color: s.n <= step ? textPrimary : textMuted }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="phone-screen" style={{ background: professional.bg_color || "#F8F5FF" }}>
        {/* Progress bar */}
        {!confirmed && (
          <div className="sticky top-0 z-50 px-5 pt-4 pb-3" style={{ background: `${professional.bg_color || "#F8F5FF"}e6`, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
            <div className="flex gap-1.5 mb-1.5">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div key={i} className="h-1.5 flex-1 rounded-full transition-all duration-500" style={{ background: i + 1 <= step ? `linear-gradient(90deg, ${accent}, ${accent}cc)` : `${accent}18`, opacity: i + 1 < step ? 0.7 : 1 }} />
              ))}
            </div>
            <p className="text-[11px] font-semibold tracking-wide" style={{ color: textMuted }}>ETAPA {step} DE {totalSteps}</p>
          </div>
        )}

        {/* Step content */}
        <div key={step} className={confirmed ? "" : animClass}>
          {/* ═══ STEP 1: Client Info ═══ */}
          {step === 1 && !confirmed && (
            <Step1ClientInfo
              professional={professional}
              accent={accent}
              colors={colors}
              clientName={clientName}
              setClientName={setClientName}
              clientPhone={clientPhone}
              setClientPhone={setClientPhone}
              onNext={goNext}
              reviewStats={reviewStats}
            />
          )}

          {/* ═══ STEP 2 (Salon): Employee Selection ═══ */}
          {isSalon && step === 2 && !confirmed && (
            <Step2Employees
              employees={employees}
              selected={selectedEmployee}
              clientName={clientName}
              accent={accent}
              colors={colors}
              employeeStatsMap={employeeStatsMap}
              onSelect={(emp) => { setSelectedEmployee(emp); goNext(); }}
              onBack={goBack}
            />
          )}

          {/* ═══ Service Selection ═══ */}
          {step === serviceStep && !confirmed && (
            <Step3Services
              services={filteredServices}
              groupedServices={groupedServices}
              selected={selectedService}
              selectedEmployee={selectedEmployee}
              accent={accent}
              colors={colors}
              isSalon={isSalon}
              onSelect={(svc) => { setSelectedService(svc); setSelectedDate(null); setSelectedSlot(null); setSelectedTime(""); goNext(); }}
              onBack={goBack}
            />
          )}

          {/* ═══ Date & Time ═══ */}
          {step === dateStep && selectedService && !confirmed && (
            <Step4DateTime
              service={selectedService}
              professional={professional}
              accent={accent}
              colors={colors}
              days={days14}
              today={today}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              selectedTime={selectedTime}
              setSelectedTime={setSelectedTime}
              slots={slots}
              loadingSlots={loadingSlots}
              selectedSlot={selectedSlot}
              setSelectedSlot={setSelectedSlot}
              waitlistEnabled={waitlistEnabled}
              clientName={clientName}
              clientPhone={clientPhone}
              onNext={goNext}
              onBack={goBack}
            />
          )}

          {/* ═══ Confirmation ═══ */}
          {step === confirmStep && selectedService && !confirmed && (
            <Step5Confirm
              professional={professional}
              selectedEmployee={selectedEmployee}
              selectedService={selectedService}
              selectedSlot={selectedSlot}
              clientName={clientName}
              clientPhone={clientPhone}
              accent={accent}
              colors={colors}
              isSalon={isSalon}
              paymentConfig={paymentConfig}
              signalAmount={signalAmount}
              totalPrice={totalPrice}
              remainingValue={remainingValue}
              submitting={submitting}
              onConfirm={handleBook}
              onBack={goBack}
              allServices={services}
            />
          )}

          {/* ═══ Success / Confirmed ═══ */}
          {confirmed && (
            <SuccessView
              professional={professional}
              selectedEmployee={selectedEmployee}
              selectedService={selectedService}
              selectedSlot={selectedSlot}
              clientName={clientName}
              clientPhone={clientPhone}
              accent={accent}
              colors={colors}
              signalAmount={signalAmount}
              paymentConfig={paymentConfig}
              reviewRating={reviewRating}
              setReviewRating={setReviewRating}
              reviewComment={reviewComment}
              setReviewComment={setReviewComment}
              reviewSubmitted={reviewSubmitted}
              submittingReview={submittingReview}
              onSubmitReview={handleSubmitReview}
              onReset={handleReset}
            />
          )}
        </div>
      </div>

      {/* ═══ Payment Modal ═══ */}
      {showPaymentModal && paymentConfig && signalAmount && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} onClick={(e) => { if (e.target === e.currentTarget) setShowPaymentModal(false); }}>
          <div className="w-full max-w-sm mx-auto animate-fade-in-up-bloom overflow-y-auto" style={{ background: "white", borderRadius: "2rem 2rem 0 0", maxHeight: "90vh", paddingBottom: "env(safe-area-inset-bottom, 16px)" }}>
            <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full" style={{ background: "#E5E7EB" }} /></div>
            <div className="px-5 pb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold" style={{ color: textPrimary, fontFamily: "'Poppins', sans-serif" }}>Pagamento via PIX</h3>
                <button onClick={() => setShowPaymentModal(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-sm" style={{ background: `${textPrimary}10`, color: textMuted }}>✕</button>
              </div>
              <div className="rounded-2xl p-4 mb-4" style={{ background: `${accent}10`, border: `1px solid ${accent}30` }}>
                <div className="space-y-2">
                  <div className="flex justify-between"><span className="text-xs" style={{ color: textSecondary }}>Serviço completo</span><span className="text-sm font-bold" style={{ color: textPrimary }}>{formatCurrency(totalPrice)}</span></div>
                  <div className="flex justify-between items-center"><span className="text-xs font-semibold" style={{ color: accent }}>Sinal a pagar agora (PIX)</span><span className="text-lg font-bold" style={{ color: accent }}>{formatCurrency(signalAmount)}</span></div>
                  <div className="h-px" style={{ background: `${accent}20` }} />
                  <div className="flex justify-between"><span className="text-xs" style={{ color: textSecondary }}>Restante no local</span><span className="text-sm font-semibold" style={{ color: textSecondary }}>{formatCurrency(remainingValue)}</span></div>
                </div>
              </div>
              {(() => {
                const payload = getPixPayload();
                return (
                  <div className="mb-4">
                    {payload && (
                      <div className="flex justify-center mb-4">
                        <div className="p-3 rounded-2xl" style={{ background: "white", border: `2px solid ${accent}20` }}>
                          <QRCodeSVG value={payload} size={180} fgColor={textPrimary} />
                        </div>
                      </div>
                    )}
                    <p className="text-xs font-semibold mb-2 text-center" style={{ color: textSecondary }}>PIX Copia e Cola:</p>
                    <div className="rounded-xl p-3 flex items-center gap-2" style={{ background: `${textPrimary}08`, border: `1px solid ${textPrimary}15` }}>
                      <p className="text-[10px] flex-1 font-mono break-all leading-relaxed max-h-16 overflow-y-auto" style={{ color: textSecondary }}>
                        {payload || paymentConfig.pix_key}
                      </p>
                      <button onClick={copyPixKey} className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 text-white" style={{ background: pixCopied ? "#10B981" : accent }}>
                        {pixCopied ? "✓ Copiado!" : "Copiar"}
                      </button>
                    </div>
                    {paymentConfig.pix_beneficiary_name && <p className="text-xs mt-2 font-medium text-center" style={{ color: accent }}>{paymentConfig.pix_beneficiary_name}</p>}
                  </div>
                );
              })()}
              {/* Timer */}
              {(() => {
                const mins = Math.floor(pixTimeLeft / 60);
                const secs = pixTimeLeft % 60;
                const expired = pixTimeLeft <= 0;
                const progressPct = (pixTimeLeft / 300) * 100;
                return (
                  <div className={`mb-4${!expired && pixTimeLeft <= 60 ? " animate-pulse" : ""}`}>
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <span className={`text-lg${!expired && pixTimeLeft <= 60 ? " animate-bounce" : ""}`} role="img">⏱️</span>
                      <span className={`font-mono font-bold text-lg${!expired && pixTimeLeft <= 60 ? " scale-110" : ""} transition-transform`} style={{ color: expired ? "#EF4444" : pixTimeLeft <= 60 ? "#EF4444" : textPrimary }}>
                        {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "#E5E7EB" }}>
                      <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${progressPct}%`, background: expired ? "#EF4444" : pixTimeLeft <= 60 ? "#F59E0B" : accent }} />
                    </div>
                    {expired ? (
                      <div className="text-center mt-2 space-y-2">
                        <p className="text-xs font-semibold" style={{ color: "#EF4444" }}>Tempo expirado! Gere um novo código.</p>
                        <button onClick={() => setPixTimeLeft(300)} className="px-4 py-2 rounded-xl text-xs font-bold text-white transition-all active:scale-95" style={{ background: accent }}>
                          Gerar novo código
                        </button>
                      </div>
                    ) : (
                      <p className="text-[10px] text-center mt-1" style={{ color: textMuted }}>Realize o pagamento dentro do prazo</p>
                    )}
                  </div>
                );
              })()}
              {pixTimeLeft > 0 && (
                <button onClick={() => { setShowPaymentModal(false); setConfirmed(true); }} className="w-full py-4 rounded-2xl text-white font-bold text-base transition-all active:scale-95" style={{ background: "linear-gradient(135deg, #059669 0%, #10B981 100%)", boxShadow: "0 8px 24px rgba(5,150,105,0.35)" }}>
                  ✅ Já realizei o pagamento
                </button>
              )}
              <p className="text-center text-xs mt-3" style={{ color: textMuted }}>Após o pagamento, você receberá confirmação no WhatsApp</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════ */
/* ══ SUB-COMPONENTS ════════════════════════════════ */
/* ═══════════════════════════════════════════════════ */

type TextColors = { textPrimary: string; textSecondary: string; textMuted: string; cardTextPrimary: string; cardTextSecondary: string; cardTextMuted: string };

/* ── Step 1: Client Info ── */
function Step1ClientInfo({ professional, accent, colors, clientName, setClientName, clientPhone, setClientPhone, onNext, reviewStats }: {
  professional: Professional; accent: string; colors: TextColors; clientName: string; setClientName: (v: string) => void; clientPhone: string; setClientPhone: (v: string) => void; onNext: () => void; reviewStats: { avg: number; count: number } | null;
}) {
  const { textPrimary, textSecondary, textMuted, cardTextPrimary, cardTextSecondary, cardTextMuted } = colors;
  const [errors, setErrors] = useState({ name: "", phone: "" });
  const validate = () => {
    const e = { name: "", phone: "" };
    if (!clientName.trim() || clientName.trim().length < 3) e.name = "Informe seu nome completo";
    if (clientPhone.replace(/\D/g, "").length < 10) e.phone = "Informe um WhatsApp válido";
    setErrors(e);
    return !e.name && !e.phone;
  };
  const handleNext = () => { if (validate()) onNext(); };

  return (
    <div className="flex flex-col min-h-[calc(100vh-60px)] md:min-h-[calc(860px-60px)]">
      {/* Hero */}
      <div className="relative h-56 overflow-visible">
        <div className="absolute inset-0 overflow-hidden">
          {professional.cover_url ? (
            <img src={professional.cover_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}88)` }} />
          )}
          <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, transparent 0%, ${professional.bg_color || "#F8F5FF"}00 30%, ${professional.bg_color || "#F8F5FF"} 100%)` }} />
        </div>
        <div className="absolute bottom-5 left-5 right-5 z-10">
          <div className="flex items-center gap-3">
            {professional.logo_url ? (
              <img src={professional.logo_url} alt="" className="w-11 h-11 rounded-2xl object-cover border-2 border-white/40 shadow-lg" />
            ) : (
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white text-base font-bold shadow-lg" style={{ background: `${accent}dd`, backdropFilter: "blur(8px)" }}>
                {(professional.business_name || professional.name)?.[0]?.toUpperCase()}
              </div>
            )}
            <div>
              <span className="text-white font-bold text-lg drop-shadow-md block">{professional.business_name || professional.name}</span>
              {professional.bio && <span className="text-white/70 text-xs drop-shadow block">{professional.bio.slice(0, 50)}</span>}
              {reviewStats && (
                <div className="flex items-center gap-1 mt-0.5">
                  <Star size={11} className="fill-amber-400 text-amber-400" />
                  <span className="text-white text-[11px] font-semibold drop-shadow">{reviewStats.avg}</span>
                  <span className="text-white/60 text-[10px] drop-shadow">({reviewStats.count} avaliações)</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 px-5 pt-3 pb-8 flex flex-col">
        <div className="animate-fade-in-up-bloom">
          <h1 className="text-2xl font-bold mb-1" style={{ color: textPrimary, fontFamily: "'Poppins', sans-serif" }}>
            {professional.welcome_title || "Bem-vindo! 👋"}
          </h1>
          <p className="text-sm mb-6 leading-relaxed" style={{ color: textSecondary }}>
            {professional.welcome_description || "Agende seu horário em poucos passos. Primeiro, nos conte quem é você."}
          </p>

          {/* Name */}
          <div className="mb-4">
            <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: accent }}>Seu nome</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base opacity-60">👤</span>
              <input type="text" placeholder="Ex: Maria Silva" value={clientName}
                onChange={e => { setClientName(e.target.value); if (errors.name) setErrors({ ...errors, name: "" }); }}
                className="w-full pl-10 pr-4 py-3.5 rounded-xl text-sm font-medium transition-all outline-none focus:ring-2"
                style={{ background: errors.name ? "#FFF1F2" : "white", border: `1.5px solid ${errors.name ? "#F87171" : clientName ? accent : "#E2E8F0"}`, color: "hsl(0 0% 0%)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", ["--tw-ring-color" as any]: accent }}
              />
            </div>
            {errors.name && <p className="text-xs mt-1 font-medium" style={{ color: "#EF4444" }}>{errors.name}</p>}
          </div>

          {/* Phone */}
          <div className="mb-6">
            <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: accent }}>WhatsApp</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base opacity-60">📱</span>
              <input type="tel" placeholder="(11) 99999-9999" value={clientPhone}
                onChange={e => { setClientPhone(formatPhone(e.target.value)); if (errors.phone) setErrors({ ...errors, phone: "" }); }}
                className="w-full pl-10 pr-4 py-3.5 rounded-xl text-sm font-medium transition-all outline-none focus:ring-2"
                style={{ background: errors.phone ? "#FFF1F2" : "white", border: `1.5px solid ${errors.phone ? "#F87171" : clientPhone ? accent : "#E2E8F0"}`, color: "hsl(0 0% 0%)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", ["--tw-ring-color" as any]: accent }}
              />
            </div>
            {errors.phone && <p className="text-xs mt-1 font-medium" style={{ color: "#EF4444" }}>{errors.phone}</p>}
          </div>

          {/* Info card */}
          <div className="rounded-xl p-4 mb-6 flex gap-3" style={{ background: `${accent}08`, border: `1px solid ${accent}18` }}>
            <span className="text-lg">🔒</span>
            <p className="text-xs leading-relaxed" style={{ color: textSecondary }}>
              Seus dados são usados apenas para confirmar o agendamento via WhatsApp.
            </p>
          </div>

          <button onClick={handleNext} className="w-full py-4 rounded-xl text-white font-bold text-base transition-all active:scale-[0.98] hover:shadow-xl"
            style={{ background: `linear-gradient(135deg, ${accent} 0%, ${accent}dd 100%)`, boxShadow: `0 8px 30px -8px ${accent}70` }}>
            Continuar →
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Step 2: Employees (Salon) ── */
function Step2Employees({ employees, selected, clientName, accent, colors, employeeStatsMap, onSelect, onBack }: {
  employees: Employee[]; selected: Employee | null; clientName: string; accent: string; colors: TextColors; employeeStatsMap: Record<string, EmployeeStats>; onSelect: (e: Employee) => void; onBack: () => void;
}) {
  const { textPrimary, textSecondary, textMuted, cardTextPrimary, cardTextSecondary, cardTextMuted } = colors;
  return (
    <div className="flex flex-col min-h-[calc(100vh-60px)] md:min-h-[calc(860px-60px)]">
      <div className="px-5 pt-4 pb-2 flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90" style={{ background: `${accent}10`, color: accent }}>←</button>
        <div>
          <h2 className="text-lg font-bold" style={{ color: textPrimary, fontFamily: "'Poppins', sans-serif" }}>Escolha o Profissional</h2>
          <p className="text-xs" style={{ color: textMuted }}>Olá, {clientName}! Quem vai te atender?</p>
        </div>
      </div>
      <div className="flex-1 px-5 pb-4 space-y-3 overflow-y-auto">
        {employees.map(emp => {
          const isSelected = selected?.id === emp.id;
          const stats = employeeStatsMap[emp.id];
          return (
            <button key={emp.id} onClick={() => onSelect(emp)} className="w-full text-left transition-all active:scale-[0.98]">
              <div className="rounded-2xl p-4 transition-all duration-200" style={{ background: isSelected ? `${accent}08` : "white", border: `1.5px solid ${isSelected ? accent : "#F1F5F9"}`, boxShadow: isSelected ? `0 4px 20px ${accent}20` : "0 1px 6px rgba(0,0,0,0.04)" }}>
                <div className="flex gap-3">
                  <div className="relative flex-shrink-0">
                    {emp.avatar_url ? (
                      <img src={emp.avatar_url} alt={emp.name} className="w-16 h-16 rounded-2xl object-cover" style={{ border: `2px solid ${isSelected ? accent : `${accent}20`}` }} />
                    ) : (
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold" style={{ background: `${accent}15`, color: accent, border: `2px solid ${isSelected ? accent : `${accent}20`}` }}>
                        {emp.name[0]}
                      </div>
                    )}
                    {isSelected && <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: accent }}>✓</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm" style={{ color: cardTextPrimary }}>{emp.name}</h3>
                    {emp.specialty && <p className="text-xs font-medium mt-0.5" style={{ color: accent }}>{emp.specialty}</p>}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {stats?.avgRating != null && (
                        <div className="flex items-center gap-1">
                          <Star size={12} className="fill-amber-400 text-amber-400" />
                          <span className="text-xs font-semibold" style={{ color: cardTextPrimary }}>{stats.avgRating}</span>
                          <span className="text-[10px]" style={{ color: cardTextMuted }}>({stats.reviewCount})</span>
                        </div>
                      )}
                      {stats?.completedBookings > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: `${accent}10`, color: accent }}>
                          ✅ {stats.completedBookings} atendimento{stats.completedBookings !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
        {employees.length === 0 && (
          <div className="rounded-2xl p-8 text-center" style={{ background: "white", border: `2px dashed ${accent}30` }}>
            <p style={{ color: cardTextMuted }}>Nenhum profissional disponível no momento.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Step 3: Services ── */
function Step3Services({ services, groupedServices, selected, selectedEmployee, accent, colors, isSalon, onSelect, onBack }: {
  services: Service[]; groupedServices: Record<string, Service[]>; selected: Service | null; selectedEmployee: Employee | null; accent: string; colors: TextColors; isSalon: boolean; onSelect: (s: Service) => void; onBack: () => void;
}) {
  const { textPrimary, textSecondary, textMuted, cardTextPrimary, cardTextSecondary, cardTextMuted } = colors;
  return (
    <div className="flex flex-col min-h-[calc(100vh-60px)] md:min-h-[calc(860px-60px)]">
      <div className="px-5 pt-4 pb-3 flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90" style={{ background: `${accent}10`, color: accent }}>←</button>
        <div>
          <h2 className="text-lg font-bold" style={{ color: textPrimary, fontFamily: "'Poppins', sans-serif" }}>Escolha o Serviço</h2>
          {isSalon && selectedEmployee && <p className="text-xs" style={{ color: textMuted }}>Profissional: {selectedEmployee.name}</p>}
        </div>
      </div>

      {isSalon && selectedEmployee && (
        <div className="px-5 mb-4">
          <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: `${accent}10`, border: `1px solid ${accent}20` }}>
            {selectedEmployee.avatar_url ? (
              <img src={selectedEmployee.avatar_url} alt={selectedEmployee.name} className="w-10 h-10 rounded-xl object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold" style={{ background: `${accent}20`, color: accent }}>{selectedEmployee.name[0]}</div>
            )}
            <div>
              <p className="text-sm font-bold" style={{ color: textPrimary }}>{selectedEmployee.name}</p>
              {selectedEmployee.specialty && <p className="text-xs" style={{ color: accent }}>{selectedEmployee.specialty}</p>}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 px-5 pb-4 space-y-3 overflow-y-auto">
        <p className="text-xs font-semibold mb-2" style={{ color: textMuted }}>{services.length} SERVIÇOS DISPONÍVEIS</p>
        {Object.entries(groupedServices).map(([category, svcs]) => (
          <div key={category}>
            {Object.keys(groupedServices).length > 1 && <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: textMuted }}>{category}</p>}
            {svcs.map(svc => {
              const isSelected = selected?.id === svc.id;
              return (
                <button key={svc.id} onClick={() => onSelect(svc)} className="w-full text-left transition-all active:scale-[0.98] mb-3">
                  <div className="rounded-2xl p-4 transition-all duration-200" style={{ background: isSelected ? `${accent}08` : "white", border: `1.5px solid ${isSelected ? accent : "#F1F5F9"}`, boxShadow: isSelected ? `0 4px 20px ${accent}20` : "0 1px 6px rgba(0,0,0,0.04)" }}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-sm" style={{ color: cardTextPrimary }}>{svc.name}</h3>
                          {isSelected && <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs flex-shrink-0" style={{ background: accent }}>✓</div>}
                        </div>
                        {svc.description && <p className="text-xs mt-0.5 leading-relaxed" style={{ color: cardTextSecondary }}>{svc.description}</p>}
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-base font-bold" style={{ color: accent }}>{formatCurrency(Number(svc.price))}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${accent}10`, color: accent }}>⏱ {svc.duration_minutes} min</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
        {services.length === 0 && (
          <div className="rounded-2xl p-8 text-center" style={{ background: "white", border: `2px dashed ${accent}30` }}>
            <p style={{ color: cardTextMuted }}>Nenhum serviço disponível no momento.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Waitlist Form (shown when no slots available) ── */
function WaitlistForm({ professionalId, serviceId, serviceName, selectedDate, accent, colors, clientName, clientPhone, onClose }: {
  professionalId: string; serviceId: string; serviceName: string; selectedDate: Date; accent: string; colors: TextColors; clientName: string; clientPhone: string; onClose: () => void;
}) {
  const { textPrimary, textSecondary, textMuted, cardTextPrimary, cardTextSecondary, cardTextMuted } = colors;
  const [period, setPeriod] = useState("any");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    const { error } = await api.from("waitlist" as any).insert({
      professional_id: professionalId,
      service_id: serviceId,
      client_name: clientName,
      client_phone: clientPhone.replace(/\D/g, ""),
      preferred_date: format(selectedDate, "yyyy-MM-dd"),
      preferred_period: period,
      notes: notes.trim() || null,
    } as any);
    if (!error) {
      setSubmitted(true);
      toast.success("Você foi adicionado à lista de espera!");
    } else {
      toast.error("Erro ao entrar na lista de espera");
    }
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="rounded-2xl p-6 text-center animate-fade-in-up-bloom" style={{ background: "white", border: `2px solid ${accent}20` }}>
        <span className="text-4xl mb-3 block">🎉</span>
        <p className="text-sm font-bold mb-1" style={{ color: cardTextPrimary }}>Você está na lista de espera!</p>
        <p className="text-xs mb-3" style={{ color: cardTextMuted }}>
          Entraremos em contato pelo WhatsApp caso um horário fique disponível para {DAYS_FULL[selectedDate.getDay()]}, {selectedDate.getDate()} de {MONTHS_PT[selectedDate.getMonth()]}.
        </p>
        <p className="text-xs font-medium" style={{ color: accent }}>Serviço: {serviceName}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-5 animate-fade-in-up-bloom" style={{ background: "white", border: `2px solid ${accent}15`, boxShadow: `0 4px 20px ${accent}10` }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">⏰</span>
        <div>
          <p className="text-sm font-bold" style={{ color: cardTextPrimary }}>Lista de Espera</p>
          <p className="text-xs" style={{ color: cardTextMuted }}>Seja avisado quando um horário abrir!</p>
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: accent }}>Preferência de horário</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: "any", label: "Qualquer", emoji: "🕐" },
            { value: "morning", label: "Manhã", emoji: "🌅" },
            { value: "afternoon", label: "Tarde", emoji: "☀️" },
            { value: "evening", label: "Noite", emoji: "🌙" },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className="py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95"
              style={{
                background: period === opt.value ? `linear-gradient(135deg, ${accent}, ${accent}cc)` : "white",
                color: period === opt.value ? "white" : cardTextPrimary,
                border: `1.5px solid ${period === opt.value ? accent : "#F1F5F9"}`,
              }}
            >
              {opt.emoji} {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: accent }}>Observação (opcional)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Ex: Prefiro após 14h"
          rows={2}
          className="w-full px-3 py-2.5 rounded-xl text-xs font-medium transition-all outline-none focus:ring-2 resize-none"
          style={{ background: "white", border: `1.5px solid ${notes ? accent : "#E2E8F0"}`, color: "hsl(0 0% 0%)", ["--tw-ring-color" as any]: accent }}
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full py-3.5 rounded-xl text-white font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-60"
        style={{ background: `linear-gradient(135deg, ${accent} 0%, ${accent}dd 100%)`, boxShadow: `0 6px 20px -6px ${accent}70` }}
      >
        {submitting ? "Entrando na lista..." : "Entrar na Lista de Espera 🔔"}
      </button>
    </div>
  );
}

/* ── Step 4: Date & Time ── */
function Step4DateTime({ service, professional, accent, colors, days, today, selectedDate, setSelectedDate, selectedTime, setSelectedTime, slots, loadingSlots, selectedSlot, setSelectedSlot, waitlistEnabled, clientName, clientPhone, onNext, onBack }: {
  service: Service; professional: Professional; accent: string; colors: TextColors; days: Date[]; today: Date; selectedDate: Date | null; setSelectedDate: (d: Date | null) => void; selectedTime: string; setSelectedTime: (t: string) => void; slots: Slot[]; loadingSlots: boolean; selectedSlot: Slot | null; setSelectedSlot: (s: Slot | null) => void; waitlistEnabled: boolean; clientName: string; clientPhone: string; onNext: () => void; onBack: () => void;
}) {
  const { textPrimary, textSecondary, textMuted, cardTextPrimary, cardTextSecondary, cardTextMuted } = colors;
  const handleDaySelect = (d: Date) => { setSelectedDate(d); setSelectedTime(""); setSelectedSlot(null); };
  const handleTimeSelect = (slot: Slot) => { setSelectedSlot(slot); setSelectedTime(formatTimeSP(slot.start_time)); };
  const canContinue = selectedDate && selectedSlot;

  return (
    <div className="flex flex-col min-h-[calc(100vh-60px)] md:min-h-[calc(860px-60px)]">
      <div className="px-5 pt-4 pb-3 flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90" style={{ background: `${accent}10`, color: accent }}>←</button>
        <div>
          <h2 className="text-lg font-bold" style={{ color: textPrimary, fontFamily: "'Poppins', sans-serif" }}>Data e Horário</h2>
          <p className="text-xs" style={{ color: textMuted }}>{service.name} · {service.duration_minutes} min</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold" style={{ color: textPrimary }}>Escolha o dia</p>
          <p className="text-xs font-medium" style={{ color: accent }}>
            {selectedDate ? `${MONTHS_PT[selectedDate.getMonth()]} ${selectedDate.getFullYear()}` : `${MONTHS_PT[today.getMonth()]} ${today.getFullYear()}`}
          </p>
        </div>

        {/* Day picker horizontal */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-5 -mx-1 px-1">
          {days.map(d => {
            const isSelected = selectedDate?.toDateString() === d.toDateString();
            const isToday = d.toDateString() === today.toDateString();
            return (
              <button key={d.toISOString()} onClick={() => handleDaySelect(d)}
                className="flex-shrink-0 flex flex-col items-center gap-1 py-3 px-3 rounded-xl transition-all active:scale-90 min-w-[56px]"
                style={{ background: isSelected ? `linear-gradient(135deg, ${accent}, ${accent}cc)` : isToday ? `${accent}08` : "white", border: `1.5px solid ${isSelected ? accent : isToday ? `${accent}40` : "#F1F5F9"}`, boxShadow: isSelected ? `0 4px 12px ${accent}40` : "0 1px 3px rgba(0,0,0,0.04)" }}>
                <span className="text-[10px] font-semibold uppercase" style={{ color: isSelected ? "rgba(255,255,255,0.8)" : cardTextMuted }}>{DAYS_PT[d.getDay()]}</span>
                <span className="text-lg font-bold leading-none" style={{ color: isSelected ? "white" : cardTextPrimary }}>{d.getDate()}</span>
                {isToday && !isSelected && <div className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} />}
              </button>
            );
          })}
        </div>

        {/* Time slots */}
        {selectedDate ? (
          loadingSlots ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: accent }} /></div>
          ) : slots.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold" style={{ color: textPrimary }}>Horários disponíveis</p>
                <p className="text-xs" style={{ color: textMuted }}>{DAYS_PT[selectedDate.getDay()]}, {selectedDate.getDate()} de {MONTHS_PT[selectedDate.getMonth()]}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {slots.map(slot => {
                  const time = formatTimeSP(slot.start_time);
                  const isSelected = selectedSlot?.start_time === slot.start_time;
                  return (
                    <button key={slot.start_time} onClick={() => handleTimeSelect(slot)}
                      className="py-3 rounded-xl text-sm font-semibold transition-all active:scale-95"
                      style={{ background: isSelected ? `linear-gradient(135deg, ${accent}, ${accent}cc)` : "white", color: isSelected ? "white" : cardTextPrimary, border: `1.5px solid ${isSelected ? accent : "#F1F5F9"}`, boxShadow: isSelected ? `0 4px 12px ${accent}40` : "0 1px 3px rgba(0,0,0,0.04)" }}>
                      {time}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center py-8 rounded-2xl" style={{ background: "#F9FAFB", border: `2px dashed ${accent}20` }}>
                <span className="text-3xl mb-2">😔</span>
                <p className="text-sm font-medium" style={{ color: cardTextMuted }}>Nenhum horário disponível nesta data</p>
              </div>
              {waitlistEnabled && selectedDate && service && (
                <WaitlistForm
                  professionalId={professional.id}
                  serviceId={service.id}
                  serviceName={service.name}
                  selectedDate={selectedDate}
                  accent={accent}
                  colors={colors}
                  clientName={clientName}
                  clientPhone={clientPhone}
                  onClose={() => { }}
                />
              )}
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center py-12 rounded-2xl" style={{ background: "#F9FAFB", border: `2px dashed ${accent}20` }}>
            <span className="text-3xl mb-2">📅</span>
            <p className="text-sm font-medium" style={{ color: cardTextMuted }}>Selecione um dia para ver os horários</p>
          </div>
        )}
      </div>

      <div className="px-5 pb-6 pt-2">
        {canContinue && (
          <div className="rounded-2xl p-3 mb-3 flex items-center gap-2" style={{ background: `${accent}10`, border: `1px solid ${accent}30` }}>
            <span className="text-lg">📅</span>
            <div>
              <p className="text-xs font-bold" style={{ color: accent }}>{DAYS_PT[selectedDate!.getDay()]}, {selectedDate!.getDate()} de {MONTHS_PT[selectedDate!.getMonth()]} às {selectedTime}</p>
              <p className="text-xs" style={{ color: textMuted }}>{service.name} · {service.duration_minutes} min</p>
            </div>
          </div>
        )}
        <button onClick={() => canContinue && onNext()} disabled={!canContinue}
          className="w-full py-4 rounded-xl text-white font-bold text-base transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-xl"
          style={{ background: canContinue ? `linear-gradient(135deg, ${accent} 0%, ${accent}dd 100%)` : `${accent}60`, boxShadow: canContinue ? `0 8px 30px -8px ${accent}70` : "none" }}>
          {canContinue ? "Confirmar Data e Horário →" : "Selecione data e horário"}
        </button>
      </div>
    </div>
  );
}

/* ── Step 5: Confirmation ── */
function Step5Confirm({ professional, selectedEmployee, selectedService, selectedSlot, clientName, clientPhone, accent, colors, isSalon, paymentConfig, signalAmount, totalPrice, remainingValue, submitting, onConfirm, onBack, allServices }: {
  professional: Professional; selectedEmployee: Employee | null; selectedService: Service; selectedSlot: Slot | null; clientName: string; clientPhone: string; accent: string; colors: TextColors; isSalon: boolean; paymentConfig: PaymentConfig | null; signalAmount: number | null; totalPrice: number; remainingValue: number; submitting: boolean; onConfirm: () => void; onBack: () => void; allServices: Service[];
}) {
  const [addedUpsellIds, setAddedUpsellIds] = useState<string[]>([]);
  const { textPrimary, textSecondary, textMuted, cardTextPrimary, cardTextSecondary, cardTextMuted } = colors;
  if (!selectedSlot) return null;
  const spDate = formatDateSP(selectedSlot.start_time);

  return (
    <div className="flex flex-col min-h-[calc(100vh-60px)] md:min-h-[calc(860px-60px)]">
      <div className="px-5 pt-4 pb-3 flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90" style={{ background: `${accent}10`, color: accent }}>←</button>
        <div>
          <h2 className="text-lg font-bold" style={{ color: textPrimary, fontFamily: "'Poppins', sans-serif" }}>Confirmar Agendamento</h2>
          <p className="text-xs" style={{ color: textMuted }}>Revise os detalhes antes de confirmar</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {/* Professional + service summary card */}
        <div className="rounded-2xl overflow-hidden mb-4" style={{ border: `1.5px solid ${accent}15`, boxShadow: `0 2px 12px ${accent}08` }}>
          <div className="flex items-center gap-3 p-4" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}>
            {(isSalon && selectedEmployee?.avatar_url) ? (
              <img src={selectedEmployee.avatar_url} alt={selectedEmployee.name} className="w-14 h-14 rounded-xl object-cover" style={{ border: "2px solid rgba(255,255,255,0.3)" }} />
            ) : professional.logo_url ? (
              <img src={professional.logo_url} alt="" className="w-14 h-14 rounded-xl object-cover" style={{ border: "2px solid rgba(255,255,255,0.3)" }} />
            ) : (
              <div className="w-14 h-14 rounded-xl flex items-center justify-center text-white text-xl font-bold" style={{ background: "rgba(255,255,255,0.2)" }}>
                {(isSalon && selectedEmployee ? selectedEmployee.name : professional.business_name || professional.name)?.[0]?.toUpperCase()}
              </div>
            )}
            <div className="text-white">
              <p className="font-bold text-base">{isSalon && selectedEmployee ? selectedEmployee.name : professional.business_name || professional.name}</p>
              {isSalon && selectedEmployee?.specialty && <p className="text-xs opacity-80">{selectedEmployee.specialty}</p>}
            </div>
          </div>

          <div className="bg-white p-4 space-y-3">
            {[
              { icon: "📋", label: "Serviço", value: selectedService.name },
              { icon: "⏱", label: "Duração", value: `${selectedService.duration_minutes} min` },
              { icon: "📅", label: "Data", value: `${DAYS_FULL[spDate.day]}, ${spDate.date} de ${MONTHS_PT[spDate.month]}` },
              { icon: "⏰", label: "Horário", value: formatTimeSP(selectedSlot.start_time) },
              { icon: "👤", label: "Cliente", value: clientName },
              { icon: "📱", label: "WhatsApp", value: clientPhone },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="text-base w-6 text-center">{item.icon}</span>
                <span className="text-xs flex-1" style={{ color: cardTextSecondary }}>{item.label}</span>
                <span className="text-xs font-semibold" style={{ color: cardTextPrimary }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Upsell Suggestions */}
        <UpsellSuggestions
          professionalId={professional.id}
          sourceServiceId={selectedService.id}
          services={allServices}
          accent={accent}
          textPrimary={cardTextPrimary}
          textSecondary={cardTextSecondary}
          onAddService={(svc) => {
            setAddedUpsellIds(prev => [...prev, svc.id]);
          }}
          addedServiceIds={addedUpsellIds}
        />

        {/* Payment summary */}
        {signalAmount && (
          <div className="rounded-2xl p-4 mb-4" style={{ background: `${accent}10`, border: `1.5px solid ${accent}30` }}>
            <p className="text-sm font-bold mb-3" style={{ color: textPrimary }}>💰 Resumo de Pagamento</p>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs" style={{ color: textSecondary }}>Valor total do serviço</span>
                <span className="text-sm font-bold" style={{ color: textPrimary }}>{formatCurrency(totalPrice)}</span>
              </div>
              <div className="flex justify-between items-center">
                <div><span className="text-xs font-semibold" style={{ color: accent }}>Sinal — via PIX</span><p className="text-xs" style={{ color: textMuted }}>Pago agora para reservar a vaga</p></div>
                <span className="text-sm font-bold" style={{ color: accent }}>{formatCurrency(signalAmount)}</span>
              </div>
              <div className="h-px my-1" style={{ background: `${accent}30` }} />
              <div className="flex justify-between items-center">
                <div><span className="text-xs font-semibold" style={{ color: textSecondary }}>Restante no local</span><p className="text-xs" style={{ color: textMuted }}>Pago pessoalmente no dia</p></div>
                <span className="text-sm font-bold" style={{ color: textSecondary }}>{formatCurrency(remainingValue)}</span>
              </div>
            </div>
          </div>
        )}

        {signalAmount && (
          <div className="rounded-2xl p-3 flex gap-2 mb-2" style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
            <span className="text-base">⚠️</span>
            <p className="text-xs leading-relaxed" style={{ color: "#92400E" }}>
              O sinal de {formatCurrency(signalAmount)} é necessário para garantir sua vaga.
            </p>
          </div>
        )}
      </div>

      <div className="px-5 pb-6 pt-2">
        <button onClick={onConfirm} disabled={submitting}
          className="w-full py-4 rounded-xl text-white font-bold text-base transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 hover:shadow-xl"
          style={{ background: `linear-gradient(135deg, ${accent} 0%, ${accent}dd 100%)`, boxShadow: `0 8px 30px -8px ${accent}70` }}>
          {submitting ? <Loader2 size={18} className="animate-spin" /> : (signalAmount ? "Confirmar e Pagar Sinal →" : "Confirmar Agendamento →")}
        </button>
      </div>
    </div>
  );
}

/* ── Success View ── */
function SuccessView({ professional, selectedEmployee, selectedService, selectedSlot, clientName, clientPhone, accent, colors, signalAmount, paymentConfig, reviewRating, setReviewRating, reviewComment, setReviewComment, reviewSubmitted, submittingReview, onSubmitReview, onReset }: {
  professional: Professional; selectedEmployee: Employee | null; selectedService: Service | null; selectedSlot: Slot | null; clientName: string; clientPhone: string; accent: string; colors: TextColors; signalAmount: number | null; paymentConfig: PaymentConfig | null; reviewRating: number; setReviewRating: (n: number) => void; reviewComment: string; setReviewComment: (s: string) => void; reviewSubmitted: boolean; submittingReview: boolean; onSubmitReview: () => void; onReset: () => void;
}) {
  const { textPrimary, textSecondary, textMuted, cardTextPrimary, cardTextSecondary, cardTextMuted } = colors;
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-20px)] md:min-h-[calc(860px-20px)] px-5 text-center py-8">
      <div className="animate-scale-in">
        <div className="w-20 h-20 rounded-full flex items-center justify-center text-4xl mx-auto mb-6" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}bb)`, boxShadow: `0 12px 36px ${accent}50` }}>
          ✅
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: textPrimary, fontFamily: "'Poppins', sans-serif" }}>
          {(() => {
            const msg = professional.confirmation_message || "Agendamento Confirmado!";
            if (!selectedService || !selectedSlot) return msg;
            const sp = formatDateSP(selectedSlot.start_time);
            return msg
              .replace("{nome}", clientName)
              .replace("{servico}", selectedService.name)
              .replace("{data}", `${sp.date} de ${MONTHS_PT[sp.month]}`)
              .replace("{horario}", formatTimeSP(selectedSlot.start_time));
          })()}
        </h2>
        <p className="text-sm mb-6 leading-relaxed" style={{ color: textSecondary }}>
          Você receberá uma confirmação no WhatsApp <strong style={{ color: accent }}>{clientPhone}</strong>.
        </p>

        {/* Summary card */}
        {selectedService && selectedSlot && (
          <div className="rounded-2xl p-5 mb-6 text-left" style={{ background: `${accent}10`, border: `1px solid ${accent}30` }}>
            <div className="space-y-3">
              {[
                { label: "Cliente", value: clientName, icon: "👤" },
                ...(selectedEmployee ? [{ label: "Profissional", value: selectedEmployee.name, icon: "✂️" }] : []),
                { label: "Serviço", value: selectedService.name, icon: "📋" },
                { label: "Data", value: (() => { const sp = formatDateSP(selectedSlot.start_time); return `${DAYS_FULL[sp.day]}, ${sp.date} de ${MONTHS_PT[sp.month]}`; })(), icon: "📅" },
                { label: "Horário", value: formatTimeSP(selectedSlot.start_time), icon: "⏰" },
                ...(signalAmount ? [{ label: "Sinal pago", value: formatCurrency(signalAmount), icon: "💳" }] : []),
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <span className="text-base">{item.icon}</span>
                  <span className="text-xs" style={{ color: textSecondary }}>{item.label}:</span>
                  <span className="text-xs font-bold ml-auto" style={{ color: textPrimary }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Review Form */}
        {!reviewSubmitted ? (
          <div className="rounded-2xl p-5 mb-6 text-left" style={{ background: "white", border: `1px solid ${accent}20` }}>
            <h3 className="font-semibold text-sm flex items-center gap-2 mb-3" style={{ color: cardTextPrimary }}>
              <Star size={16} className="text-yellow-500" /> Como foi sua experiência com a plataforma?
            </h3>
            <p className="text-xs mb-3" style={{ color: cardTextMuted }}>Avalie o processo de agendamento online</p>
            <div className="flex items-center justify-center gap-2 mb-3">
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s} onClick={() => setReviewRating(s)} className="transition-transform hover:scale-110">
                  <Star size={28} className={cn("transition-colors", s <= reviewRating ? "text-yellow-500 fill-yellow-500" : "text-gray-300")} />
                </button>
              ))}
            </div>
            <textarea value={reviewComment} onChange={e => setReviewComment(e.target.value)} placeholder="Conte como foi (opcional)" maxLength={500} rows={3}
              className="w-full px-4 py-3 rounded-xl text-sm resize-none outline-none mb-3" style={{ background: `${accent}06`, border: `1.5px solid ${accent}15`, color: "hsl(0 0% 0%)" }} />
            <button onClick={onSubmitReview} disabled={submittingReview}
              className="w-full py-2.5 rounded-xl text-white font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: accent }}>
              {submittingReview ? <Loader2 size={14} className="animate-spin" /> : "Enviar avaliação"}
            </button>
          </div>
        ) : (
          <p className="text-sm font-medium flex items-center justify-center gap-2 mb-6" style={{ color: "#10B981" }}>✅ Obrigado pela avaliação!</p>
        )}

        <button onClick={onReset} className="w-full py-4 rounded-xl text-white font-bold text-base transition-all active:scale-[0.98] hover:shadow-xl"
          style={{ background: `linear-gradient(135deg, ${accent} 0%, ${accent}dd 100%)`, boxShadow: `0 8px 30px -8px ${accent}70` }}>
          Fazer Novo Agendamento
        </button>
      </div>
    </div>
  );
}

export default PublicBooking;
