export type CampaignObjective =
  | "reativacao"
  | "promocao"
  | "preenchimento_agenda"
  | "novidade"
  | "aniversario"
  | "manutencao"
  | "upsell"
  | "outro";

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

export type CampaignWizardForm = {
  id?: string;
  sourceOpportunityId?: string | null;
  name: string;
  type: "manual" | "suggested" | "automated";
  objective: CampaignObjective;
  audienceType: CampaignAudienceType;
  audienceFilterJson: Record<string, unknown>;
  audienceEstimateJson?: Record<string, unknown>;
  messageMode: "template" | "freeform" | "hybrid";
  templateId?: string | null;
  templateName?: string | null;
  messageBody: string;
  ctaType: "none" | "whatsapp_reply" | "link" | "booking_link" | "coupon";
  ctaPayloadJson: Record<string, unknown>;
  sendConfigJson: Record<string, unknown>;
  scheduledAt?: string | null;
};

export type CampaignTemplate = {
  id: string;
  professional_id: string | null;
  name: string;
  category: string;
  objective: string;
  body: string;
  variables_json: string[];
  tone: string;
  is_ai_generated: boolean;
  is_active: boolean;
  is_system_template: boolean;
  preview_example_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CampaignAudiencePreview = {
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
  recipients: Array<{
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
  }>;
};

export type MessagePreview = {
  renderedMessage: string;
  placeholders: string[];
  missingPlaceholders: string[];
  characterCount: number;
  recommendation: string | null;
};

export type LisOpportunity = {
  id: string;
  type: string;
  title: string;
  summary: string;
  reason: string;
  urgency_level: "low" | "medium" | "high";
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
  source_metrics_json: Record<string, unknown>;
  status: "new" | "notified" | "viewed" | "dismissed" | "converted_to_campaign" | "expired";
  snoozed_until: string | null;
  expires_at: string | null;
  converted_campaign_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignSummary = {
  id: string;
  name: string;
  type: string;
  objective: string;
  audience_type: string;
  audience_filter_json: Record<string, unknown>;
  audience_estimate_json: Record<string, unknown>;
  message_mode: string;
  template_id: string | null;
  template_name: string | null;
  message_body: string;
  cta_type: string;
  cta_payload_json: Record<string, unknown>;
  send_config_json: Record<string, unknown>;
  status: string;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
  source_opportunity?: { id: string; title: string; status: string } | null;
  template?: { id: string; name: string } | null;
  operational_metrics?: {
    recipientCount: number;
    sentCount: number;
    deliveredCount: number;
    readCount: number;
    replyCount: number;
    clickCount: number;
    bookingCount: number;
    optOutCount: number;
    revenueGenerated: number;
    failureCount: number;
  };
};

export type CampaignRecipient = {
  id: string;
  client_id: string | null;
  phone: string;
  personalization_payload_json: Record<string, unknown>;
  recipient_status: string;
  provider_message_id: string | null;
  failure_reason?: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  replied_at: string | null;
  clicked_at: string | null;
  booked_at: string | null;
  revenue_generated: number;
  created_at: string;
  updated_at: string;
};

export type CampaignEvent = {
  id: string;
  event_type: string;
  provider_message_id: string | null;
  payload_json: Record<string, unknown>;
  occurred_at: string;
};

export type CampaignMetricDaily = {
  id: string;
  date: string;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  reply_count: number;
  click_count: number;
  booking_count: number;
  opt_out_count: number;
  failed_count: number;
  revenue_generated: number;
};

export type CampaignAutomation = {
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

export type CampaignAutomationRun = {
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
  automation?: { id: string; name: string; trigger_type: string } | null;
  created_at: string;
  updated_at: string;
};

export type CampaignAutomationRunLog = {
  id: string;
  automation_id: string;
  run_id: string | null;
  level: "info" | "warn" | "error" | string;
  step: string;
  message: string;
  payload_json: Record<string, unknown>;
  created_at: string;
};

export type CampaignComparativeBucket = {
  key: string;
  campaigns: number;
  sent_count: number;
  read_count: number;
  reply_count: number;
  booking_count: number;
  revenue_generated: number;
  read_rate: number;
  reply_rate: number;
  booking_rate: number;
  roi_per_100_sent: number;
};

export type CampaignSendHourComparative = {
  hour: number;
  label: string;
  sent_count: number;
  reply_count: number;
  click_count: number;
  booking_count: number;
  revenue_generated: number;
  reply_rate: number;
  click_rate: number;
  booking_rate: number;
  roi_per_100_sent: number;
};

export type LisCampaignFunnel = {
  opportunities_detected: number;
  opportunities_notified: number;
  opportunities_converted: number;
  campaigns_generated: number;
  campaigns_started: number;
  campaigns_completed: number;
  bookings_generated: number;
  revenue_generated: number;
  conversion_rate_to_campaign: number;
};

export type CampaignDetailData = {
  campaign: CampaignSummary & {
    template?: { id: string; name: string; body?: string } | null;
    source_opportunity?: LisOpportunity | null;
  };
  recipients: CampaignRecipient[];
  metrics: CampaignMetricDaily[];
  events: CampaignEvent[];
  summary: {
    recipientCount: number;
    sentCount: number;
    deliveredCount: number;
    readCount: number;
    replyCount: number;
    clickCount: number;
    bookingCount: number;
    optOutCount: number;
    revenueGenerated: number;
    failureCount: number;
  };
};

export type CampaignDashboardData = {
  metrics: {
    drafts: number;
    scheduledCampaigns: number;
    activeOpportunities: number;
    estimatedPipelineRevenue: number;
    templateCount: number;
    sentCount: number;
    deliveredCount: number;
    readCount: number;
    replyCount: number;
    clickCount: number;
    bookingCount: number;
    failedCount: number;
    revenueGenerated: number;
  };
  campaigns: CampaignSummary[];
  opportunities: LisOpportunity[];
  opportunitiesAll: LisOpportunity[];
  templates: CampaignTemplate[];
  automations: CampaignAutomation[];
  automationRuns: CampaignAutomationRun[];
  automationRunLogs: CampaignAutomationRunLog[];
  comparatives: {
    objective: CampaignComparativeBucket[];
    segment: CampaignComparativeBucket[];
    sendHour: CampaignSendHourComparative[];
    topCampaigns: Array<{
      campaign_id: string;
      campaign_name: string;
      objective: string;
      audience_type: string;
      sent_count: number;
      booking_count: number;
      revenue_generated: number;
      roi_per_100_sent: number;
      read_rate: number;
      reply_rate: number;
      click_rate: number;
      booking_rate: number;
    }>;
    lisFunnel: LisCampaignFunnel;
  };
  limits: {
    planId: string;
    limits: {
      daily_reminders: number;
      daily_campaigns: number;
      campaign_max_contacts: number;
      campaign_min_interval_hours: number;
    };
    extras: {
      extra_reminders: number;
      extra_campaigns: number;
      extra_contacts: number;
    };
    usage: {
      reminders_sent: number;
      campaigns_sent: number;
    };
  };
};
