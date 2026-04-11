import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { estimateCampaignPerformance, isValidCampaignPhone, normalizePhone } from "./domain.ts";
import type {
  AudiencePreviewRecipient,
  AudiencePreviewResult,
  CampaignAudienceFilters,
  CampaignObjective,
} from "./types.ts";

type ClientRow = {
  id: string;
  name: string;
  phone: string | null;
  created_at: string;
  last_completed_appointment_at: string | null;
  avg_return_interval_days: number | null;
  average_ticket: number | null;
  birthday: string | null;
  origin_channel: string | null;
  marketing_consent_status: string | null;
  marketing_opt_out_at: string | null;
};

type BookingRow = {
  id: string;
  client_id: string | null;
  employee_id: string | null;
  start_time: string;
  status: string;
  price: number | null;
};

type BookingServiceRow = {
  booking_id: string;
  service_id: string;
};

type EmployeeRow = {
  id: string;
  name: string;
};

type ServiceRow = {
  id: string;
  name: string;
  price: number;
  maintenance_interval_days: number | null;
};

type TagAssignmentRow = {
  client_id: string;
  tag_id: string;
  client_tags: { name: string } | null;
};

type MarketingPreferenceRow = {
  client_id: string;
  whatsapp_marketing_consent: boolean;
  opted_out_at: string | null;
  max_campaigns_per_30_days: number;
};

type SuppressionRow = {
  client_id: string | null;
  phone: string;
};

type ClientAggregate = {
  client: ClientRow;
  normalizedPhone: string;
  completedVisits: number;
  avgTicket: number;
  totalRevenue: number;
  lastVisitAt: string | null;
  firstVisitAt: string | null;
  daysSinceLastVisit: number | null;
  avgReturnIntervalDays: number | null;
  preferredEmployeeId: string | null;
  preferredEmployeeName: string | null;
  topServiceId: string | null;
  topServiceName: string | null;
  topServiceLastVisitAt: string | null;
  topServiceMaintenanceIntervalDays: number | null;
  cancelledCount: number;
  noShowCount: number;
  hasUpcomingBooking: boolean;
  tags: string[];
  tagIds: string[];
  sourceChannel: string | null;
  consentGranted: boolean;
  hasExplicitOptOut: boolean;
  isSuppressed: boolean;
};

function daysBetween(date: string | null) {
  if (!date) return null;
  const diff = Date.now() - new Date(date).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function isBirthdayWithinWindow(birthday: string | null, windowDays: number) {
  if (!birthday) return false;
  const date = new Date(birthday);
  const now = new Date();
  const currentYearBirthday = new Date(now.getFullYear(), date.getUTCMonth(), date.getUTCDate());
  const nextBirthday = currentYearBirthday >= now
    ? currentYearBirthday
    : new Date(now.getFullYear() + 1, date.getUTCMonth(), date.getUTCDate());
  const diffDays = Math.floor((nextBirthday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= windowDays;
}

function toTurnKey(dateIso: string) {
  const hour = new Date(dateIso).getHours();
  if (hour < 12) return "manha";
  if (hour < 18) return "tarde";
  return "noite";
}

function aggregateClientData(params: {
  clients: ClientRow[];
  bookings: BookingRow[];
  bookingServices: BookingServiceRow[];
  services: ServiceRow[];
  employees: EmployeeRow[];
  tagAssignments: TagAssignmentRow[];
  preferences: MarketingPreferenceRow[];
  suppressions: SuppressionRow[];
}): ClientAggregate[] {
  const bookingServicesByBooking = new Map<string, string[]>();
  for (const row of params.bookingServices) {
    const current = bookingServicesByBooking.get(row.booking_id) || [];
    current.push(row.service_id);
    bookingServicesByBooking.set(row.booking_id, current);
  }

  const employeeById = new Map(params.employees.map((employee) => [employee.id, employee.name]));
  const serviceById = new Map(params.services.map((service) => [service.id, service]));
  const tagsByClient = new Map<string, string[]>();
  const tagIdsByClient = new Map<string, string[]>();
  for (const assignment of params.tagAssignments) {
    const current = tagsByClient.get(assignment.client_id) || [];
    if (assignment.client_tags?.name) current.push(assignment.client_tags.name);
    tagsByClient.set(assignment.client_id, current);
    const currentIds = tagIdsByClient.get(assignment.client_id) || [];
    currentIds.push(assignment.tag_id);
    tagIdsByClient.set(assignment.client_id, currentIds);
  }

  const preferenceByClient = new Map(params.preferences.map((preference) => [preference.client_id, preference]));
  const suppressionPhones = new Set(params.suppressions.map((suppression) => normalizePhone(suppression.phone)));
  const suppressionClientIds = new Set(params.suppressions.map((suppression) => suppression.client_id).filter(Boolean));

  const completedBookingsByClient = new Map<string, BookingRow[]>();
  const cancelledBookingsByClient = new Map<string, BookingRow[]>();
  const noShowBookingsByClient = new Map<string, BookingRow[]>();
  const upcomingBookingsByClient = new Map<string, BookingRow[]>();

  for (const booking of params.bookings) {
    if (!booking.client_id) continue;
    const targetMap =
      booking.status === "completed"
        ? completedBookingsByClient
        : booking.status === "cancelled"
          ? cancelledBookingsByClient
          : booking.status === "no_show"
            ? noShowBookingsByClient
            : ["pending", "confirmed"].includes(booking.status)
              ? upcomingBookingsByClient
              : null;
    if (!targetMap) continue;
    const current = targetMap.get(booking.client_id) || [];
    current.push(booking);
    targetMap.set(booking.client_id, current);
  }

  return params.clients.map((client) => {
    const normalizedPhone = normalizePhone(client.phone);
    const completedBookings = (completedBookingsByClient.get(client.id) || []).sort(
      (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime(),
    );
    const cancelledBookings = cancelledBookingsByClient.get(client.id) || [];
    const noShowBookings = noShowBookingsByClient.get(client.id) || [];
    const upcomingBookings = upcomingBookingsByClient.get(client.id) || [];

    const totalRevenue = completedBookings.reduce((sum, booking) => sum + Number(booking.price || 0), 0);
    const avgTicket = completedBookings.length > 0
      ? Number((totalRevenue / completedBookings.length).toFixed(2))
      : Number(client.average_ticket || 0);
    const lastVisitAt = completedBookings[0]?.start_time || client.last_completed_appointment_at || null;
    const firstVisitAt = completedBookings.at(-1)?.start_time || null;
    const daysSinceLastVisit = daysBetween(lastVisitAt);
    const avgReturnIntervalDays = client.avg_return_interval_days || null;

    const employeeFrequency = new Map<string, number>();
    const serviceFrequency = new Map<string, number>();
    const serviceLastVisit = new Map<string, string>();

    for (const booking of completedBookings) {
      if (booking.employee_id) {
        employeeFrequency.set(booking.employee_id, (employeeFrequency.get(booking.employee_id) || 0) + 1);
      }
      const serviceIds = bookingServicesByBooking.get(booking.id) || [];
      for (const serviceId of serviceIds) {
        serviceFrequency.set(serviceId, (serviceFrequency.get(serviceId) || 0) + 1);
        if (!serviceLastVisit.has(serviceId)) {
          serviceLastVisit.set(serviceId, booking.start_time);
        }
      }
    }

    const preferredEmployeeId = Array.from(employeeFrequency.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const topServiceId = Array.from(serviceFrequency.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const topService = topServiceId ? serviceById.get(topServiceId) : null;
    const preference = preferenceByClient.get(client.id);
    const hasExplicitOptOut = Boolean(
      preference?.opted_out_at ||
      client.marketing_opt_out_at ||
      client.marketing_consent_status === "denied",
    );
    const consentGranted = preference
      ? preference.whatsapp_marketing_consent && !preference.opted_out_at
      : hasExplicitOptOut
        ? false
        : client.marketing_consent_status === "granted" || client.marketing_consent_status === "unknown";

    return {
      client,
      normalizedPhone,
      completedVisits: completedBookings.length,
      avgTicket,
      totalRevenue,
      lastVisitAt,
      firstVisitAt,
      daysSinceLastVisit,
      avgReturnIntervalDays,
      preferredEmployeeId,
      preferredEmployeeName: preferredEmployeeId ? employeeById.get(preferredEmployeeId) || null : null,
      topServiceId,
      topServiceName: topService?.name || null,
      topServiceLastVisitAt: topServiceId ? serviceLastVisit.get(topServiceId) || null : null,
      topServiceMaintenanceIntervalDays: topService?.maintenance_interval_days || null,
      cancelledCount: cancelledBookings.length,
      noShowCount: noShowBookings.length,
      hasUpcomingBooking: upcomingBookings.length > 0,
      tags: tagsByClient.get(client.id) || [],
      tagIds: tagIdsByClient.get(client.id) || [],
      sourceChannel: client.origin_channel || null,
      consentGranted,
      hasExplicitOptOut,
      isSuppressed: suppressionClientIds.has(client.id) || suppressionPhones.has(normalizedPhone),
    };
  });
}

function applyAudienceFilters(
  aggregates: ClientAggregate[],
  filters: CampaignAudienceFilters,
): ClientAggregate[] {
  const inactiveDays = filters.inactiveDays ?? 45;
  const recentDays = filters.recentDays ?? 30;
  const newClientDays = filters.newClientDays ?? 30;
  const vipMinTicket = filters.vipMinTicket ?? 180;
  const birthdayWindowDays = filters.birthdayWindowDays ?? 7;
  const maintenanceWindowDays = filters.maintenanceWindowDays ?? 7;

  return aggregates.filter((aggregate) => {
    if (!aggregate.normalizedPhone || !isValidCampaignPhone(aggregate.normalizedPhone)) return false;
    if (aggregate.isSuppressed) return false;
    if (aggregate.hasExplicitOptOut) return false;
    if (filters.consentOnly && !aggregate.consentGranted) return false;
    if (filters.selectedClientIds?.length && !filters.selectedClientIds.includes(aggregate.client.id)) return false;

    switch (filters.audienceType) {
      case "todos":
        return true;
      case "inativos":
        return (aggregate.daysSinceLastVisit ?? 999) >= inactiveDays && !aggregate.hasUpcomingBooking;
      case "recentes":
        return (aggregate.daysSinceLastVisit ?? 999) <= recentDays;
      case "vip":
        return aggregate.avgTicket >= vipMinTicket || aggregate.completedVisits >= 6;
      case "novos":
        return daysBetween(aggregate.client.created_at) !== null && daysBetween(aggregate.client.created_at)! <= newClientDays;
      case "aniversario":
        return isBirthdayWithinWindow(aggregate.client.birthday, birthdayWindowDays);
      case "servico_especifico":
        return !!aggregate.topServiceId && !!filters.serviceIds?.includes(aggregate.topServiceId);
      case "sem_retorno_pos_servico":
        return !!aggregate.topServiceId
          && !!filters.serviceIds?.includes(aggregate.topServiceId)
          && !aggregate.hasUpcomingBooking
          && (aggregate.daysSinceLastVisit ?? 999) >= Math.max(inactiveDays, 14);
      case "janela_manutencao": {
        if (!aggregate.topServiceId || !aggregate.topServiceLastVisitAt || !aggregate.topServiceMaintenanceIntervalDays) return false;
        const serviceWindowStart = aggregate.topServiceMaintenanceIntervalDays - maintenanceWindowDays;
        const serviceWindowEnd = aggregate.topServiceMaintenanceIntervalDays + maintenanceWindowDays;
        const serviceDaysSinceLastVisit = daysBetween(aggregate.topServiceLastVisitAt) ?? 0;
        return serviceDaysSinceLastVisit >= serviceWindowStart && serviceDaysSinceLastVisit <= serviceWindowEnd;
      }
      case "cancelou_sem_reagendar":
        return aggregate.cancelledCount > 0 && !aggregate.hasUpcomingBooking;
      case "no_show":
        return aggregate.noShowCount > 0 && !aggregate.hasUpcomingBooking;
      case "profissional_preferido":
        return !!filters.preferredEmployeeId && aggregate.preferredEmployeeId === filters.preferredEmployeeId;
      case "ticket_medio":
        return (filters.ticketMin == null || aggregate.avgTicket >= filters.ticketMin)
          && (filters.ticketMax == null || aggregate.avgTicket <= filters.ticketMax);
      case "frequencia":
        return (filters.minVisits == null || aggregate.completedVisits >= filters.minVisits)
          && (filters.maxVisits == null || aggregate.completedVisits <= filters.maxVisits);
      case "ultima_visita":
        return (!filters.lastVisitFrom || (aggregate.lastVisitAt && aggregate.lastVisitAt >= filters.lastVisitFrom))
          && (!filters.lastVisitTo || (aggregate.lastVisitAt && aggregate.lastVisitAt <= filters.lastVisitTo));
      case "tags":
        return !!filters.tagIds?.length && filters.tagIds.every((tagId) => aggregate.tagIds.includes(tagId));
      case "canal_origem":
        return !!filters.originChannels?.includes(aggregate.sourceChannel || "");
      case "consentimento":
        return aggregate.consentGranted;
      case "oportunidade_agenda":
      case "upsell":
      case "customizado":
        return true;
      default:
        return true;
    }
  });
}

export async function previewCampaignAudience(params: {
  supabase: SupabaseClient;
  professionalId: string;
  objective: CampaignObjective;
  filters: CampaignAudienceFilters;
  previewRecipientLimit?: number;
}): Promise<AudiencePreviewResult> {
  const [clientsRes, bookingsRes, servicesRes, employeesRes, tagAssignmentsRes, preferencesRes, suppressionsRes] = await Promise.all([
    params.supabase
      .from("clients")
      .select("id, name, phone, created_at, last_completed_appointment_at, avg_return_interval_days, average_ticket, birthday, origin_channel, marketing_consent_status, marketing_opt_out_at")
      .eq("professional_id", params.professionalId),
    params.supabase
      .from("bookings")
      .select("id, client_id, employee_id, start_time, status, price")
      .eq("professional_id", params.professionalId),
    params.supabase
      .from("services")
      .select("id, name, price, maintenance_interval_days")
      .eq("professional_id", params.professionalId),
    params.supabase
      .from("salon_employees")
      .select("id, name")
      .eq("salon_id", params.professionalId),
    params.supabase
      .from("client_tag_assignments")
      .select("client_id, tag_id, client_tags(name)")
      .eq("professional_id", params.professionalId),
    params.supabase
      .from("client_marketing_preferences")
      .select("client_id, whatsapp_marketing_consent, opted_out_at, max_campaigns_per_30_days")
      .eq("professional_id", params.professionalId),
    params.supabase
      .from("whatsapp_campaign_suppressions")
      .select("client_id, phone")
      .eq("professional_id", params.professionalId),
  ]);

  if (clientsRes.error) throw clientsRes.error;
  if (bookingsRes.error) throw bookingsRes.error;
  if (servicesRes.error) throw servicesRes.error;
  if (employeesRes.error) throw employeesRes.error;
  if (tagAssignmentsRes.error) throw tagAssignmentsRes.error;
  if (preferencesRes.error) throw preferencesRes.error;
  if (suppressionsRes.error) throw suppressionsRes.error;

  const bookingIds = (bookingsRes.data || []).map((booking) => booking.id);
  const bookingServicesRes = bookingIds.length > 0
    ? await params.supabase
      .from("booking_services")
      .select("booking_id, service_id")
      .in("booking_id", bookingIds)
    : { data: [], error: null };
  if (bookingServicesRes.error) throw bookingServicesRes.error;

  const aggregates = aggregateClientData({
    clients: (clientsRes.data || []) as ClientRow[],
    bookings: (bookingsRes.data || []) as BookingRow[],
    bookingServices: (bookingServicesRes.data || []) as BookingServiceRow[],
    services: (servicesRes.data || []) as ServiceRow[],
    employees: (employeesRes.data || []) as EmployeeRow[],
    tagAssignments: (tagAssignmentsRes.data || []) as unknown as TagAssignmentRow[],
    preferences: (preferencesRes.data || []) as MarketingPreferenceRow[],
    suppressions: (suppressionsRes.data || []) as SuppressionRow[],
  });

  const filtered = applyAudienceFilters(aggregates, params.filters);
  const deduped = new Map<string, ClientAggregate>();
  let duplicateCount = 0;
  for (const aggregate of filtered) {
    if (!deduped.has(aggregate.normalizedPhone)) {
      deduped.set(aggregate.normalizedPhone, aggregate);
      continue;
    }
    duplicateCount += 1;
  }

  const recipients = Array.from(deduped.values());
  const averageTicket = recipients.length > 0
    ? Number((recipients.reduce((sum, item) => sum + item.avgTicket, 0) / recipients.length).toFixed(2))
    : 0;
  const averageReturnIntervalDays = recipients.length > 0
    ? Number(
      (
        recipients.reduce((sum, item) => sum + Number(item.avgReturnIntervalDays || 0), 0)
        / Math.max(recipients.filter((item) => item.avgReturnIntervalDays).length, 1)
      ).toFixed(0),
    )
    : null;
  const estimatedReturnRate = recipients.length > 0
    ? Number((recipients.filter((item) => item.completedVisits > 1).length / recipients.length).toFixed(4))
    : 0;
  const performance = estimateCampaignPerformance({
    objective: params.objective,
    audienceType: params.filters.audienceType,
    audienceCount: recipients.length,
    averageTicket,
    returnRate: estimatedReturnRate,
  });

  const previewLimit = params.previewRecipientLimit == null ? 10 : params.previewRecipientLimit;
  const previewRecipients: AudiencePreviewRecipient[] = recipients
    .slice(0, previewLimit > 0 ? previewLimit : recipients.length)
    .map((item) => ({
    clientId: item.client.id,
    clientName: item.client.name,
    phone: item.client.phone || "",
    normalizedPhone: item.normalizedPhone,
    lastVisitAt: item.lastVisitAt,
    averageTicket: item.avgTicket,
    completedVisits: item.completedVisits,
    daysSinceLastVisit: item.daysSinceLastVisit,
    preferredEmployeeId: item.preferredEmployeeId,
    preferredEmployeeName: item.preferredEmployeeName,
    topServiceName: item.topServiceName,
    tags: item.tags,
    sourceChannel: item.sourceChannel,
  }));

  const excludedReasons: Record<string, number> = {
    suppressed: aggregates.filter((item) => item.isSuppressed).length,
    no_phone: aggregates.filter((item) => !item.normalizedPhone).length,
    invalid_phone: aggregates.filter((item) => !!item.normalizedPhone && !isValidCampaignPhone(item.normalizedPhone)).length,
    opt_out: aggregates.filter((item) => item.hasExplicitOptOut).length,
    without_consent: params.filters.consentOnly ? aggregates.filter((item) => !item.consentGranted && !item.hasExplicitOptOut).length : 0,
    duplicate_phone: duplicateCount,
  };

  return {
    audienceCount: recipients.length,
    eligibleCount: recipients.length,
    excludedCount: Object.values(excludedReasons).reduce((sum, value) => sum + value, 0),
    excludedReasons,
    averageTicket,
    averageReturnIntervalDays,
    estimatedReturnRate,
    estimatedConversionRate: performance.estimatedConversionRate,
    estimatedBookings: performance.estimatedBookings,
    estimatedRevenue: performance.estimatedRevenue,
    recipients: previewRecipients,
  };
}
