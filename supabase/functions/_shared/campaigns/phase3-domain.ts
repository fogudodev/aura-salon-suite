import type {
  CampaignAudienceFilters,
  CampaignAudienceType,
  CampaignObjective,
} from "./types.ts";

type AutomationRuleShape = Record<string, unknown>;
type AutomationSkipReason = "inactive" | "cooldown_active";

function tomorrowDateISO() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function resolveAutomationConfig(triggerType: string, rules: AutomationRuleShape) {
  switch (triggerType) {
    case "inactive_clients":
      return {
        objective: "reativacao" as CampaignObjective,
        audienceType: "inativos" as CampaignAudienceType,
        audienceFilterJson: {
          audienceType: "inativos",
          inactiveDays: Number(rules.inactiveDays || 45),
          consentOnly: true,
        } satisfies CampaignAudienceFilters,
      };
    case "idle_slots":
      return {
        objective: "preenchimento_agenda" as CampaignObjective,
        audienceType: "oportunidade_agenda" as CampaignAudienceType,
        audienceFilterJson: {
          audienceType: "oportunidade_agenda",
          turn: typeof rules.turn === "string" && rules.turn ? rules.turn : null,
          opportunityDate: String(rules.opportunityDate || tomorrowDateISO()),
          recentDays: Number(rules.recentDays || 120),
          minAvailableSlots: Number(rules.minAvailableSlots || 3),
          consentOnly: true,
        } satisfies CampaignAudienceFilters,
      };
    case "maintenance_window":
      return {
        objective: "manutencao" as CampaignObjective,
        audienceType: "janela_manutencao" as CampaignAudienceType,
        audienceFilterJson: {
          audienceType: "janela_manutencao",
          maintenanceWindowDays: Number(rules.maintenanceWindowDays || 7),
          consentOnly: true,
        } satisfies CampaignAudienceFilters,
      };
    case "birthday":
      return {
        objective: "aniversario" as CampaignObjective,
        audienceType: "aniversario" as CampaignAudienceType,
        audienceFilterJson: {
          audienceType: "aniversario",
          birthdayWindowDays: Number(rules.birthdayWindowDays || 7),
          consentOnly: true,
        } satisfies CampaignAudienceFilters,
      };
    case "post_cancellation":
      return {
        objective: "reativacao" as CampaignObjective,
        audienceType: "cancelou_sem_reagendar" as CampaignAudienceType,
        audienceFilterJson: {
          audienceType: "cancelou_sem_reagendar",
          consentOnly: true,
        } satisfies CampaignAudienceFilters,
      };
    case "no_show_recovery":
      return {
        objective: "reativacao" as CampaignObjective,
        audienceType: "no_show" as CampaignAudienceType,
        audienceFilterJson: {
          audienceType: "no_show",
          consentOnly: true,
        } satisfies CampaignAudienceFilters,
      };
    case "vip_reengagement":
      return {
        objective: "upsell" as CampaignObjective,
        audienceType: "vip" as CampaignAudienceType,
        audienceFilterJson: {
          audienceType: "vip",
          vipMinTicket: Number(rules.vipMinTicket || 220),
          consentOnly: true,
        } satisfies CampaignAudienceFilters,
      };
    case "service_drop":
      return {
        objective: "promocao" as CampaignObjective,
        audienceType: "servico_especifico" as CampaignAudienceType,
        audienceFilterJson: {
          audienceType: "servico_especifico",
          serviceIds: Array.isArray(rules.serviceIds) ? rules.serviceIds : [],
          consentOnly: true,
        } satisfies CampaignAudienceFilters,
      };
    default:
      return {
        objective: "outro" as CampaignObjective,
        audienceType: "customizado" as CampaignAudienceType,
        audienceFilterJson: {
          audienceType: "customizado",
          consentOnly: true,
        } satisfies CampaignAudienceFilters,
      };
  }
}

export function shouldSkipAutomationRun(params: {
  isActive: boolean;
  force?: boolean;
  lastRunAt?: string | null;
  cooldownDays?: number | null;
  nowMs?: number;
}): { skip: boolean; reason: AutomationSkipReason | null; cooldownUntil?: string } {
  const nowMs = Number(params.nowMs || Date.now());
  if (!params.force && !params.isActive) {
    return { skip: true, reason: "inactive" };
  }
  const cooldownDays = Number(params.cooldownDays || 0);
  if (!params.force && params.lastRunAt && cooldownDays > 0) {
    const cooldownUntilMs = new Date(params.lastRunAt).getTime() + cooldownDays * 24 * 60 * 60 * 1000;
    if (cooldownUntilMs > nowMs) {
      return {
        skip: true,
        reason: "cooldown_active",
        cooldownUntil: new Date(cooldownUntilMs).toISOString(),
      };
    }
  }
  return { skip: false, reason: null };
}

export function shouldAutoStartAutomation(params: {
  autoStart: boolean;
}) {
  return Boolean(params.autoStart);
}

export type AttributionRecipientSignal = {
  sent_at: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
  replied_at?: string | null;
  clicked_at?: string | null;
};

export function scoreAttributionCandidate(input: {
  recipient: AttributionRecipientSignal;
  bookingReference: number;
}) {
  const sentAt = new Date(String(input.recipient.sent_at || "")).getTime();
  const hoursToBooking = Math.max((input.bookingReference - sentAt) / (1000 * 60 * 60), 0);
  const touchSignal = input.recipient.replied_at
    ? "reply"
    : input.recipient.clicked_at
      ? "click"
      : input.recipient.read_at
        ? "read"
        : input.recipient.delivered_at
          ? "delivery"
          : "window";
  const base =
    touchSignal === "reply" ? 0.95 :
    touchSignal === "click" ? 0.86 :
    touchSignal === "read" ? 0.72 :
    touchSignal === "delivery" ? 0.6 :
    0.52;
  const recencyBonus =
    hoursToBooking <= 24 ? 0.08 :
    hoursToBooking <= 72 ? 0.05 :
    hoursToBooking <= 168 ? 0.02 :
    -0.03;
  const score = Number(Math.max(0.3, Math.min(base + recencyBonus, 0.99)).toFixed(4));
  const attributionType =
    touchSignal === "reply" ? "reply_window" :
    touchSignal === "click" ? "click_window" :
    touchSignal === "read" ? "read_window" :
    touchSignal === "delivery" ? "delivery_window" :
    "window";
  return {
    score,
    touchSignal,
    hoursToBooking: Number(hoursToBooking.toFixed(2)),
    attributionType,
  };
}

export function shouldReassignAttribution(params: {
  existingCampaignId: string | null;
  newCampaignId: string;
  existingScore: number;
  newScore: number;
  threshold?: number;
}) {
  const threshold = Number(params.threshold ?? 0.02);
  if (!params.existingCampaignId) return true;
  if (params.existingCampaignId === params.newCampaignId) return true;
  return params.newScore > params.existingScore + threshold;
}
