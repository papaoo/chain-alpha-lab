import crypto from "node:crypto";
import { dbAll, dbGet, dbRun } from "@/lib/db/client";
import { normalizeSelectionAction } from "@/lib/selection/insights";
import { runSelectionAgentReview } from "@/lib/selection/agent-workflow";
import { annotateSelectionFreshness } from "@/lib/selection/freshness";
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

export function listSelectionRuns(limit = 20): SelectionRunRecord[] {
  const rows = dbAll<SelectionRunRow>(
    `select *
     from selection_runs
     order by startedAt desc
     limit ?`,
    [Math.min(Math.max(limit, 1), 100)],
    { label: "selection_runs.list" }
  );
  return rows.map(rowToRun);
}

export function listSelectionRunSummaries(limit = 20): SelectionRunSummary[] {
  const rows = dbAll<Omit<SelectionRunRow, "parametersJson">>(
    `select id, strategyId, strategyName, mode, status, startedAt, finishedAt, ruleVersion, sourceReportId, candidateCount, pickCount, rejectedCount, topPickPreviewJson, resultJson, warningsJson, errorMessage
     from selection_runs
     order by startedAt desc
     limit ?`,
    [Math.min(Math.max(limit, 1), 200)],
    { label: "selection_runs.list_summary" }
  );
  return rows.map(rowToSummary);
}

export function getSelectionRun(id: string): SelectionRunRecord | null {
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
  if (!strategy) throw new Error(`未知选股策略：${input.strategyId}`);
  if (mode !== "rule" && mode !== "agent") throw new Error(`不支持的选股运行模式：${mode}`);

  const parameters = normalizeParameters(strategy, input.parameters ?? {});
  const id = crypto.randomUUID();
  try {
    const ruleResult = annotateSelectionFreshness(await RULE_RUNNERS[strategy.id](strategy, parameters), startedAt);
    const result: SelectionRunResult = mode === "agent"
      ? {
          ...ruleResult,
          mode: "agent",
          ...(await runSelectionAgentReview(strategy, { ...ruleResult, mode: "agent" }))
        }
      : ruleResult;
    const record: SelectionRunRecord = {
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
    insertRun(record);
    return record;
  } catch (error) {
    const record: SelectionRunRecord = {
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
      dataBasis: "最新分析报告候选池",
      errorMessage: error instanceof Error ? error.message : String(error)
    };
    insertRun(record);
    throw error;
  }
}

function normalizeParameters(strategy: SelectionStrategyDefinition, input: Record<string, unknown>) {
  const defaults = Object.fromEntries(strategy.parameters.map((param) => [param.key, param.defaultValue]));
  return { ...defaults, ...input };
}

function rowToRun(row: SelectionRunRow): SelectionRunRecord {
  const result = row.resultJson ? safeJson<SelectionRunResult | null>(row.resultJson, null) : null;
  const parameters = safeJson<Record<string, unknown>>(row.parametersJson, {});
  const warnings = safeJson<string[]>(row.warningsJson, []);
  return {
    id: row.id,
    strategyId: row.strategyId as SelectionRunRecord["strategyId"],
    strategyName: row.strategyName,
    mode: row.mode,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt ?? undefined,
    sourceReportId: row.sourceReportId ?? result?.sourceReportId,
    sourceReportCreatedAt: result?.sourceReportCreatedAt,
    ruleVersion: row.ruleVersion ?? result?.ruleVersion ?? LEGACY_SELECTION_RULE_VERSION,
    ruleVersionLabel: result?.ruleVersionLabel ?? getRuleVersionLabel(row.ruleVersion),
    candidateCount: row.candidateCount,
    pickCount: row.pickCount,
    parameters,
    picks: normalizePicks(result?.picks ?? []),
    rejected: normalizePicks(result?.rejected ?? []),
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

function rowToSummary(row: Omit<SelectionRunRow, "parametersJson">): SelectionRunSummary {
  const warnings = safeJson<string[]>(row.warningsJson, []);
  const result = row.resultJson ? safeJson<SelectionRunResult | null>(row.resultJson, null) : null;
  const topPickPreview = row.topPickPreviewJson
    ? safeJson<SelectionRunSummary["topPickPreview"]>(row.topPickPreviewJson, [])
    : [];
  return {
    id: row.id,
    strategyId: row.strategyId as SelectionRunSummary["strategyId"],
    strategyName: row.strategyName,
    mode: row.mode,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt ?? undefined,
    sourceReportId: row.sourceReportId ?? undefined,
    sourceReportCreatedAt: result?.sourceReportCreatedAt,
    ruleVersion: row.ruleVersion ?? LEGACY_SELECTION_RULE_VERSION,
    ruleVersionLabel: getRuleVersionLabel(row.ruleVersion),
    candidateCount: row.candidateCount,
    pickCount: row.pickCount,
    rejectedCount: row.rejectedCount ?? Math.max(0, row.candidateCount - row.pickCount),
    warningCount: warnings.length,
    warnings,
    topPickPreview: topPickPreview.map((pick) => ({
      ...pick,
      action: normalizeSelectionAction(pick.action)
    })),
    errorMessage: row.errorMessage ?? undefined
  };
}

function insertRun(record: SelectionRunRecord) {
  dbRun(
    `insert into selection_runs
     (id, strategyId, strategyName, mode, status, startedAt, finishedAt, ruleVersion, sourceReportId, candidateCount, pickCount, rejectedCount, topPickPreviewJson, parametersJson, resultJson, warningsJson, errorMessage)
     values (@id, @strategyId, @strategyName, @mode, @status, @startedAt, @finishedAt, @ruleVersion, @sourceReportId, @candidateCount, @pickCount, @rejectedCount, @topPickPreviewJson, @parametersJson, @resultJson, @warningsJson, @errorMessage)`,
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
      candidateCount: record.candidateCount,
      pickCount: record.pickCount,
      rejectedCount: record.rejected.length,
      topPickPreviewJson: JSON.stringify(record.picks.slice(0, 3).map((pick) => ({
        code: pick.code,
        name: pick.name,
        score: pick.score,
        tier: pick.tier,
        action: pick.action
      }))),
      parametersJson: JSON.stringify(record.parameters),
      resultJson: record.status === "success" ? JSON.stringify(toResult(record)) : null,
      warningsJson: JSON.stringify(record.warnings),
      errorMessage: record.errorMessage ?? null
    },
    { label: "selection_runs.insert" }
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

function normalizePicks(picks: SelectionPick[]): SelectionPick[] {
  return picks.map((pick) => ({
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
