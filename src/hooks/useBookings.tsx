import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useProfessional } from "./useProfessional";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek } from "date-fns";

const BUFFER_MINUTES = 10;

type BookingServiceRow = {
  booking_id: string;
  service_id: string;
  sort_order: number;
  services?: {
    id: string;
    name: string;
    price: number;
    duration_minutes: number;
  } | null;
};

type BookingRow = Tables<"bookings"> & {
  services?: {
    name?: string;
    category?: string | null;
  } | null;
  clients?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  booking_services?: BookingServiceRow[];
  service_names?: string;
};

type BlockedTimeRow = Tables<"blocked_times">;

const normalizeClientPhone = (phone?: string | null) => {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
};

type InvokeErrorDetails = {
  status?: number;
  payload?: Record<string, unknown> | null;
};

const parseFunctionInvokeError = async (error: unknown): Promise<InvokeErrorDetails> => {
  const context = (error as { context?: unknown } | null)?.context;
  const response = context instanceof Response ? context : null;
  if (!response) return {};

  try {
    const parsed = await response.clone().json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { status: response.status, payload: parsed as Record<string, unknown> };
    }
  } catch {
    // ignore malformed error payload
  }

  return { status: response.status, payload: null };
};

const enrichBookingsWithServices = async (bookings: BookingRow[] | null | undefined) => {
  if (!bookings?.length) return bookings || [];

  const bookingIds = bookings.map((booking) => booking.id);
  const { data: bookingServices, error } = await api
    .from("booking_services" as never)
    .select("booking_id, service_id, sort_order, services(id, name, price, duration_minutes)")
    .in("booking_id", bookingIds)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  const itemsByBooking = new Map<string, BookingServiceRow[]>();
  ((bookingServices as BookingServiceRow[] | null) || []).forEach((item) => {
    const list = itemsByBooking.get(item.booking_id) || [];
    list.push(item);
    itemsByBooking.set(item.booking_id, list);
  });

  return bookings.map((booking) => {
    const items = itemsByBooking.get(booking.id) || [];
    const primaryService = items[0]?.services || booking.services || null;

    return {
      ...booking,
      services: primaryService,
      booking_services: items,
      service_names: items.length > 0
        ? items.map((item) => item.services?.name).filter(Boolean).join(", ")
        : booking.services?.name || "",
    };
  });
};

const getOrCreateClient = async ({
  professionalId,
  clientName,
  clientPhone,
}: {
  professionalId: string;
  clientName?: string | null;
  clientPhone?: string | null;
}) => {
  const normalizedPhone = normalizeClientPhone(clientPhone);
  const trimmedName = (clientName || "").trim();

  let existingClient: { id: string; name: string; phone: string | null } | null = null;

  if (normalizedPhone) {
    const { data } = await api
      .from("clients")
      .select("id, name, phone")
      .eq("professional_id", professionalId)
      .eq("phone", normalizedPhone)
      .maybeSingle();
    existingClient = data;
  }

  if (!existingClient && trimmedName) {
    const { data } = await api
      .from("clients")
      .select("id, name, phone")
      .eq("professional_id", professionalId)
      .ilike("name", trimmedName)
      .maybeSingle();
    existingClient = data;
  }

  if (existingClient) {
    const updates: Record<string, string> = {};
    if (trimmedName && existingClient.name !== trimmedName) updates.name = trimmedName;
    if (normalizedPhone && existingClient.phone !== normalizedPhone) updates.phone = normalizedPhone;

    if (Object.keys(updates).length > 0) {
      await api.from("clients").update(updates).eq("id", existingClient.id);
    }

    return {
      clientId: existingClient.id,
      clientName: trimmedName || existingClient.name,
      clientPhone: normalizedPhone || existingClient.phone || "",
    };
  }

  if (!trimmedName) {
    return {
      clientId: null,
      clientName: "",
      clientPhone: normalizedPhone,
    };
  }

  const { data: newClient, error } = await api
    .from("clients")
    .insert({
      professional_id: professionalId,
      name: trimmedName,
      phone: normalizedPhone,
    })
    .select("id, name, phone")
    .single();

  if (error) throw error;

  return {
    clientId: newClient.id,
    clientName: newClient.name,
    clientPhone: newClient.phone || "",
  };
};

const syncBookingServices = async (bookingId: string, serviceIds: string[]) => {
  const uniqueServiceIds = Array.from(new Set(serviceIds.filter(Boolean)));

  const { data: existingRows, error: existingError } = await api
        .from("booking_services" as never)
    .select("id, service_id")
    .eq("booking_id", bookingId);

  if (existingError) throw existingError;

  const existing = (existingRows || []) as Array<{ id: string; service_id: string }>;
  const existingIds = new Set(existing.map((row) => row.service_id));
  const nextIds = new Set(uniqueServiceIds);

  const rowsToDelete = existing
    .filter((row) => !nextIds.has(row.service_id))
    .map((row) => row.id);

  if (rowsToDelete.length > 0) {
    const { error } = await api.from("booking_services" as never).delete().in("id", rowsToDelete);
    if (error) throw error;
  }

  const rowsToInsert = uniqueServiceIds
    .filter((serviceId) => !existingIds.has(serviceId))
    .map((serviceId, index) => ({
      booking_id: bookingId,
      service_id: serviceId,
      sort_order: index,
    }));

  if (rowsToInsert.length > 0) {
    const { error } = await api.from("booking_services" as never).insert(rowsToInsert);
    if (error) throw error;
  }

  for (let index = 0; index < uniqueServiceIds.length; index += 1) {
    const serviceId = uniqueServiceIds[index];
    const { error } = await api
      .from("booking_services" as never)
      .update({ sort_order: index })
      .eq("booking_id", bookingId)
      .eq("service_id", serviceId);
    if (error) throw error;
  }
};

export const useBookings = (date?: Date) => {
  const { data: professional } = useProfessional();

  return useQuery({
    queryKey: ["bookings", professional?.id, date ? format(date, "yyyy-MM-dd") : "all"],
    queryFn: async () => {
      let query = api
        .from("bookings")
        .select("*, services(name, category), clients(name, phone, email)")
        .eq("professional_id", professional!.id)
        .order("start_time", { ascending: true });

      if (date) {
        query = query
          .gte("start_time", startOfDay(date).toISOString())
          .lte("start_time", endOfDay(date).toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return enrichBookingsWithServices(data);
    },
    enabled: !!professional?.id,
  });
};

export const useBookingsWeek = (date: Date) => {
  const { data: professional } = useProfessional();
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(date, { weekStartsOn: 1 });

  return useQuery({
    queryKey: ["bookings-week", professional?.id, format(weekStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await api
        .from("bookings")
        .select("*, services(name, category), clients(name, phone, email)")
        .eq("professional_id", professional!.id)
        .gte("start_time", startOfDay(weekStart).toISOString())
        .lte("start_time", endOfDay(weekEnd).toISOString())
        .order("start_time", { ascending: true });
      if (error) throw error;
      return enrichBookingsWithServices(data);
    },
    enabled: !!professional?.id,
  });
};

export const useBookingsMonth = (date: Date) => {
  const { data: professional } = useProfessional();
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  return useQuery({
    queryKey: ["bookings-month", professional?.id, format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      const { data, error } = await api
        .from("bookings")
        .select("*, services(name, category), clients(name, phone, email)")
        .eq("professional_id", professional!.id)
        .gte("start_time", startOfDay(monthStart).toISOString())
        .lte("start_time", endOfDay(monthEnd).toISOString())
        .order("start_time", { ascending: true });
      if (error) throw error;
      return enrichBookingsWithServices(data);
    },
    enabled: !!professional?.id,
  });
};

/**
 * Generate available time slots for a given date considering existing bookings.
 * Each booking blocks: start_time to end_time + BUFFER_MINUTES
 */
export const getAvailableSlots = (
  existingBookings: BookingRow[],
  serviceDurationMinutes: number,
  startHour = 7,
  endHour = 21,
  intervalMinutes = 10,
  blockedTimes: BlockedTimeRow[] = [],
  slotDate?: Date
) => {
  const slots: string[] = [];

  for (let h = startHour; h <= endHour; h++) {
    for (let m = 0; m < 60; m += intervalMinutes) {
      if (h === endHour && m > 0) break;
      const slotStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      slots.push(slotStr);
    }
  }

  // Filter out slots that conflict with existing bookings (+ buffer)
  const activeBookings = (existingBookings || []).filter(b => b.status !== "cancelled");

  return slots.filter(slot => {
    const [sh, sm] = slot.split(":").map(Number);
    const slotStartMin = sh * 60 + sm;
    const slotEndMin = slotStartMin + serviceDurationMinutes;

    // Check against bookings
    for (const booking of activeBookings) {
      const bStart = new Date(booking.start_time);
      const bEnd = new Date(booking.end_time);
      const bStartMin = bStart.getHours() * 60 + bStart.getMinutes();
      const bEndMin = bEnd.getHours() * 60 + bEnd.getMinutes() + BUFFER_MINUTES;

      if (slotStartMin < bEndMin && slotEndMin > bStartMin) {
        return false;
      }
    }

    // Check against blocked times (ausências)
    for (const bt of blockedTimes || []) {
      const btStart = new Date(bt.start_time);
      const btEnd = new Date(bt.end_time);

      // If slotDate is provided, check if blocked time overlaps this date
      if (slotDate) {
        const dayStart = new Date(slotDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(slotDate);
        dayEnd.setHours(23, 59, 59, 999);

        // Skip if blocked time doesn't overlap this day at all
        if (btEnd <= dayStart || btStart >= dayEnd) continue;

        // Full-day block: if blocked period spans the entire day
        if (btStart <= dayStart && btEnd >= dayEnd) return false;
      }

      const btStartMin = btStart.getHours() * 60 + btStart.getMinutes();
      const btEndMin = btEnd.getHours() * 60 + btEnd.getMinutes();

      // For multi-day blocks that start before this day, block from 00:00
      const effectiveStartMin = slotDate && btStart < slotDate ? 0 : btStartMin;
      // For multi-day blocks that end after this day, block until 24:00
      const effectiveEndMin = slotDate && btEnd > new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate(), 23, 59) ? 24 * 60 : btEndMin;

      if (slotStartMin < effectiveEndMin && slotEndMin > effectiveStartMin) {
        return false;
      }
    }

    return true;
  });
};

export const useCreateBooking = () => {
  const qc = useQueryClient();
  const { data: professional } = useProfessional();

  return useMutation({
    mutationFn: async ({
      service_ids,
      ...booking
    }: Omit<TablesInsert<"bookings">, "professional_id"> & { service_ids?: string[] }) => {
      const client = await getOrCreateClient({
        professionalId: professional!.id,
        clientName: booking.client_name,
        clientPhone: booking.client_phone,
      });

      const { data, error } = await api
        .from("bookings")
        .insert({
          ...booking,
          professional_id: professional!.id,
          client_id: client.clientId,
          client_name: client.clientName,
          client_phone: client.clientPhone,
          service_id: service_ids?.[0] || booking.service_id,
        })
        .select()
        .single();
      if (error) throw error;

      const finalServiceIds = service_ids?.length ? service_ids : (data.service_id ? [data.service_id] : []);
      if (finalServiceIds.length > 0) {
        await syncBookingServices(data.id, finalServiceIds);
      }

      return data;
    },
    onSuccess: async (data) => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["bookings-week"] });
      qc.invalidateQueries({ queryKey: ["bookings-month"] });

      // Trigger booking_created WhatsApp automation (fire and forget)
      if (data && professional) {
        import("./useWhatsApp").then(({ triggerWhatsAppAutomation }) => {
          triggerWhatsAppAutomation(professional.id, data.id, "booking_created");
        });

        // Sync to Google Calendar (fire and forget)
        api.functions.invoke("google-calendar-sync", {
          body: {
            action: "create_event",
            professional_id: professional.id,
            booking_id: data.id,
            booking: {
              client_name: data.client_name,
              client_phone: data.client_phone,
              start_time: data.start_time,
              end_time: data.end_time,
              notes: data.notes,
              service_name: "",
            },
          },
        }).catch(() => { /* silent fail */ });
      }
    },
  });
};

export const useUpdateBooking = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      service_ids,
      ...updates
    }: TablesUpdate<"bookings"> & { id: string; service_ids?: string[] }) => {
      let normalizedUpdates = { ...updates };
      let previousStatus: string | null = null;

      if (updates.client_name || updates.client_phone) {
        const { data: currentBooking, error: bookingError } = await api
          .from("bookings")
          .select("professional_id, client_name, client_phone, status")
          .eq("id", id)
          .single();

        if (bookingError) throw bookingError;
        previousStatus = currentBooking.status;

        const client = await getOrCreateClient({
          professionalId: currentBooking.professional_id,
          clientName: updates.client_name ?? currentBooking.client_name,
          clientPhone: updates.client_phone ?? currentBooking.client_phone,
        });

        normalizedUpdates = {
          ...normalizedUpdates,
          client_id: client.clientId,
          client_name: client.clientName,
          client_phone: client.clientPhone,
        };
      }

      if (previousStatus === null) {
        const { data: currentBooking, error: currentBookingError } = await api
          .from("bookings")
          .select("status")
          .eq("id", id)
          .single();

        if (currentBookingError) throw currentBookingError;
        previousStatus = currentBooking.status;
      }

      const { data, error } = await api
        .from("bookings")
        .update({
          ...normalizedUpdates,
          service_id: service_ids?.[0] || normalizedUpdates.service_id,
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      if (service_ids?.length) {
        await syncBookingServices(id, service_ids);
      }

      return {
        ...data,
        __previous_status: previousStatus,
      };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["bookings-week"] });
      qc.invalidateQueries({ queryKey: ["bookings-month"] });

      if (data && data.status === "completed" && data.__previous_status !== "completed") {
        import("./useWhatsApp").then(({ triggerWhatsAppAutomation }) => {
          triggerWhatsAppAutomation(data.professional_id, data.id, "post_service");
          triggerWhatsAppAutomation(data.professional_id, data.id, "post_sale_review");
        });
      }

      // If booking was cancelled, trigger waitlist processing
      if (data && data.status === "cancelled") {
        (async () => {
          const { error } = await api.functions.invoke("waitlist-process", {
            body: {
              action: "process-cancellation",
              professionalId: data.professional_id,
              bookingId: data.id,
              serviceId: data.service_id,
              startTime: data.start_time,
              endTime: data.end_time,
              employeeId: data.employee_id,
            },
          });

          if (!error) return;

          const details = await parseFunctionInvokeError(error);
          const reason = String(details.payload?.reason || "");

          const isFunctionalNoCandidate =
            details.status === 404 &&
            (reason === "no_candidates" || reason === "no_compatible_candidates");
          if (isFunctionalNoCandidate) return;

          console.error("Waitlist process error:", {
            status: details.status,
            reason: reason || String(details.payload?.error || ""),
            raw: error,
          });
        })().catch((err) => {
          console.error("Waitlist process unexpected caller error:", err);
        });

        // Delete from Google Calendar if linked
        if (data.google_calendar_event_id) {
          api.functions.invoke("google-calendar-sync", {
            body: {
              action: "delete_event",
              professional_id: data.professional_id,
              booking_id: data.id,
              event_id: data.google_calendar_event_id,
            },
          }).catch(() => { /* silent fail */ });
        }
      }
    },
  });
};

export const useDeleteBooking = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Before deleting, fetch the booking to check for Google Calendar event
      const { data: booking } = await api.from("bookings").select("professional_id, google_calendar_event_id").eq("id", id).single();

      const { error } = await api.from("bookings").delete().eq("id", id);
      if (error) throw error;

      // Delete from Google Calendar if linked
      if (booking?.google_calendar_event_id) {
        api.functions.invoke("google-calendar-sync", {
          body: {
            action: "delete_event",
            professional_id: booking.professional_id,
            booking_id: id,
            event_id: booking.google_calendar_event_id,
          },
        }).catch(() => { /* silent fail */ });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["bookings-week"] });
      qc.invalidateQueries({ queryKey: ["bookings-month"] });
    },
  });
};
