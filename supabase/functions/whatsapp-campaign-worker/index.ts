import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { processCampaignDispatchQueue } from "../_shared/campaigns/execution.ts";
import {
  createSupabaseAdminClient,
  isFeatureEnabledForProfessional,
  invokeInternalWorker,
  isInternalWorkerAuthorized,
} from "../_shared/campaigns/runtime-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-campaign-worker-secret",
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
    workerSecretHeader: "x-campaign-worker-secret",
    workerSecretEnv: "WHATSAPP_CAMPAIGN_WORKER_SECRET",
  });
}

async function triggerChainedRun(input: {
  batchSize?: number;
  maxBatches?: number;
  professionalId?: string | null;
  chainDepth?: number;
}) {
  await invokeInternalWorker({
    functionName: "whatsapp-campaign-worker",
    payload: {
      batchSize: input.batchSize,
      maxBatches: input.maxBatches,
      professionalId: input.professionalId,
      chainDepth: input.chainDepth,
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
    const batchSize = Number(body.batchSize || 20);
    const maxBatches = Number(body.maxBatches || 3);
    const chainDepth = Number(body.chainDepth || 0);
    const professionalId = body.professionalId ? String(body.professionalId) : null;
    const supabase = createSupabaseAdminClient();

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
          processedJobs: 0,
          sentJobs: 0,
          failedJobs: 0,
          retryingJobs: 0,
          remainingJobs: 0,
          activatedCampaigns: [],
          skipped: true,
          reason: "campaigns_feature_disabled",
          professionalId,
        });
      }
    }

    const result = await processCampaignDispatchQueue({
      supabase,
      batchSize,
      maxBatches,
      professionalId,
    });

    if (Number(result.remainingJobs || 0) > 0 && chainDepth < 3) {
      await triggerChainedRun({
        batchSize,
        maxBatches,
        professionalId,
        chainDepth: chainDepth + 1,
      });
    }

    return json(result);
  } catch (error) {
    console.error("whatsapp-campaign-worker error:", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
