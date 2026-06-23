import { dbAll, dbGet, dbRun, dbTransaction } from "@/lib/db/client";
import type { AnalysisReport, DataSourceTrace, StockCandidate } from "@/lib/types";

export type ReportProviderSummary = {
  provider: string;
  providerName: string;
  traceCount: number;
  primaryCount: number;
  fallbackCount: number;
  approximateCount: number;
  missingCount: number;
  latestFetchedAt?: string;
  freshnesses: Record<string, number>;
  scopes: Record<string, number>;
  fields: Record<string, number>;
};

export type ReportWarningSummary = NonNullable<AnalysisReport["factPackage"]["dataSource"]["warningDetails"]>[number];

export type ReportCandidateSummary = {
  code: string;
  name: string;
  sectorName: string;
  sectorStage?: string;
  action: string;
  role?: string;
  score?: number;
  strengthScore?: number;
  signalTier?: string;
  price?: number;
  changePct?: number;
  amount?: number;
  turnoverRate?: number;
  mainNetInflow?: number;
  opportunityState?: string;
  buyPointStatus?: string;
  positionLimitPct: number;
  dataLevel?: string;
  mainlineStatus?: string;
  tradabilityStatus?: string;
  trendState?: string;
  fundFlowState?: string;
  reason: string;
  activationConditions: string[];
  blockingReasons: string[];
  nextSteps: string[];
  nextSessionPlan?: NonNullable<StockCandidate["tradability"]>["nextSessionPlan"];
};

export type AnalysisReportSummary = {
  reportId: string;
  reportType: string;
  createdAt: string;
  displayable: number;
  marketState: string;
  maxTotalPositionPct: number;
  providerSummaries: ReportProviderSummary[];
  warningSummaries: ReportWarningSummary[];
  candidateSummaries: ReportCandidateSummary[];
};

export type ReportSummaryMaintenanceResult = {
  scanned: number;
  created: number;
  skippedInvalid: number;
  remainingMissing: number;
  elapsedMs: number;
};

export type ReportSummaryMaintenanceStatus = {
  generatedAt: string;
  fullReportCount: number;
  summaryCount: number;
  missingCount: number;
  coveragePct: number;
  latestReportAt?: string | null;
  latestSummaryAt?: string | null;
};

type SummaryRow = {
  reportId: string;
  reportType: string;
  createdAt: string;
  displayable: number;
  marketState: string | null;
  maxTotalPositionPct: number | null;
  providerSummaryJson: string;
  warningSummaryJson: string;
  candidateSummaryJson: string;
};

type ReportRow = {
  id: string;
  reportType: string;
  createdAt: string;
  displayable: number | null;
  factPackageJson: string;
};

export function persistAnalysisReportSummary(report: Omit<AnalysisReport, "id"> & { id: string }) {
  const summary = buildAnalysisReportSummary(report);
  upsertAnalysisReportSummary(summary);
}

export function listAnalysisReportSummaries(limit = 20): AnalysisReportSummary[] {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 240);
  const rows = dbAll<SummaryRow>(
    `select reportId, reportType, createdAt, displayable, marketState, maxTotalPositionPct, providerSummaryJson, warningSummaryJson, candidateSummaryJson
       from analysis_report_summaries
       where reportType = 'full'
       order by createdAt desc
       limit ?`,
    [safeLimit],
    { label: "analysis_report_summaries.list" }
  );
  if (rows.length >= safeLimit) return rows.map(rowToSummary);

  backfillMissingSummaries(safeLimit);
  const refreshed = dbAll<SummaryRow>(
    `select reportId, reportType, createdAt, displayable, marketState, maxTotalPositionPct, providerSummaryJson, warningSummaryJson, candidateSummaryJson
       from analysis_report_summaries
       where reportType = 'full'
       order by createdAt desc
       limit ?`,
    [safeLimit],
    { label: "analysis_report_summaries.list_after_backfill" }
  );
  return refreshed.map(rowToSummary);
}

export function backfillAnalysisReportSummaries(limit = 200): ReportSummaryMaintenanceResult {
  const startedAt = Date.now();
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 2_000);
  const result = backfillMissingSummaries(safeLimit);
  const remaining = dbAll<{ count: number }>(
    `select count(*) as count
       from analysis_reports reports
       left join analysis_report_summaries summaries on summaries.reportId = reports.id
       where reports.reportType = 'full' and summaries.reportId is null`,
    [],
    { label: "analysis_report_summaries.remaining_missing" }
  )[0]?.count ?? 0;
  return {
    ...result,
    remainingMissing: remaining,
    elapsedMs: Date.now() - startedAt
  };
}

export function getAnalysisReportSummaryMaintenanceStatus(): ReportSummaryMaintenanceStatus {
  const fullReports = dbGet<{ count: number; latestAt: string | null }>(
    `select count(*) as count, max(createdAt) as latestAt
       from analysis_reports
       where reportType = 'full'`,
    undefined,
    { label: "analysis_report_summaries.status.full_reports" }
  );
  const summaries = dbGet<{ count: number; latestAt: string | null }>(
    `select count(*) as count, max(createdSummaryAt) as latestAt
       from analysis_report_summaries
       where reportType = 'full'`,
    undefined,
    { label: "analysis_report_summaries.status.summaries" }
  );
  const missing = dbGet<{ count: number }>(
    `select count(*) as count
       from analysis_reports reports
       left join analysis_report_summaries summaries on summaries.reportId = reports.id
       where reports.reportType = 'full' and summaries.reportId is null`,
    undefined,
    { label: "analysis_report_summaries.status.missing" }
  );
  const fullReportCount = fullReports?.count ?? 0;
  const summaryCount = summaries?.count ?? 0;
  return {
    generatedAt: new Date().toISOString(),
    fullReportCount,
    summaryCount,
    missingCount: missing?.count ?? 0,
    coveragePct: fullReportCount ? Number((summaryCount / fullReportCount * 100).toFixed(1)) : 100,
    latestReportAt: fullReports?.latestAt ?? null,
    latestSummaryAt: summaries?.latestAt ?? null
  };
}

function backfillMissingSummaries(limit: number): Omit<ReportSummaryMaintenanceResult, "remainingMissing" | "elapsedMs"> {
  const rows = dbAll<ReportRow>(
    `select reports.id, reports.reportType, reports.createdAt, reports.displayable, reports.factPackageJson
       from analysis_reports reports
       left join analysis_report_summaries summaries on summaries.reportId = reports.id
       where reports.reportType = 'full' and summaries.reportId is null
       order by reports.createdAt desc
       limit ?`,
    [limit],
    { label: "analysis_reports.summary_backfill_scan", slowMs: 500 }
  );
  if (!rows.length) return { scanned: 0, created: 0, skippedInvalid: 0 };
  let created = 0;
  let skippedInvalid = 0;
  dbTransaction("analysis_report_summaries.backfill", () => {
    for (const row of rows) {
      const factPackage = safeJson<AnalysisReport["factPackage"]>(row.factPackageJson);
      if (!factPackage) {
        skippedInvalid += 1;
        continue;
      }
      upsertAnalysisReportSummary({
        reportId: row.id,
        reportType: row.reportType,
        createdAt: row.createdAt,
        displayable: row.displayable ?? 1,
        marketState: factPackage.ruleResult?.market?.marketState ?? factPackage.market?.marketState ?? "unknown",
        maxTotalPositionPct: factPackage.ruleResult?.market?.maxTotalPositionPct ?? 0,
        providerSummaries: buildProviderSummaries(factPackage.dataSource.traces ?? []),
        warningSummaries: factPackage.dataSource.warningDetails ?? [],
        candidateSummaries: buildCandidateSummaries(factPackage)
      });
      created += 1;
    }
  }, 1000);
  return { scanned: rows.length, created, skippedInvalid };
}

function buildAnalysisReportSummary(report: Omit<AnalysisReport, "id"> & { id: string }): AnalysisReportSummary {
  return {
    reportId: report.id,
    reportType: report.reportType,
    createdAt: report.createdAt,
    displayable: report.factPackage.sectors.length || report.factPackage.candidates.length || report.factPackage.dataSource.status === "success" ? 1 : 0,
    marketState: report.factPackage.ruleResult.market.marketState,
    maxTotalPositionPct: report.factPackage.ruleResult.market.maxTotalPositionPct,
    providerSummaries: buildProviderSummaries(report.factPackage.dataSource.traces ?? []),
    warningSummaries: report.factPackage.dataSource.warningDetails ?? [],
    candidateSummaries: buildCandidateSummaries(report.factPackage)
  };
}

function buildProviderSummaries(traces: DataSourceTrace[]) {
  const map = new Map<string, ReportProviderSummary>();
  for (const trace of traces) {
    const current = map.get(trace.provider) ?? {
      provider: trace.provider,
      providerName: trace.providerName,
      traceCount: 0,
      primaryCount: 0,
      fallbackCount: 0,
      approximateCount: 0,
      missingCount: 0,
      latestFetchedAt: undefined,
      freshnesses: {},
      scopes: {},
      fields: {}
    };
    current.traceCount += 1;
    if (trace.quality === "primary" || trace.quality === "derived") current.primaryCount += 1;
    if (trace.quality === "fallback") current.fallbackCount += 1;
    if (trace.quality === "approximate") current.approximateCount += 1;
    if (trace.quality === "missing") current.missingCount += 1;
    current.latestFetchedAt = maxIso(current.latestFetchedAt, trace.fetchedAt);
    current.freshnesses[trace.freshness] = (current.freshnesses[trace.freshness] ?? 0) + 1;
    current.scopes[trace.scope] = (current.scopes[trace.scope] ?? 0) + 1;
    current.fields[trace.field] = (current.fields[trace.field] ?? 0) + 1;
    map.set(trace.provider, current);
  }
  return Array.from(map.values());
}

function buildCandidateSummaries(factPackage: AnalysisReport["factPackage"]) {
  const sectors = new Map((factPackage.sectors ?? []).map((sector) => [sector.name, sector]));
  return (factPackage.candidates ?? []).map((candidate) => {
    const sector = sectors.get(candidate.sectorName);
    return {
      code: candidate.code,
      name: candidate.name,
      sectorName: candidate.sectorName,
      sectorStage: sector?.stage,
      action: candidate.action,
      role: candidate.role,
      score: candidate.opportunityProfile?.score,
      strengthScore: candidate.strengthScore,
      signalTier: candidate.signalTier,
      price: candidate.price ?? candidate.quote?.latest,
      changePct: candidate.quote?.changePct,
      amount: candidate.quote?.amount,
      turnoverRate: candidate.quote?.turnoverRate,
      mainNetInflow: candidate.quote?.mainNetInflow ?? candidate.fundFlow?.mainNetFlow,
      opportunityState: candidate.opportunityProfile?.state,
      buyPointStatus: candidate.buyPointEvaluation?.status,
      positionLimitPct: candidate.positionLimitPct,
      dataLevel: candidate.dataCompleteness?.level,
      mainlineStatus: candidate.mainlineAttribution?.status,
      tradabilityStatus: candidate.tradability?.status,
      trendState: candidate.trendState,
      fundFlowState: candidate.fundFlowState,
      reason: primaryReason(candidate),
      activationConditions: candidate.opportunityProfile?.activationConditions ?? [],
      blockingReasons: candidate.opportunityProfile?.blockingReasons ?? [],
      nextSteps: candidate.opportunityProfile?.nextSteps ?? [],
      nextSessionPlan: candidate.tradability?.nextSessionPlan
    } satisfies ReportCandidateSummary;
  });
}

function upsertAnalysisReportSummary(summary: AnalysisReportSummary) {
  dbRun(
    `insert into analysis_report_summaries
       (reportId, reportType, createdAt, displayable, marketState, maxTotalPositionPct, providerSummaryJson, warningSummaryJson, candidateSummaryJson, createdSummaryAt)
       values (@reportId, @reportType, @createdAt, @displayable, @marketState, @maxTotalPositionPct, @providerSummaryJson, @warningSummaryJson, @candidateSummaryJson, @createdSummaryAt)
       on conflict(reportId) do update set
         reportType = excluded.reportType,
         createdAt = excluded.createdAt,
         displayable = excluded.displayable,
         marketState = excluded.marketState,
         maxTotalPositionPct = excluded.maxTotalPositionPct,
         providerSummaryJson = excluded.providerSummaryJson,
         warningSummaryJson = excluded.warningSummaryJson,
         candidateSummaryJson = excluded.candidateSummaryJson,
         createdSummaryAt = excluded.createdSummaryAt`,
    {
      reportId: summary.reportId,
      reportType: summary.reportType,
      createdAt: summary.createdAt,
      displayable: summary.displayable,
      marketState: summary.marketState,
      maxTotalPositionPct: summary.maxTotalPositionPct,
      providerSummaryJson: JSON.stringify(summary.providerSummaries),
      warningSummaryJson: JSON.stringify(summary.warningSummaries),
      candidateSummaryJson: JSON.stringify(summary.candidateSummaries),
      createdSummaryAt: new Date().toISOString()
    },
    { label: "analysis_report_summaries.upsert", slowMs: 300 }
  );
}

function rowToSummary(row: SummaryRow): AnalysisReportSummary {
  return {
    reportId: row.reportId,
    reportType: row.reportType,
    createdAt: row.createdAt,
    displayable: row.displayable,
    marketState: row.marketState ?? "unknown",
    maxTotalPositionPct: row.maxTotalPositionPct ?? 0,
    providerSummaries: safeJson<ReportProviderSummary[]>(row.providerSummaryJson) ?? [],
    warningSummaries: safeJson<ReportWarningSummary[]>(row.warningSummaryJson) ?? [],
    candidateSummaries: safeJson<ReportCandidateSummary[]>(row.candidateSummaryJson) ?? []
  };
}

function primaryReason(candidate: StockCandidate) {
  return candidate.opportunityProfile?.primaryReason
    ?? candidate.buyPointEvaluation?.blockers?.[0]
    ?? candidate.tradability?.blockers?.[0]
    ?? candidate.dataCompleteness?.blockingReasons?.[0]
    ?? candidate.riskFlags?.[0]
    ?? candidate.invalidCondition
    ?? "未记录原因";
}

function maxIso(left: string | undefined, right: string | undefined) {
  if (!right) return left;
  if (!left) return right;
  return right > left ? right : left;
}

function safeJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
