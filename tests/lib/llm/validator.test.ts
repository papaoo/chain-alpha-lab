import { describe, expect, it } from "vitest";
import type { DeepSeekReport, FactPackage } from "../../../src/lib/types";
import { SCHEMA_VERSION } from "../../../src/lib/types";
import { parseAndValidateDeepSeekOutput, parseAndValidateModelAuditOutput } from "../../../src/lib/llm";
import { inferMarketSessionContext } from "../../../src/lib/market/session";

const baseFactPackage: FactPackage = {
  schemaVersion: SCHEMA_VERSION,
  timestamp: "2026-06-03T10:30:00+08:00",
  session: inferMarketSessionContext("2026-06-03T10:30:00+08:00"),
  facts: [
    { factId: "market.sh000001.rule.state", sourceType: "ruleComputed", text: "大盘状态为谨慎交易" },
    { factId: "sector.ai.rule.stage", sourceType: "ruleComputed", text: "AI 主线处于确认阶段" },
    { factId: "stock.sz000001.kline.trend", sourceType: "dataSourceFact", text: "平安银行站上 MA20" },
    { factId: "stock.sz000001.technical.ma20", sourceType: "dataSourceFact", text: "MA20 支撑有效" },
    { factId: "stock.sz000001.fund.mainNetFlow", sourceType: "dataSourceFact", text: "主力资金净流入" },
    { factId: "stock.sz000001.profile.business", sourceType: "dataSourceFact", text: "公司主营业务数据存在" },
  ],
  dataSource: {
    provider: "腾讯自选股行情数据接口",
    via: "westock-data-skillhub",
    packageVersion: "1.0.3",
    status: "success",
    warnings: [],
  },
  market: {
    indices: [],
    marketState: "cautious",
    ruleScore: 60,
    facts: [],
  },
  sectors: [],
  candidates: [
    {
      code: "sz000001",
      name: "平安银行",
      sectorName: "AI",
      role: "中军",
      trendState: "above_ma20",
      fundFlowState: "inflow",
      buyPointType: "回踩均线",
      action: "小仓试错",
      positionLimitPct: 8,
      invalidCondition: "跌破 MA20",
      riskFlags: [],
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
        blockingReasons: [],
      },
      companyKnowledge: {
        code: "sz000001",
        name: "平安银行",
        industry: "银行",
        mainBusiness: "银行业务",
        coreBusiness: "银行业务",
        productsOrServices: ["银行服务"],
        industryChainPosition: "终端应用",
        themeMatchType: "business_direct",
        themeMatch: "medium",
        themeMatchLogic: "数据源事实支持",
        oneLineUnderstanding: "平安银行主要从事银行业务。",
        currentMoveDriver: "产业逻辑",
        financialTrend: "数据不足",
        fundamentalHighlights: [],
        fundamentalRisks: [],
        longTermWatchItems: [],
        logicInvalidConditions: ["主营业务与主线不再匹配。"],
        companyKnowledgeState: "sufficient",
        longTermLogicAllowed: true,
        sourceType: "dataSourceFact",
        missingFields: [],
      },
      klineSummary: {
        period: "day",
        limit: 60,
        latestClose: 10,
        maDistance: { ma20: 1.2 },
        trend: "above_ma20",
        volumePrice: "缩量回踩"
      },
      technical: {
        closePrice: 10,
        ma5: 9.8,
        ma10: 9.6,
        ma20: 9.4,
        ma60: 8.8
      },
      fundFlow: {
        mainNetFlow: 1200,
        mainNetFlow5D: 3200,
        mainNetFlow10D: 4500
      },
      evidenceRefs: [
        "stock.sz000001.kline.trend",
        "stock.sz000001.technical.ma20",
        "stock.sz000001.fund.mainNetFlow",
        "stock.sz000001.profile.business",
      ],
    },
  ],
  constraints: {
    allowedCodes: ["sz000001"],
    maxSingleStockPositionPct: 8,
    maxThemePositionPct: 35,
    minCashPct: 20,
  },
  ruleResult: {
    status: "success",
    market: {
      marketState: "cautious",
      marketStateReason: "正常评估",
      marketRegime: "震荡",
      tradeMode: "试错",
      sentimentCycle: "修复",
      styleBias: "无明显风格",
      confidence: "中",
      dataQuality: "部分",
      diagnostics: [
        { label: "指数结构", score: 24, max: 40, status: "中", note: "测试夹具" },
        { label: "市场宽度", score: 10, max: 20, status: "中", note: "测试夹具" },
        { label: "情绪温度", score: 5, max: 10, status: "中", note: "测试夹具" },
        { label: "主线强度", score: 10, max: 20, status: "中", note: "测试夹具" },
      ],
      maxTotalPositionPct: 25,
      maxSingleStockPct: 3,
      forbiddenActions: ["追涨"],
      score: 60,
      facts: [],
      riskFlags: [],
      status: "success",
    },
    sectors: [],
    candidates: [],
  },
  disclaimer: "本报告仅作交易辅助，不构成收益承诺。",
};

const validReport: DeepSeekReport = {
  schemaVersion: SCHEMA_VERSION,
  summary: "谨慎观察，等待规则条件确认。",
  marketJudgement: {
    level: "谨慎交易",
    evidenceRefs: ["market.sh000001.rule.state"],
    logic: "规则结论提示谨慎。",
    risk: "市场波动风险仍在。",
  },
  mainLines: [
    {
      name: "AI",
      stage: "确认",
      evidenceRefs: ["sector.ai.rule.stage"],
      logic: "主线处于确认阶段。",
    },
  ],
  stockPlans: [
    {
      code: "sz000001",
      name: "平安银行",
      action: "小仓试错",
      companySummary: "公司主营业务数据存在。",
      companySourceNote: "数据源事实",
      evidenceRefs: ["stock.sz000001.kline.trend", "stock.sz000001.fund.mainNetFlow"],
      buyCondition: "回踩不破规则支撑再观察。",
      sellCondition: "放量跌破支撑时退出计划。",
      positionSuggestion: "单票不超过 8%。",
      invalidCondition: "跌破 MA20。",
      doNotBuyCondition: "高开快速拉升时不追。",
      risk: "资金流和主线退潮风险。",
    },
  ],
  notifications: [
    {
      level: "risk",
      message: "关注失效条件。",
      evidenceRefs: ["stock.sz000001.technical.ma20"],
    },
  ],
  disclaimer: "本报告仅作交易辅助，不构成收益承诺。",
};

describe("parseAndValidateDeepSeekOutput", () => {
  it("accepts JSON-only output that satisfies evidence, code and position constraints", () => {
    const result = parseAndValidateDeepSeekOutput(JSON.stringify(validReport), baseFactPackage);
    expect(result.ok).toBe(true);
    expect(result.report?.stockPlans[0]?.code).toBe("sz000001");
  });

  it("accepts optional structured insights when evidence and candidate boundaries are valid", () => {
    const report: DeepSeekReport = {
      ...validReport,
      marketStructureInsight: {
        breadth: "市场宽度仍以谨慎观察为主。",
        liquidity: "资金结构以候选股资金事实为辅助判断。",
        riskPressure: "风险压力来自大盘规则状态和主线确认后的分歧可能。",
        evidenceRefs: ["market.sh000001.rule.state", "stock.sz000001.fund.mainNetFlow"],
      },
      marketStateFlipConditions: [
        {
          targetState: "可交易",
          condition: "只有规则状态和宽度证据同步改善后，才考虑上修交易状态。",
          evidenceRefs: ["market.sh000001.rule.state"],
        },
      ],
      mainlineCompetition: [
        {
          lineName: "AI",
          rank: 1,
          competitionLogic: "当前主线阶段证据优先，但仍需观察核心股延续。",
          evidenceRefs: ["sector.ai.rule.stage"],
        },
      ],
      mainlineStageForecasts: [
        {
          name: "AI",
          currentStage: "确认",
          nextStage: "加速",
          triggerCondition: "核心股结构延续且资金不转弱时才考虑阶段上修。",
          invalidCondition: "核心股失效或板块证据转弱时降级观察。",
          evidenceRefs: ["sector.ai.rule.stage", "stock.sz000001.fund.mainNetFlow"],
        },
      ],
      coreStructureHealth: [
        {
          lineName: "AI",
          health: "中",
          leaderContinuity: "仍需观察核心股是否延续。",
          breadthQuality: "主线确认但扩散质量需要继续用事实验证。",
          risk: "若核心股回落，主线确认可能失效。",
          evidenceRefs: ["sector.ai.rule.stage"],
        },
      ],
      intradayWatchlist: [
        {
          code: "sz000001",
          name: "平安银行",
          watchType: "回踩观察",
          triggerCondition: "回踩不破规则支撑再观察。",
          invalidCondition: "跌破 MA20 则观察失效。",
          evidenceRefs: ["stock.sz000001.kline.trend", "stock.sz000001.technical.ma20"],
        },
      ],
    };

    const result = parseAndValidateDeepSeekOutput(JSON.stringify(report), baseFactPackage);
    expect(result.ok).toBe(true);
    expect(result.report?.intradayWatchlist?.[0]?.code).toBe("sz000001");
  });

  it("rejects optional structured insights with unknown evidence or stocks outside the candidate pool", () => {
    const report: DeepSeekReport = {
      ...validReport,
      marketStructureInsight: {
        breadth: "市场宽度改善。",
        liquidity: "流动性改善。",
        riskPressure: "风险压力下降。",
        evidenceRefs: ["market.fake"],
      },
      intradayWatchlist: [
        {
          code: "sz000002",
          name: "候选池外股票",
          watchType: "观察",
          triggerCondition: "突破时观察。",
          invalidCondition: "跌破时失效。",
          evidenceRefs: ["stock.sz000002.fake"],
        },
      ],
    };

    const result = parseAndValidateDeepSeekOutput(JSON.stringify(report), baseFactPackage);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("marketStructureInsight.evidenceRefs contains unknown factId");
    expect(result.errors.join("\n")).toContain("intradayWatchlist.0.code is outside allowedCodes");
    expect(result.errors.join("\n")).toContain("intradayWatchlist.0.evidenceRefs contains unknown factId");
  });

  it("accepts markdown fenced output after extracting the JSON object", () => {
    const result = parseAndValidateDeepSeekOutput(`\`\`\`json\n${JSON.stringify(validReport)}\n\`\`\``, baseFactPackage);
    expect(result.ok).toBe(true);
    expect(result.report?.summary).toBe(validReport.summary);
  });

  it("rejects unknown evidence refs, disallowed codes and oversized positions", () => {
    const report = structuredClone(validReport);
    report.stockPlans[0] = {
      ...report.stockPlans[0]!,
      code: "sz000002",
      evidenceRefs: ["stock.sz000002.fake"],
      positionSuggestion: "单票不超过 12%。",
    };

    const result = parseAndValidateDeepSeekOutput(JSON.stringify(report), baseFactPackage);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("outside allowedCodes");
    expect(result.errors.join("\n")).toContain("unknown factId");
    expect(result.errors.join("\n")).toContain("exceeds maxSingleStockPositionPct");
  });

  it("rejects buy action when data completeness is insufficient", () => {
    const factPackage = structuredClone(baseFactPackage);
    factPackage.candidates[0]!.dataCompleteness.level = "insufficient";
    factPackage.candidates[0]!.dataCompleteness.hasFundFlowData = false;

    const result = parseAndValidateDeepSeekOutput(JSON.stringify(validReport), factPackage);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("dataCompleteness.level");
    expect(result.errors.join("\n")).toContain("core market data is missing");
  });

  it("allows conservative avoid action when core market data is complete", () => {
    const report = structuredClone(validReport);
    report.stockPlans[0]!.action = "回避";
    report.stockPlans[0]!.positionSuggestion = "当前回避，仓位 0%。";
    report.stockPlans[0]!.doNotBuyCondition = "资金质量转弱或主线匹配证据不足时不参与。";
    report.stockPlans[0]!.risk = "即使核心行情数据完整，仍需尊重风控和买点质量。";

    const result = parseAndValidateDeepSeekOutput(JSON.stringify(report), baseFactPackage);
    expect(result.ok).toBe(true);
  });

  it("rejects data-insufficient action when core market data is complete", () => {
    const report = structuredClone(validReport);
    report.stockPlans[0]!.action = "数据不足";
    report.stockPlans[0]!.positionSuggestion = "核心行情数据完整，不参与仓位 0%。";
    report.stockPlans[0]!.risk = "因风险偏高而不参与。";

    const result = parseAndValidateDeepSeekOutput(JSON.stringify(report), baseFactPackage);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("cannot be 数据不足 because core market data is complete");
    expect(result.errors.join("\n")).toContain("use 观察/不追/回避");
  });

  it("rejects position suggestions above the candidate rule position limit", () => {
    const factPackage = structuredClone(baseFactPackage);
    factPackage.candidates[0]!.positionLimitPct = 0;

    const report = structuredClone(validReport);
    report.stockPlans[0]!.action = "观察";
    report.stockPlans[0]!.positionSuggestion = "当前观察，后续不超过 8%。";

    const result = parseAndValidateDeepSeekOutput(JSON.stringify(report), factPackage);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("positionLimitPct 0");
  });

  it("rejects long-term logic when company information is insufficient", () => {
    const factPackage = structuredClone(baseFactPackage);
    factPackage.candidates[0]!.companyKnowledge.companyKnowledgeState = "missing";
    factPackage.candidates[0]!.companyKnowledge.longTermLogicAllowed = false;

    const report = structuredClone(validReport);
    report.stockPlans[0]!.companySummary = "公司适合作为长期持有方向。";

    const result = parseAndValidateDeepSeekOutput(JSON.stringify(report), factPackage);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("long-term logic");
  });

  it("rejects company summary that contradicts financial trend", () => {
    const factPackage = structuredClone(baseFactPackage);
    factPackage.candidates[0]!.companyKnowledge.financialTrend = "恶化";

    const report = structuredClone(validReport);
    report.stockPlans[0]!.companySummary = "公司财务改善，基本面支撑较强。";

    const result = parseAndValidateDeepSeekOutput(JSON.stringify(report), factPackage);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("contradicts companyKnowledge.financialTrend");
  });

  it("rejects overclaiming a weak company mainline match", () => {
    const factPackage = structuredClone(baseFactPackage);
    factPackage.candidates[0]!.companyKnowledge.themeMatch = "weak";
    factPackage.candidates[0]!.companyKnowledge.themeMatchType = "theme_indirect";

    const report = structuredClone(validReport);
    report.stockPlans[0]!.companySummary = "公司属于当前主线核心受益股。";

    const result = parseAndValidateDeepSeekOutput(JSON.stringify(report), factPackage);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("overclaims weak company mainline match");
  });

  it("rejects unsupported fund-flow windows invented by the model", () => {
    const report = structuredClone(validReport);
    report.stockPlans[0]!.buyCondition = "等待主力资金连续3日净流入后再观察。";

    const result = parseAndValidateDeepSeekOutput(JSON.stringify(report), baseFactPackage);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("unsupported fund-flow window");
  });
});

describe("parseAndValidateModelAuditOutput", () => {
  it("accepts evidence-bound system feedback", () => {
    const feedback = {
      schemaVersion: SCHEMA_VERSION,
      summary: "系统需要继续补充候选股主线归属证据。",
      items: [
        {
          category: "规则疑点",
          title: "候选股主线归属需要更强证据",
          issue: "当前候选股计划引用了个股与主线证据，但未显式证明其属于主线成分。",
          impact: "可能导致候选股强度评分建立在不够稳定的主线映射上。",
          suggestion: "增加板块成分股归属 factId，缺失时将主线匹配标记为待确认。",
          priority: "高",
          evidenceRefs: ["sector.ai.rule.stage", "stock.sz000001.kline.trend"],
        },
      ],
      doNotChange: [
        {
          reason: "不应放松仓位上限和候选池边界。",
          evidenceRefs: ["market.sh000001.rule.state"],
        },
      ],
      disclaimer: "本反馈仅用于系统优化，不构成交易建议。",
    };

    const result = parseAndValidateModelAuditOutput(JSON.stringify(feedback), baseFactPackage);
    expect(result.ok).toBe(true);
    expect(result.feedback?.items[0]?.category).toBe("规则疑点");
  });

  it("rejects audit feedback with unknown evidence or trading boundary violations", () => {
    const feedback = {
      schemaVersion: SCHEMA_VERSION,
      summary: "错误反馈。",
      items: [
        {
          category: "功能建议",
          title: "错误建议",
          issue: "可以放松风控。",
          impact: "提高仓位上限。",
          suggestion: "建议买入候选池外股票。",
          priority: "高",
          evidenceRefs: ["fake.fact"],
        },
      ],
      doNotChange: [
        {
          reason: "保留硬规则。",
          evidenceRefs: ["market.sh000001.rule.state"],
        },
      ],
      disclaimer: "本反馈仅用于系统优化。",
    };

    const result = parseAndValidateModelAuditOutput(JSON.stringify(feedback), baseFactPackage);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("unknown factId");
    expect(result.errors.join("\n")).toContain("crosses system boundary");
  });
});
