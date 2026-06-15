import type { SelectionStrategyId } from "@/lib/selection/types";
import type { SectorRuleResult, StockCandidate } from "@/lib/types";

export type CandidatePoolMode = "latest_report" | "recent_signals" | "strategy_adaptive" | "full_a_scan" | "hybrid_full_a";

export interface CandidatePoolSourceStats {
  latestReportCount: number;
  recentSnapshotCount: number;
  fullAScanCount: number;
  duplicateCount: number;
  staleSkippedCount: number;
  parseErrorCount: number;
  rankedMode: CandidatePoolMode;
}

export interface CandidatePoolBuildInput {
  latestCandidates: StockCandidate[];
  recentCandidates: StockCandidate[];
  fullACandidates?: StockCandidate[];
  sectors: SectorRuleResult[];
  strategyId?: SelectionStrategyId;
  poolMode: CandidatePoolMode;
  candidatePoolLimit: number;
  staleSkippedCount: number;
  parseErrorCount: number;
}

interface CandidatePoolItem {
  candidate: StockCandidate;
  source: "latest" | "recent" | "full_a";
  sourceRank: number;
}

const MAINLINE_STAGES = new Set(["启动", "确认", "加速"]);
const STRONG_ROLES = new Set(["龙头", "中军"]);
const STRONG_TIERS = new Set(["S", "A"]);
const POSITIVE_TRENDS = new Set(["above_ma20", "reclaim_ma20"]);
const NEGATIVE_TRENDS = new Set(["downtrend", "below_ma20"]);
const POOR_TRADABILITY = new Set(["涨停不可达", "接近涨停", "高位拉升"]);

export function normalizeCandidatePoolMode(value: string): CandidatePoolMode {
  if (value === "latest_report" || value === "strategy_adaptive" || value === "full_a_scan" || value === "hybrid_full_a") return value;
  return "recent_signals";
}

export function buildCandidatePool(input: CandidatePoolBuildInput) {
  const byCode = new Map<string, CandidatePoolItem>();
  let duplicateCount = 0;

  const useLatest = input.poolMode !== "full_a_scan";
  const useRecent = input.poolMode !== "latest_report" && input.poolMode !== "full_a_scan";
  const useFullA = input.poolMode === "full_a_scan" || input.poolMode === "hybrid_full_a";

  if (useLatest) {
    input.latestCandidates.forEach((candidate, index) => {
      byCode.set(candidate.code, { candidate, source: "latest", sourceRank: index });
    });
  }

  if (useRecent) {
    for (const [index, candidate] of input.recentCandidates.entries()) {
      if (byCode.has(candidate.code)) {
        duplicateCount += 1;
        continue;
      }
      byCode.set(candidate.code, {
        candidate,
        source: "recent",
        sourceRank: input.latestCandidates.length + index
      });
    }
  }

  if (useFullA) {
    const offset = input.latestCandidates.length + input.recentCandidates.length;
    for (const [index, candidate] of (input.fullACandidates ?? []).entries()) {
      if (byCode.has(candidate.code)) {
        duplicateCount += 1;
        continue;
      }
      byCode.set(candidate.code, {
        candidate,
        source: "full_a",
        sourceRank: offset + index
      });
    }
  }

  const items = Array.from(byCode.values());
  const ranked = rankCandidatePoolItems(items, input.strategyId, input.sectors, input.poolMode);
  const candidates = ranked.slice(0, input.candidatePoolLimit).map((item) => item.candidate);
  const stats: CandidatePoolSourceStats = {
    latestReportCount: input.latestCandidates.length,
    recentSnapshotCount: input.recentCandidates.length,
    fullAScanCount: input.fullACandidates?.length ?? 0,
    duplicateCount,
    staleSkippedCount: input.staleSkippedCount,
    parseErrorCount: input.parseErrorCount,
    rankedMode: input.poolMode
  };

  return { candidates, stats };
}

export function buildCandidatePoolWarnings(stats: CandidatePoolSourceStats, strategyId?: SelectionStrategyId) {
  const warnings = [
    stats.rankedMode === "latest_report"
      ? ""
      : stats.rankedMode === "full_a_scan"
        ? "候选池使用东方财富全 A 最新行情轻量初扫；最终评分前只刷新入池前排股票的 K线、技术、资金流和公司概况，未刷新股票不进入本轮输出。"
        : stats.rankedMode === "hybrid_full_a"
          ? "候选池合并最新报告、最近信号沉淀和东方财富全 A 初扫；最终评分前只刷新入池前排股票的 K线、技术、资金流和公司概况。"
          : "候选池预筛会合并最近信号沉淀数据；最终评分前会按 refreshBeforeRun/refreshLimit 刷新入池前排股票的最新盘口、K线、技术和资金流。",
    stats.rankedMode === "strategy_adaptive"
      ? `候选池已按 ${selectionStrategyLabel(strategyId)} 做策略自适应预排序，预排序只改变入池顺序，不替代最终评分和风控。`
      : "",
    stats.staleSkippedCount ? `已过滤 ${stats.staleSkippedCount} 条超过 21 天的历史信号。` : "",
    stats.parseErrorCount ? `有 ${stats.parseErrorCount} 条历史信号解析失败，已跳过。` : "",
    stats.duplicateCount ? `最新报告与历史信号重复 ${stats.duplicateCount} 只，已按股票代码去重。` : ""
  ].filter(Boolean);
  return Array.from(new Set(warnings));
}

export function buildCandidatePoolDataBasis(reportId: string, stats: CandidatePoolSourceStats, selectedCount: number, strategyId?: SelectionStrategyId) {
  if (stats.rankedMode === "latest_report") {
    return `最新可展示分析报告 ${reportId}；最新报告候选 ${stats.latestReportCount} 只，入池 ${selectedCount} 只`;
  }
  if (stats.rankedMode === "full_a_scan") {
    return `东方财富全 A 最新行情扫描；全 A 初筛 ${stats.fullAScanCount} 只，入池 ${selectedCount} 只；后续仅对刷新成功的前排股票做正式评分`;
  }
  const label = stats.rankedMode === "strategy_adaptive" ? `；按 ${selectionStrategyLabel(strategyId)} 做策略自适应预排序` : "";
  const fullALabel = stats.rankedMode === "hybrid_full_a" ? `，全 A 初筛 ${stats.fullAScanCount} 只` : "";
  return `最新报告 ${reportId} + 最近 21 天已保存 stock_signal_snapshots${fullALabel}；最新报告候选 ${stats.latestReportCount} 只，历史沉淀 ${stats.recentSnapshotCount} 只，去重 ${stats.duplicateCount} 只，入池 ${selectedCount} 只${label}`;
}

function rankCandidatePoolItems(
  items: CandidatePoolItem[],
  strategyId: SelectionStrategyId | undefined,
  sectors: SectorRuleResult[],
  poolMode: CandidatePoolMode
) {
  if (poolMode !== "strategy_adaptive" || !strategyId) {
    return items.sort((a, b) => a.sourceRank - b.sourceRank);
  }
  return items
    .map((item) => ({ item, score: scoreCandidateForPool(item.candidate, strategyId, sectors, item.source) }))
    .sort((a, b) => b.score - a.score || a.item.sourceRank - b.item.sourceRank)
    .map((entry) => entry.item);
}

function scoreCandidateForPool(
  candidate: StockCandidate,
  strategyId: SelectionStrategyId,
  sectors: SectorRuleResult[],
  source: CandidatePoolItem["source"]
) {
  const common = scoreCommonPoolQuality(candidate, sectors, source);
  if (strategyId === "short_term_breakout") return common + scoreBreakoutPoolFit(candidate, sectors);
  if (strategyId === "sector_rotation") return common + scoreSectorRotationPoolFit(candidate, sectors);
  if (strategyId === "main_force_accumulation") return common + scoreMainForcePoolFit(candidate);
  if (strategyId === "value_stable") return common + scoreValueStablePoolFit(candidate);
  if (strategyId === "growth_potential") return common + scoreGrowthPoolFit(candidate, sectors);
  if (strategyId === "low_risk_return") return common + scoreLowRiskPoolFit(candidate);
  return common;
}

function scoreCommonPoolQuality(candidate: StockCandidate, sectors: SectorRuleResult[], source: CandidatePoolItem["source"]) {
  let score = source === "latest" ? 10 : 0;
  const sector = findCandidateSector(candidate, sectors);
  if (candidate.dataCompleteness.level === "complete") score += 14;
  else if (candidate.dataCompleteness.level === "partial") score += 7;
  else score -= 8;

  if (STRONG_TIERS.has(candidate.signalTier ?? "D")) score += 8;
  else if (candidate.signalTier === "B") score += 4;
  if ((candidate.strengthScore ?? candidate.signalScore ?? 0) >= 70) score += 6;
  if (POSITIVE_TRENDS.has(candidate.trendState)) score += 7;
  if (NEGATIVE_TRENDS.has(candidate.trendState)) score -= 5;
  if (candidate.fundFlowQuality?.score !== undefined) score += Math.round(candidate.fundFlowQuality.score * 0.08);
  if (candidate.fundFlowQuality?.state === "持续流出" || candidate.fundFlowState === "outflow") score -= 12;
  if (candidate.activity?.status === "强") score += 5;
  else if (candidate.activity?.status === "中") score += 3;
  if (sector && MAINLINE_STAGES.has(sector.stage)) score += 6;
  if (POOR_TRADABILITY.has(candidate.tradability?.status ?? "未知")) score -= 4;
  return score;
}

function scoreBreakoutPoolFit(candidate: StockCandidate, sectors: SectorRuleResult[]) {
  let score = 0;
  const sector = findCandidateSector(candidate, sectors);
  const ma20 = candidate.klineSummary?.maDistance?.ma20;
  const changePct = candidate.quote?.changePct;
  if (candidate.trendState === "above_ma20") score += 12;
  if (candidate.trendState === "reclaim_ma20") score += 10;
  if (ma20 !== undefined && ma20 >= -2 && ma20 <= 10) score += 8;
  if (ma20 !== undefined && ma20 > 18) score -= 14;
  if (candidate.technical?.macdDif !== undefined && candidate.technical?.macdDea !== undefined && candidate.technical.macdDif >= candidate.technical.macdDea) score += 5;
  if (candidate.activity?.status === "强") score += 8;
  if (candidate.fundFlowState === "inflow" || (candidate.fundFlowQuality?.score ?? 0) >= 60) score += 5;
  if (sector?.stage === "启动" || sector?.stage === "确认") score += 8;
  if (sector?.stage === "退潮") score -= 18;
  if (changePct !== undefined && changePct > 8) score -= 8;
  return score;
}

function scoreSectorRotationPoolFit(candidate: StockCandidate, sectors: SectorRuleResult[]) {
  let score = 0;
  const sector = findCandidateSector(candidate, sectors);
  if (!sector) return -20;
  if (sector.stage === "启动") score += 16;
  else if (sector.stage === "确认") score += 18;
  else if (sector.stage === "加速") score += 8;
  else if (sector.stage === "分歧") score += 2;
  else if (sector.stage === "退潮") score -= 24;
  score += Math.round((sector.score ?? 0) * 0.16);
  score += Math.round((sector.fundingScore ?? 0) * 0.8);
  if (STRONG_ROLES.has(candidate.role)) score += 10;
  if (candidate.role === "补涨") score += 3;
  if (candidate.mainlineAttribution?.status === "direct_constituent") score += 8;
  if (candidate.companyKnowledge.themeMatch === "strong") score += 6;
  if (candidate.mainlineAttribution?.shouldExclude || candidate.mainlineAttribution?.status === "mismatch") score -= 28;
  return score;
}

function scoreMainForcePoolFit(candidate: StockCandidate) {
  let score = 0;
  const flow = candidate.fundFlow;
  const changePct = candidate.quote?.changePct;
  if ((flow?.mainNetFlow5D ?? 0) > 0) score += 14;
  if ((flow?.mainNetFlow10D ?? 0) > 0) score += 9;
  if ((flow?.mainNetFlow20D ?? 0) > 0) score += 8;
  if ((candidate.fundFlowQuality?.score ?? 0) >= 70) score += 10;
  if (candidate.companyKnowledge.shareholderSummary?.holderCountChangePct !== undefined) {
    const holderChange = candidate.companyKnowledge.shareholderSummary.holderCountChangePct;
    if (holderChange < -3) score += 12;
    else if (holderChange > 5) score -= 10;
  }
  const ma20 = candidate.klineSummary?.maDistance?.ma20;
  if (ma20 !== undefined && ma20 >= -6 && ma20 <= 12) score += 8;
  if (ma20 !== undefined && ma20 > 18) score -= 14;
  if (changePct !== undefined && changePct > 6) score -= 10;
  if (candidate.companyKnowledge.companyKnowledgeState === "sufficient") score += 5;
  return score;
}

function scoreValueStablePoolFit(candidate: StockCandidate) {
  let score = 0;
  const quote = candidate.quote;
  const finance = candidate.companyKnowledge.financialSummary;
  if (quote?.peTtm !== undefined && quote.peTtm > 0 && quote.peTtm <= 30) score += 12;
  if (quote?.pb !== undefined && quote.pb > 0 && quote.pb <= 3) score += 10;
  if ((quote?.dividendYieldTtm ?? 0) > 1.5) score += 8;
  if ((finance?.roePct ?? 0) >= 8) score += 8;
  if ((finance?.debtRatioPct ?? 100) <= 65) score += 5;
  if (finance?.operatingCashFlow !== undefined && finance.operatingCashFlow > 0) score += 6;
  if (candidate.companyKnowledge.financialTrend === "平稳" || candidate.companyKnowledge.financialTrend === "改善") score += 6;
  if (candidate.trendState === "downtrend") score -= 8;
  if ((candidate.quote?.changePct ?? 0) > 5) score -= 5;
  return score;
}

function scoreGrowthPoolFit(candidate: StockCandidate, sectors: SectorRuleResult[]) {
  let score = 0;
  const finance = candidate.companyKnowledge.financialSummary;
  const sector = findCandidateSector(candidate, sectors);
  if ((finance?.revenueChangePct ?? 0) > 10) score += 12;
  if ((finance?.netProfitChangePct ?? 0) > 10) score += 12;
  if ((finance?.grossMarginPct ?? 0) > 20) score += 5;
  if ((finance?.roePct ?? 0) > 8) score += 5;
  if (candidate.companyKnowledge.industryChainPosition !== "unknown") score += 5;
  if (candidate.companyKnowledge.themeMatch === "strong") score += 8;
  if (sector && MAINLINE_STAGES.has(sector.stage)) score += 6;
  if ((candidate.fundFlowQuality?.score ?? 0) >= 55) score += 5;
  if (isLowVolFinancialCandidate(candidate)) score -= 18;
  if ((candidate.quote?.changePct ?? 0) > 8) score -= 6;
  return score;
}

function scoreLowRiskPoolFit(candidate: StockCandidate) {
  let score = 0;
  const quote = candidate.quote;
  const finance = candidate.companyKnowledge.financialSummary;
  if (candidate.trendState === "above_ma20" || candidate.trendState === "reclaim_ma20") score += 8;
  if ((quote?.turnoverRate ?? 99) <= 6) score += 7;
  if ((quote?.peTtm ?? 999) > 0 && (quote?.peTtm ?? 999) <= 35) score += 8;
  if ((quote?.pb ?? 999) > 0 && (quote?.pb ?? 999) <= 4) score += 7;
  if ((quote?.dividendYieldTtm ?? 0) > 1) score += 5;
  if ((finance?.debtRatioPct ?? 100) <= 65) score += 5;
  if (finance?.operatingCashFlow !== undefined && finance.operatingCashFlow > 0) score += 6;
  if (candidate.fundFlowState === "outflow" || candidate.fundFlowQuality?.state === "持续流出") score -= 14;
  if ((candidate.quote?.changePct ?? 0) > 4) score -= 6;
  return score;
}

function findCandidateSector(candidate: StockCandidate, sectors: SectorRuleResult[]) {
  const names = [
    candidate.mainlineAttribution?.matchedSector,
    candidate.mainlineAttribution?.membershipSector,
    candidate.mainlineAttribution?.normalizedMembershipSector,
    candidate.sectorName
  ].filter((name): name is string => Boolean(name));

  return sectors.find((sector) =>
    names.some((name) =>
      name === sector.name ||
      name === sector.normalizedName ||
      sector.sourceNames?.includes(name)
    )
  );
}

function isLowVolFinancialCandidate(candidate: StockCandidate) {
  const text = [
    candidate.name,
    candidate.sectorName,
    candidate.companyKnowledge.industry,
    candidate.companyKnowledge.mainBusiness,
    candidate.companyKnowledge.coreBusiness
  ].join(" ");
  return /银行|农商行|保险|证券|券商|信托|金融/i.test(text);
}

function selectionStrategyLabel(strategyId?: SelectionStrategyId) {
  const labels: Record<SelectionStrategyId, string> = {
    main_force_accumulation: "主力吸筹",
    short_term_breakout: "短期突破",
    value_stable: "价值稳健",
    growth_potential: "成长潜力",
    sector_rotation: "板块轮动",
    low_risk_return: "低风险收益"
  };
  return strategyId ? labels[strategyId] : "当前策略";
}
