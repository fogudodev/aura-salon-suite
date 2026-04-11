import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-700 border-slate-200",
  scheduled: "bg-blue-500/10 text-blue-700 border-blue-200",
  processing: "bg-amber-500/10 text-amber-700 border-amber-200",
  sending: "bg-amber-500/10 text-amber-700 border-amber-200",
  sent: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  queued: "bg-stone-500/10 text-stone-700 border-stone-200",
  delivered: "bg-cyan-500/10 text-cyan-700 border-cyan-200",
  read: "bg-sky-500/10 text-sky-700 border-sky-200",
  replied: "bg-indigo-500/10 text-indigo-700 border-indigo-200",
  clicked: "bg-purple-500/10 text-purple-700 border-purple-200",
  booked: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  opted_out: "bg-rose-500/10 text-rose-700 border-rose-200",
  retrying: "bg-amber-500/10 text-amber-700 border-amber-200",
  paused: "bg-orange-500/10 text-orange-700 border-orange-200",
  cancelled: "bg-rose-500/10 text-rose-700 border-rose-200",
  completed: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  failed: "bg-red-500/10 text-red-700 border-red-200",
  skipped: "bg-slate-500/10 text-slate-600 border-slate-200",
  new: "bg-indigo-500/10 text-indigo-700 border-indigo-200",
  notified: "bg-violet-500/10 text-violet-700 border-violet-200",
  viewed: "bg-sky-500/10 text-sky-700 border-sky-200",
  dismissed: "bg-slate-500/10 text-slate-600 border-slate-200",
  converted_to_campaign: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  expired: "bg-slate-500/10 text-slate-600 border-slate-200",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  scheduled: "Agendada",
  processing: "Processando",
  sending: "Enviando",
  sent: "Enviada",
  queued: "Na fila",
  delivered: "Entregue",
  read: "Lida",
  replied: "Respondeu",
  clicked: "Clicou",
  booked: "Agendou",
  opted_out: "Opt-out",
  retrying: "Tentando de novo",
  paused: "Pausada",
  cancelled: "Cancelada",
  completed: "Concluida",
  failed: "Falhou",
  skipped: "Ignorado",
  new: "Nova",
  notified: "Notificada",
  viewed: "Vista",
  dismissed: "Ignorada",
  converted_to_campaign: "Virou campanha",
  expired: "Expirada",
};

export const CampaignStatusBadge = ({ status }: { status: string }) => (
  <Badge
    variant="outline"
    className={cn("rounded-full px-3 py-1 text-xs font-medium", STATUS_STYLES[status] || STATUS_STYLES.draft)}
  >
    {STATUS_LABELS[status] || status}
  </Badge>
);
