import { describe, expect, it } from "vitest";
import { buildFactPackage } from "../../../src/lib/strategy/rules";
import { evaluateCandidateSignalQuality } from "../../../src/lib/strategy/candidateSignalQuality";
import { buildCompanyKnowledge } from "../../../src/lib/strategy/companyKnowledge";
import { decideCandidateAction } from "../../../src/lib/strategy/stockTradabilityRules";
import { buildCompleteness } from "../../../src/lib/strategy/stockDataRules";
import { ZH } from "../../../src/lib/strategy/support";
import type { LimitPoolSnapshot, MarketBreadthSnapshot, MarketTimelinePoint, SectorConstituentSnapshot } from "../../../src/lib/types";
import type { ParsedCell, ParsedCommandResult } from "../../../src/lib/westock/parser";

function table(command: string, args: string[], rows: Array<Record<string, ParsedCell>>, title = "测试数据"): ParsedCommandResult {
  return {
    command,
    args,
    status: "success",
    rawText: "",
    warnings: [],
    sections: [{ title, type: "markdownTable", columns: Object.keys(rows[0] ?? {}), rows, raw: "" }]
  };
}

function empty(command: string, args: string[] = []): ParsedCommandResult {
  return table(command, args, []);
}

function indexKline(code: string, latest: number, step: number, count = 60): ParsedCommandResult {
  const rows = Array.from({ length: count }, (_, index) => ({
    date: String(count - index).padStart(3, "0"),
    last: Number((latest - index * step).toFixed(2)),
    high: Number((latest - index * step + 1).toFixed(2)),
    low: Number((latest - index * step - 1).toFixed(2)),
    volume: 100000 - index,
    amount: 100000000 - index
  }));
  return table("kline", [code], rows);
}

function marketTechnicals(rows: Array<Record<string, ParsedCell>>): ParsedCommandResult {
  return table("technical", ["market"], rows);
}

function stockInput(options: {
  close: number;
  ma5: number;
  ma10: number;
  ma20: number;
  ma60: number;
  mainNetFlow: number;
  mainNetFlow5D: number;
}) {
  const code = "sh600001";
  return {
    hotStocks: table("hot", ["stock", "--limit", "50"], [{ code, name: "测试股份", stock_type: "GP-A", zxj: options.close, zdf: 1.2, cje: 800000000, hsl: 4.2 }]),
    stockKlines: table("kline", [code, "--period", "day", "--limit", "30"], [{ symbol: code, last: options.close, volume: 10000, amount: 50000000 }]),
    stockTechnicals: table("technical", [code], [{
      code,
      closePrice: options.close,
      "ma.MA_5": options.ma5,
      "ma.MA_10": options.ma10,
      "ma.MA_20": options.ma20,
      "ma.MA_60": options.ma60
    }]),
    stockFundFlows: table("asfund", [code], [{
      code,
      MainNetFlow: options.mainNetFlow,
      MainNetFlow5D: options.mainNetFlow5D,
      MainNetFlow10D: options.mainNetFlow5D,
      MainNetFlow20D: options.mainNetFlow5D
    }]),
    stockProfiles: table("profile", [code], [{ code, name: "测试股份", business: "通信设备制造与服务", industry: "通信设备" }])
  };
}

function buildPackage(overrides: Partial<Parameters<typeof buildFactPackage>[0]> = {}) {
  const stock = stockInput({ close: 102, ma5: 101, ma10: 101, ma20: 100, ma60: 95, mainNetFlow: 100, mainNetFlow5D: 200 });
  const marketBreadth: MarketBreadthSnapshot = {
    source: "eastmoney",
    fetchedAt: "2026-06-03T10:30:00+08:00",
    total: 5200,
    up: 3600,
    down: 1400,
    flat: 200,
    upPct: 69.23,
    downPct: 26.92,
    gt5Count: 320,
    ltMinus5Count: 40,
    limitUpApprox: 70,
    limitDownApprox: 3,
    medianChangePct: 0.85,
    amount: 900000000000
  };
  const sectorConstituents: SectorConstituentSnapshot[] = [{
    source: "eastmoney",
    fetchedAt: "2026-06-03T10:30:00+08:00",
    name: "通信设备",
    boardCode: "BK0448",
    boardType: "industry",
    stocks: Array.from({ length: 100 }, (_, index) => ({
      code: String(600000 + index),
      marketCode: `sh${600000 + index}`,
      name: `测试${index}`,
      changePct: index === 0 ? 10 : index < 70 ? 2 : -1,
      amount: index < 5 ? 100000000 - index * 1000000 : 1000000,
      floatMarketValue: index < 5 ? 10000000000 - index * 100000000 : 100000000,
      mainNetInflow: index < 5 ? 10000000 : 0
    }))
  }];
  const limitPools: LimitPoolSnapshot[] = [{
    source: "eastmoney",
    fetchedAt: "2026-06-03T10:30:00+08:00",
    pool: "zt",
    date: "20260603",
    stocks: Array.from({ length: 8 }, (_, index) => ({
      code: String(600000 + index),
      marketCode: `sh${600000 + index}`,
      name: `涨停${index}`,
      industry: "通信设备"
    }))
  }];
  return buildFactPackage({
    timestamp: "2026-06-03T10:30:00+08:00",
    packageVersion: "1.0.3",
    marketKlines: [
      indexKline("sh000001", 120, 0.5),
      indexKline("sz399001", 120, 0.5),
      indexKline("sz399006", 120, 0.5),
      indexKline("sh000688", 120, 0.5)
    ],
    boardOverview: table("board", [], [{
      name: "通信设备",
      changePct: 2,
      changePct5d: 5,
      changePct20d: 10,
      mainNetInflow: 1000,
      mainNetInflow5d: 2000,
      upDownRatio: "80:20",
      leadStock: "测试0(10.00)"
    }]),
    hotBoards: empty("hot", ["board", "--limit", "20"]),
    hotStocks: stock.hotStocks,
    stockKlines: stock.stockKlines,
    stockTechnicals: stock.stockTechnicals,
    stockFundFlows: stock.stockFundFlows,
    stockProfiles: stock.stockProfiles,
    marketBreadth,
    sectorConstituents,
    limitPools,
    ...overrides
  });
}

describe("buildFactPackage rule enhancements", () => {
  it("classifies a broad index uptrend as tradable", () => {
    const factPackage = buildPackage();
    expect(factPackage.market.marketState).toBe("tradable");
    expect(factPackage.market.ruleScore).toBeGreaterThanOrEqual(70);
    expect(factPackage.ruleResult.market.breadthScore).toBe(20);
    expect(factPackage.ruleResult.market.breadthSourceQuality).toBe("market");
    expect(factPackage.ruleResult.market.breadthReliability).toBe(1);
  });

  it("classifies weak indices below moving averages as defensive", () => {
    const factPackage = buildPackage({
      marketKlines: [
        indexKline("sh000001", 80, -0.5),
        indexKline("sz399001", 80, -0.5),
        indexKline("sz399006", 80, -0.5),
        indexKline("sh000688", 80, -0.5)
      ]
    });
    expect(factPackage.market.marketState).toBe("defensive");
    expect(factPackage.ruleResult.market.marketStateReason).toBe("真实弱势");
    expect(factPackage.ruleResult.market.riskFlags.join("\n")).toContain("MA20");
  });

  it("does not mark the market tradable when index data is insufficient", () => {
    const factPackage = buildPackage({
      marketKlines: [
        indexKline("sh000001", 120, 0.5),
        indexKline("sz399001", 120, 0.5)
      ]
    });
    expect(factPackage.market.marketState).toBe("defensive");
    expect(factPackage.ruleResult.market.marketStateReason).toBe("数据不足防守");
    expect(factPackage.ruleResult.market.riskFlags.join("\n")).toContain("指数数据不足");
  });

  it("adds impact-scoped details for data source warnings", () => {
    const factPackage = buildPackage({
      supplementalWarnings: ["东方财富涨跌停池接口请求失败：网络错误", "Tushare 交易日历校验：20260603 为非交易日"]
    });

    expect(factPackage.dataSource.warningDetails?.length).toBeGreaterThanOrEqual(2);
    expect(factPackage.dataSource.warningDetails?.[0]).toMatchObject({
      severity: "risk",
      scope: "market"
    });
    expect(factPackage.dataSource.warningDetails?.map((item) => item.scope)).toContain("calendar");
  });

  it("uses market technical MA values instead of treating short kline history as MA60", () => {
    const factPackage = buildPackage({
      marketKlines: [
        indexKline("sh000001", 100, 0.5, 30),
        indexKline("sz399001", 100, 0.5, 30),
        indexKline("sz399006", 100, 0.5, 30),
        indexKline("sh000688", 100, 0.5, 30)
      ],
      marketTechnicals: marketTechnicals([
        { code: "sh000001", closePrice: 100, "ma.MA_5": 99, "ma.MA_10": 98, "ma.MA_20": 97, "ma.MA_60": 95 },
        { code: "sz399001", closePrice: 100, "ma.MA_5": 99, "ma.MA_10": 98, "ma.MA_20": 97, "ma.MA_60": 95 },
        { code: "sz399006", closePrice: 100, "ma.MA_5": 99, "ma.MA_10": 98, "ma.MA_20": 97, "ma.MA_60": 95 },
        { code: "sh000688", closePrice: 100, "ma.MA_5": 99, "ma.MA_10": 98, "ma.MA_20": 97, "ma.MA_60": 95 }
      ])
    });
    const sh = factPackage.market.indices.find((item) => item.code === "sh000001");

    expect(sh?.ma60).toBe(95);
    expect(sh?.aboveMa60).toBe(true);
    expect(sh?.facts.find((fact) => fact.factId === "market.sh000001.technical.ma60")?.text).toContain("95.00");
  });

  it("does not mark the market tradable without full-market breadth", () => {
    const factPackage = buildPackage({
      marketBreadth: null
    });
    expect(factPackage.market.marketState).not.toBe("tradable");
    expect(factPackage.ruleResult.market.riskFlags.join("\n")).toContain("全 A 宽度");
    expect(factPackage.ruleResult.market.dataQuality).toBe("部分");
    expect(factPackage.ruleResult.market.diagnostics.find((item) => item.label === "市场宽度")?.note).toContain("可靠性0.45");
  });

  it("does not treat missing limit-pool sentiment data as safe", () => {
    const factPackage = buildPackage({
      marketBreadth: null,
      limitPools: []
    });
    const sentimentDiagnostic = factPackage.ruleResult.market.diagnostics.find((item) => item.label === "情绪温度");

    expect(factPackage.ruleResult.market.sentimentScore).toBe(0);
    expect(factPackage.ruleResult.market.sentimentSourceQuality).toBe("missing");
    expect(factPackage.ruleResult.market.sentimentReliability).toBe(0);
    expect(factPackage.ruleResult.market.dataQuality).toBe("不足");
    expect(sentimentDiagnostic?.status).toBe("缺失");
    expect(factPackage.ruleResult.market.riskFlags.join("\n")).toContain("情绪数据缺失");
  });

  it("does not treat a small one-day inflow as healthy inflow when medium-term flow is deeply negative", () => {
    const factPackage = buildPackage({
      stockFundFlows: table("asfund", ["sh600001"], [{
        code: "sh600001",
        MainNetFlow: 100,
        MainNetFlow5D: -10000,
        MainNetFlow10D: -15000,
        MainNetFlow20D: 2000,
        JumboNetFlow: -500,
        BlockNetFlow: 200
      }])
    });
    const candidate = factPackage.candidates.find((item) => item.code === "sh600001");

    expect(candidate?.fundFlowState).toBe("mixed");
    expect(candidate?.fundFlowQuality?.state).toBe("弱修复");
    expect(candidate?.fundFlowQuality?.blockers.join("；")).toContain("明显流出");
    expect(candidate?.diagnostics?.find((item) => item.label === "资金承接")?.note).toContain("资金质量弱修复");
  });

  it("treats 400-plus big-down stocks as panic risk consistently", () => {
    const factPackage = buildPackage({
      limitPools: [],
      marketBreadth: {
        source: "eastmoney",
        fetchedAt: "2026-06-03T10:30:00+08:00",
        total: 5200,
        up: 3600,
        down: 1400,
        flat: 200,
        upPct: 69.23,
        downPct: 26.92,
        gt5Count: 320,
        ltMinus5Count: 420,
        limitUpApprox: 70,
        limitDownApprox: 3,
        medianChangePct: 0.85,
        amount: 900000000000
      }
    });

    expect(factPackage.market.marketState).toBe("defensive");
    expect(factPackage.ruleResult.market.riskFlags.join("\n")).toContain("大跌风险显著");
    expect(factPackage.ruleResult.market.sentimentSnapshot?.bigDown).toBe(420);
  });

  it("caps market state below tradable when multiple core indices are below MA20", () => {
    const factPackage = buildPackage({
      marketKlines: [
        indexKline("sh000001", 80, -0.5),
        indexKline("sz399001", 120, 0.5),
        indexKline("sz399006", 120, 0.5),
        indexKline("sh000688", 80, -0.5)
      ]
    });
    expect(factPackage.market.marketState).not.toBe("tradable");
    expect(factPackage.ruleResult.market.riskFlags.join("\n")).toContain("多个核心指数未站上MA20");
  });

  it("detects a diverging mainline when long trend remains positive but current flow weakens", () => {
    const factPackage = buildPackage({
      boardOverview: table("board", [], [{
        name: "机器人",
        changePct: -1,
        changePct5d: 10,
        changePct20d: 20,
        mainNetInflow: -100,
        mainNetInflow5d: 1000,
        upDownRatio: "45:55"
      }])
    });
    expect(factPackage.sectors[0]?.stage).toBe("分歧");
  });

  it("treats a strong structured mainline with short-term funding fade as divergence instead of immediate fading", () => {
    const sectorConstituents: SectorConstituentSnapshot[] = [{
      source: "eastmoney",
      fetchedAt: "2026-06-03T10:30:00+08:00",
      name: "通信设备",
      boardCode: "BK0448",
      boardType: "industry",
      stocks: Array.from({ length: 60 }, (_, index) => ({
        code: String(600000 + index),
        marketCode: `sh${600000 + index}`,
        name: `测试${index}`,
        changePct: index < 4 ? 10 : index < 38 ? 1.2 : -0.8,
        amount: index < 4 ? 100000000 - index * 1000000 : 1000000,
        floatMarketValue: index < 4 ? 10000000000 - index * 100000000 : 100000000,
        mainNetInflow: index < 4 ? 10000000 : -100000
      }))
    }];
    const limitPools: LimitPoolSnapshot[] = [{
      source: "eastmoney",
      fetchedAt: "2026-06-03T10:30:00+08:00",
      pool: "zt",
      date: "20260603",
      stocks: Array.from({ length: 4 }, (_, index) => ({
        code: String(600000 + index),
        marketCode: `sh${600000 + index}`,
        name: `测试${index}`,
        industry: "通信设备"
      }))
    }];
    const factPackage = buildPackage({
      sectorConstituents,
      limitPools,
      boardOverview: table("board", [], [{
        name: "通信设备",
        changePct: -0.8,
        changePct5d: 8,
        changePct20d: 18,
        mainNetInflow: -500,
        mainNetInflow5d: -1200,
        upDownRatio: "38:22",
        leadStock: "测试0(10.00)"
      }])
    });

    expect(factPackage.sectors[0]?.rawStage).toBe("分歧");
    expect(factPackage.sectors[0]?.stage).toBe("分歧");
    expect(factPackage.sectors[0]?.diagnostics.find((item) => item.label === "涨停核心")?.score).toBeGreaterThanOrEqual(6);
  });

  it("merges highly confident sector aliases before mainline scoring", () => {
    const factPackage = buildPackage({
      boardOverview: table("board", [], [{
        name: "元件",
        changePct: 1.5,
        changePct5d: 3,
        changePct20d: 8,
        mainNetInflow: 500,
        mainNetInflow5d: 1200,
        upDownRatio: "62:38"
      }, {
        name: "被动元件概念",
        changePct: 2.5,
        changePct5d: 4,
        changePct20d: 9,
        mainNetInflow: 900,
        mainNetInflow5d: 1800,
        upDownRatio: "68:32"
      }]),
      sectorConstituents: []
    });
    const merged = factPackage.sectors.filter((sector) => sector.normalizedName === "元件");

    expect(merged).toHaveLength(1);
    expect(merged[0]?.name).toBe("元件");
    expect(merged[0]?.sourceNames).toEqual(expect.arrayContaining(["元件", "被动元件概念"]));
    expect(factPackage.facts.find((fact) => fact.factId === "rule.sector.元件.alias_merge")?.text).toContain("被动元件概念");
  });

  it("uses stage migration to prevent a startup mainline from jumping directly to accelerating", () => {
    const marketTimeline: MarketTimelinePoint[] = [{
      reportId: "previous",
      createdAt: "2026-06-02T15:00:00+08:00",
      marketState: "cautious",
      marketRegime: "震荡",
      tradeMode: "试错",
      sentimentCycle: "启动",
      score: 55,
      topSectors: [{
        name: "通信设备",
        stage: "启动",
        score: 55,
        coreStocks: [{
          code: "600000",
          name: "测试0",
          role: "龙头",
          score: 60,
          limitStatus: "涨停"
        }]
      }]
    }];
    const factPackage = buildPackage({
      marketTimeline,
      boardOverview: table("board", [], [{
        name: "通信设备",
        changePct: 4.2,
        changePct5d: 14,
        changePct20d: 22,
        mainNetInflow: 1500,
        mainNetInflow5d: 3500,
        upDownRatio: "82:18",
        leadStock: "测试0(10.00)"
      }])
    });

    expect(factPackage.sectors[0]?.rawStage).toBe("加速");
    expect(factPackage.sectors[0]?.stage).toBe("确认");
    expect(factPackage.sectors[0]?.stageTransition).toBe("压制升级");
    expect(factPackage.sectors[0]?.stageTransitionReason).toContain("加速必须建立在已确认主线之上");
    expect(factPackage.sectors[0]?.coreContinuity?.retained).toContain("测试0");
    expect(factPackage.sectors[0]?.coreContinuity?.state).not.toBe("换龙头待确认");
  });

  it("buffers confirmed or accelerating mainlines from one-step fading when core structure is still alive", () => {
    const marketTimeline: MarketTimelinePoint[] = [{
      reportId: "previous",
      createdAt: "2026-06-02T15:00:00+08:00",
      marketState: "cautious",
      marketRegime: "震荡",
      tradeMode: "试错",
      sentimentCycle: "修复",
      score: 65,
      topSectors: [{
        name: "通信设备",
        stage: "确认",
        score: 68,
        coreStocks: [{
          code: "600000",
          name: "测试0",
          role: "龙头",
          score: 62,
          limitStatus: "涨停"
        }, {
          code: "600001",
          name: "测试1",
          role: "中军",
          score: 52,
          limitStatus: "未涨停"
        }]
      }]
    }];
    const sectorConstituents: SectorConstituentSnapshot[] = [{
      source: "eastmoney",
      fetchedAt: "2026-06-03T10:30:00+08:00",
      name: "通信设备",
      boardCode: "BK0448",
      boardType: "industry",
      stocks: Array.from({ length: 80 }, (_, index) => ({
        code: String(600000 + index),
        marketCode: `sh${600000 + index}`,
        name: `测试${index}`,
        changePct: index < 3 ? 10 : index < 30 ? 0.8 : -1.5,
        amount: index < 3 ? 100000000 - index * 1000000 : 1000000,
        floatMarketValue: index < 3 ? 10000000000 - index * 100000000 : 100000000,
        mainNetInflow: index < 3 ? 10000000 : -100000
      }))
    }];
    const limitPools: LimitPoolSnapshot[] = [{
      source: "eastmoney",
      fetchedAt: "2026-06-03T10:30:00+08:00",
      pool: "zt",
      date: "20260603",
      stocks: Array.from({ length: 3 }, (_, index) => ({
        code: String(600000 + index),
        marketCode: `sh${600000 + index}`,
        name: `测试${index}`,
        industry: "通信设备"
      }))
    }];
    const factPackage = buildPackage({
      marketTimeline,
      sectorConstituents,
      limitPools,
      boardOverview: table("board", [], [{
        name: "通信设备",
        changePct: -1.2,
        changePct5d: -4.2,
        changePct20d: -1,
        mainNetInflow: -1200,
        mainNetInflow5d: -2500,
        upDownRatio: "30:50",
        leadStock: "测试0(10.00)"
      }])
    });

    expect(factPackage.sectors[0]?.rawStage).toBe("退潮");
    expect(factPackage.sectors[0]?.stage).toBe("分歧");
    expect(factPackage.sectors[0]?.stageTransition).toBe("降级修正");
    expect(factPackage.sectors[0]?.stageTransitionReason).toContain("分歧缓冲");
  });

  it("allows a startup mainline to confirm through a limit-core path before broad diffusion fully matures", () => {
    const marketTimeline: MarketTimelinePoint[] = [{
      reportId: "previous",
      createdAt: "2026-06-02T15:00:00+08:00",
      marketState: "cautious",
      marketRegime: "震荡",
      tradeMode: "试错",
      sentimentCycle: "启动",
      score: 55,
      topSectors: [{
        name: "通信设备",
        stage: "启动",
        score: 55,
        coreStocks: [{
          code: "600000",
          name: "测试0",
          role: "龙头",
          score: 60,
          limitStatus: "涨停"
        }]
      }]
    }];
    const sectorConstituents: SectorConstituentSnapshot[] = [{
      source: "eastmoney",
      fetchedAt: "2026-06-03T10:30:00+08:00",
      name: "通信设备",
      boardCode: "BK0448",
      boardType: "industry",
      stocks: Array.from({ length: 100 }, (_, index) => ({
        code: String(600000 + index),
        marketCode: `sh${600000 + index}`,
        name: `测试${index}`,
        changePct: index < 5 ? 10 : index < 56 ? 1.5 : -0.5,
        amount: index < 5 ? 100000000 - index * 1000000 : 1000000,
        floatMarketValue: index < 5 ? 10000000000 - index * 100000000 : 100000000,
        mainNetInflow: index < 5 ? 10000000 : 0
      }))
    }];
    const limitPools: LimitPoolSnapshot[] = [{
      source: "eastmoney",
      fetchedAt: "2026-06-03T10:30:00+08:00",
      pool: "zt",
      date: "20260603",
      stocks: Array.from({ length: 5 }, (_, index) => ({
        code: String(600000 + index),
        marketCode: `sh${600000 + index}`,
        name: `测试${index}`,
        industry: "通信设备"
      }))
    }];
    const factPackage = buildPackage({
      marketTimeline,
      sectorConstituents,
      limitPools,
      boardOverview: table("board", [], [{
        name: "通信设备",
        changePct: 5,
        changePct5d: 9,
        changePct20d: 30,
        mainNetInflow: 100,
        mainNetInflow5d: 0,
        upDownRatio: "56:44",
        leadStock: "测试0(10.00)"
      }])
    });

    expect(factPackage.sectors[0]?.rawStage).toBe("确认");
    expect(factPackage.sectors[0]?.stage).toBe("确认");
    expect(factPackage.sectors[0]?.stageTransitionReason).toContain("涨停核心确认");
    expect(factPackage.sectors[0]?.fundingScore).toBeLessThan(14);
    expect(factPackage.sectors[0]?.breadthScore).toBeLessThan(12);
  });

  it("uses core stock limit status when limit-pool industry mapping misses the sector", () => {
    const sectorConstituents: SectorConstituentSnapshot[] = [{
      source: "eastmoney",
      fetchedAt: "2026-06-03T10:30:00+08:00",
      name: "电子特气",
      boardCode: "BK1234",
      boardType: "concept",
      stocks: Array.from({ length: 20 }, (_, index) => ({
        code: String(688100 + index),
        marketCode: `sh${688100 + index}`,
        name: `特气${index}`,
        changePct: index < 3 ? 10 : index < 12 ? 2 : -1,
        amount: 100000000 - index * 1000000,
        floatMarketValue: 10000000000 - index * 100000000,
        mainNetInflow: index < 5 ? 10000000 : 0
      }))
    }];
    const limitPools: LimitPoolSnapshot[] = [{
      source: "eastmoney",
      fetchedAt: "2026-06-03T10:30:00+08:00",
      pool: "zt",
      date: "20260603",
      stocks: Array.from({ length: 3 }, (_, index) => ({
        code: String(688100 + index),
        marketCode: `sh${688100 + index}`,
        name: `特气${index}`,
        industry: "半导体"
      }))
    }];

    const factPackage = buildPackage({
      boardOverview: table("board", [], [{
        name: "电子特气",
        changePct: 2.5,
        changePct5d: 4,
        changePct20d: 8,
        mainNetInflow: 1000,
        mainNetInflow5d: 2000,
        upDownRatio: "60:40",
        leadStock: "特气0(10.00)"
      }]),
      sectorConstituents,
      limitPools
    });

    expect(factPackage.ruleResult.sectors[0]?.diagnostics.find((item) => item.label === "涨停核心")?.note).toContain("涨停 3 只");
    expect(factPackage.facts.find((fact) => fact.factId === "sector.电子特气.limit_pool.concentration")?.text).toContain("核心股涨停状态回补");
  });

  it("avoids a stock with continuous main fund outflow", () => {
    const stock = stockInput({ close: 102, ma5: 101, ma10: 101, ma20: 100, ma60: 95, mainNetFlow: -100, mainNetFlow5D: -200 });
    const factPackage = buildPackage(stock);
    expect(factPackage.candidates[0]?.action).toBe("回避");
    expect(factPackage.candidates[0]?.riskFlags.join("\n")).toContain("主力资金净流出");
  });

  it("treats short-term inflow against 20-day outflow as mixed funding", () => {
    const stock = stockInput({ close: 102, ma5: 101, ma10: 101, ma20: 100, ma60: 95, mainNetFlow: 100, mainNetFlow5D: 200 });
    stock.stockFundFlows = table("asfund", ["sh600001"], [{
      code: "sh600001",
      MainNetFlow: 100,
      MainNetFlow5D: 200,
      MainNetFlow10D: -300,
      MainNetFlow20D: -500
    }]);
    const factPackage = buildPackage(stock);
    const fundDiagnostic = factPackage.candidates[0]?.diagnostics?.find((item) => item.label === "资金承接");

    expect(factPackage.candidates[0]?.fundFlowState).toBe("mixed");
    expect(fundDiagnostic?.note).toContain("20日");
  });

  it("marks stretched stocks as no-chase with zero position", () => {
    const stock = stockInput({ close: 120, ma5: 105, ma10: 103, ma20: 100, ma60: 95, mainNetFlow: 100, mainNetFlow5D: 200 });
    const factPackage = buildPackage(stock);
    expect(factPackage.candidates[0]?.action).toBe("不追");
    expect(factPackage.candidates[0]?.positionLimitPct).toBe(0);
  });

  it("does not assign a position to limit-up or near-limit candidates even when the mainline is strong", () => {
    const stock = stockInput({ close: 102, ma5: 101, ma10: 101, ma20: 100, ma60: 95, mainNetFlow: 100, mainNetFlow5D: 200 });
    stock.hotStocks = table("hot", ["stock", "--limit", "50"], [{
      code: "sh600001",
      name: "涨停测试",
      stock_type: "GP-A",
      zxj: 102,
      zdf: 9.9
    }]);
    const factPackage = buildPackage(stock);
    const candidate = factPackage.candidates[0];

    expect(candidate?.tradability?.status).toBe("涨停不可达");
    expect(candidate?.tradability?.nextSessionPlan?.mode).toBe("次日竞价观察");
    expect(candidate?.tradability?.nextSessionPlan?.preconditions.join("\n")).toContain("竞价");
    expect(candidate?.action).toBe("不追");
    expect(candidate?.positionLimitPct).toBe(0);
    expect(candidate?.riskFlags.join("\n")).toContain("买入不可达");
    expect(factPackage.facts.find((fact) => fact.factId === "rule.stock.sh600001.tradability")?.text).toContain("涨停不可达");
  });

  it("uses amount turnover and funding as activity evidence instead of volume ratio", () => {
    const stock = stockInput({ close: 102, ma5: 101, ma10: 101, ma20: 100, ma60: 95, mainNetFlow: 10000000, mainNetFlow5D: 20000000 });
    stock.hotStocks = table("hot", ["stock", "--limit", "50"], [{
      code: "sh600001",
      name: "活跃测试",
      stock_type: "GP-A",
      zxj: 102,
      zdf: 9.2,
      cje: 2500000000,
      hsl: 8.5
    }]);
    const factPackage = buildPackage(stock);
    const candidate = factPackage.candidates[0];
    const activity = candidate?.diagnostics?.find((item) => item.label === "活跃度");

    expect(candidate?.activity?.status).toBe("中");
    expect(candidate?.activity?.basis.amount).toBe(2500000000);
    expect(candidate?.activity?.basis.turnoverRate).toBe(8.5);
    expect(activity?.note).toContain("成交额");
    expect(activity?.note).toContain("换手");
    expect(candidate?.signalReasons?.join("\n")).toContain("活跃度中");
    expect(factPackage.facts.find((fact) => fact.factId === "rule.stock.sh600001.activity")?.text).toContain("活跃度评分");
  });

  it("does not allow small-trial action when buy point is only pending activation", () => {
    const stock = stockInput({ close: 102, ma5: 101, ma10: 101, ma20: 100, ma60: 95, mainNetFlow: 10000000, mainNetFlow5D: 20000000 });
    stock.hotStocks = table("hot", ["stock", "--limit", "50"], [{
      code: "sh600001",
      name: "弱承接测试",
      stock_type: "GP-A",
      zxj: 102,
      zdf: 1.2,
      cje: 50000000,
      hsl: 0.6
    }]);

    const factPackage = buildPackage(stock);
    const candidate = factPackage.candidates[0];

    expect(candidate?.buyPointEvaluation?.status).toBe("待激活");
    expect(candidate?.action).not.toBe("小仓试错");
    expect(candidate?.positionLimitPct).toBe(0);
    expect(candidate?.riskFlags.join("\n")).toContain("买点待激活");
  });

  it("explains sector funding quality with relative capital evidence", () => {
    const factPackage = buildPackage();
    const funding = factPackage.sectors[0]?.diagnostics.find((item) => item.label === "资金强度");
    const fact = factPackage.facts.find((item) => item.factId === "rule.sector.通信设备.stage");

    expect(funding?.note).toContain("资金状态");
    expect(funding?.note).toContain("净流入/成交额");
    expect(fact?.text).toContain("资金依据");
    expect(fact?.text).toContain("资金约束");
  });

  it("adds stage-aware candidate weighting explanation", () => {
    const factPackage = buildPackage();
    const dynamicWeight = factPackage.candidates[0]?.diagnostics?.find((item) => item.label === "阶段权重");

    expect(dynamicWeight).toBeTruthy();
    expect(dynamicWeight?.note).toContain("/");
  });

  it("distinguishes reclaiming MA20 from a clean bullish moving-average structure", () => {
    const stock = stockInput({ close: 101, ma5: 97, ma10: 99, ma20: 100, ma60: 105, mainNetFlow: 10000000, mainNetFlow5D: 20000000 });
    const factPackage = buildPackage(stock);
    const trend = factPackage.candidates[0]?.diagnostics?.find((item) => item.label === "趋势位置");

    expect(factPackage.candidates[0]?.trendState).toBe("reclaim_ma20");
    expect(trend?.note).toContain("刚收复MA20");
    expect(trend?.note).toContain("均线排列");
  });

  it("sorts the candidate pool by signal quality instead of raw source order", () => {
    const factPackage = buildPackage({
      hotStocks: table("hot", ["stock", "--limit", "50"], [
        { code: "sh600001", name: "追高测试", stock_type: "GP-A", zxj: 120, zdf: 9.2, cje: 1200000000, hsl: 7.5 },
        { code: "sh600002", name: "回踩测试", stock_type: "GP-A", zxj: 102, zdf: 1.1, cje: 1500000000, hsl: 5.5 }
      ]),
      stockKlines: table("kline", ["sh600001,sh600002", "--period", "day", "--limit", "30"], [
        { symbol: "sh600001", last: 120, volume: 10000, amount: 50000000 },
        { symbol: "sh600002", last: 102, volume: 10000, amount: 50000000 }
      ]),
      stockTechnicals: table("technical", ["sh600001,sh600002"], [
        { code: "sh600001", closePrice: 120, "ma.MA_5": 105, "ma.MA_10": 103, "ma.MA_20": 100, "ma.MA_60": 95 },
        { code: "sh600002", closePrice: 102, "ma.MA_5": 101, "ma.MA_10": 101, "ma.MA_20": 100, "ma.MA_60": 95 }
      ]),
      stockFundFlows: table("asfund", ["sh600001,sh600002"], [
        { code: "sh600001", MainNetFlow: 100, MainNetFlow5D: 200, MainNetFlow10D: 200, MainNetFlow20D: 200 },
        { code: "sh600002", MainNetFlow: 100, MainNetFlow5D: 200, MainNetFlow10D: 200, MainNetFlow20D: 200 }
      ]),
      stockProfiles: table("profile", ["sh600001,sh600002"], [
        { code: "sh600001", name: "追高测试", business: "通信设备制造与服务", industry: "通信设备" },
        { code: "sh600002", name: "回踩测试", business: "通信设备制造与服务", industry: "通信设备" }
      ])
    });

    expect(factPackage.candidates[0]?.code).toBe("sh600002");
    expect(factPackage.candidates[0]?.action).toBe("小仓试错");
    expect(factPackage.candidates[0]?.signalTier).toBe("S");
    expect(factPackage.candidates[0]?.signalScore).toBeGreaterThan(factPackage.candidates.find((item) => item.code === "sh600001")?.signalScore ?? 0);
    expect(factPackage.facts.find((fact) => fact.factId === "rule.stock.sh600002.signal_quality")).toBeTruthy();
  });

  it("keeps signal quality from being dominated by final action or repeated hard-risk penalties", () => {
    const base = {
      action: ZH.observe,
      strengthScore: 88,
      buyPointEvaluation: {
        type: ZH.maPullback,
        score: 16,
        status: "待激活",
        satisfied: ["趋势保持"],
        blockers: [],
        triggerCondition: "放量站稳分时均价线",
        invalidCondition: "跌破MA20",
        sessionNote: "盘中观察"
      },
      dataCompleteness: {
        level: "complete",
        hasHotData: true,
        hasKlineData: true,
        hasTechnicalData: true,
        hasFundFlowData: true,
        hasSectorData: true,
        hasProfileData: true,
        hasCompanyKnowledge: true,
        missingFields: [],
        blockingReasons: []
      },
      attribution: {
        status: "direct_constituent",
        confidence: "高",
        reason: "成分股直接匹配",
        evidence: ["板块成分"],
        businessKeywords: ["通信设备"],
        sectorKeywords: ["通信"],
        blockers: [],
        shouldExclude: false
      },
      role: ZH.core,
      trendState: "above_ma20",
      fundFlowState: "inflow",
      marketState: "cautious",
      sectorStage: ZH.startup,
      tradability: {
        status: "可买入观察",
        score: 80,
        blockers: [],
        waitFor: "等待规则确认",
        nextSessionPlan: { mode: "无", preconditions: [], doNotChase: [], invalidConditions: [] }
      },
      riskFlags: []
    } satisfies Parameters<typeof evaluateCandidateSignalQuality>[0];

    const observed = evaluateCandidateSignalQuality({ ...base, action: ZH.observe });
    expect(observed.score).toBeGreaterThanOrEqual(70);
    expect(observed.reasons.join("；")).toContain("动作观察");
    expect(observed.reasons.join("；")).toContain("数据完整");
    expect(observed.reasons.join("；")).toContain("归属");
    expect(observed.reasons.join("；")).toContain("高置信");
    expect(observed.reasons.join("；")).toContain("趋势站上MA20");
    expect(observed.reasons.join("；")).toContain("资金流入");
    expect(observed.reasons.join("；")).toContain("信号分只用于候选排序");
    expect(observed.reasons.join("；")).not.toMatch(/\bcomplete\b|\bhigh\b|\babove_ma20\b|\binflow\b/);

    const repeatedRisk = evaluateCandidateSignalQuality({
      ...base,
      action: ZH.noChase,
      trendState: "below_ma20",
      fundFlowState: "outflow",
      attribution: { ...base.attribution, shouldExclude: true, status: "mismatch", reason: "主题偏离" },
      tradability: { ...base.tradability, status: "涨停不可达" },
      riskFlags: ["风险1", "风险2", "风险3", "风险4", "风险5", "风险6"]
    });
    expect(repeatedRisk.reasons.join("；")).toContain("封顶");
  });

  it("gives position only to explicit small-trial actions", () => {
    const pullback = buildPackage();
    expect(pullback.candidates[0]?.action).toBe("小仓试错");
    expect(pullback.candidates[0]?.positionLimitPct).toBe(10);

    const stock = stockInput({ close: 103, ma5: 106, ma10: 102, ma20: 95, ma60: 90, mainNetFlow: -100, mainNetFlow5D: -200 });
    const waiting = buildPackage(stock);
    expect(waiting.candidates[0]?.action).not.toBe("小仓试错");
    expect(waiting.candidates[0]?.positionLimitPct).toBe(0);
  });

  it("allows high-quality breakout pullback only for core stocks under tradable or confirmed conditions", () => {
    const base = {
      dataCompleteness: {
        level: "complete",
        hasHotData: true,
        hasKlineData: true,
        hasTechnicalData: true,
        hasFundFlowData: true,
        hasSectorData: true,
        hasProfileData: true,
        hasCompanyKnowledge: true,
        missingFields: [],
        blockingReasons: []
      },
      trendState: "above_ma20",
      fundFlowState: "inflow",
      buyPointType: ZH.breakoutPullback,
      buyPointStatus: "有效",
      marketState: "tradable",
      sectorStage: ZH.confirmed,
      sectorAllowedBuyTypes: [ZH.maPullback, ZH.breakoutPullback, ZH.divergenceRepair],
      role: ZH.core,
      farAboveMa5: false,
      farAboveMa20: false,
      tradability: {
        status: "可买入观察",
        score: 80,
        blockers: [],
        waitFor: "可进入规则仓位评估",
        nextSessionPlan: { mode: "无", preconditions: [], doNotChase: [], invalidConditions: [] }
      },
      strengthScore: 78,
      sectorEvidenceOk: true
    } satisfies Parameters<typeof decideCandidateAction>[0];

    expect(decideCandidateAction(base)).toBe("小仓试错");
    expect(decideCandidateAction({ ...base, role: ZH.catchUp })).toBe("等待回踩");
    expect(decideCandidateAction({ ...base, strengthScore: 72 })).toBe("等待回踩");
    expect(decideCandidateAction({ ...base, tradability: { ...base.tradability, status: "高位拉升" } })).toBe("等待回踩");
  });

  it("keeps cautious-market breakout pullbacks waiting unless the sector is confirmed and the score is exceptional", () => {
    const base = {
      dataCompleteness: {
        level: "complete",
        hasHotData: true,
        hasKlineData: true,
        hasTechnicalData: true,
        hasFundFlowData: true,
        hasSectorData: true,
        hasProfileData: true,
        hasCompanyKnowledge: true,
        missingFields: [],
        blockingReasons: []
      },
      trendState: "above_ma20",
      fundFlowState: "inflow",
      buyPointType: ZH.breakoutPullback,
      buyPointStatus: "有效",
      marketState: "cautious",
      sectorStage: ZH.startup,
      sectorAllowedBuyTypes: [ZH.maPullback, ZH.breakoutPullback],
      role: ZH.leader,
      farAboveMa5: false,
      farAboveMa20: false,
      tradability: {
        status: "可买入观察",
        score: 80,
        blockers: [],
        waitFor: "可进入规则仓位评估",
        nextSessionPlan: { mode: "无", preconditions: [], doNotChase: [], invalidConditions: [] }
      },
      strengthScore: 84,
      sectorEvidenceOk: true
    } satisfies Parameters<typeof decideCandidateAction>[0];

    expect(decideCandidateAction(base)).toBe("等待回踩");
    expect(decideCandidateAction({ ...base, sectorStage: ZH.confirmed, sectorAllowedBuyTypes: [ZH.maPullback, ZH.breakoutPullback, ZH.divergenceRepair] })).toBe("小仓试错");
  });

  it("allows smaller small-trial positions in cautious markets only for confirmed core opportunities", () => {
    const cautious = buildPackage({
      marketBreadth: {
        source: "eastmoney",
        fetchedAt: "2026-06-03T10:30:00+08:00",
        total: 5200,
        up: 2700,
        down: 2300,
        flat: 200,
        upPct: 51.92,
        downPct: 44.23,
        gt5Count: 120,
        ltMinus5Count: 80,
        limitUpApprox: 38,
        limitDownApprox: 8,
        medianChangePct: 0.12,
        amount: 760000000000
      }
    });

    expect(cautious.market.marketState).toBe("cautious");
    expect(cautious.sectors[0]?.stage).toBe("确认");
    expect(cautious.candidates[0]?.action).toBe("小仓试错");
    expect(cautious.candidates[0]?.buyPointEvaluation?.status).toBe("有效");
    expect(cautious.candidates[0]?.buyPointEvaluation?.triggerCondition).toContain("股价贴近");
    expect(cautious.candidates[0]?.positionLimitPct).toBeLessThanOrEqual(3);
  });

  it("does not buy from observe-stage sectors even when the stock has a technical pullback", () => {
    const observe = buildPackage({
      boardOverview: table("board", [], [{
        name: "通信设备",
        changePct: 0.2,
        changePct5d: 0.3,
        changePct20d: 1,
        mainNetInflow: 0,
        mainNetInflow5d: 0,
        upDownRatio: "52:48"
      }]),
      sectorConstituents: [],
      limitPools: []
    });

    expect(observe.sectors[0]?.stage).toBe("观察");
    expect(observe.candidates[0]?.action).toBe("观察");
    expect(observe.candidates[0]?.positionLimitPct).toBe(0);
  });

  it("explains why buy point quality is not activated in defensive markets", () => {
    const defensive = buildPackage({
      marketKlines: [
        indexKline("sh000001", 80, -0.5),
        indexKline("sz399001", 80, -0.5),
        indexKline("sz399006", 80, -0.5),
        indexKline("sh000688", 80, -0.5)
      ]
    });
    const buyPoint = defensive.candidates[0]?.diagnostics?.find((item) => item.label === "买点质量");

    expect(defensive.market.marketState).toBe("defensive");
    expect(buyPoint?.note).toContain("大盘防守");
    expect(defensive.candidates[0]?.buyPointEvaluation?.status).toBe("待激活");
    expect(defensive.candidates[0]?.buyPointEvaluation?.triggerCondition).toContain("大盘至少修复至谨慎交易");
    expect(defensive.candidates[0]?.positionLimitPct).toBe(0);
  });

  it("reads batch kline rows after the westock batch status table", () => {
    const stock = stockInput({ close: 102, ma5: 101, ma10: 101, ma20: 100, ma60: 95, mainNetFlow: 100, mainNetFlow5D: 200 });
    stock.stockKlines = {
      command: "kline",
      args: ["sh600001", "--period", "day", "--limit", "30"],
      status: "success",
      rawText: "",
      warnings: [],
      sections: [
        { title: "批量状态", type: "markdownTable", columns: [], rows: [{ 状态: "success", 总数: 1, 成功: 1, 失败: 0 }], raw: "" },
        { title: "K线", type: "markdownTable", columns: ["symbol", "last", "volume", "amount"], rows: [{ symbol: "sh600001", last: 102, volume: 10000, amount: 50000000 }], raw: "" }
      ]
    };

    const factPackage = buildPackage(stock);

    expect(factPackage.candidates[0]?.dataCompleteness.hasKlineData).toBe(true);
    expect(factPackage.candidates[0]?.dataCompleteness.missingFields).not.toContain("K线");
  });

  it("matches candidate kline rows by normalized code fields", () => {
    const stock = stockInput({ close: 102, ma5: 101, ma10: 101, ma20: 100, ma60: 95, mainNetFlow: 100, mainNetFlow5D: 200 });
    stock.stockKlines = table("kline", ["600001", "--period", "day", "--limit", "30"], [{
      code: "600001",
      date: "2026-06-22",
      last: 102,
      volume: 10000,
      amount: 50000000
    }]);

    const factPackage = buildPackage(stock);

    expect(factPackage.candidates[0]?.dataCompleteness.hasKlineData).toBe(true);
    expect(factPackage.candidates[0]?.dataCompleteness.blockingReasons.join("\n")).not.toContain("K");
    expect(factPackage.candidates[0]?.klineSummary?.latestClose).toBe(102);
  });

  it("keeps core trading data complete even when company knowledge still needs enrichment", () => {
    const companyKnowledge = buildCompanyKnowledge("sh600001", "测试股份", {
      code: "sh600001",
      name: "测试股份",
      business: "通信设备制造与服务",
      industry: "通信设备"
    }, "通信设备", {
      hasSectorMembership: true,
      hasBusinessMatch: true,
      themeMatchType: "direct_constituent",
      themeMatchLogic: "成分股直接匹配"
    });
    const completeness = buildCompleteness(true, true, true, true, true, true, {
      ...companyKnowledge,
      companyKnowledgeState: "partial",
      missingFields: ["财务摘要", "股东户数"]
    });

    expect(completeness.level).toBe("complete");
    expect(completeness.coreMarketLevel).toBe("complete");
    expect(completeness.companyKnowledgeLevel).toBe("partial");
    expect(completeness.blockingReasons).toHaveLength(0);
    expect(completeness.missingFields).toContain("公司认知补充字段");
  });

  it("builds company knowledge with finance and shareholder summaries", () => {
    const stock = stockInput({ close: 102, ma5: 101, ma10: 101, ma20: 100, ma60: 95, mainNetFlow: 100, mainNetFlow5D: 200 });
    const factPackage = buildPackage({
      ...stock,
      stockIncomeStatements: table("finance", ["sh600001", "--type", "lrb"], [{
        symbol: "sh600001",
        EndDate: "2025-12-31",
        OperatingRevenue: 1000000000,
        NPParentCompanyOwners: 120000000,
        GrossProfitTTM: 250000000
      }, {
        symbol: "sh600001",
        EndDate: "2025-09-30",
        OperatingRevenue: 850000000,
        NPParentCompanyOwners: 80000000,
        GrossProfitTTM: 180000000
      }]),
      stockBalanceSheets: table("finance", ["sh600001", "--type", "zcfz"], [{
        symbol: "sh600001",
        EndDate: "2025-12-31",
        TotalAssets: 2000000000,
        TotalLiability: 800000000,
        TotalShareholderEquity: 1200000000
      }]),
      stockCashFlows: table("finance", ["sh600001", "--type", "xjll"], [{
        symbol: "sh600001",
        EndDate: "2025-12-31",
        NetOperateCashFlow: 160000000
      }, {
        symbol: "sh600001",
        EndDate: "2025-09-30",
        NetOperateCashFlow: 90000000
      }]),
      stockShareholders: {
        command: "shareholder",
        args: ["sh600001"],
        status: "success",
        rawText: "",
        warnings: [],
        sections: [
          { title: "批量状态", type: "markdownTable", columns: [], rows: [{ 状态: "success" }], raw: "" },
          { title: "十大股东", type: "markdownTable", columns: ["no", "name", "holdPct"], rows: [{ no: 1, name: "测试控股", holdPct: 35 }], raw: "" },
          { title: "十大流通股东", type: "markdownTable", columns: ["no", "name", "holdPct"], rows: [{ no: 1, name: "测试控股", holdPct: 35 }], raw: "" },
          { title: "股东户数统计", type: "markdownTable", columns: ["date", "totalSHNum"], rows: [{ date: "2025-12-31", totalSHNum: 10000 }, { date: "2025-09-30", totalSHNum: 11000 }], raw: "" }
        ]
      },
      stockReserves: table("reserve", ["sh600001"], [{
        code: "sh600001",
        reportEndDate: "2026-03-31",
        disclosureDate: "2026-04-30",
        disclosureDesc: "预计披露一季报"
      }])
    });
    const card = factPackage.candidates[0]?.companyKnowledge;

    expect(card?.themeMatchType).toBe("direct_constituent");
    expect(card?.financialSummary?.revenue).toBe(1000000000);
    expect(card?.financialSummary?.revenueChangePct).toBeCloseTo(17.65, 2);
    expect(card?.financialSummary?.trendBasis?.join("\n")).toContain("最近多期营收变化");
    expect(card?.financialTrend).toBe("改善");
    expect(card?.shareholderSummary?.topHolder).toBe("测试控股");
    expect(card?.earningsPreview?.disclosureDate).toBe("2026-04-30");
    expect(card?.logicInvalidConditions.length).toBeGreaterThan(0);
    expect(factPackage.facts.find((fact) => fact.factId === "company.sh600001.financial.summary")).toBeTruthy();
  });

  it("excludes a hot stock from candidates without constituent or business evidence", () => {
    const mismatchStock = stockInput({ close: 102, ma5: 101, ma10: 101, ma20: 100, ma60: 95, mainNetFlow: 100, mainNetFlow5D: 200 });
    mismatchStock.stockProfiles = table("profile", ["sh600001"], [{
      code: "sh600001",
      name: "测试股份",
      business: "火力发电、售电与热力供应",
      industry: "电力"
    }]);
    const factPackage = buildPackage({
      ...mismatchStock,
      sectorConstituents: []
    });

    expect(factPackage.candidates).toHaveLength(0);
    expect(factPackage.candidateReviews?.[0]).toMatchObject({
      code: "sh600001",
      status: "人工复核",
      attributionStatus: "mismatch",
      reviewRequired: true
    });
    expect(factPackage.candidateReviews?.[0]?.missingEvidence.join("\n")).toContain("当前主线成分股或主营直接匹配证据");
    expect(factPackage.facts.find((fact) => fact.factId === "rule.stock.sh600001.candidate_excluded")?.text).toContain("未进入候选股信号表");
  });

  it("keeps direct constituent attribution as high-confidence evidence", () => {
    const factPackage = buildPackage();
    const candidate = factPackage.candidates.find((item) => item.code === "sh600001");

    expect(candidate?.mainlineAttribution?.status).toBe("direct_constituent");
    expect(candidate?.mainlineAttribution?.confidence).toBe("高");
    expect(candidate?.mainlineAttribution?.shouldExclude).toBe(false);
    expect(candidate?.mainlineAttribution?.evidenceChain?.sourceQuality).toBe("direct");
    expect(candidate?.mainlineAttribution?.evidenceChain?.constituentEvidence.join("\n")).toContain("成分股");
    expect(candidate?.evidenceRefs).toContain("rule.stock.sh600001.mainline_attribution");
    expect(candidate?.evidenceRefs).toContain("rule.stock.sh600001.role");
  });

  it("allows a hot stock only when business directly matches a current mainline", () => {
    const businessMatch = stockInput({ close: 102, ma5: 101, ma10: 101, ma20: 100, ma60: 95, mainNetFlow: 100, mainNetFlow5D: 200 });
    businessMatch.stockProfiles = table("profile", ["sh600001"], [{
      code: "sh600001",
      name: "测试股份",
      business: "光模块、网络设备和通信设备制造",
      industry: "通信设备"
    }]);
    const factPackage = buildPackage({
      ...businessMatch,
      sectorConstituents: []
    });
    const candidate = factPackage.candidates.find((item) => item.code === "sh600001");

    expect(candidate?.mainlineAttribution?.status).toBe("business_direct");
    expect(candidate?.mainlineAttribution?.shouldExclude).toBe(false);
    expect(candidate?.mainlineAttribution?.businessKeywords.length).toBeGreaterThan(0);
    expect(candidate?.mainlineAttribution?.evidenceChain?.sourceQuality).toBe("inferred");
    expect(candidate?.mainlineAttribution?.evidenceChain?.reviewRequired).toBe(true);
    expect(candidate?.mainlineAttribution?.evidenceChain?.negativeEvidence.join("\n")).toContain("缺少当前主线成分股直接证据");
  });

  it("does not include supply-chain weak relation as a candidate without direct evidence", () => {
    const weakRelated = stockInput({ close: 102, ma5: 101, ma10: 101, ma20: 100, ma60: 95, mainNetFlow: 100, mainNetFlow5D: 200 });
    weakRelated.stockProfiles = table("profile", ["sh600001"], [{
      code: "sh600001",
      name: "测试股份",
      business: "显示面板、显示器件和终端模组研发制造",
      industry: "显示器件"
    }]);
    const factPackage = buildPackage({
      ...weakRelated,
      boardOverview: table("board", [], [{
        name: "元件",
        changePct: 2,
        changePct5d: 5,
        changePct20d: 10,
        mainNetInflow: 1000,
        mainNetInflow5d: 2000,
        upDownRatio: "80:20",
        leadStock: "测试0(10.00)"
      }]),
      sectorConstituents: []
    });

    expect(factPackage.candidates).toHaveLength(0);
    expect(factPackage.candidateReviews?.[0]?.attributionStatus).toBe("supply_chain_related");
    expect(factPackage.candidateReviews?.[0]?.evidenceChain?.sourceQuality).toBe("weak");
    const excluded = factPackage.facts.find((fact) => fact.factId === "rule.stock.sh600001.candidate_excluded");
    expect(excluded?.text).toContain("仅存在产业链或题材弱相关");
    const attribution = factPackage.facts.find((fact) => fact.factId === "rule.stock.sh600001.mainline_attribution");
    expect(attribution?.text).toContain("来源质量weak");
    expect(attribution?.text).toContain("否定证据");
  });
});
