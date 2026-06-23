import { loadCandidatePool, latestDisplayableReport, refreshCandidatePool, type LatestAnalysisReport } from "@/lib/selection/candidate-pool";
import { calculateSelectionBlockerPenalty, decideActionByScore, hasSelectionHardBlock, normalizeSelectionBlockers } from "@/lib/selection/risk-utils";
import { factor, booleanParam, numberParam, splitPassedAndRejected, stringParam, tierFromScore, uniqueText, selectionDataFreshness, selectionRuntimeSnapshot } from "@/lib/selection/scoring-utils";
import { financialEvidenceRefs, formatYi, growthAtLeast, isLargeCap, isLowVolFinancial } from "@/lib/selection/strategy-financial-utils";
import type {
  SelectionPick,
  SelectionPickScoreFactor,
  SelectionRunResult,
  SelectionStrategyDefinition
} from "@/lib/selection/types";
import type { SectorRuleResult, StockCandidate } from "@/lib/types";

export async function runGrowthPotential(
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
    "成长潜力规则会容忍一定估值溢价，但高估值必须由营收/利润增速、毛利/ROE质量、行业景气或资金关注共同支撑；缺少财务增长证据时不会硬凑精选。"
  ];
  if (!candidates.length) warnings.push("候选池为空，成长潜力规则无法输出精选结果。");
  if (latest.factPackage.dataSource.status !== "success") {
    warnings.push(`来源报告数据状态为 ${latest.factPackage.dataSource.status}，成长潜力筛选需要降级解读。`);
  }

  const scored = candidates.map((candidate) => scoreGrowthCandidate(candidate, latest, parameters));
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
    dataBasis: `${pool.dataBasis}；候选股 ${candidates.length} 只；使用营收/利润增速、毛利率和ROE、行业景气、公司产业链位置、资金关注、技术位置与估值泡沫风险进行成长潜力筛选。`
  };
}

function scoreGrowthCandidate(
  candidate: StockCandidate,
  report: LatestAnalysisReport,
  parameters: Record<string, unknown>
): SelectionPick {
  const maxDayChangePct = numberParam(parameters.maxDayChangePct, 6);
  const excludeDataInsufficient = booleanParam(parameters.excludeDataInsufficient, true);
  const sector = findCandidateSector(candidate, report);
  const factors: SelectionPickScoreFactor[] = [
    scoreRevenueGrowth(candidate),
    scoreProfitGrowth(candidate),
    scoreQuality(candidate),
    scoreIndustryCycle(candidate, sector),
    scoreResearchAndChain(candidate),
    scoreFundAttention(candidate),
    scoreTechnicalPosition(candidate),
    scoreGrowthRiskPenalty(candidate)
  ];
  const blockers: string[] = [];
  const reasons: string[] = [];
  const financial = candidate.companyKnowledge.financialSummary;
  const changePct = candidate.quote?.changePct;
  const priceChasing = changePct !== undefined && changePct > maxDayChangePct;

  if (excludeDataInsufficient && candidate.dataCompleteness.level === "insufficient") {
    blockers.push(`核心数据完整性为 ${candidate.dataCompleteness.level}，成长策略不能给出有效精选。`);
  }
  if (!financial) blockers.push("缺少财务摘要，无法验证成长性。");
  if (isLowVolFinancial(candidate)) {
    blockers.push("银行/保险/券商等低波动金融资产不进入成长潜力前排，更适合价值稳健或低风险收益策略。");
  }
  if (!growthAtLeast(financial?.revenueChangePct, 5) && !growthAtLeast(financial?.netProfitChangePct, 8)) {
    blockers.push("营收增速和净利润增速均未达到成长策略最低证据。");
  }
  if (candidate.companyKnowledge.financialTrend === "恶化") blockers.push("财务趋势恶化，成长逻辑需要剔除。");
  if (priceChasing) {
    blockers.push(`当日涨幅 ${changePct.toFixed(2)}% 超过成长策略追高上限 ${maxDayChangePct}%。`);
  }
  const pe = candidate.quote?.peTtm;
  const pb = candidate.quote?.pb;
  if (pe !== undefined && pe > 80 && !growthAtLeast(financial?.netProfitChangePct, 25)) {
    blockers.push(`PE(TTM) ${pe.toFixed(2)} 偏高，但净利润增速不足以解释估值溢价。`);
  }
  if (pb !== undefined && pb > 12 && !growthAtLeast(financial?.revenueChangePct, 25)) {
    blockers.push(`PB ${pb.toFixed(2)} 偏高，但营收增速不足以解释账面溢价。`);
  }

  for (const item of factors) {
    reasons.push(...item.reasons);
    blockers.push(...item.blockers);
  }

  const uniqueBlockers = normalizeSelectionBlockers(blockers, 10);
  const blockerPenalty = calculateSelectionBlockerPenalty(uniqueBlockers, {
    maxPenalty: 60,
    hardPatterns: [/低波动金融资产/, /缺少财务摘要/, /均未达到成长策略最低证据/, /财务趋势恶化/, /退潮阶段/, /估值溢价/]
  });
  let score = Math.max(0, Math.min(100, Math.round(factors.reduce((sum, item) => sum + item.score, 0) - blockerPenalty)));
  if (priceChasing) {
    score = Math.min(score, 61);
    reasons.push("成长股涨幅超过追高上限时，只保留条件等待，不升级为跟踪或重点观察。");
  }
  const uniqueReasons = uniqueText(reasons, 10);
  const action = decideGrowthAction(score, uniqueBlockers);

  return {
    code: candidate.code,
    name: candidate.name,
    sectorName: sector?.name ?? candidate.sectorName,
    price: candidate.price ?? candidate.quote?.latest,
    changePct,
    dataFreshness: selectionDataFreshness(candidate),
    runtimeSnapshot: selectionRuntimeSnapshot(candidate),
    score,
    tier: tierFromScore(score),
    action,
    reasons: uniqueReasons,
    blockers: uniqueBlockers,
    evidenceRefs: financialEvidenceRefs(candidate, sector ? [`rule.sector.${sector.name}.stage`] : []),
    scoreFactors: factors
  };
}

function findCandidateSector(candidate: StockCandidate, report: LatestAnalysisReport) {
  const names = uniqueText(
    [
      candidate.mainlineAttribution?.matchedSector,
      candidate.mainlineAttribution?.membershipSector,
      candidate.companyKnowledge.themeMatchType === "direct_constituent" ? candidate.sectorName : "",
      candidate.sectorName
    ],
    8
  );
  return report.factPackage.sectors.find((sector) =>
    names.some((name) => name === sector.name || name === sector.normalizedName || sector.sourceNames?.includes(name))
  );
}

function scoreRevenueGrowth(candidate: StockCandidate) {
  const growth = candidate.companyKnowledge.financialSummary?.revenueChangePct;
  if (growth === undefined) return factor("revenueGrowth", "营收增长", 0, 20, [], ["缺少营收增速。"]);
  if (growth >= 30) return factor("revenueGrowth", "营收增长", 20, 20, [`营收增速 ${growth.toFixed(1)}%，成长弹性强。`], []);
  if (growth >= 15) return factor("revenueGrowth", "营收增长", 15, 20, [`营收增速 ${growth.toFixed(1)}%，具备成长性。`], []);
  if (growth >= 5) return factor("revenueGrowth", "营收增长", 9, 20, [`营收增速 ${growth.toFixed(1)}%，处于低速成长观察区。`], []);
  return factor("revenueGrowth", "营收增长", 2, 20, [], [`营收增速 ${growth.toFixed(1)}%，成长证据偏弱。`]);
}

function scoreProfitGrowth(candidate: StockCandidate) {
  const growth = candidate.companyKnowledge.financialSummary?.netProfitChangePct;
  if (growth === undefined) return factor("profitGrowth", "净利增长", 0, 20, [], ["缺少净利润增速。"]);
  if (growth >= 40) return factor("profitGrowth", "净利增长", 20, 20, [`净利润增速 ${growth.toFixed(1)}%，利润弹性强。`], []);
  if (growth >= 20) return factor("profitGrowth", "净利增长", 15, 20, [`净利润增速 ${growth.toFixed(1)}%，利润端有改善。`], []);
  if (growth >= 8) return factor("profitGrowth", "净利增长", 9, 20, [`净利润增速 ${growth.toFixed(1)}%，达到成长策略下限。`], []);
  return factor("profitGrowth", "净利增长", 2, 20, [], [`净利润增速 ${growth.toFixed(1)}%，利润成长不足。`]);
}

function scoreQuality(candidate: StockCandidate) {
  const financial = candidate.companyKnowledge.financialSummary;
  if (!financial) return factor("quality", "毛利率和ROE", 0, 15, [], ["缺少财务质量字段。"]);
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];
  if ((financial.grossMarginPct ?? 0) >= 25) {
    score += 5;
    reasons.push(`毛利率 ${financial.grossMarginPct?.toFixed(1)}%，商业质量尚可。`);
  } else {
    blockers.push("毛利率偏低或缺失，成长质量不足。");
  }
  if ((financial.grossMarginChangePct ?? 0) >= 0) {
    score += 3;
    reasons.push("毛利率没有继续恶化。");
  } else if ((financial.grossMarginChangePct ?? 0) < -3) {
    blockers.push("毛利率下滑明显，可能是低质量增长。");
  }
  if ((financial.roePct ?? 0) >= 8) {
    score += 5;
    reasons.push(`ROE ${financial.roePct?.toFixed(1)}%，增长具备一定效率。`);
  } else {
    blockers.push("ROE 偏低或缺失。");
  }
  if ((financial.operatingCashFlow ?? 0) > 0) score += 2;
  else blockers.push("经营现金流缺失或为负，成长质量需要降级。");
  return factor("quality", "毛利率和ROE", score, 15, reasons, blockers);
}

function scoreIndustryCycle(candidate: StockCandidate, sector?: SectorRuleResult) {
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];
  if (sector?.stage === "确认" || sector?.stage === "启动") {
    score += 9;
    reasons.push(`所属板块处于${sector.stage}阶段，行业景气/资金关注具备基础。`);
  } else if (sector?.stage === "加速") {
    score += 7;
    reasons.push("所属板块处于加速阶段，成长逻辑强但追高风险上升。");
    blockers.push("板块加速阶段需要等待分歧后的承接确认。");
  } else if (sector?.stage === "分歧") {
    score += 4;
    blockers.push("板块处于分歧阶段，成长股需要核心结构修复。");
  } else if (sector?.stage === "退潮") {
    blockers.push("板块处于退潮阶段，成长策略剔除。");
  } else {
    blockers.push("缺少有效行业景气或主线阶段证据。");
  }
  if (sector?.lineQuality === "核心主线" || sector?.lineQuality === "确认主线") score += 4;
  if (candidate.companyKnowledge.themeMatch === "strong" || candidate.companyKnowledge.themeMatch === "medium") score += 2;
  return factor("industryCycle", "行业景气", score, 15, reasons, blockers);
}

function scoreResearchAndChain(candidate: StockCandidate) {
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];
  const chain = candidate.companyKnowledge.industryChainPosition;
  if (chain !== "unknown") {
    score += 4;
    reasons.push(`产业链位置为${chain}，公司认知可用于解释成长逻辑。`);
  } else {
    blockers.push("产业链位置缺失，成长逻辑解释力不足。");
  }
  if (candidate.companyKnowledge.themeMatch === "strong") {
    score += 4;
    reasons.push("公司与主线存在成分股或强匹配证据。");
  } else if (candidate.companyKnowledge.themeMatch === "medium") {
    score += 3;
    reasons.push("公司主营与主线存在业务匹配证据。");
  } else {
    blockers.push("公司主营与当前成长主题匹配较弱。");
  }
  if (candidate.companyKnowledge.productsOrServices.length) score += 2;
  return factor("research", "研发产品", score, 10, reasons, blockers);
}

function scoreFundAttention(candidate: StockCandidate) {
  const quality = candidate.fundFlowQuality;
  const flow = candidate.fundFlow;
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];
  if (quality?.state === "强流入" || quality?.state === "温和流入") {
    score += 6;
    reasons.push(`资金质量 ${quality.state}/${quality.score}，资金关注较好。`);
  } else if (quality?.state === "弱修复" || quality?.state === "分歧") {
    score += 3;
    reasons.push(`资金质量 ${quality.state}，只作为观察。`);
  } else {
    blockers.push("资金关注不足或持续流出。");
  }
  if ((flow?.mainNetFlow20D ?? 0) > 0) score += 3;
  if ((flow?.mainNetFlow5D ?? 0) > 0) score += 1;
  return factor("fund", "资金关注", score, 10, reasons, blockers);
}

function scoreTechnicalPosition(candidate: StockCandidate) {
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];
  if (candidate.trendState === "above_ma20" || candidate.trendState === "reclaim_ma20") {
    score += 2;
    reasons.push("价格结构已站上或收复 MA20。");
  } else {
    blockers.push("技术结构未修复到 MA20 上方。");
  }
  const ma20Distance = candidate.klineSummary?.maDistance?.ma20;
  if (ma20Distance !== undefined && ma20Distance <= 18) score += 2;
  if (ma20Distance !== undefined && ma20Distance > 25) blockers.push("股价远离 MA20，成长策略不追高。");
  if (!isLargeCap(candidate, 3000)) score += 1;
  else blockers.push(`流通市值约 ${formatYi(candidate.quote?.floatMarketValue)}，成长弹性可能弱于中小市值标的。`);
  return factor("technical", "技术位置", score, 5, reasons, blockers);
}

function scoreGrowthRiskPenalty(candidate: StockCandidate) {
  let score = 5;
  const reasons: string[] = [];
  const blockers: string[] = [];
  const financial = candidate.companyKnowledge.financialSummary;
  const pe = candidate.quote?.peTtm;
  const pb = candidate.quote?.pb;
  if (pe !== undefined && pe > 100) {
    score -= 2;
    blockers.push("PE 超过 100，估值泡沫风险高。");
  }
  if (pb !== undefined && pb > 15) {
    score -= 2;
    blockers.push("PB 超过 15，账面溢价风险高。");
  }
  if ((financial?.operatingCashFlow ?? 0) < 0 && (financial?.netProfit ?? 0) > 0) {
    score -= 2;
    blockers.push("盈利为正但经营现金流为负，可能存在利润质量风险。");
  }
  if (!blockers.length) reasons.push("未触发主要成长泡沫或利润质量惩罚。");
  return factor("riskPenalty", "风险惩罚", score, 5, reasons, blockers);
}

function decideGrowthAction(score: number, blockers: string[]): SelectionPick["action"] {
  const hardPatterns = [/低波动金融资产/, /缺少财务摘要/, /均未达到成长策略最低证据/, /财务趋势恶化/, /退潮阶段/, /估值溢价/];
  if (hasSelectionHardBlock(blockers, hardPatterns)) return "剔除";
  if (blockers.some((item) => /缺少有效行业景气|公司主营与当前成长主题匹配较弱/.test(item))) {
    return score >= 45 ? "条件等待" : "剔除";
  }
  return decideActionByScore({
    score,
    blockers,
    hardPatterns,
    hardBlockerThreshold: 5,
    focusScore: 78,
    trackScore: 62
  });
}
