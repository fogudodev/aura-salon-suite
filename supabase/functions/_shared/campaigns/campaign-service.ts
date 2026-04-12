import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { previewCampaignAudience } from "./audience-builder.ts";
import { previewMessage } from "./domain.ts";
import type {
  CampaignAutomationRecord,
  CampaignObjective,
  CampaignDraftInput,
  CampaignTemplateRecord,
  MessagePreviewInput,
} from "./types.ts";

function buildOperationalMetrics(
  recipients: Array<Record<string, unknown>>,
  metricsRows: Array<Record<string, unknown>>,
) {
  const totalsFromMetrics = metricsRows.reduce((acc, row) => ({
    sentCount: acc.sentCount + Number(row.sent_count || 0),
    deliveredCount: acc.deliveredCount + Number(row.delivered_count || 0),
    readCount: acc.readCount + Number(row.read_count || 0),
    replyCount: acc.replyCount + Number(row.reply_count || 0),
    clickCount: acc.clickCount + Number(row.click_count || 0),
    bookingCount: acc.bookingCount + Number(row.booking_count || 0),
    optOutCount: acc.optOutCount + Number(row.opt_out_count || 0),
    failedCount: acc.failedCount + Number(row.failed_count || 0),
    revenueGenerated: acc.revenueGenerated + Number(row.revenue_generated || 0),
  }), {
    sentCount: 0,
    deliveredCount: 0,
    readCount: 0,
    replyCount: 0,
    clickCount: 0,
    bookingCount: 0,
    optOutCount: 0,
    failedCount: 0,
    revenueGenerated: 0,
  });

  const recipientCount = recipients.length;
  const sentBase = totalsFromMetrics.sentCount || recipients.filter((recipient) =>
    ["sent", "delivered", "read", "replied", "clicked", "booked"].includes(String(recipient.recipient_status))
  ).length;

  return {
    recipientCount,
    sentCount: sentBase,
    deliveredCount: totalsFromMetrics.deliveredCount,
    readCount: totalsFromMetrics.readCount,
    replyCount: totalsFromMetrics.replyCount,
    clickCount: totalsFromMetrics.clickCount,
    bookingCount: totalsFromMetrics.bookingCount,
    optOutCount: totalsFromMetrics.optOutCount,
    revenueGenerated: Number(totalsFromMetrics.revenueGenerated.toFixed(2)),
    failureCount: totalsFromMetrics.failedCount || recipients.filter((recipient) => String(recipient.recipient_status) === "failed").length,
  };
}

function asRate(part: number, total: number) {
  if (!total) return 0;
  return Number((part / total).toFixed(4));
}

function formatSendHourLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function buildCampaignComparatives(params: {
  campaigns: Array<Record<string, unknown>>;
  recipientRows: Array<Record<string, unknown>>;
  attributionRows: Array<Record<string, unknown>>;
  opportunityRows: Array<Record<string, unknown>>;
}) {
  const objectiveBuckets = new Map<string, {
    campaigns: number;
    sentCount: number;
    deliveredCount: number;
    readCount: number;
    replyCount: number;
    clickCount: number;
    bookingCount: number;
    failedCount: number;
    revenueGenerated: number;
  }>();
  const segmentBuckets = new Map<string, {
    campaigns: number;
    sentCount: number;
    readCount: number;
    replyCount: number;
    bookingCount: number;
    revenueGenerated: number;
  }>();
  const topCampaigns: Array<Record<string, unknown>> = [];
  const campaignById = new Map<string, Record<string, unknown>>();

  for (const campaign of params.campaigns) {
    const campaignId = String(campaign.id || "");
    if (campaignId) campaignById.set(campaignId, campaign);
    const objective = String(campaign.objective || "outro");
    const audienceType = String(campaign.audience_type || "customizado");
    const metrics = (campaign.operational_metrics || {}) as Record<string, unknown>;
    const sentCount = Number(metrics.sentCount || 0);
    const deliveredCount = Number(metrics.deliveredCount || 0);
    const readCount = Number(metrics.readCount || 0);
    const replyCount = Number(metrics.replyCount || 0);
    const clickCount = Number(metrics.clickCount || 0);
    const bookingCount = Number(metrics.bookingCount || 0);
    const failedCount = Number(metrics.failureCount || 0);
    const revenueGenerated = Number(metrics.revenueGenerated || 0);

    const objectiveBucket = objectiveBuckets.get(objective) || {
      campaigns: 0,
      sentCount: 0,
      deliveredCount: 0,
      readCount: 0,
      replyCount: 0,
      clickCount: 0,
      bookingCount: 0,
      failedCount: 0,
      revenueGenerated: 0,
    };
    objectiveBucket.campaigns += 1;
    objectiveBucket.sentCount += sentCount;
    objectiveBucket.deliveredCount += deliveredCount;
    objectiveBucket.readCount += readCount;
    objectiveBucket.replyCount += replyCount;
    objectiveBucket.clickCount += clickCount;
    objectiveBucket.bookingCount += bookingCount;
    objectiveBucket.failedCount += failedCount;
    objectiveBucket.revenueGenerated += revenueGenerated;
    objectiveBuckets.set(objective, objectiveBucket);

    const segmentBucket = segmentBuckets.get(audienceType) || {
      campaigns: 0,
      sentCount: 0,
      readCount: 0,
      replyCount: 0,
      bookingCount: 0,
      revenueGenerated: 0,
    };
    segmentBucket.campaigns += 1;
    segmentBucket.sentCount += sentCount;
    segmentBucket.readCount += readCount;
    segmentBucket.replyCount += replyCount;
    segmentBucket.bookingCount += bookingCount;
    segmentBucket.revenueGenerated += revenueGenerated;
    segmentBuckets.set(audienceType, segmentBucket);

    topCampaigns.push({
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      objective,
      audience_type: audienceType,
      sent_count: sentCount,
      booking_count: bookingCount,
      revenue_generated: Number(revenueGenerated.toFixed(2)),
      roi_per_100_sent: sentCount > 0 ? Number(((revenueGenerated / sentCount) * 100).toFixed(2)) : 0,
      read_rate: asRate(readCount, sentCount),
      reply_rate: asRate(replyCount, sentCount),
      click_rate: asRate(clickCount, sentCount),
      booking_rate: asRate(bookingCount, sentCount),
    });
  }

  const sendHourBuckets = new Map<number, {
    sentCount: number;
    replyCount: number;
    clickCount: number;
    bookingCount: number;
    revenueGenerated: number;
  }>();
  for (const row of params.recipientRows) {
    const sentAt = String(row.sent_at || "");
    if (!sentAt) continue;
    const hour = new Date(sentAt).getHours();
    const bucket = sendHourBuckets.get(hour) || {
      sentCount: 0,
      replyCount: 0,
      clickCount: 0,
      bookingCount: 0,
      revenueGenerated: 0,
    };
    bucket.sentCount += 1;
    if (row.replied_at) bucket.replyCount += 1;
    if (row.clicked_at) bucket.clickCount += 1;
    if (row.booked_at || Number(row.revenue_generated || 0) > 0) bucket.bookingCount += 1;
    bucket.revenueGenerated += Number(row.revenue_generated || 0);
    sendHourBuckets.set(hour, bucket);
  }

  const objective = Array.from(objectiveBuckets.entries()).map(([key, bucket]) => ({
    key,
    campaigns: bucket.campaigns,
    sent_count: bucket.sentCount,
    delivered_count: bucket.deliveredCount,
    read_count: bucket.readCount,
    reply_count: bucket.replyCount,
    click_count: bucket.clickCount,
    booking_count: bucket.bookingCount,
    failed_count: bucket.failedCount,
    revenue_generated: Number(bucket.revenueGenerated.toFixed(2)),
    read_rate: asRate(bucket.readCount, bucket.sentCount),
    reply_rate: asRate(bucket.replyCount, bucket.sentCount),
    click_rate: asRate(bucket.clickCount, bucket.sentCount),
    booking_rate: asRate(bucket.bookingCount, bucket.sentCount),
    roi_per_100_sent: bucket.sentCount > 0 ? Number(((bucket.revenueGenerated / bucket.sentCount) * 100).toFixed(2)) : 0,
  })).sort((a, b) => b.revenue_generated - a.revenue_generated);

  const segment = Array.from(segmentBuckets.entries()).map(([key, bucket]) => ({
    key,
    campaigns: bucket.campaigns,
    sent_count: bucket.sentCount,
    read_count: bucket.readCount,
    reply_count: bucket.replyCount,
    booking_count: bucket.bookingCount,
    revenue_generated: Number(bucket.revenueGenerated.toFixed(2)),
    read_rate: asRate(bucket.readCount, bucket.sentCount),
    reply_rate: asRate(bucket.replyCount, bucket.sentCount),
    booking_rate: asRate(bucket.bookingCount, bucket.sentCount),
    roi_per_100_sent: bucket.sentCount > 0 ? Number(((bucket.revenueGenerated / bucket.sentCount) * 100).toFixed(2)) : 0,
  })).sort((a, b) => b.revenue_generated - a.revenue_generated);

  const sendHour = Array.from(sendHourBuckets.entries()).map(([hour, bucket]) => ({
    hour,
    label: formatSendHourLabel(hour),
    sent_count: bucket.sentCount,
    reply_count: bucket.replyCount,
    click_count: bucket.clickCount,
    booking_count: bucket.bookingCount,
    revenue_generated: Number(bucket.revenueGenerated.toFixed(2)),
    reply_rate: asRate(bucket.replyCount, bucket.sentCount),
    click_rate: asRate(bucket.clickCount, bucket.sentCount),
    booking_rate: asRate(bucket.bookingCount, bucket.sentCount),
    roi_per_100_sent: bucket.sentCount > 0 ? Number(((bucket.revenueGenerated / bucket.sentCount) * 100).toFixed(2)) : 0,
  })).sort((a, b) => b.booking_rate - a.booking_rate);

  const lisSourceCampaignIds = new Set(
    params.campaigns
      .filter((item) => !!item.source_opportunity_id)
      .map((item) => String(item.id)),
  );

  const convertedOpportunities = params.opportunityRows.filter((item) => String(item.status || "") === "converted_to_campaign");
  const convertedCampaignIds = new Set(
    convertedOpportunities
      .map((item) => String(item.converted_campaign_id || ""))
      .filter(Boolean),
  );
  const lisAttributions = params.attributionRows.filter((item) => lisSourceCampaignIds.has(String(item.campaign_id || "")));
  const lisRevenue = lisAttributions.reduce((sum, item) => sum + Number(item.revenue_amount || 0), 0);
  const lisBookings = lisAttributions.length;
  const lisSentCampaigns = params.campaigns.filter((item) => lisSourceCampaignIds.has(String(item.id)) && !!item.started_at).length;
  const lisCompletedCampaigns = params.campaigns.filter((item) =>
    lisSourceCampaignIds.has(String(item.id)) && ["completed", "sent"].includes(String(item.status || ""))
  ).length;

  const lisFunnel = {
    opportunities_detected: params.opportunityRows.length,
    opportunities_notified: params.opportunityRows.filter((item) => ["notified", "viewed", "converted_to_campaign"].includes(String(item.status || ""))).length,
    opportunities_converted: convertedOpportunities.length,
    campaigns_generated: convertedCampaignIds.size,
    campaigns_started: lisSentCampaigns,
    campaigns_completed: lisCompletedCampaigns,
    bookings_generated: lisBookings,
    revenue_generated: Number(lisRevenue.toFixed(2)),
    conversion_rate_to_campaign: asRate(convertedCampaignIds.size, params.opportunityRows.length),
  };

  return {
    objective,
    segment,
    sendHour,
    topCampaigns: topCampaigns
      .sort((a, b) => Number(b.revenue_generated || 0) - Number(a.revenue_generated || 0))
      .slice(0, 8),
    lisFunnel,
  };
}

export async function getCampaignLimits(supabase: SupabaseClient, professionalId: string) {
  const [{ data: subscription }, { data: professionalLimits }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan_id")
      .eq("professional_id", professionalId)
      .maybeSingle(),
    supabase
      .from("professional_limits")
      .select("extra_reminders_purchased, extra_campaigns_purchased, extra_contacts_purchased")
      .eq("professional_id", professionalId)
      .maybeSingle(),
  ]);

  const planId = subscription?.plan_id || "free";
  const { data: planLimits, error: planError } = await supabase
    .from("plan_limits")
    .select("*")
    .eq("plan_id", planId)
    .maybeSingle();
  if (planError) throw planError;

  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await supabase
    .from("daily_message_usage")
    .select("reminders_sent, campaigns_sent")
    .eq("professional_id", professionalId)
    .eq("usage_date", today)
    .maybeSingle();

  return {
    planId,
    limits: planLimits || {
      daily_reminders: 5,
      daily_campaigns: 0,
      campaign_max_contacts: 0,
      campaign_min_interval_hours: 6,
    },
    extras: {
      extra_reminders: professionalLimits?.extra_reminders_purchased || 0,
      extra_campaigns: professionalLimits?.extra_campaigns_purchased || 0,
      extra_contacts: professionalLimits?.extra_contacts_purchased || 0,
    },
    usage: {
      reminders_sent: usage?.reminders_sent || 0,
      campaigns_sent: usage?.campaigns_sent || 0,
    },
  };
}

export async function listCampaignTemplates(
  supabase: SupabaseClient,
  professionalId: string,
): Promise<CampaignTemplateRecord[]> {
  const { data, error } = await supabase
    .from("whatsapp_campaign_templates")
    .select("*")
    .or(`professional_id.eq.${professionalId},professional_id.is.null`)
    .eq("is_active", true)
    .order("is_system_template", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as CampaignTemplateRecord[];
}

export async function upsertCampaignTemplate(
  supabase: SupabaseClient,
  professionalId: string,
  userId: string,
  payload: {
    id?: string;
    name: string;
    category: string;
    objective: string;
    body: string;
    variablesJson: unknown;
    tone: string;
    isAiGenerated?: boolean;
    previewExampleJson?: unknown;
  },
) {
  const record = {
    professional_id: professionalId,
    name: payload.name,
    category: payload.category,
    objective: payload.objective,
    body: payload.body,
    variables_json: payload.variablesJson || [],
    tone: payload.tone,
    is_ai_generated: payload.isAiGenerated || false,
    is_active: true,
    is_system_template: false,
    preview_example_json: payload.previewExampleJson || {},
    created_by: userId,
  };

  if (payload.id) {
    const { data, error } = await supabase
      .from("whatsapp_campaign_templates")
      .update(record)
      .eq("id", payload.id)
      .eq("professional_id", professionalId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("whatsapp_campaign_templates")
    .insert(record)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function archiveCampaignTemplate(
  supabase: SupabaseClient,
  professionalId: string,
  templateId: string,
) {
  const { error } = await supabase
    .from("whatsapp_campaign_templates")
    .update({ is_active: false })
    .eq("id", templateId)
    .eq("professional_id", professionalId);
  if (error) throw error;
}

export async function createOrUpdateCampaignDraft(
  supabase: SupabaseClient,
  input: CampaignDraftInput,
) {
  if (input.id) {
    const { data: existing, error: existingError } = await supabase
      .from("whatsapp_campaigns")
      .select("status")
      .eq("id", input.id)
      .eq("professional_id", input.professionalId)
      .maybeSingle();
    if (existingError) throw existingError;
    const status = String(existing?.status || "draft");
    if (["processing", "completed", "failed", "cancelled", "sent"].includes(status)) {
      throw new Error(`Campanha em status ${status} não pode ser editada como rascunho.`);
    }
  }

  const record = {
    professional_id: input.professionalId,
    source_opportunity_id: input.sourceOpportunityId || null,
    name: input.name,
    type: input.type,
    objective: input.objective,
    audience_type: input.audienceType,
    audience_filter_json: input.audienceFilterJson,
    audience_snapshot_json: {},
    audience_estimate_json: input.audienceEstimateJson,
    message_mode: input.messageMode,
    template_id: input.templateId || null,
    template_name: input.templateName || null,
    message_body: input.messageBody,
    cta_type: input.ctaType,
    cta_payload_json: input.ctaPayloadJson,
    send_config_json: input.sendConfigJson,
    status: input.scheduledAt ? "scheduled" : "draft",
    scheduled_at: input.scheduledAt || null,
    created_by: input.createdBy || null,
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("whatsapp_campaigns")
      .update(record)
      .eq("id", input.id)
      .eq("professional_id", input.professionalId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("whatsapp_campaigns")
    .insert(record)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function cloneCampaignDraft(
  supabase: SupabaseClient,
  professionalId: string,
  userId: string,
  campaignId: string,
) {
  const { data: campaign, error } = await supabase
    .from("whatsapp_campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("professional_id", professionalId)
    .single();
  if (error) throw error;

  const { id: _id, created_at: _createdAt, updated_at: _updatedAt, started_at: _startedAt, finished_at: _finishedAt, ...rest } = campaign;

  const { data, error: insertError } = await supabase
    .from("whatsapp_campaigns")
    .insert({
      ...rest,
      name: `${campaign.name} (cópia)`,
      status: "draft",
      scheduled_at: null,
      created_by: userId,
    })
    .select()
    .single();
  if (insertError) throw insertError;
  return data;
}

export async function listCampaigns(
  supabase: SupabaseClient,
  professionalId: string,
) {
  const { data, error } = await supabase
    .from("whatsapp_campaigns")
    .select(`
      *,
      source_opportunity:lis_campaign_opportunities!whatsapp_campaigns_source_opportunity_id_fkey(id, title, status),
      template:whatsapp_campaign_templates(id, name)
    `)
    .eq("professional_id", professionalId)
      .order("created_at", { ascending: false });
  if (error) throw error;

  const campaigns = data || [];
  if (campaigns.length === 0) return [];

  const campaignIds = campaigns.map((campaign) => campaign.id);
  const [recipientsRes, metricsRes] = await Promise.all([
    supabase
      .from("whatsapp_campaign_recipients")
      .select("campaign_id, recipient_status")
      .in("campaign_id", campaignIds),
    supabase
      .from("whatsapp_campaign_metrics_daily")
      .select("campaign_id, sent_count, delivered_count, read_count, reply_count, click_count, booking_count, opt_out_count, failed_count, revenue_generated")
      .eq("professional_id", professionalId)
      .in("campaign_id", campaignIds),
  ]);
  if (recipientsRes.error) throw recipientsRes.error;
  if (metricsRes.error) throw metricsRes.error;

  return campaigns.map((campaign) => ({
    ...campaign,
    operational_metrics: buildOperationalMetrics(
      (recipientsRes.data || []).filter((recipient) => recipient.campaign_id === campaign.id),
      (metricsRes.data || []).filter((metric) => metric.campaign_id === campaign.id),
    ),
  }));
}

export async function getCampaignDetails(
  supabase: SupabaseClient,
  professionalId: string,
  campaignId: string,
) {
  const [campaignRes, recipientsRes, metricsRes, eventsRes] = await Promise.all([
    supabase
      .from("whatsapp_campaigns")
      .select(`
        *,
        source_opportunity:lis_campaign_opportunities!whatsapp_campaigns_source_opportunity_id_fkey(*),
        template:whatsapp_campaign_templates(id, name, body)
      `)
      .eq("professional_id", professionalId)
      .eq("id", campaignId)
      .single(),
    supabase
      .from("whatsapp_campaign_recipients")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true })
      .limit(100),
    supabase
      .from("whatsapp_campaign_metrics_daily")
      .select("*")
      .eq("professional_id", professionalId)
      .eq("campaign_id", campaignId)
      .order("date", { ascending: false }),
    supabase
      .from("whatsapp_campaign_events")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("occurred_at", { ascending: false })
      .limit(100),
  ]);

  if (campaignRes.error) throw campaignRes.error;
  if (recipientsRes.error) throw recipientsRes.error;
  if (metricsRes.error) throw metricsRes.error;
  if (eventsRes.error) throw eventsRes.error;

  const summary = buildOperationalMetrics(
    (recipientsRes.data || []) as Array<Record<string, unknown>>,
    (metricsRes.data || []) as Array<Record<string, unknown>>,
  );

  return {
    campaign: campaignRes.data,
    recipients: recipientsRes.data || [],
    metrics: metricsRes.data || [],
    events: eventsRes.data || [],
    summary,
  };
}

export async function previewCampaignBuilder(
  supabase: SupabaseClient,
  params: {
    professionalId: string;
    objective: CampaignObjective;
    filters: CampaignDraftInput["audienceFilterJson"];
    messageInput: MessagePreviewInput;
  },
) {
  const audience = await previewCampaignAudience({
    supabase,
    professionalId: params.professionalId,
    objective: params.objective,
    filters: params.filters,
  });
  const sampleRecipient = audience.recipients[0];
  const message = previewMessage({
    ...params.messageInput,
    sampleRecipient: sampleRecipient || params.messageInput.sampleRecipient,
  });

  return {
    audience,
    message,
  };
}

export async function getCampaignDashboardSnapshot(
  supabase: SupabaseClient,
  professionalId: string,
) {
  const [campaigns, opportunities, templates, limits, automations, automationRuns, automationRunLogs, attributionsRes] = await Promise.all([
    listCampaigns(supabase, professionalId),
    supabase
      .from("lis_campaign_opportunities")
      .select("*")
      .eq("professional_id", professionalId)
      .order("estimated_revenue", { ascending: false })
      .limit(50),
    listCampaignTemplates(supabase, professionalId),
    getCampaignLimits(supabase, professionalId),
    supabase
      .from("whatsapp_campaign_automations")
      .select("*")
      .eq("professional_id", professionalId)
      .order("is_active", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("whatsapp_campaign_automation_runs")
      .select("*, automation:whatsapp_campaign_automations(id, name, trigger_type)")
      .eq("professional_id", professionalId)
      .order("started_at", { ascending: false })
      .limit(20),
    supabase
      .from("whatsapp_campaign_automation_run_logs")
      .select("id, automation_id, run_id, level, step, message, payload_json, created_at")
      .eq("professional_id", professionalId)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("whatsapp_campaign_attributions")
      .select("campaign_id, revenue_amount")
      .eq("professional_id", professionalId),
  ]);

  if (automations.error) throw automations.error;
  if (automationRuns.error) throw automationRuns.error;
  if (automationRunLogs.error) throw automationRunLogs.error;
  if (attributionsRes.error) throw attributionsRes.error;
  if (opportunities.error) throw opportunities.error;

  let recipientRows: Array<Record<string, unknown>> = [];
  const campaignIds = campaigns.map((campaign) => String(campaign.id));
  if (campaignIds.length > 0) {
    const recipientRowsRes = await supabase
      .from("whatsapp_campaign_recipients")
      .select("campaign_id, sent_at, replied_at, clicked_at, booked_at, revenue_generated")
      .in("campaign_id", campaignIds);
    if (recipientRowsRes.error) throw recipientRowsRes.error;
    recipientRows = recipientRowsRes.data || [];
  }

  const allOpportunities = opportunities.data || [];
  const activeOpportunities = allOpportunities.filter((opportunity) =>
    ["new", "notified", "viewed"].includes(String(opportunity.status || ""))
  ).slice(0, 8);
  const totalEstimatedRevenue = activeOpportunities.reduce((sum, opportunity) => sum + Number(opportunity.estimated_revenue || 0), 0);
  const scheduledCampaigns = campaigns.filter((campaign) => campaign.status === "scheduled").length;
  const drafts = campaigns.filter((campaign) => campaign.status === "draft").length;
  const totals = campaigns.reduce((acc, campaign) => {
    const metrics = campaign.operational_metrics || {};
    return {
      sentCount: acc.sentCount + Number(metrics.sentCount || 0),
      deliveredCount: acc.deliveredCount + Number(metrics.deliveredCount || 0),
      readCount: acc.readCount + Number(metrics.readCount || 0),
      replyCount: acc.replyCount + Number(metrics.replyCount || 0),
      clickCount: acc.clickCount + Number(metrics.clickCount || 0),
      bookingCount: acc.bookingCount + Number(metrics.bookingCount || 0),
      failedCount: acc.failedCount + Number(metrics.failureCount || 0),
      revenueGenerated: acc.revenueGenerated + Number(metrics.revenueGenerated || 0),
    };
  }, {
    sentCount: 0,
    deliveredCount: 0,
    readCount: 0,
    replyCount: 0,
    clickCount: 0,
    bookingCount: 0,
      failedCount: 0,
      revenueGenerated: 0,
  });
  const comparatives = buildCampaignComparatives({
    campaigns,
    recipientRows,
    attributionRows: attributionsRes.data || [],
    opportunityRows: allOpportunities,
  });

  return {
    metrics: {
      drafts,
      scheduledCampaigns,
      activeOpportunities: activeOpportunities.length,
      estimatedPipelineRevenue: Number(totalEstimatedRevenue.toFixed(2)),
      templateCount: templates.length,
      sentCount: totals.sentCount,
      deliveredCount: totals.deliveredCount,
      readCount: totals.readCount,
      replyCount: totals.replyCount,
      clickCount: totals.clickCount,
      bookingCount: totals.bookingCount,
      failedCount: totals.failedCount,
      revenueGenerated: Number(totals.revenueGenerated.toFixed(2)),
    },
    campaigns: campaigns.slice(0, 12),
    opportunities: activeOpportunities,
    opportunitiesAll: allOpportunities,
    templates: templates.slice(0, 8),
    automations: (automations.data || []) as CampaignAutomationRecord[],
    automationRuns: automationRuns.data || [],
    automationRunLogs: automationRunLogs.data || [],
    comparatives,
    limits,
  };
}

export async function seedCampaignE2EScenario(params: {
  supabase: SupabaseClient;
  professionalId: string;
  userId: string;
  recipientsCount?: number;
}) {
  const now = new Date();
  const recipientsCount = Math.min(Math.max(Number(params.recipientsCount || 5), 1), 50);

  const campaign = await createOrUpdateCampaignDraft(params.supabase, {
    professionalId: params.professionalId,
    createdBy: params.userId,
    name: `Seed E2E ${now.toISOString().slice(0, 16).replace("T", " ")}`,
    type: "manual",
    objective: "reativacao",
    audienceType: "customizado",
    audienceFilterJson: { audienceType: "customizado", seed: true },
    audienceEstimateJson: {
      audienceCount: recipientsCount,
      estimatedConversionRate: 0.12,
      estimatedBookings: Number((recipientsCount * 0.12).toFixed(2)),
      estimatedRevenue: Number((recipientsCount * 65).toFixed(2)),
      seeded: true,
    },
    messageMode: "freeform",
    messageBody:
      "Oi, {nome}. Esta e uma campanha de teste E2E da Gende para validar fila, webhook e metricas.",
    ctaType: "link",
    ctaPayloadJson: { url: "https://gende.io" },
    sendConfigJson: { seed: true, source: "phase4_e2e_helper" },
    scheduledAt: null,
    sourceOpportunityId: null,
  });

  const seedRecipients = Array.from({ length: recipientsCount }).map((_, index) => {
    const serial = String(index + 1).padStart(4, "0");
    const phone = `55119999${serial}`;
    return {
      campaign_id: campaign.id,
      client_id: null,
      phone,
      personalization_payload_json: {
        seed: true,
        nome: `Cliente Seed ${index + 1}`,
        clientName: `Cliente Seed ${index + 1}`,
        link_agendamento: "https://gende.io",
      },
      recipient_status: "queued",
    };
  });

  const recipientsRes = await params.supabase
    .from("whatsapp_campaign_recipients")
    .insert(seedRecipients)
    .select("id, phone");
  if (recipientsRes.error) throw recipientsRes.error;
  const insertedRecipients = recipientsRes.data || [];

  const baseTime = Date.now();
  const jobs = insertedRecipients.map((recipient, index) => ({
    professional_id: params.professionalId,
    campaign_id: campaign.id,
    recipient_id: recipient.id,
    job_type: "send_message",
    status: "pending",
    attempt_count: 0,
    available_at: new Date(baseTime + index * 1000).toISOString(),
    idempotency_key: `seed:${campaign.id}:${recipient.id}`,
    payload_json: {
      seed: true,
      dryRun: true,
      phone: recipient.phone,
    },
  }));

  const jobsRes = await params.supabase
    .from("whatsapp_campaign_dispatch_jobs")
    .insert(jobs)
    .select("id");
  if (jobsRes.error) throw jobsRes.error;

  const events = insertedRecipients.map((recipient) => ({
    campaign_id: campaign.id,
    recipient_id: recipient.id,
    event_type: "queued",
    payload_json: { seed: true },
    occurred_at: now.toISOString(),
  }));
  await params.supabase.from("whatsapp_campaign_events").insert(events);

  return {
    campaignId: String(campaign.id),
    recipientsCount: insertedRecipients.length,
    jobsCount: (jobsRes.data || []).length,
    note:
      "Seed criado em modo dry-run. Ajuste os telefones antes de iniciar envio real em producao.",
  };
}
