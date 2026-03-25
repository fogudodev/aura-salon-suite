import { useMemo } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useProfessional } from "@/hooks/useProfessional";
import { useServices } from "@/hooks/useServices";
import { useUpsellEvents, useUpsellRules, useUpsellRecipients } from "@/hooks/useUpsell";
import { Loader2, TrendingUp, Target, DollarSign, BarChart3, Send, CheckCircle, Clock, XCircle } from "lucide-react";

const UpsellDashboard = () => {
  const { data: professional } = useProfessional();
  const { data: events, isLoading: eventsLoading } = useUpsellEvents(professional?.id);
  const { data: rules, isLoading: rulesLoading } = useUpsellRules(professional?.id);
  const { data: recipients, isLoading: recipientsLoading } = useUpsellRecipients(professional?.id);
  const { data: services } = useServices();

  const isLoading = eventsLoading || rulesLoading || recipientsLoading;

  const serviceMap = useMemo(() => {
    const map: Record<string, string> = {};
    (services || []).forEach(s => { map[s.id] = s.name; });
    return map;
  }, [services]);

  const stats = useMemo(() => {
    const allEvents = events || [];
    const suggested = allEvents.filter(e => e.status === "suggested").length;
    const accepted = allEvents.filter(e => e.status === "accepted").length;
    const totalRevenue = allEvents.filter(e => e.status === "accepted").reduce((sum, e) => sum + (e.upsell_revenue || e.value || 0), 0);
    const conversionRate = suggested > 0 ? Math.round((accepted / suggested) * 100) : 0;

    // Top combos
    const comboMap: Record<string, { source: string; rec: string; count: number; revenue: number }> = {};
    allEvents.filter(e => e.status === "accepted").forEach(e => {
      const key = `${e.source_service_id}:${e.recommended_service_id}`;
      if (!comboMap[key]) {
        comboMap[key] = {
          source: serviceMap[e.source_service_id || ""] || "—",
          rec: serviceMap[e.recommended_service_id || ""] || "—",
          count: 0,
          revenue: 0,
        };
      }
      comboMap[key].count++;
      comboMap[key].revenue += e.upsell_revenue || e.value || 0;
    });
    const topCombos = Object.values(comboMap).sort((a, b) => b.count - a.count).slice(0, 5);

    // Monthly revenue
    const now = new Date();
    const thisMonth = allEvents.filter(e => {
      const d = new Date(e.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && e.status === "accepted";
    });
    const monthlyRevenue = thisMonth.reduce((sum, e) => sum + (e.upsell_revenue || e.value || 0), 0);

    return { suggested, accepted, totalRevenue, conversionRate, topCombos, monthlyRevenue };
  }, [events, serviceMap]);

  const recipientStats = useMemo(() => {
    const all = recipients || [];
    return {
      pending: all.filter(r => r.status === "pending").length,
      sent: all.filter(r => r.status === "sent").length,
      accepted: all.filter(r => r.status === "accepted").length,
      total: all.length,
    };
  }, [recipients]);

  return (
    <DashboardLayout title="Upsell Inteligente" subtitle="Acompanhe o desempenho das sugestões de serviços">
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      ) : (
        <div className="space-y-6 max-w-4xl">
          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Send} label="Ofertas enviadas" value={String(stats.suggested)} color="text-blue-400" />
            <StatCard icon={CheckCircle} label="Aceitas" value={String(stats.accepted)} color="text-emerald-400" />
            <StatCard icon={BarChart3} label="Taxa de conversão" value={`${stats.conversionRate}%`} color="text-purple-400" />
            <StatCard icon={DollarSign} label="Receita este mês" value={`R$ ${stats.monthlyRevenue.toFixed(2)}`} color="text-amber-400" />
          </div>

          {/* Total revenue highlight */}
          <div className="glass-card rounded-2xl p-6 text-center">
            <p className="text-xs text-muted-foreground mb-1">Receita adicional total gerada por Upsell</p>
            <p className="text-3xl font-bold text-accent">R$ {stats.totalRevenue.toFixed(2)}</p>
          </div>

          {/* Recipients status */}
          <div className="grid grid-cols-3 gap-3">
            <MiniCard icon={Clock} label="Pendentes" value={recipientStats.pending} color="text-yellow-400" />
            <MiniCard icon={Send} label="Enviadas" value={recipientStats.sent} color="text-blue-400" />
            <MiniCard icon={CheckCircle} label="Convertidas" value={recipientStats.accepted} color="text-emerald-400" />
          </div>

          {/* Top combos */}
          <div className="glass-card rounded-2xl p-5">
            <h3 className="font-semibold text-foreground mb-3">Serviços mais vendidos juntos</h3>
            {stats.topCombos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum dado ainda. As métricas aparecerão após as primeiras conversões.</p>
            ) : (
              <div className="space-y-2">
                {stats.topCombos.map((combo, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-foreground">{combo.source}</span>
                      <span className="text-accent">+</span>
                      <span className="font-medium text-accent">{combo.rec}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold text-foreground">{combo.count}x</span>
                      <span className="text-xs text-muted-foreground ml-2">R$ {combo.revenue.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent recipients */}
          <div className="glass-card rounded-2xl p-5">
            <h3 className="font-semibold text-foreground mb-3">Últimas ofertas enviadas</h3>
            {(recipients || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma oferta enviada ainda.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {(recipients || []).slice(0, 20).map(r => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">{r.client_phone || "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.message_payload?.slice(0, 60)}...</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

const StatCard = ({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) => (
  <div className="glass-card rounded-xl p-4">
    <div className="flex items-center gap-2 mb-2">
      <Icon size={16} className={color} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
    <p className="text-xl font-bold text-foreground">{value}</p>
  </div>
);

const MiniCard = ({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) => (
  <div className="glass-card rounded-xl p-3 text-center">
    <Icon size={14} className={`${color} mx-auto mb-1`} />
    <p className="text-lg font-bold text-foreground">{value}</p>
    <p className="text-[11px] text-muted-foreground">{label}</p>
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const config: Record<string, { label: string; className: string }> = {
    pending: { label: "Pendente", className: "bg-yellow-500/10 text-yellow-500" },
    sent: { label: "Enviada", className: "bg-blue-500/10 text-blue-500" },
    delivered: { label: "Entregue", className: "bg-sky-500/10 text-sky-500" },
    accepted: { label: "Convertida", className: "bg-emerald-500/10 text-emerald-500" },
    rejected: { label: "Rejeitada", className: "bg-red-500/10 text-red-500" },
  };
  const c = config[status] || { label: status, className: "bg-muted text-muted-foreground" };
  return <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${c.className}`}>{c.label}</span>;
};

export default UpsellDashboard;
