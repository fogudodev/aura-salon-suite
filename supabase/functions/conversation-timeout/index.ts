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

const INACTIVITY_TIMEOUT_MINUTES = Number(Deno.env.get("WHATSAPP_INACTIVITY_MINUTES") || "3");

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
    const cutoff = new Date(Date.now() - INACTIVITY_TIMEOUT_MINUTES * 60 * 1000).toISOString();

    const { data: staleConversations, error } = await supabase
      .from("whatsapp_conversations")
      .select("id, professional_id, client_phone, context, messages, updated_at")
      .eq("status", "active")
      .lt("updated_at", cutoff);

    if (error) throw error;

    if (!staleConversations || staleConversations.length === 0) {
      return new Response(JSON.stringify({ success: true, closed: 0, timeoutMinutes: INACTIVITY_TIMEOUT_MINUTES }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let closed = 0;

    for (const conversation of staleConversations) {
      const { data: professional } = await supabase
        .from("professionals")
        .select("business_name, name, slug")
        .eq("id", conversation.professional_id)
        .single();

      const { data: instance } = await supabase
        .from("whatsapp_instances")
        .select("professional_id, instance_name, meta_phone_id, status")
        .eq("professional_id", conversation.professional_id)
        .maybeSingle();

      const context = typeof conversation.context === "object" && conversation.context ? conversation.context : {};
      const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
      const clientName = typeof context.client_name === "string" ? context.client_name : "";
      const bookingLink = professional?.slug ? `https://gende.io/${professional.slug}` : "";
      const timeoutMessage =
        `⏰ Olá${clientName ? ` ${clientName}` : ""}! Sua conversa foi encerrada por falta de interação.\n\n` +
        `Se ainda quiser agendar, é só mandar uma nova mensagem a qualquer momento.${bookingLink ? `\n\n📱 Ou agende online: ${bookingLink}` : ""}`;

      await insertWhatsAppEventLog(supabase, {
        professionalId: conversation.professional_id,
        conversationId: conversation.id,
        instanceName: instance?.instance_name ?? null,
        provider: "evolution",
        direction: "system",
        eventType: "timeout_candidate_found",
        clientIdentifier: conversation.client_phone,
        normalizedPhone: typeof context.normalized_phone === "string" ? context.normalized_phone : null,
        status: "processing",
        details: {
          timeout_minutes: INACTIVITY_TIMEOUT_MINUTES,
          last_updated_at: conversation.updated_at,
        },
      });

      if (instance) {
        const sendResult = await sendWhatsAppMessage({
          supabase,
          professionalId: conversation.professional_id,
          recipient: String(conversation.client_phone || ""),
          message: timeoutMessage,
          instance,
          conversationId: conversation.id,
          preferredProvider: "evolution",
          details: {
            source: "conversation_timeout",
            timeout_minutes: INACTIVITY_TIMEOUT_MINUTES,
          },
        });

        await insertWhatsAppEventLog(supabase, {
          professionalId: conversation.professional_id,
          conversationId: conversation.id,
          instanceName: instance.instance_name ?? null,
          provider: sendResult.provider || "evolution",
          direction: "system",
          eventType: sendResult.success ? "timeout_message_sent" : "timeout_message_failed",
          clientIdentifier: conversation.client_phone,
          normalizedPhone: typeof context.normalized_phone === "string" ? context.normalized_phone : null,
          status: sendResult.success ? "sent" : "failed",
          errorMessage: sendResult.success ? null : sendResult.error || null,
          details: {
            attempted_providers: sendResult.attemptedProviders,
            response_status: sendResult.responseStatus ?? null,
          },
        });
      }

      await supabase
        .from("whatsapp_conversations")
        .update({
          status: "expired",
          messages: [
            ...messages,
            { role: "system", content: `Conversa encerrada por inatividade (${INACTIVITY_TIMEOUT_MINUTES} min)` },
          ],
        })
        .eq("id", conversation.id);

      closed += 1;
    }

    return new Response(JSON.stringify({
      success: true,
      closed,
      timeoutMinutes: INACTIVITY_TIMEOUT_MINUTES,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("conversation-timeout error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
