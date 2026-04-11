export type CampaignObjective =
  | "reativacao"
  | "promocao"
  | "preenchimento_agenda"
  | "novidade"
  | "aniversario"
  | "manutencao"
  | "upsell"
  | "outro";

export type CampaignType = "manual" | "suggested" | "automated";

export type CampaignAudienceType =
  | "todos"
  | "inativos"
  | "recentes"
  | "vip"
  | "novos"
  | "aniversario"
  | "servico_especifico"
  | "sem_retorno_pos_servico"
  | "janela_manutencao"
  | "cancelou_sem_reagendar"
  | "no_show"
  | "profissional_preferido"
  | "ticket_medio"
  | "frequencia"
  | "ultima_visita"
  | "tags"
  | "canal_origem"
  | "consentimento"
  | "oportunidade_agenda"
  | "upsell"
  | "customizado";

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "processing"
  | "sent"
  | "paused"
  | "cancelled"
  | "completed"
  | "failed";

export type OpportunityStatus =
  | "new"
  | "notified"
  | "viewed"
  | "dismissed"
  | "converted_to_campaign"
  | "expired";

export type OpportunityUrgency = "low" | "medium" | "high";

export type CampaignAudienceFilters = {
  audienceType: CampaignAudienceType;
  inactiveDays?: number;
  recentDays?: number;
  newClientDays?: number;
  vipMinTicket?: number;
  birthdayWindowDays?: number;
  maintenanceWindowDays?: number;
  preferredEmployeeId?: string | null;
  serviceIds?: string[];
  tagIds?: string[];
  originChannels?: string[];
  ticketMin?: number | null;
  ticketMax?: number | null;
  minVisits?: number | null;
  maxVisits?: number | null;
  lastVisitFrom?: string | null;
  lastVisitTo?: string | null;
  consentOnly?: boolean;
  selectedClientIds?: string[];
  turn?: "manha" | "tarde" | "noite" | null;
  opportunityDate?: string | null;
  minAvailableSlots?: number | null;
};

export type AudiencePreviewRecipient = {
  clientId: string;
  clientName: string;
  phone: string;
  normalizedPhone: string;
  lastVisitAt: string | null;
  averageTicket: number;
  completedVisits: number;
  daysSinceLastVisit: number | null;
  preferredEmployeeId: string | null;
  preferredEmployeeName: string | null;
  topServiceName: string | null;
  tags: string[];
  sourceChannel: string | null;
};

export type AudiencePreviewResult = {
  audienceCount: number;
  eligibleCount: number;
  excludedCount: number;
  excludedReasons: Record<string, number>;
  averageTicket: number;
  averageReturnIntervalDays: number | null;
  estimatedReturnRate: number;
  estimatedConversionRate: number;
  estimatedBookings: number;
  estimatedRevenue: number;
  recipients: AudiencePreviewRecipient[];
};

export type MessagePreviewInput = {
  messageBody: string;
  ctaType: string;
  ctaPayload?: Record<string, unknown>;
  sampleRecipient?: Partial<AudiencePreviewRecipient> & Record<string, unknown>;
};

export type MessagePreviewResult = {
  renderedMessage: string;
  placeholders: string[];
  missingPlaceholders: string[];
  characterCount: number;
  recommendation: string | null;
};

export type LisOpportunityPayload = {
  opportunity_id: string;
  type: string;
  title: string;
  summary: string;
  reason: string;
  urgency_level: OpportunityUrgency;
  confidence_score: number;
  audience_count: number;
  estimated_conversion_rate: number;
  estimated_bookings: number;
  estimated_revenue: number;
  suggested_campaign_objective: CampaignObjective;
  suggested_message: string;
  suggested_cta: string;
  suggested_send_time: string | null;
  suggested_audience_json: Record<string, unknown>;
  expires_at: string | null;
};

export type LisOpportunitySeed = Omit<LisOpportunityPayload, "opportunity_id"> & {
  dedupeKey: string;
  source_metrics_json?: Record<string, unknown>;
};

export type CampaignDraftInput = {
  id?: string;
  professionalId: string;
  sourceOpportunityId?: string | null;
  name: string;
  type: CampaignType;
  objective: CampaignObjective;
  audienceType: CampaignAudienceType;
  audienceFilterJson: CampaignAudienceFilters;
  audienceEstimateJson: Record<string, unknown>;
  messageMode: "template" | "freeform" | "hybrid";
  templateId?: string | null;
  templateName?: string | null;
  messageBody: string;
  ctaType: "none" | "whatsapp_reply" | "link" | "booking_link" | "coupon";
  ctaPayloadJson: Record<string, unknown>;
  sendConfigJson: Record<string, unknown>;
  scheduledAt?: string | null;
  createdBy?: string | null;
};

export type CampaignTemplateRecord = {
  id: string;
  professional_id: string | null;
  name: string;
  category: string;
  objective: string;
  body: string;
  variables_json: unknown;
  tone: string;
  is_ai_generated: boolean;
  is_active: boolean;
  is_system_template: boolean;
  preview_example_json: unknown;
  created_at: string;
  updated_at: string;
};

export type CampaignAutomationRecord = {
  id: string;
  professional_id: string;
  name: string;
  trigger_type: string;
  rules_json: Record<string, unknown>;
  objective: CampaignObjective;
  audience_type: CampaignAudienceType;
  audience_filter_json: Record<string, unknown>;
  template_id: string | null;
  message_body: string;
  cooldown_days: number;
  is_active: boolean;
  auto_start: boolean;
  send_config_json: Record<string, unknown>;
  last_result_json: Record<string, unknown>;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignAutomationRunRecord = {
  id: string;
  professional_id: string;
  automation_id: string;
  status: string;
  campaign_id: string | null;
  audience_count: number;
  created_campaign: boolean;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  result_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
