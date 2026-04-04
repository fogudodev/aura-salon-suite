import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import {
  insertWhatsAppEventLog,
  sendWhatsAppMessage,
} from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function replaceVars(template: string, vars: Record<string, string>) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value || "");
  }
  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const now = new Date();
    const results: Array<{ type: string; bookingId: string; success: boolean; error?: string }> = [];

    const h24Start = new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString();
    const h24End = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString();
    const h3Start = new Date(now.getTime() + 2.5 * 60 * 60 * 1000).toISOString();
    const h3End = new Date(now.getTime() + 3.5 * 60 * 60 * 1000).toISOString();
    const postSaleStart = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
    const postSaleEnd = new Date(now.getTime() - 23 * 60 * 60 * 1000).toISOString();

    const { data: bookings24h } = await supabase
      .from("bookings")
      .select("id, professional_id, client_id, client_name, client_phone, start_time, service_id, employee_id, services:service_id(name)")
      .in("status", ["pending", "confirmed"])
      .gte("start_time", h24Start)
      .lte("start_time", h24End);

    const { data: bookings3h } = await supabase
      .from("bookings")
      .select("id, professional_id, client_id, client_name, client_phone, start_time, service_id, employee_id, services:service_id(name)")
      .in("status", ["pending", "confirmed"])
      .gte("start_time", h3Start)
      .lte("start_time", h3End);

    const { data: completedBookings } = await supabase
      .from("bookings")
      .select("id, professional_id, client_id, client_name, client_phone, start_time, service_id, employee_id, services:service_id(name), updated_at")
      .eq("status", "completed")
      .gte("updated_at", postSaleStart)
      .lte("updated_at", postSaleEnd);

    const { data: servicesWithMaintenance } = await supabase
      .from("services")
      .select("id, name, maintenance_interval_days, professional_id")
      .not("maintenance_interval_days", "is", null)
      .gt("maintenance_interval_days", 0);

    const maintenanceBookings: Array<Record<string, unknown>> = [];
    for (const service of servicesWithMaintenance || []) {
      const maintenanceDue = new Date(now.getTime() - (Number(service.maintenance_interval_days) - 3) * 24 * 60 * 60 * 1000);
      const maintenanceDueEnd = new Date(now.getTime() - (Number(service.maintenance_interval_days) - 2) * 24 * 60 * 60 * 1000);

        const { data: dueBookings } = await supabase
          .from("bookings")
          .select("id, professional_id, client_id, client_name, client_phone, start_time, service_id, employee_id")
        .eq("status", "completed")
        .eq("service_id", service.id)
        .gte("start_time", maintenanceDue.toISOString())
        .lte("start_time", maintenanceDueEnd.toISOString());

      for (const booking of dueBookings || []) {
        maintenanceBookings.push({
          ...booking,
          services: { name: service.name },
          maintenance_interval_days: service.maintenance_interval_days,
        });
      }
    }

    const reactivationStart = new Date(now.getTime() - 30.5 * 24 * 60 * 60 * 1000).toISOString();
    const reactivationEnd = new Date(now.getTime() - 29.5 * 24 * 60 * 60 * 1000).toISOString();

    const { data: reactivationBookings } = await supabase
      .from("bookings")
      .select("id, professional_id, client_id, client_name, client_phone, start_time, service_id, employee_id, services:service_id(name)")
      .eq("status", "completed")
      .gte("start_time", reactivationStart)
      .lte("start_time", reactivationEnd);

    const allBookings = [
      ...((bookings24h || []).map((booking) => ({ ...booking, triggerType: "reminder_24h" }))),
      ...((bookings3h || []).map((booking) => ({ ...booking, triggerType: "reminder_3h" }))),
      ...((completedBookings || []).map((booking) => ({ ...booking, triggerType: "post_sale_review" }))),
      ...(maintenanceBookings.map((booking) => ({ ...booking, triggerType: "maintenance_reminder" }))),
      ...((reactivationBookings || []).map((booking) => ({ ...booking, triggerType: "reactivation_30d" }))),
    ];

    const bookingsByProfessional: Record<string, typeof allBookings> = {};
    for (const booking of allBookings) {
      if (!booking.client_phone) continue;
      if (!bookingsByProfessional[booking.professional_id]) bookingsByProfessional[booking.professional_id] = [];
      bookingsByProfessional[booking.professional_id].push(booking);
    }

    for (const [professionalId, bookings] of Object.entries(bookingsByProfessional)) {
      const { data: professional } = await supabase
        .from("professionals")
        .select("id, slug, reminder_message, business_name, name")
        .eq("id", professionalId)
        .single();

      if (!professional) continue;

      const { data: instance } = await supabase
        .from("whatsapp_instances")
        .select("professional_id, instance_name, meta_phone_id, status")
        .eq("professional_id", professionalId)
        .maybeSingle();

      if (!instance || instance.status !== "connected") {
        await insertWhatsAppEventLog(supabase, {
          professionalId,
          instanceName: instance?.instance_name ?? null,
          provider: "evolution",
          direction: "system",
          eventType: "booking_reminders_skipped_instance_disconnected",
          status: "skipped",
        });
        continue;
      }

      const { data: automations } = await supabase
        .from("whatsapp_automations")
        .select("*")
        .eq("professional_id", professionalId)
        .in("trigger_type", ["reminder_24h", "reminder_3h", "post_sale_review", "maintenance_reminder", "reactivation_30d"])
        .eq("is_active", true);

      const activeAutomations = new Map((automations || []).map((automation) => [automation.trigger_type, automation]));

      const { data: subscription } = await supabase
        .from("subscriptions")
        .select("plan_id")
        .eq("professional_id", professionalId)
        .single();

      const { data: limits } = await supabase
        .from("plan_limits")
        .select("*")
        .eq("plan_id", subscription?.plan_id || "free")
        .single();

      const { data: professionalLimits } = await supabase
        .from("professional_limits")
        .select("extra_reminders_purchased")
        .eq("professional_id", professionalId)
        .maybeSingle();

      const today = now.toISOString().split("T")[0];
      const { data: usage } = await supabase
        .from("daily_message_usage")
        .select("*")
        .eq("professional_id", professionalId)
        .eq("usage_date", today)
        .maybeSingle();

      const baseDailyLimit = limits?.daily_reminders ?? 5;
      const extraReminders = professionalLimits?.extra_reminders_purchased || 0;
      const dailyLimit = baseDailyLimit === -1 ? -1 : baseDailyLimit + extraReminders;
      let remindersSent = usage?.reminders_sent || 0;

      for (const booking of bookings) {
        if (dailyLimit !== -1 && remindersSent >= dailyLimit) {
          results.push({ type: booking.triggerType, bookingId: booking.id, success: false, error: "Limite diário atingido" });
          continue;
        }

        const automation = activeAutomations.get(booking.triggerType);
        if (!automation) continue;

        if (booking.triggerType === "reactivation_30d") {
          const { count: futureBookingsCount } = await supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("professional_id", professionalId)
            .eq("client_phone", booking.client_phone)
            .gte("start_time", now.toISOString())
            .in("status", ["pending", "confirmed"]);

          if ((futureBookingsCount || 0) > 0) continue;
        }

        const { data: existingLog } = await supabase
          .from("whatsapp_logs")
          .select("id")
          .eq("booking_id", booking.id)
          .eq("automation_id", automation.id)
          .limit(1);

        if (existingLog && existingLog.length > 0) continue;

        const bookingDate = new Date(String(booking.start_time));
        const serviceName = String((booking as { services?: { name?: string } }).services?.name || "serviço");
        const bookingLink = professional.slug ? `https://gende.io/${professional.slug}` : "";
        const reviewLink = professional.slug
          ? `https://gende.io/${professional.slug}?review=true&booking=${booking.id}${booking.employee_id ? `&employee=${booking.employee_id}` : ""}`
          : "";

        let template = automation.message_template;
        if ((booking.triggerType === "reminder_24h" || booking.triggerType === "reminder_3h") && professional.reminder_message) {
          template = professional.reminder_message;
        } else if (booking.triggerType === "post_sale_review" && (!template || template.trim() === "")) {
          template = "Olá {nome}! Como foi seu atendimento de {servico}? Adoraríamos saber sua opinião!\n\n⭐ Deixe sua avaliação: {link_avaliacao}";
        } else if (booking.triggerType === "maintenance_reminder" && (!template || template.trim() === "")) {
          template = "Olá {nome}! Está chegando a hora da sua manutenção de {servico}. Que tal agendar?\n\n📅 Agendar: {link}";
        } else if (booking.triggerType === "reactivation_30d" && (!template || template.trim() === "")) {
          template = "Olá {nome}! Sentimos sua falta por aqui. Que tal reservar seu próximo atendimento?\n\n📅 Agendar: {link}";
        }

        const finalMessage = replaceVars(template, {
          nome: String(booking.client_name || "Cliente"),
          servico: serviceName,
          data: bookingDate.toLocaleDateString("pt-BR"),
          horario: bookingDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
          link: bookingLink,
          link_avaliacao: reviewLink,
        });

        const sendResult = await sendWhatsAppMessage({
          supabase,
          professionalId,
          recipient: String(booking.client_phone || ""),
          message: finalMessage,
          instance,
          automationId: automation.id,
          bookingId: booking.id,
          preferredProvider: "evolution",
          details: {
            source: "send_reminders",
            trigger_type: booking.triggerType,
          },
        });

        await insertWhatsAppEventLog(supabase, {
          professionalId,
          bookingId: booking.id,
          automationId: automation.id,
          instanceName: instance.instance_name ?? null,
          provider: sendResult.provider || "evolution",
          direction: "system",
          eventType: sendResult.success ? "automation_sent" : "automation_failed",
          clientIdentifier: String(booking.client_phone || ""),
          normalizedPhone: sendResult.normalizedRecipient || null,
          status: sendResult.success ? "sent" : "failed",
          errorMessage: sendResult.success ? null : sendResult.error || null,
          details: {
            trigger_type: booking.triggerType,
            attempted_providers: sendResult.attemptedProviders,
            response_status: sendResult.responseStatus ?? null,
          },
        });

        if (sendResult.success) remindersSent += 1;
        results.push({
          type: booking.triggerType,
          bookingId: booking.id,
          success: sendResult.success,
          error: sendResult.success ? undefined : sendResult.error,
        });
      }

      await supabase.from("daily_message_usage").upsert({
        professional_id: professionalId,
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
      const { data: professional } = await supabase
        .from("professionals")
        .select("id, name, business_name, phone")
        .eq("id", booking.professional_id)
        .single();

      const { data: instance } = await supabase
        .from("whatsapp_instances")
        .select("professional_id, instance_name, meta_phone_id, status")
        .eq("professional_id", booking.professional_id)
        .maybeSingle();

      if (!professional?.phone || !instance || instance.status !== "connected") continue;

      const bookingDate = new Date(String(booking.start_time));
      const message =
        `Atenção! A cliente ${booking.client_name || "Cliente"} tem atendimento em ${bookingDate.toLocaleDateString("pt-BR")} às ` +
        `${bookingDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. ` +
        `Confira no WhatsApp e na conta do banco se o sinal de ${Number(booking.signal_amount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} foi recebido.`;

      const sendResult = await sendWhatsAppMessage({
        supabase,
        professionalId: booking.professional_id,
        recipient: String(professional.phone || ""),
        message,
        instance,
        bookingId: booking.id,
        preferredProvider: "evolution",
        details: {
          source: "signal_check_reminder",
        },
      });

      if (sendResult.success) {
        await supabase
          .from("bookings")
          .update({ signal_check_reminder_sent_at: new Date().toISOString() } as never)
          .eq("id", booking.id);
      }

      results.push({
        type: "signal_check_reminder",
        bookingId: booking.id,
        success: sendResult.success,
        error: sendResult.success ? undefined : sendResult.error,
      });
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-reminders error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
