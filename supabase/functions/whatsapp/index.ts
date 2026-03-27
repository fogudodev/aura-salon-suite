import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const getEvolutionHeaders = () => ({
  "Content-Type": "application/json",
  apikey: Deno.env.get("EVOLUTION_API_KEY") || "",
});

const EVOLUTION_URL = () => Deno.env.get("EVOLUTION_API_URL") || "";

function replaceVars(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value || "");
  }
  return result;
}

/** Normaliza telefone adicionando DDI 55 se necessário */
function normalizePhone(phone: string): string {
  // Remove tudo que não é dígito
  const digits = phone.replace(/\D/g, "");
  // Se já começa com 55 e tem 12-13 dígitos (55 + DDD + número), retorna
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) {
    return digits;
  }
  // Se tem 10-11 dígitos (DDD + número), adiciona 55
  if (digits.length >= 10 && digits.length <= 11) {
    return "55" + digits;
  }
  // Retorna como está se não se encaixa nos padrões
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

  try {
    const { action, ...params } = await req.json();

    // Auth check for non-webhook actions
    if (action !== "webhook") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) throw new Error("No authorization header");
      const token = authHeader.replace("Bearer ", "");
      const { data: userData, error } = await supabase.auth.getUser(token);
      if (error || !userData.user) throw new Error("Unauthorized");
    }

    let result;

    switch (action) {
      case "create-instance": {
        const { instanceName, professionalId } = params;
        const res = await fetch(`${EVOLUTION_URL()}/instance/create`, {
          method: "POST",
          headers: getEvolutionHeaders(),
          body: JSON.stringify({
            instanceName,
            integration: "WHATSAPP-BAILEYS",
            qrcode: true,
          }),
        });
        const data = await res.json();

        await supabase.from("whatsapp_instances").upsert({
          professional_id: professionalId,
          instance_name: instanceName,
          instance_id: data.instance?.instanceName || instanceName,
          status: "connecting",
          qr_code: data.qrcode?.base64 || "",
        }, { onConflict: "professional_id" });

        // Auto-configure webhook for the new instance
        const webhookUrl =
  Deno.env.get("EVOLUTION_WEBHOOK_URL") ||
  "https://api.gende.io/functions/v1/whatsapp-webhook";

console.log("Webhook URL usada:", webhookUrl);
        try {
          await fetch(`${EVOLUTION_URL()}/webhook/set/${instanceName}`, {
            method: "POST",
            headers: getEvolutionHeaders(),
            body: JSON.stringify({
              webhook: {
                enabled: true,
                url: webhookUrl,
                webhookByEvents: false,
                webhookBase64: false,
                events: [
                  "MESSAGES_UPSERT",
                  "CONNECTION_UPDATE",
                ],
              },
            }),
          });
          console.log(`Webhook configured for instance ${instanceName}: ${webhookUrl}`);
        } catch (whErr) {
          console.error(`Failed to configure webhook for ${instanceName}:`, whErr);
        }

        result = data;
        break;
      }

      case "set-webhook": {
        const { instanceName } = params;
        const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook`;
        const res = await fetch(`${EVOLUTION_URL()}/webhook/set/${instanceName}`, {
          method: "POST",
          headers: getEvolutionHeaders(),
          body: JSON.stringify({
            webhook: {
              enabled: true,
              url: webhookUrl,
              webhookByEvents: false,
              webhookBase64: false,
              events: [
                "MESSAGES_UPSERT",
                "CONNECTION_UPDATE",
              ],
            },
          }),
        });
        result = await res.json();
        console.log(`Webhook set for ${instanceName}:`, JSON.stringify(result));
        break;
      }

      case "get-qrcode": {
        const { instanceName } = params;
        const res = await fetch(`${EVOLUTION_URL()}/instance/connect/${instanceName}`, {
          method: "GET",
          headers: getEvolutionHeaders(),
        });
        result = await res.json();
        break;
      }

      case "check-status": {
        const { instanceName } = params;
        const res = await fetch(`${EVOLUTION_URL()}/instance/connectionState/${instanceName}`, {
          method: "GET",
          headers: getEvolutionHeaders(),
        });
        const data = await res.json();

        if (params.professionalId) {
          const status = res.status === 404 ? "disconnected" : (data.instance?.state === "open" ? "connected" : "disconnected");
          await supabase.from("whatsapp_instances")
            .update({ status })
            .eq("professional_id", params.professionalId);
        }

        result = data;
        break;
      }

      case "send-message": {
        const { instanceName, phone, message } = params;
        const normalizedPhone = normalizePhone(phone);
        const res = await fetch(`${EVOLUTION_URL()}/message/sendText/${instanceName}`, {
          method: "POST",
          headers: getEvolutionHeaders(),
          body: JSON.stringify({
            number: normalizedPhone,
            text: message,
          }),
        });
        result = await res.json();

        if (res.status === 404) {
          await supabase.from("whatsapp_instances")
            .update({ status: "disconnected" })
            .eq("instance_name", instanceName);
        }
        break;
      }

      case "trigger-automation": {
        const { professionalId, bookingId, triggerType } = params;

        const { data: prof } = await supabase
          .from("professionals")
          .select("id, slug, welcome_message, reminder_message, confirmation_message, business_name, name")
          .eq("id", professionalId)
          .single();

        if (!prof) { result = { success: false, error: "Profissional não encontrado" }; break; }

        const { data: inst } = await supabase
          .from("whatsapp_instances")
          .select("instance_name, status")
          .eq("professional_id", professionalId)
          .single();

        if (!inst || inst.status !== "connected") { result = { success: false, error: "WhatsApp não conectado" }; break; }

        const { data: automation } = await supabase
          .from("whatsapp_automations")
          .select("*")
          .eq("professional_id", professionalId)
          .eq("trigger_type", triggerType)
          .eq("is_active", true)
          .maybeSingle();

        if (!automation) { result = { success: false, error: "Automação não ativa ou não encontrada" }; break; }

        const { data: booking } = await supabase
          .from("bookings")
          .select("*, services:service_id(name)")
          .eq("id", bookingId)
          .single();

        if (!booking) { result = { success: false, error: "Agendamento não encontrado" }; break; }

        const phone = normalizePhone(booking.client_phone || "");
        if (!phone) { result = { success: false, error: "Cliente sem telefone" }; break; }

        const slug = prof.slug || "";
        const bookingLink = slug ? `https://gende.io/${slug}` : "";
        const reviewLink = slug ? `https://gende.io/${slug}?review=true&booking=${bookingId}${booking.employee_id ? `&employee=${booking.employee_id}` : ""}` : "";

        const startDate = new Date(booking.start_time);
        const dataFormatted = startDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
        const horarioFormatted = startDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        const serviceName = (booking as any).services?.name || "serviço";

        const templateVars: Record<string, string> = {
          nome: booking.client_name || "Cliente",
          servico: serviceName,
          data: dataFormatted,
          horario: horarioFormatted,
          link: bookingLink,
          link_avaliacao: reviewLink,
        };

        let messageTemplate = automation.message_template;

        if (triggerType === "booking_created" && prof.confirmation_message) {
          messageTemplate = prof.confirmation_message;
          if (bookingLink) messageTemplate += `\n\n📅 Agende novamente: ${bookingLink}`;
        } else if ((triggerType === "reminder_24h" || triggerType === "reminder_3h") && prof.reminder_message) {
          messageTemplate = prof.reminder_message;
        } else if (triggerType === "post_service") {
          if (prof.welcome_message) messageTemplate = prof.welcome_message;
          if (bookingLink) messageTemplate += `\n\n📅 Agende novamente: ${bookingLink}`;
        } else if (triggerType === "post_sale_review") {
          // Post-sale review request 24h after service
          messageTemplate = automation.message_template || `Olá {nome}! Como foi seu atendimento de {servico}? Adoraríamos saber sua opinião!\n\n⭐ Deixe sua avaliação: {link_avaliacao}\n\nSua opinião é muito importante para nós! 😊`;
        } else if (triggerType === "maintenance_reminder") {
          messageTemplate = automation.message_template || `Olá {nome}! Está chegando a hora da sua manutenção de {servico}. Agende seu horário!\n\n📅 Agendar: {link}\n\nEstamos te esperando! 😊`;
        } else if (triggerType === "reactivation_30d") {
          if (prof.welcome_message) messageTemplate = prof.welcome_message;
          if (bookingLink) messageTemplate += `\n\n✨ Sentimos sua falta! Agende pelo link: ${bookingLink}`;
        }

        const finalMessage = replaceVars(messageTemplate, templateVars);

        const sendRes = await fetch(`${EVOLUTION_URL()}/message/sendText/${inst.instance_name}`, {
          method: "POST",
          headers: getEvolutionHeaders(),
          body: JSON.stringify({ number: phone, text: finalMessage }),
        });
        const sendData = await sendRes.json();

        if (sendRes.status === 404) {
          await supabase.from("whatsapp_instances")
            .update({ status: "disconnected" })
            .eq("instance_name", inst.instance_name);
        }

        await supabase.from("whatsapp_logs").insert({
          professional_id: professionalId,
          automation_id: automation.id,
          booking_id: bookingId,
          recipient_phone: phone,
          message_content: finalMessage,
          status: sendRes.ok ? "sent" : "failed",
          sent_at: sendRes.ok ? new Date().toISOString() : null,
          error_message: sendRes.ok ? null : JSON.stringify(sendData),
        });

        result = { success: sendRes.ok, data: sendData };
        break;
      }

      case "notify-commission": {
        const { professionalId, employeeId, commissionAmount, bookingAmount, percentage } = params;

        const { data: employee } = await supabase
          .from("salon_employees")
          .select("name, phone")
          .eq("id", employeeId)
          .single();

        if (!employee?.phone) { result = { success: false, error: "Funcionário sem telefone cadastrado" }; break; }

        const normalizedEmpPhone = normalizePhone(employee.phone);
        const { data: inst } = await supabase
          .from("whatsapp_instances")
          .select("instance_name, status")
          .eq("professional_id", professionalId)
          .single();

        if (!inst || inst.status !== "connected") { result = { success: false, error: "WhatsApp não conectado" }; break; }

        const msg = `💰 *Nova comissão pendente!*\n\nOlá ${employee.name}! Você tem uma nova comissão:\n\n💇 Valor do serviço: R$ ${Number(bookingAmount).toFixed(2)}\n📊 Percentual: ${percentage}%\n💵 Sua comissão: *R$ ${Number(commissionAmount).toFixed(2)}*\n\nAguarde o repasse pelo gestor. 😊`;

        const sendRes = await fetch(`${EVOLUTION_URL()}/message/sendText/${inst.instance_name}`, {
          method: "POST",
          headers: getEvolutionHeaders(),
          body: JSON.stringify({ number: normalizedEmpPhone, text: msg }),
        });
        const sendData = await sendRes.json();

        if (sendRes.status === 404) {
          await supabase.from("whatsapp_instances")
            .update({ status: "disconnected" })
            .eq("instance_name", inst.instance_name);
        }

        await supabase.from("whatsapp_logs").insert({
          professional_id: professionalId,
          recipient_phone: normalizedEmpPhone,
          message_content: msg,
          status: sendRes.ok ? "sent" : "failed",
          sent_at: sendRes.ok ? new Date().toISOString() : null,
          error_message: sendRes.ok ? null : JSON.stringify(sendData),
        });

        result = { success: sendRes.ok, data: sendData };
        break;
      }

      case "notify-commission-paid": {
        const { professionalId, employeeIds, totalAmount } = params;

        const { data: inst } = await supabase
          .from("whatsapp_instances")
          .select("instance_name, status")
          .eq("professional_id", professionalId)
          .single();

        if (!inst || inst.status !== "connected") { result = { success: false, error: "WhatsApp não conectado" }; break; }

        const results: Array<{ employeeId: string; success: boolean }> = [];

        for (const empId of employeeIds) {
          const { data: employee } = await supabase
            .from("salon_employees")
            .select("name, phone")
            .eq("id", empId)
            .single();

          if (!employee?.phone) { results.push({ employeeId: empId, success: false }); continue; }

          const normalizedPaidPhone = normalizePhone(employee.phone);
          const msg = `✅ *Comissão paga!*\n\nOlá ${employee.name}! Suas comissões foram pagas.\n\n💵 Valor total: *R$ ${Number(totalAmount).toFixed(2)}*\n\nObrigado pelo excelente trabalho! 🎉`;

          const sendRes = await fetch(`${EVOLUTION_URL()}/message/sendText/${inst.instance_name}`, {
            method: "POST",
            headers: getEvolutionHeaders(),
            body: JSON.stringify({ number: normalizedPaidPhone, text: msg }),
          });
          const sendData = await sendRes.json();

          if (sendRes.status === 404) {
            await supabase.from("whatsapp_instances")
              .update({ status: "disconnected" })
              .eq("instance_name", inst.instance_name);
          }

          await supabase.from("whatsapp_logs").insert({
            professional_id: professionalId,
            recipient_phone: normalizedPaidPhone,
            message_content: msg,
            status: sendRes.ok ? "sent" : "failed",
            sent_at: sendRes.ok ? new Date().toISOString() : null,
            error_message: sendRes.ok ? null : JSON.stringify(sendData),
          });

          results.push({ employeeId: empId, success: sendRes.ok });
        }

        result = { success: true, results };
        break;
      }

      case "webhook": {
        // Redireciona para o novo bot conversacional com IA
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const webhookPayload = params.data || params;
        
        try {
          await fetch(`${supabaseUrl}/functions/v1/whatsapp-webhook`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(webhookPayload),
          });
        } catch (e) {
          console.error("Error forwarding to webhook bot:", e);
        }
        
        result = { success: true };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("WhatsApp function error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
