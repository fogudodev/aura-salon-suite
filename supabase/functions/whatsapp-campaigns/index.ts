import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  archiveCampaignTemplate,
  cloneCampaignDraft,
  createOrUpdateCampaignDraft,
  getCampaignDashboardSnapshot,
  getCampaignDetails,
  getCampaignLimits,
  listCampaignTemplates,
  previewCampaignBuilder,
  seedCampaignE2EScenario,
  upsertCampaignTemplate,
} from "../_shared/campaigns/campaign-service.ts";
import {
  listCampaignAutomations,
  runActiveCampaignAutomations,
  runCampaignAutomation,
  saveCampaignAutomation,
  toggleCampaignAutomation,
} from "../_shared/campaigns/automation-service.ts";
import {
  cancelCampaignExecution,
  pauseCampaignExecution,
  startOrResumeCampaign,
  syncCampaignAttributionsForCampaign,
  syncCampaignAttributionsForProfessional,
} from "../_shared/campaigns/execution.ts";
import { recordLisOpportunityInteraction, notifyProfessionalAboutOpportunity, syncLisRadarOpportunities } from "../_shared/campaigns/lis-radar.ts";
import { buildToneVariations } from "../_shared/campaigns/templates.ts";
import {
  assertFeatureEnabledForProfessional,
  FeatureDisabledError,
  getAppBaseUrl,
  invokeInternalWorker,
  resolveProfessionalFromRequest,
} from "../_shared/campaigns/runtime-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type JsonObject = Record<string, unknown>;
type ParsedBodyResult = {
  ok: boolean;
  data: JsonObject;
  error?: string;
};
type SerializedError = {
  message: string;
  details: Record<string, unknown>;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function parseJsonBody(req: Request): Promise<ParsedBodyResult> {
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

function toSerializedError(error: unknown, fallbackMessage = "Unexpected error"): SerializedError {
  if (error instanceof Error) {
    return {
      message: error.message || fallbackMessage,
      details: {
        name: error.name,
        stack: (error.stack || "").split("\n").slice(0, 6).join("\n"),
      },
    };
  }

  if (error && typeof error === "object") {
    const obj = error as Record<string, unknown>;
    const nested = obj.error && typeof obj.error === "object" ? obj.error as Record<string, unknown> : null;
    const message = asString(obj.message) ||
      asString(obj.error_description) ||
      asString(obj.details) ||
      asString(nested?.message) ||
      fallbackMessage;

    return {
      message: message === "[object Object]" ? fallbackMessage : message,
      details: {
        code: obj.code || null,
        hint: obj.hint || null,
        details: obj.details || null,
        status: obj.status || null,
        raw: obj,
      },
    };
  }

  const value = String(error || "");
  return {
    message: value && value !== "[object Object]" ? value : fallbackMessage,
    details: { raw: value || null },
  };
}

async function triggerWorker(params: {
  professionalId?: string | null;
  batchSize?: number;
  maxBatches?: number;
}) {
  try {
    await invokeInternalWorker({
      functionName: "whatsapp-campaign-worker",
      payload: {
        professionalId: params.professionalId || null,
        batchSize: params.batchSize || 20,
        maxBatches: params.maxBatches || 3,
      },
      secretHeader: "x-campaign-worker-secret",
      secretEnv: "WHATSAPP_CAMPAIGN_WORKER_SECRET",
    });
  } catch (error) {
    console.error("triggerWorker error:", error);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  let action = "";
  let stage = "request_start";

  console.log("whatsapp-campaigns request", {
    requestId,
    method: req.method,
    path: new URL(req.url).pathname,
  });

  try {
    stage = "auth_resolve_professional";
    const { adminClient, userId, professionalId } = await resolveProfessionalFromRequest(req);
    console.log("whatsapp-campaigns auth ok", { requestId, userId, professionalId });

    stage = "feature_gate_check";
    await assertFeatureEnabledForProfessional({
      supabase: adminClient,
      professionalId,
      featureKey: "campaigns",
      requireGlobalEnabled: true,
      defaultEnabledWhenFlagMissing: false,
    });

    stage = "parse_body";
    const parsedBody = await parseJsonBody(req);
    if (!parsedBody.ok) {
      return json({ error: parsedBody.error }, 400);
    }
    const body = parsedBody.data;
    action = asString(body.action);
    if (!action) {
      return json({ error: "action is required" }, 400);
    }

    console.log("whatsapp-campaigns action", {
      requestId,
      action,
      professionalId,
    });

    stage = `action_${action}`;
    switch (action) {
      case "get-bootstrap": {
        console.log("whatsapp-campaigns query", { requestId, stage, query: "getCampaignDashboardSnapshot" });
        await syncCampaignAttributionsForProfessional({
          supabase: adminClient,
          professionalId,
        });
        await triggerWorker({
          professionalId,
          batchSize: 20,
          maxBatches: 1,
        });
        const snapshot = await getCampaignDashboardSnapshot(adminClient, professionalId);
        return json(snapshot);
      }

      case "get-limits": {
        console.log("whatsapp-campaigns query", { requestId, stage, query: "getCampaignLimits" });
        const limits = await getCampaignLimits(adminClient, professionalId);
        return json(limits);
      }

      case "preview-builder": {
        const preview = await previewCampaignBuilder(adminClient, {
          professionalId,
          objective: body.objective,
          filters: body.audienceFilters,
          messageInput: {
            messageBody: body.messageBody || "",
            ctaType: body.ctaType || "none",
            ctaPayload: body.ctaPayload || {},
          },
        });

        return json({
          ...preview,
          toneVariations: buildToneVariations(body.messageBody || ""),
        });
      }

      case "list-templates": {
        const templates = await listCampaignTemplates(adminClient, professionalId);
        return json({ templates });
      }

      case "save-template": {
        const template = await upsertCampaignTemplate(adminClient, professionalId, userId, {
          id: body.id,
          name: body.name,
          category: body.category,
          objective: body.objective,
          body: body.body,
          variablesJson: body.variablesJson,
          tone: body.tone,
          isAiGenerated: body.isAiGenerated,
          previewExampleJson: body.previewExampleJson,
        });
        return json({ template });
      }

      case "archive-template": {
        await archiveCampaignTemplate(adminClient, professionalId, body.templateId);
        return json({ success: true });
      }

      case "save-draft": {
        const campaign = await createOrUpdateCampaignDraft(adminClient, {
          id: body.id,
          professionalId,
          sourceOpportunityId: body.sourceOpportunityId,
          name: body.name,
          type: body.type,
          objective: body.objective,
          audienceType: body.audienceType,
          audienceFilterJson: body.audienceFilterJson,
          audienceEstimateJson: body.audienceEstimateJson || {},
          messageMode: body.messageMode,
          templateId: body.templateId,
          templateName: body.templateName,
          messageBody: body.messageBody,
          ctaType: body.ctaType,
          ctaPayloadJson: body.ctaPayloadJson || {},
          sendConfigJson: body.sendConfigJson || {},
          scheduledAt: body.scheduledAt || null,
          createdBy: userId,
        });

        if (body.sourceOpportunityId) {
          await recordLisOpportunityInteraction({
            supabase: adminClient,
            professionalId,
            opportunityId: body.sourceOpportunityId,
            interactionType: "generated_campaign",
            metadata: { campaign_id: campaign.id },
          });
          await adminClient
            .from("lis_campaign_opportunities")
            .update({
              status: "converted_to_campaign",
              converted_campaign_id: campaign.id,
              converted_to_campaign_at: new Date().toISOString(),
            })
            .eq("id", body.sourceOpportunityId)
            .eq("professional_id", professionalId);
        }

        return json({ campaign });
      }

      case "clone-campaign": {
        const campaign = await cloneCampaignDraft(adminClient, professionalId, userId, body.campaignId);
        return json({ campaign });
      }

      case "get-campaign": {
        console.log("whatsapp-campaigns query", { requestId, stage, query: "getCampaignDetails", campaignId: body.campaignId });
        await syncCampaignAttributionsForCampaign({
          supabase: adminClient,
          professionalId,
          campaignId: body.campaignId,
        });
        const details = await getCampaignDetails(adminClient, professionalId, body.campaignId);
        return json(details);
      }

      case "start-campaign": {
        const campaign = await startOrResumeCampaign({
          supabase: adminClient,
          professionalId,
          campaignId: body.campaignId,
        });
        await triggerWorker({
          professionalId,
          batchSize: Number(body.batchSize || 20),
          maxBatches: Number(body.maxBatches || 3),
        });
        return json({ campaign });
      }

      case "pause-campaign": {
        await pauseCampaignExecution({
          supabase: adminClient,
          professionalId,
          campaignId: body.campaignId,
          reason: body.reason || null,
        });
        return json({ success: true });
      }

      case "cancel-campaign": {
        await cancelCampaignExecution({
          supabase: adminClient,
          professionalId,
          campaignId: body.campaignId,
          reason: body.reason || null,
        });
        return json({ success: true });
      }

      case "list-opportunities": {
        console.log("whatsapp-campaigns query", { requestId, stage, query: "list lis_campaign_opportunities" });
        const { data, error } = await adminClient
          .from("lis_campaign_opportunities")
          .select("*")
          .eq("professional_id", professionalId)
          .order("estimated_revenue", { ascending: false })
          .limit(20);
        if (error) throw error;
        return json({ opportunities: data || [] });
      }

      case "list-automations": {
        const automations = await listCampaignAutomations(adminClient, professionalId);
        return json({ automations });
      }

      case "save-automation": {
        const automation = await saveCampaignAutomation({
          supabase: adminClient,
          professionalId,
          id: body.id,
          name: body.name,
          triggerType: body.triggerType,
          rulesJson: body.rulesJson || {},
          objective: body.objective,
          audienceType: body.audienceType,
          audienceFilterJson: body.audienceFilterJson || {},
          templateId: body.templateId || null,
          messageBody: body.messageBody || "",
          cooldownDays: body.cooldownDays,
          isActive: body.isActive,
          autoStart: body.autoStart,
          sendConfigJson: body.sendConfigJson || {},
        });
        return json({ automation });
      }

      case "toggle-automation": {
        const automation = await toggleCampaignAutomation({
          supabase: adminClient,
          professionalId,
          automationId: body.automationId,
          isActive: Boolean(body.isActive),
        });
        return json({ automation });
      }

      case "run-automation": {
        const result = await runCampaignAutomation({
          supabase: adminClient,
          professionalId,
          automationId: body.automationId,
          triggeredBy: userId,
          force: Boolean(body.force),
        });
        if ((result as { campaign?: { id?: string } }).campaign?.id) {
          await triggerWorker({
            professionalId,
            batchSize: Number(body.batchSize || 20),
            maxBatches: Number(body.maxBatches || 2),
          });
        }
        return json({ result });
      }

      case "run-automations": {
        const result = await runActiveCampaignAutomations({
          supabase: adminClient,
          professionalId,
          limit: Number(body.limit || 20),
        });
        if (Number(result.autoStarted || 0) > 0 || Number(result.generatedCampaigns || 0) > 0) {
          await triggerWorker({
            professionalId,
            batchSize: Number(body.batchSize || 20),
            maxBatches: Number(body.maxBatches || 2),
          });
        }
        return json({ result });
      }

      case "generate-opportunities": {
        const opportunities = await syncLisRadarOpportunities({
          supabase: adminClient,
          professionalId,
        });

        const activeOpportunities = opportunities.filter((opportunity) => {
          const status = String(opportunity.status || "new");
          const snoozedUntil = opportunity.snoozed_until ? new Date(String(opportunity.snoozed_until)).getTime() : 0;
          return ["new", "notified", "viewed"].includes(status) && snoozedUntil <= Date.now();
        });

        const notifications = [];
        for (const opportunity of activeOpportunities.slice(0, 3)) {
          const result = await notifyProfessionalAboutOpportunity({
            supabase: adminClient,
            professionalId,
            opportunityId: String(opportunity.id),
          });
          notifications.push({ opportunityId: opportunity.id, ...result });
        }

        return json({
          opportunities,
          notifications,
        });
      }

      case "opportunity-action": {
        const { opportunityId, kind } = body as {
          opportunityId: string;
          kind: "viewed" | "dismissed" | "remind_later" | "opened_details" | "generate_campaign";
        };

        if (kind === "generate_campaign") {
          const { data: opportunity, error } = await adminClient
            .from("lis_campaign_opportunities")
            .select("*")
            .eq("id", opportunityId)
            .eq("professional_id", professionalId)
            .single();
          if (error) throw error;

          const campaign = await createOrUpdateCampaignDraft(adminClient, {
            professionalId,
            sourceOpportunityId: opportunity.id,
            name: `Lis • ${opportunity.title}`,
            type: "suggested",
            objective: opportunity.suggested_campaign_objective,
            audienceType: (opportunity.suggested_audience_json?.audienceType || "customizado"),
            audienceFilterJson: opportunity.suggested_audience_json || {},
            audienceEstimateJson: {
              audienceCount: opportunity.audience_count,
              estimatedConversionRate: opportunity.estimated_conversion_rate,
              estimatedBookings: opportunity.estimated_bookings,
              estimatedRevenue: opportunity.estimated_revenue,
            },
            messageMode: "hybrid",
            messageBody: opportunity.suggested_message,
            ctaType: opportunity.suggested_cta,
            ctaPayloadJson: {
              bookingLink: `${getAppBaseUrl()}/${professionalId}`,
            },
            sendConfigJson: {
              suggestedSendTime: opportunity.suggested_send_time,
            },
            createdBy: userId,
          });

          await Promise.all([
            recordLisOpportunityInteraction({
              supabase: adminClient,
              professionalId,
              opportunityId,
              interactionType: "generated_campaign",
              metadata: { campaign_id: campaign.id },
            }),
            adminClient
              .from("lis_campaign_opportunities")
              .update({
                status: "converted_to_campaign",
                converted_campaign_id: campaign.id,
                converted_to_campaign_at: new Date().toISOString(),
              })
              .eq("id", opportunityId)
              .eq("professional_id", professionalId),
          ]);

          return json({ campaign });
        }

        await recordLisOpportunityInteraction({
          supabase: adminClient,
          professionalId,
          opportunityId,
          interactionType: kind,
        });
        return json({ success: true });
      }

      case "seed-e2e-scenario": {
        const enabled = String(Deno.env.get("WHATSAPP_CAMPAIGN_E2E_SEED_ENABLED") || "").toLowerCase() === "true";
        if (!enabled) {
          return json({
            error: "E2E seed helper disabled. Set WHATSAPP_CAMPAIGN_E2E_SEED_ENABLED=true to allow this action.",
          }, 403);
        }

        const seed = await seedCampaignE2EScenario({
          supabase: adminClient,
          professionalId,
          userId,
          recipientsCount: Number(body.recipientsCount || 5),
        });
        return json({ seed });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (error) {
    if (error instanceof FeatureDisabledError) {
      return json({
        error: "Feature campaigns is disabled for this professional",
        code: "feature_disabled",
        feature: error.featureKey,
        reason: error.reason,
        context: {
          requestId,
          action: action || null,
          stage,
        },
      }, error.status);
    }
    const serialized = toSerializedError(error, "whatsapp-campaigns failed");
    const unauthorized =
      serialized.message.toLowerCase() === "unauthorized" ||
      (serialized.details.code && String(serialized.details.code) === "401");
    console.error("whatsapp-campaigns error:", {
      requestId,
      action: action || "(unknown)",
      stage,
      message: serialized.message,
      details: serialized.details,
    });
    return json({
      error: serialized.message,
      details: {
        requestId,
        action: action || "(unknown)",
        stage,
        ...serialized.details,
      },
    }, unauthorized ? 401 : 500);
  }
});
