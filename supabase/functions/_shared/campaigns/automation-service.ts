import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { previewCampaignAudience } from "./audience-builder.ts";
import { createOrUpdateCampaignDraft } from "./campaign-service.ts";
import { startOrResumeCampaign } from "./execution.ts";
import {
  resolveAutomationConfig,
  shouldAutoStartAutomation,
  shouldSkipAutomationRun,
} from "./phase3-domain.ts";
import type {
  CampaignAudienceFilters,
  CampaignAudienceType,
  CampaignAutomationRecord,
  CampaignAutomationRunRecord,
  CampaignObjective,
} from "./types.ts";

function getAppBaseUrl() {
  return (Deno.env.get("APP_BASE_URL") || "https://gende.io").replace(/\/$/, "");
}


function fallbackMessageByObjective(objective: CampaignObjective) {
  switch (objective) {
    case "reativacao":
      return "Oi, {nome}. A equipe da Lis identificou uma boa janela para seu retorno. Se quiser, ja deixo seu horario encaminhado: {link_agendamento}";
    case "preenchimento_agenda":
      return "Oi, {nome}. Abriu um horario excelente para voce e pensei em te avisar primeiro. Se quiser aproveitar: {link_agendamento}";
    case "manutencao":
      return "Oi, {nome}. Voce esta no momento ideal para manutencao de {servico}. Se fizer sentido, seu agendamento esta aqui: {link_agendamento}";
    case "aniversario":
      return "Oi, {nome}. Preparamos uma condicao especial para seu mes. Quer garantir um horario? {link_agendamento}";
    case "promocao":
      return "Oi, {nome}. Liberamos uma condicao por tempo limitado para {servico}. Se quiser aproveitar, reserve por aqui: {link_agendamento}";
    case "upsell":
      return "Oi, {nome}. Tenho uma sugestao que combina muito com seu ultimo atendimento. Se quiser, te mostro no agendamento: {link_agendamento}";
    default:
      return "Oi, {nome}. Tenho uma oportunidade comercial boa para voce. Se quiser, ja deixo seu horario encaminhado: {link_agendamento}";
  }
}

async function insertAutomationRunLog(params: {
  supabase: SupabaseClient;
  professionalId: string;
  automationId: string;
  runId?: string | null;
  level?: "info" | "warn" | "error";
  step: string;
  message: string;
  payload?: Record<string, unknown>;
}) {
  try {
    await params.supabase
      .from("whatsapp_campaign_automation_run_logs")
      .insert({
        professional_id: params.professionalId,
        automation_id: params.automationId,
        run_id: params.runId || null,
        level: params.level || "info",
        step: params.step,
        message: params.message,
        payload_json: params.payload || {},
      });
  } catch (error) {
    console.error("automation run log error:", error);
  }
}

async function startAutomationRun(params: {
  supabase: SupabaseClient;
  professionalId: string;
  automationId: string;
}) {
  const { data, error } = await params.supabase
    .from("whatsapp_campaign_automation_runs")
    .insert({
      professional_id: params.professionalId,
      automation_id: params.automationId,
      status: "started",
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as CampaignAutomationRunRecord;
}

async function finishAutomationRun(params: {
  supabase: SupabaseClient;
  run: CampaignAutomationRunRecord;
  automation: CampaignAutomationRecord;
  status: "completed" | "failed" | "skipped";
  campaignId?: string | null;
  audienceCount?: number;
  createdCampaign?: boolean;
  errorMessage?: string | null;
  resultJson?: Record<string, unknown>;
}) {
  const finishedAt = new Date().toISOString();
  const durationMs = Math.max(new Date(finishedAt).getTime() - new Date(params.run.started_at).getTime(), 0);
  const resultJson = params.resultJson || {};

  await Promise.all([
    params.supabase
      .from("whatsapp_campaign_automation_runs")
      .update({
        status: params.status,
        campaign_id: params.campaignId || null,
        audience_count: Number(params.audienceCount || 0),
        created_campaign: Boolean(params.createdCampaign),
        finished_at: finishedAt,
        duration_ms: durationMs,
        error_message: params.errorMessage || null,
        result_json: resultJson,
      })
      .eq("id", params.run.id),
    params.supabase
      .from("whatsapp_campaign_automations")
      .update({
        last_run_at: finishedAt,
        last_result_json: {
          status: params.status,
          finished_at: finishedAt,
          audience_count: Number(params.audienceCount || 0),
          created_campaign: Boolean(params.createdCampaign),
          campaign_id: params.campaignId || null,
          error: params.errorMessage || null,
          ...resultJson,
        },
      })
      .eq("id", params.automation.id),
  ]);
}

async function resolveTemplateBody(params: {
  supabase: SupabaseClient;
  professionalId: string;
  templateId?: string | null;
}) {
  if (!params.templateId) return null;
  const { data, error } = await params.supabase
    .from("whatsapp_campaign_templates")
    .select("body")
    .eq("id", params.templateId)
    .or(`professional_id.eq.${params.professionalId},professional_id.is.null`)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return data?.body ? String(data.body) : null;
}

export async function listCampaignAutomations(
  supabase: SupabaseClient,
  professionalId: string,
) {
  const { data, error } = await supabase
    .from("whatsapp_campaign_automations")
    .select("*")
    .eq("professional_id", professionalId)
    .order("is_active", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []) as CampaignAutomationRecord[];
}

export async function listCampaignAutomationRuns(
  supabase: SupabaseClient,
  professionalId: string,
  limit = 30,
) {
  const { data, error } = await supabase
    .from("whatsapp_campaign_automation_runs")
    .select(`
      *,
      automation:whatsapp_campaign_automations(id, name, trigger_type)
    `)
    .eq("professional_id", professionalId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function saveCampaignAutomation(params: {
  supabase: SupabaseClient;
  professionalId: string;
  id?: string;
  name: string;
  triggerType: string;
  rulesJson?: Record<string, unknown>;
  objective?: CampaignObjective;
  audienceType?: CampaignAudienceType;
  audienceFilterJson?: Record<string, unknown>;
  templateId?: string | null;
  messageBody?: string;
  cooldownDays?: number;
  isActive?: boolean;
  autoStart?: boolean;
  sendConfigJson?: Record<string, unknown>;
}) {
  const rules = params.rulesJson || {};
  const resolved = resolveAutomationConfig(params.triggerType, rules);
  const record = {
    professional_id: params.professionalId,
    name: params.name,
    trigger_type: params.triggerType,
    rules_json: rules,
    objective: params.objective || resolved.objective,
    audience_type: params.audienceType || resolved.audienceType,
    audience_filter_json: params.audienceFilterJson || resolved.audienceFilterJson,
    template_id: params.templateId || null,
    message_body: params.messageBody || "",
    cooldown_days: Math.max(Number(params.cooldownDays || 7), 0),
    is_active: Boolean(params.isActive),
    auto_start: Boolean(params.autoStart),
    send_config_json: params.sendConfigJson || {},
  };

  if (params.id) {
    const { data, error } = await params.supabase
      .from("whatsapp_campaign_automations")
      .update(record)
      .eq("id", params.id)
      .eq("professional_id", params.professionalId)
      .select("*")
      .single();
    if (error) throw error;
    return data as CampaignAutomationRecord;
  }

  const { data, error } = await params.supabase
    .from("whatsapp_campaign_automations")
    .insert(record)
    .select("*")
    .single();
  if (error) throw error;
  return data as CampaignAutomationRecord;
}

export async function toggleCampaignAutomation(params: {
  supabase: SupabaseClient;
  professionalId: string;
  automationId: string;
  isActive: boolean;
}) {
  const { data, error } = await params.supabase
    .from("whatsapp_campaign_automations")
    .update({ is_active: params.isActive })
    .eq("id", params.automationId)
    .eq("professional_id", params.professionalId)
    .select("*")
    .single();
  if (error) throw error;
  return data as CampaignAutomationRecord;
}

export async function runCampaignAutomation(params: {
  supabase: SupabaseClient;
  professionalId: string;
  automationId: string;
  triggeredBy?: string | null;
  force?: boolean;
}) {
  const { data: automation, error } = await params.supabase
    .from("whatsapp_campaign_automations")
    .select("*")
    .eq("id", params.automationId)
    .eq("professional_id", params.professionalId)
    .single();
  if (error) throw error;

  const automationRecord = automation as CampaignAutomationRecord;
  const skipCheck = shouldSkipAutomationRun({
    isActive: automationRecord.is_active,
    force: params.force,
    lastRunAt: automationRecord.last_run_at,
    cooldownDays: automationRecord.cooldown_days,
  });
  if (skipCheck.skip) {
    await insertAutomationRunLog({
      supabase: params.supabase,
      professionalId: params.professionalId,
      automationId: automationRecord.id,
      level: "warn",
      step: "skip_guard",
      message: `Automation skipped: ${skipCheck.reason}`,
      payload: {
        reason: skipCheck.reason,
        cooldownUntil: skipCheck.cooldownUntil || null,
      },
    });
    return {
      status: "skipped",
      reason: skipCheck.reason,
      cooldownUntil: skipCheck.cooldownUntil,
    };
  }

  const run = await startAutomationRun({
    supabase: params.supabase,
    professionalId: params.professionalId,
    automationId: automationRecord.id,
  });

  await insertAutomationRunLog({
    supabase: params.supabase,
    professionalId: params.professionalId,
    automationId: automationRecord.id,
    runId: run.id,
    step: "start",
    message: "Automation run started",
    payload: {
      triggerType: automationRecord.trigger_type,
      triggeredBy: params.triggeredBy || "automation_engine",
      autoStart: automationRecord.auto_start,
    },
  });

  try {
    const resolved = resolveAutomationConfig(automationRecord.trigger_type, automationRecord.rules_json || {});
    const objective = (automationRecord.objective || resolved.objective) as CampaignObjective;
    const audienceType = (automationRecord.audience_type || resolved.audienceType) as CampaignAudienceType;
    const audienceFilters = ((automationRecord.audience_filter_json && Object.keys(automationRecord.audience_filter_json).length > 0)
      ? automationRecord.audience_filter_json
      : resolved.audienceFilterJson) as CampaignAudienceFilters;

    const audiencePreview = await previewCampaignAudience({
      supabase: params.supabase,
      professionalId: params.professionalId,
      objective,
      filters: audienceFilters,
      previewRecipientLimit: 0,
    });

    await insertAutomationRunLog({
      supabase: params.supabase,
      professionalId: params.professionalId,
      automationId: automationRecord.id,
      runId: run.id,
      step: "audience_preview",
      message: "Audience preview calculated",
      payload: {
        audienceCount: audiencePreview.audienceCount,
        estimatedRevenue: audiencePreview.estimatedRevenue,
        estimatedBookings: audiencePreview.estimatedBookings,
      },
    });

    const minAudience = Math.max(Number((automationRecord.rules_json || {}).minAudience || 1), 1);
    if (audiencePreview.audienceCount < minAudience) {
      await insertAutomationRunLog({
        supabase: params.supabase,
        professionalId: params.professionalId,
        automationId: automationRecord.id,
        runId: run.id,
        level: "warn",
        step: "audience_guard",
        message: "Run skipped due to minimum audience guard",
        payload: {
          minAudience,
          audienceCount: audiencePreview.audienceCount,
        },
      });
      await finishAutomationRun({
        supabase: params.supabase,
        run,
        automation: automationRecord,
        status: "skipped",
        audienceCount: audiencePreview.audienceCount,
        createdCampaign: false,
        resultJson: {
          reason: "audience_below_min",
          minAudience,
          audienceCount: audiencePreview.audienceCount,
        },
      });
      return {
        status: "skipped",
        reason: "audience_below_min",
        audienceCount: audiencePreview.audienceCount,
        minAudience,
      };
    }

    const templateBody = await resolveTemplateBody({
      supabase: params.supabase,
      professionalId: params.professionalId,
      templateId: automationRecord.template_id,
    });

    const messageBody = String(automationRecord.message_body || "").trim()
      || templateBody
      || fallbackMessageByObjective(objective);
    const ctaType = String(automationRecord.send_config_json?.ctaType || "booking_link");
    const ctaPayloadJson = {
      bookingLink: `${getAppBaseUrl()}/${params.professionalId}`,
      ...(automationRecord.send_config_json?.ctaPayloadJson || {}),
    };

    const now = new Date();
    const scheduledAt = (() => {
      const delayMinutes = Number(automationRecord.send_config_json?.delayMinutes || 0);
      if (delayMinutes > 0) {
        return new Date(now.getTime() + delayMinutes * 60 * 1000).toISOString();
      }
      return null;
    })();

    const campaign = await createOrUpdateCampaignDraft(params.supabase, {
      professionalId: params.professionalId,
      name: `Auto • ${automationRecord.name} • ${now.toISOString().slice(0, 16).replace("T", " ")}`,
      type: "automated",
      objective,
      audienceType,
      audienceFilterJson: audienceFilters,
      audienceEstimateJson: {
        audienceCount: audiencePreview.audienceCount,
        estimatedConversionRate: audiencePreview.estimatedConversionRate,
        estimatedBookings: audiencePreview.estimatedBookings,
        estimatedRevenue: audiencePreview.estimatedRevenue,
        averageTicket: audiencePreview.averageTicket,
        generatedBy: "automation",
        automationId: automationRecord.id,
      },
      messageMode: automationRecord.template_id ? "hybrid" : "freeform",
      templateId: automationRecord.template_id || null,
      templateName: null,
      messageBody,
      ctaType: (ctaType as "none" | "whatsapp_reply" | "link" | "booking_link" | "coupon"),
      ctaPayloadJson,
      sendConfigJson: {
        ...(automationRecord.send_config_json || {}),
        triggerType: automationRecord.trigger_type,
        automationId: automationRecord.id,
        triggeredBy: params.triggeredBy || "automation_engine",
      },
      scheduledAt,
      createdBy: null,
    });

    await insertAutomationRunLog({
      supabase: params.supabase,
      professionalId: params.professionalId,
      automationId: automationRecord.id,
      runId: run.id,
      step: "campaign_draft_created",
      message: "Draft campaign generated from automation",
      payload: {
        campaignId: campaign.id,
        objective,
        audienceType,
        scheduledAt,
      },
    });

    const autoStart = shouldAutoStartAutomation({
      autoStart: Boolean(automationRecord.auto_start),
    });
    if (autoStart) {
      await startOrResumeCampaign({
        supabase: params.supabase,
        professionalId: params.professionalId,
        campaignId: campaign.id,
      });
      await insertAutomationRunLog({
        supabase: params.supabase,
        professionalId: params.professionalId,
        automationId: automationRecord.id,
        runId: run.id,
        step: "campaign_autostart",
        message: "Campaign auto-start executed",
        payload: {
          campaignId: campaign.id,
        },
      });
    }

    await finishAutomationRun({
      supabase: params.supabase,
      run,
      automation: automationRecord,
      status: "completed",
      campaignId: String(campaign.id),
      audienceCount: audiencePreview.audienceCount,
      createdCampaign: true,
      resultJson: {
        campaignId: campaign.id,
        autoStart,
        objective,
        audienceType,
      },
    });

    await insertAutomationRunLog({
      supabase: params.supabase,
      professionalId: params.professionalId,
      automationId: automationRecord.id,
      runId: run.id,
      step: "completed",
      message: "Automation run completed successfully",
      payload: {
        campaignId: campaign.id,
        autoStart,
      },
    });

    return {
      status: "completed",
      campaign,
      audience: audiencePreview,
      autoStart,
      runId: run.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await insertAutomationRunLog({
      supabase: params.supabase,
      professionalId: params.professionalId,
      automationId: automationRecord.id,
      runId: run.id,
      level: "error",
      step: "failed",
      message: "Automation run failed",
      payload: {
        error: errorMessage,
      },
    });
    await finishAutomationRun({
      supabase: params.supabase,
      run,
      automation: automationRecord,
      status: "failed",
      createdCampaign: false,
      errorMessage,
    });
    throw error;
  }
}

export async function runActiveCampaignAutomations(params: {
  supabase: SupabaseClient;
  professionalId?: string | null;
  limit?: number;
}) {
  let query = params.supabase
    .from("whatsapp_campaign_automations")
    .select("id, professional_id")
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (params.professionalId) {
    query = query.eq("professional_id", params.professionalId);
  }

  const { data, error } = await query.limit(Math.max(Number(params.limit || 20), 1));
  if (error) throw error;

  const runs = [];
  const errors: Array<{ automationId: string; professionalId: string; error: string }> = [];
  for (const row of data || []) {
    try {
      const result = await runCampaignAutomation({
        supabase: params.supabase,
        professionalId: String(row.professional_id),
        automationId: String(row.id),
        triggeredBy: "automation_scheduler",
        force: false,
      });
      runs.push({
        automationId: row.id,
        professionalId: row.professional_id,
        ...result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({
        automationId: String(row.id),
        professionalId: String(row.professional_id),
        error: message,
      });
    }
  }

  return {
    processed: runs.length + errors.length,
    completed: runs.filter((item) => item.status === "completed").length,
    skipped: runs.filter((item) => item.status === "skipped").length,
    failed: errors.length,
    autoStarted: runs.filter((item) => item.status === "completed" && Boolean(item.autoStart)).length,
    generatedCampaigns: runs.filter((item) => item.status === "completed" && !!(item as { campaign?: { id?: string } }).campaign?.id).length,
    runs,
    errors,
  };
}
