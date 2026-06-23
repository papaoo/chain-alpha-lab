import { describe, expect, it } from "vitest";
import { buildSelectionRunLiveSnapshotSummary } from "@/components/SelectionRunLiveSnapshots";
import type { StockRealtimeSnapshot } from "@/lib/market/stockSnapshot";
import type { SelectionPick } from "@/lib/selection/types";

describe("buildSelectionRunLiveSnapshotSummary", () => {
  it("counts normalized current snapshots by pick instead of raw object keys", () => {
    const summary = buildSelectionRunLiveSnapshotSummary(
      [
        pick("600000", "浦发银行", 10),
        pick("sz000001", "平安银行", 12)
      ],
      {
        sh600000: snapshot("sh600000", "complete", 10.5),
        sz000001: snapshot("sz000001", "partial", 11.5)
      },
      false,
      ""
    );

    expect(summary.total).toBe(2);
    expect(summary.loaded).toBe(2);
    expect(summary.complete).toBe(1);
    expect(summary.partial).toBe(1);
    expect(summary.missing).toBe(0);
    expect(summary.maxDelta?.code).toBe("600000");
  });

  it("treats unloaded rows as pending while refreshing, not as missing", () => {
    const summary = buildSelectionRunLiveSnapshotSummary(
      [pick("600000", "浦发银行", 10), pick("000001", "平安银行", 12)],
      {
        sh600000: snapshot("sh600000", "complete", 10.2)
      },
      true,
      ""
    );

    expect(summary.loaded).toBe(1);
    expect(summary.pending).toBe(1);
    expect(summary.missing).toBe(0);
  });

  it("marks unloaded rows as missing after refresh finishes", () => {
    const summary = buildSelectionRunLiveSnapshotSummary(
      [pick("600000", "浦发银行", 10), pick("000001", "平安银行", 12)],
      {
        sh600000: snapshot("sh600000", "complete", 10.2)
      },
      false,
      ""
    );

    expect(summary.loaded).toBe(1);
    expect(summary.pending).toBe(0);
    expect(summary.missing).toBe(1);
  });
});

function pick(code: string, name: string, price: number): SelectionPick {
  return {
    code,
    name,
    sectorName: "测试板块",
    price,
    score: 80,
    tier: "A",
    action: "重点观察",
    reasons: [],
    blockers: [],
    evidenceRefs: [],
    scoreFactors: []
  };
}

function snapshot(code: string, quality: StockRealtimeSnapshot["quality"], latestPrice: number): StockRealtimeSnapshot {
  return {
    code,
    normalizedCode: code,
    latestPrice,
    source: "test",
    fetchedAt: "2026-06-20T02:00:00.000Z",
    quality,
    qualityLabel: quality,
    actionability: {
      level: "reference_only",
      label: "测试",
      reason: "测试",
      staleAfterMinutes: 30
    },
    coverage: {
      quote: true,
      kline: quality === "complete",
      technical: quality === "complete",
      fundFlow: quality === "complete"
    },
    warnings: []
  };
}
