import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { sendWhatsAppMessage } from "../whatsapp.ts";
import {
  buildSampleRecipient,
  computeBackoffDelayMs,
  extractProviderMessageId,
  isOptOutMessage,
  isRetryableDeliveryFailure,
  isValidCampaignPhone,
  normalizePhone,
  renderMessageTemplate,
} from "./domain.ts";
import { previewCampaignAudience } from "./audience-builder.ts";
import { scoreAttributionCandidate, shouldReassignAttribution } from "./phase3-domain.ts";
import { isFeatureEnabledForProfessional } from "./runtime-config.ts";

type CampaignRow = {
  id: string;
  professional_id: string;
  name: string;
  objective: string;
  audience_type: string;
  audience_filter_json: Record<string, unknown>;
  message_body: string;
  cta_type: string;
  cta_payload_json: Record<string, unknown>;
  send_config_json: Record<string, unknown>;
  status: string;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
};

type CampaignRecipientRow = {
  id: string;
  campaign_id: string;
  client_id: string | null;
  phone: string;
  personalization_payload_json: Record<string, unknown>;
  recipient_status: string;
  provider_message_id: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  replied_at: string | null;
  clicked_at: string | null;
  booked_at: string | null;
  revenue_generated: number;
};

type DispatchJobRow = {
  id: string;
  professional_id: string;
  campaign_id: string;
  recipient_id: string | null;
  status: string;
  attempt_count: number;
  available_at: string;
  locked_at: string | null;
  last_error: string | null;
  idempotency_key: string | null;
  payload_json?: Record<string, unknown>;
};

type CampaignMetricDelta = {
  sent_count?: number;
  delivered_count?: number;
  read_count?: number;
  reply_count?: number;
  click_count?: number;
  booking_count?: number;
  opt_out_count?: number;
  failed_count?: number;
  revenue_generated?: number;
};

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function eventDate(value?: string | null) {
  return (value || new Date().toISOString()).slice(0, 10);
}

const CAMPAIGN_ALLOWED_NEXT: Record<string, string[]> = {
  draft: ["scheduled", "processing", "cancelled"],
  scheduled: ["processing", "cancelled"],
  processing: ["paused", "completed", "failed", "cancelled"],
  paused: ["processing", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
  sent: ["completed", "failed"],
};

const RECIPIENT_TERMINAL = new Set(["failed", "booked", "opted_out", "skipped"]);
const RECIPIENT_SEND_SUCCESS = new Set(["sent", "delivered", "read", "replied", "clicked", "booked"]);
const CAMPAIGNS_FEATURE_KEY = "campaigns";

function canTransitionCampaign(currentStatus: string, nextStatus: string) {
  if (currentStatus === nextStatus) return true;
  const allowed = CAMPAIGN_ALLOWED_NEXT[currentStatus] || [];
  return allowed.includes(nextStatus);
}

function isRecipientTerminal(status: string) {
  return RECIPIENT_TERMINAL.has(status);
}

function isRecipientAlreadySuccessful(status: string) {
  return RECIPIENT_SEND_SUCCESS.has(status);
}

async function isCampaignFeatureEnabled(params: {
  supabase: SupabaseClient;
  professionalId: string;
  cache?: Map<string, boolean>;
}) {
  if (params.cache?.has(params.professionalId)) {
    return params.cache.get(params.professionalId) === true;
  }

  const enabled = await isFeatureEnabledForProfessional({
    supabase: params.supabase,
    professionalId: params.professionalId,
    featureKey: CAMPAIGNS_FEATURE_KEY,
    requireGlobalEnabled: true,
    defaultEnabledWhenFlagMissing: false,
  });

  params.cache?.set(params.professionalId, enabled);
  return enabled;
}

async function fetchCampaign(
  supabase: SupabaseClient,
  professionalId: string,
  campaignId: string,
) {
  const { data, error } = await supabase
    .from("whatsapp_campaigns")
    .select("*")
    .eq("professional_id", professionalId)
    .eq("id", campaignId)
    .single();

  if (error) throw error;
  return data as CampaignRow;
}

async function getCampaignExecutionLimits(
  supabase: SupabaseClient,
  professionalId: string,
) {
  const [{ data: subscription }, { data: professionalLimits }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan_id")
      .eq("professional_id", professionalId)
      .maybeSingle(),
    supabase
      .from("professional_limits")
      .select("extra_campaigns_purchased, extra_contacts_purchased")
      .eq("professional_id", professionalId)
      .maybeSingle(),
  ]);

  const planId = subscription?.plan_id || "free";
  const { data: planLimits, error } = await supabase
    .from("plan_limits")
    .select("daily_campaigns, campaign_max_contacts, campaign_min_interval_hours")
    .eq("plan_id", planId)
    .maybeSingle();
  if (error) throw error;

  const { data: usage } = await supabase
    .from("daily_message_usage")
    .select("campaigns_sent, reminders_sent")
    .eq("professional_id", professionalId)
    .eq("usage_date", todayIsoDate())
    .maybeSingle();

  return {
    dailyCampaigns: Number(planLimits?.daily_campaigns ?? 0),
    maxContacts: Number(planLimits?.campaign_max_contacts ?? 0),
    minIntervalHours: Number(planLimits?.campaign_min_interval_hours ?? 6),
    usedCampaigns: Number(usage?.campaigns_sent ?? 0),
    remindersSent: Number(usage?.reminders_sent ?? 0),
    extraCampaigns: Number(professionalLimits?.extra_campaigns_purchased ?? 0),
    extraContacts: Number(professionalLimits?.extra_contacts_purchased ?? 0),
  };
}

async function bumpDailyCampaignUsage(
  supabase: SupabaseClient,
  professionalId: string,
) {
  const { data: usage } = await supabase
    .from("daily_message_usage")
    .select("campaigns_sent, reminders_sent")
    .eq("professional_id", professionalId)
    .eq("usage_date", todayIsoDate())
    .maybeSingle();

  await supabase
    .from("daily_message_usage")
    .upsert({
      professional_id: professionalId,
      usage_date: todayIsoDate(),
      campaigns_sent: Number(usage?.campaigns_sent ?? 0) + 1,
      reminders_sent: Number(usage?.reminders_sent ?? 0),
    });
}

async function upsertCampaignMetricDelta(params: {
  supabase: SupabaseClient;
  professionalId: string;
  campaignId: string;
  date: string;
  delta: CampaignMetricDelta;
}) {
  const { supabase, professionalId, campaignId, date, delta } = params;
  const { data: existing } = await supabase
    .from("whatsapp_campaign_metrics_daily")
    .select("*")
    .eq("professional_id", professionalId)
    .eq("campaign_id", campaignId)
    .eq("date", date)
    .maybeSingle();

  const base = existing || {
    sent_count: 0,
    delivered_count: 0,
    read_count: 0,
    reply_count: 0,
    click_count: 0,
    booking_count: 0,
    opt_out_count: 0,
    failed_count: 0,
    revenue_generated: 0,
  };

  await supabase
    .from("whatsapp_campaign_metrics_daily")
    .upsert({
      professional_id: professionalId,
      campaign_id: campaignId,
      date,
      sent_count: Number(base.sent_count || 0) + Number(delta.sent_count || 0),
      delivered_count: Number(base.delivered_count || 0) + Number(delta.delivered_count || 0),
      read_count: Number(base.read_count || 0) + Number(delta.read_count || 0),
      reply_count: Number(base.reply_count || 0) + Number(delta.reply_count || 0),
      click_count: Number(base.click_count || 0) + Number(delta.click_count || 0),
      booking_count: Number(base.booking_count || 0) + Number(delta.booking_count || 0),
      opt_out_count: Number(base.opt_out_count || 0) + Number(delta.opt_out_count || 0),
      failed_count: Number(base.failed_count || 0) + Number(delta.failed_count || 0),
      revenue_generated: Number(base.revenue_generated || 0) + Number(delta.revenue_generated || 0),
    }, { onConflict: "professional_id,campaign_id,date" });
}

async function insertCampaignEvent(params: {
  supabase: SupabaseClient;
  campaignId: string;
  recipientId?: string | null;
  eventType: string;
  providerMessageId?: string | null;
  payload?: Record<string, unknown>;
  occurredAt?: string;
}) {
  await params.supabase
    .from("whatsapp_campaign_events")
    .insert({
      campaign_id: params.campaignId,
      recipient_id: params.recipientId ?? null,
      event_type: params.eventType,
      provider_message_id: params.providerMessageId ?? null,
      payload_json: params.payload || {},
      occurred_at: params.occurredAt || new Date().toISOString(),
    });
}

function buildRecipientPayload(recipient: {
  clientId: string;
  clientName: string;
  phone: string;
  normalizedPhone: string;
  averageTicket: number;
  preferredEmployeeName: string | null;
  topServiceName: string | null;
  sourceChannel: string | null;
  tags: string[];
}) {
  return {
    clientId: recipient.clientId,
    clientName: recipient.clientName,
    nome: recipient.clientName,
    phone: recipient.phone,
    normalizedPhone: recipient.normalizedPhone,
    averageTicket: recipient.averageTicket,
    ticket_medio: recipient.averageTicket,
    preferredEmployeeName: recipient.preferredEmployeeName,
    profissional: recipient.preferredEmployeeName,
    topServiceName: recipient.topServiceName,
    servico: recipient.topServiceName,
    sourceChannel: recipient.sourceChannel,
    tags: recipient.tags,
  };
}

async function resolvePreferredProvider(
  supabase: SupabaseClient,
  professionalId: string,
  campaign: CampaignRow,
) {
  const explicit = String(campaign.send_config_json?.preferredProvider || "").toLowerCase();
  if (explicit === "official" || explicit === "evolution") return explicit;

  const { data: instance } = await supabase
    .from("whatsapp_instances")
    .select("instance_name, meta_phone_id")
    .eq("professional_id", professionalId)
    .maybeSingle();

  const hasEvolution = !!String(instance?.instance_name || "").trim();
  const hasOfficial = !!String(instance?.meta_phone_id || "").trim();
  if (hasEvolution && !hasOfficial) return "evolution";
  if (!hasEvolution && hasOfficial) return "official";
  return "evolution";
}

async function createTrackedCtaPayload(params: {
  supabase: SupabaseClient;
  campaign: CampaignRow;
  recipient: CampaignRecipientRow;
}) {
  const ctaType = String(params.campaign.cta_type || "none");
  const sourcePayload = { ...(params.campaign.cta_payload_json || {}) };
  if (!["link", "booking_link"].includes(ctaType)) return sourcePayload;

  const targetUrl = String(sourcePayload.bookingLink || sourcePayload.url || "").trim();
  if (!targetUrl) return sourcePayload;

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  if (!supabaseUrl) return sourcePayload;

  const token = crypto.randomUUID().replaceAll("-", "");
  const expirationHours = Math.max(Number(params.campaign.send_config_json?.clickLinkExpiryHours || 240), 1);
  const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000).toISOString();

  await params.supabase
    .from("whatsapp_campaign_click_links")
    .insert({
      professional_id: params.campaign.professional_id,
      campaign_id: params.campaign.id,
      recipient_id: params.recipient.id,
      token,
      target_url: targetUrl,
      expires_at: expiresAt,
    });

  const trackedUrl = `${supabaseUrl}/functions/v1/whatsapp-campaign-click?t=${encodeURIComponent(token)}`;
  if (ctaType === "booking_link") {
    sourcePayload.bookingLink = trackedUrl;
  } else {
    sourcePayload.url = trackedUrl;
  }

  return sourcePayload;
}

async function recoverPreviouslySentFromLog(params: {
  supabase: SupabaseClient;
  campaign: CampaignRow;
  recipient: CampaignRecipientRow;
  job: DispatchJobRow;
}) {
  if (!params.job.idempotency_key) return null;

  const { data: log, error } = await params.supabase
    .from("whatsapp_logs")
    .select("provider_message_id, sent_at, provider, status")
    .eq("professional_id", params.campaign.professional_id)
    .eq("idempotency_key", params.job.idempotency_key)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!log) return null;

  const occurredAt = String(log.sent_at || new Date().toISOString());
  const providerMessageId = String(log.provider_message_id || "").trim() || null;
  const needsReconcile = !params.recipient.sent_at || !isRecipientAlreadySuccessful(String(params.recipient.recipient_status));

  const tasks: Promise<unknown>[] = [
    params.supabase
      .from("whatsapp_campaign_recipients")
      .update({
        recipient_status: isRecipientAlreadySuccessful(String(params.recipient.recipient_status)) ? params.recipient.recipient_status : "sent",
        provider_message_id: providerMessageId || params.recipient.provider_message_id,
        sent_at: params.recipient.sent_at || occurredAt,
        failure_reason: null,
      })
      .eq("id", params.recipient.id),
    params.supabase
      .from("whatsapp_campaign_dispatch_jobs")
      .update({
        status: "completed",
        locked_at: null,
        last_error: null,
      })
      .eq("id", params.job.id),
  ];

  if (needsReconcile) {
    tasks.push(
      upsertCampaignMetricDelta({
        supabase: params.supabase,
        professionalId: params.campaign.professional_id,
        campaignId: params.campaign.id,
        date: eventDate(occurredAt),
        delta: { sent_count: 1 },
      }),
    );
    tasks.push(
      insertCampaignEvent({
        supabase: params.supabase,
        campaignId: params.campaign.id,
        recipientId: params.recipient.id,
        eventType: "sent",
        providerMessageId,
        payload: {
          source: "idempotency_recovery",
          provider: String(log.provider || "unknown"),
        },
        occurredAt,
      }),
    );
  }

  await Promise.all(tasks);

  return {
    recovered: true,
    providerMessageId,
    occurredAt,
  };
}

async function enforceRateLimitWindow(params: {
  supabase: SupabaseClient;
  campaign: CampaignRow;
  preferredProvider: string;
}) {
  const windowSeconds = Math.max(Number(params.campaign.send_config_json?.rateLimitWindowSeconds || 60), 10);
  const tenantMaxPerWindow = Math.max(Number(params.campaign.send_config_json?.tenantMaxPerWindow || 30), 1);
  const providerMaxPerWindow = Math.max(Number(params.campaign.send_config_json?.providerMaxPerWindow || 20), 1);
  const windowStartIso = new Date(Date.now() - windowSeconds * 1000).toISOString();

  const [tenantCountRes, providerCountRes] = await Promise.all([
    params.supabase
      .from("whatsapp_logs")
      .select("id", { count: "exact", head: true })
      .eq("professional_id", params.campaign.professional_id)
      .eq("status", "sent")
      .gte("sent_at", windowStartIso),
    params.supabase
      .from("whatsapp_logs")
      .select("id", { count: "exact", head: true })
      .eq("professional_id", params.campaign.professional_id)
      .eq("status", "sent")
      .eq("provider", params.preferredProvider)
      .gte("sent_at", windowStartIso),
  ]);

  const tenantCount = Number(tenantCountRes.count || 0);
  const providerCount = Number(providerCountRes.count || 0);
  return {
    throttled: tenantCount >= tenantMaxPerWindow || providerCount >= providerMaxPerWindow,
    retryAfterMs: Math.max(windowSeconds * 1000, 10_000),
    tenantCount,
    providerCount,
    tenantMaxPerWindow,
    providerMaxPerWindow,
    windowSeconds,
  };
}

async function materializeCampaignAudience(params: {
  supabase: SupabaseClient;
  campaign: CampaignRow;
}) {
  const { supabase, campaign } = params;

  const limits = await getCampaignExecutionLimits(supabase, campaign.professional_id);
  const effectiveDailyCampaigns = limits.dailyCampaigns === -1 ? -1 : limits.dailyCampaigns + limits.extraCampaigns;
  const effectiveMaxContacts = limits.maxContacts === -1 ? -1 : limits.maxContacts + limits.extraContacts;

  if (effectiveDailyCampaigns !== -1 && limits.usedCampaigns >= effectiveDailyCampaigns) {
    throw new Error(`Limite diário de campanhas atingido (${effectiveDailyCampaigns} por dia).`);
  }

  const { data: lastCampaign } = await supabase
    .from("whatsapp_campaigns")
    .select("started_at")
    .eq("professional_id", campaign.professional_id)
    .neq("id", campaign.id)
    .not("started_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastCampaign?.started_at) {
    const elapsedMs = Date.now() - new Date(String(lastCampaign.started_at)).getTime();
    const minIntervalMs = Math.max(limits.minIntervalHours, 0) * 60 * 60 * 1000;
    if (minIntervalMs > 0 && elapsedMs < minIntervalMs) {
      const hoursLeft = ((minIntervalMs - elapsedMs) / (60 * 60 * 1000)).toFixed(1);
      throw new Error(`Aguarde ${hoursLeft}h antes de disparar outra campanha.`);
    }
  }

  const preview = await previewCampaignAudience({
    supabase,
    professionalId: campaign.professional_id,
    objective: campaign.objective as never,
    filters: (campaign.audience_filter_json || {}) as never,
    previewRecipientLimit: 0,
  });

  let recipients = [...preview.recipients].filter((recipient) => isValidCampaignPhone(recipient.normalizedPhone));
  const clientIds = recipients.map((recipient) => recipient.clientId);
  if (clientIds.length > 0) {
    const [preferencesRes, historyRes] = await Promise.all([
      supabase
        .from("client_marketing_preferences")
        .select("client_id, max_campaigns_per_30_days")
        .eq("professional_id", campaign.professional_id)
        .in("client_id", clientIds),
      supabase
        .from("whatsapp_campaign_recipients")
        .select("client_id")
        .in("client_id", clientIds)
        .gte("sent_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    if (preferencesRes.error) throw preferencesRes.error;
    if (historyRes.error) throw historyRes.error;

    const frequencyByClient = new Map<string, number>();
    for (const row of historyRes.data || []) {
      if (!row.client_id) continue;
      frequencyByClient.set(String(row.client_id), (frequencyByClient.get(String(row.client_id)) || 0) + 1);
    }

    const preferenceByClient = new Map(
      (preferencesRes.data || []).map((row) => [String(row.client_id), Number(row.max_campaigns_per_30_days || 3)]),
    );

    recipients = recipients.filter((recipient) => {
      const maxCampaigns = preferenceByClient.get(recipient.clientId) ?? 3;
      const sentCount = frequencyByClient.get(recipient.clientId) || 0;
      return sentCount < maxCampaigns;
    });
  }

  if (effectiveMaxContacts !== -1 && recipients.length > effectiveMaxContacts) {
    recipients = recipients.slice(0, effectiveMaxContacts);
  }

  if (recipients.length === 0) {
    throw new Error("Nenhum destinatário elegível para esta campanha.");
  }

  await Promise.all([
    supabase.from("whatsapp_campaign_recipients").delete().eq("campaign_id", campaign.id),
    supabase.from("whatsapp_campaign_dispatch_jobs").delete().eq("campaign_id", campaign.id),
    supabase.from("whatsapp_campaign_events").delete().eq("campaign_id", campaign.id),
    supabase.from("whatsapp_campaign_metrics_daily").delete().eq("campaign_id", campaign.id),
    supabase.from("whatsapp_campaign_attributions").delete().eq("campaign_id", campaign.id),
  ]);

  const rateLimitMs = Math.max(Number(campaign.send_config_json?.rateLimitMs || 2000), 500);
  const preferredProvider = await resolvePreferredProvider(supabase, campaign.professional_id, campaign);
  const baseTime = Date.now();

  const recipientRows = recipients.map((recipient) => ({
    campaign_id: campaign.id,
    client_id: recipient.clientId,
    phone: recipient.normalizedPhone,
    personalization_payload_json: buildRecipientPayload(recipient),
    recipient_status: "queued",
  }));

  const insertedRecipients: Array<Record<string, unknown>> = [];
  for (const group of chunk(recipientRows, 100)) {
    const { data, error } = await supabase
      .from("whatsapp_campaign_recipients")
      .insert(group)
      .select("*");
    if (error) throw error;
    insertedRecipients.push(...(data || []));
  }

  const jobs = insertedRecipients.map((recipient, index) => ({
    professional_id: campaign.professional_id,
    campaign_id: campaign.id,
    recipient_id: recipient.id,
    job_type: "send_message",
    status: "pending",
    available_at: new Date(baseTime + index * rateLimitMs).toISOString(),
    idempotency_key: `${campaign.id}:${recipient.id}:v1`,
    payload_json: {
      phone: recipient.phone,
      preferred_provider: preferredProvider,
    },
  }));

  for (const group of chunk(jobs, 100)) {
    const { error } = await supabase.from("whatsapp_campaign_dispatch_jobs").insert(group);
    if (error) throw error;
  }

  const queuedEvents = insertedRecipients.map((recipient) => ({
    campaign_id: campaign.id,
    recipient_id: recipient.id,
    event_type: "queued",
    payload_json: { source: "campaign_start" },
  }));
  for (const group of chunk(queuedEvents, 100)) {
    const { error } = await supabase.from("whatsapp_campaign_events").insert(group);
    if (error) throw error;
  }

  const audienceSnapshot = {
    generated_at: new Date().toISOString(),
    audience_count: recipients.length,
    eligible_count: preview.eligibleCount,
    excluded_count: preview.excludedCount,
    excluded_reasons: preview.excludedReasons,
    average_ticket: preview.averageTicket,
    estimated_conversion_rate: preview.estimatedConversionRate,
    estimated_bookings: preview.estimatedBookings,
    estimated_revenue: preview.estimatedRevenue,
  };

  await supabase
    .from("whatsapp_campaigns")
    .update({
      audience_snapshot_json: audienceSnapshot,
      audience_estimate_json: {
        audienceCount: recipients.length,
        estimatedConversionRate: preview.estimatedConversionRate,
        estimatedBookings: preview.estimatedBookings,
        estimatedRevenue: preview.estimatedRevenue,
        averageTicket: preview.averageTicket,
      },
      status: "processing",
      started_at: campaign.started_at || new Date().toISOString(),
      finished_at: null,
    })
    .eq("id", campaign.id);

  await bumpDailyCampaignUsage(supabase, campaign.professional_id);

  return {
    audienceSnapshot,
    recipientCount: recipients.length,
  };
}

export async function startOrResumeCampaign(params: {
  supabase: SupabaseClient;
  professionalId: string;
  campaignId: string;
}) {
  const featureEnabled = await isCampaignFeatureEnabled({
    supabase: params.supabase,
    professionalId: params.professionalId,
  });
  if (!featureEnabled) {
    throw new Error("Campanhas desativadas para esta profissional.");
  }

  const campaign = await fetchCampaign(params.supabase, params.professionalId, params.campaignId);

  if (["cancelled", "completed", "sent"].includes(campaign.status)) {
    throw new Error("Essa campanha não pode mais ser iniciada.");
  }

  if (campaign.status === "paused") {
    if (!canTransitionCampaign(campaign.status, "processing")) {
      throw new Error(`Transicao de status invalida: ${campaign.status} -> processing`);
    }

    await params.supabase
      .from("whatsapp_campaign_dispatch_jobs")
      .update({
        status: "pending",
        locked_at: null,
      })
      .eq("campaign_id", campaign.id)
      .eq("status", "processing");

    await params.supabase
      .from("whatsapp_campaigns")
      .update({
        status: "processing",
        finished_at: null,
      })
      .eq("id", campaign.id);

    await insertCampaignEvent({
      supabase: params.supabase,
      campaignId: campaign.id,
      eventType: "resumed",
      payload: { source: "manual_resume" },
    });

    return await fetchCampaign(params.supabase, params.professionalId, params.campaignId);
  }

  if (!canTransitionCampaign(campaign.status, "processing")) {
    throw new Error(`Transicao de status invalida: ${campaign.status} -> processing`);
  }

  await materializeCampaignAudience({
    supabase: params.supabase,
    campaign,
  });

  await insertCampaignEvent({
    supabase: params.supabase,
    campaignId: campaign.id,
    eventType: "processing",
    payload: { source: "campaign_start" },
  });

  return await fetchCampaign(params.supabase, params.professionalId, params.campaignId);
}

export async function pauseCampaignExecution(params: {
  supabase: SupabaseClient;
  professionalId: string;
  campaignId: string;
  reason?: string | null;
}) {
  const campaign = await fetchCampaign(params.supabase, params.professionalId, params.campaignId);
  if (!canTransitionCampaign(campaign.status, "paused")) return;

  await params.supabase
    .from("whatsapp_campaign_dispatch_jobs")
    .update({
      status: "pending",
      locked_at: null,
    })
    .eq("campaign_id", params.campaignId)
    .eq("status", "processing");

  await params.supabase
    .from("whatsapp_campaigns")
    .update({
      status: "paused",
      finished_at: null,
    })
    .eq("id", params.campaignId)
    .eq("professional_id", params.professionalId);

  await insertCampaignEvent({
    supabase: params.supabase,
    campaignId: params.campaignId,
    eventType: "paused",
    payload: { reason: params.reason || "manual_pause" },
  });
}

export async function cancelCampaignExecution(params: {
  supabase: SupabaseClient;
  professionalId: string;
  campaignId: string;
  reason?: string | null;
}) {
  const campaign = await fetchCampaign(params.supabase, params.professionalId, params.campaignId);
  if (!canTransitionCampaign(campaign.status, "cancelled")) return;

  await params.supabase
    .from("whatsapp_campaign_dispatch_jobs")
    .update({
      status: "cancelled",
      locked_at: null,
    })
    .eq("campaign_id", params.campaignId)
    .in("status", ["pending", "retrying", "processing"]);

  await params.supabase
    .from("whatsapp_campaign_recipients")
    .update({
      recipient_status: "skipped",
      failure_reason: params.reason || "campaign_cancelled",
    })
    .eq("campaign_id", params.campaignId)
    .in("recipient_status", ["pending", "queued"]);

  await params.supabase
    .from("whatsapp_campaigns")
    .update({
      status: "cancelled",
      finished_at: new Date().toISOString(),
    })
    .eq("id", params.campaignId)
    .eq("professional_id", params.professionalId);

  await insertCampaignEvent({
    supabase: params.supabase,
    campaignId: params.campaignId,
    eventType: "cancelled",
    payload: { reason: params.reason || "manual_cancel" },
  });
}

export async function activateDueScheduledCampaigns(params: {
  supabase: SupabaseClient;
  professionalId?: string | null;
}) {
  let query = params.supabase
    .from("whatsapp_campaigns")
    .select("id, professional_id")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(5);

  if (params.professionalId) query = query.eq("professional_id", params.professionalId);

  const { data, error } = await query;
  if (error) throw error;

  const started: string[] = [];
  const featureGateCache = new Map<string, boolean>();
  for (const campaign of data || []) {
    try {
      const campaignProfessionalId = String(campaign.professional_id);
      const featureEnabled = await isCampaignFeatureEnabled({
        supabase: params.supabase,
        professionalId: campaignProfessionalId,
        cache: featureGateCache,
      });
      if (!featureEnabled) continue;

      await startOrResumeCampaign({
        supabase: params.supabase,
        professionalId: campaignProfessionalId,
        campaignId: String(campaign.id),
      });
      started.push(String(campaign.id));
    } catch (error) {
      console.error("activateDueScheduledCampaigns failed:", error);
    }
  }

  return started;
}

async function claimDispatchJobs(
  supabase: SupabaseClient,
  batchSize: number,
  professionalId?: string | null,
) {
  const { data, error } = await supabase.rpc("claim_whatsapp_campaign_dispatch_jobs", {
    p_limit: batchSize,
    p_professional_id: professionalId || null,
  });
  if (error) throw error;
  return (data || []) as DispatchJobRow[];
}

async function releaseStaleProcessingJobs(
  supabase: SupabaseClient,
  professionalId?: string | null,
) {
  const staleBeforeIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  let query = supabase
    .from("whatsapp_campaign_dispatch_jobs")
    .update({
      status: "retrying",
      locked_at: null,
      available_at: new Date(Date.now() + 5_000).toISOString(),
      last_error: "stale_processing_released",
    })
    .eq("status", "processing")
    .lt("locked_at", staleBeforeIso);

  if (professionalId) query = query.eq("professional_id", professionalId);
  await query;
}

async function deferJobForDisabledFeature(params: {
  supabase: SupabaseClient;
  job: DispatchJobRow;
}) {
  await params.supabase
    .from("whatsapp_campaign_dispatch_jobs")
    .update({
      status: "retrying",
      locked_at: null,
      available_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      last_error: "campaigns_feature_disabled",
    })
    .eq("id", params.job.id);
}

async function evaluateMassFailurePause(params: {
  supabase: SupabaseClient;
  campaignId: string;
  professionalId: string;
}) {
  const { data, error } = await params.supabase
    .from("whatsapp_campaign_recipients")
    .select("recipient_status")
    .eq("campaign_id", params.campaignId)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) throw error;

  const processed = (data || []).filter((row) =>
    ["sent", "delivered", "read", "replied", "clicked", "booked", "failed"].includes(String(row.recipient_status))
  );
  if (processed.length < 10) return false;

  const failed = processed.filter((row) => String(row.recipient_status) === "failed").length;
  if (failed / processed.length < 0.45) return false;

  await pauseCampaignExecution({
    supabase: params.supabase,
    professionalId: params.professionalId,
    campaignId: params.campaignId,
    reason: "mass_failure_auto_pause",
  });

  return true;
}

async function finalizeCampaignIfDone(params: {
  supabase: SupabaseClient;
  campaignId: string;
  professionalId: string;
}) {
  const [{ data: jobs }, { data: recipients }] = await Promise.all([
    params.supabase
      .from("whatsapp_campaign_dispatch_jobs")
      .select("status")
      .eq("campaign_id", params.campaignId),
    params.supabase
      .from("whatsapp_campaign_recipients")
      .select("recipient_status")
      .eq("campaign_id", params.campaignId),
  ]);

  const pendingJobs = (jobs || []).filter((job) => ["pending", "retrying", "processing"].includes(String(job.status))).length;
  if (pendingJobs > 0) return false;

  const successfulRecipients = (recipients || []).filter((recipient) =>
    ["sent", "delivered", "read", "replied", "clicked", "booked"].includes(String(recipient.recipient_status))
  ).length;
  const nextStatus = successfulRecipients > 0 ? "completed" : "failed";

  const { data: campaignCurrent } = await params.supabase
    .from("whatsapp_campaigns")
    .select("status")
    .eq("id", params.campaignId)
    .eq("professional_id", params.professionalId)
    .maybeSingle();
  const currentStatus = String(campaignCurrent?.status || "processing");
  if (!canTransitionCampaign(currentStatus, nextStatus)) return false;

  await params.supabase
    .from("whatsapp_campaigns")
    .update({
      status: nextStatus,
      finished_at: new Date().toISOString(),
    })
    .eq("id", params.campaignId)
    .eq("professional_id", params.professionalId);

  await insertCampaignEvent({
    supabase: params.supabase,
    campaignId: params.campaignId,
    eventType: nextStatus,
    payload: { successful_recipients: successfulRecipients },
  });

  return true;
}

async function sendJob(params: {
  supabase: SupabaseClient;
  job: DispatchJobRow;
}) {
  const { supabase, job } = params;

  const [{ data: campaign }, { data: recipient }] = await Promise.all([
    supabase
      .from("whatsapp_campaigns")
      .select("*")
      .eq("id", job.campaign_id)
      .single(),
    supabase
      .from("whatsapp_campaign_recipients")
      .select("*")
      .eq("id", job.recipient_id)
      .single(),
  ]);

  if (!campaign || !recipient) {
    await supabase
      .from("whatsapp_campaign_dispatch_jobs")
      .update({
        status: "failed",
        last_error: "campaign_or_recipient_missing",
      })
      .eq("id", job.id);
    return { success: false, campaignId: job.campaign_id, professionalId: job.professional_id, retryScheduled: false };
  }

  const currentRecipientStatus = String(recipient.recipient_status || "pending");
  if (isRecipientAlreadySuccessful(currentRecipientStatus)) {
    await supabase
      .from("whatsapp_campaign_dispatch_jobs")
      .update({
        status: "completed",
        locked_at: null,
        last_error: "recipient_already_sent",
      })
      .eq("id", job.id);
    return { success: true, campaignId: campaign.id, professionalId: campaign.professional_id, retryScheduled: false };
  }

  if (isRecipientTerminal(currentRecipientStatus)) {
    await supabase
      .from("whatsapp_campaign_dispatch_jobs")
      .update({
        status: "cancelled",
        locked_at: null,
        last_error: `recipient_terminal_${currentRecipientStatus}`,
      })
      .eq("id", job.id);
    return { success: false, campaignId: campaign.id, professionalId: campaign.professional_id, retryScheduled: false };
  }

  if (campaign.status !== "processing") {
    await supabase
      .from("whatsapp_campaign_dispatch_jobs")
      .update({
        status: campaign.status === "paused" ? "pending" : "cancelled",
        locked_at: null,
        last_error: campaign.status === "paused" ? "campaign_paused" : "campaign_not_processing",
      })
      .eq("id", job.id);
    return { success: false, campaignId: campaign.id, professionalId: campaign.professional_id, retryScheduled: false };
  }

  const recovered = await recoverPreviouslySentFromLog({
    supabase,
    campaign: campaign as CampaignRow,
    recipient: recipient as CampaignRecipientRow,
    job,
  });
  if (recovered?.recovered) {
    return { success: true, campaignId: campaign.id, professionalId: campaign.professional_id, retryScheduled: false };
  }

  const recipientPhone = normalizePhone(recipient.phone);
  if (!isValidCampaignPhone(recipientPhone)) {
    await Promise.all([
      supabase
        .from("whatsapp_campaign_recipients")
        .update({
          recipient_status: "failed",
          failure_reason: "invalid_phone",
        })
        .eq("id", recipient.id),
      supabase
        .from("whatsapp_campaign_dispatch_jobs")
        .update({
          status: "failed",
          locked_at: null,
          last_error: "invalid_phone",
        })
        .eq("id", job.id),
      upsertCampaignMetricDelta({
        supabase,
        professionalId: campaign.professional_id,
        campaignId: campaign.id,
        date: eventDate(),
        delta: { failed_count: 1 },
      }),
    ]);

    await insertCampaignEvent({
      supabase,
      campaignId: campaign.id,
      recipientId: recipient.id,
      eventType: "failed",
      payload: { reason: "invalid_phone" },
    });

    return { success: false, campaignId: campaign.id, professionalId: campaign.professional_id, retryScheduled: false };
  }

  const preferredProvider = String(job.payload_json?.preferred_provider || "evolution").toLowerCase();
  const rateLimit = await enforceRateLimitWindow({
    supabase,
    campaign: campaign as CampaignRow,
    preferredProvider: preferredProvider === "official" ? "official" : "evolution",
  });

  if (rateLimit.throttled) {
    const retryAt = new Date(Date.now() + rateLimit.retryAfterMs).toISOString();
    await Promise.all([
      supabase
        .from("whatsapp_campaign_recipients")
        .update({
          recipient_status: "queued",
        })
        .eq("id", recipient.id),
      supabase
        .from("whatsapp_campaign_dispatch_jobs")
        .update({
          status: "retrying",
          locked_at: null,
          available_at: retryAt,
          last_error: "rate_limit_window",
        })
        .eq("id", job.id),
      insertCampaignEvent({
        supabase,
        campaignId: campaign.id,
        recipientId: recipient.id,
        eventType: "throttled",
        payload: {
          reason: "rate_limit_window",
          window_seconds: rateLimit.windowSeconds,
          tenant_count: rateLimit.tenantCount,
          tenant_limit: rateLimit.tenantMaxPerWindow,
          provider_count: rateLimit.providerCount,
          provider_limit: rateLimit.providerMaxPerWindow,
        },
      }),
    ]);

    return { success: false, campaignId: campaign.id, professionalId: campaign.professional_id, retryScheduled: true };
  }

  await supabase
    .from("whatsapp_campaign_recipients")
    .update({ recipient_status: "sending" })
    .eq("id", recipient.id)
    .in("recipient_status", ["pending", "queued", "sending"]);

  const trackedCtaPayload = await createTrackedCtaPayload({
    supabase,
    campaign: campaign as CampaignRow,
    recipient: recipient as CampaignRecipientRow,
  });

  const renderedMessage = renderMessageTemplate(
    campaign.message_body,
    {
      ...buildSampleRecipient(),
      ...(recipient.personalization_payload_json || {}),
    },
    campaign.cta_type,
    trackedCtaPayload,
  );

  const result = await sendWhatsAppMessage({
    supabase,
    professionalId: campaign.professional_id,
    recipient: recipientPhone,
    message: renderedMessage,
    idempotencyKey: job.idempotency_key,
    campaignId: campaign.id,
    campaignRecipientId: recipient.id,
    preferredProvider: preferredProvider === "official" ? "official" : "evolution",
    details: {
      source: "whatsapp_campaign_execution",
      campaign_id: campaign.id,
      recipient_id: recipient.id,
      job_id: job.id,
    },
  });

  if (result.success) {
    const occurredAt = new Date().toISOString();
    const providerMessageId = extractProviderMessageId(result.responseBody);
    await Promise.all([
      supabase
        .from("whatsapp_campaign_recipients")
        .update({
          recipient_status: "sent",
          provider_message_id: providerMessageId,
          sent_at: occurredAt,
          failure_reason: null,
        })
        .eq("id", recipient.id),
      supabase
        .from("whatsapp_campaign_dispatch_jobs")
        .update({
          status: "completed",
          locked_at: null,
          last_error: null,
        })
        .eq("id", job.id),
      upsertCampaignMetricDelta({
        supabase,
        professionalId: campaign.professional_id,
        campaignId: campaign.id,
        date: eventDate(occurredAt),
        delta: { sent_count: 1 },
      }),
      insertCampaignEvent({
        supabase,
        campaignId: campaign.id,
        recipientId: recipient.id,
        eventType: "sent",
        providerMessageId,
        payload: {
          provider: result.provider,
          attemptedProviders: result.attemptedProviders,
          responseStatus: result.responseStatus,
        },
        occurredAt,
      }),
    ]);

    return { success: true, campaignId: campaign.id, professionalId: campaign.professional_id, retryScheduled: false };
  }

  const retryable = isRetryableDeliveryFailure({
    responseStatus: result.responseStatus || null,
    errorMessage: result.error || null,
  });
  const nextAttemptCount = Number(job.attempt_count || 0) + 1;
  const isInFlight = String(result.error || "").includes("IDEMPOTENCY_IN_FLIGHT");
  const isUncertain = String(result.error || "").includes("SEND_UNCERTAIN");
  const shouldRetry = isInFlight
    ? nextAttemptCount < 8
    : (isUncertain ? false : (retryable && nextAttemptCount < 4));
  const retryDelayMs = isInFlight ? 15_000 : computeBackoffDelayMs(nextAttemptCount);
  const finalFailureReason = isUncertain ? "send_uncertain_manual_review" : (result.error || "send_failed");

  await Promise.all([
    supabase
      .from("whatsapp_campaign_recipients")
      .update({
        recipient_status: shouldRetry ? "queued" : "failed",
        failure_reason: finalFailureReason,
      })
      .eq("id", recipient.id),
    supabase
      .from("whatsapp_campaign_dispatch_jobs")
      .update({
        status: shouldRetry ? "retrying" : "failed",
        attempt_count: nextAttemptCount,
        available_at: shouldRetry ? new Date(Date.now() + retryDelayMs).toISOString() : job.available_at,
        locked_at: null,
        last_error: finalFailureReason,
      })
      .eq("id", job.id),
    insertCampaignEvent({
      supabase,
      campaignId: campaign.id,
      recipientId: recipient.id,
      eventType: shouldRetry ? "throttled" : "failed",
      payload: {
        responseStatus: result.responseStatus,
        error: finalFailureReason,
        attempt_count: nextAttemptCount,
        idempotency_in_flight: isInFlight,
        send_uncertain: isUncertain,
      },
    }),
    !shouldRetry
      ? upsertCampaignMetricDelta({
        supabase,
        professionalId: campaign.professional_id,
        campaignId: campaign.id,
        date: eventDate(),
        delta: { failed_count: 1 },
      })
      : Promise.resolve(),
  ]);

  return { success: false, campaignId: campaign.id, professionalId: campaign.professional_id, retryScheduled: shouldRetry };
}

export async function processCampaignDispatchQueue(params: {
  supabase: SupabaseClient;
  batchSize?: number;
  maxBatches?: number;
  professionalId?: string | null;
}) {
  const batchSize = Math.max(1, Math.min(params.batchSize || 20, 50));
  const maxBatches = Math.max(1, Math.min(params.maxBatches || 3, 8));

  const activatedCampaigns = await activateDueScheduledCampaigns({
    supabase: params.supabase,
    professionalId: params.professionalId,
  });
  await releaseStaleProcessingJobs(params.supabase, params.professionalId);

  let processedJobs = 0;
  let sentJobs = 0;
  let failedJobs = 0;
  let retryingJobs = 0;
  let skippedByFeatureGate = 0;
  const touchedCampaigns = new Set<string>();
  const featureGateCache = new Map<string, boolean>();

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const jobs = await claimDispatchJobs(params.supabase, batchSize, params.professionalId);
    if (jobs.length === 0) break;

    for (const job of jobs) {
      const featureEnabled = await isCampaignFeatureEnabled({
        supabase: params.supabase,
        professionalId: String(job.professional_id),
        cache: featureGateCache,
      });
      if (!featureEnabled) {
        await deferJobForDisabledFeature({
          supabase: params.supabase,
          job,
        });
        processedJobs += 1;
        skippedByFeatureGate += 1;
        continue;
      }

      const result = await sendJob({
        supabase: params.supabase,
        job,
      });
      processedJobs += 1;
      touchedCampaigns.add(result.campaignId);

      if (result.success) {
        sentJobs += 1;
      } else if (result.retryScheduled) {
        retryingJobs += 1;
      } else {
        failedJobs += 1;
      }

      await evaluateMassFailurePause({
        supabase: params.supabase,
        campaignId: result.campaignId,
        professionalId: result.professionalId,
      });
    }
  }

  for (const campaignId of touchedCampaigns) {
    const { data: campaign } = await params.supabase
      .from("whatsapp_campaigns")
      .select("professional_id")
      .eq("id", campaignId)
      .maybeSingle();

    if (campaign?.professional_id) {
      await finalizeCampaignIfDone({
        supabase: params.supabase,
        campaignId,
        professionalId: String(campaign.professional_id),
      });
    }
  }

  let remainingQuery = params.supabase
    .from("whatsapp_campaign_dispatch_jobs")
    .select("*", { count: "exact", head: true })
    .in("status", ["pending", "retrying"]);

  if (params.professionalId) {
    remainingQuery = remainingQuery.eq("professional_id", params.professionalId);
  }

  const { count: remainingJobs } = await remainingQuery;

  return {
    activatedCampaigns,
    processedJobs,
    sentJobs,
    failedJobs,
    retryingJobs,
    skippedByFeatureGate,
    remainingJobs: Number(remainingJobs || 0),
  };
}

export async function trackCampaignProviderStatus(params: {
  supabase: SupabaseClient;
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  payload?: Record<string, unknown>;
}) {
  const { data: recipient, error } = await params.supabase
    .from("whatsapp_campaign_recipients")
    .select("*, campaign:whatsapp_campaigns!inner(id, professional_id)")
    .eq("provider_message_id", params.providerMessageId)
    .maybeSingle();
  if (error) throw error;
  if (!recipient) return { matched: false };

  const occurredAt = new Date().toISOString();
  const currentStatus = String(recipient.recipient_status || "pending");
  const nextStatus =
    params.status === "failed" ? "failed" :
    params.status === "read" ? "read" :
    params.status === "delivered" ? "delivered" :
    "sent";
  const progression: Record<string, number> = {
    pending: 0,
    queued: 0,
    sending: 0,
    sent: 1,
    delivered: 2,
    read: 3,
    replied: 4,
    clicked: 5,
    booked: 6,
    opted_out: 6,
    skipped: 6,
    failed: 6,
  };

  if (isRecipientAlreadySuccessful(currentStatus) && nextStatus === "sent") {
    return { matched: true, campaignId: recipient.campaign.id };
  }
  if (isRecipientAlreadySuccessful(currentStatus) && nextStatus === "failed") {
    return { matched: true, campaignId: recipient.campaign.id };
  }
  if (nextStatus !== "failed" && (progression[currentStatus] ?? 0) > (progression[nextStatus] ?? 0)) {
    return { matched: true, campaignId: recipient.campaign.id };
  }
  if (currentStatus === "read" && nextStatus === "delivered") {
    return { matched: true, campaignId: recipient.campaign.id };
  }
  if (isRecipientTerminal(currentStatus) && nextStatus !== "failed") {
    return { matched: true, campaignId: recipient.campaign.id };
  }

  const updatePayload: Record<string, unknown> = {
    recipient_status: nextStatus,
  };
  const metricDelta: CampaignMetricDelta = {};

  if (params.status === "delivered" && !recipient.delivered_at) {
    updatePayload.delivered_at = occurredAt;
    metricDelta.delivered_count = 1;
  }
  if (params.status === "read" && !recipient.read_at) {
    updatePayload.read_at = occurredAt;
    metricDelta.read_count = 1;
    if (!recipient.delivered_at) {
      updatePayload.delivered_at = occurredAt;
      metricDelta.delivered_count = (metricDelta.delivered_count || 0) + 1;
    }
  }
  if (params.status === "failed") {
    updatePayload.failure_reason = String(params.payload?.error || params.payload?.failure_reason || "provider_failed");
    metricDelta.failed_count = 1;
  }

  await params.supabase
    .from("whatsapp_campaign_recipients")
    .update(updatePayload)
    .eq("id", recipient.id);

  await insertCampaignEvent({
    supabase: params.supabase,
    campaignId: recipient.campaign.id,
    recipientId: recipient.id,
    eventType: params.status,
    providerMessageId: params.providerMessageId,
    payload: params.payload || {},
    occurredAt,
  });

  if (Object.keys(metricDelta).length > 0) {
    await upsertCampaignMetricDelta({
      supabase: params.supabase,
      professionalId: recipient.campaign.professional_id,
      campaignId: recipient.campaign.id,
      date: eventDate(occurredAt),
      delta: metricDelta,
    });
  }

  if (params.status === "failed") {
    await evaluateMassFailurePause({
      supabase: params.supabase,
      campaignId: recipient.campaign.id,
      professionalId: recipient.campaign.professional_id,
    });
    await finalizeCampaignIfDone({
      supabase: params.supabase,
      campaignId: recipient.campaign.id,
      professionalId: recipient.campaign.professional_id,
    });
  }

  return { matched: true, campaignId: recipient.campaign.id };
}

export async function trackCampaignInboundReply(params: {
  supabase: SupabaseClient;
  professionalId: string;
  normalizedPhone: string;
  messageId: string;
  replyToMessageId?: string | null;
  text: string | null;
  payload?: Record<string, unknown>;
}) {
  const normalizedPhone = normalizePhone(params.normalizedPhone);
  if (!normalizedPhone) return { matched: false };

  let recipient: Record<string, unknown> | null = null;

  const quotedMessageId = String(params.replyToMessageId || "").trim();
  if (quotedMessageId) {
    const { data: byQuotedId, error: quotedError } = await params.supabase
      .from("whatsapp_campaign_recipients")
      .select("*, campaign:whatsapp_campaigns!inner(id, professional_id, status)")
      .eq("provider_message_id", quotedMessageId)
      .maybeSingle();
    if (quotedError) throw quotedError;
    if (byQuotedId && String((byQuotedId as { campaign: { professional_id?: string } }).campaign?.professional_id || "") === params.professionalId) {
      recipient = byQuotedId as Record<string, unknown>;
    }
  }

  if (!recipient) {
    const replyWindowHours = Math.max(Number(Deno.env.get("WHATSAPP_CAMPAIGN_REPLY_WINDOW_HOURS") || "336"), 24);
    const sentSinceIso = new Date(Date.now() - replyWindowHours * 60 * 60 * 1000).toISOString();

    const { data: candidates, error } = await params.supabase
      .from("whatsapp_campaign_recipients")
      .select("*, campaign:whatsapp_campaigns!inner(id, professional_id, status)")
      .eq("phone", normalizedPhone)
      .not("sent_at", "is", null)
      .gte("sent_at", sentSinceIso)
      .in("recipient_status", ["sent", "delivered", "read", "replied", "clicked", "booked"])
      .order("sent_at", { ascending: false })
      .limit(5);
    if (error) throw error;

    const scopedCandidates = (candidates || []).filter((item) =>
      String((item as { campaign: { professional_id?: string } }).campaign?.professional_id || "") === params.professionalId
    );

    if (scopedCandidates.length === 1) {
      recipient = scopedCandidates[0] as Record<string, unknown>;
    } else if (scopedCandidates.length > 1) {
      const processing = scopedCandidates.filter((item) => String((item as { campaign: { status?: string } }).campaign?.status || "") === "processing");
      if (processing.length === 1) {
        recipient = processing[0] as Record<string, unknown>;
      } else {
        return { matched: false, ambiguous: true };
      }
    }
  }

  if (!recipient) return { matched: false };
  const campaignData = (recipient as { campaign: { id: string; professional_id: string } }).campaign;
  const recipientData = recipient as {
    id: string;
    client_id: string | null;
    phone: string;
    replied_at: string | null;
    recipient_status: string;
  };

  const occurredAt = new Date().toISOString();
  const isOptOut = isOptOutMessage(params.text);
  const nextStatus = isOptOut
    ? "opted_out"
    : isRecipientTerminal(String(recipientData.recipient_status || ""))
      ? String(recipientData.recipient_status || "replied")
      : "replied";

  await params.supabase
    .from("whatsapp_campaign_recipients")
    .update({
      recipient_status: nextStatus,
      replied_at: recipientData.replied_at || occurredAt,
    })
    .eq("id", recipientData.id);

  if (isOptOut) {
    const suppressionPhone = normalizePhone(recipientData.phone);
    const { data: existingSuppression } = await params.supabase
      .from("whatsapp_campaign_suppressions")
      .select("id")
      .eq("professional_id", params.professionalId)
      .eq("phone", suppressionPhone)
      .maybeSingle();

    if (!existingSuppression) {
      await params.supabase
        .from("whatsapp_campaign_suppressions")
        .insert({
          professional_id: params.professionalId,
          client_id: recipientData.client_id,
          phone: suppressionPhone,
          reason: "recipient_opt_out",
          source: "whatsapp_reply",
        });
    }
  }

  await insertCampaignEvent({
    supabase: params.supabase,
    campaignId: campaignData.id,
    recipientId: recipientData.id,
    eventType: isOptOut ? "opt_out" : "reply",
    providerMessageId: params.messageId,
    payload: {
      text: params.text,
      reply_to_message_id: quotedMessageId || null,
      ...(params.payload || {}),
    },
    occurredAt,
  });

  await upsertCampaignMetricDelta({
    supabase: params.supabase,
    professionalId: params.professionalId,
    campaignId: campaignData.id,
    date: eventDate(occurredAt),
    delta: isOptOut ? { opt_out_count: 1 } : { reply_count: 1 },
  });

  return { matched: true, campaignId: campaignData.id, optOut: isOptOut };
}

export async function trackCampaignClickByToken(params: {
  supabase: SupabaseClient;
  token: string;
  userAgent?: string | null;
  ip?: string | null;
}) {
  const token = String(params.token || "").trim();
  if (!token) return { matched: false };

  const { data: clickLink, error } = await params.supabase
    .from("whatsapp_campaign_click_links")
    .select("*, campaign:whatsapp_campaigns!inner(id, professional_id)")
    .eq("token", token)
    .maybeSingle();
  if (error) throw error;
  if (!clickLink) return { matched: false };

  if (clickLink.expires_at && new Date(String(clickLink.expires_at)).getTime() < Date.now()) {
    return {
      matched: true,
      expired: true,
      targetUrl: String(clickLink.target_url || ""),
    };
  }

  const { data: recipient } = await params.supabase
    .from("whatsapp_campaign_recipients")
    .select("id, recipient_status, clicked_at")
    .eq("id", clickLink.recipient_id)
    .maybeSingle();

  const occurredAt = new Date().toISOString();
  const firstClick = !clickLink.clicked_at;
  const clickCount = Number(clickLink.click_count || 0) + 1;
  const currentRecipientStatus = String(recipient?.recipient_status || "");
  const nextRecipientStatus = isRecipientTerminal(currentRecipientStatus) ? currentRecipientStatus : "clicked";

  await Promise.all([
    params.supabase
      .from("whatsapp_campaign_click_links")
      .update({
        clicked_at: clickLink.clicked_at || occurredAt,
        click_count: clickCount,
        first_user_agent: clickLink.first_user_agent || params.userAgent || null,
        last_user_agent: params.userAgent || clickLink.last_user_agent || null,
        first_ip: clickLink.first_ip || params.ip || null,
        last_ip: params.ip || clickLink.last_ip || null,
      })
      .eq("id", clickLink.id),
    params.supabase
      .from("whatsapp_campaign_recipients")
      .update({
        recipient_status: nextRecipientStatus,
        clicked_at: recipient?.clicked_at || occurredAt,
      })
      .eq("id", clickLink.recipient_id),
    insertCampaignEvent({
      supabase: params.supabase,
      campaignId: clickLink.campaign_id,
      recipientId: clickLink.recipient_id,
      eventType: "click",
      payload: {
        token,
        click_count: clickCount,
      },
      occurredAt,
    }),
  ]);

  if (firstClick) {
    await upsertCampaignMetricDelta({
      supabase: params.supabase,
      professionalId: clickLink.campaign.professional_id,
      campaignId: clickLink.campaign_id,
      date: eventDate(occurredAt),
      delta: { click_count: 1 },
    });
  }

  return {
    matched: true,
    firstClick,
    targetUrl: String(clickLink.target_url || ""),
    campaignId: String(clickLink.campaign_id),
  };
}

function resolveRecipientStatusWithoutBooking(recipient: CampaignRecipientRow | null) {
  if (!recipient) return "sent";
  const current = String(recipient.recipient_status || "sent");
  if (["opted_out", "failed", "skipped"].includes(current)) return current;
  if (recipient.replied_at) return "replied";
  if (recipient.clicked_at) return "clicked";
  if (recipient.read_at) return "read";
  if (recipient.delivered_at) return "delivered";
  if (recipient.sent_at) return "sent";
  return "queued";
}

async function applyAttributionReassignment(params: {
  supabase: SupabaseClient;
  professionalId: string;
  bookingId: string;
  revenue: number;
  occurredAt: string;
  bookingStatus: string;
  newCampaignId: string;
  newRecipient: CampaignRecipientRow;
  candidate: { score: number; touchSignal: string; hoursToBooking: number; attributionType: string };
  existingAttribution: Record<string, unknown> | null;
}) {
  const existing = params.existingAttribution;
  const existingCampaignId = existing ? String(existing.campaign_id || "") : null;
  const existingRecipientId = existing?.recipient_id ? String(existing.recipient_id) : null;
  const existingRevenue = Number(existing?.revenue_amount || 0);
  const existingOccurredAt = String(existing?.attributed_at || params.occurredAt);
  const existingScore = Number(existing?.attribution_score || 0);

  if (existing && existingCampaignId === params.newCampaignId && existingRecipientId === params.newRecipient.id) {
    await params.supabase
      .from("whatsapp_campaign_attributions")
      .update({
        attribution_type: params.candidate.attributionType,
        attribution_score: params.candidate.score,
        touch_signal: params.candidate.touchSignal,
        hours_to_booking: params.candidate.hoursToBooking,
        attributed_at: params.occurredAt,
        revenue_amount: params.revenue,
        metadata_json: {
          booking_status: params.bookingStatus,
        },
      })
      .eq("id", existing.id);
    return { linked: false, reassigned: false, skipped: true };
  }

  if (existing && !shouldReassignAttribution({
    existingCampaignId,
    newCampaignId: params.newCampaignId,
    existingScore,
    newScore: params.candidate.score,
    threshold: 0.02,
  })) {
    return { linked: false, reassigned: false, skipped: true };
  }

  const oldRecipient = existingRecipientId
    ? await params.supabase
      .from("whatsapp_campaign_recipients")
      .select("*")
      .eq("id", existingRecipientId)
      .maybeSingle()
    : { data: null, error: null };
  if (oldRecipient.error) throw oldRecipient.error;

  const oldRecipientRevenue = Number(oldRecipient.data?.revenue_generated || 0);
  const oldRecipientNextRevenue = Math.max(oldRecipientRevenue - existingRevenue, 0);

  const tasks: Promise<unknown>[] = [];
  if (existing && existingCampaignId && existingCampaignId !== params.newCampaignId) {
    tasks.push(
      upsertCampaignMetricDelta({
        supabase: params.supabase,
        professionalId: params.professionalId,
        campaignId: existingCampaignId,
        date: eventDate(existingOccurredAt),
        delta: {
          booking_count: -1,
          revenue_generated: -existingRevenue,
        },
      }),
    );
    tasks.push(
      insertCampaignEvent({
        supabase: params.supabase,
        campaignId: existingCampaignId,
        recipientId: existingRecipientId,
        eventType: "booking_reassigned_out",
        payload: {
          booking_id: params.bookingId,
          new_campaign_id: params.newCampaignId,
          previous_score: existingScore,
          new_score: params.candidate.score,
        },
        occurredAt: params.occurredAt,
      }),
    );
  }

  if (existing && existingRecipientId && oldRecipient.data) {
    tasks.push(
      params.supabase
        .from("whatsapp_campaign_recipients")
        .update({
          revenue_generated: oldRecipientNextRevenue,
          booked_at: oldRecipientNextRevenue > 0 ? oldRecipient.data.booked_at : null,
          recipient_status: oldRecipientNextRevenue > 0
            ? String(oldRecipient.data.recipient_status || "booked")
            : resolveRecipientStatusWithoutBooking(oldRecipient.data as CampaignRecipientRow),
        })
        .eq("id", existingRecipientId),
    );
  }

  const newRecipientNextRevenue = Number(params.newRecipient.revenue_generated || 0) + params.revenue;
  tasks.push(
    params.supabase
      .from("whatsapp_campaign_recipients")
      .update({
        recipient_status: "booked",
        booked_at: params.occurredAt,
        revenue_generated: newRecipientNextRevenue,
      })
      .eq("id", params.newRecipient.id),
  );
  tasks.push(
    insertCampaignEvent({
      supabase: params.supabase,
      campaignId: params.newCampaignId,
      recipientId: params.newRecipient.id,
      eventType: existing && existingCampaignId !== params.newCampaignId ? "booking_reassigned_in" : "booking",
      payload: {
        booking_id: params.bookingId,
        revenue: params.revenue,
        previous_campaign_id: existingCampaignId,
      },
      occurredAt: params.occurredAt,
    }),
  );
  tasks.push(
    upsertCampaignMetricDelta({
      supabase: params.supabase,
      professionalId: params.professionalId,
      campaignId: params.newCampaignId,
      date: eventDate(params.occurredAt),
      delta: {
        booking_count: 1,
        revenue_generated: params.revenue,
      },
    }),
  );

  if (existing) {
    tasks.push(
      params.supabase
        .from("whatsapp_campaign_attributions")
        .update({
          campaign_id: params.newCampaignId,
          recipient_id: params.newRecipient.id,
          attribution_type: params.candidate.attributionType,
          attribution_score: params.candidate.score,
          touch_signal: params.candidate.touchSignal,
          hours_to_booking: params.candidate.hoursToBooking,
          revenue_amount: params.revenue,
          attributed_at: params.occurredAt,
          metadata_json: {
            booking_status: params.bookingStatus,
            reassigned: true,
          },
        })
        .eq("id", existing.id),
    );
  } else {
    tasks.push(
      params.supabase
        .from("whatsapp_campaign_attributions")
        .insert({
          professional_id: params.professionalId,
          campaign_id: params.newCampaignId,
          recipient_id: params.newRecipient.id,
          booking_id: params.bookingId,
          client_id: params.newRecipient.client_id,
          attribution_type: params.candidate.attributionType,
          attribution_score: params.candidate.score,
          touch_signal: params.candidate.touchSignal,
          hours_to_booking: params.candidate.hoursToBooking,
          revenue_amount: params.revenue,
          attributed_at: params.occurredAt,
          metadata_json: {
            booking_status: params.bookingStatus,
          },
        }),
    );
  }

  await Promise.all(tasks);
  return {
    linked: true,
    reassigned: Boolean(existing && existingCampaignId !== params.newCampaignId),
    skipped: false,
  };
}

async function syncCampaignAttributions(params: {
  supabase: SupabaseClient;
  professionalId: string;
  campaignId: string;
}) {
  const [campaignRes, recipientsRes] = await Promise.all([
    params.supabase
      .from("whatsapp_campaigns")
      .select("id, send_config_json, started_at")
      .eq("professional_id", params.professionalId)
      .eq("id", params.campaignId)
      .single(),
    params.supabase
      .from("whatsapp_campaign_recipients")
      .select("*")
      .eq("campaign_id", params.campaignId)
      .not("sent_at", "is", null),
  ]);

  if (campaignRes.error) throw campaignRes.error;
  if (recipientsRes.error) throw recipientsRes.error;

  const recipients = (recipientsRes.data || []) as CampaignRecipientRow[];
  if (recipients.length === 0) return { bookingCount: 0, revenueGenerated: 0 };

  const attributionWindowDays = Number(campaignRes.data.send_config_json?.attributionWindowDays || 7);
  const earliestSentAt = recipients.reduce((earliest, recipient) => {
    if (!recipient.sent_at) return earliest;
    if (!earliest) return recipient.sent_at;
    return new Date(recipient.sent_at).getTime() < new Date(earliest).getTime() ? recipient.sent_at : earliest;
  }, campaignRes.data.started_at || null as string | null);
  if (!earliestSentAt) return { bookingCount: 0, revenueGenerated: 0 };

  const { data: bookings, error: bookingsError } = await params.supabase
    .from("bookings")
    .select("id, client_id, client_phone, created_at, start_time, status, price")
    .eq("professional_id", params.professionalId)
    .in("status", ["pending", "confirmed", "completed"])
    .gte("created_at", earliestSentAt);
  if (bookingsError) throw bookingsError;

  let linkedCount = 0;
  let linkedRevenue = 0;

  for (const booking of bookings || []) {
    const bookingReference = new Date(String(booking.created_at || booking.start_time)).getTime();
    const matchedRecipients = recipients.filter((item) => {
      if (!item.sent_at) return false;
      if (item.client_id && booking.client_id && item.client_id === booking.client_id) {
        const sentAt = new Date(item.sent_at).getTime();
        return bookingReference >= sentAt && bookingReference <= sentAt + attributionWindowDays * 24 * 60 * 60 * 1000;
      }
      if (normalizePhone(item.phone) !== normalizePhone(String(booking.client_phone || ""))) return false;
      const sentAt = new Date(item.sent_at).getTime();
      return bookingReference >= sentAt && bookingReference <= sentAt + attributionWindowDays * 24 * 60 * 60 * 1000;
    });
    if (matchedRecipients.length === 0) continue;

    const ranked = matchedRecipients
      .map((recipient) => ({
        recipient,
        score: scoreAttributionCandidate({
          recipient,
          bookingReference,
        }),
      }))
      .sort((a, b) => b.score.score - a.score.score);
    const best = ranked[0];
    const occurredAt = new Date(String(booking.created_at || booking.start_time)).toISOString();
    const revenue = Number(booking.price || 0);

    const existingAttributionRes = await params.supabase
      .from("whatsapp_campaign_attributions")
      .select("*")
      .eq("professional_id", params.professionalId)
      .eq("booking_id", booking.id)
      .maybeSingle();
    if (existingAttributionRes.error) throw existingAttributionRes.error;

    const applied = await applyAttributionReassignment({
      supabase: params.supabase,
      professionalId: params.professionalId,
      bookingId: String(booking.id),
      revenue,
      occurredAt,
      bookingStatus: String(booking.status || ""),
      newCampaignId: params.campaignId,
      newRecipient: best.recipient,
      candidate: best.score,
      existingAttribution: existingAttributionRes.data as Record<string, unknown> | null,
    });

    if (applied.linked) {
      linkedCount += 1;
      linkedRevenue += revenue;
    }
  }

  return {
    bookingCount: linkedCount,
    revenueGenerated: linkedRevenue,
  };
}

export async function syncCampaignAttributionsForCampaign(params: {
  supabase: SupabaseClient;
  professionalId: string;
  campaignId: string;
}) {
  return await syncCampaignAttributions(params);
}

export async function syncCampaignAttributionsForProfessional(params: {
  supabase: SupabaseClient;
  professionalId: string;
}) {
  const { data, error } = await params.supabase
    .from("whatsapp_campaigns")
    .select("id")
    .eq("professional_id", params.professionalId)
    .in("status", ["processing", "sent", "completed", "paused"]);
  if (error) throw error;

  let bookingCount = 0;
  let revenueGenerated = 0;
  for (const campaign of data || []) {
    const result = await syncCampaignAttributions({
      supabase: params.supabase,
      professionalId: params.professionalId,
      campaignId: String(campaign.id),
    });
    bookingCount += result.bookingCount;
    revenueGenerated += result.revenueGenerated;
  }

  return { bookingCount, revenueGenerated };
}



