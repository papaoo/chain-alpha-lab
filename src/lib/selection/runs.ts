import crypto from "node:crypto";
import { dbAll, dbGet, dbRun } from "@/lib/db/client";
import { normalizeSelectionAction } from "@/lib/selection/insights";
import { attachSerenityTagsToPicks } from "@/lib/selection/serenity-tags";
import { runSelectionAgentReview } from "@/lib/selection/agent-workflow";
import { annotateSelectionFreshness } from "@/lib/selection/freshness";
import { buildSelectionWarningSummary, classifySelectionWarning } from "@/lib/selection/warning-severity";
import { normalizeSelectionPickRuntimeBoundary } from "@/lib/selection/scoring-utils";
import { getSelectionStrategy } from "@/lib/selection/strategies";
import { runMainForceAccumulation } from "@/lib/selection/strategy-main-force-accumulation";
import { runShortTermBreakout } from "@/lib/selection/strategy-breakout";
import { runValueStable } from "@/lib/selection/strategy-value-stable";
import { runGrowthPotential } from "@/lib/selection/strategy-growth-potential";
import { runSectorRotation } from "@/lib/selection/strategy-sector-rotation";
import { runLowRiskReturn } from "@/lib/selection/strategy-low-risk-return";
import {
  LEGACY_SELECTION_RULE_VERSION,
  SELECTION_RULE_VERSION,
  SELECTION_RULE_VERSION_LABEL
} from "@/lib/selection/version";
import type {
  SelectionRunMode,
  SelectionPick,
  SelectionRunRecord,
  SelectionRunRequest,
  SelectionRunResult,
  SelectionRunSummary,
  SelectionStrategyDefinition,
  SelectionStrategyId
} from "@/lib/selection/types";

type SelectionRunRow = {
  id: string;
  strategyId: string;
  strategyName: string;
  mode: SelectionRunMode;
  status: SelectionRunRecord["status"];
  startedAt: string;
  finishedAt: string | null;
  ruleVersion: string | null;
  sourceReportId: string | null;
  sourceReportCreatedAt: string | null;
  sourceReportTradeDate: string | null;
  runEffectiveTradeDate: string | null;
  freshnessStatus: SelectionRunResult["freshnessStatus"] | null;
  candidateCount: number;
  pickCount: number;
  rejectedCount: number | null;
  topPickPreviewJson: string | null;
  parametersJson: string;
  resultJson: string | null;
  warningsJson: string;
  errorMessage: string | null;
};

const RULE_RUNNERS: Record<SelectionStrategyId, (strategy: SelectionStrategyDefinition, parameters: Record<string, unknown>) => Promise<SelectionRunResult>> = {
  main_force_accumulation: runMainForceAccumulation,
  short_term_breakout: runShortTermBreakout,
  value_stable: runValueStable,
  growth_potential: runGrowthPotential,
  sector_rotation: runSectorRotation,
  low_risk_return: runLowRiskReturn
};
const STALE_RUNNING_RUN_MS = 45 * 60 * 1000;
const SELECTION_RUN_LIST_CACHE_TTL_MS = 5_000;
const STALE_RUNNING_CHECK_INTERVAL_MS = 15_000;

type SelectionRunListCacheEntry<T> = {
  expiresAt: number;
  data: T;
};

const globalSelectionRunCache = globalThis as typeof globalThis & {
  __chainAlphaSelectionRunListCache?: Map<string, SelectionRunListCacheEntry<SelectionRunRecord[] | SelectionRunSummary[]>>;
  __chainAlphaSelectionRunStaleCheckAt?: number;
};

function getSelectionRunListCache() {
  const cache = globalSelectionRunCache.__chainAlphaSelectionRunListCache ?? new Map<string, SelectionRunListCacheEntry<SelectionRunRecord[] | SelectionRunSummary[]>>();
  globalSelectionRunCache.__chainAlphaSelectionRunListCache = cache;
  return cache;
}

export function listSelectionRuns(limit = 20): SelectionRunRecord[] {
  markStaleRunningSelectionRuns();
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const cacheKey = `runs:${safeLimit}`;
  const cached = getSelectionRunListCache().get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data as SelectionRunRecord[];
  const rows = dbAll<SelectionRunRow>(
    `select *
     from selection_runs
     order by startedAt desc
     limit ?`,
    [safeLimit],
    { label: "selection_runs.list" }
  );
  const data = rows.map(rowToRun);
  getSelectionRunListCache().set(cacheKey, { data, expiresAt: Date.now() + SELECTION_RUN_LIST_CACHE_TTL_MS });
  return data;
}

export function listSelectionRunSummaries(limit = 20): SelectionRunSummary[] {
  markStaleRunningSelectionRuns();
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const cacheKey = `summaries:${safeLimit}`;
  const cached = getSelectionRunListCache().get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data as SelectionRunSummary[];
  const rows = dbAll<Omit<SelectionRunRow, "parametersJson" | "resultJson">>(
    `select id, strategyId, strategyName, mode, status, startedAt, finishedAt, ruleVersion, sourceReportId, sourceReportCreatedAt, sourceReportTradeDate, runEffectiveTradeDate, freshnessStatus, candidateCount, pickCount, rejectedCount, topPickPreviewJson, warningsJson, errorMessage
     from selection_runs
     order by startedAt desc
     limit ?`,
    [safeLimit],
    { label: "selection_runs.list_summary" }
  );
  const data = rows.map(rowToSummary);
  getSelectionRunListCache().set(cacheKey, { data, expiresAt: Date.now() + SELECTION_RUN_LIST_CACHE_TTL_MS });
  return data;
}

export function getSelectionRun(id: string): SelectionRunRecord | null {
  markStaleRunningSelectionRuns();
  const row = dbGet<SelectionRunRow>(
    "select * from selection_runs where id = ?",
    [id],
    { label: "selection_runs.get" }
  );
  return row ? rowToRun(row) : null;
}

export async function createSelectionRun(input: SelectionRunRequest): Promise<SelectionRunRecord> {
  const mode = input.mode ?? "rule";
  const startedAt = new Date().toISOString();
  const strategy = getSelectionStrategy(input.strategyId);
  assertSelectionRunInput(strategy, mode, input.strategyId);

  const parameters = normalizeParameters(strategy, input.parameters ?? {});
  const id = crypto.randomUUID();
  try {
    const record = await executeSelectionRun({ id, strategy, mode, parameters, startedAt });
    insertRun(record);
    invalidateSelectionRunListCache();
    return record;
  } catch (error) {
    const record = buildFailedRun({ id, strategy, mode, parameters, startedAt, error });
    insertRun(record);
    invalidateSelectionRunListCache();
    throw error;
  }
}

export function startSelectionRunJob(input: SelectionRunRequest): SelectionRunRecord {
  const mode = input.mode ?? "rule";
  const startedAt = new Date().toISOString();
  const strategy = getSelectionStrategy(input.strategyId);
  assertSelectionRunInput(strategy, mode, input.strategyId);
  const parameters = normalizeParameters(strategy, input.parameters ?? {});
  const id = crypto.randomUUID();
  const record = buildRunningRun({ id, strategy, mode, parameters, startedAt });
  insertRun(record);
  invalidateSelectionRunListCache();
  void runSelectionJob({ id, strategy, mode, parameters, startedAt });
  return record;
}

async function runSelectionJob({
  id,
  strategy,
  mode,
  parameters,
  startedAt
}: {
  id: string;
  strategy: SelectionStrategyDefinition;
  mode: SelectionRunMode;
  parameters: Record<string, unknown>;
  startedAt: string;
}) {
  try {
    const record = await executeSelectionRun({ id, strategy, mode, parameters, startedAt });
    updateRun(record);
    invalidateSelectionRunListCache();
  } catch (error) {
    updateRun(buildFailedRun({ id, strategy, mode, parameters, startedAt, error }));
    invalidateSelectionRunListCache();
  }
}

async function executeSelectionRun({
  id,
  strategy,
  mode,
  parameters,
  startedAt
}: {
  id: string;
  strategy: SelectionStrategyDefinition;
  mode: SelectionRunMode;
  parameters: Record<string, unknown>;
  startedAt: string;
}): Promise<SelectionRunRecord> {
  const ruleResult = annotateSelectionFreshness(await RULE_RUNNERS[strategy.id](strategy, parameters), startedAt);
  const result: SelectionRunResult = mode === "agent"
    ? {
        ...ruleResult,
        mode: "agent",
        ...(await runSelectionAgentReview(strategy, { ...ruleResult, mode: "agent" }))
      }
    : ruleResult;
  return {
    id,
    status: "success",
    startedAt,
    finishedAt: new Date().toISOString(),
    ruleVersion: SELECTION_RULE_VERSION,
    ruleVersionLabel: SELECTION_RULE_VERSION_LABEL,
    candidateCount: result.picks.length + result.rejected.length,
    pickCount: result.picks.length,
    ...result
  };
}

function buildRunningRun({
  id,
  strategy,
  mode,
  parameters,
  startedAt
}: {
  id: string;
  strategy: SelectionStrategyDefinition;
  mode: SelectionRunMode;
  parameters: Record<string, unknown>;
  startedAt: string;
}): SelectionRunRecord {
  return {
    id,
    strategyId: strategy.id,
    strategyName: strategy.name,
    mode,
    status: "running",
    startedAt,
    ruleVersion: SELECTION_RULE_VERSION,
    ruleVersionLabel: SELECTION_RULE_VERSION_LABEL,
    candidateCount: 0,
    pickCount: 0,
    parameters,
    picks: [],
    rejected: [],
    warnings: ["选股任务已进入后台运行，结果生成前不会作为交易信号使用。"],
    dataBasis: "后台运行中：正在读取候选池、刷新行情并执行策略评分。"
  };
}

function buildFailedRun({
  id,
  strategy,
  mode,
  parameters,
  startedAt,
  error
}: {
  id: string;
  strategy: SelectionStrategyDefinition;
  mode: SelectionRunMode;
  parameters: Record<string, unknown>;
  startedAt: string;
  error: unknown;
}): SelectionRunRecord {
  return {
    id,
    strategyId: strategy.id,
    strategyName: strategy.name,
    mode,
    status: "failed",
    startedAt,
    finishedAt: new Date().toISOString(),
    ruleVersion: SELECTION_RULE_VERSION,
    ruleVersionLabel: SELECTION_RULE_VERSION_LABEL,
    candidateCount: 0,
    pickCount: 0,
    parameters,
    picks: [],
    rejected: [],
    warnings: [],
    dataBasis: "运行失败，未形成有效候选池结果。",
    errorMessage: error instanceof Error ? error.message : String(error)
  };
}

function assertSelectionRunInput(
  strategy: SelectionStrategyDefinition | null | undefined,
  mode: SelectionRunMode,
  strategyId: SelectionStrategyId
): asserts strategy is SelectionStrategyDefinition {
  if (!strategy) throw new Error(`未知选股策略：${strategyId}`);
  if (mode !== "rule" && mode !== "agent") throw new Error(`不支持的选股运行模式：${mode}`);
}

function normalizeParameters(strategy: SelectionStrategyDefinition, input: Record<string, unknown>) {
  const defaults = Object.fromEntries(strategy.parameters.map((param) => [param.key, param.defaultValue]));
  return { ...defaults, ...input };
}

function rowToRun(row: SelectionRunRow): SelectionRunRecord {
  const result = row.resultJson ? safeJson<SelectionRunResult | null>(row.resultJson, null) : null;
  const parameters = safeJson<Record<string, unknown>>(row.parametersJson, {});
  const warnings = safeJson<string[]>(row.warningsJson, []);
  const picks = normalizePicks(result?.picks ?? []);
  const rejected = normalizePicks(result?.rejected ?? []);
  return {
    id: row.id,
    strategyId: row.strategyId as SelectionRunRecord["strategyId"],
    strategyName: row.strategyName,
    mode: row.mode,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt ?? undefined,
    sourceReportId: row.sourceReportId ?? result?.sourceReportId,
    sourceReportCreatedAt: row.sourceReportCreatedAt ?? result?.sourceReportCreatedAt,
    sourceReportTradeDate: row.sourceReportTradeDate ?? result?.sourceReportTradeDate,
    runEffectiveTradeDate: row.runEffectiveTradeDate ?? result?.runEffectiveTradeDate,
    freshnessStatus: row.freshnessStatus ?? result?.freshnessStatus,
    ruleVersion: row.ruleVersion ?? result?.ruleVersion ?? LEGACY_SELECTION_RULE_VERSION,
    ruleVersionLabel: result?.ruleVersionLabel ?? getRuleVersionLabel(row.ruleVersion),
    candidateCount: row.candidateCount,
    pickCount: row.pickCount,
    parameters,
    picks: attachSerenityTagsToPicks(picks),
    rejected: attachSerenityTagsToPicks(rejected),
    warnings,
    dataBasis: result?.dataBasis ?? "未生成结果",
    agentReports: result?.agentReports,
    finalReview: result?.finalReview,
    llmStatus: result?.llmStatus,
    llmErrors: result?.llmErrors,
    llmMetrics: result?.llmMetrics,
  errorMessage: row.errorMessage ?? undefined
  };
}

function markStaleRunningSelectionRuns() {
  const now = Date.now();
  if ((globalSelectionRunCache.__chainAlphaSelectionRunStaleCheckAt ?? 0) + STALE_RUNNING_CHECK_INTERVAL_MS > now) return;
  globalSelectionRunCache.__chainAlphaSelectionRunStaleCheckAt = now;
  const staleBefore = new Date(Date.now() - STALE_RUNNING_RUN_MS).toISOString();
  const stale = dbGet<{ id: string }>(
    "select id from selection_runs where status = 'running' and startedAt < ? limit 1",
    [staleBefore],
    { label: "selection_runs.find_stale_running" }
  );
  if (!stale) return;
  const finishedAt = new Date().toISOString();
  const warning = "后台任务超过45分钟未完成，系统判断本次运行可能已因服务重启或进程中断而失效。请重新运行该策略。";
  dbRun(
    `update selection_runs
     set status = 'failed',
         finishedAt = coalesce(finishedAt, @finishedAt),
         warningsJson = @warningsJson,
         errorMessage = coalesce(errorMessage, @errorMessage)
     where status = 'running'
       and startedAt < @staleBefore`,
    {
      finishedAt,
      staleBefore,
      warningsJson: JSON.stringify([warning]),
      errorMessage: "选股后台任务可能已中断"
    },
    { label: "selection_runs.mark_stale_running" }
  );
  invalidateSelectionRunListCache();
}

function invalidateSelectionRunListCache() {
  getSelectionRunListCache().clear();
}

function rowToSummary(row: Omit<SelectionRunRow, "parametersJson" | "resultJson">): SelectionRunSummary {
  const allWarnings = safeJson<string[]>(row.warningsJson, []);
  const sourceReportTradeDate = row.sourceReportTradeDate ?? chinaTradeDateFromIso(row.sourceReportCreatedAt ?? undefined);
  const runEffectiveTradeDate = row.runEffectiveTradeDate ?? chinaTradeDateFromIso(row.startedAt);
  const freshnessStatus = row.freshnessStatus ?? inferFreshnessStatus(sourceReportTradeDate, runEffectiveTradeDate);
  const topPickPreview = row.topPickPreviewJson
    ? safeJson<SelectionRunSummary["topPickPreview"]>(row.topPickPreviewJson, [])
    : [];
  const normalizedTopPickPreview = normalizePicks(topPickPreview as SelectionPick[]) as SelectionRunSummary["topPickPreview"];
  const warningSummary = buildSelectionWarningSummary(allWarnings, { freshnessStatus, topPickPreview: normalizedTopPickPreview });
  return {
    id: row.id,
    strategyId: row.strategyId as SelectionRunSummary["strategyId"],
    strategyName: row.strategyName,
    mode: row.mode,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt ?? undefined,
    sourceReportId: row.sourceReportId ?? undefined,
    sourceReportCreatedAt: row.sourceReportCreatedAt ?? undefined,
    sourceReportTradeDate,
    runEffectiveTradeDate,
    freshnessStatus,
    ruleVersion: row.ruleVersion ?? LEGACY_SELECTION_RULE_VERSION,
    ruleVersionLabel: getRuleVersionLabel(row.ruleVersion),
    candidateCount: row.candidateCount,
    pickCount: row.pickCount,
    rejectedCount: row.rejectedCount ?? Math.max(0, row.candidateCount - row.pickCount),
    warningCount: allWarnings.length,
    warnings: allWarnings.slice(0, 5),
    warningPreview: buildSelectionWarningPreview(allWarnings, warningSummary.primaryWarning),
    warningSummary,
    topPickPreview: normalizedTopPickPreview,
    errorMessage: row.errorMessage ?? undefined
  };
}

function buildSelectionWarningPreview(warnings: string[], primaryWarning?: string) {
  const score = (warning: string) => {
    const classified = classifySelectionWarning(warning);
    const severity = classified.severity === "risk" ? 0 : classified.severity === "warning" ? 1 : 2;
    return severity;
  };
  const sorted = warnings
    .slice()
    .sort((left, right) => {
      if (primaryWarning && left === primaryWarning) return -1;
      if (primaryWarning && right === primaryWarning) return 1;
      return score(left) - score(right);
    });
  return Array.from(new Set(sorted)).slice(0, 5);
}

function insertRun(record: SelectionRunRecord) {
  dbRun(
    `insert into selection_runs
     (id, strategyId, strategyName, mode, status, startedAt, finishedAt, ruleVersion, sourceReportId, sourceReportCreatedAt, sourceReportTradeDate, runEffectiveTradeDate, freshnessStatus, candidateCount, pickCount, rejectedCount, topPickPreviewJson, parametersJson, resultJson, warningsJson, errorMessage)
     values (@id, @strategyId, @strategyName, @mode, @status, @startedAt, @finishedAt, @ruleVersion, @sourceReportId, @sourceReportCreatedAt, @sourceReportTradeDate, @runEffectiveTradeDate, @freshnessStatus, @candidateCount, @pickCount, @rejectedCount, @topPickPreviewJson, @parametersJson, @resultJson, @warningsJson, @errorMessage)`,
    {
      id: record.id,
      strategyId: record.strategyId,
      strategyName: record.strategyName,
      mode: record.mode,
      status: record.status,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt ?? null,
      ruleVersion: record.ruleVersion ?? SELECTION_RULE_VERSION,
      sourceReportId: record.sourceReportId ?? null,
      sourceReportCreatedAt: record.sourceReportCreatedAt ?? null,
      sourceReportTradeDate: record.sourceReportTradeDate ?? null,
      runEffectiveTradeDate: record.runEffectiveTradeDate ?? null,
      freshnessStatus: record.freshnessStatus ?? null,
      candidateCount: record.candidateCount,
      pickCount: record.pickCount,
      rejectedCount: record.rejected.length,
      topPickPreviewJson: JSON.stringify(buildTopPickPreview(record.picks)),
      parametersJson: JSON.stringify(record.parameters),
      resultJson: record.status === "success" ? JSON.stringify(toResult(record)) : null,
      warningsJson: JSON.stringify(record.warnings),
      errorMessage: record.errorMessage ?? null
    },
    { label: "selection_runs.insert" }
  );
}

function updateRun(record: SelectionRunRecord) {
  dbRun(
    `update selection_runs
     set status = @status,
         finishedAt = @finishedAt,
         ruleVersion = @ruleVersion,
         sourceReportId = @sourceReportId,
         sourceReportCreatedAt = @sourceReportCreatedAt,
         sourceReportTradeDate = @sourceReportTradeDate,
         runEffectiveTradeDate = @runEffectiveTradeDate,
         freshnessStatus = @freshnessStatus,
         candidateCount = @candidateCount,
         pickCount = @pickCount,
         rejectedCount = @rejectedCount,
         topPickPreviewJson = @topPickPreviewJson,
         resultJson = @resultJson,
         warningsJson = @warningsJson,
         errorMessage = @errorMessage
     where id = @id`,
    {
      id: record.id,
      status: record.status,
      finishedAt: record.finishedAt ?? null,
      ruleVersion: record.ruleVersion ?? SELECTION_RULE_VERSION,
      sourceReportId: record.sourceReportId ?? null,
      sourceReportCreatedAt: record.sourceReportCreatedAt ?? null,
      sourceReportTradeDate: record.sourceReportTradeDate ?? null,
      runEffectiveTradeDate: record.runEffectiveTradeDate ?? null,
      freshnessStatus: record.freshnessStatus ?? null,
      candidateCount: record.candidateCount,
      pickCount: record.pickCount,
      rejectedCount: record.rejected.length,
      topPickPreviewJson: JSON.stringify(buildTopPickPreview(record.picks)),
      resultJson: record.status === "success" ? JSON.stringify(toResult(record)) : null,
      warningsJson: JSON.stringify(record.warnings),
      errorMessage: record.errorMessage ?? null
    },
    { label: "selection_runs.update" }
  );
}

function toResult(record: SelectionRunRecord): SelectionRunResult {
  return {
    strategyId: record.strategyId,
    strategyName: record.strategyName,
    mode: record.mode,
    ruleVersion: record.ruleVersion ?? SELECTION_RULE_VERSION,
    ruleVersionLabel: record.ruleVersionLabel ?? SELECTION_RULE_VERSION_LABEL,
    sourceReportId: record.sourceReportId,
    sourceReportCreatedAt: record.sourceReportCreatedAt,
    sourceReportTradeDate: record.sourceReportTradeDate,
    runEffectiveTradeDate: record.runEffectiveTradeDate,
    freshnessStatus: record.freshnessStatus,
    parameters: record.parameters,
    picks: record.picks,
    rejected: record.rejected,
    warnings: record.warnings,
    dataBasis: record.dataBasis,
    agentReports: record.agentReports,
    finalReview: record.finalReview,
    llmStatus: record.llmStatus,
    llmErrors: record.llmErrors,
    llmMetrics: record.llmMetrics
  };
}

function buildTopPickPreview(picks: SelectionPick[]): SelectionRunSummary["topPickPreview"] {
  return picks.slice(0, 3).map((pick) => ({
    code: pick.code,
    name: pick.name,
    sectorName: pick.sectorName,
    price: pick.price,
    changePct: pick.changePct,
    score: pick.score,
    tier: pick.tier,
    action: pick.action,
    runtimeSnapshot: pick.runtimeSnapshot,
    dataFreshness: pick.dataFreshness
  }));
}

function normalizePicks(picks: SelectionPick[]): SelectionPick[] {
  return picks.map((pick) => normalizeSelectionPickRuntimeBoundary({
    ...pick,
    action: normalizeSelectionAction(pick.action)
  }));
}

function getRuleVersionLabel(ruleVersion: string | null) {
  if (!ruleVersion) return LEGACY_SELECTION_RULE_VERSION;
  if (ruleVersion === SELECTION_RULE_VERSION) return SELECTION_RULE_VERSION_LABEL;
  return ruleVersion;
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function chinaTradeDateFromIso(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (!map.year || !map.month || !map.day) return undefined;
  return `${map.year}${map.month}${map.day}`;
}

function inferFreshnessStatus(sourceTradeDate?: string, runTradeDate?: string): SelectionRunResult["freshnessStatus"] {
  if (!sourceTradeDate || !runTradeDate) return "unknown";
  if (sourceTradeDate < runTradeDate) return "stale";
  if (sourceTradeDate > runTradeDate) return "unknown";
  return "current";
}
