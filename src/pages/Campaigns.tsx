import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  ArrowUpRight,
  BarChart3,
  Clock3,
  Copy,
  Loader2,
  Megaphone,
  Plus,
  Sparkles,
  Target,
  Wand2,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { CampaignStatusBadge } from "@/components/campaigns/CampaignStatusBadge";
import { CampaignTemplateLibraryDialog } from "@/components/campaigns/CampaignTemplateLibraryDialog";
import { CampaignWizardDialog } from "@/components/campaigns/CampaignWizardDialog";
import { LisOpportunityCard } from "@/components/campaigns/LisOpportunityCard";
import {
  useCancelWhatsAppCampaign,
  useCloneWhatsAppCampaign,
  useGenerateLisOpportunities,
  useLisOpportunityAction,
  usePauseWhatsAppCampaign,
  useRunActiveCampaignAutomations,
  useRunCampaignAutomation,
  useSaveCampaignAutomation,
  useSaveWhatsAppCampaignDraft,
  useStartWhatsAppCampaign,
  useToggleCampaignAutomation,
  useWhatsAppCampaignDetails,
  useWhatsAppCampaignsDashboard,
} from "@/hooks/useWhatsAppCampaigns";
import type { CampaignAutomation, CampaignSummary, CampaignTemplate, CampaignWizardForm, LisOpportunity } from "@/types/whatsapp-campaigns";

const defaultCampaignForm: CampaignWizardForm = {
  name: "",
  type: "manual",
  objective: "reativacao",
  audienceType: "inativos",
  audienceFilterJson: { audienceType: "inativos", inactiveDays: 45, consentOnly: true },
  audienceEstimateJson: {},
  messageMode: "hybrid",
  messageBody: "",
  ctaType: "booking_link",
  ctaPayloadJson: { bookingLink: "https://gende.io" },
  sendConfigJson: {},
};

const automationPresets = [
  { name: "Reativacao 45 dias", triggerType: "inactive_clients", objective: "reativacao", audienceType: "inativos", audienceFilterJson: { audienceType: "inativos", inactiveDays: 45, consentOnly: true }, messageBody: "Oi, {nome}. Faz tempo desde sua ultima visita. Se quiser voltar, seu link esta aqui: {link_agendamento}", cooldownDays: 7, autoStart: false, isActive: true },
  { name: "Agenda ociosa amanha", triggerType: "idle_slots", objective: "preenchimento_agenda", audienceType: "oportunidade_agenda", audienceFilterJson: { audienceType: "oportunidade_agenda", turn: "tarde", consentOnly: true }, messageBody: "Oi, {nome}. Abrimos horario para amanha e queria te priorizar: {link_agendamento}", cooldownDays: 2, autoStart: false, isActive: true },
  { name: "Manutencao inteligente", triggerType: "maintenance_window", objective: "manutencao", audienceType: "janela_manutencao", audienceFilterJson: { audienceType: "janela_manutencao", maintenanceWindowDays: 7, consentOnly: true }, messageBody: "Oi, {nome}. Voce entrou na janela ideal de manutencao de {servico}: {link_agendamento}", cooldownDays: 5, autoStart: false, isActive: true },
];

const money = (value: number) => `R$ ${Number(value || 0).toFixed(0)}`;
const dt = (value?: string | null, pattern = "dd/MM HH:mm") => (value ? format(new Date(value), pattern, { locale: ptBR }) : "nunca");

const mapCampaignToForm = (campaign: CampaignSummary): CampaignWizardForm => ({
  id: campaign.id,
  sourceOpportunityId: campaign.source_opportunity?.id || null,
  name: campaign.name,
  type: campaign.type as CampaignWizardForm["type"],
  objective: campaign.objective as CampaignWizardForm["objective"],
  audienceType: campaign.audience_type as CampaignWizardForm["audienceType"],
  audienceFilterJson: campaign.audience_filter_json || {},
  audienceEstimateJson: campaign.audience_estimate_json || {},
  messageMode: campaign.message_mode as CampaignWizardForm["messageMode"],
  templateId: campaign.template?.id || campaign.template_id,
  templateName: campaign.template?.name || campaign.template_name,
  messageBody: campaign.message_body,
  ctaType: campaign.cta_type as CampaignWizardForm["ctaType"],
  ctaPayloadJson: campaign.cta_payload_json || {},
  sendConfigJson: campaign.send_config_json || {},
  scheduledAt: campaign.scheduled_at,
});

const lastAutomationResult = (automation: CampaignAutomation) => {
  const status = String(automation.last_result_json?.status || "");
  const reason = String(automation.last_result_json?.reason || automation.last_result_json?.error || "");
  if (!status) return { label: "Sem execucao", detail: "Ainda nao houve execucao registrada.", tone: "text-[#8a7b6d]" };
  if (status === "completed") return { label: "Execucao concluida", detail: "Campanha gerada com publico elegivel.", tone: "text-emerald-700" };
  if (status === "skipped") return { label: "Execucao pulada", detail: reason || "Sem publico elegivel.", tone: "text-amber-700" };
  if (status === "failed") return { label: "Execucao com erro", detail: reason || "Falha operacional.", tone: "text-rose-700" };
  return { label: status, detail: reason || "Resultado operacional registrado.", tone: "text-[#8a7b6d]" };
};

const Campaigns = () => {
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const highlightedOpportunityId = params.get("opportunity");

  const dashboard = useWhatsAppCampaignsDashboard();
  const saveDraft = useSaveWhatsAppCampaignDraft();
  const cloneCampaign = useCloneWhatsAppCampaign();
  const startCampaign = useStartWhatsAppCampaign();
  const pauseCampaign = usePauseWhatsAppCampaign();
  const cancelCampaign = useCancelWhatsAppCampaign();
  const generateLis = useGenerateLisOpportunities();
  const opportunityAction = useLisOpportunityAction();
  const saveAutomation = useSaveCampaignAutomation();
  const toggleAutomation = useToggleCampaignAutomation();
  const runAutomation = useRunCampaignAutomation();
  const runAutomations = useRunActiveCampaignAutomations();

  const [wizardOpen, setWizardOpen] = useState(false);
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false);
  const [selectedOpportunity, setSelectedOpportunity] = useState<LisOpportunity | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<CampaignWizardForm | null>(null);
  const [togglingAutomationId, setTogglingAutomationId] = useState<string | null>(null);
  const [runningAutomationId, setRunningAutomationId] = useState<string | null>(null);
  const campaignDetails = useWhatsAppCampaignDetails(selectedCampaignId);

  const templates = dashboard.data?.templates || [];
  const metrics = dashboard.data?.metrics;
  const limits = dashboard.data?.limits;
  const opportunities = dashboard.data?.opportunities || [];
  const automations = dashboard.data?.automations || [];
  const automationRuns = dashboard.data?.automationRuns || [];
  const campaigns = dashboard.data?.campaigns || [];
  const comparatives = dashboard.data?.comparatives;

  if (dashboard.isLoading) {
    return <DashboardLayout title="Campanhas Inteligentes" subtitle="Carregando modulo de campanhas..."><div className="flex min-h-[50vh] items-center justify-center text-[#6b5a4a]"><Loader2 size={18} className="mr-2 animate-spin" />Carregando radar e campanhas...</div></DashboardLayout>;
  }

  if (dashboard.error) {
    return (
      <DashboardLayout title="Campanhas Inteligentes" subtitle="Nao foi possivel carregar o modulo.">
        <div className="rounded-[28px] border border-[#eadfce] bg-white p-8 text-center">
          <p className="text-lg font-semibold text-[#3d2c1e]">Erro ao carregar campanhas.</p>
          <p className="mt-2 text-sm text-[#6b5a4a]">Verifique a conexao e tente novamente.</p>
          <Button variant="outline" className="mt-5 rounded-2xl border-[#eadfce]" onClick={() => dashboard.refetch()}>Recarregar</Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Campanhas Inteligentes" subtitle="Radar da Lis para gerar receita, recuperar clientes e preencher agenda.">
      <div className="space-y-6">
        <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="rounded-[32px] border border-[#eadfce] bg-[linear-gradient(135deg,#fffdf9,#fdf6ee)] p-6 shadow-[0_30px_90px_-60px_rgba(61,44,30,0.24)] sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#f5dcc3] px-4 py-2 text-sm font-semibold text-[#d4a84b]"><Sparkles size={15} />Lis Radar de Faturamento</div>
              <h2 className="text-3xl font-black leading-[1.02] tracking-[-0.05em] text-[#3d2c1e] sm:text-4xl">Use seu WhatsApp como canal de crescimento com dados reais.</h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[#6b5a4a]">Aqui voce ve o que e estimado (draft/sugestao) e o que ja virou resultado real (envio, agendamento e receita).</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => { setEditingCampaign(defaultCampaignForm); setWizardOpen(true); }} className="rounded-2xl bg-[#eebf9c] text-[#3d2c1e] hover:bg-[#d4a84b]"><Plus size={16} className="mr-2" />Nova campanha</Button>
              <Button variant="outline" onClick={() => setTemplateLibraryOpen(true)} className="rounded-2xl border-[#eadfce] bg-white"><Wand2 size={16} className="mr-2" />Biblioteca de mensagens</Button>
              <Button variant="outline" onClick={async () => { try { await generateLis.mutateAsync(); toast.success("Radar da Lis atualizado."); } catch (e) { toast.error("Falha ao atualizar radar."); console.error(e); } }} disabled={generateLis.isPending} className="rounded-2xl border-[#eadfce] bg-white">{generateLis.isPending ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Sparkles size={16} className="mr-2" />}Atualizar radar da Lis</Button>
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Rascunhos", value: metrics?.drafts || 0, detail: "estimado", icon: Megaphone, real: false },
              { label: "Pipeline", value: money(metrics?.estimatedPipelineRevenue || 0), detail: "estimado", icon: Target, real: false },
              { label: "Enviadas", value: metrics?.sentCount || 0, detail: "real", icon: ArrowUpRight, real: true },
              { label: "Agendamentos", value: metrics?.bookingCount || 0, detail: "real", icon: Clock3, real: true },
              { label: "Receita", value: money(metrics?.revenueGenerated || 0), detail: "real", icon: BarChart3, real: true },
            ].map((item) => (
              <div key={item.label} className="rounded-[24px] border border-[#eadfce] bg-white/90 p-5">
                <div className="flex items-center justify-between"><p className="text-sm font-medium text-[#8a7b6d]">{item.label}</p><item.icon size={16} className="text-[#d4a84b]" /></div>
                <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[#3d2c1e]">{item.value}</p>
                <div className="mt-2 flex items-center justify-between"><p className="text-xs text-[#8a7b6d]">{item.real ? "Resultado operacional" : "Projecao comercial"}</p><Badge variant="outline" className={item.real ? "border-emerald-200 text-emerald-700" : "border-amber-200 text-amber-700"}>{item.detail}</Badge></div>
              </div>
            ))}
          </div>
        </motion.section>

        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <section className="space-y-4">
            <div><h3 className="text-xl font-bold text-[#3d2c1e]">Radar da Lis</h3><p className="text-sm text-[#6b5a4a]">Oportunidades com publico, conversao e impacto financeiro estimado.</p></div>
            {!opportunities.length ? <div className="rounded-[28px] border border-dashed border-[#eadfce] bg-white p-8 text-center"><Sparkles size={28} className="mx-auto mb-3 text-[#d4a84b]" /><p className="text-lg font-semibold text-[#3d2c1e]">Nenhuma oportunidade ativa.</p><p className="mt-2 text-sm text-[#6b5a4a]">Atualize o radar para detectar novas oportunidades.</p></div> : opportunities.map((opportunity) => (
              <LisOpportunityCard
                key={opportunity.id}
                opportunity={opportunity}
                highlighted={highlightedOpportunityId === opportunity.id}
                busy={opportunityAction.isPending}
                onView={async () => { try { setSelectedOpportunity(opportunity); await opportunityAction.mutateAsync({ opportunityId: opportunity.id, kind: "opened_details" }); } catch (e) { toast.error("Nao foi possivel abrir os detalhes."); console.error(e); } }}
                onDismiss={async () => { try { await opportunityAction.mutateAsync({ opportunityId: opportunity.id, kind: "dismissed" }); toast.success("Oportunidade ignorada."); } catch (e) { toast.error("Falha ao ignorar oportunidade."); console.error(e); } }}
                onRemindLater={async () => { try { await opportunityAction.mutateAsync({ opportunityId: opportunity.id, kind: "remind_later" }); toast.success("A Lis vai lembrar depois."); } catch (e) { toast.error("Falha ao adiar lembrete."); console.error(e); } }}
                onGenerateDraft={async () => { try { const result = await opportunityAction.mutateAsync({ opportunityId: opportunity.id, kind: "generate_campaign" }); const created = result?.campaign as CampaignSummary | undefined; toast.success("Campanha criada pela Lis."); if (created) { setEditingCampaign(mapCampaignToForm(created)); setWizardOpen(true); } } catch (e) { toast.error("Falha ao gerar campanha."); console.error(e); } }}
              />
            ))}
          </section>
          <section className="space-y-4">
            <div className="rounded-[28px] border border-[#eadfce] bg-white p-6"><h3 className="text-lg font-bold text-[#3d2c1e]">Limites de envio</h3><p className="text-sm text-[#6b5a4a]">Controle de volume para manter boa reputacao no WhatsApp.</p><div className="mt-4 space-y-3 text-sm text-[#6b5a4a]"><p>Plano: <span className="font-semibold text-[#3d2c1e]">{limits?.planId || "sem plano"}</span></p><p>Campanhas hoje: <span className="font-semibold text-[#3d2c1e]">{limits?.usage.campaigns_sent || 0}</span></p><p>Contatos por campanha: <span className="font-semibold text-[#3d2c1e]">{limits?.limits.campaign_max_contacts === -1 ? "∞" : (limits?.limits.campaign_max_contacts || 0) + (limits?.extras.extra_contacts || 0)}</span></p></div></div>
            <div className="rounded-[28px] border border-[#eadfce] bg-white p-6"><div className="flex items-center justify-between"><h3 className="text-lg font-bold text-[#3d2c1e]">Modelos</h3><Button variant="ghost" onClick={() => setTemplateLibraryOpen(true)}>Ver todos</Button></div>{templates.length === 0 ? <p className="mt-3 text-sm text-[#8a7b6d]">Nenhum template ativo.</p> : <div className="mt-3 space-y-2">{templates.slice(0, 3).map((template) => <button key={template.id} type="button" onClick={() => { setEditingCampaign({ ...defaultCampaignForm, templateId: template.id, templateName: template.name, objective: template.objective as CampaignWizardForm["objective"], messageBody: template.body, messageMode: "hybrid" }); setWizardOpen(true); }} className="w-full rounded-2xl border border-[#eadfce] bg-[#fffdfa] p-3 text-left"><p className="font-semibold text-[#3d2c1e]">{template.name}</p><p className="text-xs text-[#8a7b6d] line-clamp-2">{template.body}</p></button>)}</div>}</div>
          </section>
        </div>

        <section className="rounded-[30px] border border-[#eadfce] bg-white p-6 sm:p-8">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><h3 className="text-2xl font-bold text-[#3d2c1e]">Automacoes</h3><p className="text-sm text-[#6b5a4a]">Status, ultima execucao e erro visivel na mesma tela.</p></div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" className="rounded-2xl border-[#eadfce]" onClick={async () => { try { await runAutomations.mutateAsync({ limit: 20 }); toast.success("Varredura executada."); } catch (e) { toast.error("Falha ao rodar automacoes."); console.error(e); } }} disabled={runAutomations.isPending}>{runAutomations.isPending ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Sparkles size={14} className="mr-2" />}Rodar automacoes</Button>
              {!automations.length && <Button className="rounded-2xl bg-[#eebf9c] text-[#3d2c1e] hover:bg-[#d4a84b]" onClick={async () => { try { for (const preset of automationPresets) await saveAutomation.mutateAsync(preset); toast.success("Automacoes base criadas."); } catch (e) { toast.error("Falha ao criar automacoes base."); console.error(e); } }} disabled={saveAutomation.isPending}>{saveAutomation.isPending ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Plus size={14} className="mr-2" />}Criar base</Button>}
            </div>
          </div>
          {!automations.length ? <div className="rounded-[24px] border border-dashed border-[#eadfce] bg-[#fffdfa] p-8 text-center"><Clock3 size={28} className="mx-auto mb-3 text-[#d4a84b]" /><p className="text-lg font-semibold text-[#3d2c1e]">Nenhuma automacao configurada.</p></div> : <div className="grid gap-4 lg:grid-cols-2">{automations.map((automation) => { const result = lastAutomationResult(automation); const toggling = togglingAutomationId === automation.id; const running = runningAutomationId === automation.id; return <div key={automation.id} className="rounded-[24px] border border-[#eadfce] bg-[#fffdfa] p-5"><div className="flex items-start justify-between"><div><p className="text-lg font-bold text-[#3d2c1e]">{automation.name}</p><p className="text-xs uppercase tracking-[0.12em] text-[#a67a44]">{automation.trigger_type} • {automation.objective}</p></div><div className="flex items-center gap-2"><Badge variant="outline" className={automation.is_active ? "border-emerald-200 text-emerald-700" : "border-slate-200 text-slate-600"}>{automation.is_active ? "Ativa" : "Inativa"}</Badge><Switch checked={automation.is_active} onCheckedChange={async (checked) => { setTogglingAutomationId(automation.id); try { await toggleAutomation.mutateAsync({ automationId: automation.id, isActive: checked }); } finally { setTogglingAutomationId(null); } }} disabled={toggling} /></div></div><p className="mt-2 text-sm text-[#6b5a4a] line-clamp-2">{automation.message_body || "Sem mensagem personalizada."}</p><div className="mt-3 rounded-xl border border-[#eadfce] bg-white px-3 py-2"><p className={`text-xs font-semibold ${result.tone}`}>{result.label}</p><p className="mt-1 text-xs text-[#6b5a4a]">{result.detail}</p><p className="mt-1 text-xs text-[#8a7b6d]">Ultima execucao: {dt(automation.last_run_at)}</p></div><div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" className="rounded-2xl border-[#eadfce]" onClick={async () => { setRunningAutomationId(automation.id); try { await runAutomation.mutateAsync({ automationId: automation.id }); toast.success("Automacao executada."); } catch (e) { toast.error("Falha ao executar automacao."); console.error(e); } finally { setRunningAutomationId(null); } }} disabled={running}>{running ? <Loader2 size={14} className="mr-2 animate-spin" /> : <ArrowUpRight size={14} className="mr-2" />}Executar agora</Button>{automation.auto_start ? <Badge variant="outline">Auto-start</Badge> : <Badge variant="outline">Com aprovacao</Badge>}</div></div>; })}</div>}
          {automationRuns.length > 0 && <div className="mt-4 rounded-[24px] border border-[#eadfce] bg-[#fffdfa] p-5"><p className="text-sm font-semibold text-[#3d2c1e]">Ultimas execucoes</p><div className="mt-3 space-y-2">{automationRuns.slice(0, 8).map((run) => <div key={run.id} className="rounded-xl bg-[#fdf8f3] px-3 py-2 text-xs"><div className="flex items-center justify-between"><span className="text-[#6b5a4a]">{run.automation?.name || "Automacao"}</span><span className={run.status === "failed" ? "text-rose-600" : run.status === "skipped" ? "text-amber-600" : "text-[#8a7b6d]"}>{run.status}</span><span className="text-[#8a7b6d]">{dt(run.started_at)}</span></div>{run.error_message && <p className="mt-1 text-rose-600">{run.error_message}</p>}</div>)}</div></div>}
        </section>

        <section className="rounded-[30px] border border-[#eadfce] bg-white p-6 sm:p-8">
          <h3 className="text-2xl font-bold text-[#3d2c1e]">Comparativos e funil</h3>
          <p className="text-sm text-[#6b5a4a]">Leitura real de objetivo, segmento, horario e funil Lis → campanha → resultado.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><div className="rounded-2xl bg-[#fdf8f3] p-4"><p className="text-xs text-[#8a7b6d]">Oportunidades</p><p className="mt-1 text-2xl font-bold text-[#3d2c1e]">{comparatives?.lisFunnel?.opportunities_detected || 0}</p></div><div className="rounded-2xl bg-[#fdf8f3] p-4"><p className="text-xs text-[#8a7b6d]">Campanhas Lis</p><p className="mt-1 text-2xl font-bold text-[#3d2c1e]">{comparatives?.lisFunnel?.campaigns_generated || 0}</p></div><div className="rounded-2xl bg-[#fdf8f3] p-4"><p className="text-xs text-[#8a7b6d]">Agendamentos</p><p className="mt-1 text-2xl font-bold text-[#3d2c1e]">{comparatives?.lisFunnel?.bookings_generated || 0}</p></div><div className="rounded-2xl bg-[#fdf8f3] p-4"><p className="text-xs text-[#8a7b6d]">Receita</p><p className="mt-1 text-2xl font-bold text-[#3d2c1e]">{money(comparatives?.lisFunnel?.revenue_generated || 0)}</p></div></div>
        </section>

        <section className="rounded-[30px] border border-[#eadfce] bg-white p-6 sm:p-8">
          <div className="mb-5 flex items-end justify-between"><div><h3 className="text-2xl font-bold text-[#3d2c1e]">Campanhas e rascunhos</h3><p className="text-sm text-[#6b5a4a]">Dados estimados para draft/scheduled e dados reais para campanhas executadas.</p></div><Button onClick={() => { setEditingCampaign(defaultCampaignForm); setWizardOpen(true); }} className="rounded-2xl bg-[#3d2c1e] hover:bg-[#2b1f15]"><Plus size={16} className="mr-2" />Criar campanha</Button></div>
          {!campaigns.length ? <div className="rounded-[24px] border border-dashed border-[#eadfce] bg-[#fffdfa] p-8 text-center"><Megaphone size={28} className="mx-auto mb-3 text-[#d4a84b]" /><p className="text-lg font-semibold text-[#3d2c1e]">Nenhuma campanha criada.</p></div> : <div className="grid gap-4">{campaigns.map((campaign) => { const estimate = campaign.audience_estimate_json || {}; const op = campaign.operational_metrics || { recipientCount: 0, sentCount: 0, deliveredCount: 0, readCount: 0, clickCount: 0, replyCount: 0, bookingCount: 0, failureCount: 0, revenueGenerated: 0 }; const estimated = ["draft", "scheduled"].includes(campaign.status); return <div key={campaign.id} className="rounded-[24px] border border-[#eadfce] bg-[#fffdfa] p-5"><div className="flex flex-wrap items-center gap-2"><CampaignStatusBadge status={campaign.status} /><Badge variant="outline">{campaign.objective}</Badge><Badge variant="outline" className={estimated ? "border-amber-200 text-amber-700" : "border-emerald-200 text-emerald-700"}>{estimated ? "estimado" : "real"}</Badge></div><h4 className="mt-2 text-lg font-bold text-[#3d2c1e]">{campaign.name}</h4><p className="mt-2 text-sm text-[#6b5a4a] line-clamp-2">{campaign.message_body}</p><div className="mt-3 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-[#fdf8f3] p-3 text-xs"><p className="text-[#8a7b6d]">Publico</p><p className="mt-1 text-xl font-bold text-[#3d2c1e]">{estimated ? Number(estimate.audienceCount || 0) : Number(op.recipientCount || 0)}</p></div><div className="rounded-2xl bg-[#fdf8f3] p-3 text-xs"><p className="text-[#8a7b6d]">{estimated ? "Conversao" : "Respostas"}</p><p className="mt-1 text-xl font-bold text-[#3d2c1e]">{estimated ? `${Math.round(Number(estimate.estimatedConversionRate || 0) * 100)}%` : Number(op.replyCount || 0)}</p></div><div className="rounded-2xl bg-[#fdf8f3] p-3 text-xs"><p className="text-[#8a7b6d]">Receita</p><p className="mt-1 text-xl font-bold text-[#3d2c1e]">{money(estimated ? Number(estimate.estimatedRevenue || 0) : Number(op.revenueGenerated || 0))}</p></div></div>{!estimated && <div className="mt-3 rounded-2xl border border-[#eadfce] bg-white p-3 text-xs text-[#6b5a4a]">Funil: {op.sentCount} enviado • {op.deliveredCount} entregue • {op.readCount} lido • {op.replyCount} respondeu • {op.clickCount} clicou • {op.bookingCount} agendou</div>}<div className="mt-4 flex flex-wrap gap-2">{["draft", "scheduled", "paused"].includes(campaign.status) && <Button className="rounded-2xl bg-[#eebf9c] text-[#3d2c1e] hover:bg-[#d4a84b]" onClick={async () => { try { await startCampaign.mutateAsync({ campaignId: campaign.id }); toast.success("Envio iniciado."); } catch (e) { toast.error("Falha ao iniciar envio."); console.error(e); } }}><ArrowUpRight size={14} className="mr-2" />{campaign.status === "paused" ? "Retomar" : "Iniciar envio"}</Button>}{campaign.status === "processing" && <Button variant="outline" className="rounded-2xl border-[#eadfce]" onClick={async () => { try { await pauseCampaign.mutateAsync({ campaignId: campaign.id, reason: "manual_pause" }); toast.success("Campanha pausada."); } catch (e) { toast.error("Falha ao pausar campanha."); console.error(e); } }}><Clock3 size={14} className="mr-2" />Pausar</Button>}{!["cancelled", "completed"].includes(campaign.status) && <Button variant="ghost" className="rounded-2xl text-[#8a7b6d]" onClick={async () => { try { await cancelCampaign.mutateAsync({ campaignId: campaign.id, reason: "manual_cancel" }); toast.success("Campanha cancelada."); } catch (e) { toast.error("Falha ao cancelar campanha."); console.error(e); } }}>Cancelar</Button>}<Button variant="outline" className="rounded-2xl border-[#eadfce]" onClick={() => { setEditingCampaign(mapCampaignToForm(campaign)); setWizardOpen(true); }}><ArrowUpRight size={14} className="mr-2" />Continuar edicao</Button><Button variant="ghost" className="rounded-2xl" onClick={async () => { try { await cloneCampaign.mutateAsync(campaign.id); toast.success("Campanha duplicada."); } catch (e) { toast.error("Falha ao duplicar campanha."); console.error(e); } }}><Copy size={14} className="mr-2" />Duplicar</Button><Button variant="ghost" className="rounded-2xl" onClick={() => setSelectedCampaignId(campaign.id)}>Ver resultados</Button></div></div>; })}</div>}
        </section>
      </div>

      <CampaignWizardDialog
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        initialValue={editingCampaign}
        templates={templates}
        onSubmit={async (form) => {
          try {
            await saveDraft.mutateAsync(form);
            toast.success(form.id ? "Campanha atualizada." : "Rascunho salvo.");
            setWizardOpen(false);
          } catch (error) {
            toast.error("Nao foi possivel salvar a campanha.");
            console.error("save campaign error:", error);
          }
        }}
        submitting={saveDraft.isPending}
      />
      <CampaignTemplateLibraryDialog open={templateLibraryOpen} onOpenChange={setTemplateLibraryOpen} templates={templates} onUseTemplate={(template) => { setEditingCampaign({ ...defaultCampaignForm, templateId: template.id, templateName: template.name, objective: template.objective as CampaignWizardForm["objective"], messageBody: template.body, messageMode: "hybrid" }); setWizardOpen(true); }} />

      <Dialog open={!!selectedOpportunity} onOpenChange={(open) => !open && setSelectedOpportunity(null)}>
        <DialogContent className="rounded-[28px] border-[#eadfce] bg-[#fffdf9] sm:max-w-[760px]">
          <DialogHeader><DialogTitle className="text-2xl font-bold text-[#3d2c1e]">{selectedOpportunity?.title}</DialogTitle></DialogHeader>
          {selectedOpportunity && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-[#fdf8f3] p-3"><p className="text-xs text-[#8a7b6d]">Publico</p><p className="mt-1 text-2xl font-bold text-[#3d2c1e]">{selectedOpportunity.audience_count}</p></div><div className="rounded-2xl bg-[#fdf8f3] p-3"><p className="text-xs text-[#8a7b6d]">Conversao</p><p className="mt-1 text-2xl font-bold text-[#3d2c1e]">{Math.round(selectedOpportunity.estimated_conversion_rate * 100)}%</p></div><div className="rounded-2xl bg-[#fdf8f3] p-3"><p className="text-xs text-[#8a7b6d]">Receita</p><p className="mt-1 text-2xl font-bold text-[#3d2c1e]">{money(selectedOpportunity.estimated_revenue)}</p></div></div><div className="rounded-2xl border border-[#eadfce] bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#a67a44]">Motivo</p><p className="mt-2 text-sm text-[#6b5a4a]">{selectedOpportunity.reason}</p></div></div>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedCampaignId} onOpenChange={(open) => !open && setSelectedCampaignId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[28px] border-[#eadfce] bg-[#fffdf9] sm:max-w-[920px]">
          <DialogHeader><DialogTitle className="text-2xl font-bold text-[#3d2c1e]">{campaignDetails.data?.campaign?.name || "Resultados da campanha"}</DialogTitle></DialogHeader>
          {campaignDetails.isLoading ? <div className="flex items-center gap-2 py-8 text-sm text-[#8a7b6d]"><Loader2 size={16} className="animate-spin" />Carregando resultados...</div> : campaignDetails.data ? <div className="space-y-4"><div className="rounded-2xl border border-[#eadfce] bg-white p-4 text-sm text-[#6b5a4a]">Funil real: {campaignDetails.data.summary.sentCount} enviado • {campaignDetails.data.summary.deliveredCount} entregue • {campaignDetails.data.summary.readCount} lido • {campaignDetails.data.summary.replyCount} respondeu • {campaignDetails.data.summary.clickCount} clicou • {campaignDetails.data.summary.bookingCount} agendou</div><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-[#fdf8f3] p-4"><p className="text-xs text-[#8a7b6d]">Falhas</p><p className="mt-1 text-2xl font-bold text-[#3d2c1e]">{campaignDetails.data.summary.failureCount}</p></div><div className="rounded-2xl bg-[#fdf8f3] p-4"><p className="text-xs text-[#8a7b6d]">Opt-out</p><p className="mt-1 text-2xl font-bold text-[#3d2c1e]">{campaignDetails.data.summary.optOutCount}</p></div><div className="rounded-2xl bg-[#fdf8f3] p-4"><p className="text-xs text-[#8a7b6d]">Receita</p><p className="mt-1 text-2xl font-bold text-[#3d2c1e]">{money(campaignDetails.data.summary.revenueGenerated)}</p></div></div></div> : <p className="py-8 text-sm text-[#8a7b6d]">Selecione uma campanha para ver resultados.</p>}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Campaigns;
