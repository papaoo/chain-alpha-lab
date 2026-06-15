import type { MarketRuleResult, SectorRuleResult, StockCandidate } from "@/lib/types";
import { ZH } from "@/lib/strategy/support";
import { formatPct } from "@/lib/strategy/candidateUtils";

export function scoreCandidateBuyPoint(buyPointType: StockCandidate["buyPointType"]) {
  if (buyPointType === ZH.maPullback) return 20;
  if (buyPointType === ZH.divergenceRepair) return 16;
  if (buyPointType === ZH.breakoutPullback) return 12;
  return 0;
}

export function buildBuyPointTriggerCondition(
  type: StockCandidate["buyPointType"],
  marketState: MarketRuleResult["marketState"],
  sectorStage?: SectorRuleResult["stage"],
  allowedBuyTypes: SectorRuleResult["allowedBuyTypes"] = []
) {
  if (type === ZH.noBuyPoint || type === "unknown") return "等待回踩MA5/MA10/MA20、资金转强或分歧修复信号出现。";
  const marketGate = marketState === "defensive" ? "大盘至少修复至谨慎交易" : "大盘不转弱";
  const sectorGate = allowedBuyTypes.includes(type) ? `主线维持${sectorStage ?? "当前"}阶段` : `主线阶段允许${type}`;
  if (type === ZH.maPullback) return `${marketGate}，${sectorGate}，股价贴近MA10/MA20不破且主力资金不连续流出。`;
  if (type === ZH.breakoutPullback) return `${marketGate}，${sectorGate}，突破后回踩不破，缩量承接或资金重新流入。`;
  if (type === ZH.divergenceRepair) return `${marketGate}，${sectorGate}，分歧后重新站稳MA20，核心股不补跌且资金流出收敛。`;
  return "等待买点结构进一步确认。";
}

export function buildBuyPointInvalidCondition(type: StockCandidate["buyPointType"]) {
  if (type === ZH.maPullback) return "跌破MA20、资金连续流出或主线退潮，则回踩买点失效。";
  if (type === ZH.breakoutPullback) return "跌回突破位且不能收回，或放量下跌，则突破回踩失效。";
  if (type === ZH.divergenceRepair) return "修复失败、核心股补跌或再次跌破MA20，则分歧修复失效。";
  return "未形成明确买点前，不主动试错。";
}

export function buyPointDiagnosticNote(
  buyPointType: StockCandidate["buyPointType"],
  trendState: StockCandidate["trendState"],
  fundFlowState: StockCandidate["fundFlowState"],
  maDistance: NonNullable<StockCandidate["klineSummary"]>["maDistance"] | undefined,
  marketState: MarketRuleResult["marketState"],
  sectorStage?: SectorRuleResult["stage"],
  evaluation?: StockCandidate["buyPointEvaluation"]
) {
  if (evaluation) {
    const satisfied = evaluation.satisfied.slice(0, 3).join("；") || "暂无满足项";
    const blockers = evaluation.blockers.join("；") || "无硬阻断";
    return `${evaluation.status} / ${evaluation.type}：${satisfied}；阻断：${blockers}；时段：${evaluation.sessionNote}；触发：${evaluation.triggerCondition}`;
  }
  const blockers = [
    trendState === "below_ma20" || trendState === "downtrend" ? "趋势未站稳MA20" : "",
    fundFlowState === "outflow" ? "资金连续流出" : "",
    fundFlowState === "unknown" ? "缺少资金流证据" : "",
    marketState === "defensive" ? "大盘防守，买点只记录为待激活" : "",
    !sectorStage ? "缺少主线阶段证据" : "",
    sectorStage === ZH.observe ? "主线仍是观察阶段" : "",
    sectorStage === ZH.fading ? "主线退潮" : ""
  ].filter(Boolean);
  if (buyPointType === ZH.maPullback) {
    return `回踩均线：距离MA20 ${formatPct(maDistance?.ma20)}，资金${fundFlowState}；${blockers.join("；") || "形态有效"}`;
  }
  if (buyPointType === ZH.divergenceRepair) {
    return `分歧修复：趋势${trendState}，资金${fundFlowState}；${blockers.join("；") || "等待确认延续"}`;
  }
  if (buyPointType === ZH.breakoutPullback) {
    return `突破回踩：距离MA10 ${formatPct(maDistance?.ma10)}，距离MA20 ${formatPct(maDistance?.ma20)}；${blockers.join("；") || "等待更低风险回踩"}`;
  }
  const distanceNote = maDistance
    ? `距离MA5 ${formatPct(maDistance.ma5)}，距离MA20 ${formatPct(maDistance.ma20)}`
    : "均线距离缺失";
  return `无买点：${distanceNote}；${blockers.join("；") || "未满足回踩MA20、突破回踩或分歧修复条件"}`;
}
