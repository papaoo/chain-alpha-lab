import { describe, expect, it } from "vitest";
import { calculateTrackingPerformance, resolveTrackingBaselinePrice, returnPct } from "@/lib/db/stockTrackingPerformance";

describe("stock tracking performance", () => {
  it("prefers the recorded baseline quote over simulated price", () => {
    const baseline = resolveTrackingBaselinePrice({
      simulatedPrice: 9.8,
      baselineTrace: { price: 10.2 },
      snapshots: [
        { createdAt: "2026-06-22T01:30:00.000Z", latestPrice: 10.5 }
      ]
    });

    expect(baseline).toBe(10.2);
  });

  it("falls back to the first valid snapshot when no baseline exists", () => {
    const baseline = resolveTrackingBaselinePrice({
      snapshots: [
        { createdAt: "2026-06-22T01:30:00.000Z", latestPrice: undefined },
        { createdAt: "2026-06-22T01:31:00.000Z", latestPrice: 8.5 },
        { createdAt: "2026-06-22T01:32:00.000Z", latestPrice: 8.8 }
      ]
    });

    expect(baseline).toBe(8.5);
  });

  it("calculates latest return, best return and drawdown from snapshots", () => {
    const performance = calculateTrackingPerformance(10, [
      { createdAt: "2026-06-22T01:30:00.000Z", latestPrice: 10 },
      { createdAt: "2026-06-22T01:31:00.000Z", latestPrice: 12 },
      { createdAt: "2026-06-22T01:32:00.000Z", latestPrice: 9 },
      { createdAt: "2026-06-22T01:33:00.000Z", latestPrice: 11 }
    ]);

    expect(performance).toMatchObject({
      baselinePrice: 10,
      latestPrice: 11,
      latestReturnPct: 10,
      bestPrice: 12,
      bestReturnPct: 20,
      worstPrice: 9,
      worstReturnPct: -10,
      maxDrawdownPct: -25,
      snapshotCount: 4
    });
  });

  it("returns undefined return when baseline or latest price is unavailable", () => {
    expect(returnPct(undefined, 10)).toBeUndefined();
    expect(returnPct(10, undefined)).toBeUndefined();
    expect(returnPct(0, 10)).toBeUndefined();
  });
});
