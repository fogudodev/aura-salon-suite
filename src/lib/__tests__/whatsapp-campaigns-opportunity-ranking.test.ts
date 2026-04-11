import { describe, expect, it } from "vitest";
import { computeOpportunityPriorityScore } from "../../../supabase/functions/_shared/campaigns/opportunity-engine.ts";

describe("lis opportunity ranking", () => {
  it("prioritizes higher weighted revenue by confidence", () => {
    const lowConfidenceHighRevenue = computeOpportunityPriorityScore({
      estimated_revenue: 2000,
      confidence_score: 0.4,
    } as never);
    const highConfidenceMediumRevenue = computeOpportunityPriorityScore({
      estimated_revenue: 1600,
      confidence_score: 0.8,
    } as never);

    expect(highConfidenceMediumRevenue).toBeGreaterThan(lowConfidenceHighRevenue);
  });

  it("returns zero when revenue or confidence is missing", () => {
    expect(computeOpportunityPriorityScore({ estimated_revenue: 0, confidence_score: 0.8 } as never)).toBe(0);
    expect(computeOpportunityPriorityScore({ estimated_revenue: 1000, confidence_score: 0 } as never)).toBe(0);
  });
});
