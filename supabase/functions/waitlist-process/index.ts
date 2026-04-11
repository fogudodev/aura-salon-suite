import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { sendWhatsAppMessage } from "../_shared/whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type BodyParseResult = {
  ok: boolean;
  data: Record<string, unknown>;
  error?: string;
};

type WaitlistCandidate = {
  name: string;
  phone: string;
  waitlistEntryId: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function parseJsonBody(req: Request): Promise<BodyParseResult> {
  try {
    const raw = await req.text();
    if (!raw.trim()) {
      return { ok: true, data: {} };
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, data: {}, error: "Request body must be a JSON object" };
    }

    return { ok: true, data: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, data: {}, error: "Invalid JSON body" };
  }
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidDateTime(value: string) {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) return digits;
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits;
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
    const parsedBody = await parseJsonBody(req);
    if (!parsedBody.ok) {
      return jsonResponse({ success: false, error: parsedBody.error }, 400);
    }

    const action = asString(parsedBody.data.action);
    if (!action) {
      return jsonResponse({ success: false, error: "action is required" }, 400);
    }

    const params = parsedBody.data;

    if (action === "process-cancellation") {
      const professionalId = asString(params.professionalId);
      const bookingId = asString(params.bookingId) || null;
      const serviceId = asString(params.serviceId);
      const startTime = asString(params.startTime);
      const endTime = asString(params.endTime);

      if (!professionalId || !serviceId || !startTime || !endTime) {
        return jsonResponse({
          success: false,
          error: "professionalId, serviceId, startTime and endTime are required",
        }, 400);
      }

      if (!isValidDateTime(startTime) || !isValidDateTime(endTime)) {
        return jsonResponse({ success: false, error: "startTime or endTime is invalid" }, 400);
      }

      const { data: settings, error: settingsError } = await supabase
        .from("waitlist_settings")
        .select("*")
        .eq("professional_id", professionalId)
        .maybeSingle();
      if (settingsError) throw settingsError;

      // Conservative fail-closed behavior: if settings were never created, skip processing.
      if (!settings) {
        return jsonResponse({
          success: true,
          skipped: true,
          reason: "waitlist_settings_missing",
        });
      }

      if (settings.enabled === false) {
        return jsonResponse({
          success: true,
          skipped: true,
          reason: "waitlist_disabled",
        });
      }

      const maxNotifications = Number(settings.max_notifications || 3);
      const reservationMinutes = Number(settings.reservation_minutes || 3);

      const slotDate = new Date(startTime);
      const dateStr = slotDate.toISOString().split("T")[0];
      const hour = slotDate.getHours();
      const period = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

      const { data: allEntries, error: entriesError } = await supabase
        .from("waitlist")
        .select("*, clients(id, name, phone)")
        .eq("professional_id", professionalId)
        .eq("status", "waiting")
        .or(`service_id.eq.${serviceId},service_id.is.null`)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: true });
      if (entriesError) throw entriesError;

      if (!allEntries || allEntries.length === 0) {
        const smart = await findSmartCandidates(supabase, professionalId, serviceId);
        if (smart.length === 0) {
          return jsonResponse({ success: false, reason: "no_candidates" }, 404);
        }

        const sent = await sendOffers(
          supabase,
          professionalId,
          serviceId,
          startTime,
          endTime,
          smart.slice(0, maxNotifications),
          reservationMinutes,
          null,
        );

        return jsonResponse({ success: true, offers_sent: sent, source: "smart_candidates" });
      }

      const compatible = allEntries.filter((entry: Record<string, unknown>) => {
        const preferredDate = asString(entry.preferred_date);
        const preferredPeriod = asString(entry.preferred_period) || "any";
        if (preferredDate && preferredDate !== dateStr) return false;
        if (preferredPeriod === "any") return true;
        return preferredPeriod === period;
      });

      const candidates = compatible.length > 0
        ? compatible
        : allEntries.filter((entry: Record<string, unknown>) => {
          const preferredPeriod = asString(entry.preferred_period) || "any";
          return preferredPeriod === "any" || preferredPeriod === period;
        });

      if (candidates.length === 0) {
        const smart = await findSmartCandidates(supabase, professionalId, serviceId);
        if (smart.length > 0) {
          const sent = await sendOffers(
            supabase,
            professionalId,
            serviceId,
            startTime,
            endTime,
            smart.slice(0, maxNotifications),
            reservationMinutes,
            null,
          );
          return jsonResponse({ success: true, offers_sent: sent, source: "smart_candidates" });
        }

        return jsonResponse({ success: false, reason: "no_compatible_candidates" }, 404);
      }

      const ranked = rankCandidates(candidates, settings.prioritize_vip !== false);
      const toNotify = ranked.slice(0, maxNotifications);

      const offerCandidates: WaitlistCandidate[] = toNotify.map((entry: Record<string, unknown>) => ({
        name: asString(entry.client_name) || "Cliente",
        phone: asString(entry.client_phone),
        waitlistEntryId: asString(entry.id) || null,
      }));

      const sent = await sendOffers(
        supabase,
        professionalId,
        serviceId,
        startTime,
        endTime,
        offerCandidates,
        reservationMinutes,
        bookingId,
      );

      for (const entry of toNotify) {
        const entryId = asString((entry as Record<string, unknown>).id);
        if (!entryId) continue;

        const { error: updateEntryError } = await supabase
          .from("waitlist")
          .update({ status: "notified", notified_at: new Date().toISOString() })
          .eq("id", entryId);
        if (updateEntryError) throw updateEntryError;
      }

      return jsonResponse({ success: true, offers_sent: sent, source: "waitlist" });
    }

    if (action === "accept-offer") {
      const offerId = asString(params.offerId);
      const clientPhone = asString(params.clientPhone);
      if (!offerId) {
        return jsonResponse({ success: false, error: "offerId is required" }, 400);
      }

      const { data: offer, error: offerError } = await supabase
        .from("waitlist_offers")
        .select("*")
        .eq("id", offerId)
        .maybeSingle();
      if (offerError) throw offerError;
      if (!offer) {
        return jsonResponse({ success: false, error: "Offer not found" }, 404);
      }

      if (offer.status !== "sent") {
        return jsonResponse({ success: false, error: "Offer already handled" }, 400);
      }

      if (offer.reserved_until && new Date(offer.reserved_until) < new Date()) {
        const { error: expireError } = await supabase
          .from("waitlist_offers")
          .update({ status: "expired" })
          .eq("id", offerId);
        if (expireError) throw expireError;
        return jsonResponse({ success: false, error: "Offer reservation expired" }, 400);
      }

      const { data: conflicts, error: conflictError } = await supabase
        .from("bookings")
        .select("id")
        .eq("professional_id", offer.professional_id)
        .neq("status", "cancelled")
        .lt("start_time", offer.slot_end)
        .gt("end_time", offer.slot_start);
      if (conflictError) throw conflictError;

      if (conflicts && conflicts.length > 0) {
        const { error: takenError } = await supabase
          .from("waitlist_offers")
          .update({ status: "slot_taken" })
          .eq("id", offerId);
        if (takenError) throw takenError;
        return jsonResponse({ success: false, error: "Slot already taken" }, 409);
      }

      const { data: service, error: serviceError } = await supabase
        .from("services")
        .select("price, duration_minutes")
        .eq("id", offer.service_id)
        .maybeSingle();
      if (serviceError) throw serviceError;

      const normalizedClientPhone = normalizePhone(clientPhone || offer.client_phone || "");
      if (!normalizedClientPhone) {
        return jsonResponse({ success: false, error: "Client phone is invalid" }, 400);
      }

      let clientId: string | null = null;
      const { data: existingClient, error: existingClientError } = await supabase
        .from("clients")
        .select("id")
        .eq("professional_id", offer.professional_id)
        .eq("phone", normalizedClientPhone)
        .maybeSingle();
      if (existingClientError) throw existingClientError;

      if (existingClient) {
        clientId = String(existingClient.id);
      } else {
        const { data: newClient, error: newClientError } = await supabase
          .from("clients")
          .insert({
            professional_id: offer.professional_id,
            name: offer.client_name || "Cliente",
            phone: normalizedClientPhone,
          })
          .select("id")
          .single();
        if (newClientError) throw newClientError;
        clientId = newClient?.id ? String(newClient.id) : null;
      }

      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .insert({
          professional_id: offer.professional_id,
          service_id: offer.service_id,
          client_id: clientId,
          client_name: offer.client_name,
          client_phone: normalizedClientPhone,
          start_time: offer.slot_start,
          end_time: offer.slot_end,
          price: Number(service?.price || 0),
          duration_minutes: Number(service?.duration_minutes || 30),
          status: "confirmed",
        })
        .select("id")
        .single();
      if (bookingError) throw bookingError;

      const { error: updateOfferError } = await supabase
        .from("waitlist_offers")
        .update({
          status: "accepted",
          responded_at: new Date().toISOString(),
          created_booking_id: booking.id,
        })
        .eq("id", offerId);
      if (updateOfferError) throw updateOfferError;

      const { error: expireOthersError } = await supabase
        .from("waitlist_offers")
        .update({ status: "slot_taken" })
        .eq("professional_id", offer.professional_id)
        .eq("slot_start", offer.slot_start)
        .neq("id", offerId)
        .eq("status", "sent");
      if (expireOthersError) throw expireOthersError;

      if (offer.waitlist_entry_id) {
        const { error: waitlistBookedError } = await supabase
          .from("waitlist")
          .update({ status: "booked" })
          .eq("id", offer.waitlist_entry_id);
        if (waitlistBookedError) throw waitlistBookedError;
      }

      return jsonResponse({ success: true, booking_id: booking.id });
    }

    return jsonResponse({ success: false, error: "Unknown action" }, 400);
  } catch (error) {
    console.error("waitlist-process unexpected error:", error);
    return jsonResponse({ success: false, error: "Internal server error" }, 500);
  }
});

function rankCandidates(candidates: Record<string, unknown>[], _prioritizeVip: boolean): Record<string, unknown>[] {
  return [...candidates].sort((a, b) => {
    const priorityA = Number(a.priority || 0);
    const priorityB = Number(b.priority || 0);
    if (priorityB !== priorityA) return priorityB - priorityA;
    return new Date(asString(a.created_at)).getTime() - new Date(asString(b.created_at)).getTime();
  });
}

async function findSmartCandidates(
  supabase: ReturnType<typeof createClient>,
  professionalId: string,
  serviceId: string,
): Promise<WaitlistCandidate[]> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: pastClients, error: pastClientsError } = await supabase
    .from("bookings")
    .select("client_name, client_phone")
    .eq("professional_id", professionalId)
    .eq("service_id", serviceId)
    .eq("status", "completed")
    .lt("start_time", thirtyDaysAgo.toISOString())
    .order("start_time", { ascending: false })
    .limit(20);
  if (pastClientsError) throw pastClientsError;

  if (!pastClients || pastClients.length === 0) return [];

  const seenPhones = new Set<string>();
  const candidates: WaitlistCandidate[] = [];

  for (const row of pastClients) {
    const normalizedPhone = normalizePhone(asString(row.client_phone || ""));
    if (!normalizedPhone || seenPhones.has(normalizedPhone)) continue;
    seenPhones.add(normalizedPhone);

    const { data: upcoming, error: upcomingError } = await supabase
      .from("bookings")
      .select("id")
      .eq("professional_id", professionalId)
      .eq("client_phone", normalizedPhone)
      .gte("start_time", new Date().toISOString())
      .neq("status", "cancelled")
      .limit(1);
    if (upcomingError) throw upcomingError;

    if (!upcoming || upcoming.length === 0) {
      candidates.push({
        name: asString(row.client_name || "") || "Cliente",
        phone: normalizedPhone,
        waitlistEntryId: null,
      });
    }

    if (candidates.length >= 5) break;
  }

  return candidates;
}

async function sendOffers(
  supabase: ReturnType<typeof createClient>,
  professionalId: string,
  serviceId: string,
  startTime: string,
  endTime: string,
  candidates: WaitlistCandidate[],
  reservationMinutes: number,
  cancelledBookingId: string | null,
): Promise<number> {
  const { data: instance, error: instanceError } = await supabase
    .from("whatsapp_instances")
    .select("professional_id, instance_name, meta_phone_id, status")
    .eq("professional_id", professionalId)
    .maybeSingle();
  if (instanceError) throw instanceError;
  if (!instance || instance.status !== "connected") return 0;

  const { data: professional, error: professionalError } = await supabase
    .from("professionals")
    .select("name, business_name, slug")
    .eq("id", professionalId)
    .maybeSingle();
  if (professionalError) throw professionalError;

  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("name, price")
    .eq("id", serviceId)
    .maybeSingle();
  if (serviceError) throw serviceError;

  const slotDate = new Date(startTime);
  const dateFormatted = slotDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const timeFormatted = slotDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const businessName = professional?.business_name || professional?.name || "Salao";
  const bookingLink = professional?.slug ? `https://gende.io/${professional.slug}` : "";

  let sent = 0;

  for (const candidate of candidates) {
    const phone = normalizePhone(candidate.phone || "");
    if (!phone) continue;

    const reservedUntil = new Date(Date.now() + reservationMinutes * 60 * 1000);
    const { data: offer, error: offerError } = await supabase
      .from("waitlist_offers")
      .insert({
        professional_id: professionalId,
        waitlist_entry_id: candidate.waitlistEntryId,
        booking_id: cancelledBookingId,
        client_name: candidate.name || "Cliente",
        client_phone: phone,
        service_id: serviceId,
        slot_start: startTime,
        slot_end: endTime,
        status: "sent",
        reserved_until: reservedUntil.toISOString(),
      })
      .select("id")
      .single();
    if (offerError) throw offerError;

    const message = `✨ *Horario disponivel!*

Ola ${candidate.name || "Cliente"}! Acabou de abrir um horario:

📅 *${dateFormatted}* as *${timeFormatted}*
💇 *${service?.name || "Servico"}*
📍 ${businessName}

Gostaria de aproveitar esse horario?

${bookingLink ? `📲 Agende agora: ${bookingLink}` : "Entre em contato para confirmar!"}

⏰ Responda rapido, a vaga e limitada!`;

    try {
      const sendResult = await sendWhatsAppMessage({
        supabase,
        professionalId,
        recipient: phone,
        message,
        instance,
        preferredProvider: "evolution",
        details: {
          source: "waitlist_offer",
          offer_id: offer.id,
          cancelled_booking_id: cancelledBookingId,
        },
      });

      if (sendResult.success) {
        sent += 1;
      } else {
        const { error: offerStatusError } = await supabase
          .from("waitlist_offers")
          .update({ status: "failed" })
          .eq("id", offer.id);
        if (offerStatusError) throw offerStatusError;
      }
    } catch (error) {
      console.error("waitlist-process send offer unexpected error:", error);
      const { error: offerStatusError } = await supabase
        .from("waitlist_offers")
        .update({ status: "failed" })
        .eq("id", offer.id);
      if (offerStatusError) throw offerStatusError;
    }
  }

  return sent;
}
