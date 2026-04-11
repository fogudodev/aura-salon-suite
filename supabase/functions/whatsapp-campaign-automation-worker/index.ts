import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { runActiveCampaignAutomations } from "../_shared/campaigns/automation-service.ts";
import {
  createSupabaseAdminClient,
  isFeatureEnabledForProfessional,
  invokeInternalWorker,
  isInternalWorkerAuthorized,
} from "../_shared/campaigns/runtime-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-campaign-automation-worker-secret",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isAuthorized(req: Request) {
  return isInternalWorkerAuthorized({
    request: req,
    workerSecretHeader: "x-campaign-automation-worker-secret",
    workerSecretEnv: "WHATSAPP_CAMPAIGN_AUTOMATION_WORKER_SECRET",
  });
}

async function triggerCampaignDispatchWorker(params: {
  batchSize?: number;
  maxBatches?: number;
}) {
  await invokeInternalWorker({
    functionName: "whatsapp-campaign-worker",
    payload: {
      batchSize: Number(params.batchSize || 20),
      maxBatches: Number(params.maxBatches || 2),
    },
    secretHeader: "x-campaign-worker-secret",
    secretEnv: "WHATSAPP_CAMPAIGN_WORKER_SECRET",
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!isAuthorized(req)) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const supabase = createSupabaseAdminClient();
    const professionalId = body.professionalId ? String(body.professionalId) : null;

    if (professionalId) {
      const enabled = await isFeatureEnabledForProfessional({
        supabase,
        professionalId,
        featureKey: "campaigns",
        requireGlobalEnabled: true,
        defaultEnabledWhenFlagMissing: false,
      });
      if (!enabled) {
        return json({
          processed: 0,
          completed: 0,
          skipped: 0,
          failed: 0,
          autoStarted: 0,
          generatedCampaigns: 0,
          runs: [],
          errors: [],
          skippedByFeatureFlag: true,
          professionalId,
        });
      }
    }

    const result = await runActiveCampaignAutomations({
      supabase,
      professionalId,
      limit: Number(body.limit || 20),
    });

    if (Number(result.autoStarted || 0) > 0 || Number(result.generatedCampaigns || 0) > 0) {
      await triggerCampaignDispatchWorker({
        batchSize: Number(body.batchSize || 20),
        maxBatches: Number(body.maxBatches || 2),
      });
    }

    return json(result);
  } catch (error) {
    console.error("whatsapp-campaign-automation-worker error:", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
