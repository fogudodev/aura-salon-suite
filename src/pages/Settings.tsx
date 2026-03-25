import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard, Clock, Globe, Shield, MessageSquare,
  ArrowLeft, Save, Loader2, CheckCircle2, QrCode, Power,
  Palette, Eye, EyeOff, Crown, AlertTriangle, Camera, ImageIcon, X,
  Plus, Trash2, CalendarOff, Plane, Calendar as CalendarIcon,
  User,
  LucideIcon,
} from "lucide-react";
import { GoogleCalendarSection } from "@/components/settings/GoogleCalendarSection";
import { usePaymentConfig, useSavePaymentConfig } from "@/hooks/usePaymentConfig";
import { Switch } from "@/components/ui/switch";
import { useProfessional } from "@/hooks/useProfessional";
import { useWorkingHours, getDayName, useUpsertWorkingHours } from "@/hooks/useWorkingHours";
import { useBlockedTimes, useCreateBlockedTime, useDeleteBlockedTime } from "@/hooks/useBlockedTimes";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSubscription } from "@/hooks/useSubscription";
import { useWhatsAppInstance, useWhatsAppAutomations, useToggleAutomation } from "@/hooks/useWhatsApp";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { STRIPE_PLANS, SETTINGS_SECTIONS } from "@/lib/stripe-plans";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Section = "system" | "hours" | "subscription" | "whatsapp" | "security" | "google-calendar" | "payment";

const TRIGGER_LABELS: Record<string, string> = {
  booking_created: "Agendamento criado",
  reminder_24h: "Lembrete 24h antes",
  reminder_3h: "Lembrete 3h antes",
  post_service: "Pós-atendimento",
  reactivation_30d: "Reativação 30 dias",
};

const COLOR_PRESETS = [
  "#C4922A", "#E67E22", "#E74C3C", "#9B59B6",
  "#3498DB", "#1ABC9C", "#2ECC71", "#34495E",
  "#F39C12", "#D35400", "#8E44AD", "#2980B9",
];

async function updateProfessionalRecord(professionalId: string, updates: Record<string, unknown>) {
  if (isPhpBackend()) {
    const token = getAccessToken();
    if (!token) return new Error("Sessão expirada");

    try {
      const response = await fetch(`${PHP_API_URL}/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });

      const body = await response.json().catch(() => ({} as { error?: string }));
      if (!response.ok) return new Error(body.error || "Erro ao salvar");

      return null;
    } catch (err) {
      return err instanceof Error ? err : new Error("Erro ao salvar");
    }
  }

  const { error } = await api.from("professionals").update(updates).eq("id", professionalId);
  return error as Error | null;
}

const Settings = () => {
  const [activeSection, setActiveSection] = useState<Section | null>(null);
  const { currentPlan } = useFeatureAccess();

  const allSections = [
    { id: "system" as Section, icon: Palette, title: "Aparência do Sistema", description: "Logo, nome e cores do painel" },
    { id: "hours" as Section, icon: Clock, title: "Horários de Trabalho", description: "Defina seus dias e horários de atendimento" },
    { id: "payment" as Section, icon: QrCode, title: "Pagamentos", description: "Configure métodos de pagamento e sinal" },
    { id: "subscription" as Section, icon: CreditCard, title: "Assinatura", description: "Plano atual e gerenciamento" },
    { id: "whatsapp" as Section, icon: MessageSquare, title: "Automação WhatsApp", description: "QR Code, instância e automações" },
    { id: "google-calendar" as Section, icon: CalendarIcon, title: "Google Calendar", description: "Sincronize sua agenda com o Google" },
    { id: "security" as Section, icon: Shield, title: "Segurança", description: "Alteração de senha" },
  ];

  const allowedSections = SETTINGS_SECTIONS[currentPlan] || SETTINGS_SECTIONS.none;
  const sections = allSections.filter((s) => allowedSections.includes(s.id));

  return (
    <DashboardLayout title="Configurações" subtitle="Gerencie sua conta">
      <div className="max-w-3xl">
        <AnimatePresence mode="wait">
          {!activeSection ? (
            <motion.div
              key="menu"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-3"
            >
              {sections.map((s, i) => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Button
                    variant="ghost"
                    onClick={() => setActiveSection(s.id)}
                    className="w-full glass-card rounded-2xl p-5 h-auto flex items-center gap-4 hover-lift group text-left justify-start"
                  >
                    <div className="w-11 h-11 rounded-xl bg-muted/50 flex items-center justify-center group-hover:bg-accent/10 transition-colors">
                      <s.icon size={20} className="text-muted-foreground group-hover:text-accent transition-colors" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{s.title}</h3>
                      <p className="text-sm text-muted-foreground">{s.description}</p>
                    </div>
                  </Button>
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveSection(null)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
              >
                <ArrowLeft size={14} /> Voltar
              </Button>

              {activeSection === "system" && <SystemAppearanceSection />}
              {activeSection === "hours" && <WorkingHoursSection />}
              {activeSection === "payment" && <PaymentSection />}
              {activeSection === "subscription" && <SubscriptionSection />}
              {activeSection === "whatsapp" && <WhatsAppSection />}
              {activeSection === "google-calendar" && <GoogleCalendarSection />}
              {activeSection === "security" && <SecuritySection />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
};

/* ===================== SYSTEM APPEARANCE ===================== */
const ACCENT_PRESETS = [
  "#FF0066", "#C4922A", "#E67E22", "#E74C3C", "#9B59B6",
  "#3498DB", "#1ABC9C", "#2ECC71", "#F39C12", "#D35400",
  "#8E44AD", "#2980B9",
];

const SIDEBAR_PRESETS = [
  "#09090B", "#0F172A", "#1A1A2E", "#0D1117",
  "#1E1E2E", "#2D2D3F", "#111827", "#18181B",
];

const SIDEBAR_TEXT_PRESETS = [
  "#FFFFFF", "#F5F5F5", "#E0E0E0", "#BDBDBD",
  "#9E9E9E", "#78909C", "#B0BEC5", "#CFD8DC",
];

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const SystemAppearanceSection = () => {
  const { data: professional, isLoading } = useProfessional();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);

  const [businessName, setBusinessName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [accentColor, setAccentColor] = useState("#FF0066");
  const [sidebarColor, setSidebarColor] = useState("#09090B");
  const [sidebarTextColor, setSidebarTextColor] = useState("#FFFFFF");

  useEffect(() => {
    if (professional) {
      setBusinessName(professional.business_name || professional.name || "");
      setLogoUrl(professional.logo_url || "");
      setAccentColor(professional.system_accent_color || professional.primary_color || "#FF0066");
      setSidebarColor(professional.system_sidebar_color || "#09090B");
      setSidebarTextColor(professional.system_sidebar_text_color || "#FFFFFF");
    }
  }, [professional]);

  const uploadLogo = async (file: File) => {
    if (!user || !professional) return;
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      if (!["jpg", "jpeg", "png", "webp"].includes(ext)) {
        toast.error("Use JPG, PNG ou WebP."); return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Máximo 5MB."); return;
      }
      const path = `${user.id}/logo.${ext}`;
      const { error: uploadError } = await api.storage
        .from("professionals").upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: urlData } = api.storage.from("professionals").getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const updateError = await updateProfessionalRecord(professional.id, { logo_url: publicUrl });
      if (updateError) throw updateError;

      setLogoUrl(publicUrl);
      qc.invalidateQueries({ queryKey: ["professional"] });
      toast.success("Logo atualizada!");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao fazer upload";
      toast.error(message);
    } finally {
      setUploadingLogo(false);
    }
  };

  const removeLogo = async () => {
    if (!professional) return;
    setRemovingLogo(true);
    try {
      const error = await updateProfessionalRecord(professional.id, { logo_url: null });
      if (error) throw error;

      setLogoUrl("");
      qc.invalidateQueries({ queryKey: ["professional"] });
      toast.success("Logo removida");
    } catch {
      toast.error("Erro ao remover logo");
    } finally {
      setRemovingLogo(false);
    }
  };

  const handleSave = async () => {
    if (!professional) return;
    setSaving(true);

    const error = await updateProfessionalRecord(professional.id, {
      business_name: businessName.trim(),
      system_accent_color: accentColor,
      system_sidebar_color: sidebarColor,
      system_sidebar_text_color: sidebarTextColor,
    });

    if (error) {
      toast.error("Erro ao salvar");
    } else {
      applySystemColors(accentColor, sidebarColor, sidebarTextColor);
      toast.success("Aparência atualizada!");
      qc.invalidateQueries({ queryKey: ["professional"] });
    }
    setSaving(false);
  };

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <SectionHeader icon={Palette} title="Aparência do Sistema" />

      {/* Logo & Name */}
      <div className="glass-card rounded-2xl p-6 space-y-5">
        <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
          <Camera size={16} className="text-accent" /> Logo e Nome do Menu
        </h3>
        <div className="flex items-center gap-5">
          <ImageUploadCard
            label="Logo"
            imageUrl={logoUrl}
            uploading={uploadingLogo}
            removing={removingLogo}
            icon={<ImageIcon size={24} className="text-muted-foreground" />}
            onUpload={uploadLogo}
            onRemove={removeLogo}
          />
          <div className="flex-1">
            <Label className="mb-1.5 block">Nome exibido no menu</Label>
            <Input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              maxLength={30}
              placeholder="Nome do seu negócio"
            />
          </div>
        </div>
      </div>

      {/* System Accent Color */}
      <ColorPickerCard
        title="Cor de Destaque (Accent)"
        description="Usada em botões, ícones ativos e destaques do sistema."
        presets={ACCENT_PRESETS}
        value={accentColor}
        onChange={setAccentColor}
      />

      {/* Sidebar Color */}
      <ColorPickerCard
        title="Cor da Sidebar"
        description="Cor de fundo do menu lateral."
        presets={SIDEBAR_PRESETS}
        value={sidebarColor}
        onChange={setSidebarColor}
        showBorder
      />

      {/* Sidebar Text Color */}
      <ColorPickerCard
        title="Cor do Texto da Sidebar"
        description="Cor dos textos e ícones do menu lateral."
        presets={SIDEBAR_TEXT_PRESETS}
        value={sidebarTextColor}
        onChange={setSidebarTextColor}
        showBorder
      />

      {/* Preview */}
      <div className="glass-card rounded-2xl p-6 space-y-3">
        <h3 className="font-semibold text-foreground text-sm">Preview</h3>
        <div className="flex rounded-xl overflow-hidden border border-border/50 h-24">
          <div className="w-16 flex flex-col items-center justify-center gap-2 py-3" style={{ backgroundColor: sidebarColor }}>
            {logoUrl ? (
              <img src={logoUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: accentColor }}>
                {businessName?.[0]?.toUpperCase() || "G"}
              </div>
            )}
            <div className="w-6 h-1 rounded-full" style={{ backgroundColor: accentColor }} />
            <div className="w-6 h-0.5 rounded-full" style={{ backgroundColor: sidebarTextColor, opacity: 0.4 }} />
            <div className="w-6 h-0.5 rounded-full" style={{ backgroundColor: sidebarTextColor, opacity: 0.3 }} />
          </div>
          <div className="flex-1 bg-background p-3 flex flex-col justify-center">
            <div className="h-2 w-20 rounded-full bg-foreground/20 mb-2" />
            <div className="flex gap-2">
              <div className="h-8 w-16 rounded-lg" style={{ backgroundColor: accentColor, opacity: 0.2 }} />
              <div className="h-8 w-16 rounded-lg bg-muted" />
              <div className="h-8 w-16 rounded-lg bg-muted" />
            </div>
          </div>
        </div>
      </div>

      <SaveButton saving={saving} onClick={handleSave} />
    </div>
  );
};

/** Apply system colors as CSS variables on :root */
export function applySystemColors(accent?: string | null, sidebar?: string | null, sidebarText?: string | null) {
  if (!accent && !sidebar && !sidebarText) return;
  const root = document.documentElement;
  if (accent) {
    const hsl = hexToHsl(accent);
    root.style.setProperty("--primary", hsl);
    root.style.setProperty("--accent", hsl);
    root.style.setProperty("--ring", hsl);
    root.style.setProperty("--sidebar-primary", hsl);
    root.style.setProperty("--sidebar-ring", hsl);
  }
  if (sidebar) {
    const hsl = hexToHsl(sidebar);
    root.style.setProperty("--sidebar-background", hsl);
  }
  if (sidebarText) {
    const hsl = hexToHsl(sidebarText);
    root.style.setProperty("--sidebar-foreground", hsl);
  }
}

/* ===================== WORKING HOURS ===================== */
const DEFAULT_HOURS = Array.from({ length: 7 }, (_, i) => ({
  day_of_week: i,
  start_time: "09:00",
  end_time: "18:00",
  is_active: i >= 1 && i <= 5,
}));

const REASON_PRESETS = [
  { label: "Falta", icon: "🚫" },
  { label: "Férias", icon: "🏖️" },
  { label: "Viagem", icon: "✈️" },
  { label: "Consulta médica", icon: "🏥" },
  { label: "Outro", icon: "📝" },
];

const ADVANCE_WEEKS_OPTIONS = [
  { value: "1", label: "1 semana" },
  { value: "2", label: "2 semanas" },
  { value: "3", label: "3 semanas" },
  { value: "4", label: "4 semanas" },
  { value: "6", label: "6 semanas" },
  { value: "8", label: "8 semanas" },
  { value: "custom", label: "Personalizado" },
];

const WorkingHoursSection = () => {
  const { data: hours, isLoading } = useWorkingHours();
  const upsert = useUpsertWorkingHours();
  const { data: blockedTimes, isLoading: blockedLoading } = useBlockedTimes();
  const createBlocked = useCreateBlockedTime();
  const deleteBlocked = useDeleteBlockedTime();
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();

  const [local, setLocal] = useState(DEFAULT_HOURS);
  const [showAddBlocked, setShowAddBlocked] = useState(false);

  const currentWeeks = professional?.booking_advance_weeks ?? 2;
  const isPreset = ADVANCE_WEEKS_OPTIONS.some(o => o.value !== "custom" && Number(o.value) === currentWeeks);
  const [advanceWeeksMode, setAdvanceWeeksMode] = useState<string>(isPreset ? String(currentWeeks) : "custom");
  const [customWeeks, setCustomWeeks] = useState<number>(currentWeeks);

  useEffect(() => {
    const w = professional?.booking_advance_weeks ?? 2;
    const preset = ADVANCE_WEEKS_OPTIONS.some(o => o.value !== "custom" && Number(o.value) === w);
    setAdvanceWeeksMode(preset ? String(w) : "custom");
    setCustomWeeks(w);
  }, [professional]);

  const saveAdvanceWeeks = async (weeks: number) => {
    if (!professional || weeks < 1 || weeks > 52) return;

    const error = await updateProfessionalRecord(professional.id, {
      booking_advance_weeks: weeks,
    });

    if (error) {
      toast.error("Erro ao salvar");
    } else {
      toast.success(`Agenda aberta para ${weeks} semana${weeks > 1 ? "s" : ""}`);
      queryClient.invalidateQueries({ queryKey: ["professional"] });
    }
  };

  // Blocked time form
  const [blockedType, setBlockedType] = useState<"period" | "hours">("period");
  const [blockedStartDate, setBlockedStartDate] = useState("");
  const [blockedEndDate, setBlockedEndDate] = useState("");
  const [blockedDate, setBlockedDate] = useState("");
  const [blockedStartTime, setBlockedStartTime] = useState("09:00");
  const [blockedEndTime, setBlockedEndTime] = useState("18:00");
  const [blockedReason, setBlockedReason] = useState("Falta");

  useEffect(() => {
    if (hours && hours.length > 0) {
      const merged = DEFAULT_HOURS.map((d) => {
        const found = hours.find((h) => h.day_of_week === d.day_of_week);
        return found ? { day_of_week: found.day_of_week, start_time: found.start_time.slice(0, 5), end_time: found.end_time.slice(0, 5), is_active: found.is_active } : d;
      });
      setLocal(merged);
    }
  }, [hours]);

  const toggle = (day: number) => {
    setLocal((prev) => prev.map((h) => h.day_of_week === day ? { ...h, is_active: !h.is_active } : h));
  };

  const update = (day: number, field: "start_time" | "end_time", value: string) => {
    setLocal((prev) => prev.map((h) => h.day_of_week === day ? { ...h, [field]: value } : h));
  };

  const handleSave = () => {
    upsert.mutate(local, {
      onSuccess: () => toast.success("Horários salvos!"),
      onError: () => toast.error("Erro ao salvar horários"),
    });
  };

  const handleAddBlocked = async () => {
    let startTime: string;
    let endTime: string;

    if (blockedType === "period") {
      if (!blockedStartDate || !blockedEndDate) {
        toast.error("Selecione as datas de início e fim");
        return;
      }
      startTime = new Date(`${blockedStartDate}T00:00:00`).toISOString();
      endTime = new Date(`${blockedEndDate}T23:59:59`).toISOString();
    } else {
      if (!blockedDate) {
        toast.error("Selecione a data");
        return;
      }
      startTime = new Date(`${blockedDate}T${blockedStartTime}:00`).toISOString();
      endTime = new Date(`${blockedDate}T${blockedEndTime}:00`).toISOString();
    }

    try {
      await createBlocked.mutateAsync({
        start_time: startTime,
        end_time: endTime,
        reason: blockedReason,
      });
      toast.success("Ausência registrada!");
      setShowAddBlocked(false);
      setBlockedStartDate("");
      setBlockedEndDate("");
      setBlockedDate("");
      setBlockedReason("Falta");
    } catch {
      toast.error("Erro ao registrar ausência");
    }
  };

  const handleDeleteBlocked = async (id: string) => {
    try {
      await deleteBlocked.mutateAsync(id);
      toast.success("Ausência removida");
    } catch {
      toast.error("Erro ao remover");
    }
  };

  if (isLoading || blockedLoading) return <LoadingState />;

  const now = new Date();
  const futureBlocked = (blockedTimes || []).filter(b => new Date(b.end_time) >= now);
  const pastBlocked = (blockedTimes || []).filter(b => new Date(b.end_time) < now);

  return (
    <div className="space-y-6">
      <SectionHeader icon={Clock} title="Horários de Trabalho" />

      {/* Working hours grid */}
      <div className="glass-card rounded-2xl p-6 space-y-3">
        {local.map((h) => (
          <div key={h.day_of_week} className="flex items-center gap-3 py-2">
            <Button
              variant={h.is_active ? "default" : "secondary"}
              size="icon"
              onClick={() => toggle(h.day_of_week)}
              className={cn(
                "w-9 h-9 rounded-xl text-xs font-bold shrink-0",
                h.is_active && "gradient-accent text-accent-foreground"
              )}
            >
              {getDayName(h.day_of_week).slice(0, 3)}
            </Button>
            <span className={cn("text-sm w-20 shrink-0", h.is_active ? "text-foreground font-medium" : "text-muted-foreground")}>
              {getDayName(h.day_of_week)}
            </span>
            {h.is_active ? (
              <div className="flex items-center gap-2">
                <Input type="time" value={h.start_time} onChange={(e) => update(h.day_of_week, "start_time", e.target.value)}
                  className="w-auto px-2 py-1.5 h-9" />
                <span className="text-muted-foreground text-xs">até</span>
                <Input type="time" value={h.end_time} onChange={(e) => update(h.day_of_week, "end_time", e.target.value)}
                  className="w-auto px-2 py-1.5 h-9" />
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Fechado</span>
            )}
          </div>
        ))}
      </div>

      <SaveButton saving={upsert.isPending} onClick={handleSave} />

      {/* Advance weeks */}
      <div className="pt-4">
        <div className="flex items-center gap-2 mb-3">
          <CalendarIcon size={20} className="text-accent" />
          <h2 className="text-lg font-bold text-foreground">Abertura da Agenda</h2>
        </div>
        <div className="glass-card rounded-2xl p-6 space-y-3">
          <p className="text-sm text-muted-foreground">
            Quantas semanas à frente os clientes podem agendar?
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <Select
              value={advanceWeeksMode}
              onValueChange={(val) => {
                setAdvanceWeeksMode(val);
                if (val !== "custom") {
                  const w = Number(val);
                  setCustomWeeks(w);
                  saveAdvanceWeeks(w);
                }
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADVANCE_WEEKS_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {advanceWeeksMode === "custom" && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={52}
                  value={customWeeks}
                  onChange={(e) => setCustomWeeks(Number(e.target.value))}
                  className="w-20 h-9"
                />
                <span className="text-sm text-muted-foreground">semanas</span>
                <Button size="sm" onClick={() => saveAdvanceWeeks(customWeeks)}>
                  <Save size={14} />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Blocked Times / Absences */}
      <div className="pt-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarOff size={20} className="text-accent" />
            <h2 className="text-lg font-bold text-foreground">Ausências</h2>
          </div>
          <Button
            size="sm"
            onClick={() => setShowAddBlocked(true)}
            className="flex items-center gap-1.5"
          >
            <Plus size={14} /> Nova ausência
          </Button>
        </div>

        {futureBlocked.length === 0 ? (
          <div className="glass-card rounded-2xl p-8 text-center">
            <Plane size={32} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma ausência programada</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Registre férias, faltas ou horários indisponíveis</p>
          </div>
        ) : (
          <div className="space-y-2">
            {futureBlocked.map(bt => {
              const start = new Date(bt.start_time);
              const end = new Date(bt.end_time);
              const isFullDay = start.getHours() === 0 && end.getHours() === 23;
              const isSameDate = format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd");
              const isMultiDay = !isSameDate && isFullDay;

              return (
                <motion.div
                  key={bt.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-card rounded-xl p-4 flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                      <CalendarOff size={18} className="text-destructive" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{bt.reason || "Ausência"}</p>
                      <p className="text-xs text-muted-foreground">
                        {isMultiDay ? (
                          `${format(start, "dd/MM/yyyy", { locale: ptBR })} → ${format(end, "dd/MM/yyyy", { locale: ptBR })}`
                        ) : isSameDate && !isFullDay ? (
                          `${format(start, "dd/MM/yyyy", { locale: ptBR })} • ${format(start, "HH:mm")} - ${format(end, "HH:mm")}`
                        ) : (
                          `${format(start, "dd/MM/yyyy", { locale: ptBR })} (dia inteiro)`
                        )}
                      </p>
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover ausência?</AlertDialogTitle>
                        <AlertDialogDescription>
                          A ausência "{bt.reason || "Ausência"}" será removida permanentemente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDeleteBlocked(bt.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Remover
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </motion.div>
              );
            })}
          </div>
        )}

        {pastBlocked.length > 0 && (
          <details className="mt-4">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              {pastBlocked.length} ausência{pastBlocked.length > 1 ? "s" : ""} passada{pastBlocked.length > 1 ? "s" : ""}
            </summary>
            <div className="space-y-1 mt-2 opacity-50">
              {pastBlocked.map(bt => (
                <div key={bt.id} className="flex items-center justify-between glass-card rounded-lg p-3">
                  <div>
                    <p className="text-xs font-medium text-foreground">{bt.reason || "Ausência"}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(bt.start_time), "dd/MM/yyyy")} → {format(new Date(bt.end_time), "dd/MM/yyyy")}
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                        <Trash2 size={12} />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover ausência?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ausência passada será removida permanentemente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDeleteBlocked(bt.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Remover
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Add Blocked Time Dialog */}
      <Dialog open={showAddBlocked} onOpenChange={setShowAddBlocked}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarOff size={18} className="text-primary" />
              Nova Ausência
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Reason presets */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Motivo</Label>
              <div className="flex flex-wrap gap-2">
                {REASON_PRESETS.map(r => (
                  <Button
                    key={r.label}
                    variant={blockedReason === r.label ? "default" : "outline"}
                    size="sm"
                    onClick={() => setBlockedReason(r.label)}
                    className="text-xs"
                  >
                    {r.icon} {r.label}
                  </Button>
                ))}
              </div>
              {blockedReason === "Outro" && (
                <Input
                  placeholder="Descreva o motivo..."
                  className="mt-2"
                  onChange={e => setBlockedReason(e.target.value || "Outro")}
                />
              )}
            </div>

            {/* Type toggle */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Tipo de ausência</Label>
              <div className="flex gap-2">
                <Button
                  variant={blockedType === "period" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setBlockedType("period")}
                  className="flex-1"
                >
                  <CalendarIcon size={13} /> Dia(s) inteiro(s)
                </Button>
                <Button
                  variant={blockedType === "hours" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setBlockedType("hours")}
                  className="flex-1"
                >
                  <Clock size={13} /> Horário específico
                </Button>
              </div>
            </div>

            {blockedType === "period" ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5">Data início</Label>
                  <Input type="date" value={blockedStartDate} onChange={e => setBlockedStartDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5">Data fim</Label>
                  <Input type="date" value={blockedEndDate} onChange={e => setBlockedEndDate(e.target.value)} />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5">Data</Label>
                  <Input type="date" value={blockedDate} onChange={e => setBlockedDate(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5">De</Label>
                    <Input type="time" value={blockedStartTime} onChange={e => setBlockedStartTime(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5">Até</Label>
                    <Input type="time" value={blockedEndTime} onChange={e => setBlockedEndTime(e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            <Button onClick={handleAddBlocked} disabled={createBlocked.isPending} className="w-full">
              {createBlocked.isPending && <Loader2 className="animate-spin mr-2" size={16} />}
              Registrar Ausência
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ===================== SUBSCRIPTION ===================== */
const SubscriptionSection = () => {
  const { data: subscription, isLoading } = useSubscription();
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [loadingCheckout, setLoadingCheckout] = useState<string | null>(null);
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");

  const currentPlan = subscription?.plan_id || "none";
  const normalizedPlan = currentPlan === "free" ? "none" : currentPlan === "starter" ? "essencial" : currentPlan === "pro" ? "enterprise" : currentPlan;

  const handleCheckout = async (priceId: string) => {
    setLoadingCheckout(priceId);
    try {
      const { data, error } = await api.functions.invoke("create-checkout", {
        body: { priceId },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch {
      toast.error("Erro ao iniciar checkout");
    }
    setLoadingCheckout(null);
  };

  const handlePortal = async () => {
    setLoadingPortal(true);
    try {
      const { data, error } = await api.functions.invoke("customer-portal");
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch {
      toast.error("Erro ao abrir portal");
    }
    setLoadingPortal(false);
  };

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <SectionHeader icon={CreditCard} title="Assinatura" />

      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-2">
        <Button
          variant={billing === "monthly" ? "default" : "secondary"}
          size="sm"
          onClick={() => setBilling("monthly")}
          className={cn(billing === "monthly" && "gradient-accent text-accent-foreground")}
        >
          Mensal
        </Button>
        <Button
          variant={billing === "annual" ? "default" : "secondary"}
          size="sm"
          onClick={() => setBilling("annual")}
          className={cn("flex items-center gap-1.5", billing === "annual" && "gradient-accent text-accent-foreground")}
        >
          Anual <span className="text-[9px] bg-accent/20 px-1.5 py-0.5 rounded-full">2 meses grátis</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(Object.entries(STRIPE_PLANS) as [string, typeof STRIPE_PLANS[keyof typeof STRIPE_PLANS]][]).map(([id, plan]) => {
          const isCurrent = id === normalizedPlan;
          const price = billing === "annual" ? plan.priceAnnual : plan.priceMonthly;
          const period = billing === "annual" ? "/ano" : "/mês";
          const priceId = billing === "annual" ? plan.priceIdAnnual : plan.priceId;

          return (
            <div
              key={id}
              className={cn(
                "glass-card rounded-2xl p-5 space-y-4 transition-all",
                isCurrent && "ring-2 ring-accent"
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-foreground">{plan.name}</h3>
                {isCurrent && (
                  <span className="text-[10px] font-bold uppercase bg-accent/10 text-accent px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Crown size={10} /> Atual
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-foreground">{price}<span className="text-xs text-muted-foreground font-normal">{period}</span></p>
              {billing === "annual" && (
                <p className="text-[10px] text-muted-foreground -mt-2">
                  <span className="line-through">{id === "essencial" ? "R$ 598,80" : "R$ 1.198,80"}</span>
                </p>
              )}
              <ul className="space-y-1.5">
                {plan.features.map((f, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <CheckCircle2 size={12} className="text-accent mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              {!isCurrent && priceId && (
                <Button
                  onClick={() => handleCheckout(priceId)}
                  disabled={loadingCheckout === priceId}
                  className="w-full gradient-accent text-accent-foreground hover-lift"
                >
                  {loadingCheckout === priceId ? <Loader2 className="w-4 h-4 animate-spin" /> : "Assinar"}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {normalizedPlan !== "none" && (
        <div className="glass-card rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Gerenciar assinatura</p>
            <p className="text-xs text-muted-foreground">Cancelar, trocar forma de pagamento ou upgrade</p>
          </div>
          <Button
            variant="outline"
            onClick={handlePortal}
            disabled={loadingPortal}
          >
            {loadingPortal ? <Loader2 className="w-4 h-4 animate-spin" /> : "Gerenciar"}
          </Button>
        </div>
      )}
    </div>
  );
};

/* ===================== WHATSAPP ===================== */
const WhatsAppSection = () => {
  const { data: professional } = useProfessional();
  const { data: instance, isLoading, refetch: refetchInstance } = useWhatsAppInstance();
  const { data: automations } = useWhatsAppAutomations();
  const toggleAutomation = useToggleAutomation();
  const [connecting, setConnecting] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  const handleConnect = async () => {
    if (!professional) return;
    setConnecting(true);
    try {
      const instanceName = `gende_${professional.id.slice(0, 8)}`;
      const { data, error } = await api.functions.invoke("whatsapp", {
        body: { action: "create-instance", instanceName, professionalId: professional.id },
      });
      if (error) throw error;

      // Try to get QR from create response first
      const qrFromCreate = data?.qrcode?.base64 || data?.data?.qrcode?.base64;
      if (qrFromCreate) {
        setQrCode(qrFromCreate);
      } else {
        // Fallback: fetch QR separately
        await new Promise(r => setTimeout(r, 2000));
        const { data: qrData } = await api.functions.invoke("whatsapp", {
          body: { action: "get-qrcode", instanceName },
        });
        const qr = qrData?.base64 || qrData?.data?.base64;
        if (qr) setQrCode(qr);
        else toast.info("QR Code será gerado em instantes. Clique em 'Verificar Status'.");
      }
      refetchInstance();
    } catch (e: any) {
      console.error("WhatsApp connect error:", e);
      toast.error("Erro ao conectar instância: " + (e?.message || "tente novamente"));
    }
    setConnecting(false);
  };

  const handleCheckStatus = async () => {
    if (!instance?.instance_name || !professional) return;
    setCheckingStatus(true);
    try {
      const { data } = await api.functions.invoke("whatsapp", {
        body: { action: "check-status", instanceName: instance.instance_name, professionalId: professional.id },
      });
      if (data?.instance?.state === "open") {
        toast.success("WhatsApp conectado!");
        setQrCode(null);
      } else {
        toast.info("Ainda não conectado. Escaneie o QR Code.");
      }
      refetchInstance();
    } catch {
      toast.error("Erro ao verificar status");
    }
    setCheckingStatus(false);
  };

  if (isLoading) return <LoadingState />;

  const isConnected = instance?.status === "connected";

  return (
    <div className="space-y-6">
      <SectionHeader icon={MessageSquare} title="Automação WhatsApp" />

      {/* Connection */}
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("w-3 h-3 rounded-full", isConnected ? "bg-green-500" : "bg-red-400")} />
            <div>
              <p className="font-semibold text-foreground text-sm">
                {isConnected ? "Conectado" : "Desconectado"}
              </p>
              {instance?.phone_number && (
                <p className="text-xs text-muted-foreground">{instance.phone_number}</p>
              )}
            </div>
          </div>

          {!isConnected && (
            <Button
              onClick={handleConnect}
              disabled={connecting}
              className="gradient-accent text-accent-foreground hover-lift"
              size="sm"
            >
              {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><QrCode size={14} /> Conectar</>}
            </Button>
          )}
        </div>

        {/* QR Code */}
        {(qrCode || instance?.qr_code) && !isConnected && (
          <div className="space-y-3">
            <div className="flex justify-center">
              <div className="bg-white p-4 rounded-2xl shadow-lg">
                <img
                  src={qrCode || instance?.qr_code || ""}
                  alt="QR Code WhatsApp"
                  className="w-56 h-56 object-contain"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Abra o WhatsApp &gt; Dispositivos conectados &gt; Conectar dispositivo
            </p>
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckStatus}
                disabled={checkingStatus}
              >
                {checkingStatus ? <Loader2 className="w-3 h-3 animate-spin" /> : <Power size={12} />}
                Verificar conexão
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Automations */}
      {automations && automations.length > 0 && (
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <h3 className="font-semibold text-foreground text-sm">Automações</h3>
          <div className="space-y-3">
            {automations.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{TRIGGER_LABELS[a.trigger_type] || a.trigger_type}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">{a.message_template}</p>
                </div>
                <Switch
                  checked={a.is_active}
                  onCheckedChange={() => toggleAutomation.mutate({ id: a.id, is_active: !a.is_active })}
                />
              </div>
            ))}
          </div>

          {!isConnected && (
            <div className="flex items-start gap-2 bg-warning/10 rounded-xl p-3">
              <AlertTriangle size={14} className="text-warning mt-0.5 shrink-0" />
              <p className="text-xs text-warning">Conecte o WhatsApp acima para ativar as automações.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ===================== SECURITY ===================== */
const SecuritySection = () => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("A nova senha deve ter pelo menos 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }

    setSaving(true);
    const { error } = await api.auth.updateUser({ password: newPassword });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Senha alterada com sucesso!");
      setNewPassword("");
      setConfirmPassword("");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <SectionHeader icon={Shield} title="Segurança" />

      <form onSubmit={handleChangePassword} className="glass-card rounded-2xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground text-sm">Alterar senha</h3>

        <div>
          <Label className="mb-1.5 block">Nova senha</Label>
          <Input
            type={showPasswords ? "text" : "password"}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={6}
            maxLength={72}
          />
        </div>
        <div>
          <Label className="mb-1.5 block">Confirmar nova senha</Label>
          <Input
            type={showPasswords ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={6}
            maxLength={72}
          />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowPasswords(!showPasswords)}
          className="text-xs text-muted-foreground"
        >
          {showPasswords ? <EyeOff size={12} /> : <Eye size={12} />}
          {showPasswords ? "Ocultar senhas" : "Mostrar senhas"}
        </Button>

        <Button
          type="submit"
          disabled={saving || !newPassword || !confirmPassword}
          className="w-full gradient-accent text-accent-foreground hover-lift"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save size={16} /> Alterar senha</>}
        </Button>
      </form>
    </div>
  );
};

/* ===================== SHARED COMPONENTS ===================== */
const SectionHeader = ({ icon: Icon, title }: { icon: LucideIcon; title: string }) => (
  <div className="flex items-center gap-2 mb-2">
    <Icon size={20} className="text-accent" />
    <h2 className="text-lg font-bold text-foreground">{title}</h2>
  </div>
);

const LoadingState = () => (
  <div className="flex items-center justify-center py-16">
    <Loader2 className="w-6 h-6 animate-spin text-accent" />
  </div>
);

const SaveButton = ({ saving, onClick }: { saving: boolean; onClick: () => void }) => (
  <Button
    onClick={onClick}
    disabled={saving}
    className="w-full gradient-accent text-accent-foreground hover-lift"
  >
    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save size={16} /> Salvar alterações</>}
  </Button>
);

const ColorPickerCard = ({
  title, description, presets, value, onChange, showBorder,
}: {
  title: string; description: string; presets: string[];
  value: string; onChange: (v: string) => void; showBorder?: boolean;
}) => (
  <div className="glass-card rounded-2xl p-6 space-y-4">
    <div className="flex items-center gap-2">
      <Palette size={18} className="text-accent" />
      <h3 className="font-semibold text-foreground">{title}</h3>
    </div>
    <p className="text-xs text-muted-foreground">{description}</p>
    <div className="flex flex-wrap gap-3">
      {presets.map((c) => (
        <Button
          key={c}
          variant="ghost"
          size="icon"
          onClick={() => onChange(c)}
          className={cn(
            "w-9 h-9 rounded-xl transition-all p-0",
            value === c ? "ring-2 ring-offset-2 ring-accent scale-110" : "hover:scale-105",
            showBorder && "border border-border/30"
          )}
          style={{ backgroundColor: c }}
        />
      ))}
      <label className="w-9 h-9 rounded-xl border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-accent transition-colors overflow-hidden relative">
        <Palette size={14} className="text-muted-foreground" />
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
      </label>
    </div>
    <div className="flex items-center gap-3">
      <div className={cn("w-10 h-10 rounded-xl", showBorder && "border border-border/30")} style={{ backgroundColor: value }} />
      <span className="text-sm text-muted-foreground font-mono">{value}</span>
    </div>
  </div>
);

const ImageUploadCard = ({
  label, imageUrl, uploading, removing, icon, onUpload, onRemove, rounded,
}: {
  label: string; imageUrl: string; uploading: boolean; removing?: boolean;
  icon: React.ReactNode; onUpload: (f: File) => void; onRemove: () => void;
  rounded?: boolean;
}) => (
  <div className="flex flex-col items-center gap-2">
    <div className={cn(
      "w-24 h-24 relative group overflow-hidden border-2 border-dashed border-border bg-muted/30 flex items-center justify-center",
      rounded ? "rounded-full" : "rounded-2xl"
    )}>
      {imageUrl ? (
        <>
          <img src={imageUrl} alt={label} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <label className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 cursor-pointer transition-colors">
              <Camera size={14} className="text-white" />
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
            </label>
            <Button
              variant="ghost"
              size="icon"
              onClick={onRemove}
              disabled={removing}
              className="p-1.5 h-auto w-auto rounded-full bg-white/20 hover:bg-white/30"
            >
              {removing ? <Loader2 size={14} className="text-white animate-spin" /> : <X size={14} className="text-white" />}
            </Button>
          </div>
        </>
      ) : (
        <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
          {uploading ? <Loader2 size={20} className="animate-spin text-accent" /> : icon}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
        </label>
      )}
    </div>
    <span className="text-xs text-muted-foreground">{label}</span>
  </div>
);

/* ===================== PAYMENT SECTION ===================== */
const PaymentSection = () => {
  const { data: config, isLoading } = usePaymentConfig();
  const saveConfig = useSavePaymentConfig();

  const [form, setForm] = useState({
    pix_key_type: "cpf" as string,
    pix_key: "",
    pix_beneficiary_name: "",
    signal_enabled: false,
    signal_type: "percentage" as "percentage" | "fixed",
    signal_value: 0,
    accept_pix: true,
    accept_cash: true,
    accept_card: true,
  });

  useEffect(() => {
    if (config) {
      setForm({
        pix_key_type: config.pix_key_type || "cpf",
        pix_key: config.pix_key || "",
        pix_beneficiary_name: config.pix_beneficiary_name || "",
        signal_enabled: config.signal_enabled,
        signal_type: config.signal_type,
        signal_value: config.signal_value,
        accept_pix: config.accept_pix,
        accept_cash: config.accept_cash,
        accept_card: config.accept_card,
      });
    }
  }, [config]);

  const pixKeyLabels: Record<string, string> = {
    cpf: "CPF", cnpj: "CNPJ", email: "Email", phone: "Telefone", random: "Chave aleatória",
  };

  const handleSubmit = async () => {
    if (form.accept_pix && !form.pix_key.trim()) {
      return toast.error("Informe a chave PIX para aceitar pagamentos via PIX");
    }
    await saveConfig.mutateAsync(form);
  };

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <SectionHeader icon={QrCode} title="Pagamentos" />

      {/* Métodos aceitos */}
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
          <CreditCard size={16} className="text-accent" /> Métodos de Pagamento Aceitos
        </h3>
        <div className="space-y-3">
          {[
            { icon: QrCode, label: "PIX", key: "accept_pix" as const },
            { icon: CreditCard, label: "Cartão", key: "accept_card" as const },
          ].map((m) => (
            <div key={m.key} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <m.icon size={18} className="text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{m.label}</span>
              </div>
              <Switch checked={form[m.key]} onCheckedChange={(v) => setForm({ ...form, [m.key]: v })} />
            </div>
          ))}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CreditCard size={18} className="text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Dinheiro</span>
            </div>
            <Switch checked={form.accept_cash} onCheckedChange={(v) => setForm({ ...form, accept_cash: v })} />
          </div>
        </div>
      </div>

      {/* Dados PIX */}
      {form.accept_pix && (
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
            <QrCode size={16} className="text-accent" /> Dados do PIX
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Tipo de chave</Label>
              <Select value={form.pix_key_type} onValueChange={(v) => setForm({ ...form, pix_key_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(pixKeyLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Chave PIX</Label>
              <Input value={form.pix_key} onChange={(e) => setForm({ ...form, pix_key: e.target.value })} placeholder={`Sua chave ${pixKeyLabels[form.pix_key_type]}`} />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Nome do beneficiário</Label>
            <Input value={form.pix_beneficiary_name} onChange={(e) => setForm({ ...form, pix_beneficiary_name: e.target.value })} placeholder="Nome que aparece no PIX" />
          </div>
        </div>
      )}

      {/* Sinal/Entrada */}
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground text-sm">Cobrança de Sinal (Entrada)</h3>
          <Switch checked={form.signal_enabled} onCheckedChange={(v) => setForm({ ...form, signal_enabled: v })} />
        </div>
        <p className="text-xs text-muted-foreground">Exija um pagamento antecipado para confirmar o agendamento na página pública.</p>
        {form.signal_enabled && (
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="space-y-2">
              <Label className="text-sm">Tipo</Label>
              <Select value={form.signal_type} onValueChange={(v) => setForm({ ...form, signal_type: v as "percentage" | "fixed" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentual (%)</SelectItem>
                  <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Valor do sinal</Label>
              <Input type="number" step="0.01" min={0} max={form.signal_type === "percentage" ? 100 : undefined} value={form.signal_value} onChange={(e) => setForm({ ...form, signal_value: Number(e.target.value) })} />
            </div>
          </div>
        )}
      </div>

      <SaveButton saving={saveConfig.isPending} onClick={handleSubmit} />
    </div>
  );
};

export default Settings;
