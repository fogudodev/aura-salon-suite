import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import {
  DollarSign, Users, TrendingUp, AlertTriangle,
  RefreshCw, Loader2, Flame, Thermometer, Snowflake,
  Plus, Send, Eye, CheckCircle2, XCircle, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useReactivationMetrics,
  useEligibleClients,
  useComputeScores,
  useReactivationCampaigns,
  useCreateReactivationCampaign,
  useExecuteReactivationCampaign,
  type ReactivationClient,
} from "@/hooks/useReactivation";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const scoreLabel = (score: number) => {
  if (score >= 80) return { label: "Hot", color: "text-red-500", icon: Flame, bg: "bg-red-500/10" };
  if (score >= 50) return { label: "Warm", color: "text-amber-500", icon: Thermometer, bg: "bg-amber-500/10" };
  return { label: "Cold", color: "text-blue-400", icon: Snowflake, bg: "bg-blue-400/10" };
};

const statusLabels: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  at_risk: "Em risco",
  lost: "Perdido",
};

const campaignStatusLabels: Record<string, string> = {
  draft: "Rascunho",
  running: "Enviando",
  completed: "Concluída",
};

const campaignStatusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  running: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

const Reactivation = () => {
  const { data: metrics, isLoading: loadingMetrics } = useReactivationMetrics();
  const { data: eligible, isLoading: loadingEligible } = useEligibleClients();
  const { data: campaigns, isLoading: loadingCampaigns } = useReactivationCampaigns();
  const computeScores = useComputeScores();
  const createCampaign = useCreateReactivationCampaign();
  const executeCampaign = useExecuteReactivationCampaign();

  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState(
    "Oi {nome}, faz um tempo que você não vem aqui 😢\nEssa semana temos um horário especial pra você! Quer agendar?"
  );
  const [minScore, setMinScore] = useState([50]);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);

  const filteredEligible = (eligible || []).filter(c => c.reactivation_score >= minScore[0]);

  const handleCreate = async () => {
    if (!name.trim() || !template.trim()) {
      toast.error("Preencha nome e mensagem");
      return;
    }
    const ids = selectedClients.length > 0 ? selectedClients : filteredEligible.map(c => c.id);
    if (ids.length === 0) {
      toast.error("Nenhum cliente selecionado");
      return;
    }
    await createCampaign.mutateAsync({
      name: name.trim(),
      message_template: template.trim(),
      segment_filter: { min_score: minScore[0] },
      clientIds: ids,
    });
    setShowNewCampaign(false);
    setName("");
    setSelectedClients([]);
  };

  return (
    <DashboardLayout title="Reativação Inteligente" subtitle="Recupere clientes inativos com campanhas via WhatsApp">
      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: "Receita Recuperada",
            value: metrics ? `R$ ${metrics.revenue.toFixed(2)}` : "—",
            icon: DollarSign,
            color: "text-emerald-500",
          },
          {
            label: "Clientes Reativados",
            value: metrics?.converted ?? "—",
            icon: CheckCircle2,
            color: "text-accent",
          },
          {
            label: "Taxa de Conversão",
            value: metrics ? `${metrics.conversionRate}%` : "—",
            icon: TrendingUp,
            color: "text-blue-500",
          },
          {
            label: "Clientes em Risco",
            value: metrics?.atRiskCount ?? "—",
            icon: AlertTriangle,
            color: "text-amber-500",
          },
        ].map((m, i) => (
          <motion.div
            key={m.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card rounded-2xl p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">{m.label}</span>
              <m.icon size={16} className={m.color} />
            </div>
            <p className="text-2xl font-bold text-foreground">{loadingMetrics ? "..." : m.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-6">
        <Button
          variant="outline"
          onClick={() => computeScores.mutate()}
          disabled={computeScores.isPending}
          className="rounded-2xl gap-2"
        >
          {computeScores.isPending ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Recalcular Scores
        </Button>
        <Button onClick={() => setShowNewCampaign(true)} className="rounded-2xl gap-2">
          <Plus size={16} /> Nova Campanha de Reativação
        </Button>
      </div>

      {/* Campaigns list */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-3">Campanhas de Reativação</h2>
        {loadingCampaigns ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : !campaigns?.length ? (
          <div className="glass-card rounded-2xl p-8 text-center">
            <Send size={32} className="mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground text-sm">Nenhuma campanha de reativação ainda</p>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c: any, i: number) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="glass-card rounded-2xl p-5"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-foreground">{c.name}</h3>
                  <div className="flex items-center gap-2">
                    <Badge className={cn("text-xs", campaignStatusColors[c.status])}>
                      {campaignStatusLabels[c.status] || c.status}
                    </Badge>
                    {c.status === "draft" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => executeCampaign.mutate(c.id)}
                        disabled={executeCampaign.isPending}
                        className="rounded-xl gap-1 text-xs"
                      >
                        <Send size={12} /> Executar
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{c.message_template}</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span><Users size={12} className="inline mr-1" />{c.total_recipients} destinatários</span>
                  <span><CheckCircle2 size={12} className="inline mr-1 text-emerald-500" />{c.sent_count} enviados</span>
                  {(c.converted_count || 0) > 0 && (
                    <span><TrendingUp size={12} className="inline mr-1 text-accent" />{c.converted_count} convertidos</span>
                  )}
                  {(c.revenue_generated || 0) > 0 && (
                    <span><DollarSign size={12} className="inline mr-1 text-emerald-500" />R$ {Number(c.revenue_generated).toFixed(2)}</span>
                  )}
                  {c.created_at && (
                    <span>{format(new Date(c.created_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Eligible clients */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">Clientes Elegíveis para Reativação</h2>
        {loadingEligible ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : !eligible?.length ? (
          <div className="glass-card rounded-2xl p-8 text-center">
            <Users size={32} className="mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground text-sm">Nenhum cliente elegível. Clique em "Recalcular Scores" para atualizar.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {eligible.map((c) => {
              const s = scoreLabel(c.reactivation_score);
              const Icon = s.icon;
              return (
                <div key={c.id} className="glass-card rounded-xl p-4 flex items-center gap-4">
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", s.bg)}>
                    <Icon size={18} className={s.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.last_completed_appointment_at
                        ? `Última visita: ${format(new Date(c.last_completed_appointment_at), "dd/MM/yyyy", { locale: ptBR })}`
                        : "Sem visitas"}
                      {c.avg_return_interval_days ? ` • Retorno a cada ${c.avg_return_interval_days} dias` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cn("text-lg font-bold", s.color)}>{c.reactivation_score}</p>
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {statusLabels[c.reactivation_status] || c.reactivation_status}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Campaign Dialog */}
      <Dialog open={showNewCampaign} onOpenChange={setShowNewCampaign}>
        <DialogContent className="max-w-lg bg-background border-border">
          <DialogHeader>
            <DialogTitle>Nova Campanha de Reativação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Nome da campanha *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Reativação Janeiro" />
            </div>
            <div className="space-y-2">
              <Label>Mensagem *</Label>
              <Textarea
                value={template}
                onChange={e => setTemplate(e.target.value)}
                rows={4}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Variáveis: {"{nome}"}, {"{servico}"}, {"{tempo_sem_visita}"}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Score mínimo: {minScore[0]}</Label>
              <Slider value={minScore} onValueChange={setMinScore} min={0} max={100} step={5} />
              <p className="text-xs text-muted-foreground">{filteredEligible.length} clientes elegíveis</p>
            </div>

            {filteredEligible.length > 0 && (
              <div className="space-y-2">
                <Label>Selecionar clientes (vazio = todos elegíveis)</Label>
                <div className="max-h-40 overflow-y-auto space-y-1 bg-muted/30 rounded-xl p-2">
                  {filteredEligible.map(c => {
                    const s = scoreLabel(c.reactivation_score);
                    return (
                      <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50 cursor-pointer text-sm">
                        <Checkbox
                          checked={selectedClients.includes(c.id)}
                          onCheckedChange={(checked) =>
                            setSelectedClients(prev =>
                              checked ? [...prev, c.id] : prev.filter(id => id !== c.id)
                            )
                          }
                        />
                        <span className="text-foreground">{c.name}</span>
                        <span className={cn("text-xs font-bold ml-auto", s.color)}>{c.reactivation_score}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <Button
              onClick={handleCreate}
              disabled={createCampaign.isPending || !name.trim() || !template.trim()}
              className="w-full rounded-2xl gap-2"
            >
              {createCampaign.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Criar Campanha ({selectedClients.length > 0 ? selectedClients.length : filteredEligible.length} clientes)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Reactivation;
