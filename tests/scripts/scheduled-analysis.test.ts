import { describe, expect, it } from "vitest";
import { decideAutoSchedulerJob, decideSchedulerJob } from "@/lib/scheduler/decision";
import type { SchedulerSettings } from "@/lib/types";

describe("scheduled analysis decisions", () => {
  it("enables risk-warning push at keypoint times when notification switches are on", () => {
    const decision = decideAutoSchedulerJob(cnDate("2026-06-18T14:50:00+08:00"), settings({
      pushNotification: true,
      riskWarningPushEnabled: true,
      auctionWatchlistPushEnabled: true
    }));

    expect(decision).toMatchObject({
      shouldRun: true,
      jobType: "keypoint",
      pushNotification: true,
      auctionWatchlistPush: true,
      riskWarningPush: true
    });
  });

  it("keeps risk-warning push off when the dedicated switch is off", () => {
    const decision = decideAutoSchedulerJob(cnDate("2026-06-18T15:10:00+08:00"), settings({
      pushNotification: true,
      riskWarningPushEnabled: false
    }));

    expect(decision.shouldRun).toBe(true);
    expect(decision.riskWarningPush).toBe(false);
  });

  it("does not push notifications for deep research or lightweight scans", () => {
    const deepResearch = decideAutoSchedulerJob(cnDate("2026-06-18T20:30:00+08:00"), settings({
      pushNotification: true,
      riskWarningPushEnabled: true
    }));
    const scan = decideAutoSchedulerJob(cnDate("2026-06-18T10:00:00+08:00"), settings({
      pushNotification: true,
      riskWarningPushEnabled: true,
      intradayIntervalMinutes: 10
    }));

    expect(deepResearch.jobType).toBe("deep-research");
    expect(deepResearch.riskWarningPush).toBe(false);
    expect(scan.jobType).toBe("scan");
    expect(scan.riskWarningPush).toBe(false);
  });

  it("skips non-trading-day keypoints in auto mode but keeps manual keypoint explicit", () => {
    const autoDecision = decideAutoSchedulerJob(cnDate("2026-06-20T14:50:00+08:00"), settings({
      pushNotification: true,
      riskWarningPushEnabled: true
    }));
    const manualDecision = decideSchedulerJob("keypoint", settings({
      pushNotification: true,
      riskWarningPushEnabled: true
    }), cnDate("2026-06-20T14:50:00+08:00"));

    expect(autoDecision).toMatchObject({
      shouldRun: false,
      jobType: "skip",
      useLLM: false,
      pushNotification: false,
      riskWarningPush: false
    });
    expect(manualDecision).toMatchObject({
      shouldRun: true,
      jobType: "keypoint",
      useLLM: true,
      pushNotification: true,
      riskWarningPush: true
    });
  });
});

function settings(overrides: Partial<SchedulerSettings> = {}): SchedulerSettings {
  return {
    enabled: true,
    intradayScanEnabled: true,
    intradayIntervalMinutes: 10,
    keypointTimes: ["08:50", "09:26", "11:35", "14:50", "15:10"],
    deepResearchTimes: ["20:30"],
    llmOnEvent: true,
    pushNotification: false,
    auctionWatchlistPushEnabled: false,
    riskWarningPushEnabled: true,
    ...overrides
  };
}

function cnDate(value: string) {
  return new Date(value);
}
