import { loadCandidatePool, latestDisplayableReport, refreshCandidatePool } from "@/lib/selection/candidate-pool";
import { calculateSelectionBlockerPenalty, decideActionByScore, normalizeSelectionBlockers } from "@/lib/selection/risk-utils";
import { booleanParam, factor, numberParam, splitPassedAndRejected, stringParam, tierFromScore, uniqueText } from "@/lib/selection/scoring-utils";
import type {
  SelectionPick,
  SelectionPickScoreFactor,
  SelectionRunResult,
  SelectionStrategyDefinition
} from "@/lib/selection/types";
import type { StockCandidate } from "@/lib/types";

export async function runLowRiskReturn(
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
    "低风险收益规则当前优先使用财务摘要、资金稳定、趋势平稳和估值字段；历史波动率/最大回撤尚未完整落库时，会作为风险缺口展示。"
  ];
  if (!candidates.length) warnings.push("候选池为空，低风险收益规则无法输出精选结果。");
  if (latest.factPackage.dataSource.status !== "success") {
    warnings.push(`来源报告数据状态为 ${latest.factPackage.dataSource.status}，低风险筛选需要降级解读。`);
  }

  const scored = candidates.map((candidate) => scoreLowRiskCandidate(candidate, parameters));
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
    dataBasis: `${pool.dataBasis}；候选股 ${candidates.length} 只；使用财务稳定性、估值字段、趋势平稳、资金稳定、波动代理和事件风险进行低风险收益筛选。`
  };
}

function scoreLowRiskCandidate(candidate: StockCandidate, parameters: Record<string, unknown>): SelectionPick {
  const maxDayChangePct = numberParam(parameters.maxDayChangePct, 4);
  const excludeDataInsufficient = booleanParam(parameters.excludeDataInsufficient, true);
  const factors: SelectionPickScoreFactor[] = [
    scoreVolatilityProxy(candidate),
    scoreDrawdownProxy(candidate),
    scoreValuationSafety(candidate),
    scoreProfitStability(candidate),
    scoreTrendStability(candidate),
    scoreFundStability(candidate),
    scoreEventRisk(candidate)
  ];
  const blockers: string[] = [];
  const reasons: string[] = [];
  const financial = candidate.companyKnowledge.financialSummary;
  const changePct = candidate.quote?.changePct;
  const priceChasing = changePct !== undefined && changePct > maxDayChangePct;

  if (excludeDataInsufficient && candidate.dataCompleteness.level === "insufficient") {
    blockers.push(`核心数据完整性为 ${candidate.dataCompleteness.level}，低风险策略不能给出有效精选。`);
  }
  if (!financial) blockers.push("缺少财务摘要，低风险收益策略不能确认盈利、现金流和负债安全。");
  if (!candidate.technical || !candidate.klineSummary) blockers.push("缺少技术或K线摘要，不能判断趋势平稳和下行支撑。");
  if (candidate.fundFlowState === "outflow" || candidate.fundFlowQuality?.state === "持续流出") {
    blockers.push("资金持续流出，防守策略也不接下跌趋势。");
  }
  if (candidate.trendState === "downtrend") blockers.push("处于下降趋势，低风险策略剔除。");
  if (financial?.debtRatioPct !== undefined && financial.debtRatioPct > 75 && !isBankLike(candidate)) {
    blockers.push(`资产负债率 ${financial.debtRatioPct.toFixed(1)}%，超过低风险策略上限。`);
  } else if (financial?.debtRatioPct !== undefined && financial.debtRatioPct > 75 && isBankLike(candidate)) {
    reasons.push("银行类公司不使用普通企业资产负债率阈值剔除，需后续补充资本充足率、不良率和拨备覆盖率。");
  }
  if (candidate.companyKnowledge.financialTrend === "恶化") blockers.push("财务趋势恶化，不符合低风险收益策略。");
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
    hardPatterns: [/缺少财务摘要/, /持续流出/, /下降趋势/, /财务趋势恶化/, /资产负债率/]
  });
  let score = Math.max(0, Math.min(100, Math.round(factors.reduce((sum, item) => sum + item.score, 0) - blockerPenalty)));
  if (priceChasing) {
    score = Math.min(score, 61);
    reasons.push("低风险策略不追涨，涨幅超过上限时只保留条件等待或剔除。");
  }
  if (blockers.some((item) => /风险提示数量偏多/.test(item))) {
    score = Math.min(score, 74);
    reasons.push("风险提示数量偏多时，即使财务和估值分较高，也只允许跟踪观察。");
  }
  const uniqueReasons = uniqueText(reasons, 10);
  const action = decideLowRiskAction(score, uniqueBlockers);

  return {
    code: candidate.code,
    name: candidate.name,
    sectorName: candidate.sectorName,
    price: candidate.price ?? candidate.quote?.latest,
    changePct,
    score,
    tier: tierFromScore(score),
    action,
    reasons: uniqueReasons,
    blockers: uniqueBlockers,
    evidenceRefs: buildEvidenceRefs(candidate),
    scoreFactors: factors
  };
}

function scoreVolatilityProxy(candidate: StockCandidate) {
  let score = 0;
  const blockers: string[] = [];
  const reasons: string[] = ["历史波动率尚未完整落库，当前使用日涨跌幅、活跃度和均线距离作为波动代理。"];
  const changeAbs = Math.abs(candidate.quote?.changePct ?? 0);
  const ma20Distance = Math.abs(candidate.klineSummary?.maDistance?.ma20 ?? 99);
  if (changeAbs <= 2) {
    score += 7;
    reasons.push(`当日波动 ${changeAbs.toFixed(2)}%，短期价格扰动较低。`);
  }
  if (ma20Distance <= 6) {
    score += 7;
    reasons.push(`距离 MA20 ${ma20Distance.toFixed(2)}%，未明显远离中枢。`);
  } else if (ma20Distance > 15) {
    blockers.push("价格明显远离 MA20，低风险买点不成立。");
  }
  if (candidate.activity?.status === "弱" || candidate.activity?.status === "中") {
    score += 4;
    reasons.push(`成交活跃度 ${candidate.activity.status}，没有极端短线拥挤。`);
  } else if (candidate.activity?.status === "强") {
    score += 2;
    blockers.push("成交活跃度强，可能存在短线拥挤，需要降低防守属性。");
  }
  if ((candidate.quote?.turnoverRate ?? 0) <= 5) score += 2;
  return factor("volatility", "波动控制", score, 20, reasons, blockers);
}

function scoreDrawdownProxy(candidate: StockCandidate) {
  let score = 0;
  const reasons: string[] = ["最大回撤尚未完整落库，当前使用 MA20/MA60 趋势结构作为回撤代理。"];
  const blockers: string[] = [];
  const technical = candidate.technical;
  if (candidate.trendState === "above_ma20") {
    score += 8;
    reasons.push("价格站上 MA20，短期结构未破位。");
  } else if (candidate.trendState === "reclaim_ma20") {
    score += 5;
    reasons.push("价格收复 MA20，但仍需确认。");
  } else {
    blockers.push("价格未站稳 MA20，下行保护不足。");
  }
  if (technical?.ma20 && technical.ma60 && technical.ma20 >= technical.ma60) {
    score += 8;
    reasons.push("MA20 不低于 MA60，中期结构较稳。");
  } else if (technical?.ma20 && technical.ma60) {
    blockers.push("MA20 低于 MA60，中期结构仍有回撤压力。");
  }
  if ((candidate.riskFlags ?? []).length <= 2) score += 4;
  return factor("drawdown", "回撤控制", score, 20, reasons, blockers);
}

function scoreValuationSafety(candidate: StockCandidate) {
  const quote = candidate.quote;
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];
  if (quote?.peTtm !== undefined && quote.peTtm > 0 && quote.peTtm <= 25) {
    score += 8;
    reasons.push(`PE(TTM) ${quote.peTtm.toFixed(2)}，估值没有明显透支。`);
  } else {
    blockers.push("缺少可用 PE(TTM) 或 PE 不满足低风险估值要求。");
  }
  if (quote?.pb !== undefined && quote.pb > 0 && quote.pb <= 2.5) {
    score += 8;
    reasons.push(`PB ${quote.pb.toFixed(2)}，账面估值相对可控。`);
  } else {
    blockers.push("缺少可用 PB 或 PB 偏高。");
  }
  const marketValue = candidate.quote?.floatMarketValue;
  if (marketValue !== undefined && marketValue >= 20_000_000_000) {
    score += 4;
    reasons.push("流通市值具备基础容量，防守策略承接更稳定。");
  }
  if ((quote?.dividendYieldTtm ?? 0) >= 2) {
    score += 2;
    reasons.push(`股息率(TTM) ${quote?.dividendYieldTtm?.toFixed(2)}%，具备防守收益属性。`);
  }
  return factor("valuationSafety", "估值安全", score, 20, reasons, blockers);
}

function scoreProfitStability(candidate: StockCandidate) {
  const financial = candidate.companyKnowledge.financialSummary;
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];
  if (!financial) return factor("profitStability", "盈利稳定", 0, 15, [], ["缺少财务摘要。"]);
  if (candidate.companyKnowledge.financialTrend === "改善" || candidate.companyKnowledge.financialTrend === "平稳") {
    score += 4;
    reasons.push(`财务趋势为${candidate.companyKnowledge.financialTrend}。`);
  } else {
    blockers.push(`财务趋势为${candidate.companyKnowledge.financialTrend}。`);
  }
  if ((financial.roePct ?? 0) > 6) {
    score += 4;
    reasons.push(`ROE ${financial.roePct?.toFixed(1)}%，具备基础盈利能力。`);
  } else {
    blockers.push("ROE 偏低或缺失。");
  }
  if ((financial.netProfit ?? 0) > 0) score += 3;
  else blockers.push("归母净利润缺失或为负。");
  if ((financial.operatingCashFlow ?? 0) > 0) {
    score += 4;
    reasons.push("经营现金流为正。");
  } else {
    blockers.push("经营现金流缺失或为负。");
  }
  return factor("profitStability", "盈利稳定", score, 15, reasons, blockers);
}

function scoreTrendStability(candidate: StockCandidate) {
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];
  const technical = candidate.technical;
  if (candidate.trendState === "above_ma20") {
    score += 5;
    reasons.push("趋势位于 MA20 上方。");
  } else if (candidate.trendState === "reclaim_ma20") {
    score += 3;
    reasons.push("趋势刚收复 MA20。");
  } else {
    blockers.push("趋势未修复。");
  }
  if (technical?.ma5 && technical.ma10 && technical.ma20 && technical.ma5 >= technical.ma10 && technical.ma10 >= technical.ma20) {
    score += 3;
    reasons.push("短中期均线排列平稳。");
  }
  const rsi = technical?.rsi6 ?? technical?.rsi12;
  if (rsi !== undefined && rsi >= 35 && rsi <= 70) score += 2;
  else if (rsi !== undefined && rsi > 80) blockers.push("RSI 过热，不符合低风险追踪。");
  return factor("trendStability", "趋势平稳", score, 10, reasons, blockers);
}

function scoreFundStability(candidate: StockCandidate) {
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];
  const quality = candidate.fundFlowQuality;
  if (quality?.state === "强流入" || quality?.state === "温和流入") {
    score += 6;
    reasons.push(`资金质量 ${quality.state}/${quality.score}。`);
  } else if (quality?.state === "分歧" || quality?.state === "弱修复") {
    score += 3;
    reasons.push(`资金质量 ${quality.state}，只能作为观察。`);
  } else {
    blockers.push("资金稳定证据不足或持续流出。");
  }
  if ((candidate.fundFlow?.mainNetFlow20D ?? 0) >= 0) score += 4;
  else blockers.push("20日主力资金为负。");
  return factor("fundStability", "资金稳定", score, 10, reasons, blockers);
}

function scoreEventRisk(candidate: StockCandidate) {
  let score = 5;
  const reasons: string[] = [];
  const blockers: string[] = [];
  const risks = [...candidate.riskFlags, ...candidate.companyKnowledge.fundamentalRisks];
  if (risks.length > 5) {
    score -= 3;
    blockers.push("风险提示数量偏多，需要人工复核。");
  } else {
    reasons.push("未出现大量集中风险提示。");
  }
  if (!candidate.companyKnowledge.longTermLogicAllowed) {
    score -= 2;
    blockers.push("公司认知不足，不输出长期持有理由。");
  }
  return factor("eventRisk", "事件风险", score, 5, reasons, blockers);
}

function decideLowRiskAction(score: number, blockers: string[]): SelectionPick["action"] {
  return decideActionByScore({
    score,
    blockers,
    hardPatterns: [/缺少财务摘要/, /持续流出/, /下降趋势/, /财务趋势恶化/, /资产负债率/],
    hardBlockerThreshold: 5,
    focusScore: 78,
    trackScore: 62
  });
}

function isBankLike(candidate: StockCandidate) {
  const text = [
    candidate.name,
    candidate.sectorName,
    candidate.companyKnowledge.industry,
    candidate.companyKnowledge.mainBusiness,
    candidate.companyKnowledge.coreBusiness
  ].join(" ");
  return /银行|农商行|城商行/i.test(text);
}

function buildEvidenceRefs(candidate: StockCandidate) {
  return uniqueText(
    [
      ...candidate.evidenceRefs,
      `company.${candidate.code}.financial.summary`,
      `stock.${candidate.code}.technical.ma20`,
      `stock.${candidate.code}.fund.quality`,
      `rule.stock.${candidate.code}.activity`,
      `rule.stock.${candidate.code}.tradability`
    ],
    12
  );
}
