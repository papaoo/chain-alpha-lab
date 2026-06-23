import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { getDatabasePath } from "@/lib/config";
import { assertActiveDatabaseProvider } from "@/lib/db/provider";

let db: Database.Database | null = null;

export function getDb() {
  if (db) return db;

  assertActiveDatabaseProvider();
  const dbPath = path.resolve(process.cwd(), getDatabasePath());
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(database: Database.Database) {
  database.exec(`
    create table if not exists settings (
      id integer primary key autoincrement,
      key text not null unique,
      value text not null,
      encrypted integer not null default 0,
      updatedAt text not null
    );

    create table if not exists notification_channels (
      id text primary key,
      type text not null,
      name text not null,
      webhookUrl text not null,
      enabled integer not null default 1,
      createdAt text not null,
      updatedAt text not null
    );

    create table if not exists scheduled_jobs (
      id text primary key,
      name text not null,
      cron text not null,
      enabled integer not null default 1,
      jobType text not null,
      lastRunAt text,
      nextRunAt text
    );

    create table if not exists analysis_reports (
      id text primary key,
      reportType text not null,
      title text not null,
      summary text not null,
      rawDataJson text not null,
      ruleResultJson text not null,
      factPackageJson text not null,
      llmResultJson text,
      llmStatus text not null,
      displayable integer not null default 1,
      reportStatus text not null,
      createdAt text not null
    );

    create index if not exists idx_analysis_reports_created
      on analysis_reports(createdAt desc);

    create index if not exists idx_analysis_reports_type_created
      on analysis_reports(reportType, createdAt desc);

    create table if not exists model_audit_feedback (
      id text primary key,
      reportId text not null,
      summary text not null,
      feedbackJson text not null,
      status text not null default '待评估',
      itemCount integer not null default 0,
      highPriorityCount integer not null default 0,
      categorySummaryJson text,
      createdAt text not null,
      updatedAt text not null
    );

    create index if not exists idx_model_audit_feedback_created
      on model_audit_feedback(createdAt desc);

    create index if not exists idx_model_audit_feedback_report
      on model_audit_feedback(reportId);

    create table if not exists model_audit_feedback_events (
      id text primary key,
      feedbackId text not null,
      eventType text not null,
      fromStatus text,
      toStatus text not null,
      note text not null,
      createdAt text not null
    );

    create index if not exists idx_model_audit_feedback_events_feedback_created
      on model_audit_feedback_events(feedbackId, createdAt asc);

    create table if not exists stock_memories (
      code text primary key,
      name text not null,
      firstSeenAt text not null,
      lastSeenAt text not null,
      seenCount integer not null default 0,
      lastReportId text not null,
      lastAction text not null,
      lastPositionLimitPct real not null default 0,
      lastSectorName text not null,
      lastTrendState text not null,
      lastFundFlowState text not null,
      lastPrice real,
      lastInvalidCondition text not null,
      lastSummary text not null
    );

    create table if not exists stock_memory_snapshots (
      id text primary key,
      code text not null,
      name text not null,
      reportId text not null,
      createdAt text not null,
      action text not null,
      sectorName text not null,
      trendState text not null,
      fundFlowState text not null,
      price real,
      positionLimitPct real not null default 0,
      invalidCondition text not null,
      summary text not null,
      rawJson text not null
    );

    create index if not exists idx_stock_memory_snapshots_code_created
      on stock_memory_snapshots(code, createdAt desc);

    create table if not exists market_snapshots (
      id text primary key,
      reportId text not null,
      createdAt text not null,
      sessionPhase text not null,
      marketState text not null,
      marketRegime text,
      tradeMode text,
      sentimentCycle text,
      score real not null,
      breadthUpPct real,
      breadthMedianChangePct real,
      breadthScore real,
      llmStatus text not null,
      rawJson text not null
    );

    create index if not exists idx_market_snapshots_created
      on market_snapshots(createdAt desc);

    create index if not exists idx_market_snapshots_report_created
      on market_snapshots(reportId, createdAt desc);

    create table if not exists sector_snapshots (
      id text primary key,
      reportId text not null,
      createdAt text not null,
      name text not null,
      normalizedName text not null,
      stage text not null,
      score real not null,
      rank integer not null,
      fundScore real,
      breadthScore real,
      coreScore real,
      rawJson text not null
    );

    create index if not exists idx_sector_snapshots_name_created
      on sector_snapshots(normalizedName, createdAt desc);

    create index if not exists idx_sector_snapshots_report_rank
      on sector_snapshots(reportId, rank);

    create table if not exists stock_signal_snapshots (
      id text primary key,
      reportId text not null,
      createdAt text not null,
      code text not null,
      name text not null,
      sectorName text not null,
      action text not null,
      trendState text not null,
      fundFlowState text not null,
      buyPointStatus text,
      buyPointType text,
      score real not null,
      price real,
      positionLimitPct real not null,
      dataCompletenessLevel text not null,
      rawJson text not null
    );

    create index if not exists idx_stock_signal_snapshots_code_created
      on stock_signal_snapshots(code, createdAt desc);

    create index if not exists idx_stock_signal_snapshots_created
      on stock_signal_snapshots(createdAt desc);

    create table if not exists stock_tracking_items (
      id text primary key,
      code text not null,
      name text not null,
      source text not null,
      status text not null,
      entryMode text not null,
      simulatedPrice real,
      simulatedPositionPct real not null default 0,
      sourceReportId text,
      sourceStrategyRunId text,
      sectorName text,
      thesis text not null,
      invalidCondition text not null,
      watchConditionsJson text not null,
      riskNotesJson text not null,
      createdAt text not null,
      updatedAt text not null,
      closedAt text
    );

    create index if not exists idx_stock_tracking_items_status_updated
      on stock_tracking_items(status, updatedAt desc);

    create index if not exists idx_stock_tracking_items_code_updated
      on stock_tracking_items(code, updatedAt desc);

    create table if not exists stock_tracking_snapshots (
      id text primary key,
      trackingId text not null,
      code text not null,
      name text not null,
      reportId text,
      createdAt text not null,
      latestPrice real,
      changePct real,
      trendState text,
      fundFlowState text,
      buyPointStatus text,
      opportunityState text,
      recommendation text not null,
      recommendationReason text not null,
      rawJson text not null
    );

    create index if not exists idx_stock_tracking_snapshots_tracking_created
      on stock_tracking_snapshots(trackingId, createdAt desc);

    create index if not exists idx_stock_tracking_snapshots_tracking_price_created
      on stock_tracking_snapshots(trackingId, latestPrice, createdAt desc);

    create table if not exists stock_tracking_events (
      id text primary key,
      trackingId text not null,
      eventType text not null,
      message text not null,
      createdAt text not null,
      rawJson text
    );

    create index if not exists idx_stock_tracking_events_tracking_created
      on stock_tracking_events(trackingId, createdAt desc);

    create table if not exists rule_events (
      id text primary key,
      reportId text not null,
      createdAt text not null,
      eventType text not null,
      subjectType text not null,
      subjectKey text not null,
      subjectName text not null,
      severity text not null,
      fromValue text,
      toValue text not null,
      message text not null,
      evidenceJson text not null,
      rawJson text not null
    );

    create index if not exists idx_rule_events_created
      on rule_events(createdAt desc);

    create index if not exists idx_rule_events_subject_created
      on rule_events(subjectType, subjectKey, createdAt desc);

    create table if not exists scheduler_runs (
      id text primary key,
      jobType text not null,
      startedAt text not null,
      finishedAt text,
      status text not null,
      useLLM integer not null default 0,
      pushNotification integer not null default 0,
      reportId text,
      eventCount integer not null default 0,
      message text not null,
      rawJson text
    );

    create index if not exists idx_scheduler_runs_started
      on scheduler_runs(startedAt desc);

    create index if not exists idx_notification_channels_enabled_created
      on notification_channels(enabled, createdAt desc);

    create table if not exists selection_runs (
      id text primary key,
      strategyId text not null,
      strategyName text not null,
      mode text not null,
      status text not null,
      startedAt text not null,
      finishedAt text,
      ruleVersion text,
      sourceReportId text,
      candidateCount integer not null default 0,
      pickCount integer not null default 0,
      parametersJson text not null,
      resultJson text,
      warningsJson text not null,
      errorMessage text
    );

    create index if not exists idx_selection_runs_started
      on selection_runs(startedAt desc);

    create index if not exists idx_selection_runs_strategy_started
      on selection_runs(strategyId, startedAt desc);

    create index if not exists idx_selection_runs_status_started
      on selection_runs(status, startedAt desc);

    create table if not exists serenity_research_runs (
      id text primary key,
      theme text not null,
      market text not null,
      timeWindow text not null,
      summary text not null,
      candidateCount integer not null default 0,
      topCandidateJson text,
      inputJson text not null,
      resultJson text not null,
      createdAt text not null
    );

    create index if not exists idx_serenity_research_runs_created
      on serenity_research_runs(createdAt desc);

    create index if not exists idx_serenity_research_runs_theme_created
      on serenity_research_runs(theme, createdAt desc);

    create table if not exists run_logs (
      id text primary key,
      jobName text not null,
      status text not null,
      message text not null,
      rawOutput text,
      createdAt text not null
    );

    create index if not exists idx_run_logs_created
      on run_logs(createdAt desc);
  `);
  ensureColumn(database, "analysis_reports", "llmMetricsJson", "text");
  ensureColumn(database, "analysis_reports", "displayable", "integer");
  ensureColumn(database, "selection_runs", "ruleVersion", "text");
  ensureColumn(database, "selection_runs", "rejectedCount", "integer");
  ensureColumn(database, "selection_runs", "topPickPreviewJson", "text");
  ensureColumn(database, "selection_runs", "sourceReportCreatedAt", "text");
  ensureColumn(database, "selection_runs", "sourceReportTradeDate", "text");
  ensureColumn(database, "selection_runs", "runEffectiveTradeDate", "text");
  ensureColumn(database, "selection_runs", "freshnessStatus", "text");
  ensureColumn(database, "model_audit_feedback", "itemCount", "integer");
  ensureColumn(database, "model_audit_feedback", "highPriorityCount", "integer");
  ensureColumn(database, "model_audit_feedback", "categorySummaryJson", "text");
  database.exec(`
    create index if not exists idx_analysis_reports_displayable_created
      on analysis_reports(displayable, createdAt desc);

    create table if not exists analysis_report_summaries (
      reportId text primary key,
      reportType text not null,
      createdAt text not null,
      displayable integer not null default 1,
      marketState text,
      maxTotalPositionPct real,
      providerSummaryJson text not null,
      warningSummaryJson text not null,
      candidateSummaryJson text not null,
      createdSummaryAt text not null
    );

    create index if not exists idx_analysis_report_summaries_type_created
      on analysis_report_summaries(reportType, createdAt desc);
  `);
  ensureColumn(database, "analysis_report_summaries", "marketState", "text");
  ensureColumn(database, "analysis_report_summaries", "maxTotalPositionPct", "real");
  backfillAnalysisReportDisplayable(database);
  backfillSelectionRunSummaries(database);
  backfillModelAuditSummaries(database);
}

function ensureColumn(database: Database.Database, table: string, column: string, definition: string) {
  const rows = database.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>;
  if (!rows.some((row) => row.name === column)) {
    database.exec(`alter table ${table} add column ${column} ${definition}`);
  }
}

function backfillAnalysisReportDisplayable(database: Database.Database) {
  const rows = database
    .prepare("select id, factPackageJson from analysis_reports where displayable is null")
    .all() as Array<{ id: string; factPackageJson: string }>;
  if (!rows.length) return;

  const update = database.prepare("update analysis_reports set displayable = ? where id = ?");
  database.transaction(() => {
    for (const row of rows) {
      update.run(isDisplayableFactPackageJson(row.factPackageJson) ? 1 : 0, row.id);
    }
  })();
}

function isDisplayableFactPackageJson(raw: string) {
  try {
    const factPackage = JSON.parse(raw) as {
      sectors?: unknown[];
      candidates?: unknown[];
      dataSource?: { status?: string };
    };
    const sectorCount = factPackage.sectors?.length ?? 0;
    const candidateCount = factPackage.candidates?.length ?? 0;
    if (sectorCount > 0 || candidateCount > 0) return true;
    return factPackage.dataSource?.status === "success";
  } catch {
    return false;
  }
}

function backfillSelectionRunSummaries(database: Database.Database) {
  const rows = database
    .prepare("select id, candidateCount, pickCount, resultJson, rejectedCount, topPickPreviewJson, sourceReportCreatedAt, sourceReportTradeDate, runEffectiveTradeDate, freshnessStatus from selection_runs where rejectedCount is null or topPickPreviewJson is null or sourceReportCreatedAt is null or sourceReportTradeDate is null or runEffectiveTradeDate is null or freshnessStatus is null")
    .all() as Array<{
      id: string;
      candidateCount: number;
      pickCount: number;
      resultJson: string | null;
      rejectedCount: number | null;
      topPickPreviewJson: string | null;
      sourceReportCreatedAt: string | null;
      sourceReportTradeDate: string | null;
      runEffectiveTradeDate: string | null;
      freshnessStatus: string | null;
    }>;
  if (!rows.length) return;

  const update = database.prepare("update selection_runs set rejectedCount = ?, topPickPreviewJson = ?, sourceReportCreatedAt = ?, sourceReportTradeDate = ?, runEffectiveTradeDate = ?, freshnessStatus = ? where id = ?");
  database.transaction(() => {
    for (const row of rows) {
      const result = safeSelectionRunResult(row.resultJson);
      const rejectedCount = result?.rejected?.length ?? Math.max(0, row.candidateCount - row.pickCount);
      const topPickPreview = (result?.picks ?? []).slice(0, 3).map((pick) => ({
        code: pick.code,
        name: pick.name,
        score: pick.score,
        tier: pick.tier,
        action: pick.action
      }));
      update.run(
        rejectedCount,
        JSON.stringify(topPickPreview),
        row.sourceReportCreatedAt ?? result?.sourceReportCreatedAt ?? null,
        row.sourceReportTradeDate ?? result?.sourceReportTradeDate ?? null,
        row.runEffectiveTradeDate ?? result?.runEffectiveTradeDate ?? null,
        row.freshnessStatus ?? result?.freshnessStatus ?? null,
        row.id
      );
    }
  })();
}

function backfillModelAuditSummaries(database: Database.Database) {
  const rows = database
    .prepare("select id, feedbackJson, itemCount, highPriorityCount, categorySummaryJson from model_audit_feedback where itemCount is null or highPriorityCount is null or categorySummaryJson is null")
    .all() as Array<{
      id: string;
      feedbackJson: string;
      itemCount: number | null;
      highPriorityCount: number | null;
      categorySummaryJson: string | null;
    }>;
  if (!rows.length) return;

  const update = database.prepare("update model_audit_feedback set itemCount = ?, highPriorityCount = ?, categorySummaryJson = ? where id = ?");
  database.transaction(() => {
    for (const row of rows) {
      const summary = summarizeModelAuditFeedback(row.feedbackJson);
      update.run(summary.itemCount, summary.highPriorityCount, JSON.stringify(summary.categoryCounts), row.id);
    }
  })();
}

function safeSelectionRunResult(raw: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as {
      sourceReportCreatedAt?: string;
      sourceReportTradeDate?: string;
      runEffectiveTradeDate?: string;
      freshnessStatus?: string;
      picks?: Array<{ code: string; name: string; score: number; tier: string; action: string }>;
      rejected?: unknown[];
    };
  } catch {
    return null;
  }
}

function summarizeModelAuditFeedback(raw: string) {
  try {
    const feedback = JSON.parse(raw) as {
      items?: Array<{ category?: string; priority?: string }>;
    };
    const items = feedback.items ?? [];
    const counts = new Map<string, number>();
    for (const item of items) {
      if (!item.category) continue;
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    }
    return {
      itemCount: items.length,
      highPriorityCount: items.filter((item) => item.priority === "高").length,
      categoryCounts: Array.from(counts.entries()).map(([category, count]) => ({ category, count }))
    };
  } catch {
    return {
      itemCount: 0,
      highPriorityCount: 0,
      categoryCounts: []
    };
  }
}
