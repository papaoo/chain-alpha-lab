import { loadCandidatePool, latestDisplayableReport, refreshCandidatePool } from "@/lib/selection/candidate-pool";
import { calculateSelectionBlockerPenalty, decideActionByScore, normalizeSelectionBlockers } from "@/lib/selection/risk-utils";
import { factor, booleanParam, numberParam, splitPassedAndRejected, stringParam, tierFromScore, uniqueText, selectionDataFreshness, selectionRuntimeSnapshot } from "@/lib/selection/scoring-utils";
import { financialEvidenceRefs, hasValidPb, hasValidPe, isBankLike } from "@/lib/selection/strategy-financial-utils";
import type {
  SelectionPick,
  SelectionPickScoreFactor,
  SelectionRunResult,
  SelectionStrategyDefinition
} from "@/lib/selection/types";
import type { StockCandidate } from "@/lib/types";

export async function runValueStable(
  strategy: SelectionStrategyDefinition,
  parameters: Record<string, unknown>
): Promise<SelectionRunResult> {
  const latest = latestDisplayableReport();
  if (!latest) throw new Error("没有可用分析报告，请先运行一次今日分析后再执行策略选股。");

  const maxFinalPicks = numberParam(parameters.maxFinalPicks, strategy.recommendedPickCount);
  const candidatePoolLimit = numberParam(parameters.candidatePoolLimit, strategy.candidatePoolLimit);
  const poolMode = stringParam(parameters.poolMode, "strategy_adaptive");
  const pool = await loadCandidatePool(latest, poolMode, candidatePoolLimit, strategy.id);
  const refreshBeforeRun = booleanParam(parameters.refreshBeforeRun, true);
  const refreshLimit = numberParam(parameters.refreshLimit, Math.min(candidatePoolLimit, 80));
  const refreshWarnings: string[] = [];
  const candidates = refreshBeforeRun
    ? await refreshCandidatePool(pool.candidates, refreshLimit, refreshWarnings)
    : pool.candidates;
  const warnings = [
    ...pool.warnings,
    ...refreshWarnings,
    "价值稳健规则只输出可观察标的，不生成长期持有承诺；银行类公司暂不使用普通企业资产负债率硬阈值，需后续补资本充足率、不良率、拨备覆盖率。"
  ];
  if (!candidates.length) warnings.push("候选池为空，价值稳健规则无法输出精选结果。");
  if (latest.factPackage.dataSource.status !== "success") {
    warnings.push(`来源报告数据状态为 ${latest.factPackage.dataSource.status}，价值稳健筛选需要降级解读。`);
  }

  const scored = candidates.map((candidate) => scoreValueStableCandidate(candidate, parameters));
  const { passed, rejected } = splitPassedAndRejected(scored, maxFinalPicks);

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    mode: "rule",
    sourceReportId: latest.id,
    sourceReportCreatedAt: latest.createdAt,
    parameters,
    picks: passed,
    rejected,
    warnings,
    dataBasis: `${pool.dataBasis}；候选股 ${candidates.length} 只；使用 PE/PB/股息率、ROE、利润和现金流质量、负债风险、股东回报、趋势稳定与资金确认进行价值稳健筛选。`
  };
}

function scoreValueStableCandidate(candidate: StockCandidate, parameters: Record<string, unknown>): SelectionPick {
  const maxDayChangePct = numberParam(parameters.maxDayChangePct, 4);
  const excludeDataInsufficient = booleanParam(parameters.excludeDataInsufficient, true);
  const factors: SelectionPickScoreFactor[] = [
    scoreValuationSafety(candidate),
    scoreProfitability(candidate),
    scoreCashFlowQuality(candidate),
    scoreDebtRisk(candidate),
    scoreShareholderReturn(candidate),
    scoreTrendStability(candidate),
    scoreFundConfirmation(candidate)
  ];
  const blockers: string[] = [];
  const reasons: string[] = [];
  const financial = candidate.companyKnowledge.financialSummary;
  const changePct = candidate.quote?.changePct;
  const priceChasing = changePct !== undefined && changePct > maxDayChangePct;

  if (excludeDataInsufficient && candidate.dataCompleteness.level === "insufficient") {
    blockers.push(`核心数据完整性为 ${candidate.dataCompleteness.level}，价值稳健策略不能给出有效精选。`);
  }
  if (!financial) blockers.push("缺少财务摘要，无法判断价值稳健所需的盈利、现金流和负债质量。");
  if (!hasValidPe(candidate) && !hasValidPb(candidate)) blockers.push("缺少有效 PE/PB，不能做价值安全边际判断。");
  if (candidate.companyKnowledge.financialTrend === "恶化") blockers.push("财务趋势恶化，价值稳健策略剔除。");
  if (candidate.trendState === "downtrend") blockers.push("处于下降趋势，价值稳健策略等待止跌修复。");
  if (priceChasing) {
    blockers.push(`当日涨幅 ${changePct.toFixed(2)}% 超过稳健策略追高上限 ${maxDayChangePct}%。`);
  }

  for (const item of factors) {
    reasons.push(...item.reasons);
    blockers.push(...item.blockers);
  }

  const uniqueBlockers = normalizeSelectionBlockers(blockers, 10);
  const blockerPenalty = calculateSelectionBlockerPenalty(uniqueBlockers, {
    maxPenalty: 55,
    hardPatterns: [/财务趋势恶化/, /缺少财务摘要/, /缺少有效 PE\/PB/, /归母净利润缺失/, /经营现金流缺失/]
  });
  let score = Math.max(0, Math.min(100, Math.round(factors.reduce((sum, item) => sum + item.score, 0) - blockerPenalty)));
  if (priceChasing) {
    score = Math.min(score, 61);
    reasons.push("稳健策略不追涨，涨幅超过上限时只保留条件等待或剔除。");
  }
  const uniqueReasons = uniqueText(reasons, 10);
  const action = decideValueAction(score, uniqueBlockers);

  return {
    code: candidate.code,
    name: candidate.name,
    sectorName: candidate.sectorName,
    price: candidate.price ?? candidate.quote?.latest,
    changePct,
    dataFreshness: selectionDataFreshness(candidate),
    runtimeSnapshot: selectionRuntimeSnapshot(candidate),
    score,
    tier: tierFromScore(score),
    action,
    reasons: uniqueReasons,
    blockers: uniqueBlockers,
    evidenceRefs: financialEvidenceRefs(candidate),
    scoreFactors: factors
  };
}

function scoreValuationSafety(candidate: StockCandidate) {
  const quote = candidate.quote;
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];
  if (quote?.peTtm !== undefined && quote.peTtm > 0 && quote.peTtm <= 18) {
    score += 10;
    reasons.push(`PE(TTM) ${quote.peTtm.toFixed(2)}，估值有安全边际。`);
  } else if (quote?.peTtm !== undefined && quote.peTtm > 18 && quote.peTtm <= 30) {
    score += 6;
    reasons.push(`PE(TTM) ${quote.peTtm.toFixed(2)}，估值不低但仍可观察。`);
  } else {
    blockers.push("PE(TTM) 缺失、为负或明显偏高，价值安全边际不足。");
  }
  if (quote?.pb !== undefined && quote.pb > 0 && quote.pb <= 1.8) {
    score += 9;
    reasons.push(`PB ${quote.pb.toFixed(2)}，账面估值相对克制。`);
  } else if (quote?.pb !== undefined && quote.pb <= 3) {
    score += 5;
    reasons.push(`PB ${quote.pb.toFixed(2)}，未达到低估但可纳入观察。`);
  } else {
    blockers.push("PB 缺失或偏高，缺少账面安全垫。");
  }
  if ((quote?.dividendYieldTtm ?? 0) >= 2.5) {
    score += 6;
    reasons.push(`股息率(TTM) ${quote?.dividendYieldTtm?.toFixed(2)}%，具备股东回报线索。`);
  }
  return factor("valuationSafety", "估值安全", score, 25, reasons, blockers);
}

function scoreProfitability(candidate: StockCandidate) {
  const financial = candidate.companyKnowledge.financialSummary;
  if (!financial) return factor("profitability", "盈利能力", 0, 20, [], ["缺少财务摘要。"]);
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];
  if ((financial.roePct ?? 0) >= 12) {
    score += 8;
    reasons.push(`ROE ${financial.roePct?.toFixed(1)}%，盈利效率较好。`);
  } else if ((financial.roePct ?? 0) >= 6) {
    score += 5;
    reasons.push(`ROE ${financial.roePct?.toFixed(1)}%，具备基础盈利能力。`);
  } else {
    blockers.push("ROE 偏低或缺失，价值稳健质量不足。");
  }
  if ((financial.netProfit ?? 0) > 0) {
    score += 5;
    reasons.push("归母净利润为正。");
  } else {
    blockers.push("归母净利润缺失或为负。");
  }
  if ((financial.netProfitChangePct ?? 0) >= 0) {
    score += 4;
    reasons.push(`净利润增速 ${financial.netProfitChangePct?.toFixed(1)}%，未出现同比恶化。`);
  } else if ((financial.netProfitChangePct ?? 0) < -15) {
    blockers.push(`净利润增速 ${financial.netProfitChangePct?.toFixed(1)}%，盈利下滑较明显。`);
  }
  if ((financial.grossMarginPct ?? 0) >= 20) score += 3;
  return factor("profitability", "盈利能力", score, 20, reasons, blockers);
}

function scoreCashFlowQuality(candidate: StockCandidate) {
  const financial = candidate.companyKnowledge.financialSummary;
  if (!financial) return factor("cashFlow", "现金流质量", 0, 15, [], ["缺少现金流字段。"]);
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];
  if ((financial.operatingCashFlow ?? 0) > 0) {
    score += 8;
    reasons.push("经营现金流为正，利润质量有基础支撑。");
  } else {
    blockers.push("经营现金流缺失或为负。");
  }
  if ((financial.operatingCashFlowChangePct ?? 0) >= 0) {
    score += 4;
    reasons.push(`经营现金流变化 ${financial.operatingCashFlowChangePct?.toFixed(1)}%，现金流未恶化。`);
  } else if ((financial.operatingCashFlowChangePct ?? 0) < -25) {
    blockers.push(`经营现金流变化 ${financial.operatingCashFlowChangePct?.toFixed(1)}%，现金流恶化明显。`);
  }
  if (financial.netProfit !== undefined && financial.operatingCashFlow !== undefined && financial.netProfit > 0 && financial.operatingCashFlow >= financial.netProfit * 0.6) {
    score += 3;
    reasons.push("经营现金流与利润匹配度尚可。");
  }
  return factor("cashFlow", "现金流质量", score, 15, reasons, blockers);
}

function scoreDebtRisk(candidate: StockCandidate) {
  const financial = candidate.companyKnowledge.financialSummary;
  if (!financial) return factor("debtRisk", "负债风险", 0, 15, [], ["缺少资产负债率字段。"]);
  const debt = financial.debtRatioPct;
  const bank = isBankLike(candidate);
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];
  if (debt === undefined) {
    blockers.push("资产负债率缺失。");
  } else if (bank) {
    score = 9;
    reasons.push("银行类公司不使用普通企业资产负债率硬阈值，需结合后续资本充足率和不良率校验。");
  } else if (debt <= 55) {
    score = 15;
    reasons.push(`资产负债率 ${debt.toFixed(1)}%，债务压力较低。`);
  } else if (debt <= 70) {
    score = 9;
    reasons.push(`资产负债率 ${debt.toFixed(1)}%，仍在可观察区间。`);
  } else {
    score = 3;
    blockers.push(`资产负债率 ${debt.toFixed(1)}%，普通企业债务压力偏高。`);
  }
  return factor("debtRisk", "负债风险", score, 15, reasons, blockers);
}

function scoreShareholderReturn(candidate: StockCandidate) {
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];
  const yieldTtm = candidate.quote?.dividendYieldTtm;
  if (yieldTtm !== undefined && yieldTtm >= 3) {
    score += 7;
    reasons.push(`股息率(TTM) ${yieldTtm.toFixed(2)}%，股东回报属性较强。`);
  } else if (yieldTtm !== undefined && yieldTtm >= 1.5) {
    score += 4;
    reasons.push(`股息率(TTM) ${yieldTtm.toFixed(2)}%，存在一定回报线索。`);
  } else {
    blockers.push("股息率缺失或偏低，股东回报证据不足。");
  }
  const holderChange = candidate.companyKnowledge.shareholderSummary?.holderCountChangePct;
  if (holderChange !== undefined && holderChange <= 3) {
    score += 3;
    reasons.push(`股东户数变化 ${holderChange.toFixed(2)}%，筹码没有明显发散。`);
  }
  return factor("shareholderReturn", "股东回报", score, 10, reasons, blockers);
}

function scoreTrendStability(candidate: StockCandidate) {
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];
  if (candidate.trendState === "above_ma20") {
    score += 4;
    reasons.push("价格位于 MA20 上方，趋势未破位。");
  } else if (candidate.trendState === "reclaim_ma20") {
    score += 3;
    reasons.push("价格收复 MA20，处于修复观察。");
  } else {
    blockers.push("价格结构未稳定在 MA20 上方。");
  }
  const ma20Distance = Math.abs(candidate.klineSummary?.maDistance?.ma20 ?? 99);
  if (ma20Distance <= 8) {
    score += 4;
    reasons.push(`距离 MA20 ${ma20Distance.toFixed(2)}%，未明显透支。`);
  } else if (ma20Distance > 18) {
    blockers.push("股价远离 MA20，价值策略不追高。");
  }
  const rsi = candidate.technical?.rsi6 ?? candidate.technical?.rsi12;
  if (rsi !== undefined && rsi <= 72) score += 2;
  return factor("trendStability", "趋势稳定", score, 10, reasons, blockers);
}

function scoreFundConfirmation(candidate: StockCandidate) {
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];
  const quality = candidate.fundFlowQuality;
  if (quality?.state === "强流入" || quality?.state === "温和流入") {
    score += 4;
    reasons.push(`资金质量 ${quality.state}/${quality.score}，资金端认可。`);
  } else if (quality?.state === "分歧" || quality?.state === "弱修复") {
    score += 2;
    reasons.push(`资金质量 ${quality.state}，只作为观察。`);
  } else {
    blockers.push("资金确认不足或持续流出。");
  }
  if ((candidate.fundFlow?.mainNetFlow20D ?? 0) >= 0) score += 1;
  return factor("fund", "资金确认", score, 5, reasons, blockers);
}

function decideValueAction(score: number, blockers: string[]): SelectionPick["action"] {
  return decideActionByScore({
    score,
    blockers,
    hardPatterns: [/财务趋势恶化/, /缺少财务摘要/, /缺少有效 PE\/PB/, /归母净利润缺失/, /经营现金流缺失/],
    hardBlockerThreshold: 5,
    focusScore: 78,
    trackScore: 62
  });
}
