import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { sendWhatsAppMessage } from "../_shared/whatsapp.ts";

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

type ScopeCheckResult = {
  allowed: boolean;
  reason?: string;
};

type FeatureCheckResult = {
  enabled: boolean;
  reason?: string;
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

function getBearerToken(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "").trim();
  return token || null;
}

async function getUserIdFromToken(
  anonClient: ReturnType<typeof createClient>,
  token: string,
) {
  const { data, error } = await anonClient.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return String(data.claims.sub);
}

async function canOperateProfessional(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  professionalId: string,
): Promise<ScopeCheckResult> {
  const { data: roleRows, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "support"]);
  if (roleError) throw roleError;
  if (roleRows && roleRows.length > 0) return { allowed: true };

  const { data: professional, error: professionalError } = await supabaseAdmin
    .from("professionals")
    .select("id")
    .eq("id", professionalId)
    .eq("user_id", userId)
    .maybeSingle();
  if (professionalError) throw professionalError;

  if (!professional) {
    return { allowed: false, reason: "forbidden_professional_scope" };
  }

  return { allowed: true };
}

async function isUpsellEnabled(
  supabaseAdmin: ReturnType<typeof createClient>,
  professionalId: string,
): Promise<FeatureCheckResult> {
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

  return { enabled: true };
}

async function incrementRuleCounter(
  supabaseAdmin: ReturnType<typeof createClient>,
  ruleId: string,
  fieldName: "suggestion_count" | "conversion_count",
  currentValue: number,
) {
  const { error: rpcError } = await supabaseAdmin.rpc("increment_upsell_counter", {
    rule_id: ruleId,
    field_name: fieldName,
  });

  if (!rpcError) return;

  const { error: updateError } = await supabaseAdmin
    .from("upsell_rules")
    .update({ [fieldName]: currentValue + 1 })
    .eq("id", ruleId);
  if (updateError) throw updateError;
}

async function sendUpsellWhatsApp(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  professionalId: string;
  phone: string;
  message: string;
}) {
  const { supabaseAdmin, professionalId, phone, message } = params;

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return { success: false, reason: "invalid_phone" as const };
  }

  const { data: instance, error: instanceError } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("professional_id, instance_name, meta_phone_id, status")
    .eq("professional_id", professionalId)
    .eq("status", "connected")
    .maybeSingle();
  if (instanceError) throw instanceError;

  if (!instance) {
    return { success: false, reason: "whatsapp_not_connected" as const };
  }

  const sendResult = await sendWhatsAppMessage({
    supabase: supabaseAdmin,
    professionalId,
    recipient: normalizedPhone,
    message,
    instance,
    preferredProvider: "evolution",
    details: {
      source: "upsell_execute",
    },
  });

  if (!sendResult.success) {
    return {
      success: false,
      reason: "provider_send_failed" as const,
      providerError: sendResult.error || String(sendResult.responseBody || ""),
    };
  }

  return { success: true, normalizedPhone };
}

async function handleTrigger(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  professionalId: string;
  bookingId: string;
}) {
  const { supabaseAdmin, professionalId, bookingId } = params;

  if (!bookingId) {
    return jsonResponse({ success: false, error: "bookingId is required" }, 400);
  }

  const feature = await isUpsellEnabled(supabaseAdmin, professionalId);
  if (!feature.enabled) {
    return jsonResponse({ triggered: false, reason: feature.reason }, 200);
  }

  const { data: booking, error: bookingError } = await supabaseAdmin
    .from("bookings")
    .select("id, service_id, client_id, client_name, client_phone, professional_id")
    .eq("id", bookingId)
    .eq("professional_id", professionalId)
    .maybeSingle();
  if (bookingError) throw bookingError;

  if (!booking) {
    return jsonResponse({ triggered: false, reason: "booking_not_found" }, 404);
  }
  if (!booking.service_id || !booking.client_phone) {
    return jsonResponse({ triggered: false, reason: "missing_booking_data" }, 400);
  }

  const { data: existingRecipients, error: existingRecipientsError } = await supabaseAdmin
    .from("upsell_recipients")
    .select("id")
    .eq("professional_id", professionalId)
    .eq("booking_id", bookingId)
    .limit(1);
  if (existingRecipientsError) throw existingRecipientsError;
  if (existingRecipients && existingRecipients.length > 0) {
    return jsonResponse({ triggered: false, reason: "already_sent" }, 200);
  }

  const { data: rules, error: rulesError } = await supabaseAdmin
    .from("upsell_rules")
    .select("id, recommended_service_id, suggestion_count, discount_percentage, message_template, send_timing, recommended:recommended_service_id(id, name, price)")
    .eq("professional_id", professionalId)
    .eq("source_service_id", booking.service_id)
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .limit(2);
  if (rulesError) throw rulesError;
  if (!rules || rules.length === 0) {
    return jsonResponse({ triggered: false, reason: "no_rules" }, 200);
  }

  const { data: sourceService, error: sourceServiceError } = await supabaseAdmin
    .from("services")
    .select("name")
    .eq("id", booking.service_id)
    .eq("professional_id", professionalId)
    .maybeSingle();
  if (sourceServiceError) throw sourceServiceError;

  const results: Array<Record<string, unknown>> = [];

  for (const rule of rules) {
    if (!rule.recommended) continue;

    if (booking.client_id) {
      const { data: existingBooking, error: existingBookingError } = await supabaseAdmin
        .from("bookings")
        .select("id")
        .eq("professional_id", professionalId)
        .eq("client_id", booking.client_id)
        .eq("service_id", rule.recommended_service_id)
        .in("status", ["pending", "confirmed"])
        .limit(1);
      if (existingBookingError) throw existingBookingError;
      if (existingBooking && existingBooking.length > 0) {
        continue;
      }
    }

    const discountPct = Number(rule.discount_percentage || 0);
    const template = String(rule.message_template || "Oi {nome}, vi que voce agendou {servico}. Que tal potencializar o resultado com {upsell}? Hoje com {desconto}% OFF. Quer adicionar no seu horario?");
    const message = template
      .replace(/{nome}/g, String(booking.client_name || "Cliente"))
      .replace(/{servico}/g, String(sourceService?.name || "seu servico"))
      .replace(/{upsell}/g, String(rule.recommended.name || "servico complementar"))
      .replace(/{desconto}/g, String(discountPct));

    const { data: recipient, error: recipientError } = await supabaseAdmin
      .from("upsell_recipients")
      .insert({
        professional_id: professionalId,
        client_id: booking.client_id,
        booking_id: bookingId,
        upsell_rule_id: rule.id,
        client_phone: normalizePhone(String(booking.client_phone || "")),
        message_payload: message,
        status: "pending",
      })
      .select("id")
      .single();
    if (recipientError) throw recipientError;

    if (rule.send_timing === "immediate") {
      const send = await sendUpsellWhatsApp({
        supabaseAdmin,
        professionalId,
        phone: String(booking.client_phone || ""),
        message,
      });

      if (!send.success) {
        const { error: failedRecipientError } = await supabaseAdmin
          .from("upsell_recipients")
          .update({ status: "failed" })
          .eq("id", recipient.id);
        if (failedRecipientError) throw failedRecipientError;

        results.push({
          ruleId: rule.id,
          sent: false,
          reason: send.reason,
          recipientId: recipient.id,
        });
        continue;
      }

      const { error: sentRecipientError } = await supabaseAdmin
        .from("upsell_recipients")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", recipient.id);
      if (sentRecipientError) throw sentRecipientError;

      const { error: eventError } = await supabaseAdmin
        .from("upsell_events")
        .insert({
          professional_id: professionalId,
          booking_id: bookingId,
          source_service_id: booking.service_id,
          recommended_service_id: rule.recommended_service_id,
          client_phone: send.normalizedPhone,
          client_id: booking.client_id,
          channel: "whatsapp",
          status: "suggested",
          event_type: "sent",
          upsell_revenue: 0,
          value: 0,
          campaign_id: rule.id,
        });
      if (eventError) throw eventError;

      await incrementRuleCounter(
        supabaseAdmin,
        String(rule.id),
        "suggestion_count",
        Number(rule.suggestion_count || 0),
      );

      results.push({ ruleId: rule.id, sent: true, recipientId: recipient.id });
      continue;
    }

    results.push({
      ruleId: rule.id,
      scheduled: true,
      timing: rule.send_timing,
      recipientId: recipient.id,
    });
  }

  if (results.length === 0) {
    return jsonResponse({ triggered: false, reason: "no_eligible_recipients" }, 200);
  }

  return jsonResponse({ triggered: true, results }, 200);
}

async function checkConversion(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  professionalId: string;
  bookingId: string;
}) {
  const { supabaseAdmin, professionalId, bookingId } = params;

  if (!bookingId) {
    return jsonResponse({ success: false, error: "bookingId is required" }, 400);
  }

  const { data: booking, error: bookingError } = await supabaseAdmin
    .from("bookings")
    .select("id, client_id, service_id, price")
    .eq("id", bookingId)
    .eq("professional_id", professionalId)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking) {
    return jsonResponse({ converted: false, reason: "booking_not_found" }, 404);
  }
  if (!booking.client_id) {
    return jsonResponse({ converted: false, reason: "missing_booking_client" }, 200);
  }

  const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recipients, error: recipientsError } = await supabaseAdmin
    .from("upsell_recipients")
    .select("id, upsell_rule_id")
    .eq("professional_id", professionalId)
    .eq("client_id", booking.client_id)
    .in("status", ["sent", "delivered"])
    .gte("created_at", fifteenDaysAgo);
  if (recipientsError) throw recipientsError;

  if (!recipients || recipients.length === 0) {
    return jsonResponse({ converted: false }, 200);
  }

  for (const recipient of recipients) {
    if (!recipient.upsell_rule_id) continue;

    const { data: rule, error: ruleError } = await supabaseAdmin
      .from("upsell_rules")
      .select("id, recommended_service_id, conversion_count")
      .eq("id", recipient.upsell_rule_id)
      .eq("professional_id", professionalId)
      .maybeSingle();
    if (ruleError) throw ruleError;
    if (!rule || rule.recommended_service_id !== booking.service_id) continue;

    const { error: updateRecipientError } = await supabaseAdmin
      .from("upsell_recipients")
      .update({ status: "accepted", converted_at: new Date().toISOString() })
      .eq("id", recipient.id);
    if (updateRecipientError) throw updateRecipientError;

    const { error: eventError } = await supabaseAdmin
      .from("upsell_events")
      .insert({
        professional_id: professionalId,
        booking_id: bookingId,
        source_service_id: null,
        recommended_service_id: booking.service_id,
        client_id: booking.client_id,
        channel: "whatsapp",
        status: "accepted",
        event_type: "converted",
        value: Number(booking.price || 0),
        upsell_revenue: Number(booking.price || 0),
        campaign_id: rule.id,
      });
    if (eventError) throw eventError;

    await incrementRuleCounter(
      supabaseAdmin,
      String(rule.id),
      "conversion_count",
      Number(rule.conversion_count || 0),
    );

    return jsonResponse({
      converted: true,
      recipientId: recipient.id,
      value: Number(booking.price || 0),
    }, 200);
  }

  return jsonResponse({ converted: false }, 200);
}

async function getMetrics(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  professionalId: string;
}) {
  const { supabaseAdmin, professionalId } = params;

  const { data: events, error: eventsError } = await supabaseAdmin
    .from("upsell_events")
    .select("status, event_type, upsell_revenue, value, created_at")
    .eq("professional_id", professionalId)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (eventsError) throw eventsError;

  const allEvents = events || [];
  const sent = allEvents.filter((event: Record<string, unknown>) =>
    String(event.event_type || "") === "sent" || String(event.status || "") === "suggested"
  ).length;

  const accepted = allEvents.filter((event: Record<string, unknown>) =>
    String(event.event_type || "") === "converted" || String(event.status || "") === "accepted"
  ).length;

  const totalRevenue = allEvents
    .filter((event: Record<string, unknown>) => String(event.status || "") === "accepted")
    .reduce((sum, event: Record<string, unknown>) => {
      return sum + Number(event.upsell_revenue || event.value || 0);
    }, 0);

  const now = new Date();
  const monthlyRevenue = allEvents
    .filter((event: Record<string, unknown>) => {
      const status = String(event.status || "");
      if (status !== "accepted") return false;
      const created = new Date(String(event.created_at || ""));
      return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
    })
    .reduce((sum, event: Record<string, unknown>) => sum + Number(event.upsell_revenue || event.value || 0), 0);

  const conversionRate = sent > 0 ? Math.round((accepted / sent) * 100) : 0;

  const { data: recipients, error: recipientsError } = await supabaseAdmin
    .from("upsell_recipients")
    .select("id, client_phone, status, created_at, upsell_rule_id")
    .eq("professional_id", professionalId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (recipientsError) throw recipientsError;

  return jsonResponse({
    sent,
    accepted,
    totalRevenue,
    monthlyRevenue,
    conversionRate,
    recipients: recipients || [],
  }, 200);
}

async function executeRule(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  professionalId: string;
  ruleId: string;
  clientPhone: string;
  clientName: string;
}) {
  const {
    supabaseAdmin,
    professionalId,
    ruleId,
    clientPhone,
    clientName,
  } = params;

  if (!ruleId) return jsonResponse({ success: false, error: "ruleId is required" }, 400);
  const normalizedPhone = normalizePhone(clientPhone);
  if (!normalizedPhone) return jsonResponse({ success: false, error: "clientPhone is invalid" }, 400);

  const { data: rule, error: ruleError } = await supabaseAdmin
    .from("upsell_rules")
    .select("id, recommended_service_id, promo_message, suggestion_count, recommended:recommended_service_id(name)")
    .eq("id", ruleId)
    .eq("professional_id", professionalId)
    .maybeSingle();
  if (ruleError) throw ruleError;

  if (!rule) return jsonResponse({ success: false, error: "Rule not found" }, 404);

  const message = String(
    rule.promo_message ||
      `Oi ${clientName || "Cliente"}! Que tal adicionar ${rule.recommended?.name || "este servico"} no seu horario?`,
  );

  const { data: recipient, error: recipientError } = await supabaseAdmin
    .from("upsell_recipients")
    .insert({
      professional_id: professionalId,
      client_phone: normalizedPhone,
      upsell_rule_id: rule.id,
      message_payload: message,
      status: "pending",
    })
    .select("id")
    .single();
  if (recipientError) throw recipientError;

  const send = await sendUpsellWhatsApp({
    supabaseAdmin,
    professionalId,
    phone: normalizedPhone,
    message,
  });

  if (!send.success) {
    const { error: failedRecipientError } = await supabaseAdmin
      .from("upsell_recipients")
      .update({ status: "failed" })
      .eq("id", recipient.id);
    if (failedRecipientError) throw failedRecipientError;

    return jsonResponse({
      success: false,
      error: send.reason,
      recipientId: recipient.id,
    }, 200);
  }

  const { error: sentRecipientError } = await supabaseAdmin
    .from("upsell_recipients")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", recipient.id);
  if (sentRecipientError) throw sentRecipientError;

  const { error: eventError } = await supabaseAdmin
    .from("upsell_events")
    .insert({
      professional_id: professionalId,
      source_service_id: null,
      recommended_service_id: rule.recommended_service_id,
      client_phone: send.normalizedPhone,
      channel: "whatsapp",
      status: "suggested",
      event_type: "sent",
      upsell_revenue: 0,
      value: 0,
      campaign_id: rule.id,
    });
  if (eventError) throw eventError;

  await incrementRuleCounter(
    supabaseAdmin,
    String(rule.id),
    "suggestion_count",
    Number(rule.suggestion_count || 0),
  );

  return jsonResponse({ success: true, recipientId: recipient.id }, 200);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const body = await parseJsonBody(req);
    if (!body.ok) {
      return jsonResponse({ success: false, error: body.error }, 400);
    }

    const action = asString(body.data.action);
    if (!action) {
      return jsonResponse({ success: false, error: "action is required" }, 400);
    }

    const professionalId = asString(body.data.professionalId);
    if (!professionalId) {
      return jsonResponse({ success: false, error: "professionalId is required" }, 400);
    }

    const token = getBearerToken(req);
    if (!token) {
      return jsonResponse({ success: false, error: "Missing bearer token" }, 401);
    }

    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const userId = await getUserIdFromToken(anonClient, token);
    if (!userId) {
      return jsonResponse({ success: false, error: "Invalid token" }, 401);
    }

    const scope = await canOperateProfessional(supabaseAdmin, userId, professionalId);
    if (!scope.allowed) {
      return jsonResponse({
        success: false,
        error: "You are not allowed to operate this professionalId",
        reason: scope.reason,
      }, 403);
    }

    if (action === "trigger") {
      const bookingId = asString(body.data.bookingId);
      return await handleTrigger({ supabaseAdmin, professionalId, bookingId });
    }

    if (action === "execute_rule") {
      return await executeRule({
        supabaseAdmin,
        professionalId,
        ruleId: asString(body.data.ruleId),
        clientPhone: asString(body.data.clientPhone),
        clientName: asString(body.data.clientName),
      });
    }

    if (action === "check_conversion") {
      const bookingId = asString(body.data.bookingId);
      return await checkConversion({ supabaseAdmin, professionalId, bookingId });
    }

    if (action === "metrics") {
      return await getMetrics({ supabaseAdmin, professionalId });
    }

    return jsonResponse({ success: false, error: "Unknown action" }, 400);
  } catch (error) {
    console.error("upsell-execute unexpected error:", error);
    return jsonResponse({ success: false, error: "Internal server error" }, 500);
  }
});
