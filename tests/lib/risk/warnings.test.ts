import { describe, expect, it } from "vitest";
import { buildRiskAlerts, buildRiskSummary } from "@/lib/risk/warnings";
import type { StockTrackingItem } from "@/lib/db/stockTracking";
import type { AnalysisReport } from "@/lib/types";

describe("risk warnings", () => {
  it("blocks risk evaluation when no report is available", () => {
    const alerts = buildRiskAlerts({ report: null, session: null, trackingItems: [] });

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      id: "report-missing",
      level: "high",
      scope: "数据"
    });
  });

  it("surfaces defensive market and risk-level data warnings", () => {
    const report = mockReport();
    const alerts = buildRiskAlerts({
      report,
      session: {
        isTradingDay: true,
        isTradingSession: false,
        phaseLabel: "夜间研究",
        expectedDataBasis: "上一交易日收盘",
        restrictions: ["夜间不盯盘，只做研究和计划。"]
      },
      trackingItems: []
    });

    expect(alerts.some((item) => item.id === "market-defensive" && item.level === "high")).toBe(true);
    expect(alerts.some((item) => item.id === "data-risk" && item.level === "high")).toBe(true);
    expect(alerts.some((item) => item.id === "session-reference" && item.level === "medium")).toBe(true);

    const summary = buildRiskSummary({ alerts, report, trackingItems: [], freshnessStatus: "current" });
    expect(summary.high).toBeGreaterThanOrEqual(2);
    expect(summary.dataWarnings).toBe(1);
  });

  it("raises high alert for deteriorating tracked stocks", () => {
    const report = mockReport({ marketState: "tradable" });
    const trackingItems = [mockTrackingItem()];
    const alerts = buildRiskAlerts({
      report,
      session: { isTradingDay: true, isTradingSession: true },
      trackingItems
    });

    expect(alerts.some((item) => item.id === "tracking-track-1" && item.level === "high" && item.code === "sh600000")).toBe(true);

    const summary = buildRiskSummary({ alerts, report, trackingItems, freshnessStatus: "current" });
    expect(summary.trackingActive).toBe(1);
    expect(summary.trackingRisk).toBe(1);
  });
});

function mockReport(overrides: { marketState?: AnalysisReport["ruleResult"]["market"]["marketState"] } = {}): AnalysisReport {
  const marketState = overrides.marketState ?? "defensive";
  return {
    id: "report-1",
    schemaVersion: "mvp-1",
    reportType: "full",
    title: "mock",
    summary: "mock",
    createdAt: "2026-06-18T07:20:00.000Z",
    llmStatus: "success",
    reportStatus: "llmEnhanced",
    dataSourceStatus: {
      provider: "腾讯自选股行情数据接口 + 东方财富公开行情接口 + Tushare Pro",
      via: "westock-data-skillhub + eastmoney + tushare",
      packageVersion: "test",
      status: "partial",
      warnings: ["未取得涨停池"],
      warningDetails: [
        {
          severity: "risk",
          scope: "market",
          message: "未取得涨停池",
          impact: "影响情绪分",
          action: "稍后重试"
        }
      ],
      traces: []
    },
    ruleResult: {
      status: "success",
      market: mockMarketRule(marketState),
      sectors: [],
      candidates: []
    },
    factPackage: {
      schemaVersion: "mvp-1",
      timestamp: "2026-06-18T07:20:00.000Z",
      tradeDate: "20260618",
      session: {} as AnalysisReport["factPackage"]["session"],
      facts: [],
      dataSource: {
        provider: "腾讯自选股行情数据接口 + 东方财富公开行情接口 + Tushare Pro",
        via: "westock-data-skillhub + eastmoney + tushare",
        packageVersion: "test",
        status: "partial",
        warnings: ["未取得涨停池"],
        warningDetails: [
          {
            severity: "risk",
            scope: "market",
            message: "未取得涨停池",
            impact: "影响情绪分",
            action: "稍后重试"
          }
        ],
        traces: []
      },
      market: {
        indices: [],
        marketState,
        ruleScore: marketState === "defensive" ? 35 : 76,
        facts: []
      },
      sectors: [],
      candidates: [],
      constraints: {
        allowedCodes: [],
        maxSingleStockPositionPct: 0,
        maxThemePositionPct: 0,
        minCashPct: 100
      },
      ruleResult: {
        status: "success",
        market: mockMarketRule(marketState),
        sectors: [],
        candidates: []
      },
      disclaimer: "test"
    },
    llmResult: null,
    disclaimer: "test"
  } as AnalysisReport;
}

function mockMarketRule(marketState: AnalysisReport["ruleResult"]["market"]["marketState"]): AnalysisReport["ruleResult"]["market"] {
  return {
    marketState,
    marketStateReason: marketState === "defensive" ? "真实弱势" : "正常评估",
    marketRegime: marketState === "defensive" ? "弱势" : "强势",
    tradeMode: marketState === "defensive" ? "防守" : "进攻",
    sentimentCycle: marketState === "defensive" ? "冰点" : "启动",
    styleBias: "无明显风格",
    confidence: "中",
    dataQuality: "部分",
    diagnostics: [],
    maxTotalPositionPct: marketState === "defensive" ? 10 : 70,
    maxSingleStockPct: marketState === "defensive" ? 2 : 15,
    forbiddenActions: marketState === "defensive" ? ["禁止追涨"] : [],
    score: marketState === "defensive" ? 35 : 76,
    facts: [],
    riskFlags: marketState === "defensive" ? ["上涨宽度偏弱"] : [],
    status: "success"
  };
}

function mockTrackingItem(): StockTrackingItem {
  return {
    id: "track-1",
    code: "sh600000",
    name: "浦发银行",
    source: "selection",
    status: "active",
    entryMode: "watch",
    simulatedPositionPct: 0,
    thesis: "测试",
    invalidCondition: "跌破 MA20",
    watchConditions: [],
    riskNotes: ["连续走弱"],
    createdAt: "2026-06-18T07:30:00.000Z",
    updatedAt: "2026-06-18T07:30:00.000Z",
    derivedState: {
      state: "risk_deteriorating",
      label: "风险转弱",
      severity: "warning",
      reason: "跌破观察位",
      nextAction: "暂停加仓"
    },
    performance: {
      baselinePrice: 10,
      latestPrice: 9.3,
      latestReturnPct: -7,
      snapshotCount: 2,
      recentPoints: []
    }
  };
}
