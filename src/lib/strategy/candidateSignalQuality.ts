import type { DataCompleteness, MarketRuleResult, SectorRuleResult, StockActivitySnapshot, StockCandidate } from "@/lib/types";
import { ZH } from "@/lib/strategy/support";
import { formatAttributionStatus } from "@/lib/strategy/candidateSources";

export function evaluateCandidateSignalQuality(input: {
  action: StockCandidate["action"];
  strengthScore: number;
  buyPointEvaluation: NonNullable<StockCandidate["buyPointEvaluation"]>;
  dataCompleteness: DataCompleteness;
  attribution: NonNullable<StockCandidate["mainlineAttribution"]>;
  role: StockCandidate["role"];
  trendState: StockCandidate["trendState"];
  fundFlowState: StockCandidate["fundFlowState"];
  marketState: MarketRuleResult["marketState"];
  sectorStage?: SectorRuleResult["stage"];
  tradability: NonNullable<StockCandidate["tradability"]>;
  activity?: StockActivitySnapshot;
  riskFlags: string[];
}): {
  score: number;
  tier: NonNullable<StockCandidate["signalTier"]>;
  label: NonNullable<StockCandidate["signalLabel"]>;
  reasons: string[];
} {
  const actionScore = scoreSignalAction(input.action);
  const strengthScore = Math.round(input.strengthScore * 0.42);
  const buyPointScore = Math.round((input.buyPointEvaluation.score / 20) * 12);
  const dataScore = input.dataCompleteness.level === "complete" ? 10 : input.dataCompleteness.level === "partial" ? 4 : -12;
  const attributionScore = scoreSignalAttribution(input.attribution);
  const roleScore = scoreSignalRole(input.role);
  const activityScore = input.activity ? Math.round(input.activity.score * 0.08) : 0;
  const marketScore = input.marketState === "tradable" ? 5 : input.marketState === "cautious" ? 2 : -6;
  const sectorScore = input.sectorStage === ZH.confirmed || input.sectorStage === ZH.accelerating
    ? 5
    : input.sectorStage === ZH.startup
      ? 3
      : input.sectorStage === ZH.diverging
        ? -2
        : input.sectorStage === ZH.fading
          ? -10
          : 0;
  const pendingOpportunityBonus =
    input.action === ZH.noChase && input.tradability.nextSessionPlan?.mode === "次日竞价观察"
      ? 8
      : input.buyPointEvaluation.status === "待激活" && (input.role === ZH.leader || input.role === ZH.core)
        ? 5
        : 0;
  const hardRiskPenalty =
    (input.trendState === "downtrend" || input.trendState === "below_ma20" ? 12 : 0) +
    (input.fundFlowState === "outflow" ? 12 : 0) +
    (input.attribution.shouldExclude ? 20 : 0) +
    (input.tradability.status === "涨停不可达" ? 12 : input.tradability.status === "接近涨停" ? 8 : input.tradability.status === "高位拉升" ? 5 : 0) +
    (input.riskFlags.length >= 6 ? 8 : input.riskFlags.length >= 3 ? 4 : 0);
  const raw = actionScore + strengthScore + buyPointScore + dataScore + attributionScore + roleScore + activityScore + marketScore + sectorScore + pendingOpportunityBonus - hardRiskPenalty;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const tier = inferSignalTier(score, input);
  const label = signalTierLabel(tier);
  const reasons = [
    `动作${input.action}`,
    `强度${input.strengthScore}/100`,
    `买点${input.buyPointEvaluation.status}/${input.buyPointEvaluation.score}/20`,
    `数据${input.dataCompleteness.level}`,
    `归属${formatAttributionStatus(input.attribution.status)}/${input.attribution.confidence}`,
    `可买入性${input.tradability.status}/${input.tradability.score}`,
    input.activity ? `活跃度${input.activity.status}/${input.activity.score}` : "活跃度缺失",
    `定位${input.role}`,
    input.marketState === "defensive" ? "大盘防守压制" : "",
    input.sectorStage ? `主线${input.sectorStage}` : "",
    pendingOpportunityBonus ? `机会预案加分${pendingOpportunityBonus}` : "",
    hardRiskPenalty ? `风险扣分${hardRiskPenalty}` : ""
  ].filter(Boolean);
  return { score, tier, label, reasons };
}

function scoreSignalAction(action: StockCandidate["action"]) {
  if (action === ZH.smallTrial) return 28;
  if (action === ZH.waitPullback) return 20;
  if (action === ZH.observe) return 13;
  if (action === ZH.noChase) return 6;
  if (action === ZH.avoid) return 2;
  return 0;
}

function scoreSignalAttribution(attribution: NonNullable<StockCandidate["mainlineAttribution"]>) {
  if (attribution.status === "direct_constituent") return 10;
  if (attribution.status === "business_direct") return 7;
  if (attribution.status === "supply_chain_related") return 2;
  if (attribution.status === "theme_indirect") return 1;
  if (attribution.status === "mismatch") return -8;
  return -2;
}

function scoreSignalRole(role: StockCandidate["role"]) {
  if (role === ZH.leader) return 8;
  if (role === ZH.core) return 6;
  if (role === ZH.catchUp) return 3;
  if (role === ZH.dipWatch) return 1;
  return 0;
}

function inferSignalTier(score: number, input: {
  action: StockCandidate["action"];
  buyPointEvaluation: NonNullable<StockCandidate["buyPointEvaluation"]>;
  dataCompleteness: DataCompleteness;
  trendState: StockCandidate["trendState"];
  fundFlowState: StockCandidate["fundFlowState"];
  attribution: NonNullable<StockCandidate["mainlineAttribution"]>;
}) {
  if (
    score >= 82 &&
    input.action === ZH.smallTrial &&
    input.buyPointEvaluation.status === "有效" &&
    input.dataCompleteness.level !== "insufficient" &&
    !input.attribution.shouldExclude
  ) {
    return "S";
  }
  if (
    score >= 70 &&
    input.action !== ZH.avoid &&
    input.action !== ZH.insufficient &&
    input.trendState !== "downtrend" &&
    input.fundFlowState !== "outflow"
  ) {
    return "A";
  }
  if (score >= 55 && input.action !== ZH.avoid && input.action !== ZH.insufficient) return "B";
  if (score >= 35) return "C";
  return "D";
}

function signalTierLabel(tier: NonNullable<StockCandidate["signalTier"]>): NonNullable<StockCandidate["signalLabel"]> {
  if (tier === "S") return "核心试错";
  if (tier === "A") return "重点观察";
  if (tier === "B") return "条件等待";
  if (tier === "C") return "风险压制";
  return "剔除/低质";
}

export function compareCandidateSignalQuality(left: StockCandidate, right: StockCandidate) {
  const signalDelta = (right.signalScore ?? -1) - (left.signalScore ?? -1);
  if (signalDelta !== 0) return signalDelta;
  const actionDelta = candidateActionRank(right.action) - candidateActionRank(left.action);
  if (actionDelta !== 0) return actionDelta;
  const strengthDelta = (right.strengthScore ?? -1) - (left.strengthScore ?? -1);
  if (strengthDelta !== 0) return strengthDelta;
  return left.code.localeCompare(right.code);
}

function candidateActionRank(action: StockCandidate["action"]) {
  if (action === ZH.smallTrial) return 5;
  if (action === ZH.waitPullback) return 4;
  if (action === ZH.observe) return 3;
  if (action === ZH.noChase) return 2;
  if (action === ZH.avoid) return 1;
  return 0;
}
