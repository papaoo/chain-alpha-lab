import { loadCandidatePool, latestDisplayableReport, refreshCandidatePool, type LatestAnalysisReport } from "@/lib/selection/candidate-pool";
import { buildTradabilityPlan, calculateSelectionBlockerPenalty, decideActionByScore, normalizeSelectionBlockers } from "@/lib/selection/risk-utils";
import { booleanParam, factor, numberParam, splitPassedAndRejected, stringParam, tierFromScore, uniqueText } from "@/lib/selection/scoring-utils";
import type {
  SelectionPick,
  SelectionPickScoreFactor,
  SelectionRunResult,
  SelectionStrategyDefinition
} from "@/lib/selection/types";
import type { SectorRuleResult, StockCandidate, StockTechnicalSnapshot } from "@/lib/types";

export async function runShortTermBreakout(
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
  const poolScopeWarning = poolMode === "full_a_scan" || poolMode === "hybrid_full_a"
    ? "短期突破规则已接入全 A 扫描候选；平台突破仍只在已刷新前排的K线摘要、技术指标、资金质量和板块阶段范围内判断。"
    : "短期突破规则当前基于已沉淀候选池筛选，不等于全 A 扫描；平台突破只在现有K线摘要和技术指标范围内判断。";
  const warnings = [
    ...pool.warnings,
    ...refreshWarnings,
    poolScopeWarning
  ];
  if (!candidates.length) warnings.push("候选池为空，短期突破规则无法输出精选结果。");
  if (latest.factPackage.dataSource.status !== "success") {
    warnings.push(`来源报告数据状态为 ${latest.factPackage.dataSource.status}，短线信号需要降级解读。`);
  }

  const scored = candidates.map((candidate) => scoreShortTermBreakoutCandidate(candidate, latest, parameters));
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
    dataBasis: `${pool.dataBasis}；候选股 ${candidates.length} 只；使用K线摘要、均线、MACD/RSI、成交活跃度、资金质量、板块阶段和可交易性进行短期突破筛选。`
  };
}

function scoreShortTermBreakoutCandidate(
  candidate: StockCandidate,
  report: LatestAnalysisReport,
  parameters: Record<string, unknown>
): SelectionPick {
  const maxDayChangePct = numberParam(parameters.maxDayChangePct, 8);
  const minAmountYi = numberParam(parameters.minAmountYi, 1);
  const minAmount = minAmountYi * 100_000_000;
  const excludeDataInsufficient = booleanParam(parameters.excludeDataInsufficient, true);
  const largeCapPolicy = stringParam(parameters.largeCapPolicy, "balanced");
  const sector = report.factPackage.sectors.find((item) => item.name === candidate.sectorName);
  const tradabilityPlan = buildTradabilityPlan(candidate);
  const factors: SelectionPickScoreFactor[] = [
    scoreBreakoutPattern(candidate),
    scoreVolumeExpansion(candidate, minAmount),
    scoreMaTrend(candidate.technical),
    scoreMomentum(candidate.technical),
    scoreBreakoutSector(sector),
    scoreBreakoutFund(candidate),
    scoreBreakoutRisk(candidate, maxDayChangePct)
  ];

  const blockers: string[] = [];
  const reasons: string[] = [];
  if (excludeDataInsufficient && candidate.dataCompleteness.level === "insufficient") {
    blockers.push(`核心数据完整性为 ${candidate.dataCompleteness.level}，短线突破不能给出有效信号。`);
  }
  if (!candidate.klineSummary) blockers.push("缺少日K摘要，不能判断突破结构。");
  if (!candidate.technical) blockers.push("缺少技术指标，不能判断均线和动能。");
  if (!candidate.fundFlow) blockers.push("缺少资金流，不能验证突破承接。");
  if (!sector) blockers.push("缺少板块阶段证据，短线突破不能脱离板块环境。");
  const dayChange = candidate.quote?.changePct;
  if (dayChange !== undefined && dayChange > maxDayChangePct) {
    blockers.push(`当日涨幅 ${dayChange.toFixed(2)}% 超过短线追高上限 ${maxDayChangePct}%，不按当日可买信号处理。`);
  }
  if (tradabilityPlan.blocker) blockers.push(tradabilityPlan.blocker);
  if (tradabilityPlan.reason) reasons.push(tradabilityPlan.reason);
  if (candidate.fundFlowQuality?.state === "持续流出" || candidate.fundFlowState === "outflow") {
    blockers.push("资金质量为持续流出或资金状态流出，突破信号无效。");
  }
  if (sector?.stage === "退潮") blockers.push("所属板块处于退潮阶段，短线突破降为无效。");
  const styleConstraint = breakoutStyleConstraint(candidate, largeCapPolicy);
  if (styleConstraint.blocker) blockers.push(styleConstraint.blocker);
  if (styleConstraint.reason) reasons.push(styleConstraint.reason);

  for (const item of factors) {
    reasons.push(...item.reasons);
    blockers.push(...item.blockers);
  }
  const uniqueBlockers = normalizeSelectionBlockers(blockers, 10);
  const blockerPenalty = calculateSelectionBlockerPenalty(uniqueBlockers, { maxPenalty: 50, softPenalty: 2 });
  let score = Math.max(0, Math.min(100, Math.round(factors.reduce((sum, item) => sum + item.score, 0) - blockerPenalty)));
  if (tradabilityPlan.isNextSessionOnly) {
    score = Math.min(score, tradabilityPlan.scoreCap ?? 70);
    reasons.push("涨停/近涨停个股即使结构强，也只进入次日计划，不给当日追价信号。");
  }
  if (styleConstraint.scoreCap !== undefined) {
    score = Math.min(score, styleConstraint.scoreCap);
  }

  const uniqueReasons = uniqueText(reasons, 10);
  const action = decideBreakoutAction(score, uniqueBlockers, tradabilityPlan.isNextSessionOnly);

  return {
    code: candidate.code,
    name: candidate.name,
    sectorName: candidate.sectorName,
    price: candidate.price ?? candidate.quote?.latest,
    changePct: dayChange,
    score,
    tier: tierFromScore(score),
    action,
    reasons: uniqueReasons,
    blockers: uniqueBlockers,
    evidenceRefs: buildEvidenceRefs(candidate, sector),
    scoreFactors: factors
  };
}

function breakoutStyleConstraint(candidate: StockCandidate, policy: string) {
  const floatMarketValue = candidate.quote?.floatMarketValue;
  const valueYi = floatMarketValue ? floatMarketValue / 100_000_000 : undefined;
  const text = [
    candidate.name,
    candidate.companyKnowledge.industry,
    candidate.companyKnowledge.mainBusiness,
    candidate.companyKnowledge.coreBusiness,
    candidate.sectorName
  ].join(" ");
  const financialLowVol = /银行|农商行|保险|证券|券商|信托|金融/i.test(text);
  if (policy === "allow") {
    return valueYi ? { reason: `参数允许大票，流通市值约 ${valueYi.toFixed(0)} 亿。` } : {};
  }
  if (financialLowVol) {
    return {
      blocker: "银行/保险/券商等低波动金融资产不进入短期突破前排，更适合低风险收益或防守配置策略。",
      scoreCap: 55
    };
  }
  if (policy === "avoid_large_cap" && valueYi !== undefined && valueYi >= 1500) {
    return {
      blocker: `流通市值约 ${valueYi.toFixed(0)} 亿，参数设置为主动回避超大市值，短线突破降级。`,
      scoreCap: 58
    };
  }
  if (policy === "balanced" && valueYi !== undefined && valueYi >= 3000) {
    return {
      blocker: `流通市值约 ${valueYi.toFixed(0)} 亿，普通短线突破策略不优先选择超大市值低弹性标的。`,
      scoreCap: 62
    };
  }
  return {};
}

function scoreBreakoutPattern(candidate: StockCandidate) {
  const technical = candidate.technical;
  const distance = candidate.klineSummary?.maDistance;
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];

  if (candidate.trendState === "above_ma20") {
    score += 10;
    reasons.push("股价站上 MA20，具备突破或趋势延续的基础结构。");
  } else if (candidate.trendState === "reclaim_ma20") {
    score += 8;
    reasons.push("股价刚收复 MA20，属于修复型突破候选。");
  } else if (candidate.trendState === "below_ma20" || candidate.trendState === "downtrend") {
    blockers.push("股价仍弱于 MA20 或处于下降趋势，不符合短期突破主条件。");
  }

  if (technical?.closePrice && technical.ma20 && technical.closePrice >= technical.ma20) {
    score += 5;
  }
  if (distance?.ma20 !== undefined && distance.ma20 >= 0 && distance.ma20 <= 8) {
    score += 6;
    reasons.push(`距离 MA20 ${distance.ma20.toFixed(2)}%，突破未明显透支。`);
  } else if (distance?.ma20 !== undefined && distance.ma20 > 15) {
    blockers.push(`距离 MA20 ${distance.ma20.toFixed(2)}%，短线过度远离均线。`);
  }
  if ((candidate.strengthScore ?? 0) >= 70 || candidate.signalTier === "A" || candidate.signalTier === "S") {
    score += 4;
    reasons.push("历史信号强度较高，突破候选优先级提升。");
  }

  return factor("breakoutPattern", "突破形态", score, 25, reasons, blockers);
}

function scoreVolumeExpansion(candidate: StockCandidate, minAmount: number) {
  const amount = candidate.quote?.amount ?? candidate.activity?.basis.amount;
  const turnover = candidate.quote?.turnoverRate ?? candidate.activity?.basis.turnoverRate;
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];

  if (amount === undefined) {
    blockers.push("缺少成交额，不能确认突破流动性。");
  } else if (amount >= minAmount) {
    score += 8;
    reasons.push(`成交额达到最低流动性要求，当前约 ${(amount / 100_000_000).toFixed(2)} 亿。`);
  } else {
    blockers.push(`成交额约 ${(amount / 100_000_000).toFixed(2)} 亿，低于最低流动性要求 ${(minAmount / 100_000_000).toFixed(2)} 亿。`);
  }

  if (candidate.activity?.status === "强") {
    score += 6;
    reasons.push("成交活跃度为强，具备短线承接基础。");
  } else if (candidate.activity?.status === "中") {
    score += 4;
    reasons.push("成交活跃度为中，短线承接可观察。");
  } else {
    blockers.push("成交活跃度偏弱或缺失，突破可靠性下降。");
  }

  if (turnover !== undefined && turnover >= 2 && turnover <= 18) {
    score += 4;
    reasons.push(`换手率 ${turnover.toFixed(2)}%，存在交易活跃度且未极端失控。`);
  } else if (turnover !== undefined && turnover > 25) {
    blockers.push(`换手率 ${turnover.toFixed(2)}%，短线分歧过大。`);
  }
  if ((candidate.quote?.changePct ?? 0) > 0 && amount !== undefined && amount >= minAmount) score += 2;

  return factor("volumeExpansion", "量能放大", score, 20, reasons, blockers);
}

function scoreMaTrend(technical?: StockTechnicalSnapshot) {
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];
  if (!technical?.ma5 || !technical.ma10 || !technical.ma20) {
    return factor("maTrend", "均线多头", 0, 15, [], ["缺少 MA5/MA10/MA20，不能判断均线结构。"]);
  }
  if (technical.ma5 >= technical.ma10 && technical.ma10 >= technical.ma20) {
    score += 10;
    reasons.push("MA5 >= MA10 >= MA20，短中期均线多头。");
  } else if (technical.closePrice && technical.closePrice >= technical.ma20 && technical.ma5 >= technical.ma10) {
    score += 7;
    reasons.push("价格站上 MA20 且短均线开始修复。");
  } else {
    blockers.push("均线尚未形成多头或修复结构。");
  }
  if (!technical.ma60 || technical.ma20 >= technical.ma60) {
    score += 5;
    reasons.push("MA20 未弱于 MA60，中期结构没有明显拖累。");
  } else {
    blockers.push("MA20 仍低于 MA60，中期趋势尚未修复。");
  }
  return factor("maTrend", "均线多头", score, 15, reasons, blockers);
}

function scoreMomentum(technical?: StockTechnicalSnapshot) {
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];
  if (!technical) return factor("momentum", "动能指标", 0, 15, [], ["缺少 MACD/RSI 动能指标。"]);
  if (technical.macdDif !== undefined && technical.macdDea !== undefined) {
    if (technical.macdDif >= technical.macdDea) {
      score += 6;
      reasons.push("MACD DIF 不弱于 DEA，动能修复。");
    } else {
      blockers.push("MACD DIF 仍低于 DEA，突破动能不足。");
    }
  }
  if ((technical.macd ?? 0) > 0) {
    score += 3;
    reasons.push("MACD 柱值为正，短线动能获得确认。");
  }
  const rsi = technical.rsi6 ?? technical.rsi12;
  if (rsi !== undefined && rsi >= 45 && rsi <= 72) {
    score += 6;
    reasons.push(`RSI ${rsi.toFixed(1)}，动能修复但未严重过热。`);
  } else if (rsi !== undefined && rsi > 82) {
    blockers.push(`RSI ${rsi.toFixed(1)}，短线严重过热。`);
  } else if (rsi === undefined) {
    blockers.push("缺少 RSI，动能温度无法确认。");
  }
  return factor("momentum", "动能指标", score, 15, reasons, blockers);
}

function scoreBreakoutSector(sector?: SectorRuleResult) {
  if (!sector) return factor("sector", "板块强度", 0, 10, [], ["缺少所属板块阶段。"]);
  if (sector.stage === "确认") return factor("sector", "板块强度", 10, 10, ["所属板块处于确认阶段，适合观察短线突破延续。"], []);
  if (sector.stage === "启动") return factor("sector", "板块强度", 8, 10, ["所属板块处于启动阶段，适合小范围观察突破。"], []);
  if (sector.stage === "加速") return factor("sector", "板块强度", 6, 10, ["所属板块处于加速阶段，只保留分歧后承接，避免追高。"], ["板块加速阶段不追普通突破。"]);
  if (sector.stage === "分歧") return factor("sector", "板块强度", 4, 10, ["所属板块分歧，只有核心股回封或修复才继续观察。"], ["板块分歧会降低突破成功率。"]);
  if (sector.stage === "退潮") return factor("sector", "板块强度", 0, 10, [], ["所属板块退潮，突破信号不采用。"]);
  return factor("sector", "板块强度", 3, 10, ["所属板块仍在观察阶段，突破需要更多确认。"], []);
}

function scoreBreakoutFund(candidate: StockCandidate) {
  const quality = candidate.fundFlowQuality;
  const flow = candidate.fundFlow;
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];
  if (quality?.score !== undefined) {
    score = Math.round(quality.score * 0.1);
    reasons.push(`资金质量 ${quality.state}/${quality.score}，用于验证突破承接。`);
  }
  if ((flow?.mainNetFlow ?? 0) > 0 && (flow?.mainNetFlow5D ?? 0) >= 0) {
    score = Math.max(score, 8);
    reasons.push("当日与5日资金未背离突破方向。");
  }
  if (quality?.state === "持续流出" || candidate.fundFlowState === "outflow") {
    blockers.push("资金持续流出，突破可靠性不足。");
  }
  return factor("fund", "资金确认", score, 10, reasons, blockers);
}

function scoreBreakoutRisk(candidate: StockCandidate, maxDayChangePct: number) {
  let score = 5;
  const reasons: string[] = [];
  const blockers: string[] = [];
  const changePct = candidate.quote?.changePct;
  const ma20Distance = candidate.klineSummary?.maDistance?.ma20;
  if (changePct !== undefined && changePct > maxDayChangePct) {
    score -= 3;
    reasons.push("当日涨幅超过追高上限，风险分扣减；具体追高约束见顶层阻断。");
  }
  if (ma20Distance !== undefined && ma20Distance > 15) {
    score -= 3;
    blockers.push("价格远离 MA20，追涨风险高。");
  }
  if (candidate.tradability?.status === "可买入观察") {
    reasons.push("可交易性状态允许继续观察。");
  } else if (candidate.tradability?.status === "涨停不可达" || candidate.tradability?.status === "接近涨停") {
    score -= 2;
    reasons.push(`${candidate.tradability.status}，风险分扣减；具体次日计划见顶层阻断。`);
  } else if (candidate.tradability?.status && candidate.tradability.status !== "未知") {
    score -= 2;
    blockers.push(`可交易性状态为 ${candidate.tradability.status}，需要等待 ${candidate.tradability.waitFor}。`);
  }
  if (!blockers.length) reasons.push("未触发主要短线追高或不可达风险。");
  return factor("risk", "风险控制", score, 5, reasons, blockers);
}

function decideBreakoutAction(score: number, blockers: string[], nextSessionOnly: boolean): SelectionPick["action"] {
  return decideActionByScore({
    score,
    blockers,
    nextSessionOnly,
    hardPatterns: [
      /缺少板块阶段证据/,
      /资金质量为持续流出/,
      /资金状态流出/,
      /所属板块处于退潮/,
      /下降趋势/,
      /低于最低流动性/,
      /不进入短期突破前排/,
      /主动回避超大市值/
    ],
    hardBlockerThreshold: 3,
    focusScore: 78,
    trackScore: 62
  });
}

function buildEvidenceRefs(candidate: StockCandidate, sector?: SectorRuleResult) {
  return uniqueText(
    [
      ...candidate.evidenceRefs,
      `stock.${candidate.code}.kline.latest`,
      `stock.${candidate.code}.technical.ma20`,
      `stock.${candidate.code}.fund.quality`,
      `rule.stock.${candidate.code}.activity`,
      sector ? `rule.sector.${sector.name}.stage` : ""
    ],
    12
  );
}
