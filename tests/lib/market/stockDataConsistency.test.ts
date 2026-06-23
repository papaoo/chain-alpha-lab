import { describe, expect, it } from "vitest";
import { buildStockDataConsistency } from "@/lib/market/stockDataConsistency";

describe("stock data consistency", () => {
  it("marks aligned quote, kline and baseline as ok", () => {
    const result = buildStockDataConsistency({
      latestPrice: 10.02,
      baselinePrice: 9.8,
      baselineFetchedAt: "2026-06-05T01:30:00.000Z",
      quoteUpdatedAt: "2026-06-05T07:00:00.000Z",
      snapshotFetchedAt: "2026-06-05T07:03:00.000Z",
      latestKlineTradeDate: "20260605",
      expectedKlineTradeDate: "20260605",
      klineFreshnessStatus: "current",
      klineClose: 10,
      referencePrice: 10.01,
      referenceLabel: "报告快照价"
    });

    expect(result.tone).toBe("ok");
    expect(result.warnings).toHaveLength(0);
  });

  it("marks stale kline date as risk", () => {
    const result = buildStockDataConsistency({
      latestPrice: 12,
      quoteUpdatedAt: "2026-06-05T02:30:00.000Z",
      snapshotFetchedAt: "2026-06-05T02:31:00.000Z",
      latestKlineTradeDate: "20260604",
      expectedKlineTradeDate: "20260605",
      klineFreshnessStatus: "stale",
      klineClose: 11.8
    });

    expect(result.tone).toBe("risk");
    expect(result.checks.find((item) => item.key === "kline_date")?.tone).toBe("risk");
  });

  it("asks for review when quote date is newer than kline date", () => {
    const result = buildStockDataConsistency({
      latestPrice: 12,
      quoteUpdatedAt: "2026-06-05T02:30:00.000Z",
      snapshotFetchedAt: "2026-06-05T02:31:00.000Z",
      latestKlineTradeDate: "20260604",
      klineClose: 11.9
    });

    expect(result.tone).toBe("review");
    expect(result.summary).toContain("报价日期");
  });

  it("asks for review when tracking baseline is missing", () => {
    const result = buildStockDataConsistency({
      latestPrice: 8.8,
      quoteUpdatedAt: "2026-06-05T02:30:00.000Z",
      snapshotFetchedAt: "2026-06-05T02:31:00.000Z",
      latestKlineTradeDate: "20260605",
      klineClose: 8.81
    });

    expect(result.tone).toBe("review");
    expect(result.checks.find((item) => item.key === "baseline")?.tone).toBe("review");
  });

  it("can skip baseline checks for generic hover cards", () => {
    const result = buildStockDataConsistency({
      latestPrice: 8.8,
      quoteUpdatedAt: "2026-06-05T02:30:00.000Z",
      snapshotFetchedAt: "2026-06-05T02:31:00.000Z",
      latestKlineTradeDate: "20260605",
      klineClose: 8.81,
      requireBaseline: false
    });

    expect(result.tone).toBe("ok");
    expect(result.checks.find((item) => item.key === "baseline")).toBeUndefined();
  });

  it("marks large reference price mismatch as risk", () => {
    const result = buildStockDataConsistency({
      latestPrice: 15,
      baselinePrice: 14.8,
      quoteUpdatedAt: "2026-06-05T02:30:00.000Z",
      snapshotFetchedAt: "2026-06-05T02:31:00.000Z",
      latestKlineTradeDate: "20260605",
      klineClose: 14.98,
      referencePrice: 13.8,
      referenceLabel: "报告快照价"
    });

    expect(result.tone).toBe("risk");
    expect(result.checks.find((item) => item.key === "reference_price")?.tone).toBe("risk");
  });
});
