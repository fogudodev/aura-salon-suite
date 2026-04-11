import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { trackCampaignClickByToken } from "../_shared/campaigns/execution.ts";
import { createSupabaseAdminClient } from "../_shared/campaigns/runtime-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const token = (url.searchParams.get("t") || "").trim();
  if (!token) return json({ error: "missing_token" }, 400);

  try {
    const result = await trackCampaignClickByToken({
      supabase: createSupabaseAdminClient(),
      token,
      userAgent: req.headers.get("user-agent"),
      ip: req.headers.get("x-forwarded-for"),
    });

    if (!result.matched) return json({ error: "invalid_token" }, 404);
    const target = String(result.targetUrl || "").trim();
    if (!target) return json({ error: "missing_target" }, 404);

    return Response.redirect(target, 302);
  } catch (error) {
    console.error("whatsapp-campaign-click error:", error);
    return json({ error: "click_tracking_failed" }, 500);
  }
});
