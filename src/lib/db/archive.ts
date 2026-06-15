import fs from "node:fs";
import path from "node:path";
import { dbAll } from "@/lib/db/client";
import { getDatabaseRetentionPreview, type DatabaseRetentionPolicy, type ObservedTable } from "@/lib/db/stats";

const DEFAULT_ARCHIVE_DIR = "./data/archives";
const EXPORT_BATCH_LIMIT = 5000;

export interface DatabaseArchiveRecord {
  id: string;
  fileName: string;
  manifestName: string;
  path: string;
  manifestPath: string;
  sizeBytes: number;
  sizeMB: number;
  createdAt: string;
  tableCount: number;
  rowCount: number;
  dryRun: boolean;
}

export interface DatabaseArchiveResult extends DatabaseArchiveRecord {
  tables: Array<{
    table: ObservedTable;
    label: string;
    rowCount: number;
    cutoffAt: string;
    retentionDays: number;
  }>;
}

type ArchiveRow = Record<string, unknown>;

export function listDatabaseArchives(limit = 10): DatabaseArchiveRecord[] {
  const archiveDir = resolveArchiveDir();
  if (!fs.existsSync(archiveDir)) return [];
  return fs.readdirSync(archiveDir)
    .filter((name) => name.endsWith(".manifest.json"))
    .map((manifestName) => {
      const manifestPath = path.join(archiveDir, manifestName);
      const raw = fs.readFileSync(manifestPath, "utf8");
      const manifest = JSON.parse(raw) as DatabaseArchiveResult;
      const dataPath = path.join(archiveDir, manifest.fileName);
      const stat = fs.existsSync(dataPath) ? fs.statSync(dataPath) : fs.statSync(manifestPath);
      return {
        id: manifest.id,
        fileName: manifest.fileName,
        manifestName,
        path: maskWorkspacePath(dataPath),
        manifestPath: maskWorkspacePath(manifestPath),
        sizeBytes: stat.size,
        sizeMB: Number((stat.size / 1024 / 1024).toFixed(2)),
        createdAt: manifest.createdAt,
        tableCount: manifest.tableCount,
        rowCount: manifest.rowCount,
        dryRun: manifest.dryRun
      };
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, Math.min(Math.max(limit, 1), 50));
}

export function exportDatabaseArchive(options: { dryRun?: boolean } = {}): DatabaseArchiveResult {
  const archiveDir = resolveArchiveDir();

  const createdAt = new Date().toISOString();
  const id = `archive-${formatArchiveTimestamp(new Date())}`;
  const fileName = `${id}.jsonl`;
  const manifestName = `${id}.manifest.json`;
  const dataPath = path.join(archiveDir, fileName);
  const manifestPath = path.join(archiveDir, manifestName);
  const policies = getDatabaseRetentionPreview().policies.filter((policy) => policy.removableRows > 0);
  const tableResults: DatabaseArchiveResult["tables"] = [];
  let rowCount = 0;

  if (options.dryRun) {
    for (const policy of policies) {
      tableResults.push(toTableResult(policy, policy.removableRows));
      rowCount += policy.removableRows;
    }
  } else {
    const rowsByTable = policies.map((policy) => ({ policy, rows: readArchiveRows(policy) }));
    rowCount = rowsByTable.reduce((sum, entry) => sum + entry.rows.length, 0);
    for (const entry of rowsByTable) {
      tableResults.push(toTableResult(entry.policy, entry.rows.length));
    }
    if (rowCount > 0) {
      fs.mkdirSync(archiveDir, { recursive: true });
      const fd = fs.openSync(dataPath, "w");
      try {
        for (const entry of rowsByTable) {
          for (const row of entry.rows) {
            fs.writeSync(fd, JSON.stringify({
              table: entry.policy.table,
              exportedAt: createdAt,
              cutoffAt: entry.policy.cutoffAt,
              row
            }));
            fs.writeSync(fd, "\n");
          }
        }
      } finally {
        fs.closeSync(fd);
      }
    }
  }

  const stat = !options.dryRun && fs.existsSync(dataPath) ? fs.statSync(dataPath) : { size: 0 };
  const result: DatabaseArchiveResult = {
    id,
    fileName,
    manifestName,
    path: maskWorkspacePath(dataPath),
    manifestPath: maskWorkspacePath(manifestPath),
    sizeBytes: stat.size,
    sizeMB: Number((stat.size / 1024 / 1024).toFixed(2)),
    createdAt,
    tableCount: tableResults.length,
    rowCount,
    dryRun: Boolean(options.dryRun),
    tables: tableResults
  };
  if (!options.dryRun && rowCount > 0) {
    fs.writeFileSync(manifestPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  return result;
}

function readArchiveRows(policy: DatabaseRetentionPolicy): ArchiveRow[] {
  return dbAll<ArchiveRow>(
    `select * from ${policy.table} where ${policy.timeColumn} < ? order by ${policy.timeColumn} asc limit ?`,
    [policy.cutoffAt, EXPORT_BATCH_LIMIT],
    { label: `db_archive.${policy.table}.export`, slowMs: 500 }
  );
}

function toTableResult(policy: DatabaseRetentionPolicy, rowCount: number) {
  return {
    table: policy.table,
    label: policy.label,
    rowCount,
    cutoffAt: policy.cutoffAt,
    retentionDays: policy.retentionDays
  };
}

function resolveArchiveDir() {
  return path.resolve(process.cwd(), process.env.DATABASE_ARCHIVE_DIR || DEFAULT_ARCHIVE_DIR);
}

function formatArchiveTimestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function maskWorkspacePath(value: string) {
  const cwd = process.cwd();
  return value.startsWith(cwd) ? value.replace(cwd, ".") : value;
}
