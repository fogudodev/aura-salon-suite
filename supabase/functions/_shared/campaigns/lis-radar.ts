import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { sendWhatsAppMessage } from "../whatsapp.ts";
import {
  buildOpportunityWhatsappNotification,
  calculateUrgencyLevel,
} from "./domain.ts";
import { detectLisOpportunities } from "./opportunity-engine.ts";
import { getAppBaseUrl } from "./runtime-config.ts";

type PreferredProvider = "evolution" | "official";

function buildCooldownKey(professionalId: string, dedupeKey: string) {
  return `${professionalId}:${dedupeKey}`;
}

function extractProviderMessageId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;

  const direct = record.messageId || record.id || record.message_id || record.msgId;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  if (Array.isArray(record.messages) && record.messages[0] && typeof record.messages[0] === "object") {
    const nested = record.messages[0] as Record<string, unknown>;
    if (typeof nested.id === "string" && nested.id.trim()) return nested.id.trim();
  }

  if (record.key && typeof record.key === "object") {
    const keyRecord = record.key as Record<string, unknown>;
    if (typeof keyRecord.id === "string" && keyRecord.id.trim()) return keyRecord.id.trim();
  }

  if (record.data && typeof record.data === "object") {
    return extractProviderMessageId(record.data);
  }

  return null;
}

function buildProviderFailureReason(input: {
  error?: string;
  responseStatus?: number;
  responseBody?: unknown;
}) {
  const parts: string[] = [];
  if (input.error) parts.push(input.error);
  if (input.responseStatus) parts.push(`status=${input.responseStatus}`);
  if (!input.error && input.responseBody) {
    const raw = typeof input.responseBody === "string" ? input.responseBody : JSON.stringify(input.responseBody);
    if (raw) parts.push(raw);
  }
  return parts.join(" | ") || "notification_failed";
}

function normalizePreferredProvider(value: unknown): PreferredProvider {
  return typeof value === "string" && value.toLowerCase() === "official" ? "official" : "evolution";
}

function resolveNotificationPreferredProvider(params: {
  requested?: unknown;
  instance: Record<string, unknown> | null;
}): PreferredProvider {
  const requested = normalizePreferredProvider(params.requested);
  const hasEvolution = !!(
    String(params.instance?.instance_name || "").trim() &&
    String(params.instance?.status || "").toLowerCase() === "connected"
  );
  const hasOfficial = !!String(params.instance?.meta_phone_id || "").trim();

  if (requested === "official" && hasOfficial) return "official";
  if (requested === "evolution" && hasEvolution) return "evolution";
  if (hasOfficial) return "official";
  return "evolution";
}

export async function syncLisRadarOpportunities(params: {
  supabase: SupabaseClient;
  professionalId: string;
}) {
  const { supabase, professionalId } = params;
  const generated = await detectLisOpportunities({ supabase, professionalId });

  const upserted: Array<Record<string, unknown>> = [];
  for (const opportunity of generated) {
    const existingRes = await supabase
      .from("lis_campaign_opportunities")
      .select("id, status, snoozed_until, converted_campaign_id")
      .eq("professional_id", professionalId)
      .eq("dedupe_key", opportunity.dedupeKey)
      .maybeSingle();

    if (existingRes.error) throw existingRes.error;

    if (existingRes.data?.converted_campaign_id) {
      upserted.push(existingRes.data);
      continue;
    }

    const payload = {
      professional_id: professionalId,
      dedupe_key: opportunity.dedupeKey,
      type: opportunity.type,
      title: opportunity.title,
      summary: opportunity.summary,
      reason: opportunity.reason,
      urgency_level: opportunity.urgency_level || calculateUrgencyLevel({
        estimatedRevenue: opportunity.estimated_revenue,
        audienceCount: opportunity.audience_count,
        expiresAt: opportunity.expires_at,
      }),
      confidence_score: opportunity.confidence_score,
      audience_count: opportunity.audience_count,
      estimated_conversion_rate: opportunity.estimated_conversion_rate,
      estimated_bookings: opportunity.estimated_bookings,
      estimated_revenue: opportunity.estimated_revenue,
      suggested_campaign_objective: opportunity.suggested_campaign_objective,
      suggested_message: opportunity.suggested_message,
      suggested_cta: opportunity.suggested_cta,
      suggested_send_time: opportunity.suggested_send_time,
      suggested_audience_json: opportunity.suggested_audience_json,
      source_metrics_json: opportunity.source_metrics_json || {},
      status: existingRes.data?.status === "dismissed" ? "dismissed" : existingRes.data?.status || "new",
      expires_at: opportunity.expires_at,
    };

    const opRes = existingRes.data
      ? await supabase
        .from("lis_campaign_opportunities")
        .update(payload)
        .eq("id", existingRes.data.id)
        .select()
        .single()
      : await supabase
        .from("lis_campaign_opportunities")
        .insert(payload)
        .select()
        .single();

    if (opRes.error) throw opRes.error;
    upserted.push(opRes.data);
  }

  const existingKeys = new Set(generated.map((item) => item.dedupeKey));
  let expireQuery = supabase
    .from("lis_campaign_opportunities")
    .update({ status: "expired" })
    .eq("professional_id", professionalId)
    .in("status", ["new", "notified", "viewed"]);

  if (existingKeys.size > 0) {
    expireQuery = expireQuery.not(
      "dedupe_key",
      "in",
      `(${Array.from(existingKeys).map((key) => `"${key}"`).join(",")})`,
    );
  }

  await expireQuery;

  return upserted;
}

export async function notifyProfessionalAboutOpportunity(params: {
  supabase: SupabaseClient;
  professionalId: string;
  opportunityId: string;
  preferredProvider?: PreferredProvider;
}) {
  const { supabase, professionalId, opportunityId, preferredProvider } = params;
  const [{ data: professional }, { data: opportunity }, instanceRes] = await Promise.all([
    supabase
      .from("professionals")
      .select("id, name, business_name, phone")
      .eq("id", professionalId)
      .single(),
    supabase
      .from("lis_campaign_opportunities")
      .select("*")
      .eq("id", opportunityId)
      .eq("professional_id", professionalId)
      .single(),
    supabase
      .from("whatsapp_instances")
      .select("professional_id, instance_name, meta_phone_id, status, updated_at")
      .eq("professional_id", professionalId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const instance = instanceRes.data;

  if (!opportunity || !professional) {
    throw new Error("Opportunity or professional not found");
  }
  if (instanceRes.error) {
    throw instanceRes.error;
  }

  const cooldownKey = buildCooldownKey(professionalId, opportunity.dedupe_key);
  const existingNotification = await supabase
    .from("lis_campaign_notifications")
    .select("id, cooldown_until")
    .eq("professional_id", professionalId)
    .eq("cooldown_key", cooldownKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingNotification.error) throw existingNotification.error;

  if (existingNotification.data?.cooldown_until && new Date(existingNotification.data.cooldown_until).getTime() > Date.now()) {
    return { skipped: true, reason: "cooldown_active" };
  }

  const messageBody = buildOpportunityWhatsappNotification({
    professionalName: professional.business_name || professional.name,
    opportunity: {
      opportunity_id: opportunity.id,
      type: opportunity.type,
      title: opportunity.title,
      summary: opportunity.summary,
      reason: opportunity.reason,
      urgency_level: opportunity.urgency_level,
      confidence_score: Number(opportunity.confidence_score || 0),
      audience_count: opportunity.audience_count,
      estimated_conversion_rate: Number(opportunity.estimated_conversion_rate || 0),
      estimated_bookings: Number(opportunity.estimated_bookings || 0),
      estimated_revenue: Number(opportunity.estimated_revenue || 0),
      suggested_campaign_objective: opportunity.suggested_campaign_objective,
      suggested_message: opportunity.suggested_message,
      suggested_cta: opportunity.suggested_cta,
      suggested_send_time: opportunity.suggested_send_time,
      suggested_audience_json: opportunity.suggested_audience_json || {},
      expires_at: opportunity.expires_at,
      dedupeKey: opportunity.dedupe_key,
      source_metrics_json: opportunity.source_metrics_json || {},
    },
    appBaseUrl: getAppBaseUrl(),
  });

  const notificationInsert = await supabase
    .from("lis_campaign_notifications")
    .insert({
      professional_id: professionalId,
      opportunity_id: opportunityId,
      channel: "whatsapp_internal",
      status: "pending",
      message_body: messageBody,
      payload_json: {
        cta_url: `${getAppBaseUrl()}/campaigns?opportunity=${opportunityId}`,
      },
      cooldown_key: cooldownKey,
      cooldown_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select()
    .single();

  if (notificationInsert.error) throw notificationInsert.error;

  if (!professional.phone || !instance) {
    await supabase
      .from("lis_campaign_notifications")
      .update({
        status: "failed",
        failure_reason: !professional.phone ? "professional_phone_missing" : "whatsapp_not_connected",
      })
      .eq("id", notificationInsert.data.id);
    return { skipped: true, reason: !professional.phone ? "professional_phone_missing" : "whatsapp_not_connected" };
  }

  const selectedPreferredProvider = resolveNotificationPreferredProvider({
    requested: preferredProvider,
    instance: instance as Record<string, unknown>,
  });

  const result = await sendWhatsAppMessage({
    supabase,
    professionalId,
    recipient: professional.phone,
    message: messageBody,
    instance,
    preferredProvider: selectedPreferredProvider,
    details: {
      source: "lis_radar_notification",
      opportunity_id: opportunityId,
    },
  });

  if (!result.success) {
    await supabase
      .from("lis_campaign_notifications")
      .update({
        status: "failed",
        failure_reason: buildProviderFailureReason({
          error: result.error,
          responseStatus: result.responseStatus,
          responseBody: result.responseBody,
        }),
        provider: result.provider,
      })
      .eq("id", notificationInsert.data.id);
    return { success: false, error: result.error || "notification_failed" };
  }

  const providerMessageId = extractProviderMessageId(result.responseBody ?? null);
  await Promise.all([
    supabase
      .from("lis_campaign_notifications")
      .update({
        status: "sent",
        provider: result.provider,
        provider_message_id: providerMessageId,
        failure_reason: null,
        sent_at: new Date().toISOString(),
      })
      .eq("id", notificationInsert.data.id),
    supabase
      .from("lis_campaign_opportunities")
      .update({
        status: "notified",
        notified_at: new Date().toISOString(),
        last_notification_at: new Date().toISOString(),
      })
      .eq("id", opportunityId),
  ]);

  return { success: true };
}

export async function recordLisOpportunityInteraction(params: {
  supabase: SupabaseClient;
  professionalId: string;
  opportunityId: string;
  interactionType: "viewed" | "dismissed" | "remind_later" | "generated_campaign" | "opened_details";
  metadata?: Record<string, unknown>;
}) {
  const { supabase, professionalId, opportunityId, interactionType, metadata } = params;
  const opportunityUpdate: Record<string, unknown> = {};
  const { data: notification } = await supabase
    .from("lis_campaign_notifications")
    .select("id")
    .eq("professional_id", professionalId)
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (interactionType === "viewed" || interactionType === "opened_details") {
    opportunityUpdate.status = "viewed";
    opportunityUpdate.viewed_at = new Date().toISOString();
  }
  if (interactionType === "dismissed") {
    opportunityUpdate.status = "dismissed";
    opportunityUpdate.dismissed_at = new Date().toISOString();
  }
  if (interactionType === "remind_later") {
    opportunityUpdate.status = "viewed";
    opportunityUpdate.snoozed_until = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (Object.keys(opportunityUpdate).length > 0) {
    await supabase
      .from("lis_campaign_opportunities")
      .update(opportunityUpdate)
      .eq("id", opportunityId)
      .eq("professional_id", professionalId);
  }

  const { error } = await supabase
    .from("lis_campaign_opportunity_interactions")
    .insert({
      professional_id: professionalId,
      opportunity_id: opportunityId,
      notification_id: notification?.id || null,
      interaction_type: interactionType,
      metadata_json: metadata || {},
    });
  if (error) throw error;

  if (notification?.id) {
    const notificationUpdate: Record<string, unknown> = {};
    if (interactionType === "viewed" || interactionType === "opened_details") {
      notificationUpdate.viewed_at = new Date().toISOString();
      notificationUpdate.status = "viewed";
    }
    if (interactionType === "generated_campaign" || interactionType === "dismissed" || interactionType === "remind_later") {
      notificationUpdate.acted_at = new Date().toISOString();
      notificationUpdate.status = interactionType === "generated_campaign" ? "acted" : "dismissed";
    }
    if (Object.keys(notificationUpdate).length > 0) {
      await supabase
        .from("lis_campaign_notifications")
        .update(notificationUpdate)
        .eq("id", notification.id);
    }
  }
}
