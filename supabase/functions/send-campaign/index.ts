import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { sendWhatsAppMessage } from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function replaceVars(template: string, vars: Record<string, string>): string {
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

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    // Auth check using getClaims
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authError } = await anonClient.auth.getClaims(token);
    if (authError || !claimsData?.claims?.sub) throw new Error("Unauthorized");

    const { action, ...params } = await req.json();

    switch (action) {
      case "create-campaign": {
        const { professionalId, name, message, clientIds } = params;

        // Get professional's plan
        const { data: sub } = await supabaseAdmin
          .from("subscriptions")
          .select("plan_id")
          .eq("professional_id", professionalId)
          .single();

        const planId = sub?.plan_id || "free";

        // Get plan limits
        const { data: limits } = await supabaseAdmin
          .from("plan_limits")
          .select("*")
          .eq("plan_id", planId)
          .single();

        if (!limits) throw new Error("Limites do plano não encontrados");

        // Get professional extras
        const { data: profLimits } = await supabaseAdmin
          .from("professional_limits")
          .select("*")
          .eq("professional_id", professionalId)
          .maybeSingle();

        const extraCampaigns = profLimits?.extra_campaigns_purchased || 0;
        const extraContacts = profLimits?.extra_contacts_purchased || 0;

        // Check daily campaign count
        const today = new Date().toISOString().split("T")[0];
        const { data: usage } = await supabaseAdmin
          .from("daily_message_usage")
          .select("*")
          .eq("professional_id", professionalId)
          .eq("usage_date", today)
          .maybeSingle();

        const campaignsSent = usage?.campaigns_sent || 0;

        const effectiveDailyCampaigns = limits.daily_campaigns === -1 ? -1 : limits.daily_campaigns + extraCampaigns;

        if (effectiveDailyCampaigns !== -1 && campaignsSent >= effectiveDailyCampaigns) {
          return new Response(JSON.stringify({
            success: false,
            error: `Limite diário de campanhas atingido (${effectiveDailyCampaigns} por dia). Compre mais add-ons para expandir.`
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Check interval between campaigns
        const { data: lastCampaign } = await supabaseAdmin
          .from("campaigns")
          .select("started_at")
          .eq("professional_id", professionalId)
          .not("started_at", "is", null)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastCampaign?.started_at) {
          const lastTime = new Date(lastCampaign.started_at).getTime();
          const minInterval = (limits.campaign_min_interval_hours || 6) * 60 * 60 * 1000;
          if (Date.now() - lastTime < minInterval) {
            const hoursLeft = ((minInterval - (Date.now() - lastTime)) / (60 * 60 * 1000)).toFixed(1);
            return new Response(JSON.stringify({
              success: false,
              error: `Aguarde ${hoursLeft}h antes de enviar outra campanha (intervalo mínimo: ${limits.campaign_min_interval_hours}h)`
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }

        // Get clients
        let clients;
        if (clientIds && clientIds.length > 0) {
          const { data } = await supabaseAdmin
            .from("clients")
            .select("id, name, phone")
            .eq("professional_id", professionalId)
            .in("id", clientIds)
            .not("phone", "is", null);
          clients = data;
        } else {
          const { data } = await supabaseAdmin
            .from("clients")
            .select("id, name, phone")
            .eq("professional_id", professionalId)
            .not("phone", "is", null)
            .not("phone", "eq", "");
          clients = data;
        }

        if (!clients || clients.length === 0) {
          return new Response(JSON.stringify({ success: false, error: "Nenhum cliente com telefone encontrado" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // Enforce contact limit (plan + extras)
        const maxContacts = limits.campaign_max_contacts;
        const effectiveMaxContacts = maxContacts === -1 ? -1 : maxContacts + extraContacts;
        if (effectiveMaxContacts !== -1 && clients.length > effectiveMaxContacts) {
          clients = clients.slice(0, effectiveMaxContacts);
        }

        // Create campaign
        const { data: campaign, error: campError } = await supabaseAdmin
          .from("campaigns")
          .insert({
            professional_id: professionalId,
            name,
            message,
            status: "sending",
            target_type: clientIds?.length ? "selected" : "all_clients",
            total_contacts: clients.length,
            started_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (campError) throw campError;

        // Insert contacts
        const contacts = clients.map(c => ({
          campaign_id: campaign.id,
          client_id: c.id,
          phone: c.phone,
          client_name: c.name,
          status: "pending",
        }));

        await supabaseAdmin.from("campaign_contacts").insert(contacts);

        // Get WhatsApp instance
        const { data: inst } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("instance_name, status")
          .eq("professional_id", professionalId)
          .single();

        if (!inst || inst.status !== "connected") {
          await supabaseAdmin.from("campaigns").update({ status: "failed" }).eq("id", campaign.id);
          return new Response(JSON.stringify({ success: false, error: "WhatsApp não conectado" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // Get professional info for variables
        const { data: prof } = await supabaseAdmin
          .from("professionals")
          .select("slug, name, business_name")
          .eq("id", professionalId)
          .single();

        // Send messages
        let sentCount = 0;
        let failedCount = 0;

        for (const contact of contacts) {
          if (!contact.phone || contact.phone.trim() === "") {
            failedCount++;
            await supabaseAdmin.from("campaign_contacts")
              .update({ status: "failed", error_message: "Phone not found" })
              .eq("campaign_id", campaign.id)
              .eq("phone", contact.phone);
            continue;
          }

          const finalMessage = replaceVars(message, {
            nome: contact.client_name || "Cliente",
            link: prof?.slug ? `https://gende.io/${prof.slug}` : "",
            negocio: prof?.business_name || prof?.name || "",
          });

          try {
            const sendResult = await sendWhatsAppMessage({
              supabase: supabaseAdmin,
              professionalId,
              recipient: contact.phone,
              message: finalMessage,
              instance: inst,
              preferredProvider: "evolution",
              details: {
                source: "send_campaign",
                campaign_id: campaign.id,
              },
            });

            if (sendResult.success) {
              sentCount++;
              await supabaseAdmin.from("campaign_contacts")
                .update({ status: "sent", sent_at: new Date().toISOString() })
                .eq("campaign_id", campaign.id)
                .eq("phone", contact.phone);
            } else {
              failedCount++;
              await supabaseAdmin.from("campaign_contacts")
                .update({ status: "failed", error_message: sendResult.error || JSON.stringify(sendResult.responseBody ?? {}) })
                .eq("campaign_id", campaign.id)
                .eq("phone", contact.phone);
            }
          } catch (e) {
            failedCount++;
            await supabaseAdmin.from("campaign_contacts")
              .update({ status: "failed", error_message: e.message })
              .eq("campaign_id", campaign.id)
              .eq("phone", contact.phone);
          }

          // Small delay between messages to avoid rate limiting
          await new Promise(r => setTimeout(r, 1000));
        }

        // Update campaign
        await supabaseAdmin.from("campaigns").update({
          status: "completed",
          sent_count: sentCount,
          failed_count: failedCount,
          completed_at: new Date().toISOString(),
        }).eq("id", campaign.id);

        // Update daily usage
        await supabaseAdmin.from("daily_message_usage").upsert({
          professional_id: professionalId,
          usage_date: today,
          campaigns_sent: campaignsSent + 1,
          reminders_sent: usage?.reminders_sent || 0,
        }, { onConflict: "professional_id,usage_date" });

        return new Response(JSON.stringify({
          success: true,
          campaignId: campaign.id,
          sent: sentCount,
          failed: failedCount,
          total: clients.length,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "get-limits": {
        const { professionalId } = params;

        const { data: sub } = await supabaseAdmin
          .from("subscriptions")
          .select("plan_id")
          .eq("professional_id", professionalId)
          .single();

        const planId = sub?.plan_id || "free";

        const { data: limits } = await supabaseAdmin
          .from("plan_limits")
          .select("*")
          .eq("plan_id", planId)
          .single();

        const today = new Date().toISOString().split("T")[0];
        const { data: usage } = await supabaseAdmin
          .from("daily_message_usage")
          .select("*")
          .eq("professional_id", professionalId)
          .eq("usage_date", today)
          .maybeSingle();

        // Get professional extras
        const { data: profLimits } = await supabaseAdmin
          .from("professional_limits")
          .select("*")
          .eq("professional_id", professionalId)
          .maybeSingle();

        const baseLimits = limits || { daily_reminders: 5, daily_campaigns: 0, campaign_max_contacts: 0, campaign_min_interval_hours: 6 };
        const extras = {
          extra_reminders: profLimits?.extra_reminders_purchased || 0,
          extra_campaigns: profLimits?.extra_campaigns_purchased || 0,
          extra_contacts: profLimits?.extra_contacts_purchased || 0,
        };

        return new Response(JSON.stringify({
          planId,
          limits: baseLimits,
          extras,
          usage: { reminders_sent: usage?.reminders_sent || 0, campaigns_sent: usage?.campaigns_sent || 0 },
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error("Campaign error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
