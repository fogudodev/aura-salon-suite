import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, professionalId, campaignId } = await req.json();

    // ─── 1. Compute RFM scores for all clients ───
    if (action === "compute-scores") {
      // Get all completed bookings for this professional
      const { data: bookings } = await supabase
        .from("bookings")
        .select("client_id, start_time, price, status")
        .eq("professional_id", professionalId)
        .eq("status", "completed")
        .order("start_time", { ascending: false });

      if (!bookings || bookings.length === 0) {
        return json({ success: true, updated: 0 });
      }

      // Group by client
      const clientMap: Record<string, { dates: Date[]; total: number; count: number }> = {};
      for (const b of bookings) {
        if (!b.client_id) continue;
        if (!clientMap[b.client_id]) clientMap[b.client_id] = { dates: [], total: 0, count: 0 };
        clientMap[b.client_id].dates.push(new Date(b.start_time));
        clientMap[b.client_id].total += Number(b.price) || 0;
        clientMap[b.client_id].count++;
      }

      const now = Date.now();
      const updates: any[] = [];

      for (const [clientId, data] of Object.entries(clientMap)) {
        data.dates.sort((a, b) => b.getTime() - a.getTime());
        const lastVisit = data.dates[0];
        const daysSinceLastVisit = Math.floor((now - lastVisit.getTime()) / 86400000);
        const avgTicket = data.total / data.count;

        // Average return interval
        let avgInterval = 30;
        if (data.dates.length >= 2) {
          const intervals: number[] = [];
          for (let i = 0; i < data.dates.length - 1; i++) {
            intervals.push(Math.floor((data.dates[i].getTime() - data.dates[i + 1].getTime()) / 86400000));
          }
          avgInterval = Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length);
        }

        // RFM Score (0-100)
        // Recency: 0-40 points (less days = more points)
        const recencyScore = Math.max(0, 40 - Math.min(daysSinceLastVisit, 120) * (40 / 120));
        // Frequency: 0-30 points
        const freqScore = Math.min(30, data.count * 3);
        // Monetary: 0-30 points (based on avg ticket, capped at R$500)
        const moneyScore = Math.min(30, (avgTicket / 500) * 30);
        const score = Math.round(recencyScore + freqScore + moneyScore);

        // Status
        let status = "active";
        if (daysSinceLastVisit > avgInterval * 2) status = "lost";
        else if (daysSinceLastVisit > avgInterval * 1.3) status = "at_risk";
        else if (daysSinceLastVisit > avgInterval) status = "inactive";

        updates.push({
          id: clientId,
          last_completed_appointment_at: lastVisit.toISOString(),
          avg_return_interval_days: avgInterval,
          average_ticket: Math.round(avgTicket * 100) / 100,
          reactivation_score: score,
          reactivation_status: status,
        });
      }

      // Batch update
      let updated = 0;
      for (const u of updates) {
        const { id, ...rest } = u;
        const { error } = await supabase.from("clients").update(rest).eq("id", id);
        if (!error) updated++;
      }

      return json({ success: true, updated, total: updates.length });
    }

    // ─── 2. Get eligible clients for reactivation ───
    if (action === "get-eligible") {
      const minScore = 0;
      const { data: clients } = await supabase
        .from("clients")
        .select("id, name, phone, email, reactivation_score, reactivation_status, last_completed_appointment_at, avg_return_interval_days, average_ticket")
        .eq("professional_id", professionalId)
        .in("reactivation_status", ["inactive", "at_risk", "lost"])
        .not("phone", "is", null)
        .order("reactivation_score", { ascending: false });

      // Check no future bookings
      const eligible = [];
      if (clients) {
        for (const c of clients) {
          const { count } = await supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("client_id", c.id)
            .eq("professional_id", professionalId)
            .in("status", ["pending", "confirmed"])
            .gte("start_time", new Date().toISOString());

          if ((count || 0) === 0) {
            eligible.push(c);
          }
        }
      }

      return json({ success: true, clients: eligible });
    }

    // ─── 3. Get metrics ───
    if (action === "get-metrics") {
      // Revenue from converted recipients
      const { data: events } = await supabase
        .from("reactivation_events")
        .select("value, event_type")
        .eq("professional_id", professionalId)
        .eq("event_type", "converted");

      const revenue = (events || []).reduce((sum, e) => sum + (Number(e.value) || 0), 0);
      const converted = (events || []).length;

      // Total recipients
      const { data: campaigns } = await supabase
        .from("reactivation_campaigns")
        .select("id, sent_count")
        .eq("professional_id", professionalId);

      const totalSent = (campaigns || []).reduce((sum, c) => sum + (c.sent_count || 0), 0);
      const conversionRate = totalSent > 0 ? Math.round((converted / totalSent) * 100) : 0;

      // At risk clients count
      const { count: atRiskCount } = await supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("professional_id", professionalId)
        .in("reactivation_status", ["inactive", "at_risk", "lost"]);

      return json({
        success: true,
        metrics: {
          revenue,
          converted,
          totalSent,
          conversionRate,
          atRiskCount: atRiskCount || 0,
        },
      });
    }

    // ─── 4. Execute campaign ───
    if (action === "execute-campaign") {
      const { data: campaign } = await supabase
        .from("reactivation_campaigns")
        .select("*")
        .eq("id", campaignId)
        .eq("professional_id", professionalId)
        .single();

      if (!campaign) return json({ success: false, error: "Campanha não encontrada" });
      if (campaign.status !== "draft") return json({ success: false, error: "Campanha já executada" });

      // Get recipients
      const { data: recipients } = await supabase
        .from("reactivation_campaign_recipients")
        .select("*")
        .eq("campaign_id", campaignId)
        .eq("status", "pending");

      if (!recipients || recipients.length === 0) {
        return json({ success: false, error: "Nenhum destinatário pendente" });
      }

      // Get WhatsApp instance
      const { data: instance } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("professional_id", professionalId)
        .eq("status", "connected")
        .limit(1)
        .single();

      if (!instance) {
        return json({ success: false, error: "WhatsApp não conectado" });
      }

      // Mark campaign as running
      await supabase
        .from("reactivation_campaigns")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("id", campaignId);

      const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
      const evolutionKey = Deno.env.get("EVOLUTION_API_KEY");
      let sentCount = 0;

      const limit = campaign.send_limit_per_day || 50;
      const batch = recipients.slice(0, limit);

      for (const r of batch) {
        try {
          if (!r.client_phone) continue;
          const phone = r.client_phone.replace(/\D/g, "");
          if (phone.length < 10) continue;

          // Send via Evolution API
          const resp = await fetch(`${evolutionUrl}/message/sendText/${instance.instance_name}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: evolutionKey!,
            },
            body: JSON.stringify({
              number: `55${phone}`,
              text: r.message_payload || campaign.message_template,
            }),
          });

          if (resp.ok) {
            await supabase
              .from("reactivation_campaign_recipients")
              .update({ status: "sent", sent_at: new Date().toISOString() })
              .eq("id", r.id);

            await supabase.from("reactivation_events").insert({
              client_id: r.client_id,
              campaign_id: campaignId,
              recipient_id: r.id,
              professional_id: professionalId,
              event_type: "message_sent",
            });
            sentCount++;
          } else {
            const errBody = await resp.text();
            await supabase
              .from("reactivation_campaign_recipients")
              .update({ status: "failed", error_message: errBody.slice(0, 500) })
              .eq("id", r.id);
          }
        } catch (err: any) {
          await supabase
            .from("reactivation_campaign_recipients")
            .update({ status: "failed", error_message: err.message?.slice(0, 500) })
            .eq("id", r.id);
        }
      }

      // Update campaign stats
      const finalStatus = sentCount === batch.length ? "completed" : "completed";
      await supabase
        .from("reactivation_campaigns")
        .update({
          status: finalStatus,
          sent_count: sentCount,
          completed_at: new Date().toISOString(),
        })
        .eq("id", campaignId);

      return json({ success: true, sent: sentCount, total: batch.length });
    }

    // ─── 5. Check conversion (called when booking is created) ───
    if (action === "check-conversion") {
      const { clientId, bookingId, bookingValue } = await req.json();

      // Find recent reactivation messages sent to this client (within 15 days)
      const fifteenDaysAgo = new Date(Date.now() - 15 * 86400000).toISOString();
      const { data: recentRecipients } = await supabase
        .from("reactivation_campaign_recipients")
        .select("id, campaign_id")
        .eq("client_id", clientId)
        .eq("status", "sent")
        .gte("sent_at", fifteenDaysAgo)
        .order("sent_at", { ascending: false })
        .limit(1);

      if (recentRecipients && recentRecipients.length > 0) {
        const recipient = recentRecipients[0];

        // Mark as converted
        await supabase
          .from("reactivation_campaign_recipients")
          .update({
            status: "converted",
            converted_at: new Date().toISOString(),
            conversion_booking_id: bookingId,
            conversion_value: bookingValue || 0,
          })
          .eq("id", recipient.id);

        // Create event
        await supabase.from("reactivation_events").insert({
          client_id: clientId,
          campaign_id: recipient.campaign_id,
          recipient_id: recipient.id,
          professional_id: professionalId,
          event_type: "converted",
          value: bookingValue || 0,
          metadata: { booking_id: bookingId },
        });

        // Update campaign revenue
        await supabase.rpc("increment_campaign_revenue", {
          p_campaign_id: recipient.campaign_id,
          p_value: bookingValue || 0,
        }).catch(() => {
          // Fallback: direct update if RPC doesn't exist
          supabase
            .from("reactivation_campaigns")
            .select("converted_count, revenue_generated")
            .eq("id", recipient.campaign_id)
            .single()
            .then(({ data: c }) => {
              if (c) {
                supabase
                  .from("reactivation_campaigns")
                  .update({
                    converted_count: (c.converted_count || 0) + 1,
                    revenue_generated: (c.revenue_generated || 0) + (bookingValue || 0),
                  })
                  .eq("id", recipient.campaign_id);
              }
            });
        });

        return json({ success: true, converted: true });
      }

      return json({ success: true, converted: false });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err: any) {
    console.error("Reactivation engine error:", err);
    return json({ error: err.message }, 500);
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
