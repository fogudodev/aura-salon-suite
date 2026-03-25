import { useState, useMemo } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useProfessional } from "@/hooks/useProfessional";
import { useServices } from "@/hooks/useServices";
import { useUpsellRules, useUpsertUpsellRule, useDeleteUpsellRule } from "@/hooks/useUpsell";
import { Loader2, Plus, Trash2, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

const timingOptions = [
  { value: "immediate", label: "Imediatamente após agendamento" },
  { value: "3h_before", label: "3h antes do atendimento" },
  { value: "24h_before", label: "24h antes do atendimento" },
];

const UpsellConfig = () => {
  const { data: professional } = useProfessional();
  const { data: services, isLoading: servicesLoading } = useServices();
  const { data: rules, isLoading: rulesLoading } = useUpsellRules(professional?.id);
  const upsertMutation = useUpsertUpsellRule();
  const deleteMutation = useDeleteUpsellRule();

  const [sourceServiceId, setSourceServiceId] = useState("");
  const [recommendedServiceId, setRecommendedServiceId] = useState("");
  const [promoMessage, setPromoMessage] = useState("");
  const [promoPrice, setPromoPrice] = useState("");
  const [priority, setPriority] = useState("1");
  const [discountPercentage, setDiscountPercentage] = useState("0");
  const [messageTemplate, setMessageTemplate] = useState(
    "Oi {nome}, vi que você agendou {servico} 💁‍♀️ Que tal potencializar o resultado com {upsell}? Hoje com {desconto}% OFF 😍 Quer adicionar no seu horário?"
  );
  const [sendTiming, setSendTiming] = useState("immediate");

  const isLoading = servicesLoading || rulesLoading;

  const serviceMap = useMemo(() => {
    const map: Record<string, string> = {};
    (services || []).forEach(s => { map[s.id] = s.name; });
    return map;
  }, [services]);

  const handleAdd = () => {
    if (!sourceServiceId || !recommendedServiceId || !professional) {
      toast.error("Selecione os serviços");
      return;
    }
    if (sourceServiceId === recommendedServiceId) {
      toast.error("Serviço principal e recomendado devem ser diferentes");
      return;
    }
    upsertMutation.mutate({
      professional_id: professional.id,
      source_service_id: sourceServiceId,
      recommended_service_id: recommendedServiceId,
      promo_message: promoMessage || null,
      promo_price: promoPrice ? parseFloat(promoPrice) : null,
      priority: parseInt(priority) || 1,
      discount_percentage: parseFloat(discountPercentage) || 0,
      message_template: messageTemplate || null,
      send_timing: sendTiming,
      is_active: true,
    }, {
      onSuccess: () => {
        setSourceServiceId("");
        setRecommendedServiceId("");
        setPromoMessage("");
        setPromoPrice("");
        setPriority("1");
        setDiscountPercentage("0");
        setMessageTemplate("Oi {nome}, vi que você agendou {servico} 💁‍♀️ Que tal potencializar o resultado com {upsell}? Hoje com {desconto}% OFF 😍 Quer adicionar no seu horário?");
        setSendTiming("immediate");
      },
    });
  };

  const toggleActive = (rule: any) => {
    upsertMutation.mutate({
      ...rule,
      is_active: !rule.is_active,
    });
  };

  return (
    <DashboardLayout title="Upsell Inteligente" subtitle="Configure sugestões de serviços complementares">
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      ) : (
        <div className="space-y-6 max-w-3xl">
          {/* Header with icon */}
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <Sparkles size={20} className="text-accent" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Regras de Upsell</h2>
                <p className="text-xs text-muted-foreground">Defina quais serviços sugerir quando um cliente agendar</p>
              </div>
            </div>

            {/* Add form */}
            <div className="space-y-3 p-4 rounded-xl bg-muted/30 border border-border">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Serviço principal</label>
                  <Select value={sourceServiceId} onValueChange={setSourceServiceId}>
                    <SelectTrigger><SelectValue placeholder="Quando agendar..." /></SelectTrigger>
                    <SelectContent>
                      {(services || []).filter(s => s.active).map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Sugerir serviço</label>
                  <Select value={recommendedServiceId} onValueChange={setRecommendedServiceId}>
                    <SelectTrigger><SelectValue placeholder="Recomendar..." /></SelectTrigger>
                    <SelectContent>
                      {(services || []).filter(s => s.active && s.id !== sourceServiceId).map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name} - R$ {Number(s.price).toFixed(2)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Preço promocional</label>
                  <Input type="number" value={promoPrice} onChange={e => setPromoPrice(e.target.value)} placeholder="R$ 0,00" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Desconto (%)</label>
                  <Input type="number" value={discountPercentage} onChange={e => setDiscountPercentage(e.target.value)} min="0" max="100" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Prioridade</label>
                  <Input type="number" value={priority} onChange={e => setPriority(e.target.value)} min="1" max="10" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Enviar quando</label>
                  <Select value={sendTiming} onValueChange={setSendTiming}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {timingOptions.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Mensagem promocional (exibida na página pública)</label>
                <Input value={promoMessage} onChange={e => setPromoMessage(e.target.value)} placeholder="Ex: Promoção especial!" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Template WhatsApp — variáveis: {"{nome}"}, {"{servico}"}, {"{upsell}"}, {"{desconto}"}
                </label>
                <Textarea
                  value={messageTemplate}
                  onChange={e => setMessageTemplate(e.target.value)}
                  rows={3}
                  placeholder="Oi {nome}, vi que você agendou {servico}..."
                />
              </div>
              <Button onClick={handleAdd} disabled={upsertMutation.isPending} className="w-full sm:w-auto">
                <Plus size={16} className="mr-2" />
                Adicionar regra
              </Button>
            </div>
          </div>

          {/* Rules list */}
          <div className="space-y-2">
            {(rules || []).length === 0 ? (
              <div className="glass-card rounded-2xl p-8 text-center">
                <Sparkles size={32} className="mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">Nenhuma regra de upsell configurada</p>
                <p className="text-xs text-muted-foreground mt-1">Adicione regras para começar a sugerir serviços complementares</p>
              </div>
            ) : (
              (rules || []).map(rule => (
                <div key={rule.id} className="glass-card rounded-xl p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{serviceMap[rule.source_service_id] || "—"}</span>
                      <ArrowRight size={14} className="text-accent" />
                      <span className="text-sm font-medium text-accent">{serviceMap[rule.recommended_service_id] || "—"}</span>
                      {rule.promo_price && (
                        <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">
                          R$ {Number(rule.promo_price).toFixed(2)}
                        </span>
                      )}
                      {rule.discount_percentage > 0 && (
                        <span className="text-xs bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full">
                          {rule.discount_percentage}% OFF
                        </span>
                      )}
                    </div>
                    {rule.promo_message && (
                      <p className="text-xs text-muted-foreground mt-0.5">{rule.promo_message}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[11px] text-muted-foreground">
                        {rule.suggestion_count} sugestões · {rule.conversion_count} conversões
                        {rule.suggestion_count > 0 && ` · ${Math.round((rule.conversion_count / rule.suggestion_count) * 100)}% taxa`}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        · {timingOptions.find(t => t.value === rule.send_timing)?.label || rule.send_timing}
                      </span>
                    </div>
                  </div>
                  <Switch checked={rule.is_active} onCheckedChange={() => toggleActive(rule)} />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10">
                        <Trash2 size={16} />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover regra?</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate(rule.id)}>Remover</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default UpsellConfig;
