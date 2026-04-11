import type { CampaignObjective } from "./types.ts";

export const SYSTEM_TEMPLATE_CATALOG = [
  {
    name: "Reativação elegante",
    category: "marketing",
    objective: "reativacao" as CampaignObjective,
    tone: "premium",
    body: "Oi, {nome}. Faz um tempinho desde a sua última visita e a Lis separou um lembrete especial: temos uma boa janela para você voltar com {servico}. Se quiser, eu já deixo seu agendamento encaminhado aqui: {link_agendamento}",
    variables: ["nome", "servico", "link_agendamento"],
  },
  {
    name: "Agenda ociosa amanhã",
    category: "marketing",
    objective: "preenchimento_agenda" as CampaignObjective,
    tone: "direct",
    body: "Oi, {nome}. Acabou de abrir um horário ótimo {janela_envio} com {profissional}. Se fizer sentido para você, posso te colocar nele agora: {link_agendamento}",
    variables: ["nome", "janela_envio", "profissional", "link_agendamento"],
  },
  {
    name: "Janela de manutenção",
    category: "marketing",
    objective: "manutencao" as CampaignObjective,
    tone: "human",
    body: "Oi, {nome}. Pela sua rotina com {servico}, este é um ótimo momento para manutenção. Se quiser garantir um horário antes da agenda apertar, aqui está seu link: {link_agendamento}",
    variables: ["nome", "servico", "link_agendamento"],
  },
  {
    name: "Aniversário com mimo",
    category: "marketing",
    objective: "aniversario" as CampaignObjective,
    tone: "human",
    body: "Parabéns, {nome}! Neste mês especial, separei uma condição pensada para você voltar com {servico}. Se quiser aproveitar, é só responder por aqui ou usar este link: {link_agendamento}",
    variables: ["nome", "servico", "link_agendamento"],
  },
  {
    name: "Upsell pós-atendimento",
    category: "marketing",
    objective: "upsell" as CampaignObjective,
    tone: "premium",
    body: "Oi, {nome}. Como você gostou de {servico}, a Lis separou uma sugestão que combina muito com seu atendimento: {servico_extra}. Se quiser, já deixo o próximo horário reservado por aqui: {link_agendamento}",
    variables: ["nome", "servico", "servico_extra", "link_agendamento"],
  },
];

export function buildToneVariations(message: string) {
  return {
    direct: message
      .replace("Se quiser", "Se fizer sentido")
      .replace("Oi,", "Oi,")
      .trim(),
    elegant: `Com carinho, ${message}`.replace("Oi,", "Olá,"),
    premium: `${message}\n\nSe preferir, eu priorizo um bom horário para você.`,
    human: message.replace("a Lis separou", "eu separei"),
    short: message.length > 170 ? `${message.slice(0, 167).trim()}...` : message,
  };
}
