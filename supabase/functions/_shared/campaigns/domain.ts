import type {
  AudiencePreviewRecipient,
  CampaignAudienceType,
  CampaignObjective,
  LisOpportunitySeed,
  MessagePreviewInput,
  MessagePreviewResult,
  OpportunityUrgency,
} from "./types.ts";

const PLACEHOLDER_PATTERN = /\{([a-zA-Z0-9_]+)\}/g;

const OBJECTIVE_BASE_RATES: Record<CampaignObjective, number> = {
  reativacao: 0.1,
  promocao: 0.09,
  preenchimento_agenda: 0.12,
  novidade: 0.05,
  aniversario: 0.14,
  manutencao: 0.16,
  upsell: 0.08,
  outro: 0.06,
};

const AUDIENCE_RATE_BONUS: Partial<Record<CampaignAudienceType, number>> = {
  inativos: 0.01,
  vip: 0.03,
  aniversario: 0.05,
  janela_manutencao: 0.04,
  oportunidade_agenda: 0.04,
  upsell: 0.02,
};

export function normalizePhone(phone: string | null | undefined): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits;
}

export function isValidCampaignPhone(phone: string | null | undefined): boolean {
  return /^55\d{10,11}$/.test(normalizePhone(phone));
}

export function extractPlaceholders(message: string): string[] {
  return Array.from(new Set([...message.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1])));
}

export function renderMessageTemplate(
  message: string,
  sample: Record<string, unknown>,
  ctaType?: string,
  ctaPayload?: Record<string, unknown>,
): string {
  const variables = {
    nome: sample.clientName || sample.nome || "Cliente",
    servico: sample.topServiceName || sample.servico || "seu atendimento",
    profissional: sample.preferredEmployeeName || sample.profissional || "nossa equipe",
    cupom: sample.cupom || ctaPayload?.couponCode || "",
    link_agendamento: sample.link_agendamento || ctaPayload?.bookingLink || ctaPayload?.url || "",
    janela_envio: sample.janela_envio || ctaPayload?.timeLabel || "",
    servico_extra: sample.servico_extra || "",
    ticket_medio: sample.ticket_medio || "",
  } as Record<string, unknown>;

  const rendered = message.replaceAll(PLACEHOLDER_PATTERN, (_, token: string) => {
    const value = variables[token];
    return typeof value === "string" || typeof value === "number" ? String(value) : "";
  }).trim();

  if (ctaType === "coupon" && ctaPayload?.couponCode && !rendered.includes(String(ctaPayload.couponCode))) {
    return `${rendered}\n\nCupom: ${ctaPayload.couponCode}`.trim();
  }

  if (ctaType === "link" && ctaPayload?.url && !rendered.includes(String(ctaPayload.url))) {
    return `${rendered}\n\n${ctaPayload.url}`.trim();
  }

  if (ctaType === "booking_link" && ctaPayload?.bookingLink && !rendered.includes(String(ctaPayload.bookingLink))) {
    return `${rendered}\n\n${ctaPayload.bookingLink}`.trim();
  }

  return rendered;
}

export function previewMessage(input: MessagePreviewInput): MessagePreviewResult {
  const placeholders = extractPlaceholders(input.messageBody);
  const renderedMessage = renderMessageTemplate(
    input.messageBody,
    input.sampleRecipient || {},
    input.ctaType,
    input.ctaPayload,
  );
  const missingPlaceholders = placeholders.filter((placeholder) => {
    const rendered = renderMessageTemplate(`{${placeholder}}`, input.sampleRecipient || {}, input.ctaType, input.ctaPayload);
    return rendered === "";
  });

  let recommendation: string | null = null;
  if (renderedMessage.length > 550) {
    recommendation = "Mensagem longa. Considere reduzir para aumentar leitura e resposta.";
  } else if (!renderedMessage.includes("http") && input.ctaType === "booking_link") {
    recommendation = "Inclua um link de agendamento para melhorar a conversão.";
  }

  return {
    renderedMessage,
    placeholders,
    missingPlaceholders,
    characterCount: renderedMessage.length,
    recommendation,
  };
}

export function estimateCampaignPerformance(params: {
  objective: CampaignObjective;
  audienceType: CampaignAudienceType;
  audienceCount: number;
  averageTicket: number;
  returnRate?: number;
}): {
  estimatedConversionRate: number;
  estimatedBookings: number;
  estimatedRevenue: number;
} {
  const baseRate = OBJECTIVE_BASE_RATES[params.objective] ?? OBJECTIVE_BASE_RATES.outro;
  const audienceBonus = AUDIENCE_RATE_BONUS[params.audienceType] ?? 0;
  const returnRateComponent = Math.min((params.returnRate ?? 0.18) * 0.25, 0.06);
  const ticketComponent = params.averageTicket > 180 ? 0.015 : params.averageTicket > 100 ? 0.008 : 0;
  const estimatedConversionRate = Number(
    Math.min(baseRate + audienceBonus + returnRateComponent + ticketComponent, 0.32).toFixed(4),
  );
  const estimatedBookings = Number((params.audienceCount * estimatedConversionRate).toFixed(1));
  const estimatedRevenue = Number((estimatedBookings * Math.max(params.averageTicket, 60)).toFixed(2));

  return {
    estimatedConversionRate,
    estimatedBookings,
    estimatedRevenue,
  };
}

export function calculateUrgencyLevel(params: {
  expiresAt?: string | null;
  estimatedRevenue: number;
  audienceCount: number;
}): OpportunityUrgency {
  if (params.expiresAt) {
    const diffHours = (new Date(params.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60);
    if (diffHours <= 36) return "high";
  }

  if (params.estimatedRevenue >= 1500 || params.audienceCount >= 40) return "high";
  if (params.estimatedRevenue >= 500 || params.audienceCount >= 15) return "medium";
  return "low";
}

export function buildOpportunitySummary(seed: Pick<LisOpportunitySeed, "audience_count" | "estimated_revenue" | "estimated_bookings">): string {
  return `${seed.audience_count} clientes elegíveis, ${seed.estimated_bookings.toFixed(0)} agendamentos estimados e até R$ ${seed.estimated_revenue.toFixed(0)} de potencial.`;
}

export function buildOpportunityReason(parts: string[]): string {
  return parts.filter(Boolean).join(" ");
}

export function buildOpportunityWhatsappNotification(input: {
  professionalName: string;
  opportunity: LisOpportunitySeed;
  appBaseUrl: string;
}): string {
  return [
    `Lis encontrou uma oportunidade de faturamento para ${input.professionalName}.`,
    "",
    `• ${input.opportunity.title}`,
    `• Público estimado: ${input.opportunity.audience_count} clientes`,
    `• Conversão estimada: ${(input.opportunity.estimated_conversion_rate * 100).toFixed(0)}%`,
    `• Potencial: R$ ${input.opportunity.estimated_revenue.toFixed(0)}`,
    "",
    input.opportunity.summary,
    "",
    `Abra o Radar da Lis: ${input.appBaseUrl.replace(/\/$/, "")}/campaigns`,
  ].join("\n");
}

export function buildOpportunityDedupeKey(type: string, suffix: string): string {
  return `${type}:${suffix}`.toLowerCase();
}

export function extractProviderMessageId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;

  const direct =
    record.messageId ||
    record.id ||
    record.key ||
    record.message_id ||
    record.msgId;

  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const firstMessage = Array.isArray(record.messages) ? record.messages[0] : null;
  if (firstMessage && typeof firstMessage === "object" && typeof (firstMessage as Record<string, unknown>).id === "string") {
    return String((firstMessage as Record<string, unknown>).id);
  }

  const keyRecord = typeof record.key === "object" && record.key ? record.key as Record<string, unknown> : null;
  if (keyRecord && typeof keyRecord.id === "string") return keyRecord.id;

  const dataRecord = typeof record.data === "object" && record.data ? record.data as Record<string, unknown> : null;
  if (dataRecord) {
    const nested = extractProviderMessageId(dataRecord);
    if (nested) return nested;
  }

  return null;
}

export function computeBackoffDelayMs(attemptCount: number): number {
  const base = Math.max(attemptCount, 1);
  return Math.min(60 * 60 * 1000, 15_000 * 2 ** (base - 1));
}

export function isRetryableDeliveryFailure(input: {
  responseStatus?: number | null;
  errorMessage?: string | null;
}) {
  const status = Number(input.responseStatus || 0);
  const message = String(input.errorMessage || "").toLowerCase();

  if ([408, 409, 425, 429].includes(status) || status >= 500) return true;
  return ["timeout", "temporar", "rate limit", "too many", "throttle", "network"].some((fragment) => message.includes(fragment));
}

const OPTOUT_PATTERNS = [
  "stop",
  "parar",
  "pare",
  "sair",
  "cancelar",
  "nao quero",
  "não quero",
  "remover",
  "unsubscribe",
];

export function isOptOutMessage(text: string | null | undefined) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return false;
  return OPTOUT_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function buildSampleRecipient(recipient?: Partial<AudiencePreviewRecipient>): Record<string, unknown> {
  return {
    clientName: recipient?.clientName || "Marina",
    nome: recipient?.clientName || "Marina",
    topServiceName: recipient?.topServiceName || "hidratação",
    servico: recipient?.topServiceName || "hidratação",
    preferredEmployeeName: recipient?.preferredEmployeeName || "Ana",
    profissional: recipient?.preferredEmployeeName || "Ana",
    link_agendamento: "https://gende.io/seu-negocio",
    janela_envio: "amanhã às 15h",
    servico_extra: "corte terapêutico",
  };
}
