import { describe, expect, it } from "vitest";
import { buildCandidatePressureBuckets, buildCandidatePressureHistorySummary } from "@/lib/strategy/candidatePressureBuckets";
import type { AnalysisReport, StockCandidate } from "@/lib/types";

describe("candidate pressure buckets", () => {
  it("explains market, data, mainline and fund/trend bottlenecks without changing actions", () => {
    const buckets = buildCandidatePressureBuckets(report(), [
      candidate({
        name: "测试一",
        dataCompleteness: completeness("insufficient", ["日K", "资金流"]),
        mainlineAttribution: attribution({
          status: "mismatch",
          shouldExclude: true,
          reason: "主营业务与当前主线缺少直接匹配证据",
          evidenceChain: evidenceChain(["未发现当前主线成分股证据"])
        }),
        fundFlowState: "outflow",
        trendState: "below_ma20",
        riskFlags: ["资金持续流出"]
      }),
      candidate({
        name: "测试二",
        buyPointEvaluation: {
          type: "回踩均线",
          score: 8,
          status: "待激活",
          satisfied: [],
          blockers: ["未放量突破"],
          triggerCondition: "站上 MA20 后确认",
          invalidCondition: "跌破 MA20",
          sessionNote: "等待盘中确认"
        },
        tradability: { status: "涨停不可达", score: 20, waitFor: "次日竞价承接", blockers: ["已涨停"] }
      })
    ]);

    expect(bucket(buckets, "market")).toMatchObject({ value: "2", tone: "risk" });
    expect(bucket(buckets, "data")).toMatchObject({ value: "1", tone: "risk" });
    expect(bucket(buckets, "mainline")).toMatchObject({ value: "1", tone: "risk" });
    expect(bucket(buckets, "reachability")).toMatchObject({ value: "1", tone: "risk" });
    expect(bucket(buckets, "fund-trend")).toMatchObject({ value: "1", tone: "wait" });
    expect(bucket(buckets, "buy-point").details.join("\n")).toContain("未放量突破");
  });

  it("aggregates repeated pressure sources across report history", () => {
    const summary = buildCandidatePressureHistorySummary([
      point("r1", "2026-06-18T07:00:00.000Z", 2, [
        { key: "data", title: "数据完整性", value: "1", tone: "risk", subtitle: "", details: ["缺字段：资金流"] },
        { key: "buy-point", title: "买点质量", value: "2", tone: "wait", subtitle: "", details: ["未放量突破"] }
      ]),
      point("r2", "2026-06-19T07:00:00.000Z", 2, [
        { key: "data", title: "数据完整性", value: "2", tone: "risk", subtitle: "", details: ["缺字段：资金流"] },
        { key: "buy-point", title: "买点质量", value: "1", tone: "wait", subtitle: "", details: ["未放量突破"] }
      ]),
      point("r3", "2026-06-20T07:00:00.000Z", 2, [
        { key: "data", title: "数据完整性", value: "2", tone: "risk", subtitle: "", details: ["缺字段：资金流"] },
        { key: "buy-point", title: "买点质量", value: "0", tone: "open", subtitle: "", details: [] }
      ])
    ], new Date("2026-06-21T00:00:00.000Z"));

    expect(summary.reportCount).toBe(3);
    expect(summary.candidateObservationCount).toBe(6);
    expect(summary.topBuckets[0]).toMatchObject({
      key: "data",
      totalCount: 5,
      frequencyPct: 83,
      trend: "升高"
    });
    expect(summary.topBuckets.find((item) => item.key === "buy-point")?.trend).toBe("降低");
    expect(summary.calibrationHints.some((hint) => hint.key === "data-quality-bottleneck")).toBe(true);
  });

  it("flags buy-point strictness only when market and data are not dominant blockers", () => {
    const summary = buildCandidatePressureHistorySummary([
      point("r1", "2026-06-18T07:00:00.000Z", 5, [
        { key: "market", title: "大盘总闸", value: "0", tone: "open", subtitle: "", details: [] },
        { key: "data", title: "数据完整性", value: "0", tone: "open", subtitle: "", details: [] },
        { key: "buy-point", title: "买点质量", value: "5", tone: "wait", subtitle: "", details: ["回踩未放量"] }
      ]),
      point("r2", "2026-06-19T07:00:00.000Z", 5, [
        { key: "market", title: "大盘总闸", value: "1", tone: "wait", subtitle: "", details: [] },
        { key: "data", title: "数据完整性", value: "0", tone: "open", subtitle: "", details: [] },
        { key: "buy-point", title: "买点质量", value: "5", tone: "wait", subtitle: "", details: ["回踩未放量"] }
      ]),
      point("r3", "2026-06-20T07:00:00.000Z", 5, [
        { key: "market", title: "大盘总闸", value: "0", tone: "open", subtitle: "", details: [] },
        { key: "data", title: "数据完整性", value: "0", tone: "open", subtitle: "", details: [] },
        { key: "buy-point", title: "买点质量", value: "5", tone: "wait", subtitle: "", details: ["回踩未放量"] }
      ])
    ], new Date("2026-06-21T00:00:00.000Z"));

    expect(summary.calibrationHints.find((hint) => hint.key === "buy-point-may-be-too-strict")).toMatchObject({
      category: "buy_point_strictness",
      severity: "warning"
    });
  });

  it("uses sample-too-small hint before drawing calibration conclusions", () => {
    const summary = buildCandidatePressureHistorySummary([
      point("r1", "2026-06-18T07:00:00.000Z", 5, [
        { key: "buy-point", title: "买点质量", value: "5", tone: "wait", subtitle: "", details: ["回踩未放量"] }
      ])
    ], new Date("2026-06-21T00:00:00.000Z"));

    expect(summary.calibrationHints).toHaveLength(1);
    expect(summary.calibrationHints[0]?.key).toBe("sample-too-small");
  });
});

function bucket(buckets: ReturnType<typeof buildCandidatePressureBuckets>, key: string) {
  const item = buckets.find((entry) => entry.key === key);
  if (!item) throw new Error(`missing bucket ${key}`);
  return item;
}

function point(
  reportId: string,
  createdAt: string,
  candidateCount: number,
  buckets: ReturnType<typeof buildCandidatePressureBuckets>
) {
  return { reportId, createdAt, candidateCount, buckets };
}

function report(): AnalysisReport {
  return {
    ruleResult: {
      market: {
        marketState: "defensive",
        marketStateReason: "真实弱势",
        tradeMode: "防守观望",
        maxTotalPositionPct: 0,
        score: 28,
        riskFlags: ["宽度弱"],
        forbiddenActions: ["禁止新开仓"]
      }
    },
    factPackage: {
      dataSource: {
        status: "partial",
        warnings: ["涨跌停池缺失"]
      }
    }
  } as unknown as AnalysisReport;
}

function candidate(overrides: Partial<StockCandidate> = {}): StockCandidate {
  return {
    code: "sz000001",
    name: "测试股",
    sectorName: "元件",
    role: "unknown",
    trendState: "above_ma20",
    fundFlowState: "inflow",
    buyPointType: "回踩均线",
    buyPointEvaluation: {
      type: "回踩均线",
      score: 10,
      status: "有效",
      satisfied: [],
      blockers: [],
      triggerCondition: "回踩 MA20 不破",
      invalidCondition: "跌破 MA20",
      sessionNote: "盘中确认"
    },
    action: "观察",
    positionLimitPct: 0,
    invalidCondition: "跌破关键位",
    riskFlags: [],
    dataCompleteness: completeness("complete"),
    companyKnowledge: {} as StockCandidate["companyKnowledge"],
    mainlineAttribution: {
      status: "direct_constituent",
      businessKeywords: [],
      sectorKeywords: [],
      evidence: [],
      blockers: [],
      confidence: "高",
      shouldExclude: false,
      reason: "成分股证据成立"
    },
    tradability: {
      status: "可买入观察",
      score: 80,
      blockers: [],
      waitFor: "等待确认"
    },
    evidenceRefs: [],
    ...overrides
  };
}

function completeness(level: StockCandidate["dataCompleteness"]["level"], missingFields: string[] = []): StockCandidate["dataCompleteness"] {
  return {
    level,
    coreMarketLevel: level,
    companyKnowledgeLevel: "sufficient",
    hasHotData: level === "complete",
    hasKlineData: level === "complete",
    hasTechnicalData: level === "complete",
    hasFundFlowData: level === "complete",
    hasSectorData: level === "complete",
    hasProfileData: true,
    hasCompanyKnowledge: true,
    missingFields,
    blockingReasons: missingFields
  };
}

function evidenceChain(negativeEvidence: string[] = []): NonNullable<NonNullable<StockCandidate["mainlineAttribution"]>["evidenceChain"]> {
  return {
    constituentEvidence: [],
    businessEvidence: [],
    industryChainEvidence: [],
    negativeEvidence,
    sourceQuality: negativeEvidence.length ? "weak" : "direct",
    reviewRequired: negativeEvidence.length > 0
  };
}

function attribution(overrides: Partial<NonNullable<StockCandidate["mainlineAttribution"]>> = {}): NonNullable<StockCandidate["mainlineAttribution"]> {
  return {
    status: "direct_constituent",
    businessKeywords: [],
    sectorKeywords: [],
    evidence: [],
    blockers: [],
    confidence: "高",
    shouldExclude: false,
    reason: "成分股证据成立",
    ...overrides
  };
}
