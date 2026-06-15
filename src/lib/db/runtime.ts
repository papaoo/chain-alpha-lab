import path from "node:path";
import { getDatabasePath } from "@/lib/config";
import { ACTIVE_DATABASE_PROVIDER, getConfiguredDatabaseProvider } from "@/lib/db/provider";

const DEFAULT_BACKUP_DIR = "./data/backups";
const DEFAULT_ARCHIVE_DIR = "./data/archives";
const DEFAULT_SLOW_QUERY_MS = 120;

export interface DatabaseRuntimeInfo {
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
}

export function getDatabaseRuntimeInfo(): DatabaseRuntimeInfo {
  const configuredProvider = process.env.DATABASE_PROVIDER || "sqlite";
  const normalizedConfiguredProvider = getConfiguredDatabaseProvider();
  const activeProvider = ACTIVE_DATABASE_PROVIDER;
  const providerReady = normalizedConfiguredProvider === activeProvider;
  return {
    activeProvider,
    configuredProvider,
    providerReady,
    providerMessage: providerReady
      ? "当前使用 SQLite。本地单人和 MVP 阶段继续可用，后续通过 DB client 切换。"
      : `已配置 ${configuredProvider}，但当前运行时仍只启用 SQLite。切库前需要完成迁移脚本和对账验证。`,
    databasePath: maskWorkspacePath(path.resolve(process.cwd(), getDatabasePath())),
    backupDir: maskWorkspacePath(path.resolve(process.cwd(), process.env.DATABASE_BACKUP_DIR || DEFAULT_BACKUP_DIR)),
    archiveDir: maskWorkspacePath(path.resolve(process.cwd(), process.env.DATABASE_ARCHIVE_DIR || DEFAULT_ARCHIVE_DIR)),
    slowQueryMs: getSlowQueryThresholdMs(),
    capabilities: [
      {
        key: "unified-client",
        label: "统一 DB client",
        enabled: true,
        note: "业务仓储层通过 dbAll/dbGet/dbRun/dbTransaction 访问，降低未来换库成本。"
      },
      {
        key: "wal",
        label: "WAL 写入模式",
        enabled: true,
        note: "SQLite 已启用 WAL、busy_timeout、NORMAL synchronous，适合当前单机自动分析。"
      },
      {
        key: "native-backup",
        label: "一致性备份",
        enabled: true,
        note: "通过 better-sqlite3 backup API 生成包含 WAL 数据的快照。"
      },
      {
        key: "archive-export",
        label: "冷归档导出",
        enabled: true,
        note: "超过保留窗口的数据可导出为 JSONL 与 manifest，当前不会删除主库记录。"
      },
      {
        key: "postgres-runtime",
        label: "PostgreSQL 运行时",
        enabled: false,
        note: "尚未启用。等数据规模、并发或部署形态触发后，再增加 Postgres client 和迁移对账脚本。"
      }
    ],
    domains: [
      {
        key: "reports",
        label: "分析报告与事实包",
        repository: "src/lib/db/reports.ts",
        tables: ["analysis_reports", "market_snapshots", "sector_snapshots", "stock_signal_snapshots", "rule_events"],
        migrationPriority: "p0",
        note: "主线策略、规则回放和时间链的核心事实来源；迁库时必须先完成行数、最新时间和 JSON 可解析校验。"
      },
      {
        key: "memory",
        label: "股票记忆与追踪",
        repository: "src/lib/db/stockMemory.ts / src/lib/db/stockTracking.ts",
        tables: ["stock_memories", "stock_memory_snapshots", "stock_tracking_items", "stock_tracking_snapshots", "stock_tracking_events"],
        migrationPriority: "p0",
        note: "后续个股追踪会持续增长，适合最早抽象成稳定仓储接口。"
      },
      {
        key: "selection",
        label: "策略选股运行",
        repository: "src/lib/selection/runs.ts / src/lib/selection/candidate-pool.ts",
        tables: ["selection_runs"],
        migrationPriority: "p1",
        note: "列表页只读摘要，详情页再读完整 resultJson，避免大 JSON 拖慢页面。"
      },
      {
        key: "settings",
        label: "配置、调度与通知",
        repository: "src/lib/db/settings.ts / src/lib/db/notifications.ts",
        tables: ["settings", "scheduler_runs", "notification_channels"],
        migrationPriority: "p1",
        note: "包含密钥和 webhook 配置，迁移、备份和日志展示必须继续脱敏。"
      },
      {
        key: "audit",
        label: "模型反馈与系统审计",
        repository: "src/lib/db/modelAudit.ts / src/lib/db/dataSourceHealth.ts / src/lib/db/ruleReplay.ts",
        tables: ["model_audit_feedback"],
        migrationPriority: "p2",
        note: "主要用于复盘和系统演进，允许在迁库早期只保留摘要列表，再补详情迁移。"
      }
    ],
    migrationChecklist: [
      {
        key: "repository-boundary",
        label: "仓储边界",
        status: "partial",
        note: "核心模块已使用 dbAll/dbGet/dbRun；新增模块仍需禁止 API route 或组件直接写 SQL。"
      },
      {
        key: "schema-migration",
        label: "Schema migration",
        status: "blocked",
        note: "尚未生成 PostgreSQL migration 文件和字段类型对照表。"
      },
      {
        key: "reconciliation",
        label: "迁移对账",
        status: "blocked",
        note: "尚未实现 SQLite -> PostgreSQL 行数、最新时间、JSON 可解析对账脚本。"
      },
      {
        key: "read-path-performance",
        label: "读取路径性能",
        status: "partial",
        note: "已有慢查询日志、摘要表和索引体检；仍需持续减少列表页读取完整 JSON。"
      },
      {
        key: "backup-archive",
        label: "备份归档",
        status: "ready",
        note: "SQLite backup 和 JSONL 归档已具备，迁库前必须先执行备份和只读体检。"
      }
    ]
  };
}

function getSlowQueryThresholdMs() {
  const raw = process.env.DB_SLOW_QUERY_MS;
  const parsed = raw ? Number(raw) : DEFAULT_SLOW_QUERY_MS;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SLOW_QUERY_MS;
}

function maskWorkspacePath(value: string) {
  const cwd = process.cwd();
  return value.startsWith(cwd) ? value.replace(cwd, ".") : value;
}
