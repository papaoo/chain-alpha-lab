# 数据库架构与迁移规划

## 1. 当前结论

当前阶段不直接替换 SQLite。MVP 和本地单人使用场景下，SQLite 仍然适合保存分析报告、规则事件、股票记忆、选股运行和配置数据。真正需要先做的是数据库访问层解耦、查询可观测、索引补齐和数据生命周期管理。

系统已经引入统一数据库执行入口：

- `src/lib/db/client.ts`
- `dbAll`
- `dbGet`
- `dbRun`
- `dbTransaction`
- `withDb`

业务模块不得直接调用 `getDb().prepare()`。`getDb()` 只保留在 `src/lib/db/database.ts` 和 `src/lib/db/client.ts` 内，用于初始化、迁移和统一执行。

## 2. 为什么现在不换库

SQLite 当前数据库约 58MB，主要数据量来自分析报告 JSON、个股记忆快照和策略选股运行记录。这个量级还没有到必须切换 PostgreSQL 的程度。

现在直接换库的风险更高：

- 现有 JSON 字段较多，直接迁移容易出现字段类型和序列化差异。
- Next.js 本地开发和 Windows 启动脚本会变复杂。
- 策略和数据源仍在快速迭代，过早引入数据库运维会拖慢功能验证。

更合理的路径是：先把业务层从 SQLite API 中剥离出来，再在数据量、并发、部署形态需要时切换 PostgreSQL。

## 3. 当前分层

```text
API Routes / Services
  |
  | 调用领域仓储函数
  v
Domain Repositories
  |
  | dbAll/dbGet/dbRun/dbTransaction
  v
DB Client
  |
  | 当前实现：better-sqlite3
  | 未来实现：PostgreSQL driver 或 ORM
  v
Database
```

已经收敛到统一 DB client 的模块：

- `src/lib/db/reports.ts`
- `src/lib/db/incremental.ts`
- `src/lib/db/stockMemory.ts`
- `src/lib/db/settings.ts`
- `src/lib/db/modelAudit.ts`
- `src/lib/db/notifications.ts`
- `src/lib/selection/runs.ts`
- `src/lib/selection/candidate-pool.ts`

## 4. 性能基线

SQLite 当前启用：

- `journal_mode = WAL`
- `busy_timeout = 5000`
- `synchronous = NORMAL`
- `foreign_keys = ON`

统一 DB client 默认记录慢查询：

- 默认阈值：120ms
- 环境变量：`DB_SLOW_QUERY_MS`
- 日志格式：`[db:slow] label elapsedMs`

数据库健康统计接口：

- `GET /api/db/stats`
- 返回 SQLite 文件大小、关键表行数、关键表最新时间。
- 该接口只展示相对路径和聚合统计，不输出配置值、API Key 或 Webhook。
- CLI：`npm run db:stats`
- 查看运行形态：`npm run db:stats -- --mode=runtime`
- 查看归档预估：`npm run db:stats -- --mode=retention`

数据库运行形态接口：

- `GET /api/db/stats?mode=runtime`
- 返回当前实际运行引擎、配置引擎、数据库路径、备份目录、归档目录、慢查询阈值和能力清单。
- 当前 `DATABASE_PROVIDER=sqlite`。如果未来配置为 `postgres`，但 Postgres client 和迁移对账脚本尚未完成，接口会提示“待迁移”，不会悄悄切换运行时。
- 该接口用于部署巡检和配置中心展示，不包含密钥、连接串或 webhook。

数据库生命周期预估接口：

- `GET /api/db/stats?mode=retention-preview`
- 返回各类快照和运行记录在默认保留窗口下的可归档行数。
- 当前仅做预估，不执行删除；后续若开放清理动作，必须先导出归档，再二次确认。

配置中心入口：

- `配置中心 -> 数据存储与性能`
- 展示数据库大小、关键表规模、最新更新时间和生命周期预估。

数据库备份：

- 页面入口：`配置中心 -> 数据存储与性能 -> 立即备份`
- API：`POST /api/db/backups`
- 列表：`GET /api/db/backups?limit=5`
- CLI：`npm run db:backup`
- 列出备份：`npm run db:backups`
- 默认保存目录：`data/backups`
- 备份使用 SQLite 原生 backup API，能够生成包含 WAL 数据的一致快照。

数据库归档：

- 页面入口：`配置中心 -> 数据存储与性能 -> 导出归档`
- API：`POST /api/db/archives`
- 试算：`POST /api/db/archives?dryRun=1`
- 列表：`GET /api/db/archives?limit=5`
- CLI：`npm run db:archive`
- CLI 试算：`npm run db:archive -- --dry-run`
- 列出归档：`npm run db:archives`
- 默认保存目录：`data/archives`
- 归档只导出超过保留窗口的旧数据到 JSONL 和 manifest，不删除主库记录。
- 当前无可归档数据时返回 0 行结果，不写空归档文件。
- 后续若开放真实清理，必须先执行数据库备份，再执行归档导出，最后人工二次确认。

常用索引：

- `analysis_reports(createdAt desc)`
- `analysis_reports(reportType, createdAt desc)`
- `stock_signal_snapshots(createdAt desc)`
- `stock_signal_snapshots(code, createdAt desc)`
- `stock_memory_snapshots(code, createdAt desc)`
- `market_snapshots(createdAt desc)`
- `market_snapshots(reportId, createdAt desc)`
- `sector_snapshots(normalizedName, createdAt desc)`
- `sector_snapshots(reportId, rank)`
- `rule_events(createdAt desc)`
- `rule_events(subjectType, subjectKey, createdAt desc)`
- `scheduler_runs(startedAt desc)`
- `selection_runs(startedAt desc)`
- `selection_runs(strategyId, startedAt desc)`
- `notification_channels(enabled, createdAt desc)`
- `model_audit_feedback(createdAt desc)`
- `model_audit_feedback(reportId)`

## 5. 数据生命周期

系统会越来越依赖历史数据，但不能把所有原始 JSON 无限塞进模型上下文，也不能让 SQLite 文件无限膨胀。

建议保留策略：

- `analysis_reports`：长期保留，但后续应支持导出归档。
- `market_snapshots`：长期保留，可用于大盘状态连续性。
- `sector_snapshots`：长期保留，可用于主线阶段迁移。
- `stock_signal_snapshots`：保留 180 天热数据；更早数据可归档到 JSONL 或 PostgreSQL 冷表。
- `stock_memory_snapshots`：保留 180 天热数据；股票级汇总记忆永久保留。
- `selection_runs`：长期保留，但大结果 JSON 可按策略和月份归档。
- `model_audit_feedback`：长期保留，作为系统演进依据。
- `scheduler_runs`：保留 180 天，失败记录可长期保留摘要。

进入 DeepSeek 的历史上下文必须使用压缩记忆：

- 最近短线时间点
- 中线阶段路径
- 时间链质量统计
- 个股最近摘要
- 关键规则事件

不得把完整历史报告直接放入 prompt。

历史连续性读取约束：

- 规则 1/2 的大盘连续性、主线阶段迁移和核心股持续性，优先读取 `market_snapshots` 与 `sector_snapshots`。
- `analysis_reports.factPackageJson` 只用于报告详情、完整复盘、兼容旧数据兜底，不得作为高频时间链扫描的默认路径。
- `getRecentMarketTimelinePoints` 已按轻量快照表构造时间链；只有快照表为空时才回退解析历史报告。
- 时间链质量统计使用 `analysis_reports.displayable` 聚合，不再逐份解析完整 `factPackageJson`。
- 增量规则事件的上一期大盘状态读取 `market_snapshots`，不扫描完整报告。

## 6. PostgreSQL 迁移触发条件

满足任一条件时，建议启动 PostgreSQL 迁移：

- 数据库文件超过 1GB 且报告/选股列表明显变慢。
- 自动分析频率提高到盘中高频，并出现写入阻塞。
- 多用户使用或部署到 Linux 服务器并需要远程访问。
- 需要复杂查询：跨股票、跨板块、跨策略的多维统计。
- 需要更完整的备份、权限、审计和只读副本。

## 7. PostgreSQL 迁移步骤

1. 保持业务层只调用 `src/lib/db/client.ts` 或仓储函数。
2. 为 PostgreSQL 新增 client 实现，先保留相同的仓储 API。
3. 把当前 SQLite schema 转成 SQL migration 文件。
4. 编写一次性迁移脚本：
   - settings
   - analysis_reports
   - market_snapshots
   - sector_snapshots
   - stock_signal_snapshots
   - stock_memories
   - stock_memory_snapshots
   - rule_events
   - selection_runs
   - model_audit_feedback
5. 用只读对账脚本校验行数、最新时间、关键字段 JSON 可解析。
6. 先在测试环境切换 `DATABASE_PROVIDER=postgres`。
7. 确认 API、定时分析、选股运行、反馈留痕全部通过后，再切生产。

当前安全阀：

- `src/lib/db/provider.ts` 声明当前实际运行时只支持 `sqlite`。
- 如果环境变量误设为 `DATABASE_PROVIDER=postgres`，底层数据库入口会直接失败，不会继续静默写入 SQLite。
- 这不是 PostgreSQL 支持完成的标志，只是为了防止部署时产生“以为已换库、实际仍写本地 SQLite”的误判。

## 8. 迁库前只读体检

系统已经提供数据库只读体检能力，用于重构前、迁库前和数据增长后的健康检查。

接口：

- `GET /api/db/stats?mode=audit`
- 可选参数：`sampleLimit=500`

CLI：

- `npm run db:audit`
- `npm run db:audit -- --sample-limit=5000`

体检内容：

- SQLite `quick_check`
- WAL、`foreign_keys`、`busy_timeout` 等运行参数
- 关键索引完整性
- 关键 JSON 字段可解析性抽样
- 最大表规模和数据库文件大小
- PostgreSQL 迁移健康度评分

体检约束：

- 只读，不修改业务数据。
- 不执行归档、不执行删除、不执行迁移。
- 默认按字段抽样检查，迁库前应提高 `sampleLimit`。
- 若 `quick_check` 未通过、关键索引缺失、或关键 JSON 字段存在不可解析样本，不进入迁库。

迁库前强制流程：

1. 执行 `npm run db:backup`。
2. 执行 `npm run db:audit -- --sample-limit=5000`。
3. 导出归档预览，确认热数据和冷数据边界。
4. 迁库后对账每张表行数、关键表最新时间和 JSON 字段可解析性。
5. 验证 `/api/reports`、`/api/selection/runs`、`/api/model-audit` 仍然走摘要列表，不回退到大 JSON 扫描。

## 9. 后续开发要求

- 新增数据库读写必须先写在 `src/lib/db/*` 或领域仓储层，不允许组件或 API route 直接写 SQL。
- 每个查询必须设置可读的 `label`，便于慢查询定位。
- 高频列表查询必须明确 `limit`，禁止无限读取。
- 大 JSON 字段只在详情页读取，列表页只读摘要字段。
- `selection_runs` 列表使用 `rejectedCount` 和 `topPickPreviewJson`，不得为了列表页读取完整 `resultJson`。
- 若需要批量读取完整选股运行详情，`/api/selection/runs?detail=1` 上限限制为 5 条；常规页面应使用摘要列表 + 单条详情。
- `model_audit_feedback` 列表默认返回 summary，不返回完整 `feedbackJson`；需要详情时调用 `/api/model-audit/:id`。
- `/api/model-audit?detail=1` 仅用于调试或小批量导出，后续若继续保留必须限制上限。
- 写入多个相关表必须使用 `dbTransaction`。
- 新增表必须同时考虑：
  - 主键
  - 时间索引
  - 业务查询索引
  - 数据保留策略
  - 未来 PostgreSQL 字段类型

## 10. 当前换库边界补充

配置中心的 `GET /api/db/stats?mode=runtime` 已经返回结构化的业务域边界：

- 分析报告与事实包：`src/lib/db/reports.ts`，覆盖 `analysis_reports`、`market_snapshots`、`sector_snapshots`、`stock_signal_snapshots`、`rule_events`，迁移优先级 P0。
- 股票记忆与追踪：`src/lib/db/stockMemory.ts`、`src/lib/db/stockTracking.ts`，覆盖个股记忆、追踪项、追踪快照和追踪事件，迁移优先级 P0。
- 策略选股运行：`src/lib/selection/runs.ts`、`src/lib/selection/candidate-pool.ts`，覆盖 `selection_runs`，迁移优先级 P1。
- 配置、调度与通知：`src/lib/db/settings.ts`、`src/lib/db/notifications.ts`，覆盖 `settings`、`scheduler_runs`、`notification_channels`，迁移优先级 P1。
- 模型反馈与系统审计：`src/lib/db/modelAudit.ts`、`src/lib/db/dataSourceHealth.ts`、`src/lib/db/ruleReplay.ts`，覆盖反馈与派生审计查询，迁移优先级 P2。

迁库前仍未完成的阻塞项：

- PostgreSQL schema migration 文件。
- SQLite 到 PostgreSQL 的只读迁移对账脚本。
- 字段类型对照表，尤其是大 JSON、时间戳、枚举状态和密钥脱敏字段。

因此当前仍不建议直接切换 `DATABASE_PROVIDER=postgres`。正确顺序是先完成仓储边界收敛、只读迁移脚本、对账脚本，再在测试环境切换。
