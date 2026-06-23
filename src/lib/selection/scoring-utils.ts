import type { SelectionPick, SelectionPickScoreFactor } from "@/lib/selection/types";
import { isSelectionRejected } from "@/lib/selection/insights";
import { inferMarketSessionContext } from "@/lib/market/session";
import type { StockCandidate } from "@/lib/types";

export function factor(
  key: string,
  label: string,
  score: number,
  maxScore: number,
  reasons: string[],
  blockers: string[]
): SelectionPickScoreFactor {
  return {
    key,
    label,
    score: Math.max(0, Math.min(maxScore, Math.round(score))),
    maxScore,
    reasons,
    blockers
  };
}

export function numberParam(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function booleanParam(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function stringParam(value: unknown, fallback: string) {
  return typeof value === "string" && value ? value : fallback;
}

export function uniqueText(values: Array<string | null | undefined | false>, limit = 8) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))).slice(0, limit);
}

export function tierFromScore(score: number): SelectionPick["tier"] {
  if (score >= 85) return "S";
  if (score >= 75) return "A";
  if (score >= 60) return "B";
  if (score >= 45) return "C";
  return "D";
}

export function splitPassedAndRejected(scored: SelectionPick[], maxFinalPicks: number) {
  const gated = scored.map(applyRuntimeSnapshotGate);
  const passed = gated
    .filter((pick) => !isSelectionRejected(pick.action))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFinalPicks);
  const selectedCodes = new Set(passed.map((pick) => pick.code));
  const rejected = gated
    .filter((pick) => !selectedCodes.has(pick.code))
    .sort((a, b) => b.score - a.score);
  return { passed, rejected };
}

function applyRuntimeSnapshotGate(pick: SelectionPick): SelectionPick {
  const actionability = pick.runtimeSnapshot?.actionability;
  if (!actionability) return pick;
  const blockers = Array.isArray(pick.blockers) ? pick.blockers : [];
  const reasons = Array.isArray(pick.reasons) ? pick.reasons : [];

  if (actionability.level === "not_actionable") {
    return {
      ...pick,
      score: Math.min(pick.score, 40),
      tier: tierFromScore(Math.min(pick.score, 40)),
      action: "剔除",
      blockers: uniqueText([
        `运行快照不可行动：${actionability.reason}`,
        ...blockers
      ], 12),
      reasons: uniqueText([
        ...reasons,
        "行情快照缺少有效报价或关键字段，本次不允许进入精选。"
      ], 12)
    };
  }

  if (actionability.level === "reference_only" && pick.action === "重点观察") {
    const score = Math.min(pick.score, 69);
    return {
      ...pick,
      score,
      tier: tierFromScore(score),
      action: score >= 60 ? "跟踪观察" : "条件等待",
      blockers: uniqueText([
        `运行快照仅可参考：${actionability.reason}`,
        ...blockers
      ], 12),
      reasons: uniqueText([
        ...reasons,
        "该股保留研究价值，但快照质量不足以升级为重点观察。"
      ], 12)
    };
  }

  return pick;
}

export function normalizeSelectionPickRuntimeBoundary(pick: SelectionPick, now?: string): SelectionPick {
  const runtimeSnapshot = normalizeSelectionRuntimeSnapshot(pick.runtimeSnapshot, now);
  const next = runtimeSnapshot === pick.runtimeSnapshot ? pick : { ...pick, runtimeSnapshot };
  return applyRuntimeSnapshotGate(next);
}

export function normalizeSelectionRuntimeSnapshot(
  snapshot: SelectionPick["runtimeSnapshot"],
  now?: string
): SelectionPick["runtimeSnapshot"] {
  if (!snapshot) return snapshot;
  const coverage = snapshot.coverage ?? inferRuntimeSnapshotCoverage(snapshot);
  const quality = snapshot.quality ?? selectionSnapshotQuality(coverage);
  return {
    ...snapshot,
    coverage,
    quality,
    actionability: selectionSnapshotActionability({
      quality,
      coverage,
      quoteUpdatedAt: snapshot.quoteUpdatedAt,
      fetchedAt: snapshot.fetchedAt,
      klineFreshnessStatus: snapshot.klineFreshnessStatus,
      warnings: snapshot.warnings ?? [],
      now
    })
  };
}

export function selectionDataFreshness(candidate: StockCandidate): NonNullable<SelectionPick["dataFreshness"]> {
  const traces = candidate.sourceTraces ?? [];
  const quote = traceState(traces, "selection.runtime.quote", Boolean(candidate.quote?.latest ?? candidate.price));
  const kline = traceState(traces, "selection.runtime.kline", Boolean(candidate.klineSummary));
  const technical = traceState(traces, "selection.runtime.technical", Boolean(candidate.technical));
  const fundFlow = traceState(traces, "selection.runtime.fundFlow", Boolean(candidate.fundFlow));
  const company = traceState(
    traces,
    "selection.runtime.company",
    candidate.companyKnowledge.companyKnowledgeState === "sufficient" || candidate.companyKnowledge.companyKnowledgeState === "partial"
  );
  const states = [quote.state, kline.state, technical.state, fundFlow.state, company.state];
  const freshCount = states.filter((state) => state === "fresh").length;
  const snapshotCount = states.filter((state) => state === "snapshot").length;
  const basis = freshCount >= 3 ? "runtime_refresh" : freshCount > 0 || snapshotCount > 0 ? "mixed" : "report_snapshot";
  const refreshedAt = [quote.fetchedAt, kline.fetchedAt, technical.fetchedAt, fundFlow.fetchedAt, company.fetchedAt]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  return {
    basis,
    label: basis === "runtime_refresh" ? "运行前已刷新" : basis === "mixed" ? "部分刷新" : "报告快照",
    refreshedAt,
    quote: quote.state,
    kline: kline.state,
    technical: technical.state,
    fundFlow: fundFlow.state,
    company: company.state,
    warnings: [quote.warning, kline.warning, technical.warning, fundFlow.warning, company.warning]
      .filter((value): value is string => Boolean(value))
      .slice(0, 5)
  };
}

export function selectionRuntimeSnapshot(candidate: StockCandidate): NonNullable<SelectionPick["runtimeSnapshot"]> {
  const freshness = selectionDataFreshness(candidate);
  const traces = candidate.sourceTraces ?? [];
  const fields = [
    "selection.runtime.quote",
    "selection.runtime.kline",
    "selection.runtime.technical",
    "selection.runtime.fundFlow",
    "selection.runtime.company"
  ];
  const relevantTraces = traces.filter((trace) => fields.includes(trace.field));
  const sourceProviders = Array.from(new Set(
    relevantTraces
      .filter((trace) => trace.quality !== "missing")
      .map((trace) => trace.providerName || trace.provider)
  ));
  const warnings = Array.from(new Set([
    ...freshness.warnings,
    ...relevantTraces.map((trace) => trace.warning).filter((value): value is string => Boolean(value))
  ])).slice(0, 6);
  const coverage = {
    quote: freshness.quote !== "missing",
    kline: freshness.kline !== "missing",
    technical: freshness.technical !== "missing",
    fundFlow: freshness.fundFlow !== "missing",
    company: freshness.company !== "missing"
  };
  const quality = selectionSnapshotQuality(coverage);
  const fetchedAt = freshness.refreshedAt ?? candidate.quote?.fetchedAt;
  const quoteUpdatedAt = candidate.quote?.quoteUpdatedAt ?? candidate.quote?.fetchedAt;
  const unifiedTrace = traces.find((trace) => trace.field === "selection.runtime.unifiedSnapshot");
  const klineTrace = traces.find((trace) => trace.field === "selection.runtime.kline");
  const klineFreshnessStatus = traceFreshnessStatus(unifiedTrace) ?? traceFreshnessStatus(klineTrace);
  const actionability = selectionSnapshotActionability({
    quality,
    coverage,
    quoteUpdatedAt,
    fetchedAt,
    klineFreshnessStatus,
    warnings
  });
  return {
    latestPrice: candidate.price ?? candidate.quote?.latest,
    changePct: candidate.quote?.changePct,
    amount: candidate.quote?.amount,
    turnoverRate: candidate.quote?.turnoverRate,
    mainNetInflow: candidate.quote?.mainNetInflow ?? candidate.fundFlow?.mainNetFlow,
    trendState: candidate.trendState,
    fundFlowState: candidate.fundFlowState,
    source: sourceProviders.length ? sourceProviders.join(" + ") : "报告快照",
    fetchedAt,
    quoteUpdatedAt,
    latestKlineDate: traceMetaValue(unifiedTrace, "latestKlineDate") ?? traceMetaValue(klineTrace, "latestKlineDate"),
    expectedKlineDate: traceMetaValue(unifiedTrace, "expectedKlineDate") ?? traceMetaValue(klineTrace, "expectedKlineDate"),
    klineFreshnessStatus,
    klineClose: candidate.technical?.closePrice ?? candidate.klineSummary?.latestClose,
    basis: freshness.basis,
    quality,
    qualityLabel: selectionSnapshotQualityLabel(quality),
    actionability,
    coverage,
    warnings
  };
}

function traceMetaValue(trace: { metadata?: Record<string, string | number | boolean | null | undefined> } | undefined, key: string) {
  const value = trace?.metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function traceFreshnessStatus(trace: { freshness?: unknown; metadata?: Record<string, string | number | boolean | null | undefined> } | undefined) {
  const explicit = traceMetaValue(trace, "klineFreshnessStatus");
  const value = explicit ?? (typeof trace?.freshness === "string" ? trace.freshness : undefined);
  if (value === "current" || value === "stale" || value === "unknown") return value;
  return undefined;
}

function selectionSnapshotQuality(coverage: NonNullable<SelectionPick["runtimeSnapshot"]>["coverage"]): NonNullable<SelectionPick["runtimeSnapshot"]>["quality"] {
  if (!coverage) return "missing";
  if (coverage.quote && coverage.kline && coverage.technical && coverage.fundFlow && coverage.company) return "complete";
  if (coverage.quote && coverage.kline && coverage.technical && coverage.fundFlow) return "partial";
  if (coverage.quote) return "quote_only";
  return "missing";
}

function selectionSnapshotQualityLabel(quality: NonNullable<SelectionPick["runtimeSnapshot"]>["quality"]) {
  if (quality === "complete") return "盘口/K线/技术/资金/公司完整";
  if (quality === "partial") return "行情技术完整，公司层待补";
  if (quality === "quote_only") return "仅盘口可用";
  return "关键数据缺失";
}

function selectionSnapshotActionability(input: {
  quality: NonNullable<SelectionPick["runtimeSnapshot"]>["quality"];
  coverage: NonNullable<NonNullable<SelectionPick["runtimeSnapshot"]>["coverage"]>;
  quoteUpdatedAt?: string;
  fetchedAt?: string;
  klineFreshnessStatus?: "current" | "stale" | "unknown";
  warnings: string[];
  now?: string;
}): NonNullable<NonNullable<SelectionPick["runtimeSnapshot"]>["actionability"]> {
  const staleAfterMinutes = 30;
  const now = input.now ?? new Date().toISOString();
  const session = inferMarketSessionContext(now);
  const basisTime = input.quoteUpdatedAt ?? input.fetchedAt;
  const ageMinutes = ageMinutesFromIso(basisTime, now);
  const isStale = ageMinutes !== undefined && ageMinutes > staleAfterMinutes;
  const hasRiskWarning = input.warnings.some(isSelectionSnapshotRiskWarning);
  const hasStaleKline = input.klineFreshnessStatus === "stale";
  const missingDecisionFields = !input.coverage.technical || !input.coverage.fundFlow;
  const nonRealtimePhase = !session.canUseRealtimeQuotes;
  if (input.quality === "missing" || !input.coverage.quote) {
    return {
      level: "not_actionable",
      label: "不可用于行动",
      reason: "选股运行快照缺少有效报价，不能用于买卖或加入追踪收益验证。",
      ageMinutes,
      staleAfterMinutes,
      sessionPhase: session.phase
    };
  }
  if (!basisTime) {
    return {
      level: "reference_only",
      label: "仅可参考",
      reason: "运行快照缺少真实报价时间，不能确认行情是否仍然有效，只能用于研究排队。",
      ageMinutes,
      staleAfterMinutes,
      sessionPhase: session.phase
    };
  }
  if (nonRealtimePhase && !hasRiskWarning && input.quality !== "quote_only" && !missingDecisionFields && !hasStaleKline) {
    return {
      level: "reference_only",
      label: selectionSessionReferenceLabel(session.phase),
      reason: selectionSessionReferenceReason(session.phase),
      ageMinutes,
      staleAfterMinutes,
      sessionPhase: session.phase
    };
  }
  if (isStale || hasRiskWarning || hasStaleKline || input.quality === "quote_only" || missingDecisionFields) {
    return {
      level: "reference_only",
      label: "仅可参考",
      reason: hasRiskWarning
        ? "运行快照存在接口失败、补源或缺失警告，字段可观察但不应直接触发交易动作。"
        : hasStaleKline
          ? "运行快照的K线交易日落后于当前有效交易日，只能用于研究排队，不能作为当前行动依据。"
        : isStale
          ? `运行快照的真实报价时间已超过 ${staleAfterMinutes} 分钟，适合观察，不适合直接触发行动。`
          : "报价可用，但技术、资金或公司字段不完整，只适合作为观察参考。",
      ageMinutes,
      staleAfterMinutes,
      sessionPhase: session.phase
    };
  }
  return {
    level: "actionable",
    label: "可用于当前判断",
    reason: "运行时报价、技术、资金和公司字段覆盖较完整，且时间未明显过期。",
    ageMinutes,
    staleAfterMinutes,
    sessionPhase: session.phase
  };
}

export function __testSelectionSnapshotActionability(input: Parameters<typeof selectionSnapshotActionability>[0]) {
  return selectionSnapshotActionability(input);
}

function isSelectionSnapshotRiskWarning(warning: string) {
  if (/已使用|兜底|批量路径未使用/i.test(warning)) return false;
  return /fetch failed|timeout|error|failed|失败|缺失|空数据|未取得|未返回|偏离超过|不采用/i.test(warning);
}

function inferRuntimeSnapshotCoverage(snapshot: NonNullable<SelectionPick["runtimeSnapshot"]>) {
  return {
    quote: snapshot.latestPrice !== undefined,
    kline: snapshot.klineClose !== undefined || Boolean(snapshot.latestKlineDate),
    technical: Boolean(snapshot.trendState || snapshot.klineClose !== undefined),
    fundFlow: snapshot.mainNetInflow !== undefined || Boolean(snapshot.fundFlowState),
    company: snapshot.quality === "complete"
  };
}

function selectionSessionReferenceLabel(phase: string) {
  if (phase === "postmarket") return "收盘复盘可用";
  if (phase === "midday_break") return "午间复盘可用";
  return "研究可参考";
}

function selectionSessionReferenceReason(phase: string) {
  if (phase === "postmarket") return "当前处于收盘后，选股快照用于复盘、次日计划和追踪维护，不应解释为盘中实时买卖信号。";
  if (phase === "midday_break") return "当前处于午间休盘，上午快照可用于半日复盘，下午承接仍需重新验证。";
  if (phase === "premarket" || phase === "call_auction") return "当前尚未进入连续竞价，快照主要反映上一交易日或竞价参考，不应用作盘中确认。";
  if (phase === "night_research" || phase === "non_trading_day") return "当前不是 A 股连续交易时段，选股快照用于研究、复盘和候选维护，不用于实时行动。";
  return "当前不处于连续交易时段，选股快照只适合观察和复盘。";
}

function ageMinutesFromIso(value?: string, now = new Date().toISOString()) {
  if (!value) return undefined;
  const time = Date.parse(value);
  const nowTime = Date.parse(now);
  if (!Number.isFinite(time)) return undefined;
  if (!Number.isFinite(nowTime)) return undefined;
  return Math.max(0, Math.round((nowTime - time) / 60_000));
}

function traceState(
  traces: NonNullable<StockCandidate["sourceTraces"]>,
  field: string,
  hasSnapshot: boolean
): { state: "fresh" | "snapshot" | "missing"; fetchedAt?: string; warning?: string } {
  const trace = [...traces].reverse().find((item) => item.field === field);
  if (trace?.quality !== "missing" && trace?.fetchedAt) return { state: "fresh", fetchedAt: trace.fetchedAt };
  if (hasSnapshot) return { state: "snapshot", warning: trace?.warning };
  return { state: "missing", warning: trace?.warning };
}
