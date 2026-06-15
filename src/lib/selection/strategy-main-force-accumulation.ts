import { loadCandidatePool, latestDisplayableReport, refreshCandidatePool, type LatestAnalysisReport } from "@/lib/selection/candidate-pool";
import { calculateSelectionBlockerPenalty, decideActionByScore, normalizeSelectionBlockers } from "@/lib/selection/risk-utils";
import { booleanParam, factor, numberParam, splitPassedAndRejected, stringParam, tierFromScore, uniqueText } from "@/lib/selection/scoring-utils";
import { isLowVolFinancial } from "@/lib/selection/strategy-financial-utils";
import type {
  SelectionPick,
  SelectionPickScoreFactor,
  SelectionRunResult,
  SelectionStrategyDefinition
} from "@/lib/selection/types";
import type { StockCandidate } from "@/lib/types";

export async function runMainForceAccumulation(
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
  const warnings = [...pool.warnings, ...refreshWarnings];
  if (!candidates.length) warnings.push("候选池为空，主力吸筹规则无法输出精选结果。");
  if (latest.factPackage.dataSource.status !== "success") {
    warnings.push(`来源报告数据状态为 ${latest.factPackage.dataSource.status}，主力吸筹筛选需要降级解读。`);
  }

  const scored = candidates.map((candidate) => scoreMainForceCandidate(candidate, latest, parameters));
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
    dataBasis: `${pool.dataBasis}；候选股 ${candidates.length} 只；使用资金连续性、股东户数、量价压制、估值容量、公司认知、技术低位、板块匹配和来源留痕进行主力吸筹筛选。`
  };
}

function scoreMainForceCandidate(
  candidate: StockCandidate,
  report: LatestAnalysisReport,
  parameters: Record<string, unknown>
): SelectionPick {
  const maxDayChangePct = numberParam(parameters.maxDayChangePct, 5);
  const excludeDataInsufficient = booleanParam(parameters.excludeDataInsufficient, true);
  const largeCapPolicy = stringParam(parameters.largeCapPolicy, "balanced");
  const sector = report.factPackage.sectors.find((item) => item.name === candidate.sectorName);
  const styleConstraint = largeCapStyleConstraint(candidate, sector, largeCapPolicy);
  const factors: SelectionPickScoreFactor[] = [
    scoreFundFactor(candidate),
    scoreChipFactor(candidate),
    scoreVolumePriceFactor(candidate, maxDayChangePct),
    scoreValuationFactor(candidate),
    scoreFundamentalFactor(candidate),
    scoreTechnicalLowFactor(candidate),
    scoreSectorFactor(sector),
    scoreExternalFactor(candidate)
  ];
  const blockers: string[] = [];
  const reasons: string[] = [];
  const changePct = candidate.quote?.changePct;
  const flow = candidate.fundFlow;

  if (excludeDataInsufficient && candidate.dataCompleteness.level !== "complete") {
    blockers.push(`核心数据完整性为 ${candidate.dataCompleteness.level}，不进入主力吸筹精选。`);
  }
  if (changePct !== undefined && changePct > maxDayChangePct) {
    blockers.push(`当日涨幅 ${changePct.toFixed(2)}% 超过吸筹策略追高上限 ${maxDayChangePct}%。`);
  }
  if ((flow?.mainNetFlow5D ?? flow?.mainNetFlow10D ?? 0) <= 0 && (flow?.mainNetFlow20D ?? 0) <= 0) {
    blockers.push("5/10/20日主力资金没有形成正向吸筹证据。");
  }
  if ((flow?.mainNetFlow20D ?? 0) < 0 && (changePct ?? 0) > maxDayChangePct * 0.7) {
    blockers.push("20日资金为负且股价已有明显表现，疑似反弹透支而非吸筹。");
  }
  if (styleConstraint.blocker) blockers.push(styleConstraint.blocker);
  if (styleConstraint.reason) reasons.push(styleConstraint.reason);

  for (const item of factors) {
    reasons.push(...item.reasons);
    blockers.push(...item.blockers);
  }

  const uniqueBlockers = normalizeSelectionBlockers(blockers, 10);
  const blockerPenalty = calculateSelectionBlockerPenalty(uniqueBlockers, {
    maxPenalty: 45,
    softPenalty: 2,
    hardPatterns: [/核心数据完整性/, /主力资金没有形成正向吸筹证据/, /价格表现已经透支/, /低波动.*金融资产/]
  }) + (styleConstraint.penalty ?? 0);
  const score = Math.max(0, Math.min(100, Math.round(factors.reduce((sum, item) => sum + item.score, 0) - blockerPenalty)));
  const uniqueReasons = uniqueText(reasons, 10);
  const action = decideMainForceAction(score, uniqueBlockers);

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
    evidenceRefs: uniqueText(candidate.evidenceRefs, 12),
    scoreFactors: factors
  };
}

function scoreFundFactor(candidate: StockCandidate): SelectionPickScoreFactor {
  const flow = candidate.fundFlow;
  const quality = candidate.fundFlowQuality;
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];
  if (quality?.score !== undefined) {
    score = Math.min(25, Math.max(0, Math.round(quality.score * 0.25)));
    reasons.push(`资金质量评分 ${quality.score}，状态 ${quality.state}。`);
  }
  if ((flow?.mainNetFlow5D ?? 0) > 0) {
    score = Math.max(score, 16);
    reasons.push("5日主力资金为正。");
  }
  if ((flow?.mainNetFlow10D ?? 0) > 0) score += 3;
  if ((flow?.mainNetFlow20D ?? 0) > 0) score += 3;
  if ((flow?.mainNetFlow ?? 0) < 0 && (flow?.mainNetFlow5D ?? 0) < 0) {
    blockers.push("当日与5日主力资金同步为负。");
  }
  return factor("fund", "资金强度", score, 25, reasons, blockers);
}

function scoreChipFactor(candidate: StockCandidate): SelectionPickScoreFactor {
  const holderChange = candidate.companyKnowledge.shareholderSummary?.holderCountChangePct;
  if (holderChange === undefined) {
    return factor("chip", "筹码集中", 6, 20, [], ["股东户数变化缺失，筹码集中只能低置信处理。"]);
  }
  if (holderChange < -8) return factor("chip", "筹码集中", 18, 20, [`股东户数下降 ${holderChange.toFixed(2)}%，筹码集中证据较强。`], []);
  if (holderChange < -3) return factor("chip", "筹码集中", 14, 20, [`股东户数下降 ${holderChange.toFixed(2)}%。`], []);
  if (holderChange <= 3) return factor("chip", "筹码集中", 9, 20, [`股东户数变化 ${holderChange.toFixed(2)}%，筹码未明显发散。`], []);
  return factor("chip", "筹码集中", 3, 20, [], [`股东户数上升 ${holderChange.toFixed(2)}%，筹码集中证据弱。`]);
}

function scoreVolumePriceFactor(candidate: StockCandidate, maxDayChangePct: number): SelectionPickScoreFactor {
  const changePct = candidate.quote?.changePct ?? 0;
  const amount = candidate.quote?.amount ?? candidate.activity?.basis.amount;
  const flowPositive = (candidate.fundFlow?.mainNetFlow5D ?? candidate.fundFlow?.mainNetFlow10D ?? 0) > 0;
  let score = 6;
  const reasons: string[] = [];
  const blockers: string[] = [];
  if (flowPositive && changePct <= maxDayChangePct) {
    score += 6;
    reasons.push("资金为正但当日涨幅未超过追高阈值，符合压价吸筹观察。");
  }
  if (amount && amount > 300_000_000) {
    score += 3;
    reasons.push("成交额具备基础流动性。");
  }
  if (changePct > maxDayChangePct) blockers.push("价格表现已经透支，不能按吸筹直接追。");
  return factor("volumePrice", "量价背离", score, 15, reasons, blockers);
}

function scoreValuationFactor(candidate: StockCandidate): SelectionPickScoreFactor {
  let score = 4;
  const reasons: string[] = [];
  const blockers: string[] = [];
  if (candidate.quote?.floatMarketValue) {
    score += 3;
    reasons.push("已取得流通市值，可做容量约束。");
  } else {
    blockers.push("流通市值缺失，容量判断受限。");
  }
  if (candidate.quote?.peTtm !== undefined && candidate.quote.peTtm > 0 && candidate.quote.peTtm <= 60) {
    score += 2;
    reasons.push(`PE(TTM) ${candidate.quote.peTtm.toFixed(2)}，未出现极端估值透支。`);
  }
  if (candidate.quote?.pb !== undefined && candidate.quote.pb > 0 && candidate.quote.pb <= 8) {
    score += 1;
    reasons.push(`PB ${candidate.quote.pb.toFixed(2)}，未触发账面估值极端风险。`);
  }
  return factor("valuationSafety", "估值安全", score, 10, reasons, blockers);
}

function scoreFundamentalFactor(candidate: StockCandidate): SelectionPickScoreFactor {
  const knowledge = candidate.companyKnowledge;
  let score = knowledge.companyKnowledgeState === "sufficient" ? 6 : knowledge.companyKnowledgeState === "partial" ? 4 : 1;
  const reasons: string[] = [];
  const blockers: string[] = [];
  if (knowledge.financialTrend === "改善") {
    score += 4;
    reasons.push("财务趋势为改善。");
  } else if (knowledge.financialTrend === "恶化") {
    blockers.push("财务趋势恶化。");
  }
  if (knowledge.longTermLogicAllowed) reasons.push("公司认知允许较完整的中期跟踪。");
  else blockers.push("公司认知不足，不输出长期理由。");
  return factor("fundamental", "基本面托底", score, 10, reasons, blockers);
}

function scoreTechnicalLowFactor(candidate: StockCandidate): SelectionPickScoreFactor {
  const distance = candidate.klineSummary?.maDistance?.ma20;
  let score = 3;
  const reasons: string[] = [];
  const blockers: string[] = [];
  if (candidate.trendState === "reclaim_ma20" || candidate.trendState === "above_ma20") {
    score += 3;
    reasons.push("价格结构在MA20附近或上方。");
  }
  if (distance !== undefined && distance >= -5 && distance <= 12) {
    score += 4;
    reasons.push(`距离MA20为 ${distance.toFixed(2)}%，未明显远离均线。`);
  } else if (distance !== undefined && distance > 18) {
    blockers.push(`距离MA20为 ${distance.toFixed(2)}%，吸筹策略不追高。`);
  }
  return factor("technicalLow", "技术低位", score, 10, reasons, blockers);
}

function scoreSectorFactor(sector: LatestAnalysisReport["factPackage"]["sectors"][number] | undefined): SelectionPickScoreFactor {
  if (!sector) return factor("sector", "板块匹配", 1, 5, [], ["未匹配到当前主线/板块证据，吸筹策略只降权跟踪，不单独剔除。"]);
  if (sector.stage === "确认" || sector.stage === "启动") return factor("sector", "板块匹配", 5, 5, [`所属板块处于${sector.stage}阶段。`], []);
  if (sector.stage === "观察") return factor("sector", "板块匹配", 3, 5, ["所属板块处于观察阶段。"], []);
  return factor("sector", "板块匹配", 1, 5, [], [`所属板块处于${sector.stage}阶段，不适合吸筹策略高置信。`]);
}

function scoreExternalFactor(candidate: StockCandidate): SelectionPickScoreFactor {
  const score = candidate.sourceTraces?.length ? 4 : 2;
  const reasons = candidate.sourceTraces?.length ? ["候选股来源留痕存在。"] : [];
  const blockers = candidate.sourceTraces?.length ? [] : ["外部验证/来源留痕不足。"];
  return factor("external", "外部验证", score, 5, reasons, blockers);
}

function largeCapStyleConstraint(
  candidate: StockCandidate,
  sector: LatestAnalysisReport["factPackage"]["sectors"][number] | undefined,
  policy: string
) {
  const floatMarketValue = candidate.quote?.floatMarketValue;
  const hasSectorSupport = Boolean(sector && (sector.stage === "启动" || sector.stage === "确认" || sector.stage === "加速"));
  const financialLowVol = isLowVolFinancial(candidate);
  if (financialLowVol && policy !== "allow") {
    return {
      blocker: hasSectorSupport
        ? "银行/保险/证券等金融低波动资产虽有板块承接，但默认不占主力吸筹前排。"
        : "银行/保险/证券等金融低波动资产缺少当前主线承接，默认不占主力吸筹前排。",
      penalty: 25
    };
  }
  if (!floatMarketValue) return {};
  const valueYi = floatMarketValue / 100_000_000;
  if (policy === "allow") return { reason: `流通市值约 ${valueYi.toFixed(0)} 亿，当前参数允许大票进入吸筹观察。` };
  if (policy === "avoid_large_cap" && valueYi >= 2000) {
    return { blocker: `流通市值约 ${valueYi.toFixed(0)} 亿，参数设置为主动回避超大市值。`, penalty: 20 };
  }
  if (policy === "balanced" && valueYi >= 5000 && !hasSectorSupport) {
    return { blocker: `流通市值约 ${valueYi.toFixed(0)} 亿且缺少主线/板块承接，平衡约束下降权。`, penalty: 15 };
  }
  if (valueYi >= 2000 && !hasSectorSupport) {
    return { reason: `流通市值约 ${valueYi.toFixed(0)} 亿，缺少主线承接时只适合作为防守型观察。` };
  }
  return { reason: `流通市值约 ${valueYi.toFixed(0)} 亿，未触发超大市值风格约束。` };
}

function decideMainForceAction(score: number, blockers: string[]): SelectionPick["action"] {
  return decideActionByScore({
    score,
    blockers,
    hardPatterns: [/核心数据完整性/, /主力资金没有形成正向吸筹证据/, /价格表现已经透支/, /低波动.*金融资产/, /低波动资产/],
    hardBlockerThreshold: 4,
    focusScore: 75,
    trackScore: 60
  });
}
