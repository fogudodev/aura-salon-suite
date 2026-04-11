import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { sendWhatsAppMessage } from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type BodyParseResult = {
  ok: boolean;
  data: Record<string, unknown>;
  error?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return null;
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => !!item);
}

function replaceVars(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value || "");
  }
  return result;
}

async function parseJsonBody(req: Request): Promise<BodyParseResult> {
  try {
    const raw = await req.text();
    if (!raw.trim()) {
      return { ok: true, data: {} };
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, data: {}, error: "Request body must be a JSON object" };
    }

    return { ok: true, data: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, data: {}, error: "Invalid JSON body" };
  }
}

async function verifyCampaignFeatureAccess(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  professionalId: string;
}) {
  const { supabaseAdmin, professionalId } = params;
  const { data: globalFlag, error: globalFlagError } = await supabaseAdmin
    .from("feature_flags")
    .select("enabled")
    .eq("key", "campaigns")
    .maybeSingle();
  if (globalFlagError) throw globalFlagError;

  if (globalFlag && globalFlag.enabled === false) {
    return { allowed: false, reason: "campaigns_feature_disabled_globally" };
  }

  const { data: override, error: overrideError } = await supabaseAdmin
    .from("professional_feature_overrides")
    .select("enabled")
    .eq("professional_id", professionalId)
    .eq("feature_key", "campaigns")
    .maybeSingle();
  if (overrideError) throw overrideError;

  if (override && override.enabled === false) {
    return { allowed: false, reason: "campaigns_feature_disabled_for_professional" };
  }

  return { allowed: true, reason: null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ success: false, error: "Missing bearer token" }, 401);
  }

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    },
  );

  try {
    const token = authHeader.replace("Bearer ", "").trim();
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return jsonResponse({ success: false, error: "Invalid token" }, 401);
    }
    const userId = String(claimsData.claims.sub);

    const parsedBody = await parseJsonBody(req);
    if (!parsedBody.ok) {
      return jsonResponse({ success: false, error: parsedBody.error }, 400);
    }

    const action = asString(parsedBody.data.action);
    if (!action) {
      return jsonResponse({ success: false, error: "action is required" }, 400);
    }

    const professionalId = asString(parsedBody.data.professionalId);
    if (!professionalId) {
      return jsonResponse({ success: false, error: "professionalId is required" }, 400);
    }

    const { data: professional, error: professionalError } = await supabaseAdmin
      .from("professionals")
      .select("id")
      .eq("id", professionalId)
      .eq("user_id", userId)
      .maybeSingle();
    if (professionalError) throw professionalError;
    if (!professional) {
      return jsonResponse({ success: false, error: "You are not allowed to use this professionalId" }, 403);
    }

    switch (action) {
      case "create-campaign": {
        const name = asString(parsedBody.data.name);
        const message = asString(parsedBody.data.message);
        if (!name) return jsonResponse({ success: false, error: "name is required" }, 400);
        if (!message) return jsonResponse({ success: false, error: "message is required" }, 400);

        let clientIds: string[] | undefined;
        if (parsedBody.data.clientIds !== undefined) {
          const parsedClientIds = asStringArray(parsedBody.data.clientIds);
          if (!parsedClientIds) {
            return jsonResponse({ success: false, error: "clientIds must be an array of strings" }, 400);
          }
          clientIds = parsedClientIds;
        }

        const featureAccess = await verifyCampaignFeatureAccess({
          supabaseAdmin,
          professionalId,
        });
        if (!featureAccess.allowed) {
          return jsonResponse({
            success: false,
            error: "Campanhas nao estao habilitadas para esta conta.",
            reason: featureAccess.reason,
          }, 403);
        }

        const { data: subscription, error: subscriptionError } = await supabaseAdmin
          .from("subscriptions")
          .select("plan_id")
          .eq("professional_id", professionalId)
          .maybeSingle();
        if (subscriptionError) throw subscriptionError;
        const planId = subscription?.plan_id || "free";

        const { data: limits, error: limitsError } = await supabaseAdmin
          .from("plan_limits")
          .select("*")
          .eq("plan_id", planId)
          .maybeSingle();
        if (limitsError) throw limitsError;
        if (!limits) {
          return jsonResponse({ success: false, error: "Plan limits not found for this account" }, 404);
        }

        const { data: professionalLimits, error: professionalLimitsError } = await supabaseAdmin
          .from("professional_limits")
          .select("*")
          .eq("professional_id", professionalId)
          .maybeSingle();
        if (professionalLimitsError) throw professionalLimitsError;

        const extraCampaigns = Number(professionalLimits?.extra_campaigns_purchased || 0);
        const extraContacts = Number(professionalLimits?.extra_contacts_purchased || 0);
        const effectiveDailyCampaigns = limits.daily_campaigns === -1
          ? -1
          : Number(limits.daily_campaigns || 0) + extraCampaigns;
        const effectiveMaxContacts = limits.campaign_max_contacts === -1
          ? -1
          : Number(limits.campaign_max_contacts || 0) + extraContacts;

        if (effectiveDailyCampaigns === 0 || effectiveMaxContacts === 0) {
          return jsonResponse({
            success: false,
            error: "Seu plano atual nao permite disparo de campanhas.",
          }, 403);
        }

        const today = new Date().toISOString().split("T")[0];
        const { data: usage, error: usageError } = await supabaseAdmin
          .from("daily_message_usage")
          .select("*")
          .eq("professional_id", professionalId)
          .eq("usage_date", today)
          .maybeSingle();
        if (usageError) throw usageError;

        const campaignsSent = Number(usage?.campaigns_sent || 0);
        if (effectiveDailyCampaigns !== -1 && campaignsSent >= effectiveDailyCampaigns) {
          return jsonResponse({
            success: false,
            error: `Limite diario de campanhas atingido (${effectiveDailyCampaigns} por dia).`,
          }, 403);
        }

        const { data: lastCampaign, error: lastCampaignError } = await supabaseAdmin
          .from("campaigns")
          .select("started_at")
          .eq("professional_id", professionalId)
          .not("started_at", "is", null)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastCampaignError) throw lastCampaignError;

        if (lastCampaign?.started_at) {
          const lastTime = new Date(lastCampaign.started_at).getTime();
          const minIntervalHours = Number(limits.campaign_min_interval_hours || 6);
          const minIntervalMs = minIntervalHours * 60 * 60 * 1000;
          if (Date.now() - lastTime < minIntervalMs) {
            const hoursLeft = ((minIntervalMs - (Date.now() - lastTime)) / (60 * 60 * 1000)).toFixed(1);
            return jsonResponse({
              success: false,
              error: `Aguarde ${hoursLeft}h antes de enviar outra campanha.`,
            }, 403);
          }
        }

        let clients: Array<{ id: string; name: string; phone: string }> = [];
        if (clientIds && clientIds.length > 0) {
          const { data, error } = await supabaseAdmin
            .from("clients")
            .select("id, name, phone")
            .eq("professional_id", professionalId)
            .in("id", clientIds)
            .not("phone", "is", null)
            .not("phone", "eq", "");
          if (error) throw error;
          clients = (data || []) as Array<{ id: string; name: string; phone: string }>;
        } else {
          const { data, error } = await supabaseAdmin
            .from("clients")
            .select("id, name, phone")
            .eq("professional_id", professionalId)
            .not("phone", "is", null)
            .not("phone", "eq", "");
          if (error) throw error;
          clients = (data || []) as Array<{ id: string; name: string; phone: string }>;
        }

        if (clients.length === 0) {
          return jsonResponse({ success: false, error: "Nenhum cliente com telefone encontrado" }, 404);
        }

        if (effectiveMaxContacts !== -1 && clients.length > effectiveMaxContacts) {
          clients = clients.slice(0, effectiveMaxContacts);
        }

        const { data: campaign, error: campaignError } = await supabaseAdmin
          .from("campaigns")
          .insert({
            professional_id: professionalId,
            name,
            message,
            status: "sending",
            target_type: clientIds?.length ? "selected" : "all_clients",
            total_contacts: clients.length,
            started_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (campaignError) throw campaignError;

        const contacts = clients.map((client) => ({
          campaign_id: campaign.id,
          client_id: client.id,
          phone: client.phone,
          client_name: client.name,
          status: "pending",
        }));

        const { error: insertContactsError } = await supabaseAdmin
          .from("campaign_contacts")
          .insert(contacts);
        if (insertContactsError) throw insertContactsError;

        const { data: instance, error: instanceError } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("professional_id, instance_name, meta_phone_id, status")
          .eq("professional_id", professionalId)
          .maybeSingle();
        if (instanceError) throw instanceError;

        if (!instance || instance.status !== "connected") {
          await supabaseAdmin.from("campaigns").update({ status: "failed" }).eq("id", campaign.id);
          return jsonResponse({ success: false, error: "WhatsApp nao conectado" }, 403);
        }

        const { data: professionalInfo, error: professionalInfoError } = await supabaseAdmin
          .from("professionals")
          .select("slug, name, business_name")
          .eq("id", professionalId)
          .maybeSingle();
        if (professionalInfoError) throw professionalInfoError;

        let sentCount = 0;
        let failedCount = 0;

        for (const contact of contacts) {
          if (!contact.phone || !contact.phone.trim()) {
            failedCount += 1;
            const { error: markNoPhoneError } = await supabaseAdmin
              .from("campaign_contacts")
              .update({ status: "failed", error_message: "phone_not_found" })
              .eq("campaign_id", campaign.id)
              .eq("phone", contact.phone);
            if (markNoPhoneError) console.error("send-campaign contact update error:", markNoPhoneError);
            continue;
          }

          const finalMessage = replaceVars(message, {
            nome: contact.client_name || "Cliente",
            link: professionalInfo?.slug ? `https://gende.io/${professionalInfo.slug}` : "",
            negocio: professionalInfo?.business_name || professionalInfo?.name || "",
          });

          try {
            const sendResult = await sendWhatsAppMessage({
              supabase: supabaseAdmin,
              professionalId,
              recipient: contact.phone,
              message: finalMessage,
              instance,
              preferredProvider: "evolution",
              details: {
                source: "send_campaign",
                campaign_id: campaign.id,
              },
            });

            if (sendResult.success) {
              sentCount += 1;
              const { error: markSentError } = await supabaseAdmin
                .from("campaign_contacts")
                .update({ status: "sent", sent_at: new Date().toISOString() })
                .eq("campaign_id", campaign.id)
                .eq("phone", contact.phone);
              if (markSentError) console.error("send-campaign contact update error:", markSentError);
            } else {
              failedCount += 1;
              const failureReason = sendResult.error || JSON.stringify(sendResult.responseBody ?? {});
              const { error: markFailedError } = await supabaseAdmin
                .from("campaign_contacts")
                .update({ status: "failed", error_message: failureReason })
                .eq("campaign_id", campaign.id)
                .eq("phone", contact.phone);
              if (markFailedError) console.error("send-campaign contact update error:", markFailedError);
            }
          } catch (error) {
            failedCount += 1;
            const errorMessage = error instanceof Error ? error.message : String(error);
            const { error: markExceptionError } = await supabaseAdmin
              .from("campaign_contacts")
              .update({ status: "failed", error_message: errorMessage })
              .eq("campaign_id", campaign.id)
              .eq("phone", contact.phone);
            if (markExceptionError) console.error("send-campaign contact update error:", markExceptionError);
          }

          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        const { error: updateCampaignError } = await supabaseAdmin
          .from("campaigns")
          .update({
            status: "completed",
            sent_count: sentCount,
            failed_count: failedCount,
            completed_at: new Date().toISOString(),
          })
          .eq("id", campaign.id);
        if (updateCampaignError) throw updateCampaignError;

        const { error: upsertUsageError } = await supabaseAdmin
          .from("daily_message_usage")
          .upsert({
            professional_id: professionalId,
            usage_date: today,
            campaigns_sent: campaignsSent + 1,
            reminders_sent: Number(usage?.reminders_sent || 0),
          }, { onConflict: "professional_id,usage_date" });
        if (upsertUsageError) throw upsertUsageError;

        return jsonResponse({
          success: true,
          campaignId: campaign.id,
          sent: sentCount,
          failed: failedCount,
          total: clients.length,
        });
      }

      case "get-limits": {
        const { data: subscription, error: subscriptionError } = await supabaseAdmin
          .from("subscriptions")
          .select("plan_id")
          .eq("professional_id", professionalId)
          .maybeSingle();
        if (subscriptionError) throw subscriptionError;

        const planId = subscription?.plan_id || "free";

        const { data: limits, error: limitsError } = await supabaseAdmin
          .from("plan_limits")
          .select("*")
          .eq("plan_id", planId)
          .maybeSingle();
        if (limitsError) throw limitsError;

        const today = new Date().toISOString().split("T")[0];
        const { data: usage, error: usageError } = await supabaseAdmin
          .from("daily_message_usage")
          .select("*")
          .eq("professional_id", professionalId)
          .eq("usage_date", today)
          .maybeSingle();
        if (usageError) throw usageError;

        const { data: professionalLimits, error: professionalLimitsError } = await supabaseAdmin
          .from("professional_limits")
          .select("*")
          .eq("professional_id", professionalId)
          .maybeSingle();
        if (professionalLimitsError) throw professionalLimitsError;

        return jsonResponse({
          success: true,
          planId,
          limits: limits || {
            daily_reminders: 5,
            daily_campaigns: 0,
            campaign_max_contacts: 0,
            campaign_min_interval_hours: 6,
          },
          extras: {
            extra_reminders: Number(professionalLimits?.extra_reminders_purchased || 0),
            extra_campaigns: Number(professionalLimits?.extra_campaigns_purchased || 0),
            extra_contacts: Number(professionalLimits?.extra_contacts_purchased || 0),
          },
          usage: {
            reminders_sent: Number(usage?.reminders_sent || 0),
            campaigns_sent: Number(usage?.campaigns_sent || 0),
          },
        });
      }

      default:
        return jsonResponse({ success: false, error: `Unknown action: ${action}` }, 400);
    }
  } catch (error) {
    console.error("send-campaign unexpected error:", error);
    return jsonResponse({ success: false, error: "Internal server error" }, 500);
  }
});
