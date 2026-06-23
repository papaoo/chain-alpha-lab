import { describe, expect, it } from "vitest";
import { __testStockSnapshotActionability } from "@/lib/market/stockSnapshot";

const completeCoverage = {
  quote: true,
  kline: true,
  technical: true,
  fundFlow: true
};

describe("stock snapshot actionability by market session", () => {
  it("treats postmarket complete snapshots as review reference instead of stale failure", () => {
    const actionability = __testStockSnapshotActionability({
      quality: "complete",
      coverage: completeCoverage,
      quoteUpdatedAt: "2026-06-05T07:00:00.000Z",
      fetchedAt: "2026-06-05T07:05:00.000Z",
      warnings: [],
      now: "2026-06-05T16:30:00+08:00"
    });

    expect(actionability.level).toBe("reference_only");
    expect(actionability.label).toBe("收盘复盘可用");
    expect(actionability.reason).toContain("收盘后");
    expect(actionability.sessionPhase).toBe("postmarket");
  });

  it("keeps intraday stale quotes as reference only", () => {
    const actionability = __testStockSnapshotActionability({
      quality: "complete",
      coverage: completeCoverage,
      quoteUpdatedAt: "2026-06-05T01:40:00.000Z",
      fetchedAt: "2026-06-05T01:40:00.000Z",
      warnings: [],
      now: "2026-06-05T10:30:00+08:00"
    });

    expect(actionability.level).toBe("reference_only");
    expect(actionability.label).toBe("仅可参考");
    expect(actionability.reason).toContain("超过 30 分钟");
    expect(actionability.sessionPhase).toBe("morning");
  });

  it("allows fresh complete snapshots during continuous auction", () => {
    const actionability = __testStockSnapshotActionability({
      quality: "complete",
      coverage: completeCoverage,
      quoteUpdatedAt: "2026-06-05T02:29:00.000Z",
      fetchedAt: "2026-06-05T02:29:00.000Z",
      warnings: [],
      now: "2026-06-05T10:30:00+08:00"
    });

    expect(actionability.level).toBe("actionable");
    expect(actionability.sessionPhase).toBe("morning");
  });

  it("does not downgrade successful fallback notes when the snapshot is complete and fresh", () => {
    const actionability = __testStockSnapshotActionability({
      quality: "complete",
      coverage: completeCoverage,
      quoteUpdatedAt: "2026-06-05T02:29:00.000Z",
      fetchedAt: "2026-06-05T02:29:00.000Z",
      warnings: [
        "东方财富K线缺失，已使用westock-data K线兜底。",
        "东方财富资金流缺失，已使用 westock-data 资金流兜底。"
      ],
      now: "2026-06-05T10:30:00+08:00"
    });

    expect(actionability.level).toBe("actionable");
    expect(actionability.label).toBe("可用于当前判断");
  });

  it("still blocks snapshots without a usable quote", () => {
    const actionability = __testStockSnapshotActionability({
      quality: "missing",
      coverage: {
        ...completeCoverage,
        quote: false
      },
      fetchedAt: "2026-06-05T02:29:00.000Z",
      warnings: ["东方财富个股报价失败：fetch failed"],
      now: "2026-06-05T10:30:00+08:00"
    });

    expect(actionability.level).toBe("not_actionable");
    expect(actionability.reason).toContain("缺少有效报价");
  });
});
