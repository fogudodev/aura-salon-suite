import { describe, expect, it } from "vitest";
import {
  scoreAttributionCandidate,
  shouldReassignAttribution,
} from "../../../supabase/functions/_shared/campaigns/phase3-domain.ts";

const baseRecipient = {
  id: "r1",
  campaign_id: "c1",
  client_id: "cl1",
  phone: "5511999999999",
  personalization_payload_json: {},
  recipient_status: "sent",
  provider_message_id: null,
  sent_at: new Date("2026-04-01T10:00:00.000Z").toISOString(),
  delivered_at: null,
  read_at: null,
  replied_at: null,
  clicked_at: null,
  booked_at: null,
  revenue_generated: 0,
} as never;

describe("campaign attribution scoring", () => {
  it("scores reply stronger than click and click stronger than read", () => {
    const bookingReference = new Date("2026-04-01T14:00:00.000Z").getTime();

    const replyScore = scoreAttributionCandidate({
      recipient: { ...baseRecipient, replied_at: new Date("2026-04-01T12:00:00.000Z").toISOString() } as never,
      bookingReference,
    }).score;
    const clickScore = scoreAttributionCandidate({
      recipient: { ...baseRecipient, clicked_at: new Date("2026-04-01T12:00:00.000Z").toISOString() } as never,
      bookingReference,
    }).score;
    const readScore = scoreAttributionCandidate({
      recipient: { ...baseRecipient, read_at: new Date("2026-04-01T12:00:00.000Z").toISOString() } as never,
      bookingReference,
    }).score;

    expect(replyScore).toBeGreaterThan(clickScore);
    expect(clickScore).toBeGreaterThan(readScore);
  });

  it("reassigns only when new score beats threshold on different campaign", () => {
    expect(shouldReassignAttribution({
      existingCampaignId: "c-old",
      newCampaignId: "c-new",
      existingScore: 0.82,
      newScore: 0.9,
      threshold: 0.02,
    })).toBe(true);

    expect(shouldReassignAttribution({
      existingCampaignId: "c-old",
      newCampaignId: "c-new",
      existingScore: 0.88,
      newScore: 0.89,
      threshold: 0.02,
    })).toBe(false);
  });
});
