import type { AppSettings, DataSourceSettings } from "@/lib/types";

export type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };

export type SettingsForm = {
  provider: AppSettings["provider"];
  providerName: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: string;
  maxTokens: string;
  timeoutMs: string;
  enabled: boolean;
  modelAuditEnabled: boolean;
};

export type DataSourceSettingsForm = {
  providers: DataSourceSettings["providers"];
};

export type TradingCalendarSettings = {
  market: string;
  source: string;
  updatedAt: string;
  closedDates: string[];
  path: string;
};

export type SchedulerRunSummary = {
  id: string;
  jobType: string;
  startedAt: string;
  finishedAt?: string | null;
  status: string;
  useLLM: boolean;
  pushNotification: boolean;
  reportId?: string | null;
  eventCount: number;
  message: string;
};

export type RuleEventSummary = {
  id: string;
  eventType: string;
  subjectType: string;
  subjectName: string;
  severity: "info" | "warning" | "risk";
  fromValue?: string | null;
  toValue: string;
  message: string;
  createdAt: string;
};

export type SchedulerForm = {
  enabled: boolean;
  intradayScanEnabled: boolean;
  intradayIntervalMinutes: string;
  keypointTimes: string;
  deepResearchTimes: string;
  llmOnEvent: boolean;
  pushNotification: boolean;
};

export type DatabaseStatsSummary = {
  provider: "sqlite";
  path: string;
  sizeBytes: number;
  sizeMB: number;
  generatedAt: string;
  tables: Array<{
    name: string;
    rowCount: number;
    latestAt?: string | null;
  }>;
};

export type DatabaseRuntimeInfo = {
  activeProvider: "sqlite";
  configuredProvider: string;
  providerReady: boolean;
  providerMessage: string;
  databasePath: string;
  backupDir: string;
  archiveDir: string;
  slowQueryMs: number;
  capabilities: Array<{
    key: string;
    label: string;
    enabled: boolean;
    note: string;
  }>;
  domains: Array<{
    key: string;
    label: string;
    repository: string;
    tables: string[];
    migrationPriority: "p0" | "p1" | "p2";
    note: string;
  }>;
  migrationChecklist: Array<{
    key: string;
    label: string;
    status: "ready" | "partial" | "blocked";
    note: string;
  }>;
};

export type DatabaseAuditReport = {
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
    table: string;
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
      name: string;
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
};

export type DatabaseRetentionPreview = {
  generatedAt: string;
  policies: Array<{
    table: string;
    label: string;
    timeColumn: string;
    retentionDays: number;
    totalRows: number;
    removableRows: number;
    removablePct: number;
    oldestAt?: string | null;
    cutoffAt: string;
    note: string;
  }>;
};

export type DatabaseBackupRecord = {
  fileName: string;
  path: string;
  sizeBytes: number;
  sizeMB: number;
  createdAt: string;
};

export type DatabaseBackupResult = DatabaseBackupRecord & {
  elapsedMs: number;
  sourcePath: string;
};

export type DatabaseArchiveRecord = {
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
};

export type DatabaseArchiveResult = DatabaseArchiveRecord & {
  tables: Array<{
    table: string;
    label: string;
    rowCount: number;
    cutoffAt: string;
    retentionDays: number;
  }>;
};
