import type Database from "better-sqlite3";
import { getDb } from "@/lib/db/database";

export type SqlParams = unknown[] | Record<string, unknown>;

const DEFAULT_SLOW_QUERY_MS = 120;

export interface QueryOptions {
  label?: string;
  slowMs?: number;
}

export function dbAll<T>(sql: string, params?: SqlParams, options?: QueryOptions): T[] {
  return observeQuery(options, () => {
    const statement = getDb().prepare(sql);
    return runAll<T>(statement, params);
  });
}

export function dbGet<T>(sql: string, params?: SqlParams, options?: QueryOptions): T | undefined {
  return observeQuery(options, () => {
    const statement = getDb().prepare(sql);
    return runGet<T>(statement, params);
  });
}

export function dbRun(sql: string, params?: SqlParams, options?: QueryOptions): Database.RunResult {
  return observeQuery(options, () => {
    const statement = getDb().prepare(sql);
    return runExecute(statement, params);
  });
}

export function dbTransaction<T>(label: string, fn: () => T, slowMs?: number): T {
  return observeQuery({ label, slowMs }, () => getDb().transaction(fn)());
}

export function withDb<T>(label: string, fn: (database: Database.Database) => T, slowMs?: number): T {
  return observeQuery({ label, slowMs }, () => fn(getDb()));
}

function runAll<T>(statement: Database.Statement, params?: SqlParams): T[] {
  if (params === undefined) return statement.all() as T[];
  if (Array.isArray(params)) return statement.all(...params) as T[];
  return statement.all(params) as T[];
}

function runGet<T>(statement: Database.Statement, params?: SqlParams): T | undefined {
  if (params === undefined) return statement.get() as T | undefined;
  if (Array.isArray(params)) return statement.get(...params) as T | undefined;
  return statement.get(params) as T | undefined;
}

function runExecute(statement: Database.Statement, params?: SqlParams): Database.RunResult {
  if (params === undefined) return statement.run();
  if (Array.isArray(params)) return statement.run(...params);
  return statement.run(params);
}

function observeQuery<T>(options: QueryOptions | undefined, fn: () => T): T {
  const startedAt = Date.now();
  try {
    return fn();
  } finally {
    const elapsedMs = Date.now() - startedAt;
    const threshold = options?.slowMs ?? getSlowQueryThresholdMs();
    if (elapsedMs >= threshold) {
      const label = options?.label ?? "unnamed";
      console.warn(`[db:slow] ${label} ${elapsedMs}ms`);
    }
  }
}

function getSlowQueryThresholdMs() {
  const raw = process.env.DB_SLOW_QUERY_MS;
  const parsed = raw ? Number(raw) : DEFAULT_SLOW_QUERY_MS;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SLOW_QUERY_MS;
}
