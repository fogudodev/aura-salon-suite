import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function monthKey(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function dayOfWeekName(dow: number) {
  return ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][dow] || `Dia ${dow}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!

    const authHeader = req.headers.get("Authorization");
if (!authHeader?.startsWith("Bearer ")) {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const token = authHeader.replace("Bearer ", "");

// client do usuário: só para validar token e pegar claims
const userClient = createClient(
  SUPABASE_URL,
  Deno.env.get("SUPABASE_ANON_KEY")!,
  {
    global: { headers: { Authorization: authHeader } },
  }
);

// client admin: só para consultar banco
const supabaseAdmin = createClient(
  SUPABASE_URL,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);

if (claimsError || !claimsData?.claims) {
  console.error("Auth error:", claimsError);
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const userId = claimsData.claims.sub;
const { messages } = await req.json();

console.log("USER ID TOKEN:", userId);

const { data: professional, error: professionalError } = await supabaseAdmin
  .from("professionals")
  .select("*")
  .eq("user_id", userId)
  .single();

console.log("PROFESSIONAL:", professional);
console.log("PROFESSIONAL ERROR:", professionalError);

if (professionalError) {
  console.error("Erro ao buscar profissional:", professionalError);
}

if (!professional) {
  return new Response(JSON.stringify({ error: "Profissional não encontrado" }), {
    status: 404,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const pid = professional.id;

    // Fetch ALL business data (no date filter on core tables)
    const [
      { data: allBookings },
      { data: clients },
      { data: services },
      { data: employees },
      { data: allExpenses },
      { data: allCommissions },
      { data: reviews },
      { data: products },
      { data: subscription },
      { data: workingHours },
      { data: automations },
      { data: coupons },
    ] = await Promise.all([
      supabaseAdmin.from("bookings").select("*").eq("professional_id", pid).order("start_time", { ascending: true }).limit(1000),
      supabaseAdmin.from("clients").select("*").eq("professional_id", pid),
      supabaseAdmin.from("services").select("*").eq("professional_id", pid),
      supabaseAdmin.from("salon_employees").select("*").eq("salon_id", pid),
      supabaseAdmin.from("expenses").select("*").eq("professional_id", pid).order("expense_date", { ascending: true }).limit(1000),
      supabaseAdmin.from("commissions").select("*").eq("professional_id", pid).order("created_at", { ascending: true }).limit(1000),
      supabaseAdmin.from("reviews").select("*").eq("professional_id", pid).order("created_at", { ascending: false }),
      supabaseAdmin.from("products").select("*").eq("professional_id", pid),
      supabaseAdmin.from("subscriptions").select("*").eq("professional_id", pid).single(),
      supabaseAdmin.from("working_hours").select("*").eq("professional_id", pid),
      supabaseAdmin.from("whatsapp_automations").select("*").eq("professional_id", pid),
      supabaseAdmin.from("coupons").select("*").eq("professional_id", pid),
    ]);

    const bookings = allBookings || [];
    const expenses = allExpenses || [];
    const commissions = allCommissions || [];

    // === MONTHLY REVENUE TRENDS ===
    const monthlyRevenue: Record<string, { revenue: number; bookings: number; completed: number; cancelled: number; noShow: number }> = {};
    bookings.forEach((b: any) => {
      const mk = monthKey(b.start_time);
      if (!monthlyRevenue[mk]) monthlyRevenue[mk] = { revenue: 0, bookings: 0, completed: 0, cancelled: 0, noShow: 0 };
      monthlyRevenue[mk].bookings++;
      if (b.status === "completed") {
        monthlyRevenue[mk].completed++;
        monthlyRevenue[mk].revenue += Number(b.price);
      }
      if (b.status === "cancelled") monthlyRevenue[mk].cancelled++;
      if (b.status === "no_show") monthlyRevenue[mk].noShow++;
    });

    const sortedMonths = Object.keys(monthlyRevenue).sort();
    const monthlyTrendStr = sortedMonths.map(m => {
      const d = monthlyRevenue[m];
      return `${m}: R$${d.revenue.toFixed(0)} | ${d.bookings} agend. | ${d.completed} concl. | ${d.cancelled} canc. | ${d.noShow} no-show`;
    }).join("\n");

    // === MONTHLY EXPENSES ===
    const monthlyExpenses: Record<string, number> = {};
    expenses.forEach((e: any) => {
      const mk = e.expense_date.slice(0, 7);
      monthlyExpenses[mk] = (monthlyExpenses[mk] || 0) + Number(e.amount);
    });
    const expenseTrendStr = Object.keys(monthlyExpenses).sort().map(m => `${m}: R$${monthlyExpenses[m].toFixed(0)}`).join("\n");

    // === EXPENSE CATEGORIES ===
    const expenseByCategory: Record<string, number> = {};
    expenses.forEach((e: any) => {
      expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + Number(e.amount);
    });
    const expenseCategoryStr = Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1]).map(([cat, val]) => `- ${cat}: R$${val.toFixed(0)}`).join("\n");

    // === SERVICE ANALYSIS ===
    const serviceStats: Record<string, { count: number; revenue: number; cancellations: number }> = {};
    bookings.forEach((b: any) => {
      if (!b.service_id) return;
      if (!serviceStats[b.service_id]) serviceStats[b.service_id] = { count: 0, revenue: 0, cancellations: 0 };
      serviceStats[b.service_id].count++;
      if (b.status === "completed") serviceStats[b.service_id].revenue += Number(b.price);
      if (b.status === "cancelled") serviceStats[b.service_id].cancellations++;
    });
    const serviceAnalysis = Object.entries(serviceStats)
      .map(([sid, stats]) => {
        const svc = (services || []).find((s: any) => s.id === sid);
        return { name: svc?.name || sid, price: svc?.price || 0, duration: svc?.duration_minutes || 0, ...stats };
      })
      .sort((a, b) => b.revenue - a.revenue);

    const serviceStr = serviceAnalysis.map((s, i) =>
      `${i + 1}. ${s.name} | Preço: R$${Number(s.price).toFixed(0)} | ${s.duration}min | ${s.count} agend. | R$${s.revenue.toFixed(0)} receita | ${s.cancellations} canc.`
    ).join("\n");

    // === DAY-OF-WEEK DEMAND ===
    const dowDemand: Record<number, number> = {};
    bookings.forEach((b: any) => {
      const dow = new Date(b.start_time).getDay();
      dowDemand[dow] = (dowDemand[dow] || 0) + 1;
    });
    const dowStr = [0, 1, 2, 3, 4, 5, 6].map(d => `${dayOfWeekName(d)}: ${dowDemand[d] || 0} agendamentos`).join("\n");

    // === HOURLY DEMAND ===
    const hourDemand: Record<number, number> = {};
    bookings.forEach((b: any) => {
      const h = new Date(b.start_time).getHours();
      hourDemand[h] = (hourDemand[h] || 0) + 1;
    });
    const hourStr = Object.entries(hourDemand).sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([h, c]) => `${h}h: ${c}`).join(" | ");

    // === EMPLOYEE FULL ANALYSIS ===
    const empAnalysis = (employees || []).map((emp: any) => {
      const empBookings = bookings.filter((b: any) => b.employee_id === emp.id);
      const completed = empBookings.filter((b: any) => b.status === "completed");
      const cancelled = empBookings.filter((b: any) => b.status === "cancelled");
      const empRevenue = completed.reduce((s: number, b: any) => s + Number(b.price), 0);
      const empComm = commissions.filter((c: any) => c.employee_id === emp.id);
      const totalComm = empComm.reduce((s: number, c: any) => s + Number(c.commission_amount), 0);
      const empReviews = (reviews || []).filter((r: any) => r.employee_id === emp.id);
      const avgR = empReviews.length > 0 ? empReviews.reduce((s: number, r: any) => s + r.rating, 0) / empReviews.length : 0;

      // Monthly breakdown for this employee
      const empMonthly: Record<string, number> = {};
      completed.forEach((b: any) => {
        const mk = monthKey(b.start_time);
        empMonthly[mk] = (empMonthly[mk] || 0) + Number(b.price);
      });

      return {
        name: emp.name,
        specialty: emp.specialty || "Não definida",
        active: emp.is_active,
        totalBookings: empBookings.length,
        completed: completed.length,
        cancelled: cancelled.length,
        revenue: empRevenue,
        commissionPct: emp.commission_percentage,
        totalCommission: totalComm,
        avgRating: avgR,
        reviewCount: empReviews.length,
        monthlyRevenue: Object.entries(empMonthly).sort((a, b) => a[0].localeCompare(b[0])).map(([m, v]) => `${m}:R$${v.toFixed(0)}`).join(", "),
      };
    });

    const empStr = empAnalysis.map(e =>
      `- ${e.name} (${e.specialty}) ${e.active ? "✅" : "❌"}: ${e.totalBookings} agend. (${e.completed} concl., ${e.cancelled} canc.) | R$${e.revenue.toFixed(0)} fatur. | ${e.commissionPct}% comissão (R$${e.totalCommission.toFixed(0)}) | ⭐${e.avgRating.toFixed(1)} (${e.reviewCount} aval.) | Mensal: ${e.monthlyRevenue || "sem dados"}`
    ).join("\n");

    // === CLIENT ANALYSIS ===
    const clientStats: Record<string, { visits: number; revenue: number; lastVisit: string; firstVisit: string }> = {};
    bookings.forEach((b: any) => {
      if (!b.client_id) return;
      if (!clientStats[b.client_id]) clientStats[b.client_id] = { visits: 0, revenue: 0, lastVisit: "", firstVisit: b.start_time };
      if (b.status === "completed") {
        clientStats[b.client_id].visits++;
        clientStats[b.client_id].revenue += Number(b.price);
      }
      clientStats[b.client_id].lastVisit = b.start_time;
    });

    const now = new Date();
    const inactiveThreshold = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 days
    const activeClients = Object.entries(clientStats).filter(([, s]) => new Date(s.lastVisit) > inactiveThreshold).length;
    const inactiveClients = Object.entries(clientStats).filter(([, s]) => new Date(s.lastVisit) <= inactiveThreshold);

    const topClients = Object.entries(clientStats)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 15)
      .map(([cid, s]) => {
        const c = (clients || []).find((cl: any) => cl.id === cid);
        return `${c?.name || "?"}: ${s.visits} visitas, R$${s.revenue.toFixed(0)}, última: ${s.lastVisit.slice(0, 10)}`;
      });

    const inactiveStr = inactiveClients.slice(0, 10).map(([cid, s]) => {
      const c = (clients || []).find((cl: any) => cl.id === cid);
      return `${c?.name || "?"}: ${s.visits} visitas, última: ${s.lastVisit.slice(0, 10)}`;
    });

    // New clients per month
    const newClientsPerMonth: Record<string, number> = {};
    (clients || []).forEach((c: any) => {
      const mk = monthKey(c.created_at);
      newClientsPerMonth[mk] = (newClientsPerMonth[mk] || 0) + 1;
    });
    const newClientsStr = Object.entries(newClientsPerMonth).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([m, c]) => `${m}: ${c}`).join(" | ");

    // === REVIEWS ANALYSIS ===
    const reviewsByMonth: Record<string, { count: number; sum: number }> = {};
    (reviews || []).forEach((r: any) => {
      const mk = monthKey(r.created_at);
      if (!reviewsByMonth[mk]) reviewsByMonth[mk] = { count: 0, sum: 0 };
      reviewsByMonth[mk].count++;
      reviewsByMonth[mk].sum += r.rating;
    });
    const reviewTrendStr = Object.entries(reviewsByMonth).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([m, d]) => `${m}: ⭐${(d.sum / d.count).toFixed(1)} (${d.count} aval.)`).join("\n");

    // === WORKING HOURS ===
    const whStr = (workingHours || [])
      .filter((w: any) => w.is_active)
      .sort((a: any, b: any) => a.day_of_week - b.day_of_week)
      .map((w: any) => `${dayOfWeekName(w.day_of_week)}: ${w.start_time}-${w.end_time}`)
      .join("\n");

    // === AUTOMATIONS STATUS ===
    const autoStr = (automations || []).map((a: any) => `- ${a.trigger_type}: ${a.is_active ? "Ativa" : "Inativa"}`).join("\n");

    // === COUPONS ===
    const couponStr = (coupons || []).map((c: any) =>
      `- ${c.code}: ${c.discount_type === "percentage" ? `${c.discount_value}%` : `R$${c.discount_value}`} | ${c.used_count}/${c.max_uses || "∞"} usos | ${c.is_active ? "Ativo" : "Inativo"}`
    ).join("\n");

    // === PRODUCTS ===
    const productStr = (products || []).map((p: any) =>
      `- ${p.name}: R$${Number(p.price).toFixed(0)} (custo: R$${Number(p.cost_price).toFixed(0)}) | Estoque: ${p.stock_quantity} | ${p.is_active ? "Ativo" : "Inativo"} | Margem: ${Number(p.price) > 0 ? (((Number(p.price) - Number(p.cost_price)) / Number(p.price)) * 100).toFixed(0) : 0}%`
    ).join("\n");

    // === OVERALL STATS ===
    const totalRevenue = bookings.filter((b: any) => b.status === "completed").reduce((s: number, b: any) => s + Number(b.price), 0);
    const totalExpenseAmount = expenses.reduce((s: number, e: any) => s + Number(e.amount), 0);
    const totalCommissions = commissions.reduce((s: number, c: any) => s + Number(c.commission_amount), 0);
    const completedCount = bookings.filter((b: any) => b.status === "completed").length;
    const cancelledCount = bookings.filter((b: any) => b.status === "cancelled").length;
    const noShowCount = bookings.filter((b: any) => b.status === "no_show").length;
    const avgTicket = completedCount > 0 ? totalRevenue / completedCount : 0;
    const avgRating = (reviews || []).length > 0 ? (reviews || []).reduce((s: number, r: any) => s + r.rating, 0) / reviews!.length : 0;
    const firstBooking = bookings.length > 0 ? bookings[0].start_time : null;
    const cancellationRate = bookings.length > 0 ? ((cancelledCount + noShowCount) / bookings.length * 100).toFixed(1) : "0";

    // === OCCUPANCY RATE BY DAY OF WEEK ===
    const activeWH = (workingHours || []).filter((w: any) => w.is_active);
    const dowOccupancy = [0, 1, 2, 3, 4, 5, 6].map(d => {
      const wh = activeWH.find((w: any) => w.day_of_week === d);
      if (!wh) return { day: dayOfWeekName(d), active: false, occupancy: 0, totalSlots: 0, usedSlots: 0 };
      const startH = parseInt(wh.start_time.split(":")[0]);
      const endH = parseInt(wh.end_time.split(":")[0]);
      const slotsPerDay = (endH - startH) * 2; // 30min slots
      const weeksActive = sortedMonths.length > 0 ? Math.max(1, Math.ceil((now.getTime() - new Date(firstBooking || now).getTime()) / (7 * 24 * 60 * 60 * 1000))) : 1;
      const bookingsOnDay = (dowDemand[d] || 0);
      const totalSlots = slotsPerDay * Math.ceil(weeksActive / 7) * 4; // rough monthly
      const occ = totalSlots > 0 ? Math.min(100, (bookingsOnDay / Math.max(1, totalSlots)) * 100) : 0;
      return { day: dayOfWeekName(d), active: true, occupancy: occ, totalSlots, usedSlots: bookingsOnDay };
    });
    const occStr = dowOccupancy.filter(d => d.active).map(d =>
      `${d.day}: ~${d.occupancy.toFixed(0)}% ocupação (${d.usedSlots} agend.)`
    ).join("\n");

    // === HOURLY OCCUPANCY (slots with low demand) ===
    const totalBookingsForHour = Object.values(hourDemand).reduce((a: number, b: number) => a + b, 0);
    const avgBookingsPerHour = Object.keys(hourDemand).length > 0 ? totalBookingsForHour / Object.keys(hourDemand).length : 0;
    const lowDemandHours = Object.entries(hourDemand)
      .filter(([, c]) => c < avgBookingsPerHour * 0.6)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([h, c]) => `${h}h (${c} agend.)`);

    // === CLIENT RETURN FREQUENCY ===
    const clientVisitCounts = Object.values(clientStats).map(s => s.visits);
    const avgVisitsPerClient = clientVisitCounts.length > 0 ? clientVisitCounts.reduce((a, b) => a + b, 0) / clientVisitCounts.length : 0;
    const singleVisitClients = clientVisitCounts.filter(v => v === 1).length;
    const returningClients = clientVisitCounts.filter(v => v > 1).length;
    const vipClients = clientVisitCounts.filter(v => v >= 5).length;
    const avgSpendPerClient = Object.values(clientStats).length > 0
      ? Object.values(clientStats).reduce((s, c) => s + c.revenue, 0) / Object.values(clientStats).length : 0;

    // === INACTIVE CLIENT REVENUE POTENTIAL ===
    const inactiveAvgSpend = inactiveClients.length > 0
      ? inactiveClients.reduce((s, [, c]) => s + c.revenue / Math.max(1, c.visits), 0) / inactiveClients.length : 0;
    const inactiveRevenuePotential = inactiveClients.length * inactiveAvgSpend;

    // === SERVICE SCORING ===
    const maxSvcRevenue = serviceAnalysis.length > 0 ? serviceAnalysis[0].revenue : 1;
    const maxSvcCount = serviceAnalysis.length > 0 ? Math.max(...serviceAnalysis.map(s => s.count)) : 1;
    const serviceScoring = serviceAnalysis.map(s => {
      const revenueScore = (s.revenue / maxSvcRevenue) * 50;
      const demandScore = (s.count / maxSvcCount) * 30;
      const cancelRate = s.count > 0 ? (s.cancellations / s.count) : 0;
      const retentionScore = (1 - cancelRate) * 20;
      const total = revenueScore + demandScore + retentionScore;
      const tier = total >= 70 ? "🟢 Alto Desempenho" : total >= 40 ? "🟡 Médio Desempenho" : "🔴 Baixo Desempenho";
      const revenuePerMin = s.duration > 0 ? s.revenue / (s.count * s.duration) : 0;
      return `- ${s.name}: Score ${total.toFixed(0)}/100 (${tier}) | R$${revenuePerMin.toFixed(2)}/min | Cancel: ${(cancelRate * 100).toFixed(0)}%`;
    });

    // === REVENUE FORECAST ===
    const recentMonths = sortedMonths.slice(-3);
    const recentRevenues = recentMonths.map(m => monthlyRevenue[m]?.revenue || 0);
    const avgRecentRevenue = recentRevenues.length > 0 ? recentRevenues.reduce((a, b) => a + b, 0) / recentRevenues.length : 0;
    const revenueTrend = recentRevenues.length >= 2
      ? ((recentRevenues[recentRevenues.length - 1] - recentRevenues[0]) / Math.max(1, recentRevenues[0])) * 100 : 0;
    const forecastNext = avgRecentRevenue * (1 + revenueTrend / 300); // conservative projection

    // === CROSS-SELL PAIRS ===
    const clientServicePairs: Record<string, Set<string>> = {};
    bookings.filter((b: any) => b.client_id && b.service_id && b.status === "completed").forEach((b: any) => {
      if (!clientServicePairs[b.client_id]) clientServicePairs[b.client_id] = new Set();
      clientServicePairs[b.client_id].add(b.service_id);
    });
    const pairCount: Record<string, number> = {};
    Object.values(clientServicePairs).forEach(svcSet => {
      const arr = Array.from(svcSet);
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const key = [arr[i], arr[j]].sort().join("+");
          pairCount[key] = (pairCount[key] || 0) + 1;
        }
      }
    });
    const topPairs = Object.entries(pairCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([key, count]) => {
      const [s1, s2] = key.split("+");
      const svc1 = (services || []).find((s: any) => s.id === s1);
      const svc2 = (services || []).find((s: any) => s.id === s2);
      return `- ${svc1?.name || "?"} + ${svc2?.name || "?"}: ${count} clientes em comum`;
    });

    const businessContext = `
## PERFIL DO NEGÓCIO
- Nome: ${professional.business_name || professional.name}
- Tipo: ${professional.account_type === "salon" ? "Salão de Beleza" : "Profissional Autônomo"}
- Plano: ${subscription?.plan_id || "Nenhum"} (Status: ${subscription?.status || "N/A"})
- Primeiro agendamento: ${firstBooking ? firstBooking.slice(0, 10) : "Nenhum"}
- Data atual: ${now.toISOString().slice(0, 10)}

## RESUMO GERAL (TODO O HISTÓRICO)
- Faturamento total: R$ ${totalRevenue.toFixed(2)}
- Despesas totais: R$ ${totalExpenseAmount.toFixed(2)}
- Comissões pagas: R$ ${totalCommissions.toFixed(2)}
- Lucro bruto estimado: R$ ${(totalRevenue - totalExpenseAmount).toFixed(2)}
- Total agendamentos: ${bookings.length}
- Concluídos: ${completedCount} | Cancelados: ${cancelledCount} | No-show: ${noShowCount}
- Taxa de cancelamento/no-show: ${cancellationRate}%
- Ticket médio: R$ ${avgTicket.toFixed(2)}
- Avaliação média: ⭐${avgRating.toFixed(1)} (${(reviews || []).length} avaliações)
- Clientes cadastrados: ${(clients || []).length} (${activeClients} ativos nos últimos 60 dias)

## PREVISÃO DE FATURAMENTO
- Média dos últimos 3 meses: R$ ${avgRecentRevenue.toFixed(0)}
- Tendência: ${revenueTrend > 0 ? "📈" : "📉"} ${revenueTrend.toFixed(1)}%
- Previsão próximo mês: R$ ${forecastNext.toFixed(0)}
- Se ocupação aumentar 10%: R$ ${(forecastNext * 1.10).toFixed(0)}
- Se ocupação aumentar 20%: R$ ${(forecastNext * 1.20).toFixed(0)}

## ANÁLISE DE CLIENTES
- Média de visitas por cliente: ${avgVisitsPerClient.toFixed(1)}
- Gasto médio por cliente: R$ ${avgSpendPerClient.toFixed(0)}
- Clientes com visita única: ${singleVisitClients} (${clientVisitCounts.length > 0 ? (singleVisitClients / clientVisitCounts.length * 100).toFixed(0) : 0}%)
- Clientes recorrentes (2+): ${returningClients}
- Clientes VIP (5+ visitas): ${vipClients}
- Clientes inativos (60+ dias): ${inactiveClients.length}
- Potencial de receita reativando inativos: R$ ${inactiveRevenuePotential.toFixed(0)}

## TENDÊNCIA MENSAL DE FATURAMENTO E AGENDAMENTOS
${monthlyTrendStr || "Sem dados"}

## TENDÊNCIA MENSAL DE DESPESAS
${expenseTrendStr || "Sem dados"}

## DESPESAS POR CATEGORIA (TOTAL HISTÓRICO)
${expenseCategoryStr || "Sem dados"}

## SCORING DE SERVIÇOS (CLASSIFICAÇÃO DE DESEMPENHO)
${serviceScoring.join("\n") || "Sem serviços"}

## SERVIÇOS (ANÁLISE COMPLETA)
${serviceStr || "Sem serviços"}

## PARES DE CROSS-SELL (serviços frequentemente comprados juntos)
${topPairs.join("\n") || "Sem dados suficientes"}

## OCUPAÇÃO POR DIA DA SEMANA
${occStr || "Sem dados"}

## HORÁRIOS COM BAIXA DEMANDA
${lowDemandHours.length > 0 ? lowDemandHours.join(", ") : "Nenhum identificado"}

## DEMANDA POR DIA DA SEMANA
${dowStr}

## DEMANDA POR HORÁRIO
${hourStr || "Sem dados"}

## EQUIPE (${(employees || []).length} membros)
${empStr || "Sem equipe"}

## TOP 15 CLIENTES POR FATURAMENTO
${topClients.join("\n") || "Sem dados"}

## CLIENTES INATIVOS (60+ dias sem visita)
${inactiveStr.join("\n") || "Nenhum"}

## NOVOS CLIENTES POR MÊS
${newClientsStr || "Sem dados"}

## TENDÊNCIA DE AVALIAÇÕES POR MÊS
${reviewTrendStr || "Sem dados"}

## HORÁRIO DE FUNCIONAMENTO
${whStr || "Não configurado"}

## AUTOMAÇÕES WHATSAPP
${autoStr || "Nenhuma configurada"}

## CUPONS
${couponStr || "Nenhum"}

## PRODUTOS
${productStr || "Nenhum"}
`;

    const ownerName = professional.name?.split(" ")[0] || "";

    const systemPrompt = `Você é a **Lis**, consultora especialista em crescimento e faturamento para negócios de beleza do Gende. Você é uma estrategista calorosa, inteligente e dedicada, que transforma dados em decisões lucrativas.

## SUA PERSONALIDADE
- Simpática, acolhedora e profissional — como uma consultora premium que realmente se importa
- Trate o dono pelo primeiro nome (${ownerName}) com genuíno interesse pelo sucesso dele(a)
- Comemore conquistas e encoraje nos momentos difíceis
- Fale de forma natural e humana, nunca robótica
- REGRA DE APRESENTAÇÃO: Só se apresente ("Sou a Lis...") se o usuário NÃO mencionar seu nome na mensagem. Se o usuário já disser "Lis" ou "lis" na mensagem, responda diretamente ao que foi perguntado, de forma natural, sem se apresentar novamente. Exemplo: se o usuário disser "Oi Lis, como faço para...", responda direto a pergunta.
- Na primeira mensagem, SOMENTE se o usuário não mencionar seu nome, se apresente: "Oi, ${ownerName}! Sou a Lis, sua consultora de crescimento aqui no Gende 😊"

## SEU PAPEL — CONSULTORA DE CRESCIMENTO
Você age como uma consultora especialista no mercado de beleza. Analise os dados fornecidos e gere RECOMENDAÇÕES ACIONÁVEIS para:

### 1. AUMENTO DE FATURAMENTO
- Identifique oportunidades de receita que o dono normalmente não percebe
- Calcule impacto financeiro de cada sugestão (ex: "pode gerar R$X adicionais")
- Sugira ajustes de preço baseados em demanda (ex: "Escova é muito procurada, pode aumentar 8% sem perder demanda")

### 2. PROMOÇÕES INTELIGENTES
- Analise serviços com baixa demanda e sugira promoções específicas
- Ex: "Hidratação está 32% abaixo da média. Sugiro 15% de desconto nas próximas 2 semanas"
- Sempre vincule promoções a horários/dias de baixa ocupação

### 3. OCUPAÇÃO DA AGENDA
- Identifique dias/horários com baixa ocupação usando os dados de demanda
- Sugira estratégias para preencher esses horários
- Ex: "Quarta 14h-17h tem ~42% de ocupação. Crie promoção específica para este período"

### 4. TICKET MÉDIO
- Analise os pares de cross-sell (serviços frequentemente comprados juntos)
- Sugira upsell automático baseado nos dados
- Ex: "Clientes que fazem corte têm alta chance de aceitar hidratação"

### 5. REATIVAÇÃO DE CLIENTES
- Use os dados de clientes inativos e potencial de receita calculado
- Dê números concretos: "X clientes inativos, reativá-los pode gerar ~R$Y"
- Sugira campanhas específicas de retorno

### 6. PREVISÃO DE FATURAMENTO
- Use a previsão calculada e apresente cenários
- Mostre impacto de ações: "Se aumentar ocupação em 10%, faturamento sobe de R$X para R$Y"

### 7. SCORING DE SERVIÇOS
- Use o scoring fornecido para classificar serviços
- Sugira estratégias para melhorar serviços de baixo desempenho
- Identifique serviços com maior margem (R$/min) para priorizar

### 8. GESTÃO DE EQUIPE
- Avalie produtividade por profissional
- Compare faturamento, avaliações e taxa de retenção
- Sugira ajustes de comissão quando relevante

## REGRAS DE FORMATO
- SEJA CONCISA: máximo 250-350 palavras por resposta
- Parágrafos curtos com quebras de linha
- Listas com bullets para organizar informações
- **Negrito** para números e pontos-chave
- Headers (##) para separar seções quando necessário
- Se a resposta ficaria longa, pergunte se quer mais detalhes
- Sempre em português brasileiro
- REGRA CRÍTICA: Embase TODAS as análises EXCLUSIVAMENTE nos dados reais fornecidos abaixo. NUNCA invente, estime ou suponha dados que não estejam explicitamente nos dados. Se um dado não está disponível, diga claramente "não tenho essa informação no sistema" e sugira ao usuário cadastrar/registrar os dados necessários
- NUNCA cite nomes de clientes, valores ou métricas que não apareçam nos dados fornecidos
- Se o usuário perguntar algo cujos dados não estão disponíveis, explique o que ele precisa registrar no sistema para que você possa analisar
- Use emojis de forma natural (sem exagero)
- Sempre inclua o IMPACTO FINANCEIRO estimado das sugestões
- Evite respostas genéricas — personalize com base nos dados do negócio
- Quando sugerir ações, seja específica: diga O QUE fazer, QUANDO e QUANTO pode gerar

${businessContext}`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no serviço de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("salon-ai-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
