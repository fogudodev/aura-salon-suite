import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { generateAIResponse } from "../_shared/ai-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function parseJsonArrayResponse(value: string) {
  const trimmed = value.trim();
  const candidates = [trimmed];
  const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
  if (jsonMatch) candidates.push(jsonMatch[0]);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore malformed candidate
    }
  }

  return [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const { professionalId, sourceServiceId, clientPhone } = await req.json();

    if (!professionalId || !sourceServiceId) {
      return new Response(JSON.stringify({ error: "Missing params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if upsell feature is enabled for this professional
    const { data: override } = await supabase
      .from("professional_feature_overrides")
      .select("enabled")
      .eq("professional_id", professionalId)
      .eq("feature_key", "upsell_inteligente")
      .maybeSingle();

    if (override && !override.enabled) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check global feature flag
    const { data: flag } = await supabase
      .from("feature_flags")
      .select("enabled")
      .eq("key", "upsell_inteligente")
      .maybeSingle();

    if (!flag?.enabled) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get upsell rules
    const { data: rules } = await supabase
      .from("upsell_rules")
      .select("*, recommended:recommended_service_id(id, name, price, duration_minutes, description)")
      .eq("professional_id", professionalId)
      .eq("source_service_id", sourceServiceId)
      .eq("is_active", true)
      .order("priority", { ascending: true })
      .limit(3);

    if (!rules || rules.length === 0) {
      // If no rules, try AI-based suggestion
      const { data: services } = await supabase
        .from("services")
        .select("id, name, price, duration_minutes")
        .eq("professional_id", professionalId)
        .eq("active", true)
        .neq("id", sourceServiceId);

      const { data: sourceService } = await supabase
        .from("services")
        .select("name, price")
        .eq("id", sourceServiceId)
        .single();

      if (!services || services.length === 0 || !sourceService) {
        return new Response(JSON.stringify({ suggestions: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const prompt = `Você é um especialista em vendas de salão de beleza. O cliente agendou "${sourceService.name}" (R$ ${sourceService.price}).

Serviços disponíveis para sugerir:
${services.map(s => `- ${s.name} (R$ ${Number(s.price).toFixed(2)}, ${s.duration_minutes} min, ID: ${s.id})`).join("\n")}

Selecione até 2 serviços que complementam melhor o serviço agendado. Para cada um, escreva uma frase de upsell natural e simpática (como uma recepcionista faria).

Responda APENAS com um JSON array:
[{"service_id": "uuid", "message": "frase de upsell"}]`;

      const aiResult = await generateAIResponse({
        professionalId,
        message: prompt,
        context: {
          useCase: "upsell",
          systemPrompt: "Responda apenas com JSON válido. Não use markdown. Não explique.",
          maxTokens: 300,
          temperature: 0.2,
        },
      });

      const aiSuggestions = parseJsonArrayResponse(aiResult.text) as Array<{ service_id?: string; message?: string }>;

      const enriched = aiSuggestions
        .map((s) => {
          const svc = services.find(sv => sv.id === s.service_id);
          if (!svc) return null;
          return {
            service: svc,
            promo_message: s.message || "",
            promo_price: null,
          };
        })
        .filter(Boolean);

      return new Response(JSON.stringify({ suggestions: enriched, source: "ai" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map rules to suggestions
    const suggestions = rules.map((r: { recommended: unknown; promo_message: string | null; promo_price: number | null }) => ({
      service: r.recommended,
      promo_message: r.promo_message,
      promo_price: r.promo_price,
    }));

    return new Response(JSON.stringify({ suggestions, source: "rules" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("upsell-suggest error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
