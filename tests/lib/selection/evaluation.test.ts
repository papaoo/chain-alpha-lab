import { describe, expect, it } from "vitest";
import { buildSelectionEvaluationFromData } from "@/lib/selection/evaluation";
import type { StockTrackingItem } from "@/lib/db/stockTracking";
import type { StockRealtimeSnapshot } from "@/lib/data/stockSnapshotGateway";
import type { SelectionPick, SelectionRunRecord } from "@/lib/selection/types";

describe("selection evaluation", () => {
  it("evaluates selected picks with current snapshots and tracking coverage", () => {
    const run = mockRun([
      mockPick("sz000001", "平安银行", 10, "actionable"),
      mockPick("sz000002", "万科A", 20, "reference_only"),
      mockPick("sz000003", "国华网安", 5, "actionable")
    ]);
    const snapshot = buildSelectionEvaluationFromData({
      runs: [run],
      snapshots: {
        sz000001: mockSnapshot("sz000001", 10.8, "actionable"),
        sz000002: mockSnapshot("sz000002", 20.2, "reference_only")
      },
      trackingItems: [mockTrackingItem(run.id, "sz000001"), mockTrackingItem("older-run", "sz000002")],
      trackingLinks: [{ trackingId: "track-sz000002", code: "sz000002", sourceStrategyRunId: run.id }],
      generatedAt: "2026-06-22T02:00:00.000Z",
      runLimit: 1,
      maxPicksPerRun: 5
    });

    expect(snapshot.evaluatedRunCount).toBe(1);
    expect(snapshot.evaluatedPickCount).toBe(3);
    expect(snapshot.summary.trackedPickCount).toBe(2);
    expect(snapshot.summary.exactTrackedPickCount).toBe(2);
    expect(snapshot.summary.sameStockTrackedPickCount).toBe(0);
    expect(snapshot.summary.positiveCount).toBe(2);
    expect(snapshot.summary.referenceOnlyCount).toBe(1);
    expect(snapshot.summary.dataInsufficientCount).toBe(1);
    expect(snapshot.runs[0].picks[0].returnPct).toBe(8);
    expect(snapshot.runs[0].picks[0].tracked).toBe(true);
    expect(snapshot.runs[0].picks[0].trackingMatchType).toBe("exact_run");
    expect(snapshot.runs[0].picks[1].trackingMatchType).toBe("exact_run");
    expect(snapshot.runs[0].picks[1].verdict).toBe("research_only");
    expect(snapshot.runs[0].picks[2].verdict).toBe("data_insufficient");
    expect(snapshot.strategies).toHaveLength(1);
    expect(snapshot.strategies[0]).toMatchObject({
      strategyId: "main_force_accumulation",
      runCount: 1,
      evaluatedPickCount: 3,
      trackedPickCount: 2,
      exactTrackedPickCount: 2,
      sameStockTrackedPickCount: 0,
      positiveCount: 2,
      dataInsufficientCount: 1
    });
    expect(snapshot.strategies[0].avgReturnPct).toBe(4.5);
    expect(snapshot.strategies[0].trackingCoveragePct).toBe(66.67);
    expect(snapshot.strategies[0].trendDirection).toBe("insufficient");
    expect(snapshot.strategies[0].recentRuns).toHaveLength(1);
    expect(snapshot.strategies[0].recentRuns[0]).toMatchObject({
      runId: "run-1",
      evaluatedPickCount: 3,
      exactTrackedPickCount: 2
    });
  });
});

function mockRun(picks: SelectionPick[]): SelectionRunRecord {
  return {
    id: "run-1",
    strategyId: "main_force_accumulation",
    strategyName: "主力吸筹",
    mode: "rule",
    status: "success",
    startedAt: "2026-06-18T02:00:00.000Z",
    finishedAt: "2026-06-18T02:00:01.000Z",
    candidateCount: picks.length,
    pickCount: picks.length,
    parameters: {},
    picks,
    rejected: [],
    warnings: [],
    dataBasis: "unit",
    freshnessStatus: "current"
  };
}

function mockPick(
  code: string,
  name: string,
  price: number,
  actionability: NonNullable<NonNullable<SelectionPick["runtimeSnapshot"]>["actionability"]>["level"]
): SelectionPick {
  return {
    code,
    name,
    sectorName: "银行",
    price,
    score: 70,
    tier: "B",
    action: "跟踪观察",
    reasons: ["unit"],
    blockers: [],
    evidenceRefs: [],
    scoreFactors: [],
    runtimeSnapshot: {
      latestPrice: price,
      source: "unit",
      basis: "runtime_refresh",
      actionability: {
        level: actionability,
        label: actionability,
        reason: "unit",
        staleAfterMinutes: 30
      },
      warnings: []
    }
  };
}

function mockSnapshot(
  code: string,
  latestPrice: number,
  actionability: StockRealtimeSnapshot["actionability"]["level"]
): StockRealtimeSnapshot {
  return {
    code,
    normalizedCode: code,
    latestPrice,
    source: "unit",
    fetchedAt: "2026-06-22T02:00:00.000Z",
    quoteUpdatedAt: "2026-06-22T01:59:00.000Z",
    quality: "complete",
    qualityLabel: "完整",
    actionability: {
      level: actionability,
      label: actionability,
      reason: "unit",
      staleAfterMinutes: 30
    },
    coverage: {
      quote: true,
      kline: true,
      technical: true,
      fundFlow: true
    },
    warnings: [],
    raw: {
      latestKlineDate: "2026-06-22",
      quoteUpdatedAt: "2026-06-22T01:59:00.000Z"
    }
  };
}

function mockTrackingItem(runId: string, code: string): StockTrackingItem {
  return {
    id: `track-${code}`,
    code,
    name: "平安银行",
    source: "selection",
    status: "active",
    entryMode: "watch",
    simulatedPositionPct: 0,
    sourceStrategyRunId: runId,
    thesis: "unit",
    invalidCondition: "unit",
    watchConditions: [],
    riskNotes: [],
    createdAt: "2026-06-18T02:00:00.000Z",
    updatedAt: "2026-06-18T02:00:00.000Z",
    baselineTrace: {
      price: 10,
      source: "unit",
      fetchedAt: "2026-06-18T02:00:00.000Z",
      warnings: []
    },
    performance: {
      baselinePrice: 10,
      latestPrice: 10.8,
      latestReturnPct: 8,
      snapshotCount: 1,
      recentPoints: []
    }
  };
}
