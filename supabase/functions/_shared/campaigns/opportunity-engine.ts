import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { previewCampaignAudience } from "./audience-builder.ts";
import {
  buildOpportunityDedupeKey,
  buildOpportunityReason,
  buildOpportunitySummary,
  calculateUrgencyLevel,
} from "./domain.ts";
import type { CampaignAudienceFilters, LisOpportunitySeed } from "./types.ts";

type ServiceDropCandidate = {
  serviceId: string;
  serviceName: string;
  previousCount: number;
  currentCount: number;
  dropRate: number;
};

function tomorrowDateISO() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function nextSuggestedSendTime(hourHint = 11, minHoursAhead = 1) {
  const now = new Date();
  const candidate = new Date(now);
  candidate.setHours(Math.min(Math.max(hourHint, 8), 20), 0, 0, 0);
  const threshold = addHours(now, minHoursAhead);
  if (candidate.getTime() <= threshold.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate.toISOString();
}

function buildOpportunitySeed(input: Omit<LisOpportunitySeed, "summary" | "urgency_level"> & { urgencyLevel?: "low" | "medium" | "high" }) {
  return {
    ...input,
    summary: buildOpportunitySummary({
      audience_count: input.audience_count,
      estimated_bookings: input.estimated_bookings,
      estimated_revenue: input.estimated_revenue,
    }),
    urgency_level: input.urgencyLevel || calculateUrgencyLevel({
      estimatedRevenue: input.estimated_revenue,
      audienceCount: input.audience_count,
      expiresAt: input.expires_at,
    }),
  } satisfies LisOpportunitySeed;
}

export function computeOpportunityPriorityScore(opportunity: Pick<LisOpportunitySeed, "estimated_revenue" | "confidence_score">) {
  return Number(opportunity.estimated_revenue || 0) * Number(opportunity.confidence_score || 0);
}

async function detectBestSendHour(
  supabase: SupabaseClient,
  professionalId: string,
) {
  const sinceIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("bookings")
    .select("start_time")
    .eq("professional_id", professionalId)
    .eq("status", "completed")
    .gte("start_time", sinceIso);

  if (error) throw error;
  if (!data || data.length === 0) return 11;

  const byHour = new Map<number, number>();
  for (const row of data) {
    const hour = new Date(String(row.start_time)).getHours();
    if (hour < 8 || hour > 20) continue;
    byHour.set(hour, (byHour.get(hour) || 0) + 1);
  }

  if (byHour.size === 0) return 11;
  return Array.from(byHour.entries()).sort((a, b) => b[1] - a[1])[0][0];
}

async function findServiceDropCandidates(
  supabase: SupabaseClient,
  professionalId: string,
): Promise<ServiceDropCandidate[]> {
  const [bookingsRes, servicesRes] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, start_time, status")
      .eq("professional_id", professionalId)
      .eq("status", "completed")
      .gte("start_time", new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString()),
    supabase
      .from("services")
      .select("id, name")
      .eq("professional_id", professionalId)
      .eq("active", true),
  ]);

  if (bookingsRes.error) throw bookingsRes.error;
  if (servicesRes.error) throw servicesRes.error;

  const bookingIds = (bookingsRes.data || []).map((booking) => booking.id);
  const bookingServicesRes = bookingIds.length > 0
    ? await supabase
      .from("booking_services")
      .select("booking_id, service_id")
      .in("booking_id", bookingIds)
    : { data: [], error: null };
  if (bookingServicesRes.error) throw bookingServicesRes.error;

  const bookingDates = new Map<string, string>();
  for (const booking of bookingsRes.data || []) {
    bookingDates.set(booking.id, booking.start_time);
  }

  const currentCounts = new Map<string, number>();
  const previousCounts = new Map<string, number>();
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

  for (const row of bookingServicesRes.data || []) {
    const bookingTime = bookingDates.get(row.booking_id);
    if (!bookingTime) continue;
    const targetMap = new Date(bookingTime).getTime() >= fourteenDaysAgo ? currentCounts : previousCounts;
    targetMap.set(row.service_id, (targetMap.get(row.service_id) || 0) + 1);
  }

  const serviceById = new Map((servicesRes.data || []).map((service) => [service.id, service.name]));

  return Array.from(previousCounts.entries())
    .map(([serviceId, previousCount]) => {
      const currentCount = currentCounts.get(serviceId) || 0;
      const dropRate = previousCount > 0 ? (previousCount - currentCount) / previousCount : 0;
      return {
        serviceId,
        serviceName: serviceById.get(serviceId) || "Servico",
        previousCount,
        currentCount,
        dropRate,
      };
    })
    .filter((candidate) => candidate.previousCount >= 4 && candidate.dropRate >= 0.18)
    .sort((a, b) => b.dropRate - a.dropRate)
    .slice(0, 2);
}

async function detectIdleTurnOpportunities(
  supabase: SupabaseClient,
  professionalId: string,
  bestHour: number,
): Promise<LisOpportunitySeed[]> {
  const tomorrow = tomorrowDateISO();
  const tomorrowDate = new Date(`${tomorrow}T12:00:00`);
  const tomorrowDow = tomorrowDate.getDay();

  const [workingHoursRes, bookingsRes, servicesRes] = await Promise.all([
    supabase
      .from("working_hours")
      .select("day_of_week, start_time, end_time, is_active")
      .eq("professional_id", professionalId),
    supabase
      .from("bookings")
      .select("id, start_time, status")
      .eq("professional_id", professionalId)
      .gte("start_time", `${tomorrow}T00:00:00`)
      .lt("start_time", `${tomorrow}T23:59:59`)
      .in("status", ["pending", "confirmed"]),
    supabase
      .from("services")
      .select("duration_minutes")
      .eq("professional_id", professionalId)
      .eq("active", true),
  ]);

  if (workingHoursRes.error) throw workingHoursRes.error;
  if (bookingsRes.error) throw bookingsRes.error;
  if (servicesRes.error) throw servicesRes.error;

  const dayHours = (workingHoursRes.data || []).filter((row) => Number(row.day_of_week) === tomorrowDow && row.is_active);
  if (dayHours.length === 0) return [];

  const avgDuration = Math.max(
    45,
    Math.round(
      ((servicesRes.data || []).reduce((sum, service) => sum + Number(service.duration_minutes || 0), 0)
        / Math.max((servicesRes.data || []).length, 1)),
    ) || 60,
  );

  const turnMinutes = { manha: 0, tarde: 0, noite: 0 };
  for (const row of dayHours) {
    const [startHour, startMinute] = String(row.start_time).split(":").map(Number);
    const [endHour, endMinute] = String(row.end_time).split(":").map(Number);
    const startTotal = startHour * 60 + startMinute;
    const endTotal = endHour * 60 + endMinute;
    for (let current = startTotal; current < endTotal; current += 30) {
      const turn = current < 12 * 60 ? "manha" : current < 18 * 60 ? "tarde" : "noite";
      turnMinutes[turn] += 30;
    }
  }

  const bookingsByTurn = { manha: 0, tarde: 0, noite: 0 };
  for (const booking of bookingsRes.data || []) {
    const hour = new Date(booking.start_time).getHours();
    const turn = hour < 12 ? "manha" : hour < 18 ? "tarde" : "noite";
    bookingsByTurn[turn] += 1;
  }

  const opportunities: LisOpportunitySeed[] = [];
  for (const turn of ["manha", "tarde", "noite"] as const) {
    const capacity = Math.floor(turnMinutes[turn] / avgDuration);
    const availableSlots = capacity - bookingsByTurn[turn];
    if (availableSlots < 3) continue;

    const audienceFilter: CampaignAudienceFilters = {
      audienceType: "oportunidade_agenda",
      recentDays: 120,
      turn,
      opportunityDate: tomorrow,
      consentOnly: true,
      minAvailableSlots: availableSlots,
    };

    const preview = await previewCampaignAudience({
      supabase,
      professionalId,
      objective: "preenchimento_agenda",
      filters: audienceFilter,
    });
    if (preview.audienceCount === 0) continue;

    opportunities.push(buildOpportunitySeed({
      dedupeKey: buildOpportunityDedupeKey("idle_turn", `${tomorrow}:${turn}`),
      type: "idle_turn",
      title: `Lis detectou ${availableSlots} horarios vagos para ${turn} amanha`,
      reason: buildOpportunityReason([
        `A agenda de ${tomorrow.split("-").reverse().join("/")} ficou com baixa ocupacao no turno ${turn}.`,
        `Capacidade estimada ${capacity} e apenas ${bookingsByTurn[turn]} horarios preenchidos.`,
      ]),
      confidence_score: 0.9,
      audience_count: preview.audienceCount,
      estimated_conversion_rate: preview.estimatedConversionRate,
      estimated_bookings: preview.estimatedBookings,
      estimated_revenue: preview.estimatedRevenue,
      suggested_campaign_objective: "preenchimento_agenda",
      suggested_message: `Oi, {nome}. Abriu um horario muito bom ${turn === "manha" ? "amanha de manha" : turn === "tarde" ? "amanha a tarde" : "amanha a noite"} e achei que combinaria com voce. Se quiser aproveitar, seu link esta aqui: {link_agendamento}`,
      suggested_cta: "booking_link",
      suggested_send_time: nextSuggestedSendTime(bestHour, 1),
      suggested_audience_json: audienceFilter as unknown as Record<string, unknown>,
      source_metrics_json: {
        available_slots: availableSlots,
        capacity,
        booked_slots: bookingsByTurn[turn],
        date: tomorrow,
        turn,
      },
      expires_at: `${tomorrow}T23:59:59`,
      urgencyLevel: "high",
    }));
  }

  return opportunities;
}

export async function detectLisOpportunities(params: {
  supabase: SupabaseClient;
  professionalId: string;
}): Promise<LisOpportunitySeed[]> {
  const { supabase, professionalId } = params;
  const bestSendHour = await detectBestSendHour(supabase, professionalId);
  const opportunities: LisOpportunitySeed[] = [];

  const inactivePreview = await previewCampaignAudience({
    supabase,
    professionalId,
    objective: "reativacao",
    filters: { audienceType: "inativos", inactiveDays: 45, consentOnly: true },
  });

  if (inactivePreview.audienceCount >= 8) {
    opportunities.push(buildOpportunitySeed({
      dedupeKey: buildOpportunityDedupeKey("reactivation", "45d"),
      type: "reactivation",
      title: `Lis encontrou ${inactivePreview.audienceCount} clientes sem retorno ha 45 dias`,
      reason: buildOpportunityReason([
        "Este publico ja conhece o salao, mas saiu da janela ideal de retorno.",
        "Acionar agora aumenta chance de recuperar agenda e receita no curto prazo.",
      ]),
      confidence_score: 0.86,
      audience_count: inactivePreview.audienceCount,
      estimated_conversion_rate: inactivePreview.estimatedConversionRate,
      estimated_bookings: inactivePreview.estimatedBookings,
      estimated_revenue: inactivePreview.estimatedRevenue,
      suggested_campaign_objective: "reativacao",
      suggested_message: "Oi, {nome}. Faz um tempo desde sua ultima visita e eu reservei uma oportunidade boa para voce voltar com {servico}. Se quiser, eu ja deixo seu horario aqui: {link_agendamento}",
      suggested_cta: "booking_link",
      suggested_send_time: nextSuggestedSendTime(bestSendHour, 2),
      suggested_audience_json: { audienceType: "inativos", inactiveDays: 45, consentOnly: true },
      source_metrics_json: {
        average_ticket: inactivePreview.averageTicket,
        estimated_return_rate: inactivePreview.estimatedReturnRate,
      },
      expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    }));
  }

  const maintenancePreview = await previewCampaignAudience({
    supabase,
    professionalId,
    objective: "manutencao",
    filters: { audienceType: "janela_manutencao", maintenanceWindowDays: 7, consentOnly: true },
  });

  if (maintenancePreview.audienceCount >= 6) {
    opportunities.push(buildOpportunitySeed({
      dedupeKey: buildOpportunityDedupeKey("maintenance_window", "all"),
      type: "maintenance_window",
      title: `${maintenancePreview.audienceCount} clientes estao na janela ideal de manutencao`,
      reason: buildOpportunityReason([
        "A Lis cruzou intervalo de manutencao com historico de retorno.",
        "O timing esta favoravel para converter antes da demanda esfriar.",
      ]),
      confidence_score: 0.91,
      audience_count: maintenancePreview.audienceCount,
      estimated_conversion_rate: maintenancePreview.estimatedConversionRate,
      estimated_bookings: maintenancePreview.estimatedBookings,
      estimated_revenue: maintenancePreview.estimatedRevenue,
      suggested_campaign_objective: "manutencao",
      suggested_message: "Oi, {nome}. Pela sua rotina com {servico}, este e um bom momento para manutencao. Se quiser garantir horario, seu link esta aqui: {link_agendamento}",
      suggested_cta: "booking_link",
      suggested_send_time: nextSuggestedSendTime(bestSendHour, 6),
      suggested_audience_json: { audienceType: "janela_manutencao", maintenanceWindowDays: 7, consentOnly: true },
      source_metrics_json: {
        average_ticket: maintenancePreview.averageTicket,
        average_return_interval_days: maintenancePreview.averageReturnIntervalDays,
      },
      expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    }));
  }

  const birthdayPreview = await previewCampaignAudience({
    supabase,
    professionalId,
    objective: "aniversario",
    filters: { audienceType: "aniversario", birthdayWindowDays: 10, consentOnly: true },
  });

  if (birthdayPreview.audienceCount >= 4) {
    opportunities.push(buildOpportunitySeed({
      dedupeKey: buildOpportunityDedupeKey("birthday", "10d"),
      type: "birthday",
      title: `${birthdayPreview.audienceCount} aniversarios proximos com potencial de conversao`,
      reason: buildOpportunityReason([
        "Clientes em periodo de celebracao tendem a responder melhor a ofertas direcionadas.",
        "A janela dos proximos 10 dias favorece campanha curta de agenda.",
      ]),
      confidence_score: 0.8,
      audience_count: birthdayPreview.audienceCount,
      estimated_conversion_rate: birthdayPreview.estimatedConversionRate,
      estimated_bookings: birthdayPreview.estimatedBookings,
      estimated_revenue: birthdayPreview.estimatedRevenue,
      suggested_campaign_objective: "aniversario",
      suggested_message: "Oi, {nome}. Seu mes especial esta chegando e separei uma condicao exclusiva para voce voltar ao salao. Se quiser garantir horario: {link_agendamento}",
      suggested_cta: "booking_link",
      suggested_send_time: nextSuggestedSendTime(bestSendHour, 10),
      suggested_audience_json: { audienceType: "aniversario", birthdayWindowDays: 10, consentOnly: true },
      source_metrics_json: {
        window_days: 10,
      },
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }));
  }

  const cancelPreview = await previewCampaignAudience({
    supabase,
    professionalId,
    objective: "reativacao",
    filters: { audienceType: "cancelou_sem_reagendar", consentOnly: true },
  });
  if (cancelPreview.audienceCount >= 5) {
    opportunities.push(buildOpportunitySeed({
      dedupeKey: buildOpportunityDedupeKey("cancelled_recovery", "all"),
      type: "cancelled_recovery",
      title: `${cancelPreview.audienceCount} clientes cancelaram e ainda nao reagendaram`,
      reason: buildOpportunityReason([
        "Esses clientes ja tinham intencao de compra, mas interromperam a jornada.",
        "Uma reabordagem imediata tende a recuperar agenda com baixo CAC.",
      ]),
      confidence_score: 0.87,
      audience_count: cancelPreview.audienceCount,
      estimated_conversion_rate: cancelPreview.estimatedConversionRate,
      estimated_bookings: cancelPreview.estimatedBookings,
      estimated_revenue: cancelPreview.estimatedRevenue,
      suggested_campaign_objective: "reativacao",
      suggested_message: "Oi, {nome}. Vi que seu ultimo agendamento acabou nao acontecendo. Se quiser, posso te ajudar a remarcar no melhor horario aqui: {link_agendamento}",
      suggested_cta: "booking_link",
      suggested_send_time: nextSuggestedSendTime(bestSendHour, 1),
      suggested_audience_json: { audienceType: "cancelou_sem_reagendar", consentOnly: true },
      source_metrics_json: {
        estimated_return_rate: cancelPreview.estimatedReturnRate,
      },
      expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      urgencyLevel: "high",
    }));
  }

  const noShowPreview = await previewCampaignAudience({
    supabase,
    professionalId,
    objective: "reativacao",
    filters: { audienceType: "no_show", consentOnly: true },
  });
  if (noShowPreview.audienceCount >= 4) {
    opportunities.push(buildOpportunitySeed({
      dedupeKey: buildOpportunityDedupeKey("no_show_recovery", "all"),
      type: "no_show_recovery",
      title: `${noShowPreview.audienceCount} clientes com no-show podem ser recuperados`,
      reason: buildOpportunityReason([
        "A Lis detectou clientes que faltaram e nao voltaram para remarcar.",
        "Reengajamento com mensagem objetiva reduz perda recorrente de agenda.",
      ]),
      confidence_score: 0.79,
      audience_count: noShowPreview.audienceCount,
      estimated_conversion_rate: noShowPreview.estimatedConversionRate,
      estimated_bookings: noShowPreview.estimatedBookings,
      estimated_revenue: noShowPreview.estimatedRevenue,
      suggested_campaign_objective: "reativacao",
      suggested_message: "Oi, {nome}. Quero te ajudar a remarcar seu atendimento sem complicacao. Tenho horarios disponiveis e posso te encaixar por aqui: {link_agendamento}",
      suggested_cta: "booking_link",
      suggested_send_time: nextSuggestedSendTime(bestSendHour, 2),
      suggested_audience_json: { audienceType: "no_show", consentOnly: true },
      source_metrics_json: {
        no_show_recovery: true,
      },
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      urgencyLevel: "high",
    }));
  }

  const vipPreview = await previewCampaignAudience({
    supabase,
    professionalId,
    objective: "upsell",
    filters: { audienceType: "vip", vipMinTicket: 220, consentOnly: true },
    previewRecipientLimit: 0,
  });

  const dormantVip = (vipPreview.recipients || []).filter((recipient) => Number(recipient.daysSinceLastVisit || 0) >= 30);
  if (dormantVip.length >= 4) {
    const estimatedBookings = Number((dormantVip.length * Math.max(vipPreview.estimatedConversionRate, 0.1)).toFixed(1));
    const estimatedRevenue = Number((estimatedBookings * Math.max(vipPreview.averageTicket, 220)).toFixed(2));
    opportunities.push(buildOpportunitySeed({
      dedupeKey: buildOpportunityDedupeKey("vip_lapse", "30d"),
      type: "vip_lapse",
      title: `${dormantVip.length} clientes VIP sem retorno ha 30+ dias`,
      reason: buildOpportunityReason([
        "Clientes VIP sustentam ticket e recorrencia, mas estao afastados da janela ideal.",
        "Uma abordagem premium agora protege receita de alto valor.",
      ]),
      confidence_score: 0.93,
      audience_count: dormantVip.length,
      estimated_conversion_rate: Math.max(vipPreview.estimatedConversionRate, 0.1),
      estimated_bookings: estimatedBookings,
      estimated_revenue: estimatedRevenue,
      suggested_campaign_objective: "upsell",
      suggested_message: "Oi, {nome}. Separei uma experiencia premium para seu proximo atendimento e quero te dar prioridade na agenda. Se fizer sentido, me confirma aqui: {link_agendamento}",
      suggested_cta: "booking_link",
      suggested_send_time: nextSuggestedSendTime(bestSendHour, 2),
      suggested_audience_json: { audienceType: "vip", vipMinTicket: 220, consentOnly: true, inactiveDays: 30 },
      source_metrics_json: {
        dormant_vip_count: dormantVip.length,
        average_ticket: vipPreview.averageTicket,
      },
      expires_at: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
      urgencyLevel: "high",
    }));
  }

  const serviceDropCandidates = await findServiceDropCandidates(supabase, professionalId);
  for (const candidate of serviceDropCandidates) {
    const audienceFilter: CampaignAudienceFilters = {
      audienceType: "servico_especifico",
      serviceIds: [candidate.serviceId],
      consentOnly: true,
    };
    const preview = await previewCampaignAudience({
      supabase,
      professionalId,
      objective: "promocao",
      filters: audienceFilter,
    });
    if (preview.audienceCount === 0) continue;

    opportunities.push(buildOpportunitySeed({
      dedupeKey: buildOpportunityDedupeKey("service_drop", candidate.serviceId),
      type: "service_drop",
      title: `${candidate.serviceName} caiu ${(candidate.dropRate * 100).toFixed(0)}% nas ultimas 2 semanas`,
      reason: buildOpportunityReason([
        `O servico caiu de ${candidate.previousCount} para ${candidate.currentCount} atendimentos na comparacao de 14 dias.`,
        "A Lis recomenda reaquecer essa demanda antes de virar queda estrutural.",
      ]),
      confidence_score: 0.82,
      audience_count: preview.audienceCount,
      estimated_conversion_rate: preview.estimatedConversionRate,
      estimated_bookings: preview.estimatedBookings,
      estimated_revenue: preview.estimatedRevenue,
      suggested_campaign_objective: "promocao",
      suggested_message: `Oi, {nome}. Tenho uma oportunidade especial para quem gosta de ${candidate.serviceName}. Se quiser aproveitar e garantir horario, e so usar este link: {link_agendamento}`,
      suggested_cta: "booking_link",
      suggested_send_time: nextSuggestedSendTime(bestSendHour, 3),
      suggested_audience_json: audienceFilter as unknown as Record<string, unknown>,
      source_metrics_json: {
        service_name: candidate.serviceName,
        previous_count: candidate.previousCount,
        current_count: candidate.currentCount,
        drop_rate: candidate.dropRate,
      },
      expires_at: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
    }));
  }

  const idleTurnOpportunities = await detectIdleTurnOpportunities(supabase, professionalId, bestSendHour);
  opportunities.push(...idleTurnOpportunities);

  return opportunities
    .sort((a, b) => computeOpportunityPriorityScore(b) - computeOpportunityPriorityScore(a))
    .slice(0, 12);
}
