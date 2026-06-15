import type { CompanyKnowledgeCard, DataCompleteness, MarketRuleResult, MarketSessionContext, SectorRuleResult, StockActivitySnapshot, StockCandidate, StockFundFlowQuality, StockFundFlowSnapshot, StockTechnicalSnapshot } from "@/lib/types";
import { TREND_STRETCH_LIMIT, ZH } from "@/lib/strategy/support";
import { buyPointDiagnosticNote, evaluateBuyPoint, scoreCandidateBuyPoint } from "@/lib/strategy/buyPointRules";
import { diagnosticsToScoreBreakdown, distancePct, numberValue, scoreStatus } from "@/lib/strategy/utils";
import { formatAttributionStatus } from "@/lib/strategy/candidateSources";
import { formatMoney, formatPct, formatSignedPct, normalizeStockCode } from "@/lib/strategy/candidateUtils";
import { signOf } from "@/lib/strategy/stockDataRules";
import { activityDiagnosticNote } from "@/lib/strategy/stockActivityRules";

export { buildRoleReason, inferCandidateRole } from "@/lib/strategy/stockRoleRules";

export function scoreCandidateStrength(input: {
  role: StockCandidate["role"];
  trendState: StockCandidate["trendState"];
  fundFlowState: StockCandidate["fundFlowState"];
  fundFlow?: StockFundFlowSnapshot;
  fundFlowQuality?: StockFundFlowQuality;
  activity?: StockActivitySnapshot;
  technical?: StockTechnicalSnapshot;
  buyPointType: StockCandidate["buyPointType"];
  buyPointEvaluation?: StockCandidate["buyPointEvaluation"];
  sectorStage?: SectorRuleResult["stage"];
  maDistance?: NonNullable<StockCandidate["klineSummary"]>["maDistance"];
  dataCompleteness: DataCompleteness;
  companyKnowledge: CompanyKnowledgeCard;
  marketState: MarketRuleResult["marketState"];
}): { score: number; diagnostics: NonNullable<StockCandidate["diagnostics"]> } {
  const roleScore = scoreCandidateRole(input.role);
  const trendScore = scoreCandidateTrend(input.trendState, input.maDistance, input.technical);
  const fundScore = scoreCandidateFund(input.fundFlowState, input.fundFlow, input.fundFlowQuality);
  const buyPointScore = input.buyPointEvaluation?.score ?? scoreCandidateBuyPoint(input.buyPointType);
  const sectorScore = scoreCandidateSector(input.sectorStage);
  const activityScore = input.activity?.score ?? 0;
  const dataPenalty = input.dataCompleteness.level === "insufficient" ? 25 : input.dataCompleteness.level === "partial" ? 8 : 0;
  const companyPenalty = input.companyKnowledge.themeMatch === "weak" ? 5 : input.companyKnowledge.companyKnowledgeState === "missing" ? 6 : 0;
  const marketPenalty = input.marketState === "defensive" ? 12 : 0;
  const dynamicWeight = evaluateDynamicCandidateWeight(input);
  const rawScore = roleScore + trendScore + fundScore + buyPointScore + sectorScore + Math.round(activityScore * 0.1) + dynamicWeight.adjustment - dataPenalty - companyPenalty - marketPenalty;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  return {
    score,
    diagnostics: [
      {
        label: "主线地位",
        score: roleScore,
        max: 20,
        status: roleScore >= 16 ? "强" : roleScore >= 10 ? "中" : "弱",
        note: `当前定位为${input.role}`
      },
      {
        label: "趋势位置",
        score: trendScore,
        max: 20,
        status: trendScore >= 15 ? "强" : trendScore >= 8 ? "中" : input.trendState === "unknown" ? "缺失" : "弱",
        note: trendDiagnosticNote(input.trendState, input.maDistance, input.technical)
      },
      {
        label: "资金承接",
        score: fundScore,
        max: 20,
        status: fundScore >= 16 ? "强" : fundScore >= 8 ? "中" : input.fundFlowState === "unknown" ? "缺失" : "弱",
        note: fundDiagnosticNote(input.fundFlowState, input.fundFlow, input.fundFlowQuality)
      },
      {
        label: "活跃度",
        score: activityScore,
        max: 100,
        status: input.activity?.status ?? "缺失",
        note: input.activity ? activityDiagnosticNote(input.activity) : "缺少成交额、换手率、资金流或板块成交排名证据"
      },
      {
        label: "买点质量",
        score: buyPointScore,
        max: 20,
        status: buyPointScore >= 16 ? "强" : buyPointScore >= 10 ? "中" : "弱",
        note: buyPointDiagnosticNote(input.buyPointType, input.trendState, input.fundFlowState, input.maDistance, input.marketState, input.sectorStage, input.buyPointEvaluation)
      },
      {
        label: "主线环境",
        score: sectorScore,
        max: 20,
        status: sectorScore >= 15 ? "强" : sectorScore >= 8 ? "中" : input.sectorStage ? "弱" : "缺失",
        note: input.sectorStage ? `主线处于${input.sectorStage}阶段` : "缺少主线阶段证据"
      },
      {
        label: "阶段权重",
        score: Math.max(0, Math.min(10, 5 + dynamicWeight.adjustment)),
        max: 10,
        status: dynamicWeight.adjustment > 0 ? "强" : dynamicWeight.adjustment < 0 ? "弱" : "中",
        note: `${dynamicWeight.label}：${dynamicWeight.reasons.join("；") || "维持基础评分"}`
      }
    ]
  };
}

function evaluateDynamicCandidateWeight(input: {
  role: StockCandidate["role"];
  fundFlowState: StockCandidate["fundFlowState"];
  activity?: StockActivitySnapshot;
  buyPointType: StockCandidate["buyPointType"];
  buyPointEvaluation?: StockCandidate["buyPointEvaluation"];
  sectorStage?: SectorRuleResult["stage"];
  marketState: MarketRuleResult["marketState"];
}) {
  let adjustment = 0;
  const reasons: string[] = [];

  if (input.marketState === "cautious" && input.role !== ZH.leader && input.role !== ZH.core) {
    adjustment -= 3;
    reasons.push("谨慎市场只提高龙头/中军权重，后排降权");
  }
  if (input.sectorStage === ZH.startup) {
    if ((input.role === ZH.leader || input.role === ZH.core) && input.activity && input.activity.status !== "弱" && input.activity.status !== "缺失") {
      adjustment += 2;
      reasons.push("启动阶段优先看核心股承接");
    } else if (input.role === ZH.catchUp) {
      adjustment -= 2;
      reasons.push("启动阶段后排补涨不提前加权");
    }
  }
  if (input.sectorStage === ZH.confirmed && input.buyPointEvaluation?.status === "有效" && input.fundFlowState === "inflow") {
    adjustment += 3;
    reasons.push("确认阶段有效买点叠加资金流入，加权排序");
  }
  if (input.sectorStage === ZH.accelerating && input.buyPointType !== ZH.divergenceRepair) {
    adjustment -= 4;
    reasons.push("加速阶段不鼓励普通回踩/突破追价，只保留分歧修复");
  }
  if (input.sectorStage === ZH.diverging) {
    if (input.buyPointType === ZH.divergenceRepair && (input.role === ZH.leader || input.role === ZH.core)) {
      adjustment += 2;
      reasons.push("分歧阶段只给核心股修复小幅加权");
    } else {
      adjustment -= 4;
      reasons.push("分歧阶段非核心修复降权");
    }
  }
  if (input.buyPointEvaluation?.status && input.buyPointEvaluation.status !== "有效") {
    adjustment -= 3;
    reasons.push(`买点${input.buyPointEvaluation.status}，动态权重降级`);
  }

  return {
    adjustment: Math.max(-8, Math.min(6, adjustment)),
    label: input.sectorStage ? `${input.marketState}/${input.sectorStage}` : `${input.marketState}/无主线阶段`,
    reasons
  };
}

function scoreCandidateRole(role: StockCandidate["role"]) {
  if (role === ZH.leader) return 20;
  if (role === ZH.core) return 16;
  if (role === ZH.catchUp) return 10;
  if (role === ZH.dipWatch) return 6;
  return 0;
}

function scoreCandidateTrend(
  trendState: StockCandidate["trendState"],
  maDistance?: NonNullable<StockCandidate["klineSummary"]>["maDistance"],
  technical?: StockTechnicalSnapshot
) {
  const aligned = isBullishMaAlignment(technical);
  const longTermWeak = Boolean(technical?.ma20 && technical?.ma60 && technical.ma20 < technical.ma60);
  if (trendState === "above_ma20") {
    const ma20 = Math.abs(maDistance?.ma20 ?? 99);
    const ma5 = Math.abs(maDistance?.ma5 ?? 99);
    if (ma20 <= 4 && aligned) return 20;
    if (ma20 <= 4) return longTermWeak ? 14 : 18;
    if (ma10Like(ma5, ma20)) return aligned ? 17 : longTermWeak ? 11 : 14;
    if ((maDistance?.ma20 ?? 0) > TREND_STRETCH_LIMIT.ma20 || (maDistance?.ma5 ?? 0) > TREND_STRETCH_LIMIT.ma5) return 8;
    return aligned ? 14 : longTermWeak ? 9 : 12;
  }
  if (trendState === "reclaim_ma20") return longTermWeak ? 10 : 14;
  if (trendState === "below_ma20") return 4;
  if (trendState === "downtrend") return 0;
  return 3;
}

function ma10Like(ma5: number, ma20: number) {
  return ma5 <= 4 || ma20 <= 8;
}

function isBullishMaAlignment(technical?: StockTechnicalSnapshot) {
  if (!technical?.ma5 || !technical.ma10 || !technical.ma20) return false;
  const shortAligned = technical.ma5 >= technical.ma10 && technical.ma10 >= technical.ma20;
  const longAligned = !technical.ma60 || technical.ma20 >= technical.ma60;
  return shortAligned && longAligned;
}

function scoreCandidateFund(fundFlowState: StockCandidate["fundFlowState"], fundFlow?: StockFundFlowSnapshot, quality?: StockFundFlowQuality) {
  if (quality && quality.state !== "未知") {
    const mapped = Math.round(quality.score / 5);
    if (quality.state === "强流入") return Math.max(16, mapped);
    if (quality.state === "温和流入") return Math.max(12, Math.min(17, mapped));
    if (quality.state === "弱修复") return Math.max(7, Math.min(11, mapped));
    if (quality.state === "分歧") return Math.max(6, Math.min(13, mapped));
    if (quality.state === "持续流出") return Math.min(5, mapped);
  }
  if (fundFlowState === "unknown") return 4;
  if (fundFlowState === "outflow") return 0;
  if (!fundFlow) return fundFlowState === "inflow" ? 16 : 10;

  const day = signOf(fundFlow.mainNetFlow);
  const day5 = signOf(fundFlow.mainNetFlow5D);
  const day10 = signOf(fundFlow.mainNetFlow10D);
  const day20 = signOf(fundFlow.mainNetFlow20D);
  const jumbo = signOf(fundFlow.jumboNetFlow);
  const block = signOf(fundFlow.blockNetFlow);

  if (fundFlowState === "inflow") {
    let score = 14;
    if (day > 0) score += 1;
    if (day5 > 0) score += 1;
    if (day10 > 0) score += 1;
    if (day20 > 0) score += 2;
    if (jumbo > 0) score += 1;
    if (block > 0) score += 1;
    return Math.min(20, score);
  }
  if (fundFlowState === "mixed") {
    let score = 9;
    if (day20 > 0) score += 2;
    if (day > 0 || day5 > 0) score += 1;
    if (jumbo > 0 || block > 0) score += 1;
    if (day20 < 0 && (day < 0 || day5 < 0)) score -= 2;
    return Math.max(6, Math.min(13, score));
  }
  return 0;
}

export { evaluateStockActivity } from "@/lib/strategy/stockActivityRules";

function scoreCandidateSector(stage?: SectorRuleResult["stage"]) {
  if (stage === ZH.accelerating) return 20;
  if (stage === ZH.confirmed) return 18;
  if (stage === ZH.startup) return 14;
  if (stage === ZH.diverging) return 8;
  if (stage === ZH.observe) return 4;
  return 0;
}

function trendDiagnosticNote(
  trendState: StockCandidate["trendState"],
  maDistance?: NonNullable<StockCandidate["klineSummary"]>["maDistance"],
  technical?: StockTechnicalSnapshot
) {
  const maOrder = technical?.ma5 && technical.ma10 && technical.ma20
    ? `均线排列 MA5${compareText(technical.ma5, technical.ma10)}MA10${compareText(technical.ma10, technical.ma20)}MA20${technical.ma60 ? `${compareText(technical.ma20, technical.ma60)}MA60` : ""}`
    : "均线排列证据不足";
  if (trendState === "above_ma20") return `站上MA20，距离MA5 ${formatPct(maDistance?.ma5)}，距离MA20 ${formatPct(maDistance?.ma20)}；${maOrder}`;
  if (trendState === "reclaim_ma20") return `刚收复MA20，仍需确认承接；${maOrder}`;
  if (trendState === "below_ma20") return "仍在MA20下方";
  if (trendState === "downtrend") return "均线结构偏弱";
  return "缺少趋势证据";
}

function compareText(left: number, right: number) {
  if (left > right) return ">";
  if (left < right) return "<";
  return "=";
}

function fundDiagnosticNote(fundFlowState: StockCandidate["fundFlowState"], fundFlow?: StockFundFlowSnapshot, quality?: StockFundFlowQuality) {
  const windows = fundFlow
    ? `当日${formatMoney(fundFlow.mainNetFlow)}，5日${formatMoney(fundFlow.mainNetFlow5D)}，10日${formatMoney(fundFlow.mainNetFlow10D)}，20日${formatMoney(fundFlow.mainNetFlow20D)}`
    : "资金窗口缺失";
  if (quality && quality.state !== "未知") {
    return `资金质量${quality.state}，评分${quality.score}/100；${windows}；依据：${quality.evidence.join("；") || "无"}；阻断：${quality.blockers.join("；") || "无"}`;
  }
  if (fundFlowState === "inflow") return `多周期资金偏流入；${windows}`;
  if (fundFlowState === "mixed") return `资金有分歧，只能降低买点级别；${windows}`;
  if (fundFlowState === "outflow") return `多周期资金偏流出；${windows}`;
  return "缺少资金流证据";
}

export {
  buildInvalidCondition,
  decideCandidateAction,
  evaluateTradability,
  positionLimitForAction,
  roleAllowsTrial
} from "@/lib/strategy/stockTradabilityRules";
