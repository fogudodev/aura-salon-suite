import { describe, expect, it } from "vitest";
import {
  resolveAutomationConfig,
  shouldAutoStartAutomation,
  shouldSkipAutomationRun,
} from "../../../supabase/functions/_shared/campaigns/phase3-domain.ts";

describe("campaign automation guards", () => {
  it("builds deterministic config for known trigger", () => {
    const config = resolveAutomationConfig("inactive_clients", { inactiveDays: 60 });

    expect(config.objective).toBe("reativacao");
    expect(config.audienceType).toBe("inativos");
    expect(config.audienceFilterJson).toMatchObject({
      audienceType: "inativos",
      inactiveDays: 60,
      consentOnly: true,
    });
  });

  it("skips inactive automation when not forced", () => {
    const result = shouldSkipAutomationRun({
      isActive: false,
      force: false,
    });
    expect(result.skip).toBe(true);
    expect(result.reason).toBe("inactive");
  });

  it("enforces cooldown and returns cooldownUntil", () => {
    const now = Date.now();
    const result = shouldSkipAutomationRun({
      isActive: true,
      force: false,
      lastRunAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      cooldownDays: 7,
      nowMs: now,
    });
    expect(result.skip).toBe(true);
    expect(result.reason).toBe("cooldown_active");
    expect(result.cooldownUntil).toBeTruthy();
  });

  it("respects optional auto-start", () => {
    expect(shouldAutoStartAutomation({ autoStart: true })).toBe(true);
    expect(shouldAutoStartAutomation({ autoStart: false })).toBe(false);
  });
});
