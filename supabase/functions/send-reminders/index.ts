import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function replaceVars(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value || "");
  }
  return result;
}

function getEvolutionUrl(): string {
  const url = Deno.env.get("EVOLUTION_API_URL");
  if (!url) {
    throw new Error("EVOLUTION_API_URL not configured");
  }
  return url;
}

function getEvolutionKey(): string {
  const key = Deno.env.get("EVOLUTION_API_KEY");
  if (!key) {
    throw new Error("EVOLUTION_API_KEY not configured");
  }
  return key;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) return digits;
  if (digits.length >= 10 && digits.length <= 11) return "55" + digits;
  return digits;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  const EVOLUTION_URL = getEvolutionUrl();
  const EVOLUTION_KEY = getEvolutionKey();

  try {
    const now = new Date();
    const results: Array<{ type: string; bookingId: string; success: boolean; error?: string }> = [];

    const h24_start = new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString();
    const h24_end = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString();
    const h3_start = new Date(now.getTime() + 2.5 * 60 * 60 * 1000).toISOString();
    const h3_end = new Date(now.getTime() + 3.5 * 60 * 60 * 1000).toISOString();

    const { data: bookings24h } = await supabase
      .from("bookings")
      .select("id, professional_id, client_name, client_phone, start_time, service_id, employee_id, services:service_id(name)")
      .in("status", ["pending", "confirmed"])
      .gte("start_time", h24_start)
      .lte("start_time", h24_end);

    const { data: bookings3h } = await supabase
      .from("bookings")
      .select("id, professional_id, client_name, client_phone, start_time, service_id, employee_id, services:service_id(name)")
      .in("status", ["pending", "confirmed"])
      .gte("start_time", h3_start)
      .lte("start_time", h3_end);

    const postSale_start = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
    const postSale_end = new Date(now.getTime() - 23 * 60 * 60 * 1000).toISOString();

    const { data: completedBookings } = await supabase
      .from("bookings")
      .select("id, professional_id, client_name, client_phone, start_time, service_id, employee_id, services:service_id(name), updated_at")
      .eq("status", "completed")
      .gte("updated_at", postSale_start)
      .lte("updated_at", postSale_end);

    const { data: servicesWithMaintenance } = await supabase
      .from("services")
      .select("id, name, maintenance_interval_days, professional_id")
      .not("maintenance_interval_days", "is", null)
      .gt("maintenance_interval_days", 0);

    let maintenanceBookings: any[] = [];
    if (servicesWithMaintenance && servicesWithMaintenance.length > 0) {
      for (const svc of servicesWithMaintenance) {
        const maintenanceDue = new Date(now.getTime() - (svc.maintenance_interval_days - 3) * 24 * 60 * 60 * 1000);
        const maintenanceDueEnd = new Date(now.getTime() - (svc.maintenance_interval_days - 2) * 24 * 60 * 60 * 1000);

        const { data: dueBookings } = await supabase
          .from("bookings")
          .select("id, professional_id, client_name, client_phone, start_time, service_id, employee_id")
          .eq("status", "completed")
          .eq("service_id", svc.id)
          .gte("start_time", maintenanceDue.toISOString())
          .lte("start_time", maintenanceDueEnd.toISOString());

        if (dueBookings) {
          maintenanceBookings.push(...dueBookings.map(b => ({ ...b, services: { name: svc.name }, maintenance_interval_days: svc.maintenance_interval_days })));
        }
      }
    }

    const allBookings = [
      ...((bookings24h || []).map(b => ({ ...b, triggerType: "reminder_24h" }))),
      ...((bookings3h || []).map(b => ({ ...b, triggerType: "reminder_3h" }))),
      ...((completedBookings || []).map(b => ({ ...b, triggerType: "post_sale_review" }))),
      ...(maintenanceBookings.map(b => ({ ...b, triggerType: "maintenance_reminder" }))),
    ];

    const byProfessional: Record<string, typeof allBookings> = {};
    for (const b of allBookings) {
      if (!b.client_phone) continue;
      if (!byProfessional[b.professional_id]) byProfessional[b.professional_id] = [];
      byProfessional[b.professional_id].push(b);
    }

    for (const [profId, bookings] of Object.entries(byProfessional)) {
      const { data: prof } = await supabase
        .from("professionals")
        .select("id, slug, reminder_message, business_name, name")
        .eq("id", profId)
        .single();

      if (!prof) continue;

      const { data: inst } = await supabase
        .from("whatsapp_instances")
        .select("instance_name, status")
        .eq("professional_id", profId)
        .single();

      if (!inst || inst.status !== "connected") continue;

      const { data: automations } = await supabase
        .from("whatsapp_automations")
        .select("*")
        .eq("professional_id", profId)
        .in("trigger_type", ["reminder_24h", "reminder_3h", "post_sale_review", "maintenance_reminder"])
        .eq("is_active", true);

      const activeAutomations = new Map((automations || []).map(a => [a.trigger_type, a]));

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("plan_id")
        .eq("professional_id", profId)
        .single();

      const planId = sub?.plan_id || "free";

      const { data: limits } = await supabase
        .from("plan_limits")
        .select("*")
        .eq("plan_id", planId)
        .single();

      const baseDailyLimit = limits?.daily_reminders ?? 5;

      const { data: profLimits } = await supabase
        .from("professional_limits")
        .select("extra_reminders_purchased")
        .eq("professional_id", profId)
        .maybeSingle();

      const extraReminders = profLimits?.extra_reminders_purchased || 0;
      const dailyLimit = baseDailyLimit === -1 ? -1 : baseDailyLimit + extraReminders;

      const today = now.toISOString().split("T")[0];
      const { data: usage } = await supabase
        .from("daily_message_usage")
        .select("*")
        .eq("professional_id", profId)
        .eq("usage_date", today)
        .maybeSingle();

      let remindersSent = usage?.reminders_sent || 0;

      for (const booking of bookings) {
        if (dailyLimit !== -1 && remindersSent >= dailyLimit) {
          results.push({ type: booking.triggerType, bookingId: booking.id, success: false, error: "Limite diário atingido" });
          continue;
        }

        const automation = activeAutomations.get(booking.triggerType);
        if (!automation) continue;

        const { data: existingLog } = await supabase
          .from("whatsapp_logs")
          .select("id")
          .eq("booking_id", booking.id)
          .eq("automation_id", automation.id)
          .limit(1);

        if (existingLog && existingLog.length > 0) continue;

        const startDate = new Date(booking.start_time);
        const dataFormatted = startDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
        const horarioFormatted = startDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        const serviceName = (booking as any).services?.name || "serviço";
        const bookingLink = prof.slug ? `https://gende.io/${prof.slug}` : "";
        const reviewLink = prof.slug ? `https://gende.io/${prof.slug}?review=true&booking=${booking.id}${booking.employee_id ? `&employee=${booking.employee_id}` : ""}` : "";

        let messageTemplate = automation.message_template;

        if (booking.triggerType === "reminder_24h" || booking.triggerType === "reminder_3h") {
          if (prof.reminder_message) messageTemplate = prof.reminder_message;
        } else if (booking.triggerType === "post_sale_review") {
          if (!messageTemplate || messageTemplate.trim() === "") {
            messageTemplate = `Olá {nome}! Como foi seu atendimento de {servico}? Adoraríamos saber sua opinião!\n\n⭐ Deixe sua avaliação: {link_avaliacao}\n\nSua opinião é muito importante para nós! 😊`;
          }
        } else if (booking.triggerType === "maintenance_reminder") {
          if (!messageTemplate || messageTemplate.trim() === "") {
            messageTemplate = `Olá {nome}! Está chegando a hora da sua manutenção de {servico}. Que tal agendar?\n\n📅 Agendar: {link}\n\nEstamos te esperando! 😊`;
          }
        }

        const finalMessage = replaceVars(messageTemplate, {
          nome: booking.client_name || "Cliente",
          servico: serviceName,
          data: dataFormatted,
          horario: horarioFormatted,
          link: bookingLink,
          link_avaliacao: reviewLink,
        });

        const normalizedPhone = normalizePhone(booking.client_phone);
        
        const sendRes = await fetch(`${EVOLUTION_URL}/message/sendText/${inst.instance_name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
          body: JSON.stringify({ number: normalizedPhone, text: finalMessage }),
        });
        
        let sendData: any;
        if (sendRes.ok) {
          sendData = await sendRes.json();
        } else {
          sendData = await sendRes.json().catch(() => ({}));
          console.error(`Failed to send reminder: ${sendRes.status}`, sendData);
        }

        await supabase.from("whatsapp_logs").insert({
          professional_id: profId,
          automation_id: automation.id,
          booking_id: booking.id,
          recipient_phone: normalizedPhone,
          message_content: finalMessage,
          status: sendRes.ok ? "sent" : "failed",
          sent_at: sendRes.ok ? new Date().toISOString() : null,
          error_message: sendRes.ok ? null : JSON.stringify(sendData),
        });

        if (sendRes.ok) remindersSent++;
        results.push({ type: booking.triggerType, bookingId: booking.id, success: sendRes.ok });
      }

      await supabase.from("daily_message_usage").upsert({
        professional_id: profId,
        usage_date: today,
        reminders_sent: remindersSent,
      }, { onConflict: "professional_id,usage_date" });
    }

    const signalStart = new Date(now.getTime() + 19.5 * 60 * 1000).toISOString();
    const signalEnd = new Date(now.getTime() + 20.5 * 60 * 1000).toISOString();

    const { data: signalBookings } = await supabase
      .from("bookings")
      .select("id, professional_id, client_name, start_time, signal_amount, signal_whatsapp_sent_at, signal_check_reminder_sent_at")
      .gt("signal_amount", 0)
      .not("signal_whatsapp_sent_at", "is", null)
      .is("signal_check_reminder_sent_at", null)
      .in("status", ["pending", "confirmed"])
      .gte("start_time", signalStart)
      .lte("start_time", signalEnd);

    for (const booking of signalBookings || []) {
      const { data: prof } = await supabase
        .from("professionals")
        .select("id, name, business_name, phone")
        .eq("id", booking.professional_id)
        .single();

      if (!prof?.phone) continue;

      const { data: inst } = await supabase
        .from("whatsapp_instances")
        .select("instance_name, status")
        .eq("professional_id", booking.professional_id)
        .single();

      if (!inst || inst.status !== "connected") continue;

      const startDate = new Date(booking.start_time);
      const formattedDate = startDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
      const formattedTime = startDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const message = `Atenção! A cliente ${booking.client_name || "Cliente"} tem atendimento em ${formattedDate} às ${formattedTime}. Confira no WhatsApp e na conta do banco se o sinal de ${Number(booking.signal_amount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} foi recebido.`;
      const recipientPhone = normalizePhone(prof.phone);

      const sendRes = await fetch(`${EVOLUTION_URL}/message/sendText/${inst.instance_name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
        body: JSON.stringify({ number: recipientPhone, text: message }),
      });

      let sendData: any = {};
      if (sendRes.ok) {
        sendData = await sendRes.json();
      } else {
        sendData = await sendRes.json().catch(() => ({}));
      }

      await supabase.from("whatsapp_logs").insert({
        professional_id: booking.professional_id,
        automation_id: null,
        booking_id: booking.id,
        recipient_phone: recipientPhone,
        message_content: message,
        status: sendRes.ok ? "sent" : "failed",
        sent_at: sendRes.ok ? new Date().toISOString() : null,
        error_message: sendRes.ok ? null : JSON.stringify(sendData),
      });

      if (sendRes.ok) {
        await supabase
          .from("bookings")
          .update({ signal_check_reminder_sent_at: new Date().toISOString() } as any)
          .eq("id", booking.id);
        results.push({ type: "signal_check_reminder", bookingId: booking.id, success: true });
      } else {
        results.push({ type: "signal_check_reminder", bookingId: booking.id, success: false, error: JSON.stringify(sendData) });
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Send reminders error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
