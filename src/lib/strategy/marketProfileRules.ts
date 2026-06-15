import type { MarketIndexSnapshot, MarketRuleResult, SectorRuleResult } from "@/lib/types";
import { ZH } from "@/lib/strategy/support";

export function buildMarketProfile(input: {
  marketState: MarketRuleResult["marketState"];
  score: number;
  trendScore: number;
  breadthScore: number;
  sentimentScore: number;
  mainlineScore: number;
  weakIndexCount: number;
  topStage?: SectorRuleResult["stage"];
  indices: MarketIndexSnapshot[];
}): Pick<MarketRuleResult, "marketRegime" | "tradeMode" | "sentimentCycle" | "styleBias" | "maxTotalPositionPct" | "maxSingleStockPct" | "forbiddenActions"> {
  const marketRegime = inferMarketRegime(input);
  const sentimentCycle = inferSentimentCycle(input);
  const tradeMode = inferTradeMode(marketRegime, sentimentCycle, input.marketState);
  const position = positionLimitsForTradeMode(tradeMode);
  return {
    marketRegime,
    tradeMode,
    sentimentCycle,
    styleBias: inferStyleBias(input.indices),
    maxTotalPositionPct: position.maxTotalPositionPct,
    maxSingleStockPct: position.maxSingleStockPct,
    forbiddenActions: forbiddenActionsForTradeMode(tradeMode, sentimentCycle)
  };
}

function inferMarketRegime(input: {
  marketState: MarketRuleResult["marketState"];
  score: number;
  trendScore: number;
  breadthScore: number;
  sentimentScore?: number;
  weakIndexCount: number;
  topStage?: SectorRuleResult["stage"];
}): MarketRuleResult["marketRegime"] {
  if (input.topStage === ZH.fading || input.score < 30) return "退潮";
  if (input.marketState === "tradable" && input.trendScore >= 30 && input.breadthScore >= 14 && (input.sentimentScore ?? 0) >= 3) return "强势";
  if (input.marketState === "defensive" || input.weakIndexCount >= 3 || input.breadthScore <= 4) return "弱势";
  return "震荡";
}

function inferSentimentCycle(input: {
  score: number;
  breadthScore: number;
  sentimentScore?: number;
  topStage?: SectorRuleResult["stage"];
}): MarketRuleResult["sentimentCycle"] {
  if (input.topStage === ZH.fading || input.score < 35) return "退潮";
  if (input.breadthScore <= 4) return "冰点";
  if (input.topStage === ZH.accelerating && (input.sentimentScore ?? 0) >= 5) return "高潮";
  if (input.topStage === ZH.diverging) return "分歧";
  if (input.topStage === ZH.startup) return "启动";
  return "修复";
}

function inferTradeMode(
  marketRegime: MarketRuleResult["marketRegime"],
  sentimentCycle: MarketRuleResult["sentimentCycle"],
  marketState: MarketRuleResult["marketState"]
): MarketRuleResult["tradeMode"] {
  if (marketRegime === "退潮" || sentimentCycle === "退潮") return "空仓";
  if (marketRegime === "弱势" || marketState === "defensive") return "防守";
  if (sentimentCycle === "高潮" || sentimentCycle === "分歧") return "低吸";
  if (marketRegime === "强势" && (sentimentCycle === "启动" || sentimentCycle === "修复")) return "进攻";
  return "试错";
}

function positionLimitsForTradeMode(tradeMode: MarketRuleResult["tradeMode"]) {
  const profile = positionRiskProfile();
  if (tradeMode === "进攻") return { maxTotalPositionPct: 70, maxSingleStockPct: profile.offensiveSinglePct };
  if (tradeMode === "低吸") return { maxTotalPositionPct: 35, maxSingleStockPct: profile.dipSinglePct };
  if (tradeMode === "试错") return { maxTotalPositionPct: 25, maxSingleStockPct: 3 };
  if (tradeMode === "防守") return { maxTotalPositionPct: 10, maxSingleStockPct: 2 };
  return { maxTotalPositionPct: 0, maxSingleStockPct: 0 };
}

function positionRiskProfile() {
  const profile = (process.env.POSITION_RISK_PROFILE || "standard").toLowerCase();
  if (profile === "conservative") return { offensiveSinglePct: 8, dipSinglePct: 4 };
  if (profile === "aggressive") return { offensiveSinglePct: 12, dipSinglePct: 6 };
  return { offensiveSinglePct: 10, dipSinglePct: 5 };
}

function forbiddenActionsForTradeMode(
  tradeMode: MarketRuleResult["tradeMode"],
  sentimentCycle: MarketRuleResult["sentimentCycle"]
) {
  const actions = new Set<string>();
  if (tradeMode !== "进攻") actions.add("追涨");
  if (tradeMode === "低吸") actions.add("后排补涨");
  if (tradeMode === "防守" || tradeMode === "空仓") {
    actions.add("新开仓");
    actions.add("加仓");
  }
  if (sentimentCycle === "高潮") {
    actions.add("高位接力");
    actions.add("后排追涨");
  }
  if (sentimentCycle === "退潮") {
    actions.add("抄底弱修复");
    actions.add("弱势反抽");
  }
  return Array.from(actions);
}

function inferStyleBias(indices: MarketIndexSnapshot[]): MarketRuleResult["styleBias"] {
  const byCode = new Map(indices.map((index) => [index.code, index]));
  const mainScore = compactIndexStyleScore(byCode.get("sh000001")) + compactIndexStyleScore(byCode.get("sz399001"));
  const growthScore = compactIndexStyleScore(byCode.get("sz399006")) + compactIndexStyleScore(byCode.get("sh000688"));
  if (growthScore - mainScore >= 4) return "成长";
  if (mainScore - growthScore >= 4) return "权重";
  if (growthScore > mainScore && indices.some((index) => index.code === "sh000688" && (index.changePct ?? 0) > 1.5)) return "题材小票";
  return "无明显风格";
}

function compactIndexStyleScore(index?: MarketIndexSnapshot) {
  if (!index) return 0;
  return (index.aboveMa20 ? 2 : 0) + (index.aboveMa60 ? 1 : 0) + ((index.changePct ?? 0) > 0 ? 1 : 0);
}

export function marketStateLabel(state: MarketRuleResult["marketState"]) {
  if (state === "tradable") return "可交易";
  if (state === "cautious") return "谨慎交易";
  return "防守观望";
}
