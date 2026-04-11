import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { generateAIResponse } from "../_shared/ai-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type JsonObject = Record<string, unknown>;

type BodyParseResult = {
  ok: boolean;
  data: JsonObject;
  error?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function parseJsonBody(req: Request): Promise<BodyParseResult> {
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

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) return digits;
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits;
}

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
      // Ignore malformed candidate.
    }
  }

  return [];
}

function getBearerToken(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "").trim();
  return token || null;
}

async function getUserIdFromToken(anonClient: ReturnType<typeof createClient>, token: string) {
  const { data, error } = await anonClient.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return String(data.claims.sub);
}

async function canOperateProfessional(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  professionalId: string,
) {
  const { data: roleRows, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "support"]);
  if (roleError) throw roleError;
  if (roleRows && roleRows.length > 0) return true;

  const { data: professional, error: professionalError } = await supabaseAdmin
    .from("professionals")
    .select("id")
    .eq("id", professionalId)
    .eq("user_id", userId)
    .maybeSingle();
  if (professionalError) throw professionalError;
  return !!professional;
}

async function resolveProfessionalContext(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  anonClient: ReturnType<typeof createClient>;
  req: Request;
  explicitProfessionalId: string;
  slug: string;
}) {
  const { supabaseAdmin, anonClient, req, explicitProfessionalId, slug } = params;

  if (slug) {
    const { data: professional, error: professionalError } = await supabaseAdmin
      .from("professionals")
      .select("id, slug")
      .eq("slug", slug)
      .maybeSingle();
    if (professionalError) throw professionalError;
    if (!professional) {
      return { ok: false, status: 404, error: "Professional not found for slug" };
    }

    if (explicitProfessionalId && explicitProfessionalId !== professional.id) {
      return { ok: false, status: 403, error: "professionalId does not match slug context" };
    }

    return { ok: true, professionalId: String(professional.id) };
  }

  if (!explicitProfessionalId) {
    return { ok: false, status: 400, error: "slug is required for public requests" };
  }

  const token = getBearerToken(req);
  if (!token) {
    return { ok: false, status: 401, error: "Missing bearer token for professional scope" };
  }

  const userId = await getUserIdFromToken(anonClient, token);
  if (!userId) {
    return { ok: false, status: 401, error: "Invalid token" };
  }

  const allowed = await canOperateProfessional(supabaseAdmin, userId, explicitProfessionalId);
  if (!allowed) {
    return { ok: false, status: 403, error: "You are not allowed to use this professionalId" };
  }

  return { ok: true, professionalId: explicitProfessionalId };
}

async function isUpsellEnabled(
  supabaseAdmin: ReturnType<typeof createClient>,
  professionalId: string,
) {
  const { data: globalFlag, error: globalFlagError } = await supabaseAdmin
    .from("feature_flags")
    .select("enabled")
    .eq("key", "upsell_inteligente")
    .maybeSingle();
  if (globalFlagError) throw globalFlagError;

  if (!globalFlag?.enabled) {
    return { enabled: false, reason: "feature_disabled" };
  }

  const { data: override, error: overrideError } = await supabaseAdmin
    .from("professional_feature_overrides")
    .select("enabled")
    .eq("professional_id", professionalId)
    .eq("feature_key", "upsell_inteligente")
    .maybeSingle();
  if (overrideError) throw overrideError;

  if (override && !override.enabled) {
    return { enabled: false, reason: "professional_disabled" };
  }

  return { enabled: true, reason: null };
}

async function trackSuggestions(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  professionalId: string;
  sourceServiceId: string;
  clientPhone: string;
  suggestions: Array<{ service: { id: string } | null }>;
}) {
  const { supabaseAdmin, professionalId, sourceServiceId, clientPhone, suggestions } = params;
  if (!suggestions.length) return;

  const normalizedPhone = normalizePhone(clientPhone);
  const rows = suggestions
    .map((suggestion) => {
      const recommendedServiceId = suggestion.service?.id || "";
      if (!recommendedServiceId) return null;

      return {
        professional_id: professionalId,
        source_service_id: sourceServiceId,
        recommended_service_id: recommendedServiceId,
        client_phone: normalizedPhone || null,
        channel: "web",
        status: "suggested",
        event_type: "suggested",
        value: 0,
        upsell_revenue: 0,
      };
    })
    .filter(Boolean);

  if (!rows.length) return;
  const { error } = await supabaseAdmin.from("upsell_events").insert(rows);
  if (error) throw error;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: req.headers.get("Authorization") || "",
      },
    },
  });

  try {
    const parsedBody = await parseJsonBody(req);
    if (!parsedBody.ok) {
      return jsonResponse({ success: false, error: parsedBody.error }, 400);
    }

    const sourceServiceId = asString(parsedBody.data.sourceServiceId);
    if (!sourceServiceId) {
      return jsonResponse({ success: false, error: "sourceServiceId is required" }, 400);
    }

    const resolvedContext = await resolveProfessionalContext({
      supabaseAdmin,
      anonClient,
      req,
      explicitProfessionalId: asString(parsedBody.data.professionalId),
      slug: asString(parsedBody.data.slug),
    });
    if (!resolvedContext.ok) {
      return jsonResponse({
        success: false,
        error: resolvedContext.error,
      }, resolvedContext.status);
    }

    const professionalId = resolvedContext.professionalId;
    const clientPhone = asString(parsedBody.data.clientPhone);

    const { data: sourceService, error: sourceServiceError } = await supabaseAdmin
      .from("services")
      .select("id, name, price")
      .eq("id", sourceServiceId)
      .eq("professional_id", professionalId)
      .eq("active", true)
      .maybeSingle();
    if (sourceServiceError) throw sourceServiceError;

    if (!sourceService) {
      return jsonResponse({ success: false, error: "Source service not found" }, 404);
    }

    const feature = await isUpsellEnabled(supabaseAdmin, professionalId);
    if (!feature.enabled) {
      return jsonResponse({ suggestions: [], reason: feature.reason }, 200);
    }

    const { data: rules, error: rulesError } = await supabaseAdmin
      .from("upsell_rules")
      .select("recommended:recommended_service_id(id, name, price, duration_minutes, description), promo_message, promo_price")
      .eq("professional_id", professionalId)
      .eq("source_service_id", sourceServiceId)
      .eq("is_active", true)
      .order("priority", { ascending: true })
      .limit(3);
    if (rulesError) throw rulesError;

    if (rules && rules.length > 0) {
      const suggestions = rules
        .map((rule: Record<string, unknown>) => ({
          service: rule.recommended as { id: string; name: string; price: number; duration_minutes: number; description?: string } | null,
          promo_message: asString(rule.promo_message),
          promo_price: typeof rule.promo_price === "number" ? rule.promo_price : null,
        }))
        .filter((item) => !!item.service?.id);

      if (suggestions.length > 0) {
        await trackSuggestions({
          supabaseAdmin,
          professionalId,
          sourceServiceId,
          clientPhone,
          suggestions,
        });
      }

      return jsonResponse({ suggestions, source: "rules" }, 200);
    }

    const { data: services, error: servicesError } = await supabaseAdmin
      .from("services")
      .select("id, name, price, duration_minutes")
      .eq("professional_id", professionalId)
      .eq("active", true)
      .neq("id", sourceServiceId);
    if (servicesError) throw servicesError;

    if (!services || services.length === 0) {
      return jsonResponse({ suggestions: [] }, 200);
    }

    const prompt = `Voce e especialista comercial em salao de beleza.
O cliente agendou "${sourceService.name}" (R$ ${Number(sourceService.price || 0).toFixed(2)}).

Servicos disponiveis para recomendar:
${services.map((service: Record<string, unknown>) => `- ${service.name} (R$ ${Number(service.price || 0).toFixed(2)}, ${Number(service.duration_minutes || 0)} min, ID: ${service.id})`).join("\n")}

Selecione ate 2 servicos complementares e gere uma frase curta de upsell para cada item.
Responda APENAS com JSON valido:
[{"service_id":"uuid","message":"frase"}]`;

    const aiResult = await generateAIResponse({
      professionalId,
      message: prompt,
      context: {
        useCase: "upsell",
        systemPrompt: "Responda apenas com JSON valido. Sem markdown.",
        maxTokens: 300,
        temperature: 0.2,
      },
    });

    const aiSuggestions = parseJsonArrayResponse(aiResult.text) as Array<{ service_id?: string; message?: string }>;
    const suggestions = aiSuggestions
      .map((item) => {
        const matched = services.find((service: Record<string, unknown>) => service.id === item.service_id);
        if (!matched) return null;
        return {
          service: matched as { id: string; name: string; price: number; duration_minutes: number },
          promo_message: asString(item.message),
          promo_price: null,
        };
      })
      .filter(Boolean) as Array<{ service: { id: string }; promo_message: string; promo_price: null }>;

    if (suggestions.length > 0) {
      await trackSuggestions({
        supabaseAdmin,
        professionalId,
        sourceServiceId,
        clientPhone,
        suggestions,
      });
    }

    return jsonResponse({ suggestions, source: "ai" }, 200);
  } catch (error) {
    console.error("upsell-suggest unexpected error:", error);
    return jsonResponse({ success: false, error: "Internal server error" }, 500);
  }
});
