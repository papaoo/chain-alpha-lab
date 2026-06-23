import { describe, expect, it } from "vitest";
import { buildReportFreshness } from "@/lib/market/freshness";
import type { AnalysisReport } from "@/lib/types";

describe("report freshness", () => {
  it("marks same-trade-date intraday reports as historical after postmarket", () => {
    const report = {
      createdAt: "2026-06-22T05:15:00.000Z",
      factPackage: {
        timestamp: "2026-06-22T05:15:00.000Z",
        tradeDate: "20260622",
        session: {
          phase: "afternoon"
        }
      }
    } as Pick<AnalysisReport, "createdAt" | "factPackage">;

    const freshness = buildReportFreshness(report, {
      timestamp: "2026-06-22T07:33:00.000Z",
      effectiveTradeDate: "20260622",
      phase: "postmarket",
      isTradingSession: false
    });

    expect(freshness.status).toBe("stale");
    expect(freshness.title).toContain("历史快照");
    expect(freshness.message).toContain("收盘后");
  });

  it("does not mark same-trade-date postmarket reports stale only because they are older than 30 minutes", () => {
    const report = {
      createdAt: "2026-06-22T07:10:00.000Z",
      factPackage: {
        timestamp: "2026-06-22T07:10:00.000Z",
        tradeDate: "20260622",
        session: {
          phase: "postmarket"
        }
      }
    } as Pick<AnalysisReport, "createdAt" | "factPackage">;

    const freshness = buildReportFreshness(report, {
      timestamp: "2026-06-22T08:00:00.000Z",
      effectiveTradeDate: "20260622",
      phase: "postmarket",
      isTradingSession: false
    });

    expect(freshness.status).toBe("current");
  });
});
