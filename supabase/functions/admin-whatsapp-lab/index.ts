import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { sendWhatsAppMessage } from "../_shared/whatsapp.ts";
import {
  cloneCampaignDraft,
  createOrUpdateCampaignDraft,
  getCampaignDashboardSnapshot,
  getCampaignDetails,
  previewCampaignBuilder,
  seedCampaignE2EScenario,
} from "../_shared/campaigns/campaign-service.ts";
import {
  listCampaignAutomations,
  listCampaignAutomationRuns,
  runActiveCampaignAutomations,
  runCampaignAutomation,
  toggleCampaignAutomation,
} from "../_shared/campaigns/automation-service.ts";
import {
  cancelCampaignExecution,
  pauseCampaignExecution,
  processCampaignDispatchQueue,
  startOrResumeCampaign,
  syncCampaignAttributionsForCampaign,
  syncCampaignAttributionsForProfessional,
  trackCampaignClickByToken,
  trackCampaignInboundReply,
  trackCampaignProviderStatus,
} from "../_shared/campaigns/execution.ts";
import {
  notifyProfessionalAboutOpportunity,
  recordLisOpportunityInteraction,
  syncLisRadarOpportunities,
} from "../_shared/campaigns/lis-radar.ts";
import { getAppBaseUrl } from "../_shared/campaigns/runtime-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type JsonObject = Record<string, unknown>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePhone(phone: string | null | undefined) {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) return digits;
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits;
}

async function parseJsonBody(req: Request): Promise<{ ok: boolean; data: JsonObject; error?: string }> {
  try {
    const raw = await req.text();
    if (!raw.trim()) return { ok: true, data: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, data: {}, error: "Request body must be a JSON object" };
    }
    return { ok: true, data: parsed as JsonObject };
  } catch {
    return { ok: false, data: {}, error: "Invalid JSON body" };
  }
}

async function assertAdminMaster(
  req: Request,
  supabaseAdmin: SupabaseClient,
): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Missing bearer token" };
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return { ok: false, status: 401, error: "Invalid bearer token" };

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user?.id) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const { data: role, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (roleError) {
    console.error("admin-whatsapp-lab role check error:", roleError);
    return { ok: false, status: 500, error: "Failed to validate admin role" };
  }

  if (!role) return { ok: false, status: 403, error: "Forbidden: admin master only" };
  return { ok: true, userId: String(userData.user.id) };
}

async function resolveProfessional(
  supabase: SupabaseClient,
  professionalId: string,
) {
  const { data, error } = await supabase
    .from("professionals")
    .select("id, name, business_name, phone, slug, created_at")
    .eq("id", professionalId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function resolveConnectedInstance(
  supabase: SupabaseClient,
  professionalId: string,
) {
  const { data, error } = await supabase
    .from("whatsapp_instances")
    .select("professional_id, instance_name, meta_phone_id, status, updated_at")
    .eq("professional_id", professionalId)
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function randomMessageId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

async function getContextData(
  supabase: SupabaseClient,
  professionalIdInput?: string,
) {
  const { data: professionals, error: professionalsError } = await supabase
    .from("professionals")
    .select("id, name, business_name, phone, slug, created_at")
    .order("created_at", { ascending: false })
    .limit(300);
  if (professionalsError) throw professionalsError;

  const selectedProfessionalId = asString(professionalIdInput) || String(professionals?.[0]?.id || "");
  if (!selectedProfessionalId) {
    return {
      professionals: professionals || [],
      selectedProfessionalId: null,
      context: null,
    };
  }

  const professional = await resolveProfessional(supabase, selectedProfessionalId);
  if (!professional) {
    throw new Error("Professional not found");
  }

  const [campaignIdsRes, instanceRes, campaignDashboardRes, opportunitiesRes, notificationsRes, dispatchJobsRes, attributionsRes, automations, automationRuns, lastWhatsappLogRes] = await Promise.all([
    supabase
      .from("whatsapp_campaigns")
      .select("id")
      .eq("professional_id", selectedProfessionalId)
      .limit(50),
    supabase
      .from("whatsapp_instances")
      .select("id, professional_id, instance_name, meta_phone_id, phone_number, status, updated_at, created_at")
      .eq("professional_id", selectedProfessionalId)
      .order("updated_at", { ascending: false }),
    getCampaignDashboardSnapshot(supabase, selectedProfessionalId),
    supabase
      .from("lis_campaign_opportunities")
      .select("*")
      .eq("professional_id", selectedProfessionalId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("lis_campaign_notifications")
      .select("*")
      .eq("professional_id", selectedProfessionalId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("whatsapp_campaign_dispatch_jobs")
      .select("id, status, campaign_id, recipient_id, attempt_count, available_at, locked_at, last_error, created_at")
      .eq("professional_id", selectedProfessionalId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("whatsapp_campaign_attributions")
      .select("*")
      .eq("professional_id", selectedProfessionalId)
      .order("created_at", { ascending: false })
      .limit(40),
    listCampaignAutomations(supabase, selectedProfessionalId),
    listCampaignAutomationRuns(supabase, selectedProfessionalId, 40),
    supabase
      .from("whatsapp_logs")
      .select("*")
      .eq("professional_id", selectedProfessionalId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (campaignIdsRes.error) throw campaignIdsRes.error;
  if (instanceRes.error) throw instanceRes.error;
  if (opportunitiesRes.error) throw opportunitiesRes.error;
  if (notificationsRes.error) throw notificationsRes.error;
  if (dispatchJobsRes.error) throw dispatchJobsRes.error;
  if (attributionsRes.error) throw attributionsRes.error;
  if (lastWhatsappLogRes.error) throw lastWhatsappLogRes.error;

  const campaignIds = (campaignIdsRes.data || []).map((item) => item.id);
  const [eventsRes, recipientsRes] = campaignIds.length > 0
    ? await Promise.all([
      supabase
        .from("whatsapp_campaign_events")
        .select("*")
        .in("campaign_id", campaignIds)
        .order("created_at", { ascending: false })
        .limit(80),
      supabase
        .from("whatsapp_campaign_recipients")
        .select("*")
        .in("campaign_id", campaignIds)
        .order("created_at", { ascending: false })
        .limit(80),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];

  if (eventsRes.error) throw eventsRes.error;
  if (recipientsRes.error) throw recipientsRes.error;

  const jobsSummary = (dispatchJobsRes.data || []).reduce((acc, job) => {
    const key = String(job.status || "unknown");
    acc[key] = Number(acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const evolutionConfigured = Boolean((Deno.env.get("EVOLUTION_API_URL") || "").trim() && (Deno.env.get("EVOLUTION_API_KEY") || "").trim());
  const officialConfigured = Boolean(
    (Deno.env.get("WHATSAPP_CLOUD_API_TOKEN") || "").trim() ||
    (Deno.env.get("META_WHATSAPP_TOKEN") || "").trim() ||
    (Deno.env.get("WHATSAPP_OFFICIAL_TOKEN") || "").trim(),
  );

  const instances = instanceRes.data || [];
  const connectedInstance = instances.find((inst) => String(inst.status || "") === "connected") || null;
  const connectedProviders: string[] = [];
  if (connectedInstance?.instance_name && evolutionConfigured) connectedProviders.push("evolution");
  if (connectedInstance?.meta_phone_id && officialConfigured) connectedProviders.push("official");

  return {
    professionals: professionals || [],
    selectedProfessionalId,
    context: {
      professional,
      instances,
      connectedInstance,
      providerAvailability: {
        evolutionConfigured,
        officialConfigured,
        connectedProviders,
      },
      campaignDashboard: campaignDashboardRes,
      opportunities: opportunitiesRes.data || [],
      notifications: notificationsRes.data || [],
      automations,
      automationRuns,
      dispatchJobs: dispatchJobsRes.data || [],
      dispatchJobsSummary: jobsSummary,
      recentEvents: eventsRes.data || [],
      recentRecipients: recipientsRes.data || [],
      recentAttributions: attributionsRes.data || [],
      lastWhatsappLog: lastWhatsappLogRes.data || null,
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const auth = await assertAdminMaster(req, supabase);
    if (!auth.ok) return jsonResponse({ success: false, error: auth.error }, auth.status);

    const parsedBody = await parseJsonBody(req);
    if (!parsedBody.ok) return jsonResponse({ success: false, error: parsedBody.error }, 400);

    const action = asString(parsedBody.data.action);
    if (!action) return jsonResponse({ success: false, error: "action is required" }, 400);

    const professionalId = asString(parsedBody.data.professionalId);
    if (action === "get-context") {
      const data = await getContextData(supabase, professionalId || undefined);
      return jsonResponse({ success: true, ...data });
    }

    if (!professionalId) {
      return jsonResponse({ success: false, error: "professionalId is required for this action" }, 400);
    }

    const professional = await resolveProfessional(supabase, professionalId);
    if (!professional) return jsonResponse({ success: false, error: "Professional not found" }, 404);

    switch (action) {
      case "send-direct-message": {
        const message = asString(parsedBody.data.message);
        if (!message) return jsonResponse({ success: false, error: "message is required" }, 400);

        const shouldSendToProfessional = asString(parsedBody.data.sendToProfessional) === "true" || parsedBody.data.sendToProfessional === true;
        const destinationRaw = shouldSendToProfessional
          ? asString(professional.phone)
          : (asString(parsedBody.data.recipientPhone) || asString(parsedBody.data.destinationPhone) || asString(parsedBody.data.toPhone));
        const destinationPhone = normalizePhone(destinationRaw);
        if (!destinationPhone) return jsonResponse({ success: false, error: "Destination phone is invalid" }, 400);

        const instance = await resolveConnectedInstance(supabase, professionalId);
        if (!instance) {
          return jsonResponse({ success: false, error: "No connected WhatsApp instance for this professional" }, 400);
        }

        const preferredProviderRaw = asString(parsedBody.data.preferredProvider).toLowerCase();
        const preferredProvider = preferredProviderRaw === "official" ? "official" : "evolution";
        const sendResult = await sendWhatsAppMessage({
          supabase,
          professionalId,
          recipient: destinationPhone,
          message,
          instance,
          preferredProvider,
          details: {
            source: "admin_whatsapp_lab_direct_send",
            requested_by_admin_user_id: auth.userId,
          },
        });

        return jsonResponse({
          success: sendResult.success,
          sendResult,
          instance,
          professional: {
            id: professional.id,
            business_name: professional.business_name,
            phone: professional.phone,
          },
        }, sendResult.success ? 200 : 400);
      }

      case "lis-generate-opportunities": {
        const opportunities = await syncLisRadarOpportunities({
          supabase,
          professionalId,
        });

        const autoNotifyTop = Math.max(0, Math.min(asNumber(parsedBody.data.autoNotifyTop, 0), 5));
        const notifications: Array<Record<string, unknown>> = [];
        if (autoNotifyTop > 0) {
          for (const opportunity of opportunities.slice(0, autoNotifyTop)) {
            const result = await notifyProfessionalAboutOpportunity({
              supabase,
              professionalId,
              opportunityId: String(opportunity.id),
            });
            notifications.push({ opportunityId: opportunity.id, ...result });
          }
        }

        return jsonResponse({
          success: true,
          generatedCount: opportunities.length,
          opportunities,
          notifications,
        });
      }

      case "lis-notify-opportunity": {
        const opportunityId = asString(parsedBody.data.opportunityId);
        if (!opportunityId) return jsonResponse({ success: false, error: "opportunityId is required" }, 400);
        const result = await notifyProfessionalAboutOpportunity({
          supabase,
          professionalId,
          opportunityId,
        });
        return jsonResponse({ success: true, result });
      }

      case "lis-opportunity-action": {
        const opportunityId = asString(parsedBody.data.opportunityId);
        const kind = asString(parsedBody.data.kind);
        if (!opportunityId || !kind) {
          return jsonResponse({ success: false, error: "opportunityId and kind are required" }, 400);
        }

        if (kind === "generate_campaign") {
          const { data: opportunity, error: opportunityError } = await supabase
            .from("lis_campaign_opportunities")
            .select("*")
            .eq("id", opportunityId)
            .eq("professional_id", professionalId)
            .single();
          if (opportunityError) throw opportunityError;

          const campaign = await createOrUpdateCampaignDraft(supabase, {
            professionalId,
            sourceOpportunityId: opportunity.id,
            name: `Lis • ${opportunity.title}`,
            type: "suggested",
            objective: opportunity.suggested_campaign_objective,
            audienceType: String(opportunity.suggested_audience_json?.audienceType || "customizado"),
            audienceFilterJson: opportunity.suggested_audience_json || {},
            audienceEstimateJson: {
              audienceCount: opportunity.audience_count,
              estimatedConversionRate: opportunity.estimated_conversion_rate,
              estimatedBookings: opportunity.estimated_bookings,
              estimatedRevenue: opportunity.estimated_revenue,
            },
            messageMode: "hybrid",
            templateId: null,
            templateName: null,
            messageBody: String(opportunity.suggested_message || ""),
            ctaType: String(opportunity.suggested_cta || "none"),
            ctaPayloadJson: {
              bookingLink: `${getAppBaseUrl()}/${professional.slug || ""}`,
            },
            sendConfigJson: {
              suggestedSendTime: opportunity.suggested_send_time,
              source: "admin_whatsapp_lab",
            },
            scheduledAt: null,
            createdBy: auth.userId,
          });

          await Promise.all([
            recordLisOpportunityInteraction({
              supabase,
              professionalId,
              opportunityId,
              interactionType: "generated_campaign",
              metadata: { campaign_id: campaign.id, source: "admin_whatsapp_lab" },
            }),
            supabase
              .from("lis_campaign_opportunities")
              .update({
                status: "converted_to_campaign",
                converted_campaign_id: campaign.id,
                converted_to_campaign_at: new Date().toISOString(),
              })
              .eq("id", opportunityId)
              .eq("professional_id", professionalId),
          ]);

          return jsonResponse({ success: true, campaign });
        }

        const allowedKinds = new Set(["viewed", "dismissed", "remind_later", "opened_details"]);
        if (!allowedKinds.has(kind)) {
          return jsonResponse({ success: false, error: `Unsupported opportunity action kind: ${kind}` }, 400);
        }

        await recordLisOpportunityInteraction({
          supabase,
          professionalId,
          opportunityId,
          interactionType: kind as "viewed" | "dismissed" | "remind_later" | "opened_details",
          metadata: { source: "admin_whatsapp_lab" },
        });
        return jsonResponse({ success: true });
      }

      case "campaign-create-draft": {
        const name = asString(parsedBody.data.name);
        const messageBody = asString(parsedBody.data.messageBody || parsedBody.data.message);
        if (!name || !messageBody) {
          return jsonResponse({ success: false, error: "name and messageBody are required" }, 400);
        }

        const campaign = await createOrUpdateCampaignDraft(supabase, {
          id: asString(parsedBody.data.id) || undefined,
          professionalId,
          sourceOpportunityId: asString(parsedBody.data.sourceOpportunityId) || null,
          name,
          type: asString(parsedBody.data.type || "manual"),
          objective: asString(parsedBody.data.objective || "reativacao"),
          audienceType: asString(parsedBody.data.audienceType || "todos"),
          audienceFilterJson: (parsedBody.data.audienceFilterJson as Record<string, unknown>) || {},
          audienceEstimateJson: (parsedBody.data.audienceEstimateJson as Record<string, unknown>) || {},
          messageMode: asString(parsedBody.data.messageMode || "freeform"),
          templateId: asString(parsedBody.data.templateId) || null,
          templateName: asString(parsedBody.data.templateName) || null,
          messageBody,
          ctaType: asString(parsedBody.data.ctaType || "none"),
          ctaPayloadJson: (parsedBody.data.ctaPayloadJson as Record<string, unknown>) || {},
          sendConfigJson: (parsedBody.data.sendConfigJson as Record<string, unknown>) || {},
          scheduledAt: asString(parsedBody.data.scheduledAt) || null,
          createdBy: auth.userId,
        });

        return jsonResponse({ success: true, campaign });
      }

      case "campaign-preview-builder": {
        const preview = await previewCampaignBuilder(supabase, {
          professionalId,
          objective: asString(parsedBody.data.objective || "reativacao"),
          filters: (parsedBody.data.audienceFilters as Record<string, unknown>) || {},
          messageInput: {
            messageBody: asString(parsedBody.data.messageBody || ""),
            ctaType: asString(parsedBody.data.ctaType || "none"),
            ctaPayload: (parsedBody.data.ctaPayload as Record<string, unknown>) || {},
          },
        });
        return jsonResponse({ success: true, preview });
      }

      case "campaign-details": {
        const campaignId = asString(parsedBody.data.campaignId);
        if (!campaignId) return jsonResponse({ success: false, error: "campaignId is required" }, 400);
        const details = await getCampaignDetails(supabase, professionalId, campaignId);
        return jsonResponse({ success: true, details });
      }

      case "campaign-start": {
        const campaignId = asString(parsedBody.data.campaignId);
        if (!campaignId) return jsonResponse({ success: false, error: "campaignId is required" }, 400);
        const campaign = await startOrResumeCampaign({
          supabase,
          professionalId,
          campaignId,
        });
        return jsonResponse({ success: true, campaign });
      }

      case "campaign-pause": {
        const campaignId = asString(parsedBody.data.campaignId);
        if (!campaignId) return jsonResponse({ success: false, error: "campaignId is required" }, 400);
        await pauseCampaignExecution({
          supabase,
          professionalId,
          campaignId,
          reason: asString(parsedBody.data.reason) || "admin_whatsapp_lab_pause",
        });
        return jsonResponse({ success: true });
      }

      case "campaign-cancel": {
        const campaignId = asString(parsedBody.data.campaignId);
        if (!campaignId) return jsonResponse({ success: false, error: "campaignId is required" }, 400);
        await cancelCampaignExecution({
          supabase,
          professionalId,
          campaignId,
          reason: asString(parsedBody.data.reason) || "admin_whatsapp_lab_cancel",
        });
        return jsonResponse({ success: true });
      }

      case "campaign-clone": {
        const campaignId = asString(parsedBody.data.campaignId);
        if (!campaignId) return jsonResponse({ success: false, error: "campaignId is required" }, 400);
        const campaign = await cloneCampaignDraft(supabase, professionalId, auth.userId, campaignId);
        return jsonResponse({ success: true, campaign });
      }

      case "worker-run-campaign": {
        const result = await processCampaignDispatchQueue({
          supabase,
          professionalId: asString(parsedBody.data.global) === "true" ? null : professionalId,
          batchSize: Math.max(1, Math.min(asNumber(parsedBody.data.batchSize, 20), 50)),
          maxBatches: Math.max(1, Math.min(asNumber(parsedBody.data.maxBatches, 3), 10)),
        });
        return jsonResponse({ success: true, result });
      }

      case "worker-run-automation": {
        const result = await runActiveCampaignAutomations({
          supabase,
          professionalId: asString(parsedBody.data.global) === "true" ? null : professionalId,
          limit: Math.max(1, Math.min(asNumber(parsedBody.data.limit, 20), 50)),
        });

        let dispatchResult: Record<string, unknown> | null = null;
        if (Number(result.autoStarted || 0) > 0 || Number(result.generatedCampaigns || 0) > 0) {
          dispatchResult = await processCampaignDispatchQueue({
            supabase,
            professionalId: asString(parsedBody.data.global) === "true" ? null : professionalId,
            batchSize: Math.max(1, Math.min(asNumber(parsedBody.data.batchSize, 20), 50)),
            maxBatches: Math.max(1, Math.min(asNumber(parsedBody.data.maxBatches, 3), 10)),
          }) as unknown as Record<string, unknown>;
        }

        return jsonResponse({ success: true, result, dispatchResult });
      }

      case "automation-run": {
        const automationId = asString(parsedBody.data.automationId);
        if (!automationId) return jsonResponse({ success: false, error: "automationId is required" }, 400);

        const result = await runCampaignAutomation({
          supabase,
          professionalId,
          automationId,
          triggeredBy: auth.userId,
          force: asString(parsedBody.data.force) === "true" || parsedBody.data.force === true,
        });

        let dispatchResult: Record<string, unknown> | null = null;
        const campaignId = asString((result as Record<string, unknown>).campaignId);
        if (campaignId) {
          dispatchResult = await processCampaignDispatchQueue({
            supabase,
            professionalId,
            batchSize: Math.max(1, Math.min(asNumber(parsedBody.data.batchSize, 20), 50)),
            maxBatches: Math.max(1, Math.min(asNumber(parsedBody.data.maxBatches, 2), 10)),
          }) as unknown as Record<string, unknown>;
        }

        return jsonResponse({ success: true, result, dispatchResult });
      }

      case "automation-toggle": {
        const automationId = asString(parsedBody.data.automationId);
        if (!automationId) return jsonResponse({ success: false, error: "automationId is required" }, 400);
        const automation = await toggleCampaignAutomation({
          supabase,
          professionalId,
          automationId,
          isActive: parsedBody.data.isActive === true || asString(parsedBody.data.isActive) === "true",
        });
        return jsonResponse({ success: true, automation });
      }

      case "automation-run-all": {
        const result = await runActiveCampaignAutomations({
          supabase,
          professionalId,
          limit: Math.max(1, Math.min(asNumber(parsedBody.data.limit, 20), 50)),
        });
        return jsonResponse({ success: true, result });
      }

      case "webhook-simulate-event": {
        const eventType = asString(parsedBody.data.eventType).toLowerCase();
        if (!eventType) return jsonResponse({ success: false, error: "eventType is required" }, 400);

        if (["sent", "delivered", "read", "failed"].includes(eventType)) {
          let providerMessageId = asString(parsedBody.data.providerMessageId);
          if (!providerMessageId) {
            const recipientId = asString(parsedBody.data.recipientId);
            if (!recipientId) {
              return jsonResponse({ success: false, error: "providerMessageId or recipientId is required for status events" }, 400);
            }

            const { data: recipient, error: recipientError } = await supabase
              .from("whatsapp_campaign_recipients")
              .select("provider_message_id")
              .eq("id", recipientId)
              .maybeSingle();
            if (recipientError) throw recipientError;
            providerMessageId = asString(recipient?.provider_message_id);
          }

          if (!providerMessageId) {
            return jsonResponse({ success: false, error: "No provider_message_id found for this recipient" }, 400);
          }

          const result = await trackCampaignProviderStatus({
            supabase,
            providerMessageId,
            status: eventType as "sent" | "delivered" | "read" | "failed",
            payload: {
              source: "admin_whatsapp_lab_webhook_simulator",
              simulated: true,
              error: asString(parsedBody.data.error) || undefined,
            },
          });
          return jsonResponse({ success: true, result });
        }

        if (eventType === "reply" || eventType === "opt_out") {
          const normalizedPhone = normalizePhone(asString(parsedBody.data.phone));
          if (!normalizedPhone) return jsonResponse({ success: false, error: "phone is required for reply/opt_out" }, 400);

          const text = eventType === "opt_out"
            ? (asString(parsedBody.data.text) || "parar")
            : (asString(parsedBody.data.text) || "Tenho interesse");

          const result = await trackCampaignInboundReply({
            supabase,
            professionalId,
            normalizedPhone,
            messageId: randomMessageId("lab_reply"),
            replyToMessageId: asString(parsedBody.data.replyToMessageId) || null,
            text,
            payload: {
              source: "admin_whatsapp_lab_webhook_simulator",
              simulated: true,
            },
          });
          return jsonResponse({ success: true, result });
        }

        if (eventType === "click") {
          const token = asString(parsedBody.data.token);
          if (!token) return jsonResponse({ success: false, error: "token is required for click event simulation" }, 400);
          const result = await trackCampaignClickByToken({
            supabase,
            token,
            userAgent: "admin-whatsapp-lab/simulated-click",
            ip: "127.0.0.1",
          });
          return jsonResponse({ success: true, result });
        }

        return jsonResponse({ success: false, error: `Unsupported eventType: ${eventType}` }, 400);
      }

      case "click-generate-link": {
        const campaignId = asString(parsedBody.data.campaignId);
        const recipientId = asString(parsedBody.data.recipientId);
        if (!campaignId || !recipientId) {
          return jsonResponse({ success: false, error: "campaignId and recipientId are required" }, 400);
        }

        const [campaignRes, recipientRes] = await Promise.all([
          supabase
            .from("whatsapp_campaigns")
            .select("id, professional_id, cta_payload_json")
            .eq("id", campaignId)
            .eq("professional_id", professionalId)
            .single(),
          supabase
            .from("whatsapp_campaign_recipients")
            .select("id, campaign_id")
            .eq("id", recipientId)
            .eq("campaign_id", campaignId)
            .single(),
        ]);
        if (campaignRes.error) throw campaignRes.error;
        if (recipientRes.error) throw recipientRes.error;

        const payload = (campaignRes.data.cta_payload_json || {}) as Record<string, unknown>;
        const targetUrl = asString(parsedBody.data.targetUrl) || asString(payload.url) || asString(payload.bookingLink) || `${getAppBaseUrl()}/${professional.slug || ""}`;
        if (!targetUrl) {
          return jsonResponse({ success: false, error: "targetUrl could not be resolved" }, 400);
        }

        const token = crypto.randomUUID().replaceAll("-", "");
        const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
        const { error: insertError } = await supabase
          .from("whatsapp_campaign_click_links")
          .insert({
            professional_id: professionalId,
            campaign_id: campaignId,
            recipient_id: recipientId,
            token,
            target_url: targetUrl,
            expires_at: expiresAt,
          });
        if (insertError) throw insertError;

        const trackedUrl = `${(Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "")}/functions/v1/whatsapp-campaign-click?t=${encodeURIComponent(token)}`;
        return jsonResponse({
          success: true,
          token,
          trackedUrl,
          targetUrl,
          expiresAt,
        });
      }

      case "click-simulate": {
        let token = asString(parsedBody.data.token);
        if (!token) {
          const clickLinkId = asString(parsedBody.data.clickLinkId);
          if (clickLinkId) {
            const { data: clickLink, error: clickLinkError } = await supabase
              .from("whatsapp_campaign_click_links")
              .select("token")
              .eq("id", clickLinkId)
              .maybeSingle();
            if (clickLinkError) throw clickLinkError;
            token = asString(clickLink?.token);
          }
        }

        if (!token) return jsonResponse({ success: false, error: "token or clickLinkId is required" }, 400);
        const result = await trackCampaignClickByToken({
          supabase,
          token,
          userAgent: "admin-whatsapp-lab/simulate-click",
          ip: "127.0.0.1",
        });
        return jsonResponse({ success: true, result });
      }

      case "attribution-run": {
        const campaignId = asString(parsedBody.data.campaignId);
        if (campaignId) {
          const result = await syncCampaignAttributionsForCampaign({
            supabase,
            professionalId,
            campaignId,
          });
          return jsonResponse({ success: true, scope: "campaign", campaignId, result });
        }

        const result = await syncCampaignAttributionsForProfessional({
          supabase,
          professionalId,
        });
        return jsonResponse({ success: true, scope: "professional", result });
      }

      case "e2e-seed-scenario": {
        const seed = await seedCampaignE2EScenario({
          supabase,
          professionalId,
          userId: auth.userId,
          recipientsCount: Math.max(1, Math.min(asNumber(parsedBody.data.recipientsCount, 5), 50)),
        });
        return jsonResponse({ success: true, seed });
      }

      case "e2e-run-flow": {
        const steps: Array<{ step: string; ok: boolean; result?: unknown; error?: string }> = [];

        const runStep = async <T>(step: string, fn: () => Promise<T>) => {
          try {
            const result = await fn();
            steps.push({ step, ok: true, result });
            return result;
          } catch (error) {
            steps.push({
              step,
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            });
            return null;
          }
        };

        const opportunities = await runStep("lis_detect_opportunities", async () => {
          return await syncLisRadarOpportunities({ supabase, professionalId });
        });

        const firstOpportunityId = opportunities?.[0]?.id ? String(opportunities[0].id) : "";
        if (firstOpportunityId) {
          await runStep("lis_notify_professional", async () => {
            return await notifyProfessionalAboutOpportunity({
              supabase,
              professionalId,
              opportunityId: firstOpportunityId,
            });
          });
        }

        const draft = await runStep("campaign_create_draft", async () => {
          return await createOrUpdateCampaignDraft(supabase, {
            professionalId,
            sourceOpportunityId: firstOpportunityId || null,
            name: `Lab E2E ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
            type: "manual",
            objective: "reativacao",
            audienceType: "todos",
            audienceFilterJson: {},
            audienceEstimateJson: {},
            messageMode: "freeform",
            templateId: null,
            templateName: null,
            messageBody: asString(parsedBody.data.messageBody) || "Mensagem E2E do laboratório interno.",
            ctaType: "link",
            ctaPayloadJson: { url: `${getAppBaseUrl()}/${professional.slug || ""}` },
            sendConfigJson: {
              source: "admin_whatsapp_lab_e2e",
            },
            scheduledAt: null,
            createdBy: auth.userId,
          });
        });

        const campaignId = asString(draft?.id);
        if (campaignId) {
          await runStep("campaign_start", async () => {
            return await startOrResumeCampaign({
              supabase,
              professionalId,
              campaignId,
            });
          });

          await runStep("campaign_worker_run", async () => {
            return await processCampaignDispatchQueue({
              supabase,
              professionalId,
              batchSize: Math.max(1, Math.min(asNumber(parsedBody.data.batchSize, 20), 50)),
              maxBatches: Math.max(1, Math.min(asNumber(parsedBody.data.maxBatches, 3), 8)),
            });
          });
        }

        const recipient = await runStep("load_latest_recipient", async () => {
          const { data, error } = await supabase
            .from("whatsapp_campaign_recipients")
            .select("id, campaign_id, provider_message_id, phone")
            .eq("campaign_id", campaignId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw error;
          return data;
        });

        const providerMessageId = asString(recipient?.provider_message_id);
        if (providerMessageId) {
          await runStep("webhook_delivered", async () => {
            return await trackCampaignProviderStatus({
              supabase,
              providerMessageId,
              status: "delivered",
              payload: { source: "admin_whatsapp_lab_e2e" },
            });
          });

          await runStep("webhook_read", async () => {
            return await trackCampaignProviderStatus({
              supabase,
              providerMessageId,
              status: "read",
              payload: { source: "admin_whatsapp_lab_e2e" },
            });
          });
        }

        const clickResult = await runStep("generate_and_simulate_click", async () => {
          if (!campaignId || !recipient?.id) return { skipped: true, reason: "campaign_or_recipient_missing" };
          const token = crypto.randomUUID().replaceAll("-", "");
          const targetUrl = `${getAppBaseUrl()}/${professional.slug || ""}`;
          const { error: insertError } = await supabase
            .from("whatsapp_campaign_click_links")
            .insert({
              professional_id: professionalId,
              campaign_id: campaignId,
              recipient_id: String(recipient.id),
              token,
              target_url: targetUrl,
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            });
          if (insertError) throw insertError;

          const tracking = await trackCampaignClickByToken({
            supabase,
            token,
            userAgent: "admin-whatsapp-lab/e2e",
            ip: "127.0.0.1",
          });
          return { token, targetUrl, tracking };
        });

        await runStep("run_attribution", async () => {
          if (!campaignId) return { skipped: true, reason: "campaign_missing" };
          return await syncCampaignAttributionsForCampaign({
            supabase,
            professionalId,
            campaignId,
          });
        });

        const context = await getContextData(supabase, professionalId);
        return jsonResponse({
          success: steps.every((step) => step.ok),
          steps,
          primaryIds: {
            professionalId,
            opportunityId: firstOpportunityId || null,
            campaignId: campaignId || null,
            recipientId: recipient?.id || null,
            providerMessageId: providerMessageId || null,
            clickToken: asString((clickResult as Record<string, unknown> | null)?.token) || null,
          },
          context,
        });
      }

      default:
        return jsonResponse({ success: false, error: `Unknown action: ${action}` }, 400);
    }
  } catch (error) {
    console.error("admin-whatsapp-lab unexpected error:", error);
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
