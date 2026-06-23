import type { SectorRuleResult, SectorSnapshot } from "@/lib/types";
import { ZH } from "@/lib/strategy/support";
import { scoreStatus } from "@/lib/strategy/utils";
import { scoreCoreStockStructure, scoreSectorFundingQuality } from "@/lib/strategy/sectorFactorScoreRules";

export function decideSectorStage(input: {
  score: number;
  change: number;
  change5: number;
  change20: number;
  inflow: number;
  inflow5: number;
  breadthScore: number;
  limitPoolScore: number;
  sector: SectorSnapshot;
}): SectorRuleResult["stage"] {
  const { score, change, change5, change20, inflow, inflow5, breadthScore, limitPoolScore, sector } = input;
  const upPct = sector.constituentUpPct;
  const broadEnough = upPct === undefined ? breadthScore >= 8 : upPct >= 55;
  const veryBroad = upPct === undefined ? breadthScore >= 14 : upPct >= 65;
  const limitCore = (sector.limitUpCount ?? 0) >= 3 || limitPoolScore >= 8;
  const hasLeader = (sector.coreStocks ?? []).some((stock) => stock.role === "龙头" && stock.score >= 45);
  const hasCore = (sector.coreStocks ?? []).some((stock) => stock.role === "中军" && stock.score >= 35);
  const coreWeak = (sector.coreStocks ?? []).some((stock) => stock.role !== "补涨" && stock.risks.length >= 2);
  const openBoardPressure = (sector.openBoardCount ?? 0) > Math.max(2, (sector.limitUpCount ?? 0));
  const hasCoreAnchor = hasLeader || hasCore;
  const structureStillAlive =
    hasCoreAnchor &&
    (limitCore || broadEnough || change20 > 0) &&
    (score >= 45 || (limitCore && change20 > 0) || veryBroad);
  const fundingFades = inflow < 0 && inflow5 < 0;
  const priceBreaks = change5 < -3 && change20 < 0;
  const breadthBreaks = upPct !== undefined && upPct < 35 && change5 < 0;
  const confirmedFade =
    (fundingFades && (!structureStillAlive || (score < 45 && !limitCore) || (breadthScore <= 5 && !limitCore))) ||
    (priceBreaks && (!hasCoreAnchor || score < 55)) ||
    (breadthBreaks && (!hasCoreAnchor || !limitCore));

  if (confirmedFade) return ZH.fading;
  if ((fundingFades || priceBreaks || breadthBreaks) && structureStillAlive) return ZH.diverging;
  if (coreWeak || (change20 > 0 && (change < -1 || inflow < 0 || openBoardPressure) && (breadthScore <= 6 || inflow5 <= 0))) return ZH.diverging;
  if (score >= 78 && change > 2 && change5 > 5 && inflow > 0 && (veryBroad || limitCore) && hasLeader && !openBoardPressure) return ZH.accelerating;
  if (score >= 62 && change5 > 0 && (inflow5 > 0 || limitCore) && broadEnough && (hasLeader || hasCore)) return ZH.confirmed;
  if (score >= 45 && (change > 0 || change5 > 0) && (inflow > 0 || breadthScore >= 6 || limitCore || hasLeader)) return ZH.startup;
  return ZH.observe;
}

export function buildSectorDiagnostics(input: {
  priceScore: number;
  fundingScore: number;
  fundingQuality: ReturnType<typeof scoreSectorFundingQuality>;
  breadthScore: number;
  limitPoolScore: number;
  rankScore: number;
  sector: SectorSnapshot;
}): SectorRuleResult["diagnostics"] {
  const hasBreadthEvidence = Boolean(input.sector.constituentCount || input.sector.upDownRatio);
  const breadthNote = input.sector.constituentCount
    ? `成分股上涨占比 ${input.sector.constituentUpPct ?? 0}%`
    : input.sector.upDownRatio
      ? `westock 板块涨跌家数 ${input.sector.upDownRatio}`
      : "缺少成分股结构，只能按板块弱证据处理";
  const coreStructureScore = scoreCoreStockStructure(input.sector);
  return [
    {
      label: "价格强度",
      score: input.priceScore,
      max: 25,
      status: scoreStatus(input.priceScore, 25),
      note: "单日、5 日、20 日强度是否形成持续趋势"
    },
    {
      label: "资金强度",
      score: input.fundingScore,
      max: 25,
      status: scoreStatus(input.fundingScore, 25),
      note: `资金状态${input.fundingQuality.state}；依据：${input.fundingQuality.evidence.join("；") || "无"}；约束：${input.fundingQuality.blockers.join("；") || "无"}`
    },
    {
      label: "成分扩散",
      score: input.breadthScore,
      max: 20,
      status: hasBreadthEvidence ? scoreStatus(input.breadthScore, 20) : "缺失",
      note: breadthNote
    },
    {
      label: "涨停核心",
      score: input.limitPoolScore,
      max: 15,
      status: scoreStatus(input.limitPoolScore, 15),
      note: `涨停 ${input.sector.limitUpCount ?? 0} 只，炸板 ${input.sector.openBoardCount ?? 0} 只`
    },
    {
      label: "核心结构",
      score: coreStructureScore,
      max: 15,
      status: input.sector.coreStocks?.length ? scoreStatus(coreStructureScore, 15) : "缺失",
      note: input.sector.coreStocks?.length ? `核心股 ${input.sector.coreStocks.slice(0, 3).map((stock) => stock.name).join("、")}` : "缺少核心股结构"
    },
    {
      label: "前排排名",
      score: input.rankScore,
      max: 12,
      status: scoreStatus(input.rankScore, 12),
      note: "板块在当日排行榜中的位置"
    }
  ];
}

export function inferSectorConfidence(
  sector: SectorSnapshot,
  diagnostics: SectorRuleResult["diagnostics"],
  stage: SectorRuleResult["stage"]
): SectorRuleResult["confidence"] {
  if (stage === ZH.observe) return "低";
  if (!sector.constituentCount || diagnostics.filter((item) => item.status === "缺失").length >= 1) return "低";
  if (diagnostics.filter((item) => item.status === "弱").length >= 2) return "中";
  return "高";
}

export function inferLineQuality(
  stage: SectorRuleResult["stage"],
  score: number,
  leaderStrength: number,
  coreStrength: number
): SectorRuleResult["lineQuality"] {
  if (stage === ZH.fading) return "退潮主线";
  if (stage === ZH.accelerating || (score >= 80 && leaderStrength >= 14 && coreStrength >= 14)) return "核心主线";
  if (stage === ZH.confirmed || score >= 65) return "确认主线";
  if (stage === ZH.startup || stage === ZH.diverging) return "潜在主线";
  return "日内热点";
}

export {
  allowedBuyTypesForStage,
  forbiddenActionsForStage,
  inferDivergenceType,
  invalidConditionsForStage
} from "@/lib/strategy/sectorStagePolicyRules";

export {
  scoreSectorBreadth,
  scoreSectorCore,
  scoreSectorFunding,
  scoreSectorFundingQuality,
  scoreSectorLeader,
  scoreSectorLimitPool,
  scoreSectorPrice
} from "@/lib/strategy/sectorFactorScoreRules";
