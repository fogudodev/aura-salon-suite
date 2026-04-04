import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { sendWhatsAppMessage } from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

  try {
    const { action, ...params } = await req.json();

    if (action === "process-cancellation") {
      const { professionalId, bookingId, serviceId, startTime, endTime, employeeId } = params;

      // 1. Check waitlist settings
      const { data: settings } = await supabase
        .from("waitlist_settings")
        .select("*")
        .eq("professional_id", professionalId)
        .maybeSingle();

      if (settings && !settings.enabled) {
        return json({ success: false, reason: "waitlist_disabled" });
      }

      const maxNotifications = settings?.max_notifications || 3;
      const reservationMinutes = settings?.reservation_minutes || 3;

      // 2. Find matching waitlist entries (active, same service, compatible date)
      const slotDate = new Date(startTime);
      const dateStr = slotDate.toISOString().split("T")[0];
      const hour = slotDate.getHours();
      const period = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

      const query = supabase
        .from("waitlist")
        .select("*, clients(id, name, phone)")
        .eq("professional_id", professionalId)
        .eq("status", "waiting")
        .or(`service_id.eq.${serviceId},service_id.is.null`);

      // Filter by preferred date (exact match or any)
      const { data: allEntries } = await query.order("priority", { ascending: false }).order("created_at", { ascending: true });

      if (!allEntries || allEntries.length === 0) {
        // 3. Fallback: find clients who previously booked this service (AI recommendation)
        const candidates = await findSmartCandidates(supabase, professionalId, serviceId, startTime);
        if (candidates.length === 0) {
          return json({ success: false, reason: "no_candidates" });
        }
        // Send offers to smart candidates
        const sent = await sendOffers(
          supabase, professionalId, serviceId, startTime, endTime,
          candidates.slice(0, maxNotifications), reservationMinutes, null
        );
        return json({ success: true, offers_sent: sent });
      }

      // 4. Filter entries by date/period compatibility
      const compatible = allEntries.filter((e: any) => {
        if (e.preferred_date !== dateStr) return false;
        if (e.preferred_period === "any") return true;
        return e.preferred_period === period;
      });

      // If no date-compatible entries, try entries with any date preference
      const candidates = compatible.length > 0 ? compatible : allEntries.filter((e: any) => {
        return e.preferred_period === "any" || e.preferred_period === period;
      });

      if (candidates.length === 0) {
        // Try smart AI candidates
        const smartCandidates = await findSmartCandidates(supabase, professionalId, serviceId, startTime);
        if (smartCandidates.length > 0) {
          const sent = await sendOffers(
            supabase, professionalId, serviceId, startTime, endTime,
            smartCandidates.slice(0, maxNotifications), reservationMinutes, null
          );
          return json({ success: true, offers_sent: sent, source: "ai" });
        }
        return json({ success: false, reason: "no_compatible_candidates" });
      }

      // 5. Rank candidates by priority
      const ranked = rankCandidates(candidates, settings?.prioritize_vip !== false);
      const toNotify = ranked.slice(0, maxNotifications);

      // 6. Send WhatsApp offers
      const offerCandidates = toNotify.map((e: any) => ({
        name: e.client_name,
        phone: e.client_phone,
        waitlistEntryId: e.id,
      }));
      const sent = await sendOffers(
        supabase, professionalId, serviceId, startTime, endTime,
        offerCandidates, reservationMinutes, bookingId
      );

      // 7. Update waitlist entries status to "notified"
      for (const entry of toNotify) {
        await supabase
          .from("waitlist")
          .update({ status: "notified", notified_at: new Date().toISOString() })
          .eq("id", entry.id);
      }

      return json({ success: true, offers_sent: sent, source: "waitlist" });
    }

    if (action === "accept-offer") {
      const { offerId, clientPhone } = params;

      // Find the offer
      const { data: offer, error: offerErr } = await supabase
        .from("waitlist_offers")
        .select("*")
        .eq("id", offerId)
        .single();

      if (offerErr || !offer) {
        return json({ success: false, error: "Oferta não encontrada" });
      }

      if (offer.status !== "sent") {
        return json({ success: false, error: "Esta oferta já foi respondida" });
      }

      // Check if reserved_until has passed
      if (offer.reserved_until && new Date(offer.reserved_until) < new Date()) {
        await supabase.from("waitlist_offers").update({ status: "expired" }).eq("id", offerId);
        return json({ success: false, error: "Tempo de reserva expirou" });
      }

      // Check if slot is still available
      const { data: conflicts } = await supabase
        .from("bookings")
        .select("id")
        .eq("professional_id", offer.professional_id)
        .neq("status", "cancelled")
        .lt("start_time", offer.slot_end)
        .gt("end_time", offer.slot_start);

      if (conflicts && conflicts.length > 0) {
        await supabase.from("waitlist_offers").update({ status: "slot_taken" }).eq("id", offerId);
        return json({ success: false, error: "Horário já foi preenchido" });
      }

      // Create the booking
      const { data: service } = await supabase
        .from("services")
        .select("price, duration_minutes")
        .eq("id", offer.service_id)
        .single();

      // Find or create client
      let clientId = null;
      const { data: existingClient } = await supabase
        .from("clients")
        .select("id")
        .eq("professional_id", offer.professional_id)
        .eq("phone", normalizePhone(clientPhone || offer.client_phone))
        .maybeSingle();

      if (existingClient) {
        clientId = existingClient.id;
      } else {
        const { data: newClient } = await supabase
          .from("clients")
          .insert({
            professional_id: offer.professional_id,
            name: offer.client_name,
            phone: normalizePhone(offer.client_phone),
          })
          .select("id")
          .single();
        clientId = newClient?.id;
      }

      const { data: booking, error: bookErr } = await supabase
        .from("bookings")
        .insert({
          professional_id: offer.professional_id,
          service_id: offer.service_id,
          client_id: clientId,
          client_name: offer.client_name,
          client_phone: offer.client_phone,
          start_time: offer.slot_start,
          end_time: offer.slot_end,
          price: service?.price || 0,
          duration_minutes: service?.duration_minutes || 30,
          status: "confirmed",
        })
        .select("id")
        .single();

      if (bookErr) {
        return json({ success: false, error: "Erro ao criar agendamento" });
      }

      // Update offer status
      await supabase.from("waitlist_offers").update({
        status: "accepted",
        responded_at: new Date().toISOString(),
        created_booking_id: booking.id,
      }).eq("id", offerId);

      // Expire other offers for same slot
      await supabase.from("waitlist_offers").update({ status: "slot_taken" })
        .eq("professional_id", offer.professional_id)
        .eq("slot_start", offer.slot_start)
        .neq("id", offerId)
        .eq("status", "sent");

      // Update waitlist entry if linked
      if (offer.waitlist_entry_id) {
        await supabase.from("waitlist").update({ status: "booked" }).eq("id", offer.waitlist_entry_id);
      }

      return json({ success: true, booking_id: booking.id });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("Waitlist process error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function rankCandidates(candidates: any[], prioritizeVip: boolean): any[] {
  return [...candidates].sort((a, b) => {
    // Higher priority first
    if (b.priority !== a.priority) return b.priority - a.priority;
    // Earlier entries first (FIFO)
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

async function findSmartCandidates(
  supabase: any, professionalId: string, serviceId: string, startTime: string
): Promise<Array<{ name: string; phone: string; waitlistEntryId: string | null }>> {
  // Find clients who booked this service before and haven't booked recently
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: pastClients } = await supabase
    .from("bookings")
    .select("client_name, client_phone, client_id")
    .eq("professional_id", professionalId)
    .eq("service_id", serviceId)
    .eq("status", "completed")
    .lt("start_time", thirtyDaysAgo.toISOString())
    .order("start_time", { ascending: false })
    .limit(20);

  if (!pastClients || pastClients.length === 0) return [];

  // Deduplicate by phone
  const seen = new Set<string>();
  const unique = [];
  for (const c of pastClients) {
    const phone = normalizePhone(c.client_phone || "");
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);

    // Check if they already have an upcoming booking
    const { data: upcoming } = await supabase
      .from("bookings")
      .select("id")
      .eq("professional_id", professionalId)
      .eq("client_phone", c.client_phone)
      .gte("start_time", new Date().toISOString())
      .neq("status", "cancelled")
      .limit(1);

    if (!upcoming || upcoming.length === 0) {
      unique.push({ name: c.client_name, phone: c.client_phone, waitlistEntryId: null });
    }
    if (unique.length >= 5) break;
  }

  return unique;
}

async function sendOffers(
  supabase: any, professionalId: string, serviceId: string,
  startTime: string, endTime: string,
  candidates: Array<{ name: string; phone: string; waitlistEntryId: string | null }>,
  reservationMinutes: number, cancelledBookingId: string | null
): Promise<number> {
  // Get WhatsApp instance
  const { data: inst } = await supabase
    .from("whatsapp_instances")
    .select("instance_name, status")
    .eq("professional_id", professionalId)
    .single();

  if (!inst || inst.status !== "connected") return 0;

  // Get professional info
  const { data: prof } = await supabase
    .from("professionals")
    .select("name, business_name, slug")
    .eq("id", professionalId)
    .single();

  // Get service name
  const { data: service } = await supabase
    .from("services")
    .select("name, price")
    .eq("id", serviceId)
    .single();

  const slotDate = new Date(startTime);
  const dateFormatted = slotDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const timeFormatted = slotDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const businessName = prof?.business_name || prof?.name || "Salão";
  const bookingLink = prof?.slug ? `https://gende.io/${prof.slug}` : "";

  let sent = 0;

  for (const candidate of candidates) {
    const reservedUntil = new Date(Date.now() + reservationMinutes * 60 * 1000);

    // Create offer record
    const { data: offer } = await supabase.from("waitlist_offers").insert({
      professional_id: professionalId,
      waitlist_entry_id: candidate.waitlistEntryId,
      booking_id: cancelledBookingId,
      client_name: candidate.name,
      client_phone: candidate.phone,
      service_id: serviceId,
      slot_start: startTime,
      slot_end: endTime,
      status: "sent",
      reserved_until: reservedUntil.toISOString(),
    }).select("id").single();

    // Send WhatsApp message
    const phone = normalizePhone(candidate.phone);
    const message = `✨ *Horário disponível!*

Olá ${candidate.name}! Acabou de abrir um horário:

📅 *${dateFormatted}* às *${timeFormatted}*
💇 *${service?.name || "Serviço"}*
📍 ${businessName}

Gostaria de aproveitar esse horário?

${bookingLink ? `📲 Agende agora: ${bookingLink}` : "Entre em contato para confirmar!"}

⏰ Responda rápido, a vaga é limitada!`;

    try {
      const sendResult = await sendWhatsAppMessage({
        supabase,
        professionalId,
        recipient: phone,
        message,
        instance: inst,
        preferredProvider: "evolution",
        details: {
          source: "waitlist_offer",
          offer_id: offer?.id || null,
          cancelled_booking_id: cancelledBookingId,
        },
      });

      if (sendResult.success) {
        sent++;
      }
    } catch (e) {
      console.error("Error sending waitlist offer:", e);
    }
  }

  return sent;
}
