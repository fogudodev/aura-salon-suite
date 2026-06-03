import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIME_ZONE = "America/Sao_Paulo";
const BUFFER_MINUTES = 10;

type Booking = {
  id: string;
  professional_id: string;
  employee_id: string | null;
  start_time: string;
  end_time: string;
  duration_minutes: number | null;
  status: string;
  google_calendar_event_id?: string | null;
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const parseTimeMinutes = (value?: string | null) => {
  if (!value) return null;
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  if (![hour, minute].every(Number.isFinite)) return null;
  return hour * 60 + minute;
};

const getLocalParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  const hour = Number(map.hour);
  const minute = Number(map.minute);

  return {
    dateKey: `${map.year}-${map.month}-${map.day}`,
    dayOfWeek: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    minutes: hour * 60 + minute,
  };
};

const minutesBetween = (startIso: string, endIso: string) => {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 60000);
};

const rangesOverlap = (startA: number, endA: number, startB: number, endB: number) =>
  startA < endB && endA > startB;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Metodo nao permitido." }, 405);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ success: false, error: "Sessao expirada. Entre novamente." }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData.user) {
      return jsonResponse({ success: false, error: "Sessao expirada. Entre novamente." }, 401);
    }

    const { bookingId, newStartTime } = await req.json();
    if (!bookingId || !newStartTime) {
      return jsonResponse({ success: false, error: "Agendamento e novo horario sao obrigatorios." }, 400);
    }

    const newStart = new Date(newStartTime);
    if (isNaN(newStart.getTime())) {
      return jsonResponse({ success: false, error: "Novo horario invalido." }, 400);
    }

    const { data: bookingData, error: bookingError } = await supabase
      .from("bookings")
      .select("id, professional_id, employee_id, start_time, end_time, duration_minutes, status, google_calendar_event_id")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError) throw bookingError;
    const booking = bookingData as Booking | null;
    if (!booking) {
      return jsonResponse({ success: false, error: "Agendamento nao encontrado." }, 404);
    }

    const userId = userData.user.id;
    const [{ data: professional }, { data: reception }, { data: adminRole }] = await Promise.all([
      supabase
        .from("professionals")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("salon_employees")
        .select("salon_id")
        .eq("user_id", userId)
        .eq("role", "reception")
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle(),
    ]);

    const canManage =
      !!adminRole ||
      professional?.id === booking.professional_id ||
      reception?.salon_id === booking.professional_id;

    if (!canManage) {
      return jsonResponse({ success: false, error: "Voce nao tem permissao para remarcar este agendamento." }, 403);
    }

    if (!["pending", "confirmed", "no_show"].includes(booking.status)) {
      return jsonResponse({ success: false, error: "Este status nao permite remarcacao." });
    }

    const durationMinutes = Number(booking.duration_minutes) > 0
      ? Number(booking.duration_minutes)
      : minutesBetween(booking.start_time, booking.end_time);

    if (!durationMinutes || durationMinutes <= 0) {
      return jsonResponse({ success: false, error: "Nao foi possivel calcular a duracao do agendamento." });
    }

    const newEnd = new Date(newStart.getTime() + durationMinutes * 60000);
    const startParts = getLocalParts(newStart);
    const endParts = getLocalParts(newEnd);

    if (startParts.dateKey !== endParts.dateKey) {
      return jsonResponse({ success: false, error: "O novo horario precisa terminar no mesmo dia." });
    }

    const { data: workingHour, error: workingError } = await supabase
      .from("working_hours")
      .select("start_time, end_time")
      .eq("professional_id", booking.professional_id)
      .eq("day_of_week", startParts.dayOfWeek)
      .eq("is_active", true)
      .maybeSingle();

    if (workingError) throw workingError;
    if (!workingHour) {
      return jsonResponse({ success: false, error: "Nao ha expediente configurado para esta data." });
    }

    const workingStart = parseTimeMinutes(workingHour.start_time);
    const workingEnd = parseTimeMinutes(workingHour.end_time);
    if (
      workingStart === null ||
      workingEnd === null ||
      startParts.minutes < workingStart ||
      endParts.minutes > workingEnd
    ) {
      return jsonResponse({ success: false, error: "O novo horario fica fora do expediente configurado." });
    }

    const newStartMs = newStart.getTime();
    const newEndMs = newEnd.getTime();
    const conflictWindowStart = new Date(newStartMs - BUFFER_MINUTES * 60000).toISOString();

    const { data: blockedTimes, error: blockedError } = await supabase
      .from("blocked_times")
      .select("start_time, end_time")
      .eq("professional_id", booking.professional_id)
      .lt("start_time", newEnd.toISOString())
      .gt("end_time", newStart.toISOString());

    if (blockedError) throw blockedError;
    const hasBlockedConflict = (blockedTimes || []).some((blocked) =>
      rangesOverlap(
        newStartMs,
        newEndMs,
        new Date(blocked.start_time).getTime(),
        new Date(blocked.end_time).getTime(),
      )
    );

    if (hasBlockedConflict) {
      return jsonResponse({ success: false, error: "Este horario esta bloqueado por uma ausencia." });
    }

    let bookingQuery = supabase
      .from("bookings")
      .select("id, start_time, end_time, status, employee_id")
      .eq("professional_id", booking.professional_id)
      .neq("id", booking.id)
      .neq("status", "cancelled")
      .lt("start_time", newEnd.toISOString())
      .gt("end_time", conflictWindowStart);

    if (booking.employee_id) {
      bookingQuery = bookingQuery.eq("employee_id", booking.employee_id);
    }

    const { data: existingBookings, error: conflictError } = await bookingQuery;
    if (conflictError) throw conflictError;

    const hasConflict = (existingBookings || []).some((item) =>
      rangesOverlap(
        newStartMs,
        newEndMs,
        new Date(item.start_time).getTime(),
        new Date(item.end_time).getTime() + BUFFER_MINUTES * 60000,
      )
    );

    if (hasConflict) {
      return jsonResponse({ success: false, error: "Ja existe outro agendamento neste horario." });
    }

    const { data: updatedBooking, error: updateError } = await supabase
      .from("bookings")
      .update({
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
        status: booking.status === "no_show" ? "confirmed" : booking.status,
      })
      .eq("id", booking.id)
      .select("*, services(name, category), clients(name, phone, email)")
      .single();

    if (updateError) throw updateError;

    return jsonResponse({ success: true, booking: updatedBooking });
  } catch (error) {
    console.error("Reschedule booking error:", error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao remarcar agendamento.",
    }, 500);
  }
});
