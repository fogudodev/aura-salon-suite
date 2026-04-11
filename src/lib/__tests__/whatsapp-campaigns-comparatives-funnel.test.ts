import { describe, expect, it } from "vitest";
import { buildCampaignComparatives } from "../../../supabase/functions/_shared/campaigns/campaign-service.ts";

describe("campaign comparatives and lis funnel", () => {
  it("aggregates objective/segment/hour and lis funnel outputs", () => {
    const campaigns = [
      {
        id: "c1",
        name: "Lis Reactivacao",
        objective: "reativacao",
        audience_type: "inativos",
        source_opportunity_id: "op1",
        status: "completed",
        started_at: "2026-04-01T09:00:00.000Z",
        operational_metrics: {
          sentCount: 20,
          deliveredCount: 18,
          readCount: 15,
          replyCount: 5,
          clickCount: 4,
          bookingCount: 3,
          failureCount: 1,
          revenueGenerated: 900,
        },
      },
      {
        id: "c2",
        name: "Manual Promo",
        objective: "promocao",
        audience_type: "vip",
        source_opportunity_id: null,
        status: "completed",
        started_at: "2026-04-01T15:00:00.000Z",
        operational_metrics: {
          sentCount: 10,
          deliveredCount: 9,
          readCount: 7,
          replyCount: 2,
          clickCount: 1,
          bookingCount: 1,
          failureCount: 0,
          revenueGenerated: 250,
        },
      },
    ] as never;

    const recipientRows = [
      { campaign_id: "c1", sent_at: "2026-04-01T09:10:00.000Z", replied_at: "2026-04-01T10:00:00.000Z", clicked_at: null, booked_at: null, revenue_generated: 0 },
      { campaign_id: "c1", sent_at: "2026-04-01T09:20:00.000Z", replied_at: null, clicked_at: "2026-04-01T10:30:00.000Z", booked_at: null, revenue_generated: 0 },
      { campaign_id: "c2", sent_at: "2026-04-01T15:05:00.000Z", replied_at: null, clicked_at: null, booked_at: "2026-04-01T16:00:00.000Z", revenue_generated: 250 },
    ] as never;

    const attributions = [
      { campaign_id: "c1", revenue_amount: 500 },
      { campaign_id: "c1", revenue_amount: 400 },
    ] as never;

    const opportunities = [
      { id: "op1", status: "converted_to_campaign", converted_campaign_id: "c1" },
      { id: "op2", status: "notified", converted_campaign_id: null },
    ] as never;

    const result = buildCampaignComparatives({
      campaigns,
      recipientRows,
      attributionRows: attributions,
      opportunityRows: opportunities,
    });

    expect(result.objective.length).toBeGreaterThan(0);
    expect(result.segment.length).toBeGreaterThan(0);
    expect(result.sendHour.length).toBeGreaterThan(0);
    expect(result.lisFunnel.opportunities_detected).toBe(2);
    expect(result.lisFunnel.campaigns_generated).toBe(1);
    expect(result.lisFunnel.bookings_generated).toBe(2);
    expect(result.lisFunnel.revenue_generated).toBe(900);
  });
});
