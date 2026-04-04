import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { sendWhatsAppMessage } from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const { action, professionalId, bookingId } = await req.json();

    if (action === "trigger") {
      return await handleTrigger(supabase, professionalId, bookingId);
    }

    if (action === "execute_rule") {
      const { ruleId, clientPhone, clientName, serviceName } = await req.json();
      return await executeRule(supabase, professionalId, ruleId, clientPhone, clientName, serviceName);
    }

    if (action === "check_conversion") {
      return await checkConversion(supabase, professionalId, bookingId);
    }

    if (action === "metrics") {
      return await getMetrics(supabase, professionalId);
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("upsell-execute error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleTrigger(supabase: any, professionalId: string, bookingId: string) {
  // Check feature flag
  const { data: flag } = await supabase
    .from("feature_flags")
    .select("enabled")
    .eq("key", "upsell_inteligente")
    .maybeSingle();

  if (!flag?.enabled) {
    return jsonResponse({ triggered: false, reason: "feature_disabled" });
  }

  // Check professional override
  const { data: override } = await supabase
    .from("professional_feature_overrides")
    .select("enabled")
    .eq("professional_id", professionalId)
    .eq("feature_key", "upsell_inteligente")
    .maybeSingle();

  if (override && !override.enabled) {
    return jsonResponse({ triggered: false, reason: "professional_disabled" });
  }

  // Get booking details
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, service_id, client_id, client_name, client_phone, professional_id")
    .eq("id", bookingId)
    .single();

  if (!booking || !booking.service_id || !booking.client_phone) {
    return jsonResponse({ triggered: false, reason: "missing_booking_data" });
  }

  // Check if upsell already sent for this booking
  const { data: existing } = await supabase
    .from("upsell_recipients")
    .select("id")
    .eq("booking_id", bookingId)
    .limit(1);

  if (existing && existing.length > 0) {
    return jsonResponse({ triggered: false, reason: "already_sent" });
  }

  // Get matching upsell rules
  const { data: rules } = await supabase
    .from("upsell_rules")
    .select("*, recommended:recommended_service_id(id, name, price)")
    .eq("professional_id", professionalId)
    .eq("source_service_id", booking.service_id)
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .limit(2);

  if (!rules || rules.length === 0) {
    return jsonResponse({ triggered: false, reason: "no_rules" });
  }

  // Get source service name
  const { data: sourceService } = await supabase
    .from("services")
    .select("name")
    .eq("id", booking.service_id)
    .single();

  const results = [];

  for (const rule of rules) {
    if (!rule.recommended) continue;

    // Check client doesn't already have this service booked
    const { data: existingBooking } = await supabase
      .from("bookings")
      .select("id")
      .eq("client_id", booking.client_id)
      .eq("service_id", rule.recommended_service_id)
      .in("status", ["pending", "confirmed"])
      .limit(1);

    if (existingBooking && existingBooking.length > 0) continue;

    // Build message from template
    const discountPct = rule.discount_percentage || 0;
    const template = rule.message_template || 
      "Oi {nome}, vi que você agendou {servico} 💁‍♀️ Que tal potencializar o resultado com {upsell}? Hoje com {desconto}% OFF 😍 Quer adicionar no seu horário?";
    
    const message = template
      .replace(/{nome}/g, booking.client_name || "")
      .replace(/{servico}/g, sourceService?.name || "")
      .replace(/{upsell}/g, rule.recommended.name || "")
      .replace(/{desconto}/g, String(discountPct));

    // Insert recipient record
    const { data: recipient } = await supabase
      .from("upsell_recipients")
      .insert({
        professional_id: professionalId,
        client_id: booking.client_id,
        booking_id: bookingId,
        upsell_rule_id: rule.id,
        client_phone: booking.client_phone,
        message_payload: message,
        status: "pending",
      })
      .select("id")
      .single();

    // Send via WhatsApp (Evolution API)
    if (rule.send_timing === "immediate") {
      const sent = await sendWhatsApp(supabase, professionalId, booking.client_phone, message);
      
      if (sent) {
        await supabase
          .from("upsell_recipients")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", recipient?.id);

        // Track event
        await supabase.from("upsell_events").insert({
          professional_id: professionalId,
          booking_id: bookingId,
          source_service_id: booking.service_id,
          recommended_service_id: rule.recommended_service_id,
          client_phone: booking.client_phone,
          client_id: booking.client_id,
          channel: "whatsapp",
          status: "suggested",
          event_type: "sent",
          upsell_revenue: 0,
        });

        // Increment suggestion count
        await supabase.rpc("increment_upsell_counter", { 
          rule_id: rule.id, 
          field_name: "suggestion_count" 
        }).catch(() => {
          // Fallback: direct update
          supabase.from("upsell_rules")
            .update({ suggestion_count: (rule.suggestion_count || 0) + 1 })
            .eq("id", rule.id);
        });
      }

      results.push({ ruleId: rule.id, sent, recipientId: recipient?.id });
    } else {
      results.push({ ruleId: rule.id, scheduled: true, timing: rule.send_timing, recipientId: recipient?.id });
    }
  }

  return jsonResponse({ triggered: true, results });
}

async function sendWhatsApp(supabase: any, professionalId: string, phone: string, message: string): Promise<boolean> {
  try {
    const { data: instance } = await supabase
      .from("whatsapp_instances")
      .select("professional_id, instance_name, meta_phone_id, status")
      .eq("professional_id", professionalId)
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();

    if (!instance) {
      console.error("No connected WhatsApp instance");
      return false;
    }

    const result = await sendWhatsAppMessage({
      supabase,
      professionalId,
      recipient: phone,
      message,
      instance,
      preferredProvider: "evolution",
      details: {
        source: "upsell_execute",
      },
    });

    if (!result.success) {
      console.error("WhatsApp send failed:", result.error || result.responseBody);
      return false;
    }

    return true;
  } catch (e) {
    console.error("sendWhatsApp error:", e);
    return false;
  }
}

async function checkConversion(supabase: any, professionalId: string, bookingId: string) {
  // Get booking client
  const { data: booking } = await supabase
    .from("bookings")
    .select("client_id, service_id, price")
    .eq("id", bookingId)
    .single();

  if (!booking?.client_id) return jsonResponse({ converted: false });

  // Check if there's a pending/sent upsell recipient for this client in last 15 days
  const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
  
  const { data: recipients } = await supabase
    .from("upsell_recipients")
    .select("id, upsell_rule_id, booking_id")
    .eq("professional_id", professionalId)
    .eq("client_id", booking.client_id)
    .in("status", ["sent", "delivered"])
    .gte("created_at", fifteenDaysAgo);

  if (!recipients || recipients.length === 0) return jsonResponse({ converted: false });

  // Check if the booked service matches any upsell recommendation
  for (const r of recipients) {
    const { data: rule } = await supabase
      .from("upsell_rules")
      .select("recommended_service_id")
      .eq("id", r.upsell_rule_id)
      .single();

    if (rule && rule.recommended_service_id === booking.service_id) {
      // Mark as converted
      await supabase
        .from("upsell_recipients")
        .update({ status: "accepted", converted_at: new Date().toISOString() })
        .eq("id", r.id);

      // Record event
      await supabase.from("upsell_events").insert({
        professional_id: professionalId,
        booking_id: bookingId,
        source_service_id: null,
        recommended_service_id: booking.service_id,
        client_id: booking.client_id,
        channel: "whatsapp",
        status: "accepted",
        event_type: "converted",
        value: booking.price || 0,
        upsell_revenue: booking.price || 0,
        campaign_id: r.upsell_rule_id,
      });

      // Increment conversion count
      await supabase.from("upsell_rules")
        .update({ conversion_count: (rule.conversion_count || 0) + 1 })
        .eq("id", r.upsell_rule_id)
        .catch(() => {});

      return jsonResponse({ converted: true, recipientId: r.id, value: booking.price });
    }
  }

  return jsonResponse({ converted: false });
}

async function getMetrics(supabase: any, professionalId: string) {
  const { data: events } = await supabase
    .from("upsell_events")
    .select("*")
    .eq("professional_id", professionalId)
    .order("created_at", { ascending: false })
    .limit(1000);

  const allEvents = events || [];
  const sent = allEvents.filter((e: any) => e.status === "suggested" || e.event_type === "sent").length;
  const accepted = allEvents.filter((e: any) => e.status === "accepted" || e.event_type === "converted").length;
  const totalRevenue = allEvents
    .filter((e: any) => e.status === "accepted")
    .reduce((sum: number, e: any) => sum + (e.upsell_revenue || e.value || 0), 0);
  
  const now = new Date();
  const thisMonth = allEvents.filter((e: any) => {
    const d = new Date(e.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && e.status === "accepted";
  });
  const monthlyRevenue = thisMonth.reduce((sum: number, e: any) => sum + (e.upsell_revenue || e.value || 0), 0);

  const conversionRate = sent > 0 ? Math.round((accepted / sent) * 100) : 0;

  // Recipients
  const { data: recipients } = await supabase
    .from("upsell_recipients")
    .select("id, client_phone, status, created_at, upsell_rule_id")
    .eq("professional_id", professionalId)
    .order("created_at", { ascending: false })
    .limit(100);

  return jsonResponse({
    sent, accepted, totalRevenue, monthlyRevenue, conversionRate,
    recipients: recipients || [],
  });
}

async function executeRule(
  supabase: any,
  professionalId: string,
  ruleId: string,
  clientPhone: string,
  clientName: string,
  serviceName: string
) {
  try {
    const { data: rule } = await supabase
      .from("upsell_rules")
      .select("*, recommended:recommended_service_id(name, price)")
      .eq("id", ruleId)
      .single();

    if (!rule) {
      return jsonResponse({ success: false, error: "Rule not found" });
    }

    const message = rule.promo_message || `Oi ${clientName || "Cliente"}! Que tal adicionar ${rule.recommended?.name || "este serviço"} no seu horário?`;

    const sent = await sendWhatsApp(supabase, professionalId, clientPhone, message);

    if (sent) {
      await supabase.from("upsell_events").insert({
        professional_id: professionalId,
        source_service_id: null,
        recommended_service_id: rule.recommended_service_id,
        client_phone: clientPhone,
        channel: "whatsapp",
        status: "accepted",
        event_type: "converted",
      });
    }

    return jsonResponse({ success: sent });
  } catch (e) {
    console.error("executeRule error:", e);
    return jsonResponse({ success: false, error: e.message });
  }
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
      "Content-Type": "application/json",
    },
  });
}
