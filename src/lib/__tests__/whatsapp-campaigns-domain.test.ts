import { describe, expect, it } from "vitest";
import {
  buildOpportunityDedupeKey,
  estimateCampaignPerformance,
  extractPlaceholders,
  previewMessage,
  renderMessageTemplate,
} from "../../../supabase/functions/_shared/campaigns/domain.ts";

describe("whatsapp campaign domain", () => {
  it("renders placeholders and appends booking link when needed", () => {
    const rendered = renderMessageTemplate(
      "Oi, {nome}. Seu retorno para {servico} pode ser agora.",
      {
        nome: "Marina",
        servico: "escova",
      },
      "booking_link",
      { bookingLink: "https://gende.io/studio" },
    );

    expect(rendered).toContain("Marina");
    expect(rendered).toContain("escova");
    expect(rendered).toContain("https://gende.io/studio");
  });

  it("extracts placeholders and warns when booking CTA misses link", () => {
    const result = previewMessage({
      messageBody: "Oi, {nome}. Seu horário para {servico} está quase pronto.",
      ctaType: "booking_link",
      ctaPayload: {},
      sampleRecipient: { nome: "Bia", servico: "unhas" },
    });

    expect(extractPlaceholders(result.renderedMessage)).toEqual([]);
    expect(result.placeholders).toEqual(["nome", "servico"]);
    expect(result.recommendation).toContain("link de agendamento");
  });

  it("estimates better performance for strong objectives and qualified audiences", () => {
    const reactivation = estimateCampaignPerformance({
      objective: "reativacao",
      audienceType: "inativos",
      audienceCount: 40,
      averageTicket: 120,
      returnRate: 0.18,
    });

    const maintenance = estimateCampaignPerformance({
      objective: "manutencao",
      audienceType: "janela_manutencao",
      audienceCount: 40,
      averageTicket: 120,
      returnRate: 0.18,
    });

    expect(maintenance.estimatedConversionRate).toBeGreaterThan(reactivation.estimatedConversionRate);
    expect(maintenance.estimatedRevenue).toBeGreaterThan(reactivation.estimatedRevenue);
  });

  it("builds stable dedupe keys", () => {
    expect(buildOpportunityDedupeKey("Service_Drop", "Lash-2026")).toBe("service_drop:lash-2026");
  });
});
