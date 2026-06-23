import crypto from "node:crypto";
import { getConfiguredDatabaseProvider } from "@/lib/db/provider";
import { getDatabaseAudit } from "@/lib/db/audit";
import { getDatabaseStats } from "@/lib/db/stats";

export interface DatabaseReconciliationBaseline {
  provider: "sqlite";
  generatedAt: string;
  configuredTargetProvider: string;
  status: "ready" | "caution" | "blocked";
  label: string;
  baselineHash: string;
  tableChecks: Array<{
    table: string;
    rowCount: number;
    latestAt?: string | null;
  }>;
  jsonChecks: Array<{
    table: string;
    column: string;
    checkedRows: number;
    totalNonEmptyRows: number;
    invalidRows: number;
    status: "ok" | "warning" | "failed";
  }>;
  blockers: string[];
  warnings: string[];
  nextSteps: string[];
}

export function getDatabaseReconciliationBaseline(): DatabaseReconciliationBaseline {
  const stats = getDatabaseStats();
  const audit = getDatabaseAudit({ maxJsonRowsPerColumn: 500 });
  const tableChecks = stats.tables.map((table) => ({
    table: table.name,
    rowCount: table.rowCount,
    latestAt: table.latestAt
  }));
  const jsonChecks = audit.jsonHealth.map((item) => ({
    table: item.table,
    column: item.column,
    checkedRows: item.checkedRows,
    totalNonEmptyRows: item.totalNonEmptyRows,
    invalidRows: item.invalidRows,
    status: item.status
  }));
  const blockers = buildBlockers(audit);
  const warnings = buildWarnings(audit, stats.sizeMB);
  const status = blockers.length ? "blocked" : warnings.length ? "caution" : "ready";
  const baselineHash = hashBaseline({
    provider: "sqlite",
    generatedAt: stats.generatedAt,
    tableChecks,
    jsonChecks
  });

  return {
    provider: "sqlite",
    generatedAt: new Date().toISOString(),
    configuredTargetProvider: getConfiguredDatabaseProvider(),
    status,
    label: status === "ready" ? "可作为迁移基线" : status === "caution" ? "可对账但需复核" : "暂不适合迁移",
    baselineHash,
    tableChecks,
    jsonChecks,
    blockers,
    warnings,
    nextSteps: buildNextSteps(status)
  };
}

function buildBlockers(audit: ReturnType<typeof getDatabaseAudit>) {
  const blockers: string[] = [];
  if (audit.integrity.status !== "ok") blockers.push("SQLite quick_check 未通过，迁移前必须先备份并修复数据库文件。");
  const invalidJson = audit.jsonHealth.filter((item) => item.invalidRows > 0);
  if (invalidJson.length) blockers.push(`发现 ${invalidJson.length} 个 JSON 字段存在不可解析样本，迁移前必须定位修复。`);
  if (audit.indexes.missing.length > 4) blockers.push(`缺少 ${audit.indexes.missing.length} 个关键索引，迁移前建议先补齐或确认不再使用。`);
  return blockers;
}

function buildWarnings(audit: ReturnType<typeof getDatabaseAudit>, sizeMB: number) {
  const warnings: string[] = [];
  const sampledOnly = audit.jsonHealth.filter((item) => item.status === "warning" && item.invalidRows === 0);
  if (sampledOnly.length) warnings.push(`${sampledOnly.length} 个 JSON 字段只完成抽样检查，正式迁移前建议提高抽样上限或全量导出校验。`);
  if (audit.indexes.missing.length) warnings.push(`缺少 ${audit.indexes.missing.length} 个关键索引，可能影响列表页和迁移后查询性能。`);
  if (sizeMB >= 512) warnings.push(`当前 SQLite 文件约 ${sizeMB}MB，迁移前建议先做一次原生备份和 JSONL 归档。`);
  return warnings;
}

function buildNextSteps(status: DatabaseReconciliationBaseline["status"]) {
  if (status === "blocked") {
    return [
      "先运行数据库体检，修复 quick_check、JSON 或关键索引阻断项。",
      "创建一次 SQLite 原生备份，避免修复过程损坏历史报告。",
      "阻断项归零后再生成 PostgreSQL schema migration。"
    ];
  }
  if (status === "caution") {
    return [
      "保留当前 baselineHash，作为未来 PostgreSQL 导入后的行数和最新时间对账参考。",
      "正式迁移前提高 JSON 抽样上限，必要时执行全量 JSONL 导出校验。",
      "迁移后逐表核对 rowCount、latestAt 和 JSON invalidRows。"
    ];
  }
  return [
    "当前可作为迁移基线，但仍建议先创建备份再做任何导出。",
    "生成 PostgreSQL schema migration 后，用本 baseline 对比导入结果。",
    "迁移完成前继续让业务运行在 SQLite，避免半切换状态。"
  ];
}

function hashBaseline(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}
