import { stockSnapshotGateway, type StockRealtimeSnapshot } from "@/lib/data/stockSnapshotGateway";
import { listTrackingItemsCached } from "@/lib/db/stockTrackingCache";
import { listSelectionRuns } from "@/lib/selection/runs";
import { listSelectionTrackingLinks, type StockTrackingItem } from "@/lib/db/stockTracking";
import type { SelectionPick, SelectionRunRecord, SelectionRunStatus, SelectionStrategyId } from "@/lib/selection/types";

export type SelectionEvaluationTone = "positive" | "neutral" | "warning" | "risk" | "muted";

export type SelectionPickEvaluation = {
  runId: string;
  strategyId: SelectionStrategyId;
  strategyName: string;
  runStartedAt: string;
  code: string;
  name: string;
  sectorName?: string;
  score: number;
  tier: SelectionPick["tier"];
  action: SelectionPick["action"];
  runPrice?: number;
  currentPrice?: number;
  returnPct?: number;
  runActionabilityLevel?: NonNullable<NonNullable<SelectionPick["runtimeSnapshot"]>["actionability"]>["level"];
  currentActionabilityLevel?: StockRealtimeSnapshot["actionability"]["level"];
  currentQuality?: StockRealtimeSnapshot["quality"];
  quoteUpdatedAt?: string;
  snapshotFetchedAt?: string;
  latestKlineDate?: string;
  source?: string;
  tracked: boolean;
  trackingMatchType?: "exact_run" | "same_stock";
  trackingId?: string;
  trackingStatus?: StockTrackingItem["status"];
  trackingBaselinePrice?: number;
  warnings: string[];
  verdict: "validated" | "watching" | "weakened" | "research_only" | "data_insufficient";
  tone: SelectionEvaluationTone;
  summary: string;
};

export type SelectionRunEvaluation = {
  runId: string;
  strategyId: SelectionStrategyId;
  strategyName: string;
  mode: SelectionRunRecord["mode"];
  status: SelectionRunStatus;
  startedAt: string;
  sourceReportId?: string;
  sourceReportTradeDate?: string;
  runEffectiveTradeDate?: string;
  freshnessStatus?: SelectionRunRecord["freshnessStatus"];
  pickCount: number;
  evaluatedPickCount: number;
  trackedPickCount: number;
  exactTrackedPickCount: number;
  sameStockTrackedPickCount: number;
  currentActionableCount: number;
  referenceOnlyCount: number;
  notActionableCount: number;
  dataInsufficientCount: number;
  positiveCount: number;
  negativeCount: number;
  flatCount: number;
  avgReturnPct?: number;
  bestReturnPct?: number;
  worstReturnPct?: number;
  latestQuoteUpdatedAt?: string;
  warningCount: number;
  tone: SelectionEvaluationTone;
  label: string;
  summary: string;
  picks: SelectionPickEvaluation[];
};

export type SelectionStrategyEvaluation = {
  strategyId: SelectionStrategyId;
  strategyName: string;
  runCount: number;
  evaluatedPickCount: number;
  trackedPickCount: number;
  exactTrackedPickCount: number;
  sameStockTrackedPickCount: number;
  currentActionableCount: number;
  referenceOnlyCount: number;
  notActionableCount: number;
  dataInsufficientCount: number;
  positiveCount: number;
  negativeCount: number;
  flatCount: number;
  avgReturnPct?: number;
  bestReturnPct?: number;
  worstReturnPct?: number;
  hitRatePct?: number;
  trackingCoveragePct?: number;
  latestQuoteUpdatedAt?: string;
  trendDirection: "improving" | "weakening" | "stable" | "insufficient";
  trendLabel: string;
  recentRuns: Array<{
    runId: string;
    startedAt: string;
    evaluatedPickCount: number;
    avgReturnPct?: number;
    positiveCount: number;
    negativeCount: number;
    exactTrackedPickCount: number;
    referenceOnlyCount: number;
    label: string;
    tone: SelectionEvaluationTone;
  }>;
  tone: SelectionEvaluationTone;
  label: string;
  summary: string;
};

export type SelectionEvaluationSnapshot = {
  generatedAt: string;
  runLimit: number;
  maxPicksPerRun: number;
  evaluatedRunCount: number;
  evaluatedPickCount: number;
  requestedCodeCount: number;
  returnedSnapshotCount: number;
  trackingItemCount: number;
  summary: {
    trackedPickCount: number;
    exactTrackedPickCount: number;
    sameStockTrackedPickCount: number;
    currentActionableCount: number;
    referenceOnlyCount: number;
    notActionableCount: number;
    dataInsufficientCount: number;
    positiveCount: number;
    negativeCount: number;
    flatCount: number;
    avgReturnPct?: number;
    bestReturnPct?: number;
    worstReturnPct?: number;
    hitRatePct?: number;
    trackingCoveragePct?: number;
    snapshotCoveragePct?: number;
    latestQuoteUpdatedAt?: string;
    tone: SelectionEvaluationTone;
    label: string;
    summary: string;
    nextAction: string;
  };
  strategies: SelectionStrategyEvaluation[];
  runs: SelectionRunEvaluation[];
  warnings: string[];
};

export type BuildSelectionEvaluationOptions = {
  limit?: number;
  maxPicksPerRun?: number;
};

type SelectionTrackingLink = {
  trackingId: string;
  code?: string;
  sourceStrategyRunId: string;
};

export async function buildLatestSelectionEvaluation(
  options: BuildSelectionEvaluationOptions = {}
): Promise<SelectionEvaluationSnapshot> {
  const runLimit = clampInteger(options.limit ?? 12, 1, 30);
  const maxPicksPerRun = clampInteger(options.maxPicksPerRun ?? 5, 1, 20);
  const runs = listSelectionRuns(runLimit).filter((run) => run.status === "success");
  const codes = uniqueCodes(
    runs.flatMap((run) => run.picks.slice(0, maxPicksPerRun).map((pick) => pick.code))
  ).slice(0, 80);
  const warnings: string[] = [];
  let snapshots: Record<string, StockRealtimeSnapshot> = {};

  if (codes.length) {
    try {
      snapshots = await stockSnapshotGateway.fetchMany(codes);
    } catch (error) {
      warnings.push(`统一行情快照读取失败：${error instanceof Error ? error.message : String(error)}`);
      snapshots = {};
    }
  }

  const tracking = listTrackingItemsCached().data;
  return buildSelectionEvaluationFromData({
    runs,
    snapshots,
    trackingItems: tracking,
    trackingLinks: listSelectionTrackingLinks(),
    generatedAt: new Date().toISOString(),
    runLimit,
    maxPicksPerRun,
    warnings
  });
}

export function buildSelectionEvaluationFromData(input: {
  runs: SelectionRunRecord[];
  snapshots: Record<string, StockRealtimeSnapshot>;
  trackingItems: StockTrackingItem[];
  trackingLinks?: SelectionTrackingLink[];
  generatedAt: string;
  runLimit: number;
  maxPicksPerRun: number;
  warnings?: string[];
}): SelectionEvaluationSnapshot {
  const trackingByRunAndCode = buildTrackingIndex(input.trackingItems, input.trackingLinks ?? []);
  const runEvaluations = input.runs
    .filter((run) => run.status === "success")
    .map((run) => evaluateRun(run, input.snapshots, trackingByRunAndCode, input.maxPicksPerRun));
  const picks = runEvaluations.flatMap((run) => run.picks);
  const summary = buildOverallSummary(picks, input.snapshots, input.trackingItems.length);
  const strategies = buildStrategyEvaluations(runEvaluations);
  const requestedCodes = uniqueCodes(
    input.runs.flatMap((run) => run.picks.slice(0, input.maxPicksPerRun).map((pick) => pick.code))
  );

  return {
    generatedAt: input.generatedAt,
    runLimit: input.runLimit,
    maxPicksPerRun: input.maxPicksPerRun,
    evaluatedRunCount: runEvaluations.length,
    evaluatedPickCount: picks.length,
    requestedCodeCount: requestedCodes.length,
    returnedSnapshotCount: Object.keys(input.snapshots).length,
    trackingItemCount: input.trackingItems.length,
    summary,
    strategies,
    runs: runEvaluations,
    warnings: input.warnings ?? []
  };
}

function evaluateRun(
  run: SelectionRunRecord,
  snapshots: Record<string, StockRealtimeSnapshot>,
  trackingByRunAndCode: Map<string, StockTrackingItem>,
  maxPicksPerRun: number
): SelectionRunEvaluation {
  const picks = run.picks.slice(0, maxPicksPerRun).map((pick) => {
    const code = normalizeCode(pick.code);
    const exactTracking = trackingByRunAndCode.get(`${run.id}:${code}`);
    const sameStockTracking = trackingByRunAndCode.get(`any:${code}`);
    const trackingMatchType = exactTracking ? "exact_run" : sameStockTracking ? "same_stock" : undefined;
    return evaluatePick(run, pick, snapshots[code], exactTracking ?? sameStockTracking, trackingMatchType);
  });
  const returns = picks.map((pick) => pick.returnPct).filter((value): value is number => value !== undefined);
  const trackedPickCount = picks.filter((pick) => pick.tracked).length;
  const exactTrackedPickCount = picks.filter((pick) => pick.trackingMatchType === "exact_run").length;
  const sameStockTrackedPickCount = picks.filter((pick) => pick.trackingMatchType === "same_stock").length;
  const currentActionableCount = picks.filter((pick) => pick.currentActionabilityLevel === "actionable").length;
  const referenceOnlyCount = picks.filter((pick) => pick.currentActionabilityLevel === "reference_only" || pick.runActionabilityLevel === "reference_only").length;
  const notActionableCount = picks.filter((pick) => pick.currentActionabilityLevel === "not_actionable").length;
  const dataInsufficientCount = picks.filter((pick) => pick.verdict === "data_insufficient").length;
  const positiveCount = picks.filter((pick) => pick.returnPct !== undefined && pick.returnPct > 0.3).length;
  const negativeCount = picks.filter((pick) => pick.returnPct !== undefined && pick.returnPct < -0.3).length;
  const flatCount = picks.filter((pick) => pick.returnPct !== undefined && Math.abs(pick.returnPct) <= 0.3).length;
  const avgReturnPct = average(returns);
  const tone = runTone({ picks, avgReturnPct, dataInsufficientCount, referenceOnlyCount, notActionableCount, positiveCount, negativeCount });
  const label = runToneLabel(tone);
  const latestQuoteUpdatedAt = newestIso(...picks.map((pick) => pick.quoteUpdatedAt));

  return {
    runId: run.id,
    strategyId: run.strategyId,
    strategyName: run.strategyName,
    mode: run.mode,
    status: run.status,
    startedAt: run.startedAt,
    sourceReportId: run.sourceReportId,
    sourceReportTradeDate: run.sourceReportTradeDate,
    runEffectiveTradeDate: run.runEffectiveTradeDate,
    freshnessStatus: run.freshnessStatus,
    pickCount: run.pickCount,
    evaluatedPickCount: picks.length,
    trackedPickCount,
    exactTrackedPickCount,
    sameStockTrackedPickCount,
    currentActionableCount,
    referenceOnlyCount,
    notActionableCount,
    dataInsufficientCount,
    positiveCount,
    negativeCount,
    flatCount,
    avgReturnPct,
    bestReturnPct: maxNumber(returns),
    worstReturnPct: minNumber(returns),
    latestQuoteUpdatedAt,
    warningCount: picks.reduce((sum, pick) => sum + pick.warnings.length, 0),
    tone,
    label,
    summary: buildRunSummary(label, picks.length, trackedPickCount, avgReturnPct, positiveCount, negativeCount, referenceOnlyCount, dataInsufficientCount),
    picks
  };
}

function evaluatePick(
  run: SelectionRunRecord,
  pick: SelectionPick,
  snapshot: StockRealtimeSnapshot | undefined,
  tracking: StockTrackingItem | undefined,
  trackingMatchType?: SelectionPickEvaluation["trackingMatchType"]
): SelectionPickEvaluation {
  const runPrice = finiteNumber(pick.runtimeSnapshot?.latestPrice) ?? finiteNumber(pick.price);
  const currentPrice = finiteNumber(snapshot?.latestPrice);
  const returnPct = percentChange(runPrice, currentPrice);
  const currentActionabilityLevel = snapshot?.actionability.level;
  const runActionabilityLevel = pick.runtimeSnapshot?.actionability?.level;
  const warnings = [
    ...((snapshot?.warnings ?? []).slice(0, 3)),
    ...(snapshot ? [] : ["未取得当前统一行情快照，后验评估只能保留运行时记录。"]),
    ...(runActionabilityLevel === "reference_only" ? ["运行时快照为研究参考，不应按盘中交易信号评估。"] : []),
    ...(currentActionabilityLevel === "reference_only" ? ["当前行情快照为研究参考，收益变化只适合复盘观察。"] : [])
  ];
  const verdict = pickVerdict({ runPrice, currentPrice, returnPct, currentActionabilityLevel, runActionabilityLevel });
  const tone = pickTone(verdict, returnPct);

  return {
    runId: run.id,
    strategyId: run.strategyId,
    strategyName: run.strategyName,
    runStartedAt: run.startedAt,
    code: pick.code,
    name: pick.name,
    sectorName: pick.sectorName,
    score: pick.score,
    tier: pick.tier,
    action: pick.action,
    runPrice,
    currentPrice,
    returnPct,
    runActionabilityLevel,
    currentActionabilityLevel,
    currentQuality: snapshot?.quality,
    quoteUpdatedAt: snapshot?.quoteUpdatedAt ?? snapshot?.raw?.quoteUpdatedAt,
    snapshotFetchedAt: snapshot?.fetchedAt,
    latestKlineDate: snapshot?.raw?.latestKlineDate,
    source: snapshot?.source,
    tracked: Boolean(tracking),
    trackingMatchType,
    trackingId: tracking?.id,
    trackingStatus: tracking?.status,
    trackingBaselinePrice: tracking?.performance?.baselinePrice ?? tracking?.baselineTrace?.price ?? tracking?.simulatedPrice,
    warnings: Array.from(new Set(warnings)).slice(0, 6),
    verdict,
    tone,
    summary: pickSummary(verdict, returnPct, snapshot, tracking)
  };
}

function buildOverallSummary(
  picks: SelectionPickEvaluation[],
  snapshots: Record<string, StockRealtimeSnapshot>,
  trackingItemCount: number
): SelectionEvaluationSnapshot["summary"] {
  const stats = pickStats(picks);
  const uniquePickCodes = uniqueCodes(picks.map((pick) => pick.code));
  const snapshotCoveragePct = uniquePickCodes.length
    ? round2((Object.keys(snapshots).length / uniquePickCodes.length) * 100)
    : undefined;
  const tone = overallTone({
    total: picks.length,
    avgReturnPct: stats.avgReturnPct,
    dataInsufficientCount: stats.dataInsufficientCount,
    referenceOnlyCount: stats.referenceOnlyCount,
    notActionableCount: stats.notActionableCount,
    positiveCount: stats.positiveCount,
    negativeCount: stats.negativeCount
  });
  const label = overallLabel(tone);

  return {
    trackedPickCount: stats.trackedPickCount,
    exactTrackedPickCount: stats.exactTrackedPickCount,
    sameStockTrackedPickCount: stats.sameStockTrackedPickCount,
    currentActionableCount: stats.currentActionableCount,
    referenceOnlyCount: stats.referenceOnlyCount,
    notActionableCount: stats.notActionableCount,
    dataInsufficientCount: stats.dataInsufficientCount,
    positiveCount: stats.positiveCount,
    negativeCount: stats.negativeCount,
    flatCount: stats.flatCount,
    avgReturnPct: stats.avgReturnPct,
    bestReturnPct: stats.bestReturnPct,
    worstReturnPct: stats.worstReturnPct,
    hitRatePct: stats.hitRatePct,
    trackingCoveragePct: stats.trackingCoveragePct,
    snapshotCoveragePct,
    latestQuoteUpdatedAt: stats.latestQuoteUpdatedAt,
    tone,
    label,
    summary: buildOverallText(label, picks.length, trackingItemCount, stats.trackedPickCount, stats.avgReturnPct, stats.positiveCount, stats.negativeCount, stats.referenceOnlyCount, stats.dataInsufficientCount),
    nextAction: overallNextAction(tone, stats.referenceOnlyCount, stats.dataInsufficientCount, stats.trackedPickCount, picks.length)
  };
}

function buildStrategyEvaluations(runs: SelectionRunEvaluation[]): SelectionStrategyEvaluation[] {
  const groups = new Map<SelectionStrategyId, SelectionRunEvaluation[]>();
  for (const run of runs) {
    const current = groups.get(run.strategyId) ?? [];
    current.push(run);
    groups.set(run.strategyId, current);
  }

  return Array.from(groups.entries())
    .map(([strategyId, strategyRuns]) => {
      const picks = strategyRuns.flatMap((run) => run.picks);
      const stats = pickStats(picks);
      const recentRuns = strategyRuns
        .slice()
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, 5)
        .map((run) => ({
          runId: run.runId,
          startedAt: run.startedAt,
          evaluatedPickCount: run.evaluatedPickCount,
          avgReturnPct: run.avgReturnPct,
          positiveCount: run.positiveCount,
          negativeCount: run.negativeCount,
          exactTrackedPickCount: run.exactTrackedPickCount,
          referenceOnlyCount: run.referenceOnlyCount,
          label: run.label,
          tone: run.tone
        }));
      const trendDirection = strategyTrendDirection(recentRuns);
      const tone = runTone({
        picks,
        avgReturnPct: stats.avgReturnPct,
        dataInsufficientCount: stats.dataInsufficientCount,
        referenceOnlyCount: stats.referenceOnlyCount,
        notActionableCount: stats.notActionableCount,
        positiveCount: stats.positiveCount,
        negativeCount: stats.negativeCount
      });
      const label = runToneLabel(tone);

      return {
        strategyId,
        strategyName: strategyRuns[0]?.strategyName ?? strategyId,
        runCount: strategyRuns.length,
        evaluatedPickCount: picks.length,
        trackedPickCount: stats.trackedPickCount,
        exactTrackedPickCount: stats.exactTrackedPickCount,
        sameStockTrackedPickCount: stats.sameStockTrackedPickCount,
        currentActionableCount: stats.currentActionableCount,
        referenceOnlyCount: stats.referenceOnlyCount,
        notActionableCount: stats.notActionableCount,
        dataInsufficientCount: stats.dataInsufficientCount,
        positiveCount: stats.positiveCount,
        negativeCount: stats.negativeCount,
        flatCount: stats.flatCount,
        avgReturnPct: stats.avgReturnPct,
        bestReturnPct: stats.bestReturnPct,
        worstReturnPct: stats.worstReturnPct,
        hitRatePct: stats.hitRatePct,
        trackingCoveragePct: stats.trackingCoveragePct,
        latestQuoteUpdatedAt: stats.latestQuoteUpdatedAt,
        trendDirection,
        trendLabel: strategyTrendLabel(trendDirection),
        recentRuns,
        tone,
        label,
        summary: buildStrategySummary(label, strategyRuns.length, picks.length, stats)
      };
    })
    .sort(compareStrategyEvaluations);
}

function buildStrategySummary(
  label: string,
  runCount: number,
  pickCount: number,
  stats: ReturnType<typeof pickStats>
) {
  if (!pickCount) return `${label}：最近 ${runCount} 次运行没有可评估入选样本。`;
  return `${label}：最近 ${runCount} 次运行评估 ${pickCount} 个样本，平均变化 ${formatSignedPct(stats.avgReturnPct)}，命中率 ${formatPct(stats.hitRatePct)}，追踪覆盖 ${formatPct(stats.trackingCoveragePct)}，研究参考 ${stats.referenceOnlyCount} 个，数据不足 ${stats.dataInsufficientCount} 个。`;
}

function compareStrategyEvaluations(a: SelectionStrategyEvaluation, b: SelectionStrategyEvaluation) {
  const toneDelta = toneRank(b.tone) - toneRank(a.tone);
  if (toneDelta !== 0) return toneDelta;
  const returnDelta = (b.avgReturnPct ?? -999) - (a.avgReturnPct ?? -999);
  if (returnDelta !== 0) return returnDelta;
  return b.evaluatedPickCount - a.evaluatedPickCount;
}

function strategyTrendDirection(
  recentRuns: SelectionStrategyEvaluation["recentRuns"]
): SelectionStrategyEvaluation["trendDirection"] {
  const values = recentRuns
    .map((run) => run.avgReturnPct)
    .filter((value): value is number => value !== undefined);
  if (values.length < 2) return "insufficient";
  const latest = values[0];
  const previousAvg = average(values.slice(1));
  if (previousAvg === undefined) return "insufficient";
  const delta = latest - previousAvg;
  if (delta >= 1) return "improving";
  if (delta <= -1) return "weakening";
  return "stable";
}

function strategyTrendLabel(direction: SelectionStrategyEvaluation["trendDirection"]) {
  if (direction === "improving") return "后验改善";
  if (direction === "weakening") return "后验走弱";
  if (direction === "stable") return "后验平稳";
  return "样本不足";
}

function toneRank(tone: SelectionEvaluationTone) {
  if (tone === "positive") return 4;
  if (tone === "neutral") return 3;
  if (tone === "warning") return 2;
  if (tone === "risk") return 1;
  return 0;
}

function pickStats(picks: SelectionPickEvaluation[]) {
  const returns = picks.map((pick) => pick.returnPct).filter((value): value is number => value !== undefined);
  const trackedPickCount = picks.filter((pick) => pick.tracked).length;
  const exactTrackedPickCount = picks.filter((pick) => pick.trackingMatchType === "exact_run").length;
  const sameStockTrackedPickCount = picks.filter((pick) => pick.trackingMatchType === "same_stock").length;
  const currentActionableCount = picks.filter((pick) => pick.currentActionabilityLevel === "actionable").length;
  const referenceOnlyCount = picks.filter((pick) => pick.currentActionabilityLevel === "reference_only" || pick.runActionabilityLevel === "reference_only").length;
  const notActionableCount = picks.filter((pick) => pick.currentActionabilityLevel === "not_actionable").length;
  const dataInsufficientCount = picks.filter((pick) => pick.verdict === "data_insufficient").length;
  const positiveCount = picks.filter((pick) => pick.returnPct !== undefined && pick.returnPct > 0.3).length;
  const negativeCount = picks.filter((pick) => pick.returnPct !== undefined && pick.returnPct < -0.3).length;
  const flatCount = picks.filter((pick) => pick.returnPct !== undefined && Math.abs(pick.returnPct) <= 0.3).length;

  return {
    trackedPickCount,
    exactTrackedPickCount,
    sameStockTrackedPickCount,
    currentActionableCount,
    referenceOnlyCount,
    notActionableCount,
    dataInsufficientCount,
    positiveCount,
    negativeCount,
    flatCount,
    avgReturnPct: average(returns),
    bestReturnPct: maxNumber(returns),
    worstReturnPct: minNumber(returns),
    hitRatePct: returns.length ? round2((positiveCount / returns.length) * 100) : undefined,
    trackingCoveragePct: picks.length ? round2((trackedPickCount / picks.length) * 100) : undefined,
    latestQuoteUpdatedAt: newestIso(...picks.map((pick) => pick.quoteUpdatedAt))
  };
}

function buildTrackingIndex(items: StockTrackingItem[], links: SelectionTrackingLink[]) {
  const map = new Map<string, StockTrackingItem>();
  const itemsById = new Map(items.map((item) => [item.id, item]));
  for (const item of items) {
    const code = normalizeCode(item.code);
    if (item.sourceStrategyRunId) map.set(`${item.sourceStrategyRunId}:${code}`, item);
    if (item.source === "selection") map.set(`any:${code}`, item);
  }
  for (const link of links) {
    const item = itemsById.get(link.trackingId);
    if (!item) continue;
    const code = normalizeCode(link.code ?? item.code);
    if (code) map.set(`${link.sourceStrategyRunId}:${code}`, item);
  }
  return map;
}

function pickVerdict(input: {
  runPrice?: number;
  currentPrice?: number;
  returnPct?: number;
  currentActionabilityLevel?: StockRealtimeSnapshot["actionability"]["level"];
  runActionabilityLevel?: NonNullable<NonNullable<SelectionPick["runtimeSnapshot"]>["actionability"]>["level"];
}): SelectionPickEvaluation["verdict"] {
  if (input.runPrice === undefined || input.currentPrice === undefined) return "data_insufficient";
  if (input.currentActionabilityLevel === "not_actionable") return "data_insufficient";
  if (input.currentActionabilityLevel === "reference_only" || input.runActionabilityLevel === "reference_only") return "research_only";
  if ((input.returnPct ?? 0) >= 3) return "validated";
  if ((input.returnPct ?? 0) <= -3) return "weakened";
  return "watching";
}

function pickTone(verdict: SelectionPickEvaluation["verdict"], returnPct?: number): SelectionEvaluationTone {
  if (verdict === "validated") return "positive";
  if (verdict === "weakened") return "warning";
  if (verdict === "data_insufficient") return "risk";
  if (verdict === "research_only") return "neutral";
  if ((returnPct ?? 0) > 0) return "positive";
  if ((returnPct ?? 0) < 0) return "warning";
  return "neutral";
}

function pickSummary(
  verdict: SelectionPickEvaluation["verdict"],
  returnPct: number | undefined,
  snapshot: StockRealtimeSnapshot | undefined,
  tracking: StockTrackingItem | undefined
) {
  const returnText = returnPct === undefined ? "收益变化待补" : `运行价到当前价 ${formatSignedPct(returnPct)}`;
  const trackText = tracking ? `已进入追踪（${tracking.status}）` : "尚未进入追踪";
  if (verdict === "data_insufficient") return `${returnText}；当前快照不足，先补数据再评价。`;
  if (verdict === "research_only") return `${returnText}；${snapshot?.actionability.label ?? "研究参考"}，只适合复盘观察；${trackText}。`;
  if (verdict === "validated") return `${returnText}；后验表现较强，适合复盘其触发条件是否可复制；${trackText}。`;
  if (verdict === "weakened") return `${returnText}；后验表现转弱，需要复盘阻断条件是否提前暴露；${trackText}。`;
  return `${returnText}；仍在观察区间，继续看触发条件和失效条件；${trackText}。`;
}

function runTone(input: {
  picks: SelectionPickEvaluation[];
  avgReturnPct?: number;
  dataInsufficientCount: number;
  referenceOnlyCount: number;
  notActionableCount: number;
  positiveCount: number;
  negativeCount: number;
}): SelectionEvaluationTone {
  if (!input.picks.length) return "muted";
  if (input.dataInsufficientCount >= Math.ceil(input.picks.length * 0.5) || input.notActionableCount > 0) return "risk";
  if (input.referenceOnlyCount >= Math.ceil(input.picks.length * 0.5)) return "neutral";
  if ((input.avgReturnPct ?? 0) >= 1 && input.positiveCount >= input.negativeCount) return "positive";
  if ((input.avgReturnPct ?? 0) <= -1 || input.negativeCount > input.positiveCount) return "warning";
  return "neutral";
}

function runToneLabel(tone: SelectionEvaluationTone) {
  if (tone === "positive") return "后验偏强";
  if (tone === "warning") return "后验转弱";
  if (tone === "risk") return "数据不足";
  if (tone === "muted") return "暂无评估";
  return "研究观察";
}

function buildRunSummary(
  label: string,
  total: number,
  tracked: number,
  avgReturnPct: number | undefined,
  positive: number,
  negative: number,
  referenceOnly: number,
  insufficient: number
) {
  if (!total) return "本次运行没有可评估入选股。";
  return `${label}：已评估 ${total} 只，进入追踪 ${tracked} 只，平均变化 ${formatSignedPct(avgReturnPct)}，上涨 ${positive} 只，下跌 ${negative} 只，研究参考 ${referenceOnly} 只，数据不足 ${insufficient} 只。`;
}

function overallTone(input: {
  total: number;
  avgReturnPct?: number;
  dataInsufficientCount: number;
  referenceOnlyCount: number;
  notActionableCount: number;
  positiveCount: number;
  negativeCount: number;
}): SelectionEvaluationTone {
  if (!input.total) return "muted";
  if (input.dataInsufficientCount >= Math.ceil(input.total * 0.4) || input.notActionableCount > 0) return "risk";
  if (input.referenceOnlyCount >= Math.ceil(input.total * 0.5)) return "neutral";
  if ((input.avgReturnPct ?? 0) >= 1 && input.positiveCount >= input.negativeCount) return "positive";
  if ((input.avgReturnPct ?? 0) <= -1 || input.negativeCount > input.positiveCount) return "warning";
  return "neutral";
}

function overallLabel(tone: SelectionEvaluationTone) {
  if (tone === "positive") return "策略后验偏强";
  if (tone === "warning") return "策略后验转弱";
  if (tone === "risk") return "后验数据不足";
  if (tone === "muted") return "暂无可评估样本";
  return "策略处于研究观察";
}

function buildOverallText(
  label: string,
  total: number,
  trackingItemCount: number,
  tracked: number,
  avgReturnPct: number | undefined,
  positive: number,
  negative: number,
  referenceOnly: number,
  insufficient: number
) {
  if (!total) return "最近选股运行还没有可评估入选股，先积累规则运行和追踪样本。";
  return `${label}：本次聚合 ${total} 个入选样本，当前追踪池共 ${trackingItemCount} 只，其中与选股样本匹配 ${tracked} 只；平均变化 ${formatSignedPct(avgReturnPct)}，上涨 ${positive} 只，下跌 ${negative} 只，研究参考 ${referenceOnly} 只，数据不足 ${insufficient} 只。`;
}

function overallNextAction(
  tone: SelectionEvaluationTone,
  referenceOnly: number,
  insufficient: number,
  tracked: number,
  total: number
) {
  if (!total) return "先运行至少一次策略选股，并把高质量候选加入追踪，形成可复盘样本。";
  if (insufficient > 0) return "优先补齐统一行情快照，避免用缺失数据评价策略好坏。";
  if (referenceOnly >= Math.ceil(total * 0.5)) return "当前多数样本仍是研究参考，等待连续竞价或下一次有效行情后再做策略成败判断。";
  if (tracked < Math.ceil(total * 0.4)) return "建议把高分且证据完整的样本加入追踪池，形成后续收益和失效条件验证。";
  if (tone === "positive") return "复盘表现较强样本的共同因子，沉淀可复制的触发条件。";
  if (tone === "warning") return "复盘转弱样本的阻断条件，检查规则是否过宽或数据是否滞后。";
  return "继续积累样本，并按策略、市场阶段和数据质量分层观察。";
}

function uniqueCodes(codes: string[]) {
  return Array.from(new Set(codes.map(normalizeCode).filter(Boolean)));
}

function normalizeCode(code: string) {
  return stockSnapshotGateway.normalizeCode(code);
}

function percentChange(base?: number, latest?: number) {
  if (!base || !latest || base <= 0) return undefined;
  return round2(((latest - base) / base) * 100);
}

function average(values: number[]) {
  if (!values.length) return undefined;
  return round2(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function maxNumber(values: number[]) {
  return values.length ? round2(Math.max(...values)) : undefined;
}

function minNumber(values: number[]) {
  return values.length ? round2(Math.min(...values)) : undefined;
}

function newestIso(...values: Array<string | undefined>) {
  return values.filter(Boolean).sort().at(-1);
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

function formatSignedPct(value?: number) {
  if (value === undefined) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatPct(value?: number) {
  if (value === undefined) return "--";
  return `${value.toFixed(0)}%`;
}

function clampInteger(value: number, min: number, max: number) {
  const parsed = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.min(Math.max(parsed, min), max);
}
