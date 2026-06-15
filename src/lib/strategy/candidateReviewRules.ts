import type { CandidateReviewRecord, MarketRuleResult, RiskConstraints, StockCandidate } from "@/lib/types";

export function buildCandidateReviewRecord(candidate: StockCandidate): CandidateReviewRecord {
  const attribution = candidate.mainlineAttribution;
  const missingEvidence = [
    candidate.dataCompleteness.hasSectorData ? "" : "当前主线成分股或主营直接匹配证据",
    candidate.dataCompleteness.hasProfileData ? "" : "公司基础信息",
    candidate.dataCompleteness.hasFundFlowData ? "" : "资金流",
    candidate.dataCompleteness.hasTechnicalData ? "" : "技术指标",
    candidate.dataCompleteness.hasKlineData ? "" : "K线"
  ].filter(Boolean);
  return {
    code: candidate.code,
    name: candidate.name,
    source: candidate.sectorName,
    quote: candidate.quote,
    price: candidate.price,
    signalScore: candidate.signalScore,
    strengthScore: candidate.strengthScore,
    fundFlow: candidate.fundFlow,
    activity: candidate.activity,
    tradability: candidate.tradability,
    klineSummary: candidate.klineSummary,
    status: attribution?.evidenceChain?.reviewRequired ? "人工复核" : "剔除",
    reason: attribution?.reason ?? (candidate.dataCompleteness.blockingReasons.join("；") || "证据不足，未进入候选股信号表。"),
    missingEvidence,
    blockers: attribution?.blockers.length ? attribution.blockers : candidate.dataCompleteness.blockingReasons,
    evidence: attribution?.evidence ?? candidate.evidenceRefs,
    evidenceChain: attribution?.evidenceChain,
    attributionStatus: attribution?.status,
    reviewRequired: attribution?.evidenceChain?.reviewRequired ?? true
  };
}

export function buildConstraints(market: MarketRuleResult, candidates: StockCandidate[]): RiskConstraints {
  return {
    allowedCodes: candidates.map((candidate) => candidate.code),
    maxSingleStockPositionPct: market.maxSingleStockPct,
    maxThemePositionPct: Math.min(market.maxTotalPositionPct, market.tradeMode === "进攻" ? 35 : market.tradeMode === "低吸" ? 25 : 15),
    minCashPct: 100 - market.maxTotalPositionPct
  };
}
