import fs from "node:fs";
import path from "node:path";
import { getDatabasePath } from "@/lib/config";
import { dbGet } from "@/lib/db/client";

const OBSERVED_TABLES = [
  "analysis_reports",
  "market_snapshots",
  "sector_snapshots",
  "stock_signal_snapshots",
  "stock_memories",
  "stock_memory_snapshots",
  "rule_events",
  "selection_runs",
  "model_audit_feedback",
  "scheduler_runs",
  "notification_channels",
  "settings"
] as const;

export type ObservedTable = (typeof OBSERVED_TABLES)[number];

const TIME_COLUMN_BY_TABLE: Record<ObservedTable, string | null> = {
  analysis_reports: "createdAt",
  market_snapshots: "createdAt",
  sector_snapshots: "createdAt",
  stock_signal_snapshots: "createdAt",
  stock_memories: "lastSeenAt",
  stock_memory_snapshots: "createdAt",
  rule_events: "createdAt",
  selection_runs: "startedAt",
  model_audit_feedback: "createdAt",
  scheduler_runs: "startedAt",
  notification_channels: "createdAt",
  settings: "updatedAt"
};

export interface DatabaseStats {
  provider: "sqlite";
  path: string;
  sizeBytes: number;
  sizeMB: number;
  generatedAt: string;
  tables: Array<{
    name: ObservedTable;
    rowCount: number;
    latestAt?: string | null;
  }>;
}

export interface DatabaseRetentionPreview {
  generatedAt: string;
  policies: DatabaseRetentionPolicy[];
}

export interface DatabaseRetentionPolicy {
  table: ObservedTable;
  label: string;
  timeColumn: string;
  retentionDays: number;
  totalRows: number;
  removableRows: number;
  removablePct: number;
  oldestAt?: string | null;
  cutoffAt: string;
  note: string;
}

export function getDatabaseStats(): DatabaseStats {
  const dbPath = path.resolve(process.cwd(), getDatabasePath());
  const fileStat = fs.existsSync(dbPath) ? fs.statSync(dbPath) : null;
  return {
    provider: "sqlite",
    path: maskWorkspacePath(dbPath),
    sizeBytes: fileStat?.size ?? 0,
    sizeMB: Number(((fileStat?.size ?? 0) / 1024 / 1024).toFixed(2)),
    generatedAt: new Date().toISOString(),
    tables: OBSERVED_TABLES.map((name) => readTableStats(name))
  };
}

export function getDatabaseRetentionPreview(): DatabaseRetentionPreview {
  const policies = [
    buildRetentionPolicy("stock_signal_snapshots", "个股信号快照", 180, "选股沉淀池和个股历史信号，超过保留期后适合归档或冷存。"),
    buildRetentionPolicy("stock_memory_snapshots", "个股记忆快照", 180, "个股长期汇总记忆会保留，旧快照可压缩归档。"),
    buildRetentionPolicy("scheduler_runs", "自动分析运行记录", 180, "运行日志主要用于排错，失败摘要后续可单独长期保留。"),
    buildRetentionPolicy("selection_runs", "策略选股运行", 365, "策略运行用于复盘，建议先长期保留，未来按月份归档大结果 JSON。"),
    buildRetentionPolicy("market_snapshots", "大盘快照", 365, "大盘连续性价值较高，清理前应确认已有年度归档。"),
    buildRetentionPolicy("sector_snapshots", "主线板块快照", 365, "主线阶段迁移价值较高，清理前应确认已有年度归档。")
  ];
  return {
    generatedAt: new Date().toISOString(),
    policies
  };
}

function readTableStats(name: ObservedTable) {
  const count = dbGet<{ count: number }>(
    `select count(*) as count from ${name}`,
    undefined,
    { label: `db_stats.${name}.count` }
  );
  const timeColumn = TIME_COLUMN_BY_TABLE[name];
  const latest = timeColumn
    ? dbGet<{ latestAt: string | null }>(
        `select max(${timeColumn}) as latestAt from ${name}`,
        undefined,
        { label: `db_stats.${name}.latest` }
      )
    : null;
  return {
    name,
    rowCount: count?.count ?? 0,
    latestAt: latest?.latestAt ?? null
  };
}

function buildRetentionPolicy(table: ObservedTable, label: string, retentionDays: number, note: string) {
  const timeColumn = TIME_COLUMN_BY_TABLE[table];
  if (!timeColumn) {
    return {
      table,
      label,
      timeColumn: "",
      retentionDays,
      totalRows: 0,
      removableRows: 0,
      removablePct: 0,
      oldestAt: null,
      cutoffAt: "",
      note
    };
  }
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
  const total = dbGet<{ count: number }>(
    `select count(*) as count from ${table}`,
    undefined,
    { label: `db_retention.${table}.total` }
  )?.count ?? 0;
  const removable = dbGet<{ count: number }>(
    `select count(*) as count from ${table} where ${timeColumn} < ?`,
    [cutoff],
    { label: `db_retention.${table}.removable` }
  )?.count ?? 0;
  const oldest = dbGet<{ oldestAt: string | null }>(
    `select min(${timeColumn}) as oldestAt from ${table}`,
    undefined,
    { label: `db_retention.${table}.oldest` }
  );
  return {
    table,
    label,
    timeColumn,
    retentionDays,
    totalRows: total,
    removableRows: removable,
    removablePct: total ? Number((removable / total * 100).toFixed(1)) : 0,
    oldestAt: oldest?.oldestAt ?? null,
    cutoffAt: cutoff,
    note
  };
}

function maskWorkspacePath(value: string) {
  const cwd = process.cwd();
  return value.startsWith(cwd) ? value.replace(cwd, ".") : value;
}
