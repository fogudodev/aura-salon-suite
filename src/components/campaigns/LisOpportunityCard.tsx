import { Button } from "@/components/ui/button";
import { CampaignStatusBadge } from "./CampaignStatusBadge";
import { ArrowRight, BellOff, Clock3, Eye, Sparkles, Target, TrendingUp } from "lucide-react";
import type { LisOpportunity } from "@/types/whatsapp-campaigns";

const urgencyStyles: Record<string, string> = {
  high: "text-rose-600 bg-rose-500/10",
  medium: "text-amber-600 bg-amber-500/10",
  low: "text-sky-600 bg-sky-500/10",
};

export function LisOpportunityCard(props: {
  opportunity: LisOpportunity;
  highlighted?: boolean;
  busy?: boolean;
  onView: () => void;
  onDismiss: () => void;
  onRemindLater: () => void;
  onGenerateDraft: () => void;
}) {
  const { opportunity } = props;

  return (
    <div className={`rounded-[28px] border bg-white p-5 shadow-[0_20px_50px_-35px_rgba(61,44,30,0.28)] transition-all ${props.highlighted ? "border-[#d4a84b] ring-2 ring-[#f5dcc3]" : "border-[#eadfce]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#f5dcc3] px-3 py-1 text-xs font-semibold text-[#d4a84b]">
              <Sparkles size={12} />
              Radar da Lis
            </span>
            <CampaignStatusBadge status={opportunity.status} />
            <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${urgencyStyles[opportunity.urgency_level] || urgencyStyles.medium}`}>
              {opportunity.urgency_level === "high" ? "Urgencia alta" : opportunity.urgency_level === "medium" ? "Janela boa" : "Baixa urgencia"}
            </span>
          </div>
          <h3 className="text-xl font-bold leading-tight text-[#3d2c1e]">{opportunity.title}</h3>
          <p className="mt-2 text-sm leading-6 text-[#6b5a4a]">{opportunity.summary}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-[#fdf8f3] p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[#a67a44]">
            <Target size={13} />
            Publico estimado
          </div>
          <p className="text-2xl font-bold text-[#3d2c1e]">{opportunity.audience_count}</p>
          <p className="text-xs text-[#8a7b6d]">contatos elegiveis</p>
        </div>
        <div className="rounded-2xl bg-[#fdf8f3] p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[#a67a44]">
            <TrendingUp size={13} />
            Conversao estimada
          </div>
          <p className="text-2xl font-bold text-[#3d2c1e]">{Math.round(opportunity.estimated_conversion_rate * 100)}%</p>
          <p className="text-xs text-[#8a7b6d]">{opportunity.estimated_bookings.toFixed(0)} agendamentos potenciais</p>
        </div>
        <div className="rounded-2xl bg-[#fdf8f3] p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[#a67a44]">
            <ArrowRight size={13} />
            Impacto financeiro
          </div>
          <p className="text-2xl font-bold text-[#3d2c1e]">R$ {opportunity.estimated_revenue.toFixed(0)}</p>
          <p className="text-xs text-[#8a7b6d]">confianca {Math.round(opportunity.confidence_score * 100)}%</p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-[#efe5d8] bg-[#fffdfa] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a67a44]">Motivo da recomendacao</p>
        <p className="mt-2 text-sm leading-6 text-[#6b5a4a]">{opportunity.reason}</p>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          onClick={props.onGenerateDraft}
          disabled={props.busy}
          className="rounded-2xl bg-[#eebf9c] text-[#3d2c1e] hover:bg-[#d4a84b]"
        >
          Gerar campanha
        </Button>
        <Button onClick={props.onView} disabled={props.busy} variant="outline" className="rounded-2xl border-[#eadfce]">
          <Eye size={14} className="mr-2" />
          Ver detalhes
        </Button>
        <Button onClick={props.onRemindLater} disabled={props.busy} variant="ghost" className="rounded-2xl text-[#6b5a4a]">
          <Clock3 size={14} className="mr-2" />
          Lembrar depois
        </Button>
        <Button onClick={props.onDismiss} disabled={props.busy} variant="ghost" className="rounded-2xl text-[#8a7b6d]">
          <BellOff size={14} className="mr-2" />
          Ignorar
        </Button>
      </div>
    </div>
  );
}
