import { describe, expect, it, vi } from "vitest";

describe("aggregation snapshot caches", () => {
  it("reuses the data source health cache for the same limit", async () => {
    vi.resetModules();
    const dbAll = vi.fn(() => [
      {
        id: "report-1",
        createdAt: new Date().toISOString(),
        factPackageJson: JSON.stringify({
          dataSource: {
            traces: [
              {
                provider: "eastmoney_public",
                providerName: "东方财富公开接口",
                scope: "market",
                field: "breadth",
                quality: "primary",
                freshness: "realtime",
                fetchedAt: new Date().toISOString()
              }
            ],
            warningDetails: []
          }
        })
      }
    ]);
    const dbRun = vi.fn();
    const dbTransaction = vi.fn((_label: string, fn: () => void) => fn());
    vi.doMock("@/lib/db/client", () => ({ dbAll, dbRun, dbTransaction }));

    const { buildDataSourceHealth } = await import("@/lib/db/dataSourceHealth");
    const first = buildDataSourceHealth(20);
    const callsAfterFirst = dbAll.mock.calls.length;
    const second = buildDataSourceHealth(20);

    expect(first.cacheStatus).toBe("miss");
    expect(second.cacheStatus).toBe("hit");
    expect(second.cacheTtlSeconds).toBeGreaterThan(0);
    expect(dbAll).toHaveBeenCalledTimes(callsAfterFirst);
  });

  it("reuses the rule bottleneck cache and exposes cache metadata to auction watchlist", async () => {
    vi.resetModules();
    const dbAll = vi.fn(() => [
      {
        id: "report-1",
        createdAt: new Date().toISOString(),
        factPackageJson: JSON.stringify({
          dataSource: { traces: [], warningDetails: [] },
          market: { marketState: "defensive" },
          sectors: [],
          candidates: [],
          ruleResult: { market: { marketState: "defensive", maxTotalPositionPct: 0 } }
        })
      }
    ]);
    const dbRun = vi.fn();
    const dbTransaction = vi.fn((_label: string, fn: () => void) => fn());
    vi.doMock("@/lib/db/client", () => ({ dbAll, dbRun, dbTransaction }));

    const { buildAuctionWatchlistSnapshot } = await import("@/lib/db/auctionWatchlist");
    const first = buildAuctionWatchlistSnapshot(80, 6);
    const callsAfterFirst = dbAll.mock.calls.length;
    const second = buildAuctionWatchlistSnapshot(80, 6);
    const { buildRuleBottleneckSnapshot } = await import("@/lib/db/ruleBottleneck");
    const bottleneck = buildRuleBottleneckSnapshot(80);

    expect(bottleneck.calibration.stance).toBe("样本不足");
    expect(bottleneck.calibration.metrics.length).toBeGreaterThan(0);
    expect(bottleneck.calibration.recommendations.length).toBeGreaterThan(0);
    expect(first.cacheStatus).toBe("miss");
    expect(second.cacheStatus).toBe("hit");
    expect(second.cacheTtlSeconds).toBeGreaterThan(0);
    expect(dbAll).toHaveBeenCalledTimes(callsAfterFirst);
  });
});
