import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ADMIN_PHONE = "5521979267979";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, businessName, email, phone } = await req.json();

    const EVOLUTION_URL = (Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/$/, "");
const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";

if (!EVOLUTION_URL) {
  throw new Error("EVOLUTION_API_URL NÃO CONFIGURADA");
}

    // Find an active admin instance to send from - use "gende_" prefixed instance
    // We'll send directly via Evolution API using a known admin instance
    const message = `🆕 *Novo cadastro no Gende!*

👤 *Nome:* ${name || "Não informado"}
🏪 *Studio/Salão:* ${businessName || "Não informado"}
📧 *Email:* ${email || "Não informado"}
📱 *WhatsApp:* ${phone || "Não informado"}

📅 *Data:* ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}

_Entre em contato para ajudar na configuração!_`;

    // Try to find any connected instance to send from
    const { createClient } = await import("npm:@supabase/supabase-js@2.57.2");
    const supabase = createClient(
  Deno.env.get("SUPABASE_PUBLIC_URL") ||
  Deno.env.get("API_EXTERNAL_URL") ||
  "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false } }
);

    const { data: instances } = await supabase
      .from("whatsapp_instances")
      .select("instance_name, status")
      .eq("status", "connected")
      .limit(1);

    if (!instances || instances.length === 0) {
      console.log("No connected WhatsApp instance found. Signup data:", { name, businessName, email, phone });
      return new Response(JSON.stringify({ success: false, error: "No connected instance" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const instanceName = instances[0].instance_name;

    const sendRes = await fetch(`${EVOLUTION_URL}/message/sendText/${instanceName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: EVOLUTION_KEY,
      },
      body: JSON.stringify({
        number: ADMIN_PHONE,
        text: message,
      }),
    });

    const sendData = await sendRes.json();
    console.log("Signup notification sent:", sendRes.ok, JSON.stringify(sendData));

    return new Response(JSON.stringify({ success: sendRes.ok }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Notify signup error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
