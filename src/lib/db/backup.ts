import fs from "node:fs";
import path from "node:path";
import { getDatabasePath } from "@/lib/config";
import { getDb } from "@/lib/db/database";

const DEFAULT_BACKUP_DIR = "./data/backups";

export interface DatabaseBackupRecord {
  fileName: string;
  path: string;
  sizeBytes: number;
  sizeMB: number;
  createdAt: string;
}

export interface DatabaseBackupResult extends DatabaseBackupRecord {
  elapsedMs: number;
  sourcePath: string;
}

export function listDatabaseBackups(limit = 10): DatabaseBackupRecord[] {
  const backupDir = resolveBackupDir();
  if (!fs.existsSync(backupDir)) return [];
  return fs.readdirSync(backupDir)
    .filter((name) => name.endsWith(".db"))
    .map((fileName) => {
      const filePath = path.join(backupDir, fileName);
      const stat = fs.statSync(filePath);
      return toBackupRecord(fileName, filePath, stat);
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, Math.min(Math.max(limit, 1), 50));
}

export async function createDatabaseBackup(): Promise<DatabaseBackupResult> {
  const backupDir = resolveBackupDir();
  fs.mkdirSync(backupDir, { recursive: true });
  const destination = path.join(backupDir, `app-${formatBackupTimestamp(new Date())}.db`);
  const startedAt = Date.now();
  await getDb().backup(destination);
  const stat = fs.statSync(destination);
  return {
    ...toBackupRecord(path.basename(destination), destination, stat),
    elapsedMs: Date.now() - startedAt,
    sourcePath: maskWorkspacePath(path.resolve(process.cwd(), getDatabasePath()))
  };
}

function resolveBackupDir() {
  return path.resolve(process.cwd(), process.env.DATABASE_BACKUP_DIR || DEFAULT_BACKUP_DIR);
}

function toBackupRecord(fileName: string, filePath: string, stat: fs.Stats): DatabaseBackupRecord {
  return {
    fileName,
    path: maskWorkspacePath(filePath),
    sizeBytes: stat.size,
    sizeMB: Number((stat.size / 1024 / 1024).toFixed(2)),
    createdAt: stat.birthtime.toISOString()
  };
}

function formatBackupTimestamp(date: Date) {
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
