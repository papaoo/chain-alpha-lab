import { loadCandidatePool, latestDisplayableReport, refreshCandidatePool, type LatestAnalysisReport } from "@/lib/selection/candidate-pool";
import { buildTradabilityPlan, calculateSelectionBlockerPenalty, decideActionByScore, normalizeSelectionBlockers } from "@/lib/selection/risk-utils";
import { booleanParam, factor, numberParam, splitPassedAndRejected, stringParam, tierFromScore, uniqueText, selectionDataFreshness, selectionRuntimeSnapshot } from "@/lib/selection/scoring-utils";
import type {
  SelectionPick,
  SelectionPickScoreFactor,
  SelectionRunResult,
  SelectionStrategyDefinition
} from "@/lib/selection/types";
import type { SectorRuleResult, StockCandidate } from "@/lib/types";

export async function runSectorRotation(
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
    "板块轮动规则当前复用主线驾驶舱已识别板块，不等于全市场板块扫描；缺少板块归属证据的股票不会进入精选。"
  ];
  if (!candidates.length) warnings.push("候选池为空，板块轮动规则无法输出精选结果。");
  if (latest.factPackage.dataSource.status !== "success") {
    warnings.push(`来源报告数据状态为 ${latest.factPackage.dataSource.status}，板块轮动信号需要降级解读。`);
  }

  const scored = candidates.map((candidate) => scoreSectorRotationCandidate(candidate, latest, parameters));
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
    dataBasis: `${pool.dataBasis}；候选股 ${candidates.length} 只；使用板块阶段、板块资金/宽度、核心股结构、个股角色、个股资金、活跃度和风险约束进行板块轮动筛选。`
  };
}

function scoreSectorRotationCandidate(
  candidate: StockCandidate,
  report: LatestAnalysisReport,
  parameters: Record<string, unknown>
): SelectionPick {
  const maxDayChangePct = numberParam(parameters.maxDayChangePct, 7);
  const excludeDataInsufficient = booleanParam(parameters.excludeDataInsufficient, true);
  const sector = findCandidateSector(candidate, report);
  const tradabilityPlan = buildTradabilityPlan(candidate);
  const factors: SelectionPickScoreFactor[] = [
    scoreSectorStrength(sector),
    scoreSectorFund(sector),
    scoreStockRole(candidate, sector),
    scoreStockFund(candidate),
    scoreRotationVolumePrice(candidate),
    scoreCatalystEvidence(candidate),
    scoreRotationRisk(candidate, sector, maxDayChangePct)
  ];

  const blockers: string[] = [];
  const reasons: string[] = [];
  const changePct = candidate.quote?.changePct;
  if (excludeDataInsufficient && candidate.dataCompleteness.level === "insufficient") {
    blockers.push(`核心数据完整性为 ${candidate.dataCompleteness.level}，板块轮动不能给出有效精选。`);
  }
  if (!sector) blockers.push("缺少可识别板块归属，不能纳入板块轮动策略。");
  if (sector?.stage === "退潮") blockers.push("所属板块处于退潮阶段，板块轮动策略剔除。");
  if (candidate.companyKnowledge.themeMatch === "weak" || candidate.mainlineAttribution?.status === "mismatch") {
    blockers.push("公司主营或成分股证据与当前板块不匹配，不能按板块轮动推荐。");
  }
  if (changePct !== undefined && changePct > maxDayChangePct) {
    blockers.push(`当日涨幅 ${changePct.toFixed(2)}% 超过轮动追高上限 ${maxDayChangePct}%，不追后排加速。`);
  }
  if (sector?.stage === "加速" && candidate.role !== "龙头" && candidate.role !== "中军") {
    blockers.push("板块加速阶段只保留龙头/中军，后排补涨不进入精选。");
  }
  if (candidate.fundFlowState === "outflow" || candidate.fundFlowQuality?.state === "持续流出") {
    blockers.push("个股资金持续流出，无法承接板块轮动。");
  }
  if (tradabilityPlan.blocker) blockers.push(tradabilityPlan.blocker);
  if (tradabilityPlan.reason) reasons.push(tradabilityPlan.reason);

  for (const item of factors) {
    reasons.push(...item.reasons);
    blockers.push(...item.blockers);
  }

  const uniqueBlockers = normalizeSelectionBlockers(blockers, 10);
  const blockerPenalty = calculateSelectionBlockerPenalty(uniqueBlockers, {
    maxPenalty: 55,
    softPenalty: 2,
    hardPatterns: [/缺少可识别板块归属/, /所属板块处于退潮/, /主营或成分股证据.*不匹配/, /个股资金持续流出/]
  });
  const score = Math.max(0, Math.min(100, Math.round(factors.reduce((sum, item) => sum + item.score, 0) - blockerPenalty)));
  const uniqueReasons = uniqueText(reasons, 10);
  const action = decideSectorRotationAction(score, uniqueBlockers, tradabilityPlan.isNextSessionOnly);

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
    evidenceRefs: buildEvidenceRefs(candidate, sector),
    scoreFactors: factors
  };
}

function findCandidateSector(candidate: StockCandidate, report: LatestAnalysisReport) {
  const names = uniqueText(
    [
      candidate.mainlineAttribution?.matchedSector,
      candidate.mainlineAttribution?.membershipSector,
      candidate.mainlineAttribution?.normalizedMembershipSector,
      candidate.companyKnowledge.themeMatchType === "direct_constituent" ? candidate.sectorName : "",
      candidate.sectorName
    ],
    8
  );
  return report.factPackage.sectors.find((sector) =>
    names.some((name) =>
      name === sector.name ||
      name === sector.normalizedName ||
      sector.sourceNames?.includes(name) ||
      sector.normalizedName === candidate.mainlineAttribution?.matchedSector
    )
  );
}

function scoreSectorStrength(sector?: SectorRuleResult) {
  if (!sector) return factor("sectorStrength", "板块强度", 0, 25, [], ["缺少板块阶段和强度评分。"]);
  let score = Math.round((sector.score / 100) * 8);
  const reasons: string[] = [`板块规则总分 ${sector.score}/100。`];
  const blockers: string[] = [];
  if (sector.stage === "确认") {
    score += 9;
    reasons.push("板块处于确认阶段，轮动承接质量较好。");
  } else if (sector.stage === "启动") {
    score += 7;
    reasons.push("板块处于启动阶段，适合观察资金切换。");
  } else if (sector.stage === "加速") {
    score += 6;
    reasons.push("板块处于加速阶段，只看核心承接。");
  } else if (sector.stage === "分歧") {
    score += 3;
    blockers.push("板块分歧阶段，需要核心股修复确认。");
  } else if (sector.stage === "退潮") {
    blockers.push("板块退潮，轮动信号无效。");
  } else {
    score += 2;
    blockers.push("板块仍在观察阶段，轮动证据不足。");
  }
  if (sector.lineQuality === "核心主线" || sector.lineQuality === "确认主线") score += 4;
  if (sector.coreContinuity?.score !== undefined && sector.coreContinuity.score >= 70) {
    score += 4;
    reasons.push(`核心股连续性 ${sector.coreContinuity.state}，${sector.coreContinuity.reason}`);
  }
  return factor("sectorStrength", "板块强度", score, 25, reasons, blockers);
}

function scoreSectorFund(sector?: SectorRuleResult) {
  if (!sector) return factor("sectorFund", "板块资金", 0, 20, [], ["缺少板块资金评分。"]);
  let score = Math.round((sector.fundingScore / 25) * 14);
  const reasons = [`板块资金评分 ${sector.fundingScore}/25，宽度评分 ${sector.breadthScore}/20。`];
  const blockers: string[] = [];
  if (sector.fundingScore >= 14) {
    score += 4;
    reasons.push("板块资金达到确认级别。");
  } else if (sector.fundingScore <= 5) {
    blockers.push("板块资金评分偏弱，轮动持续性不足。");
  }
  if (sector.breadthScore >= 12) {
    score += 2;
    reasons.push("板块内部扩散尚可。");
  } else {
    blockers.push("板块内部扩散不足，容易只有少数核心抱团。");
  }
  return factor("sectorFund", "板块资金", score, 20, reasons, blockers);
}

function scoreStockRole(candidate: StockCandidate, sector?: SectorRuleResult) {
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];
  if (candidate.role === "龙头") {
    score = 15;
    reasons.push("个股定位为龙头，优先承接板块轮动。");
  } else if (candidate.role === "中军") {
    score = 13;
    reasons.push("个股定位为中军，适合观察板块持续性。");
  } else if (candidate.role === "补涨") {
    score = sector?.stage === "启动" || sector?.stage === "确认" ? 8 : 4;
    blockers.push("补涨股只在启动/确认阶段观察，分歧或加速阶段降级。");
  } else if (candidate.role === "低吸观察") {
    score = 5;
    blockers.push("低吸观察股不是轮动前排，只能等待板块确认。");
  } else {
    blockers.push("缺少个股在板块中的角色定位。");
  }
  return factor("role", "个股地位", score, 15, reasons, blockers);
}

function scoreStockFund(candidate: StockCandidate) {
  const quality = candidate.fundFlowQuality;
  const flow = candidate.fundFlow;
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];
  if (quality?.score !== undefined) {
    score = Math.round(quality.score * 0.15);
    reasons.push(`个股资金质量 ${quality.state}/${quality.score}。`);
  }
  if ((flow?.mainNetFlow5D ?? 0) > 0 || (flow?.mainNetFlow20D ?? 0) > 0) {
    score = Math.max(score, 11);
    reasons.push("5日或20日主力资金为正，存在资金承接。");
  }
  if (candidate.fundFlowState === "outflow" || quality?.state === "持续流出") {
    blockers.push("个股资金持续流出。");
  }
  return factor("stockFund", "个股资金", score, 15, reasons, blockers);
}

function scoreRotationVolumePrice(candidate: StockCandidate) {
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];
  if (candidate.activity?.status === "强") {
    score += 5;
    reasons.push("成交活跃度强，具备轮动承接基础。");
  } else if (candidate.activity?.status === "中") {
    score += 3;
    reasons.push("成交活跃度中等，可继续观察。");
  } else {
    blockers.push("成交活跃度弱或缺失。");
  }
  if (candidate.trendState === "above_ma20" || candidate.trendState === "reclaim_ma20") {
    score += 4;
    reasons.push("价格结构站上或收复 MA20。");
  } else {
    blockers.push("价格结构未修复到 MA20 上方。");
  }
  const ma20Distance = candidate.klineSummary?.maDistance?.ma20;
  if (ma20Distance !== undefined && ma20Distance <= 12) score += 1;
  if (ma20Distance !== undefined && ma20Distance > 18) blockers.push("股价明显远离 MA20，轮动追高风险高。");
  return factor("volumePrice", "量价匹配", score, 10, reasons, blockers);
}

function scoreCatalystEvidence(candidate: StockCandidate) {
  const reasons: string[] = [];
  const blockers: string[] = [];
  let score = 0;
  if (candidate.sourceTraces?.length) {
    score += 3;
    reasons.push("存在数据来源留痕，可追溯候选来源。");
  }
  if (candidate.companyKnowledge.themeMatch === "strong") {
    score += 4;
    reasons.push("公司认知与板块主题匹配度强。");
  } else if (candidate.companyKnowledge.themeMatch === "medium") {
    score += 2;
    reasons.push("公司认知与板块主题存在中等匹配。");
  } else {
    blockers.push("公司认知与板块主题匹配证据不足。");
  }
  blockers.push("新闻/政策催化尚未接入结构化数据，只能低权重处理。");
  return factor("catalyst", "新闻政策", score, 10, reasons, blockers);
}

function scoreRotationRisk(candidate: StockCandidate, sector: SectorRuleResult | undefined, maxDayChangePct: number) {
  let score = 5;
  const reasons: string[] = [];
  const blockers: string[] = [];
  const changePct = candidate.quote?.changePct;
  if (changePct !== undefined && changePct > maxDayChangePct) {
    score -= 3;
    reasons.push("当日涨幅超过轮动追高上限，风险分扣减；具体追高约束见顶层阻断。");
  }
  if (sector?.stage === "退潮") {
    score = 0;
    blockers.push("板块退潮风险。");
  }
  if (candidate.tradability?.status === "涨停不可达" || candidate.tradability?.status === "接近涨停") {
    score -= 1;
    reasons.push("涨停/近涨停只记录轮动强度，当日不追，转入次日承接观察。");
  }
  if (!blockers.length) reasons.push("未触发主要轮动追高、退潮或不可达风险。");
  return factor("riskPenalty", "风险惩罚", score, 5, reasons, blockers);
}

function decideSectorRotationAction(score: number, blockers: string[], nextSessionOnly: boolean): SelectionPick["action"] {
  return decideActionByScore({
    score,
    blockers,
    nextSessionOnly,
    hardPatterns: [/缺少可识别板块归属/, /板块退潮/, /所属板块处于退潮/, /主营或成分股证据.*不匹配/, /个股资金持续流出/],
    hardBlockerThreshold: 3,
    focusScore: 78,
    trackScore: 62
  });
}

function buildEvidenceRefs(candidate: StockCandidate, sector?: SectorRuleResult) {
  return uniqueText(
    [
      ...candidate.evidenceRefs,
      sector ? `rule.sector.${sector.name}.stage` : "",
      sector ? `rule.sector.${sector.name}.funding` : "",
      `rule.stock.${candidate.code}.mainline_attribution`,
      `rule.stock.${candidate.code}.role`,
      `stock.${candidate.code}.fund.quality`,
      `rule.stock.${candidate.code}.activity`
    ],
    12
  );
}
