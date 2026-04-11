import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useWhatsAppCampaignBuilderPreview } from "@/hooks/useWhatsAppCampaigns";
import type { CampaignTemplate, CampaignWizardForm } from "@/types/whatsapp-campaigns";
import { Loader2, Sparkles, Target, Users, Wand2 } from "lucide-react";

const objectiveOptions = [
  { value: "reativacao", label: "Reativar clientes", hint: "Recuperar clientes que esfriaram." },
  { value: "preenchimento_agenda", label: "Preencher agenda", hint: "Ocupar janelas vazias rápido." },
  { value: "promocao", label: "Promover serviço", hint: "Dar tração para um serviço específico." },
  { value: "novidade", label: "Lançar novidade", hint: "Apresentar nova solução ou protocolo." },
  { value: "manutencao", label: "Manutenção", hint: "Lembrar o momento ideal de retorno." },
  { value: "aniversario", label: "Aniversário", hint: "Ativar oferta sazonal com carinho." },
] as const;

const audienceOptions = [
  { value: "todos", label: "Todos os clientes" },
  { value: "inativos", label: "Clientes inativos" },
  { value: "recentes", label: "Clientes recentes" },
  { value: "vip", label: "Clientes VIP" },
  { value: "novos", label: "Clientes novos" },
  { value: "aniversario", label: "Aniversariantes próximos" },
  { value: "janela_manutencao", label: "Janela de manutenção" },
  { value: "servico_especifico", label: "Quem já fez um serviço" },
  { value: "cancelou_sem_reagendar", label: "Cancelou e não reagendou" },
  { value: "no_show", label: "No-show" },
  { value: "ticket_medio", label: "Ticket médio" },
  { value: "frequencia", label: "Frequência de visitas" },
  { value: "consentimento", label: "Somente com consentimento" },
] as const;

const ctaOptions = [
  { value: "booking_link", label: "Link de agendamento" },
  { value: "whatsapp_reply", label: "Responder no WhatsApp" },
  { value: "link", label: "Link externo" },
  { value: "coupon", label: "Cupom" },
  { value: "none", label: "Sem CTA" },
] as const;

const emptyForm: CampaignWizardForm = {
  name: "",
  type: "manual",
  objective: "reativacao",
  audienceType: "inativos",
  audienceFilterJson: { audienceType: "inativos", inactiveDays: 45, consentOnly: true },
  audienceEstimateJson: {},
  messageMode: "hybrid",
  messageBody: "",
  ctaType: "booking_link",
  ctaPayloadJson: {},
  sendConfigJson: {},
};

export function CampaignWizardDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValue?: CampaignWizardForm | null;
  templates: CampaignTemplate[];
  onSubmit: (form: CampaignWizardForm) => Promise<void>;
  submitting?: boolean;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CampaignWizardForm>(emptyForm);

  useEffect(() => {
    if (!props.open) return;
    setStep(0);
    setForm(props.initialValue ? {
      ...emptyForm,
      ...props.initialValue,
      audienceFilterJson: props.initialValue.audienceFilterJson || emptyForm.audienceFilterJson,
      ctaPayloadJson: props.initialValue.ctaPayloadJson || {},
      sendConfigJson: props.initialValue.sendConfigJson || {},
      audienceEstimateJson: props.initialValue.audienceEstimateJson || {},
    } : emptyForm);
  }, [props.initialValue, props.open]);

  const preview = useWhatsAppCampaignBuilderPreview({
    objective: form.objective,
    audienceFilters: { ...form.audienceFilterJson, audienceType: form.audienceType },
    messageBody: form.messageBody,
    ctaType: form.ctaType,
    ctaPayload: form.ctaPayloadJson,
    enabled: props.open,
  });

  const selectedTemplate = props.templates.find((template) => template.id === form.templateId);
  const audience = preview.data?.audience;
  const messagePreview = preview.data?.message;

  const updateAudienceField = (field: string, value: unknown) => {
    setForm((current) => ({
      ...current,
      audienceFilterJson: {
        ...current.audienceFilterJson,
        [field]: value,
      },
    }));
  };

  const nextStep = async () => {
    if (step === 5) {
      await props.onSubmit({
        ...form,
        audienceEstimateJson: audience
          ? {
            audienceCount: audience.audienceCount,
            estimatedConversionRate: audience.estimatedConversionRate,
            estimatedBookings: audience.estimatedBookings,
            estimatedRevenue: audience.estimatedRevenue,
            averageTicket: audience.averageTicket,
          }
          : form.audienceEstimateJson,
      });
      return;
    }
    setStep((current) => Math.min(current + 1, 5));
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[30px] border-[#eadfce] bg-[#fffdf9] p-0 sm:max-w-[980px]">
        <DialogHeader className="border-b border-[#efe5d8] px-6 py-5 sm:px-8">
          <div className="mb-4 flex flex-wrap gap-2">
            {["Objetivo", "Público", "Mensagem", "CTA", "Envio", "Revisão"].map((label, index) => (
              <span
                key={label}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${index === step ? "bg-[#eebf9c] text-[#3d2c1e]" : index < step ? "bg-[#f5dcc3] text-[#a67a44]" : "bg-[#f7f1e8] text-[#8a7b6d]"}`}
              >
                {index + 1}. {label}
              </span>
            ))}
          </div>
          <DialogTitle className="text-2xl font-bold text-[#3d2c1e]">
            {form.id ? "Continuar campanha" : "Nova campanha inteligente"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="px-6 py-6 sm:px-8">
            {step === 0 && (
              <div>
                <Label className="text-sm font-semibold text-[#a67a44]">Objetivo principal</Label>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {objectiveOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, objective: option.value }))}
                      className={`rounded-[24px] border p-4 text-left transition-all ${form.objective === option.value ? "border-[#d4a84b] bg-[#fff7ef] shadow-[0_12px_28px_-18px_rgba(212,168,75,0.55)]" : "border-[#eadfce] bg-white hover:border-[#eebf9c]"}`}
                    >
                      <p className="font-semibold text-[#3d2c1e]">{option.label}</p>
                      <p className="mt-1 text-sm leading-6 text-[#6b5a4a]">{option.hint}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <Label className="text-sm font-semibold text-[#a67a44]">Segmento</Label>
                  <Select value={form.audienceType} onValueChange={(value) => setForm((current) => ({
                    ...current,
                    audienceType: value as CampaignWizardForm["audienceType"],
                    audienceFilterJson: { ...current.audienceFilterJson, audienceType: value },
                  }))}>
                    <SelectTrigger className="mt-2 rounded-2xl border-[#eadfce] bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {audienceOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {form.audienceType === "inativos" && (
                  <div>
                    <Label>Dias sem voltar</Label>
                    <Input
                      className="mt-2 rounded-2xl border-[#eadfce]"
                      type="number"
                      value={String(form.audienceFilterJson.inactiveDays || 45)}
                      onChange={(event) => updateAudienceField("inactiveDays", Number(event.target.value || 45))}
                    />
                  </div>
                )}

                {form.audienceType === "recentes" && (
                  <div>
                    <Label>Últimos quantos dias</Label>
                    <Input
                      className="mt-2 rounded-2xl border-[#eadfce]"
                      type="number"
                      value={String(form.audienceFilterJson.recentDays || 30)}
                      onChange={(event) => updateAudienceField("recentDays", Number(event.target.value || 30))}
                    />
                  </div>
                )}

                {form.audienceType === "novos" && (
                  <div>
                    <Label>Clientes criados nos últimos dias</Label>
                    <Input
                      className="mt-2 rounded-2xl border-[#eadfce]"
                      type="number"
                      value={String(form.audienceFilterJson.newClientDays || 30)}
                      onChange={(event) => updateAudienceField("newClientDays", Number(event.target.value || 30))}
                    />
                  </div>
                )}

                {form.audienceType === "ticket_medio" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Ticket mínimo</Label>
                      <Input
                        className="mt-2 rounded-2xl border-[#eadfce]"
                        type="number"
                        value={String(form.audienceFilterJson.ticketMin || 120)}
                        onChange={(event) => updateAudienceField("ticketMin", Number(event.target.value || 0))}
                      />
                    </div>
                    <div>
                      <Label>Ticket máximo</Label>
                      <Input
                        className="mt-2 rounded-2xl border-[#eadfce]"
                        type="number"
                        value={String(form.audienceFilterJson.ticketMax || 500)}
                        onChange={(event) => updateAudienceField("ticketMax", Number(event.target.value || 0))}
                      />
                    </div>
                  </div>
                )}

                {form.audienceType === "frequencia" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Visitas mínimas</Label>
                      <Input
                        className="mt-2 rounded-2xl border-[#eadfce]"
                        type="number"
                        value={String(form.audienceFilterJson.minVisits || 2)}
                        onChange={(event) => updateAudienceField("minVisits", Number(event.target.value || 0))}
                      />
                    </div>
                    <div>
                      <Label>Visitas máximas</Label>
                      <Input
                        className="mt-2 rounded-2xl border-[#eadfce]"
                        type="number"
                        value={String(form.audienceFilterJson.maxVisits || 8)}
                        onChange={(event) => updateAudienceField("maxVisits", Number(event.target.value || 0))}
                      />
                    </div>
                  </div>
                )}

                <div className="rounded-[24px] border border-dashed border-[#eadfce] bg-white p-4">
                  <p className="text-sm font-semibold text-[#3d2c1e]">Preview do público</p>
                  {preview.isLoading ? (
                    <div className="mt-3 flex items-center gap-2 text-sm text-[#8a7b6d]">
                      <Loader2 size={16} className="animate-spin" />
                      Atualizando elegibilidade e potencial...
                    </div>
                  ) : audience ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-[#fdf8f3] p-4">
                        <p className="text-xs font-semibold text-[#a67a44]">Público final</p>
                        <p className="mt-1 text-2xl font-bold text-[#3d2c1e]">{audience.audienceCount}</p>
                        <p className="text-xs text-[#8a7b6d]">ticket médio R$ {audience.averageTicket.toFixed(2)}</p>
                      </div>
                      <div className="rounded-2xl bg-[#fdf8f3] p-4">
                        <p className="text-xs font-semibold text-[#a67a44]">Potencial</p>
                        <p className="mt-1 text-2xl font-bold text-[#3d2c1e]">R$ {audience.estimatedRevenue.toFixed(0)}</p>
                        <p className="text-xs text-[#8a7b6d]">{Math.round(audience.estimatedConversionRate * 100)}% de conversão estimada</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <Label className="text-sm font-semibold text-[#a67a44]">Nome interno da campanha</Label>
                  <Input
                    className="mt-2 rounded-2xl border-[#eadfce]"
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Ex.: Reativar sobrancelha • abril"
                  />
                </div>
                <div>
                  <Label className="text-sm font-semibold text-[#a67a44]">Modelo</Label>
                  <div className="mt-3 grid gap-3">
                    {props.templates.slice(0, 4).map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => setForm((current) => ({
                          ...current,
                          templateId: template.id,
                          templateName: template.name,
                          messageMode: "hybrid",
                          messageBody: current.messageBody || template.body,
                        }))}
                        className={`rounded-[22px] border p-4 text-left ${form.templateId === template.id ? "border-[#d4a84b] bg-[#fff7ef]" : "border-[#eadfce] bg-white"}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-[#3d2c1e]">{template.name}</p>
                            <p className="text-xs uppercase tracking-[0.12em] text-[#a67a44]">{template.tone}</p>
                          </div>
                          {template.is_system_template && <Badge variant="outline">Lis</Badge>}
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#6b5a4a]">{template.body}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-semibold text-[#a67a44]">Mensagem</Label>
                  <Textarea
                    className="mt-2 min-h-[220px] rounded-[24px] border-[#eadfce]"
                    value={form.messageBody}
                    onChange={(event) => setForm((current) => ({ ...current, messageBody: event.target.value }))}
                    placeholder="Use variáveis como {nome}, {servico}, {link_agendamento}"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(messagePreview?.placeholders || ["nome", "servico", "link_agendamento"]).map((placeholder) => (
                      <span key={placeholder} className="rounded-full bg-[#f7f1e8] px-3 py-1 text-xs font-medium text-[#8a7b6d]">
                        {`{${placeholder}}`}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <Label className="text-sm font-semibold text-[#a67a44]">Chamada para ação</Label>
                  <Select value={form.ctaType} onValueChange={(value) => setForm((current) => ({ ...current, ctaType: value as CampaignWizardForm["ctaType"] }))}>
                    <SelectTrigger className="mt-2 rounded-2xl border-[#eadfce] bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ctaOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {(form.ctaType === "link" || form.ctaType === "booking_link") && (
                  <div>
                    <Label>URL</Label>
                    <Input
                      className="mt-2 rounded-2xl border-[#eadfce]"
                      value={String(form.ctaPayloadJson.url || form.ctaPayloadJson.bookingLink || "")}
                      onChange={(event) => setForm((current) => ({
                        ...current,
                        ctaPayloadJson: {
                          ...current.ctaPayloadJson,
                          [current.ctaType === "booking_link" ? "bookingLink" : "url"]: event.target.value,
                        },
                      }))}
                      placeholder="https://gende.io/seu-negocio"
                    />
                  </div>
                )}

                {form.ctaType === "coupon" && (
                  <div>
                    <Label>Código do cupom</Label>
                    <Input
                      className="mt-2 rounded-2xl border-[#eadfce]"
                      value={String(form.ctaPayloadJson.couponCode || "")}
                      onChange={(event) => setForm((current) => ({
                        ...current,
                        ctaPayloadJson: {
                          ...current.ctaPayloadJson,
                          couponCode: event.target.value,
                        },
                      }))}
                      placeholder="VOLTA10"
                    />
                  </div>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="space-y-5">
                <div>
                  <Label className="text-sm font-semibold text-[#a67a44]">Quando enviar</Label>
                  <Select
                    value={form.scheduledAt ? "schedule" : "now"}
                    onValueChange={(value) => setForm((current) => ({ ...current, scheduledAt: value === "schedule" ? current.scheduledAt || new Date().toISOString().slice(0, 16) : null }))}
                  >
                    <SelectTrigger className="mt-2 rounded-2xl border-[#eadfce] bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="now">Salvar para enviar depois</SelectItem>
                      <SelectItem value="schedule">Agendar rascunho</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.scheduledAt && (
                  <div>
                    <Label>Agendar para</Label>
                    <Input
                      className="mt-2 rounded-2xl border-[#eadfce]"
                      type="datetime-local"
                      value={form.scheduledAt.slice(0, 16)}
                      onChange={(event) => setForm((current) => ({ ...current, scheduledAt: event.target.value }))}
                    />
                  </div>
                )}

                <div className="rounded-[24px] border border-dashed border-[#eadfce] bg-white p-4">
                  <p className="text-sm font-semibold text-[#3d2c1e]">Boas práticas</p>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-[#6b5a4a]">
                    <li>Prefira mensagens curtas e um CTA único.</li>
                    <li>Evite repetir campanhas para o mesmo público em intervalo curto.</li>
                    <li>Use o Radar da Lis para priorizar oportunidades com urgência alta.</li>
                  </ul>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-5">
                <div className="rounded-[24px] border border-[#eadfce] bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a67a44]">Resumo final</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-[#fdf8f3] p-4">
                      <p className="text-xs text-[#8a7b6d]">Objetivo</p>
                      <p className="mt-1 font-semibold text-[#3d2c1e]">{objectiveOptions.find((option) => option.value === form.objective)?.label}</p>
                    </div>
                    <div className="rounded-2xl bg-[#fdf8f3] p-4">
                      <p className="text-xs text-[#8a7b6d]">Público</p>
                      <p className="mt-1 font-semibold text-[#3d2c1e]">{audience?.audienceCount || 0} contatos elegíveis</p>
                    </div>
                    <div className="rounded-2xl bg-[#fdf8f3] p-4">
                      <p className="text-xs text-[#8a7b6d]">Potencial de faturamento</p>
                      <p className="mt-1 font-semibold text-[#3d2c1e]">R$ {audience?.estimatedRevenue.toFixed(0) || "0"}</p>
                    </div>
                    <div className="rounded-2xl bg-[#fdf8f3] p-4">
                      <p className="text-xs text-[#8a7b6d]">CTA</p>
                      <p className="mt-1 font-semibold text-[#3d2c1e]">{ctaOptions.find((option) => option.value === form.ctaType)?.label}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#eadfce] bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a67a44]">Mensagem renderizada</p>
                  <p className="mt-3 whitespace-pre-line text-sm leading-7 text-[#3d2c1e]">
                    {messagePreview?.renderedMessage || form.messageBody}
                  </p>
                </div>
              </div>
            )}

            <div className="mt-8 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep((current) => Math.max(current - 1, 0))} disabled={step === 0}>
                Voltar
              </Button>
              <Button onClick={nextStep} disabled={props.submitting || preview.isLoading} className="rounded-2xl bg-[#eebf9c] text-[#3d2c1e] hover:bg-[#d4a84b]">
                {props.submitting ? <Loader2 className="mr-2 animate-spin" size={16} /> : null}
                {step === 5 ? "Salvar campanha" : "Continuar"}
              </Button>
            </div>
          </div>

          <div className="border-t border-[#efe5d8] bg-[#fcf6ef] px-6 py-6 lg:border-l lg:border-t-0 sm:px-8">
            <div className="rounded-[26px] border border-[#eadfce] bg-white p-5 shadow-[0_18px_44px_-34px_rgba(61,44,30,0.22)]">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#a67a44]">
                <Wand2 size={15} />
                Preview inteligente
              </div>

              <div className="mt-5 space-y-4">
                <div className="rounded-2xl bg-[#fdf8f3] p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#8a7b6d]">
                    <Users size={13} />
                    Audiência
                  </div>
                  <p className="mt-2 text-3xl font-bold text-[#3d2c1e]">{audience?.audienceCount || 0}</p>
                  <p className="text-sm text-[#6b5a4a]">
                    {audience ? `${audience.estimatedBookings.toFixed(0)} agendamentos estimados • R$ ${audience.estimatedRevenue.toFixed(0)} de potencial` : "Defina objetivo e público para projetar resultado."}
                  </p>
                </div>

                <div className="rounded-2xl bg-[#fdf8f3] p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#8a7b6d]">
                    <Sparkles size={13} />
                    Mensagem
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#3d2c1e] whitespace-pre-line">
                    {messagePreview?.renderedMessage || "A mensagem renderizada aparece aqui assim que você escrever."}
                  </p>
                  {messagePreview?.recommendation && (
                    <p className="mt-3 text-xs font-medium text-[#a67a44]">{messagePreview.recommendation}</p>
                  )}
                </div>

                {selectedTemplate && (
                  <div className="rounded-2xl border border-dashed border-[#eadfce] bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8a7b6d]">Modelo aplicado</p>
                    <p className="mt-2 font-semibold text-[#3d2c1e]">{selectedTemplate.name}</p>
                    <p className="mt-1 text-sm text-[#6b5a4a]">{selectedTemplate.tone}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
