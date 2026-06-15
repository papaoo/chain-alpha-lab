import { getDatabaseStats, type ObservedTable } from "@/lib/db/stats";
import { dbAll, dbGet, withDb } from "@/lib/db/client";

const DEFAULT_JSON_SAMPLE_LIMIT = 500;

const REQUIRED_INDEXES = [
  "idx_analysis_reports_created",
  "idx_analysis_reports_type_created",
  "idx_analysis_reports_displayable_created",
  "idx_market_snapshots_created",
  "idx_market_snapshots_report_created",
  "idx_sector_snapshots_name_created",
  "idx_sector_snapshots_report_rank",
  "idx_stock_signal_snapshots_code_created",
  "idx_stock_signal_snapshots_created",
  "idx_stock_memory_snapshots_code_created",
  "idx_rule_events_created",
  "idx_rule_events_subject_created",
  "idx_scheduler_runs_started",
  "idx_selection_runs_started",
  "idx_selection_runs_strategy_started",
  "idx_model_audit_feedback_created",
  "idx_model_audit_feedback_report",
  "idx_notification_channels_enabled_created"
] as const;

const JSON_COLUMNS = [
  { table: "analysis_reports", column: "rawDataJson", label: "分析报告原始数据" },
  { table: "analysis_reports", column: "ruleResultJson", label: "规则结论" },
  { table: "analysis_reports", column: "factPackageJson", label: "事实包" },
  { table: "analysis_reports", column: "llmResultJson", label: "模型报告" },
  { table: "analysis_reports", column: "llmMetricsJson", label: "模型调用指标" },
  { table: "market_snapshots", column: "rawJson", label: "大盘快照原文" },
  { table: "sector_snapshots", column: "rawJson", label: "板块快照原文" },
  { table: "stock_signal_snapshots", column: "rawJson", label: "个股信号原文" },
  { table: "stock_memory_snapshots", column: "rawJson", label: "个股记忆快照" },
  { table: "rule_events", column: "evidenceJson", label: "规则事件证据" },
  { table: "rule_events", column: "rawJson", label: "规则事件原文" },
  { table: "selection_runs", column: "parametersJson", label: "选股参数" },
  { table: "selection_runs", column: "resultJson", label: "选股结果" },
  { table: "selection_runs", column: "warningsJson", label: "选股警告" },
  { table: "selection_runs", column: "topPickPreviewJson", label: "选股摘要预览" },
  { table: "model_audit_feedback", column: "feedbackJson", label: "模型反馈详情" },
  { table: "model_audit_feedback", column: "categorySummaryJson", label: "模型反馈分类摘要" },
  { table: "scheduler_runs", column: "rawJson", label: "调度运行原文" },
  { table: "settings", column: "value", label: "系统配置值" }
] satisfies Array<{ table: ObservedTable; column: string; label: string }>;

export interface DatabaseAuditOptions {
  maxJsonRowsPerColumn?: number;
}

export interface DatabaseAuditReport {
  provider: "sqlite";
  generatedAt: string;
  mode: "sampled";
  sampleLimit: number;
  integrity: {
    status: "ok" | "warning" | "failed";
    messages: string[];
  };
  pragmas: {
    journalMode: string;
    synchronous: string;
    foreignKeys: boolean;
    busyTimeoutMs: number;
  };
  indexes: {
    requiredCount: number;
    presentCount: number;
    missing: string[];
  };
  jsonHealth: Array<{
    table: ObservedTable;
    column: string;
    label: string;
    checkedRows: number;
    totalNonEmptyRows: number;
    invalidRows: number;
    firstInvalidId?: string;
    firstInvalidError?: string;
    status: "ok" | "warning" | "failed";
  }>;
  storage: {
    sizeMB: number;
    largestTables: Array<{
      name: ObservedTable;
      rowCount: number;
      latestAt?: string | null;
    }>;
  };
  migrationReadiness: {
    score: number;
    status: "ready" | "caution" | "blocked";
    label: string;
  };
  risks: string[];
  recommendations: string[];
}

type SqliteIndexRow = { name: string };
type CountRow = { count: number };
type JsonSampleRow = { id: string | number | null; value: string | null };

export function getDatabaseAudit(options: DatabaseAuditOptions = {}): DatabaseAuditReport {
  const sampleLimit = clampInteger(options.maxJsonRowsPerColumn, DEFAULT_JSON_SAMPLE_LIMIT, 20, 100_000);
  const stats = getDatabaseStats();
  const integrity = readIntegrity();
  const pragmas = readPragmas();
  const indexes = readIndexAudit();
  const jsonHealth = JSON_COLUMNS.map((policy) => auditJsonColumn(policy, sampleLimit));
  const largestTables = [...stats.tables].sort((left, right) => right.rowCount - left.rowCount).slice(0, 8);
  const risks = buildRisks({
    dbSizeMB: stats.sizeMB,
    integrityStatus: integrity.status,
    missingIndexes: indexes.missing,
    jsonHealth,
    pragmas
  });
  const migrationReadiness = scoreMigrationReadiness({
    dbSizeMB: stats.sizeMB,
    integrityStatus: integrity.status,
    missingIndexCount: indexes.missing.length,
    invalidJsonColumnCount: jsonHealth.filter((item) => item.invalidRows > 0).length,
    pragmas
  });

  return {
    provider: "sqlite",
    generatedAt: new Date().toISOString(),
    mode: "sampled",
    sampleLimit,
    integrity,
    pragmas,
    indexes,
    jsonHealth,
    storage: {
      sizeMB: stats.sizeMB,
      largestTables
    },
    migrationReadiness,
    risks,
    recommendations: buildRecommendations({ risks, migrationReadiness, missingIndexes: indexes.missing })
  };
}

function readIntegrity(): DatabaseAuditReport["integrity"] {
  const messages = withDb("db_audit.quick_check", (database) => {
    const rows = database.pragma("quick_check") as Array<Record<string, unknown>>;
    return rows.flatMap((row) => Object.values(row).map((value) => String(value)));
  }, 500);
  const status = messages.length && messages.every((message) => message.toLowerCase() === "ok") ? "ok" : "failed";
  return {
    status,
    messages: messages.length ? messages : ["quick_check 未返回结果"]
  };
}

function readPragmas(): DatabaseAuditReport["pragmas"] {
  return withDb("db_audit.pragmas", (database) => ({
    journalMode: String(database.pragma("journal_mode", { simple: true }) ?? ""),
    synchronous: String(database.pragma("synchronous", { simple: true }) ?? ""),
    foreignKeys: Number(database.pragma("foreign_keys", { simple: true }) ?? 0) === 1,
    busyTimeoutMs: Number(database.pragma("busy_timeout", { simple: true }) ?? 0)
  }));
}

function readIndexAudit(): DatabaseAuditReport["indexes"] {
  const rows = dbAll<SqliteIndexRow>(
    "select name from sqlite_master where type = 'index'",
    undefined,
    { label: "db_audit.indexes" }
  );
  const existing = new Set(rows.map((row) => row.name));
  const missing = REQUIRED_INDEXES.filter((name) => !existing.has(name));
  return {
    requiredCount: REQUIRED_INDEXES.length,
    presentCount: REQUIRED_INDEXES.length - missing.length,
    missing
  };
}

function auditJsonColumn(
  policy: (typeof JSON_COLUMNS)[number],
  sampleLimit: number
): DatabaseAuditReport["jsonHealth"][number] {
  if (!hasColumn(policy.table, policy.column)) {
    return {
      ...policy,
      checkedRows: 0,
      totalNonEmptyRows: 0,
      invalidRows: 0,
      status: "warning",
      firstInvalidError: "字段不存在，可能是旧库或迁移未完成"
    };
  }

  const totalNonEmptyRows = dbGet<CountRow>(
    `select count(*) as count from ${policy.table} where ${policy.column} is not null and ${policy.column} != ''`,
    undefined,
    { label: `db_audit.${policy.table}.${policy.column}.count` }
  )?.count ?? 0;
  const rows = dbAll<JsonSampleRow>(
    `select rowid as id, ${policy.column} as value
       from ${policy.table}
       where ${policy.column} is not null and ${policy.column} != ''
       order by rowid desc
       limit ?`,
    [sampleLimit],
    { label: `db_audit.${policy.table}.${policy.column}.sample`, slowMs: 500 }
  );

  let invalidRows = 0;
  let firstInvalidId: string | undefined;
  let firstInvalidError: string | undefined;
  for (const row of rows) {
    try {
      JSON.parse(row.value ?? "");
    } catch (error) {
      invalidRows += 1;
      firstInvalidId ??= String(row.id ?? "");
      firstInvalidError ??= error instanceof Error ? error.message : String(error);
    }
  }

  return {
    ...policy,
    checkedRows: rows.length,
    totalNonEmptyRows,
    invalidRows,
    firstInvalidId,
    firstInvalidError,
    status: invalidRows ? "failed" : totalNonEmptyRows > rows.length ? "warning" : "ok"
  };
}

function hasColumn(table: ObservedTable, column: string) {
  const rows = dbAll<{ name: string }>(
    `pragma table_info(${table})`,
    undefined,
    { label: `db_audit.${table}.columns` }
  );
  return rows.some((row) => row.name === column);
}

function buildRisks(input: {
  dbSizeMB: number;
  integrityStatus: DatabaseAuditReport["integrity"]["status"];
  missingIndexes: string[];
  jsonHealth: DatabaseAuditReport["jsonHealth"];
  pragmas: DatabaseAuditReport["pragmas"];
}) {
  const risks: string[] = [];
  if (input.integrityStatus !== "ok") risks.push("SQLite quick_check 未通过，需要先备份并排查数据库文件。");
  if (input.dbSizeMB >= 1024) risks.push("数据库文件超过 1GB，应启动 PostgreSQL 迁移评估。");
  else if (input.dbSizeMB >= 512) risks.push("数据库文件超过 512MB，需要观察列表接口和自动分析写入耗时。");
  if (input.missingIndexes.length) risks.push(`缺少 ${input.missingIndexes.length} 个关键索引，可能拖慢报告、选股和审计列表。`);
  const invalidJson = input.jsonHealth.filter((item) => item.invalidRows > 0);
  if (invalidJson.length) risks.push(`发现 ${invalidJson.length} 个 JSON 字段存在不可解析样本，迁库前必须修复。`);
  if (input.pragmas.journalMode.toLowerCase() !== "wal") risks.push("SQLite 未处于 WAL 模式，并发读写稳定性会下降。");
  if (!input.pragmas.foreignKeys) risks.push("SQLite foreign_keys 未开启，未来增加外键约束前需要修正。");
  if (input.pragmas.busyTimeoutMs < 1000) risks.push("SQLite busy_timeout 偏低，自动分析并发写入时更容易出现 database is locked。");
  return risks;
}

function scoreMigrationReadiness(input: {
  dbSizeMB: number;
  integrityStatus: DatabaseAuditReport["integrity"]["status"];
  missingIndexCount: number;
  invalidJsonColumnCount: number;
  pragmas: DatabaseAuditReport["pragmas"];
}) {
  let score = 100;
  if (input.integrityStatus !== "ok") score -= 35;
  score -= input.missingIndexCount * 6;
  score -= input.invalidJsonColumnCount * 12;
  if (input.dbSizeMB >= 1024) score -= 20;
  else if (input.dbSizeMB >= 512) score -= 10;
  if (input.pragmas.journalMode.toLowerCase() !== "wal") score -= 8;
  if (!input.pragmas.foreignKeys) score -= 5;
  if (input.pragmas.busyTimeoutMs < 1000) score -= 5;
  score = Math.max(0, Math.min(100, score));
  const status = score >= 85 ? "ready" : score >= 65 ? "caution" : "blocked";
  return {
    score,
    status,
    label: status === "ready" ? "结构健康" : status === "caution" ? "谨慎观察" : "暂缓迁移"
  } satisfies DatabaseAuditReport["migrationReadiness"];
}

function buildRecommendations(input: {
  risks: string[];
  migrationReadiness: DatabaseAuditReport["migrationReadiness"];
  missingIndexes: string[];
}) {
  const recommendations: string[] = [];
  if (input.missingIndexes.length) recommendations.push("先补齐缺失索引，再继续增加高频自动分析或大批量选股运行。");
  if (input.risks.some((risk) => risk.includes("JSON"))) recommendations.push("对不可解析 JSON 做只读导出和人工定位，不要直接清理原始报告。");
  if (input.migrationReadiness.status === "ready") {
    recommendations.push("当前 SQLite 可继续支撑 MVP；迁库前保持备份、归档和对账脚本常态化。");
  } else {
    recommendations.push("暂不切换数据库运行时，先完成审计项修复和迁移对账脚本。");
  }
  recommendations.push("列表接口继续使用摘要字段，完整 JSON 只在详情页或归档导出中读取。");
  return recommendations;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Math.trunc(Number(value ?? fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
