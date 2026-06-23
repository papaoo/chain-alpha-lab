import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __testSelectionSnapshotActionability,
  normalizeSelectionPickRuntimeBoundary,
  selectionRuntimeSnapshot,
  splitPassedAndRejected
} from "@/lib/selection/scoring-utils";
import type { SelectionPick } from "@/lib/selection/types";
import type { StockCandidate } from "@/lib/types";

afterEach(() => {
  vi.useRealTimers();
});

function pick(overrides: Partial<SelectionPick>): SelectionPick {
  return {
    code: "sz000001",
    name: "测试股票",
    sectorName: "测试板块",
    score: 88,
    tier: "S",
    action: "重点观察",
    reasons: ["强信号"],
    blockers: [],
    evidenceRefs: [],
    scoreFactors: [],
    ...overrides
  };
}

describe("splitPassedAndRejected snapshot gate", () => {
  it("downgrades reference-only snapshots from priority focus", () => {
    const result = splitPassedAndRejected([
      pick({
        runtimeSnapshot: {
          latestPrice: 10,
          source: "test",
          basis: "mixed",
          quality: "quote_only",
          actionability: {
            level: "reference_only",
            label: "仅可参考",
            reason: "缺少资金和技术字段",
            staleAfterMinutes: 30
          },
          warnings: []
        }
      })
    ], 3);

    expect(result.passed[0].action).toBe("跟踪观察");
    expect(result.passed[0].score).toBeLessThanOrEqual(69);
    expect(result.passed[0].blockers[0]).toContain("运行快照仅可参考");
  });

  it("rejects not-actionable snapshots", () => {
    const result = splitPassedAndRejected([
      pick({
        runtimeSnapshot: {
          source: "test",
          basis: "report_snapshot",
          quality: "missing",
          actionability: {
            level: "not_actionable",
            label: "不可用于行动",
            reason: "缺少有效报价",
            staleAfterMinutes: 30
          },
          warnings: []
        }
      })
    ], 3);

    expect(result.passed).toHaveLength(0);
    expect(result.rejected[0].action).toBe("剔除");
    expect(result.rejected[0].score).toBeLessThanOrEqual(40);
    expect(result.rejected[0].blockers[0]).toContain("运行快照不可行动");
  });
});

describe("selectionRuntimeSnapshot warning classification", () => {
  const completeCoverage = {
    quote: true,
    kline: true,
    technical: true,
    fundFlow: true,
    company: true
  };

  it("uses true quote update time instead of runtime fetch time for actionability", () => {
    const actionability = __testSelectionSnapshotActionability({
      quality: "complete",
      coverage: completeCoverage,
      quoteUpdatedAt: "2026-06-18T07:30:00.000Z",
      fetchedAt: "2026-06-22T02:00:00.000Z",
      warnings: [],
      now: "2026-06-22T10:30:00+08:00"
    });

    expect(actionability.level).toBe("reference_only");
    expect(actionability.reason).toContain("真实报价时间");
    expect(actionability.sessionPhase).toBe("morning");
  });

  it("rechecks legacy stored actionable snapshots before displaying old runs", () => {
    const normalized = normalizeSelectionPickRuntimeBoundary(
      pick({
        runtimeSnapshot: {
          latestPrice: 10,
          source: "legacy",
          fetchedAt: "2026-06-22T02:00:00.000Z",
          quoteUpdatedAt: "2026-06-18T07:30:00.000Z",
          basis: "runtime_refresh",
          quality: "complete",
          actionability: {
            level: "actionable",
            label: "可用于当前判断",
            reason: "旧逻辑误判",
            staleAfterMinutes: 30
          },
          coverage: completeCoverage,
          warnings: []
        }
      }),
      "2026-06-22T10:30:00+08:00"
    );

    expect(normalized.runtimeSnapshot?.actionability?.level).toBe("reference_only");
    expect(normalized.action).toBe("跟踪观察");
    expect(normalized.blockers[0]).toContain("运行快照仅可参考");
  });

  it("keeps complete night research snapshots as reference only", () => {
    const actionability = __testSelectionSnapshotActionability({
      quality: "complete",
      coverage: completeCoverage,
      quoteUpdatedAt: "2026-06-18T07:00:00.000Z",
      fetchedAt: "2026-06-18T07:05:00.000Z",
      warnings: [],
      now: "2026-06-18T22:00:00+08:00"
    });

    expect(actionability.level).toBe("reference_only");
    expect(actionability.label).toBe("研究可参考");
    expect(actionability.sessionPhase).toBe("night_research");
  });

  it("downgrades stale K-line snapshots even when quote fields are present", () => {
    const actionability = __testSelectionSnapshotActionability({
      quality: "complete",
      coverage: completeCoverage,
      quoteUpdatedAt: "2026-06-22T02:29:00.000Z",
      fetchedAt: "2026-06-22T02:29:00.000Z",
      klineFreshnessStatus: "stale",
      warnings: [],
      now: "2026-06-22T10:30:00+08:00"
    });

    expect(actionability.level).toBe("reference_only");
    expect(actionability.reason).toContain("K线交易日落后");
  });

  it("keeps quote update time separate from runtime fetch time", () => {
    const snapshot = selectionRuntimeSnapshot({
      code: "sz000001",
      name: "测试股票",
      price: 10,
      quote: {
        latest: 10,
        changePct: 1.2,
        fetchedAt: "2026-06-22T02:00:00.000Z",
        quoteUpdatedAt: "2026-06-18T07:30:00.000Z"
      },
      sectorName: "测试板块",
      role: "unknown",
      action: "观察",
      positionLimitPct: 0,
      buyPointType: "无买点",
      invalidCondition: "测试失效条件",
      trendState: "above_ma20",
      fundFlowState: "inflow",
      technical: { closePrice: 10 },
      fundFlow: { mainNetFlow: 100 },
      companyKnowledge: {
        code: "sz000001",
        name: "测试股票",
        industry: "测试",
        mainBusiness: "测试业务",
        coreBusiness: "测试业务",
        productsOrServices: [],
        oneLineUnderstanding: "测试",
        industryChainPosition: "测试",
        themeMatch: "medium",
        themeMatchReason: "测试",
        fundamentalHighlights: [],
        fundamentalRisks: [],
        missingFields: [],
        dataSources: [],
        companyKnowledgeState: "sufficient",
        longTermLogicAllowed: true
      },
      dataCompleteness: {
        level: "complete",
        missing: [],
        missingFields: [],
        blockingReasons: [],
        hasHotData: true,
        hasKlineData: true,
        hasTechnicalData: true,
        hasFundFlowData: true,
        hasSectorData: true,
        hasProfileData: true,
        hasCompanyKnowledge: true
      },
      sourceTraces: [],
      riskFlags: [],
      evidenceRefs: []
    } as unknown as StockCandidate);

    expect(snapshot.fetchedAt).toBe("2026-06-22T02:00:00.000Z");
    expect(snapshot.quoteUpdatedAt).toBe("2026-06-18T07:30:00.000Z");
    expect(snapshot.actionability?.level).toBe("reference_only");
  });

  it("does not downgrade successful fallback notes when all decision fields are present", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T02:30:00.000Z"));

    const snapshot = selectionRuntimeSnapshot({
      code: "sz000001",
      name: "测试股票",
      price: 10,
      quote: { latest: 10, changePct: 1.2, fetchedAt: "2026-06-05T02:29:00.000Z", quoteUpdatedAt: "2026-06-05T02:29:00.000Z" },
      sectorName: "测试板块",
      role: "unknown",
      action: "观察",
      positionLimitPct: 0,
      buyPointType: "无买点",
      invalidCondition: "测试失效条件",
      isTradingDay: true,
      isTradingSession: true,
      isIntraday: true,
      canUseRealtimeQuotes: true,
      canUseAuctionQuotes: false,
      expectedDataBasis: "盘中实时/延迟行情",
      dataFreshnessHint: "test",
      ruleFocus: [],
      llmFocus: [],
      outputRestrictions: [],
      trendState: "above_ma20",
      fundFlowState: "inflow",
      technical: { closePrice: 10, ma5: 9.8, ma10: 9.7, ma20: 9.5 },
      fundFlow: { mainNetFlow: 100, mainNetFlow5D: 200, lhbInfos: [] },
      companyKnowledge: {
        code: "sz000001",
        name: "测试股票",
        industry: "测试",
        mainBusiness: "测试业务",
        coreBusiness: "测试业务",
        productsOrServices: [],
        oneLineUnderstanding: "测试",
        industryChainPosition: "测试",
        themeMatch: "medium",
        themeMatchReason: "测试",
        fundamentalHighlights: [],
        fundamentalRisks: [],
        missingFields: [],
        dataSources: [],
        companyKnowledgeState: "sufficient",
        longTermLogicAllowed: true
      },
      dataCompleteness: {
        level: "complete",
        missing: [],
        missingFields: [],
        blockingReasons: [],
        hasHotData: true,
        hasKlineData: true,
        hasTechnicalData: true,
        hasFundFlowData: true,
        hasSectorData: true,
        hasProfileData: true,
        hasCompanyKnowledge: true
      },
      sourceTraces: [
        {
          id: "fallback",
          scope: "stock",
          subjectCode: "sz000001",
          subjectName: "测试股票",
          field: "selection.runtime.kline",
          provider: "westock_skillhub",
          providerName: "westock-data",
          accessPath: "test",
          sourceLabel: "兜底",
          fetchedAt: "2026-06-05T02:29:00.000Z",
          quality: "primary",
          freshness: "delayed",
          warning: "东方财富K线缺失，已使用westock-data K线兜底。"
        }
      ],
      riskFlags: [],
      evidenceRefs: []
    } as unknown as StockCandidate);

    expect(snapshot.actionability?.level).toBe("actionable");
  });
});
