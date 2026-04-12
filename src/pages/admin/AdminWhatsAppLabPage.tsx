import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Loader2, PlayCircle, RefreshCw } from "lucide-react";
import AdminLayout from "@/components/layout/AdminLayout";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type LabLogEntry = {
  id: string;
  at: string;
  action: string;
  payload: Record<string, unknown>;
  ok: boolean;
  response?: unknown;
  error?: string;
};

type E2EStep = {
  step: string;
  ok: boolean;
  result?: unknown;
  error?: string;
};

type E2EReport = {
  success: boolean;
  steps: E2EStep[];
  primaryIds?: {
    professionalId?: string | null;
    campaignId?: string | null;
    recipientId?: string | null;
    opportunityId?: string | null;
    providerMessageId?: string | null;
    clickToken?: string | null;
  };
};

type LabContextResponse = {
  success: boolean;
  professionals: Array<{
    id: string;
    name: string | null;
    business_name: string | null;
    phone: string | null;
    slug: string | null;
  }>;
  selectedProfessionalId: string | null;
  context: {
    professional: {
      id: string;
      name: string | null;
      business_name: string | null;
      phone: string | null;
      slug: string | null;
    };
    connectedInstance: {
      instance_name?: string | null;
      meta_phone_id?: string | null;
      status?: string | null;
    } | null;
    providerAvailability: {
      evolutionConfigured: boolean;
      officialConfigured: boolean;
      connectedProviders: string[];
    };
    campaignDashboard: {
      campaigns: Array<{
        id: string;
        name: string;
        status: string;
        objective: string;
      }>;
      metrics: Record<string, unknown>;
    };
    opportunities: Array<{
      id: string;
      title: string;
      status: string;
      estimated_revenue: number;
      urgency_level: string;
    }>;
    notifications: Array<{
      id: string;
      status: string;
      provider: string | null;
      provider_message_id: string | null;
      failure_reason: string | null;
      created_at: string;
    }>;
    automations: Array<{
      id: string;
      name: string;
      is_active: boolean;
      trigger_type: string;
    }>;
    automationRuns: Array<{
      id: string;
      status: string;
      created_at: string;
      automation_id: string;
      campaign_id: string | null;
    }>;
    recentRecipients: Array<{
      id: string;
      campaign_id: string;
      recipient_status: string;
      provider_message_id: string | null;
      phone: string;
    }>;
    recentEvents: Array<{
      id: string;
      campaign_id: string;
      recipient_id: string | null;
      event_type: string;
      occurred_at: string;
    }>;
    dispatchJobsSummary: Record<string, number>;
    recentAttributions: Array<{
      id: string;
      campaign_id: string;
      booking_id: string;
      attribution_score: number;
      revenue_amount: number;
      touch_signal: string;
    }>;
    lastWhatsappLog: Record<string, unknown> | null;
  } | null;
  diagnostics?: {
    warnings?: string[];
  };
};

function JsonViewer({ data }: { data: unknown }) {
  return (
    <pre className="rounded-lg border bg-muted/30 p-3 text-xs overflow-auto max-h-[360px] whitespace-pre-wrap">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function RealFlowBadge() {
  return <Badge className="bg-emerald-600/90 text-white">Fluxo real de producao</Badge>;
}

function toOperationalErrorMessage(input: unknown) {
  const raw = input instanceof Error ? input.message : String(input || "Erro desconhecido");
  if (!raw || raw === "null" || raw === "undefined") return "Erro inesperado sem detalhes.";
  if (raw.toLowerCase().includes("failed to fetch")) {
    return "Falha de conexão com backend/edge function. Verifique rede, deploy e CORS.";
  }
  if (raw.toLowerCase().includes("unauthorized")) {
    return "Sessão inválida para ação de admin. Refaça login com conta admin master.";
  }
  return raw;
}

async function resolveFunctionInvokeError(input: unknown) {
  let message = toOperationalErrorMessage(input);
  const details: Record<string, unknown> = {};

  if (input && typeof input === "object") {
    const errorObj = input as Record<string, unknown>;
    if (typeof errorObj.message === "string" && errorObj.message.trim()) {
      message = errorObj.message;
    }

    const context = errorObj.context as { json?: () => Promise<unknown>; text?: () => Promise<string> } | undefined;
    if (context?.json) {
      try {
        const body = await context.json();
        if (body && typeof body === "object") {
          const bodyObj = body as Record<string, unknown>;
          if (typeof bodyObj.error === "string" && bodyObj.error.trim()) {
            message = bodyObj.error;
          } else if (bodyObj.error && typeof bodyObj.error === "object") {
            const nested = bodyObj.error as Record<string, unknown>;
            if (typeof nested.message === "string" && nested.message.trim()) {
              message = nested.message;
            }
          }
          if (bodyObj.details && typeof bodyObj.details === "object") {
            Object.assign(details, bodyObj.details as Record<string, unknown>);
          }
        }
      } catch {
        // ignore body parse failure
      }
    } else if (context?.text) {
      try {
        const raw = await context.text();
        if (raw?.trim()) message = raw.trim();
      } catch {
        // ignore fallback parse failure
      }
    }
  }

  return { message, details };
}

const AdminWhatsAppLabPage = () => {
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>("");
  const [preferredProvider, setPreferredProvider] = useState<"evolution" | "official">("evolution");
  const [destinationPhone, setDestinationPhone] = useState("");
  const [directMessage, setDirectMessage] = useState("Teste operacional WhatsApp Lab Gende");

  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string>("");
  const [selectedAutomationId, setSelectedAutomationId] = useState<string>("");
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>("");

  const [draftName, setDraftName] = useState("Campanha de Teste - WhatsApp Lab");
  const [draftObjective, setDraftObjective] = useState("reativacao");
  const [draftAudienceType, setDraftAudienceType] = useState("todos");
  const [draftMessage, setDraftMessage] = useState("Olá {nome}, campanha de teste operacional da Gende.");

  const [workerBatchSize, setWorkerBatchSize] = useState("20");
  const [workerMaxBatches, setWorkerMaxBatches] = useState("3");
  const [automationLimit, setAutomationLimit] = useState("20");

  const [webhookEventType, setWebhookEventType] = useState("delivered");
  const [webhookProviderMessageId, setWebhookProviderMessageId] = useState("");
  const [webhookPhone, setWebhookPhone] = useState("");
  const [webhookText, setWebhookText] = useState("Tenho interesse");
  const [clickToken, setClickToken] = useState("");
  const [clickTargetUrl, setClickTargetUrl] = useState("");
  const [e2eRecipientsCount, setE2eRecipientsCount] = useState("5");

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<unknown>(null);
  const [logs, setLogs] = useState<LabLogEntry[]>([]);
  const [lastErrorMessage, setLastErrorMessage] = useState("");
  const [e2eReport, setE2eReport] = useState<E2EReport | null>(null);

  const contextQuery = useQuery({
    queryKey: ["admin-whatsapp-lab-context", selectedProfessionalId],
    queryFn: async () => {
      const { data, error } = await api.functions.invoke("admin-whatsapp-lab", {
        body: {
          action: "get-context",
          professionalId: selectedProfessionalId || null,
        },
      });
      if (error) {
        const parsed = await resolveFunctionInvokeError(error);
        throw new Error(parsed.message);
      }
      if (data?.error) {
        const message = typeof data.error === "string"
          ? data.error
          : toOperationalErrorMessage(data.error);
        throw new Error(message);
      }
      return data as LabContextResponse;
    },
    staleTime: 10_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const context = contextQuery.data?.context || null;
  const contextWarnings = useMemo(() => contextQuery.data?.diagnostics?.warnings || [], [contextQuery.data?.diagnostics?.warnings]);
  const professionals = useMemo(() => contextQuery.data?.professionals || [], [contextQuery.data?.professionals]);
  const campaigns = useMemo(() => context?.campaignDashboard?.campaigns || [], [context?.campaignDashboard?.campaigns]);
  const opportunities = useMemo(() => context?.opportunities || [], [context?.opportunities]);
  const automations = useMemo(() => context?.automations || [], [context?.automations]);
  const recipients = useMemo(() => context?.recentRecipients || [], [context?.recentRecipients]);
  const notifications = useMemo(() => context?.notifications || [], [context?.notifications]);
  const selectedCampaign = useMemo(() => campaigns.find((item) => item.id === selectedCampaignId) || null, [campaigns, selectedCampaignId]);
  const selectedOpportunity = useMemo(() => opportunities.find((item) => item.id === selectedOpportunityId) || null, [opportunities, selectedOpportunityId]);
  const selectedRecipient = useMemo(() => recipients.find((item) => item.id === selectedRecipientId) || null, [recipients, selectedRecipientId]);
  const latestProviderMessageId = useMemo(
    () => selectedRecipient?.provider_message_id || notifications.find((item) => item.provider_message_id)?.provider_message_id || null,
    [notifications, selectedRecipient?.provider_message_id],
  );

  useEffect(() => {
    const remoteSelected = contextQuery.data?.selectedProfessionalId || "";
    if (!selectedProfessionalId && remoteSelected) {
      setSelectedProfessionalId(remoteSelected);
    }
  }, [contextQuery.data?.selectedProfessionalId, selectedProfessionalId]);

  useEffect(() => {
    if (!selectedCampaignId && campaigns[0]?.id) setSelectedCampaignId(campaigns[0].id);
  }, [campaigns, selectedCampaignId]);

  useEffect(() => {
    if (!selectedOpportunityId && opportunities[0]?.id) setSelectedOpportunityId(opportunities[0].id);
  }, [opportunities, selectedOpportunityId]);

  useEffect(() => {
    if (!selectedAutomationId && automations[0]?.id) setSelectedAutomationId(automations[0].id);
  }, [automations, selectedAutomationId]);

  useEffect(() => {
    if (!selectedRecipientId && recipients[0]?.id) setSelectedRecipientId(recipients[0].id);
  }, [recipients, selectedRecipientId]);

  const providerOptions = useMemo(() => {
    const options: Array<"evolution" | "official"> = [];
    if (context?.providerAvailability?.evolutionConfigured) options.push("evolution");
    if (context?.providerAvailability?.officialConfigured) options.push("official");
    return options;
  }, [context?.providerAvailability]);

  useEffect(() => {
    if (!providerOptions.includes(preferredProvider) && providerOptions[0]) {
      setPreferredProvider(providerOptions[0]);
    }
  }, [preferredProvider, providerOptions]);

  const runAction = async (
    action: string,
    payload: Record<string, unknown> = {},
    opts?: { refresh?: boolean; successMessage?: string },
  ) => {
    setActionLoading(action);
    try {
      const body = {
        action,
        ...(selectedProfessionalId ? { professionalId: selectedProfessionalId } : {}),
        ...payload,
      };
      const { data, error } = await api.functions.invoke("admin-whatsapp-lab", { body });
      if (error) {
        const parsed = await resolveFunctionInvokeError(error);
        throw new Error(parsed.message);
      }
      if (data?.error) {
        const message = typeof data.error === "string"
          ? data.error
          : toOperationalErrorMessage(data.error);
        throw new Error(message);
      }
      setLastErrorMessage("");

      setLastResponse(data);
      if (action === "e2e-run-flow") {
        const candidate = data as E2EReport;
        if (Array.isArray(candidate.steps)) {
          setE2eReport(candidate);
        }
      }
      setLogs((prev) => [
        {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          action,
          payload: body,
          ok: true,
          response: data,
        },
        ...prev,
      ].slice(0, 40));

      if (opts?.successMessage) toast.success(opts.successMessage);
      if (opts?.refresh !== false) {
        await contextQuery.refetch();
      }
      return data;
    } catch (err) {
      const parsed = await resolveFunctionInvokeError(err);
      const message = parsed.message;
      setLastErrorMessage(message);
      toast.error(message);
      setLogs((prev) => [
        {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          action,
          payload: {
            ...(selectedProfessionalId ? { professionalId: selectedProfessionalId } : {}),
            ...payload,
          },
          ok: false,
          error: message,
        },
        ...prev,
      ].slice(0, 40));
      throw err;
    } finally {
      setActionLoading(null);
    }
  };

  const loading = contextQuery.isLoading;
  const disabled = !selectedProfessionalId || !context;

  const copyToClipboard = async (label: string, value?: string | null) => {
    const text = String(value || "").trim();
    if (!text) {
      toast.error(`Sem valor para copiar: ${label}`);
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado`);
    } catch {
      toast.error(`Não foi possível copiar ${label}`);
    }
  };

  const getStepBadgeVariant = (ok: boolean): "default" | "destructive" => (ok ? "default" : "destructive");

  return (
    <AdminLayout title="WhatsApp Lab" subtitle="Central operacional real de testes WhatsApp">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">Contexto Global de Teste</CardTitle>
              <RealFlowBadge />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Profissional/Tenant</p>
                <Select value={selectedProfessionalId} onValueChange={setSelectedProfessionalId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o profissional" />
                  </SelectTrigger>
                  <SelectContent>
                    {professionals.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {(item.business_name || item.name || "Profissional")} • {item.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Provider preferido</p>
                <Select value={preferredProvider} onValueChange={(value) => setPreferredProvider(value as "evolution" | "official")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {providerOptions.includes("evolution") && <SelectItem value="evolution">Evolution</SelectItem>}
                    {providerOptions.includes("official") && <SelectItem value="official">WhatsApp Official</SelectItem>}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Telefone destino teste</p>
                <Input
                  value={destinationPhone}
                  onChange={(event) => setDestinationPhone(event.target.value)}
                  placeholder="5511999999999"
                />
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Atualização</p>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={contextQuery.isFetching}
                  onClick={() => contextQuery.refetch()}
                >
                  {contextQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Recarregar contexto
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : context ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Business</p>
                  <p className="font-medium">{context.professional.business_name || context.professional.name || "-"}</p>
                  <p className="text-xs text-muted-foreground break-all">{context.professional.id}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Canal conectado</p>
                  <p className="font-medium">{context.connectedInstance?.instance_name || "Sem instância conectada"}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(context.providerAvailability.connectedProviders || []).map((provider) => (
                      <Badge key={provider} variant="secondary">{provider}</Badge>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Telefone profissional</p>
                  <p className="font-medium">{context.professional.phone || "-"}</p>
                  <p className="text-xs text-muted-foreground">meta_phone_id: {context.connectedInstance?.meta_phone_id || "-"}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Jobs</p>
                  <p className="font-medium">pending: {context.dispatchJobsSummary?.pending || 0}</p>
                  <p className="text-xs text-muted-foreground">failed: {context.dispatchJobsSummary?.failed || 0}</p>
                </div>
              </div>
            ) : null}

            {context ? (
              <div className="rounded-lg border p-3 bg-muted/20 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Contexto ativo (explícito)</p>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">professional_id</p>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs break-all">{context.professional.id}</span>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyToClipboard("professional_id", context.professional.id)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">provider selecionado</p>
                    <p className="font-medium">{preferredProvider}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">instância</p>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{context.connectedInstance?.instance_name || "-"}</p>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => copyToClipboard("instance_name", context.connectedInstance?.instance_name || null)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">telefone profissional</p>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{context.professional.phone || "-"}</p>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => copyToClipboard("professional_phone", context.professional.phone || null)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">status do canal</p>
                    <Badge variant={context.connectedInstance?.status === "connected" ? "default" : "destructive"}>
                      {context.connectedInstance?.status || "disconnected"}
                    </Badge>
                  </div>
                </div>
              </div>
            ) : null}

            {lastErrorMessage ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                <p className="text-xs text-muted-foreground mb-1">Último erro operacional</p>
                <p className="text-sm text-destructive font-medium">{lastErrorMessage}</p>
              </div>
            ) : null}

            {contextWarnings.length > 0 ? (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-1">
                <p className="text-xs text-muted-foreground">Alertas de diagnóstico do backend</p>
                {contextWarnings.slice(0, 6).map((warning, index) => (
                  <p key={`${warning}-${index}`} className="text-xs text-amber-700 dark:text-amber-300">
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">1) Envio Direto</CardTitle>
                <RealFlowBadge />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea value={directMessage} onChange={(event) => setDirectMessage(event.target.value)} rows={4} />
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={disabled || actionLoading !== null}
                  onClick={() => runAction("send-direct-message", {
                    preferredProvider,
                    recipientPhone: destinationPhone,
                    message: directMessage,
                  }, { successMessage: "Envio direto executado." })}
                >
                  {actionLoading === "send-direct-message" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Enviar para número de teste
                </Button>
                <Button
                  variant="outline"
                  disabled={disabled || actionLoading !== null}
                  onClick={() => runAction("send-direct-message", {
                    preferredProvider,
                    sendToProfessional: true,
                    message: directMessage,
                  }, { successMessage: "Envio para profissional executado." })}
                >
                  Enviar para profissional
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">2) Lis / Radar</CardTitle>
                <RealFlowBadge />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Select value={selectedOpportunityId} onValueChange={setSelectedOpportunityId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione oportunidade" />
                  </SelectTrigger>
                  <SelectContent>
                    {opportunities.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.title} • {item.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  disabled={disabled || actionLoading !== null}
                  onClick={() => runAction("lis-generate-opportunities", { autoNotifyTop: 0 }, { successMessage: "Oportunidades geradas." })}
                >
                  {actionLoading === "lis-generate-opportunities" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Gerar oportunidades agora
                </Button>
              </div>
              <div className="rounded-md border bg-muted/20 p-2 text-xs">
                <p className="text-muted-foreground">opportunity_id</p>
                <div className="flex items-center gap-2">
                  <span className="font-mono break-all">{selectedOpportunity?.id || "-"}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => copyToClipboard("opportunity_id", selectedOpportunity?.id || null)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={disabled || !selectedOpportunityId || actionLoading !== null}
                  onClick={() => runAction("lis-notify-opportunity", { opportunityId: selectedOpportunityId }, { successMessage: "Notificação da Lis enviada." })}
                >
                  Notificar profissional
                </Button>
                <Button
                  variant="outline"
                  disabled={disabled || !selectedOpportunityId || actionLoading !== null}
                  onClick={() => runAction("lis-opportunity-action", { opportunityId: selectedOpportunityId, kind: "generate_campaign" }, { successMessage: "Draft gerado da oportunidade." })}
                >
                  Gerar campanha
                </Button>
                <Button
                  variant="outline"
                  disabled={disabled || !selectedOpportunityId || actionLoading !== null}
                  onClick={() => runAction("lis-opportunity-action", { opportunityId: selectedOpportunityId, kind: "dismissed" }, { successMessage: "Oportunidade ignorada." })}
                >
                  Ignorar
                </Button>
                <Button
                  variant="outline"
                  disabled={disabled || !selectedOpportunityId || actionLoading !== null}
                  onClick={() => runAction("lis-opportunity-action", { opportunityId: selectedOpportunityId, kind: "remind_later" }, { successMessage: "Lembrete adiado." })}
                >
                  Lembrar depois
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">3) Campanhas</CardTitle>
                <RealFlowBadge />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Input value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="Nome do draft" />
                <Select value={draftObjective} onValueChange={setDraftObjective}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reativacao">Reativação</SelectItem>
                    <SelectItem value="promocao">Promoção</SelectItem>
                    <SelectItem value="preenchimento_agenda">Preenchimento de Agenda</SelectItem>
                    <SelectItem value="manutencao">Manutenção</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Textarea value={draftMessage} onChange={(event) => setDraftMessage(event.target.value)} rows={3} />
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={disabled || actionLoading !== null}
                  onClick={() => runAction("campaign-create-draft", {
                    name: draftName,
                    objective: draftObjective,
                    audienceType: draftAudienceType,
                    messageBody: draftMessage,
                    ctaType: "link",
                    ctaPayloadJson: { url: `https://gende.io/${context?.professional.slug || ""}` },
                  }, { successMessage: "Draft criado com sucesso." })}
                >
                  Criar draft
                </Button>
                <Button
                  variant="outline"
                  disabled={disabled || actionLoading !== null}
                  onClick={() => runAction("campaign-preview-builder", {
                    objective: draftObjective,
                    audienceFilters: { audienceType: draftAudienceType },
                    messageBody: draftMessage,
                    ctaType: "link",
                    ctaPayload: { url: `https://gende.io/${context?.professional.slug || ""}` },
                  }, { successMessage: "Preview gerado." })}
                >
                  Preview audiência/mensagem
                </Button>
              </div>

              <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione campanha" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} • {item.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="rounded-md border bg-muted/20 p-2 text-xs">
                <p className="text-muted-foreground">campaign_id</p>
                <div className="flex items-center gap-2">
                  <span className="font-mono break-all">{selectedCampaign?.id || "-"}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => copyToClipboard("campaign_id", selectedCampaign?.id || null)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={!selectedCampaignId || actionLoading !== null}
                  onClick={() => runAction("campaign-start", { campaignId: selectedCampaignId }, { successMessage: "Campanha iniciada." })}
                >
                  Iniciar
                </Button>
                <Button
                  variant="outline"
                  disabled={!selectedCampaignId || actionLoading !== null}
                  onClick={() => runAction("campaign-pause", { campaignId: selectedCampaignId }, { successMessage: "Campanha pausada." })}
                >
                  Pausar
                </Button>
                <Button
                  variant="outline"
                  disabled={!selectedCampaignId || actionLoading !== null}
                  onClick={() => runAction("campaign-cancel", { campaignId: selectedCampaignId }, { successMessage: "Campanha cancelada." })}
                >
                  Cancelar
                </Button>
                <Button
                  variant="outline"
                  disabled={!selectedCampaignId || actionLoading !== null}
                  onClick={() => runAction("campaign-clone", { campaignId: selectedCampaignId }, { successMessage: "Campanha clonada." })}
                >
                  Duplicar
                </Button>
                <Button
                  variant="outline"
                  disabled={!selectedCampaignId || actionLoading !== null}
                  onClick={() => runAction("campaign-details", { campaignId: selectedCampaignId }, { successMessage: "Detalhes carregados." })}
                >
                  Ver detalhes
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">4) Workers e Automações</CardTitle>
                <RealFlowBadge />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <Input value={workerBatchSize} onChange={(event) => setWorkerBatchSize(event.target.value)} placeholder="batch size" />
                <Input value={workerMaxBatches} onChange={(event) => setWorkerMaxBatches(event.target.value)} placeholder="max batches" />
                <Input value={automationLimit} onChange={(event) => setAutomationLimit(event.target.value)} placeholder="automation limit" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={disabled || actionLoading !== null}
                  onClick={() => runAction("worker-run-campaign", {
                    batchSize: Number(workerBatchSize),
                    maxBatches: Number(workerMaxBatches),
                  }, { successMessage: "Worker de campanhas executado." })}
                >
                  Rodar worker campanhas
                </Button>
                <Button
                  variant="outline"
                  disabled={disabled || actionLoading !== null}
                  onClick={() => runAction("worker-run-automation", {
                    limit: Number(automationLimit),
                    batchSize: Number(workerBatchSize),
                    maxBatches: Number(workerMaxBatches),
                  }, { successMessage: "Worker de automações executado." })}
                >
                  Rodar worker automações
                </Button>
              </div>

              <Select value={selectedAutomationId} onValueChange={setSelectedAutomationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione automação" />
                </SelectTrigger>
                <SelectContent>
                  {automations.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} • {item.is_active ? "ativa" : "inativa"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={!selectedAutomationId || actionLoading !== null}
                  onClick={() => runAction("automation-run", {
                    automationId: selectedAutomationId,
                    batchSize: Number(workerBatchSize),
                    maxBatches: Number(workerMaxBatches),
                    force: true,
                  }, { successMessage: "Automação executada." })}
                >
                  Executar automação
                </Button>
                <Button
                  variant="outline"
                  disabled={!selectedAutomationId || actionLoading !== null}
                  onClick={() => runAction("automation-toggle", {
                    automationId: selectedAutomationId,
                    isActive: true,
                  }, { successMessage: "Automação ativada." })}
                >
                  Ativar
                </Button>
                <Button
                  variant="outline"
                  disabled={!selectedAutomationId || actionLoading !== null}
                  onClick={() => runAction("automation-toggle", {
                    automationId: selectedAutomationId,
                    isActive: false,
                  }, { successMessage: "Automação desativada." })}
                >
                  Desativar
                </Button>
                <Button
                  variant="outline"
                  disabled={disabled || actionLoading !== null}
                  onClick={() => runAction("automation-run-all", { limit: Number(automationLimit) }, { successMessage: "Automações ativas executadas." })}
                >
                  Executar todas as ativas
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">5) Webhook, Click e Atribuição</CardTitle>
                <RealFlowBadge />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Select value={webhookEventType} onValueChange={setWebhookEventType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sent">sent</SelectItem>
                    <SelectItem value="delivered">delivered</SelectItem>
                    <SelectItem value="read">read</SelectItem>
                    <SelectItem value="reply">reply</SelectItem>
                    <SelectItem value="failed">failed</SelectItem>
                    <SelectItem value="opt_out">opt_out</SelectItem>
                    <SelectItem value="click">click</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={webhookProviderMessageId}
                  onChange={(event) => setWebhookProviderMessageId(event.target.value)}
                  placeholder="provider_message_id (status events)"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <Input value={webhookPhone} onChange={(event) => setWebhookPhone(event.target.value)} placeholder="phone (reply/opt_out)" />
                <Input value={webhookText} onChange={(event) => setWebhookText(event.target.value)} placeholder="texto reply" />
                <Input value={clickToken} onChange={(event) => setClickToken(event.target.value)} placeholder="token click" />
              </div>

              <Select value={selectedRecipientId} onValueChange={setSelectedRecipientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Recipient (opcional para webhook status/click link)" />
                </SelectTrigger>
                <SelectContent>
                  {recipients.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.phone} • {item.recipient_status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-md border bg-muted/20 p-2 text-xs">
                  <p className="text-muted-foreground">recipient_id</p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono break-all">{selectedRecipient?.id || "-"}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => copyToClipboard("recipient_id", selectedRecipient?.id || null)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="rounded-md border bg-muted/20 p-2 text-xs">
                  <p className="text-muted-foreground">provider_message_id</p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono break-all">{latestProviderMessageId || "-"}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => copyToClipboard("provider_message_id", latestProviderMessageId)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Input value={clickTargetUrl} onChange={(event) => setClickTargetUrl(event.target.value)} placeholder="target URL para link rastreável" />
                <Button
                  variant="outline"
                  disabled={!selectedCampaignId || !selectedRecipientId || actionLoading !== null}
                  onClick={async () => {
                    const result = await runAction("click-generate-link", {
                      campaignId: selectedCampaignId,
                      recipientId: selectedRecipientId,
                      targetUrl: clickTargetUrl || undefined,
                    }, { successMessage: "Link rastreável gerado." });
                    const token = (result as { token?: string })?.token || "";
                    if (token) setClickToken(token);
                  }}
                >
                  Gerar link rastreável
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={disabled || actionLoading !== null}
                  onClick={() => runAction("webhook-simulate-event", {
                    eventType: webhookEventType,
                    providerMessageId: webhookProviderMessageId || undefined,
                    recipientId: selectedRecipientId || undefined,
                    phone: webhookPhone || undefined,
                    text: webhookText || undefined,
                    token: clickToken || undefined,
                  }, { successMessage: "Evento simulado no pipeline real." })}
                >
                  Simular webhook/evento
                </Button>
                <Button
                  variant="outline"
                  disabled={!clickToken || actionLoading !== null}
                  onClick={() => runAction("click-simulate", { token: clickToken }, { successMessage: "Click simulado." })}
                >
                  Simular click
                </Button>
                <Button
                  variant="outline"
                  disabled={disabled || actionLoading !== null}
                  onClick={() => runAction("attribution-run", { campaignId: selectedCampaignId || undefined }, { successMessage: "Atribuição recalculada." })}
                >
                  Rodar atribuição
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">6) E2E Guiado (Lis → Campanha → Worker → Eventos → Click → Atribuição)</CardTitle>
                <RealFlowBadge />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  value={e2eRecipientsCount}
                  onChange={(event) => setE2eRecipientsCount(event.target.value)}
                  placeholder="Quantidade recipients (seed)"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={disabled || actionLoading !== null}
                    onClick={() => runAction("e2e-seed-scenario", { recipientsCount: Number(e2eRecipientsCount) }, { successMessage: "Seed E2E criado." })}
                  >
                    Seed cenário E2E
                  </Button>
                  <Button
                    disabled={disabled || actionLoading !== null}
                    onClick={() => runAction("e2e-run-flow", {
                      recipientsCount: Number(e2eRecipientsCount),
                      batchSize: Number(workerBatchSize),
                      maxBatches: Number(workerMaxBatches),
                      messageBody: draftMessage,
                    }, { successMessage: "Fluxo E2E executado." })}
                  >
                    {actionLoading === "e2e-run-flow" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                    Rodar E2E completo
                  </Button>
                </div>
              </div>
              {e2eReport ? (
                <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">Resultado por etapa</p>
                    <Badge variant={e2eReport.success ? "default" : "destructive"}>
                      {e2eReport.success ? "Fluxo concluido" : "Fluxo com falhas"}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {e2eReport.steps.map((step, index) => (
                      <div key={`${step.step}-${index}`} className="rounded-md border bg-background p-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">{index + 1}. {step.step}</p>
                          <Badge variant={getStepBadgeVariant(step.ok)}>{step.ok ? "ok" : "erro"}</Badge>
                        </div>
                        {!step.ok && step.error ? (
                          <p className="text-xs text-destructive mt-1">{toOperationalErrorMessage(step.error)}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-md border bg-background p-2 text-xs">
                      <p className="text-muted-foreground">opportunity_id</p>
                      <div className="flex items-center gap-2">
                        <span className="font-mono break-all">{e2eReport.primaryIds?.opportunityId || "-"}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => copyToClipboard("opportunity_id", e2eReport.primaryIds?.opportunityId || null)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-md border bg-background p-2 text-xs">
                      <p className="text-muted-foreground">campaign_id</p>
                      <div className="flex items-center gap-2">
                        <span className="font-mono break-all">{e2eReport.primaryIds?.campaignId || "-"}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => copyToClipboard("campaign_id", e2eReport.primaryIds?.campaignId || null)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-md border bg-background p-2 text-xs">
                      <p className="text-muted-foreground">recipient_id</p>
                      <div className="flex items-center gap-2">
                        <span className="font-mono break-all">{e2eReport.primaryIds?.recipientId || "-"}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => copyToClipboard("recipient_id", e2eReport.primaryIds?.recipientId || null)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-md border bg-background p-2 text-xs">
                      <p className="text-muted-foreground">provider_message_id</p>
                      <div className="flex items-center gap-2">
                        <span className="font-mono break-all">{e2eReport.primaryIds?.providerMessageId || "-"}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => copyToClipboard("provider_message_id", e2eReport.primaryIds?.providerMessageId || null)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-3">
                  <p className="text-sm text-muted-foreground">
                    Rode o fluxo E2E completo para ver status por etapa, erros operacionais e IDs principais.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Painel de Debug / Respostas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lastResponse ? <JsonViewer data={lastResponse} /> : <p className="text-sm text-muted-foreground">Sem resposta executada ainda.</p>}
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={log.ok ? "default" : "destructive"}>{log.ok ? "success" : "error"}</Badge>
                      <p className="text-sm font-medium">{log.action}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{new Date(log.at).toLocaleString("pt-BR")}</p>
                  </div>
                  {!log.ok && log.error ? (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2">
                      <p className="text-xs text-destructive font-medium">{toOperationalErrorMessage(log.error)}</p>
                    </div>
                  ) : null}
                  <JsonViewer data={{ payload: log.payload, response: log.response, error: log.error }} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminWhatsAppLabPage;
