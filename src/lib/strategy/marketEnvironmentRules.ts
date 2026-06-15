import type { LimitPoolSnapshot, MarketBreadthSnapshot, MarketRuleResult, SectorRuleResult, SectorSnapshot } from "@/lib/types";
import type { ParsedCommandResult } from "@/lib/westock/parser";
import { ZH } from "@/lib/strategy/support";
import { diagnosticsToScoreBreakdown, scoreStatus } from "@/lib/strategy/utils";
import { scoreMarketBreadth } from "@/lib/strategy/marketBreadthRules";
import { scoreLimitPoolSentiment } from "@/lib/strategy/marketSentimentRules";

export { scoreMarketBreadth } from "@/lib/strategy/marketBreadthRules";
export { scoreLimitPoolSentiment } from "@/lib/strategy/marketSentimentRules";

export function buildMarketScoreBreakdown(input: {
  trendScore: number;
  breadth: ReturnType<typeof scoreMarketBreadth>;
  sentiment: ReturnType<typeof scoreLimitPoolSentiment>;
  mainlineScore: number;
  riskPenalty: number;
  validIndexCount: number;
  limitPoolCount: number;
  hasMarketBreadth: boolean;
}): MarketRuleResult["scoreBreakdown"] {
  return [
    {
      key: "index_trend",
      label: "指数趋势",
      score: input.trendScore,
      maxScore: 40,
      evidenceRefs: ["market.sh000001.technical.ma20", "market.sz399001.technical.ma20", "market.sz399006.technical.ma20", "market.sh000688.technical.ma20"],
      dataSources: ["westock-data: index kline/technical"],
      confidence: input.validIndexCount >= 3 ? "高" : input.validIndexCount >= 2 ? "中" : "低",
      missingFields: input.validIndexCount >= 3 ? [] : ["至少3个核心指数K线/均线"],
      downgradeReasons: input.validIndexCount >= 3 ? [] : ["核心指数样本不足，不能判为可交易"],
      note: `核心指数有效数量 ${input.validIndexCount}，趋势分 ${input.trendScore}/40。`
    },
    {
      key: "market_breadth",
      label: "全A宽度",
      score: input.breadth.score,
      maxScore: 20,
      evidenceRefs: ["market.breadth.eastmoney.summary"],
      dataSources: input.hasMarketBreadth ? ["东方财富: 全A行情宽度"] : ["规则降级: 板块/热股样本"],
      confidence: input.breadth.reliability >= 0.8 ? "高" : input.breadth.reliability >= 0.4 ? "中" : "低",
      missingFields: input.hasMarketBreadth ? [] : ["全A上涨占比", "中位涨跌幅", "大涨大跌家数"],
      downgradeReasons: input.breadth.reliability >= 0.8 ? [] : [`宽度来源 ${input.breadth.sourceQuality}，可靠性 ${input.breadth.reliability.toFixed(2)}`],
      note: `宽度分 ${input.breadth.score}/20，来源质量 ${input.breadth.sourceQuality}。`
    },
    {
      key: "limit_pool_sentiment",
      label: "涨跌停情绪",
      score: input.sentiment.score,
      maxScore: 10,
      evidenceRefs: ["market.limitPool.zt", "market.limitPool.dt", "market.limitPool.zb", "market.breadth.eastmoney.summary"],
      dataSources: input.limitPoolCount >= 3 ? ["东方财富: 涨停池/跌停池/炸板池"] : ["东方财富: 涨跌停近似或部分池"],
      confidence: input.sentiment.reliability >= 0.75 ? "高" : input.sentiment.reliability >= 0.45 ? "中" : "低",
      missingFields: [
        input.sentiment.ztSource === "missing" ? "涨停池" : "",
        input.sentiment.dtSource === "missing" ? "跌停池" : "",
        input.sentiment.zbSource === "missing" ? "炸板池" : "",
        input.sentiment.bigDownSource === "missing" ? "全A大跌家数" : ""
      ].filter(Boolean),
      downgradeReasons: input.sentiment.sourceQuality === "pool" ? [] : [`情绪来源 ${input.sentiment.sourceQuality}，可靠性 ${input.sentiment.reliability.toFixed(2)}`],
      note: `涨停${input.sentiment.zt}，跌停${input.sentiment.dt}，炸板${input.sentiment.zb}，大跌${input.sentiment.bigDown}。`
    },
    {
      key: "mainline_strength",
      label: "主线承接",
      score: input.mainlineScore,
      maxScore: 20,
      evidenceRefs: ["rule.sector.*.stage"],
      dataSources: ["westock-data: hot board", "东方财富: sector constituents/limit-pool concentration"],
      confidence: input.mainlineScore >= 10 ? "中" : "低",
      missingFields: [],
      downgradeReasons: input.mainlineScore < 5 ? ["缺少确认级主线承接"] : [],
      note: `主线强度 ${input.mainlineScore}/20。`
    },
    {
      key: "risk_penalty",
      label: "风险扣分",
      score: -input.riskPenalty,
      maxScore: 0,
      evidenceRefs: ["rule.market.profile", "market.breadth.eastmoney.summary", "market.limitPool.dt", "market.limitPool.zb"],
      dataSources: ["规则引擎: risk flags"],
      confidence: "中",
      missingFields: [],
      downgradeReasons: input.riskPenalty > 0 ? [`风险扣分 ${input.riskPenalty}`] : [],
      note: input.riskPenalty > 0 ? `存在指数、主线或情绪风险扣分 ${input.riskPenalty}。` : "暂无额外风险扣分。"
    }
  ];
}

export function scoreMainlines(sectors: SectorRuleResult[]) {
  const score = sectors.slice(0, 3).reduce((sum, sector) => {
    if (sector.stage === ZH.confirmed) return sum + 12;
    if (sector.stage === ZH.accelerating) return sum + 10;
    if (sector.stage === ZH.startup) return sum + 7;
    if (sector.stage === ZH.diverging) return sum + 3;
    if (sector.stage === ZH.fading) return sum - 6;
    return sum;
  }, 0);
  return Math.max(0, Math.min(20, score));
}

export function buildMarketDiagnostics(input: {
  trendScore: number;
  indexResonance: number;
  breadth: ReturnType<typeof scoreMarketBreadth>;
  sentiment: ReturnType<typeof scoreLimitPoolSentiment>;
  mainlineScore: number;
}): MarketRuleResult["diagnostics"] {
  return [
    {
      label: "指数结构",
      score: input.trendScore,
      max: 40,
      status: scoreStatus(input.trendScore, 40),
      note: `核心指数均线结构、斜率、动量、量能与共振系数 ${input.indexResonance.toFixed(2)}`
    },
    {
      label: "市场宽度",
      score: input.breadth.score,
      max: 20,
      status: input.breadth.sourceQuality === "none" ? "缺失" : scoreStatus(input.breadth.score, 20),
      note: input.breadth.sourceQuality === "market"
        ? `全 A 上涨占比、中位涨跌幅和大涨/大跌家数，可靠性${input.breadth.reliability.toFixed(2)}`
        : `全 A 宽度缺失，使用${input.breadth.sourceQuality === "sector" ? "板块加权" : input.breadth.sourceQuality === "hot" ? "热股样本" : "无"}弱证据，可靠性${input.breadth.reliability.toFixed(2)}`
    },
    {
      label: "情绪温度",
      score: input.sentiment.score,
      max: 10,
      status: input.sentiment.sourceQuality === "missing" ? "缺失" : scoreStatus(input.sentiment.score, 10),
      note: input.sentiment.sourceQuality === "missing"
        ? "涨跌停情绪数据缺失：未取得涨停池、跌停池、炸板池和全A大跌数据，情绪分不加分。"
        : `涨停${input.sentiment.zt}(${sourceLabel(input.sentiment.ztSource)})，跌停${input.sentiment.dt}(${sourceLabel(input.sentiment.dtSource)})，炸板${input.sentiment.zb}(${sourceLabel(input.sentiment.zbSource)})，大跌${input.sentiment.bigDown}(${sourceLabel(input.sentiment.bigDownSource)})，炸板率${input.sentiment.burstRate !== undefined ? `${(input.sentiment.burstRate * 100).toFixed(1)}%` : "缺失"}，连板${input.sentiment.consecutiveZt ?? "缺失"}，首板${input.sentiment.firstZt ?? "缺失"}，可靠性${input.sentiment.reliability.toFixed(2)}`
    },
    {
      label: "主线强度",
      score: input.mainlineScore,
      max: 20,
      status: scoreStatus(input.mainlineScore, 20),
      note: "前排主线的阶段、质量与持续性"
    }
  ];
}

export function inferMarketDataQuality(
  validIndexCount: number,
  breadth: ReturnType<typeof scoreMarketBreadth>,
  limitPools: LimitPoolSnapshot[],
  sentiment?: ReturnType<typeof scoreLimitPoolSentiment>
): MarketRuleResult["dataQuality"] {
  if (validIndexCount < 3 || breadth.reliability === 0 || sentiment?.sourceQuality === "missing") return "不足";
  if (breadth.reliability < 0.8 || limitPools.length < 2 || (sentiment?.reliability ?? 1) < 0.75) return "部分";
  return "完整";
}

function sourceLabel(source: string) {
  if (source === "pool") return "精确池";
  if (source === "approx") return "近似";
  if (source === "market") return "全A";
  return "缺失";
}

export function inferMarketConfidence(
  dataQuality: MarketRuleResult["dataQuality"],
  diagnostics: MarketRuleResult["diagnostics"],
  riskPenalty: number
): MarketRuleResult["confidence"] {
  if (dataQuality === "不足" || diagnostics.some((item) => item.status === "缺失") || riskPenalty >= 16) return "低";
  if (dataQuality === "部分" || diagnostics.filter((item) => item.status === "弱").length >= 2 || riskPenalty >= 8) return "中";
  return "高";
}
