import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    // Find active conversations inactive for 30+ minutes
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data: staleConvs, error } = await supabase
      .from("whatsapp_conversations")
      .select("id, professional_id, client_phone, context, messages")
      .eq("status", "active")
      .lt("updated_at", thirtyMinAgo);

    if (error) throw error;
    if (!staleConvs || staleConvs.length === 0) {
      return new Response(JSON.stringify({ success: true, closed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let closed = 0;

    for (const conv of staleConvs) {
      // Get instance for this professional
      const { data: inst } = await supabase
        .from("whatsapp_instances")
        .select("instance_name, status")
        .eq("professional_id", conv.professional_id)
        .eq("status", "connected")
        .maybeSingle();

      if (inst) {
        const clientName = (conv.context as any)?.client_name || "Cliente";
        const { data: prof } = await supabase
          .from("professionals")
          .select("business_name, name, slug")
          .eq("id", conv.professional_id)
          .single();

        const profName = prof?.business_name || prof?.name || "";
        const bookingLink = prof?.slug ? `https://gende.io/${prof.slug}` : "";

        const timeoutMsg = `⏰ Olá${clientName !== "Cliente" ? ` ${clientName}` : ""}! Sua conversa foi encerrada por inatividade.

Se ainda quiser agendar, é só nos enviar uma nova mensagem a qualquer momento! 😊${bookingLink ? `\n\n📱 Ou agende online: ${bookingLink}` : ""}`;

        try {
          await fetch(`${EVOLUTION_URL}/message/sendText/${inst.instance_name}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
            body: JSON.stringify({ number: conv.client_phone, text: timeoutMsg }),
          });
        } catch (e) {
          console.error("Error sending timeout msg:", e);
        }
      }

      // Mark as expired
      const msgs = Array.isArray(conv.messages) ? conv.messages : [];
      await supabase
        .from("whatsapp_conversations")
        .update({
          status: "expired",
          messages: [...msgs, { role: "system", content: "Conversa encerrada por inatividade (30 min)" }],
        })
        .eq("id", conv.id);

      closed++;
    }

    return new Response(JSON.stringify({ success: true, closed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Timeout error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
