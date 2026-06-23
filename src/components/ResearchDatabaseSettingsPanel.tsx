"use client";

import { Archive, BarChart3, CopyCheck, Database, DownloadCloud, RefreshCw, ShieldCheck, Stethoscope } from "lucide-react";
import {
  SettingsMiniStat as MiniStat,
  SettingsPanel as Panel,
  SettingsSectionTitle as SectionTitle
} from "@/components/ResearchSettingsControls";
import type {
  DatabaseArchiveRecord,
  DatabaseAuditReport,
  DatabaseBackupRecord,
  DatabaseReconciliationBaseline,
  DatabaseRetentionPreview,
  DatabaseRuntimeInfo,
  DatabaseStatsSummary,
  ReportSummaryMaintenanceStatus
} from "@/components/ResearchSettingsTypes";

export function DatabaseSettingsPanel({
  stats,
  runtime,
  retentionPreview,
  audit,
  reconciliation,
  backups,
  archives,
  status,
  backupStatus,
  archiveStatus,
  reportSummaryStatus,
  reportSummaryMaintenanceStatus,
  loadDatabaseStats,
  loadDatabaseAudit,
  backfillReportSummaries,
  createDatabaseBackup,
  exportDatabaseArchive,
  formatDateTime
}: {
  stats: DatabaseStatsSummary | null;
  runtime: DatabaseRuntimeInfo | null;
  retentionPreview: DatabaseRetentionPreview | null;
  audit: DatabaseAuditReport | null;
  reconciliation: DatabaseReconciliationBaseline | null;
  backups: DatabaseBackupRecord[];
  archives: DatabaseArchiveRecord[];
  status: string;
  backupStatus: string;
  archiveStatus: string;
  reportSummaryStatus: ReportSummaryMaintenanceStatus | null;
  reportSummaryMaintenanceStatus: string;
  loadDatabaseStats: () => void;
  loadDatabaseAudit: () => void;
  backfillReportSummaries: () => void;
  createDatabaseBackup: () => void;
  exportDatabaseArchive: () => void;
  formatDateTime: (value: string) => string;
}) {
  const biggestTables = [...(stats?.tables ?? [])].sort((left, right) => right.rowCount - left.rowCount).slice(0, 6);
  const hotTables = retentionPreview?.policies.filter((policy) => policy.removableRows > 0) ?? [];
  const archivableRows = hotTables.reduce((sum, policy) => sum + policy.removableRows, 0);
  const invalidJsonColumns = audit?.jsonHealth.filter((item) => item.invalidRows > 0) ?? [];
  const jsonWarningColumns = audit?.jsonHealth.filter((item) => item.status === "warning" && item.invalidRows === 0) ?? [];
  const missingIndexCount = audit?.indexes.missing.length ?? 0;

  return (
    <Panel>
      <SectionTitle icon={Database} title="数据存储与性能" meta="SQLite 当前状态 / 未来换库准备 / 清理预估" />
      <div className="mt-5 grid gap-4">
        <div className="rounded-lg border border-info/30 bg-info/10 p-3 text-sm">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 shrink-0 text-info" size={16} />
            <div>
              <p className="font-medium text-text">当前策略：先解耦，再换库</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                系统当前仍使用 SQLite，但业务层已经通过统一 DB client 访问。这里用于观察数据增长和保留策略，不会直接删除数据。
              </p>
            </div>
          </div>
        </div>

        <details className="rounded-lg border border-line bg-bg/40 p-3" open>
          <summary className="cursor-pointer text-sm font-medium text-info">
            数据库运行形态 {runtime ? ` / ${runtime.activeProvider}` : ""}
          </summary>
          <div className="mt-3 grid gap-3">
            <p className="rounded-lg border border-line bg-panel/55 p-3 text-xs leading-5 text-muted">
              {runtime?.providerMessage ?? "正在读取数据库运行形态..."}
            </p>
            <div className="grid gap-2 md:grid-cols-4">
              <MiniStat label="当前引擎" value={runtime?.activeProvider ?? "读取中"} />
              <MiniStat label="配置引擎" value={runtime?.configuredProvider ?? "读取中"} />
              <MiniStat label="慢查询阈值" value={runtime ? `${runtime.slowQueryMs}ms` : "读取中"} />
              <MiniStat label="换库状态" value={runtime?.providerReady ? "一致" : "待迁移"} />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <MiniStat label="备份目录" value={runtime?.backupDir ?? "-"} />
              <MiniStat label="归档目录" value={runtime?.archiveDir ?? "-"} />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {(runtime?.capabilities ?? []).map((item) => (
                <div key={item.key} className="rounded-lg border border-line bg-panel/55 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{item.label}</p>
                    <span className={`rounded border px-2 py-1 text-xs ${item.enabled ? "border-up/30 bg-up/10 text-up" : "border-muted/30 bg-bg/60 text-muted"}`}>
                      {item.enabled ? "已启用" : "未启用"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted">{item.note}</p>
                </div>
              ))}
            </div>
          </div>
        </details>

        <details className="rounded-lg border border-line bg-bg/40 p-3">
          <summary className="cursor-pointer text-sm font-medium text-info">
            换库边界与仓储拆分 {runtime ? ` / ${runtime.domains.length} 个业务域` : ""}
          </summary>
          <div className="mt-3 grid gap-3">
            <div className="grid gap-2 xl:grid-cols-2">
              {(runtime?.domains ?? []).map((domain) => (
                <div key={domain.key} className="rounded-lg border border-line bg-panel/55 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{domain.label}</p>
                      <p className="mt-1 font-mono text-[11px] text-muted">{domain.repository}</p>
                    </div>
                    <span className={`rounded border px-2 py-1 text-[11px] ${priorityClass(domain.migrationPriority)}`}>
                      {domain.migrationPriority.toUpperCase()}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted">{domain.note}</p>
                  <p className="mt-2 text-[11px] leading-5 text-muted">
                    表：{domain.tables.join("、")}
                  </p>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-line bg-panel/55 p-3">
              <p className="text-sm font-medium">迁移检查项</p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {(runtime?.migrationChecklist ?? []).map((item) => (
                  <div key={item.key} className="rounded-lg border border-line bg-bg/55 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">{item.label}</p>
                      <span className={`rounded border px-2 py-1 text-[11px] ${migrationStatusClass(item.status)}`}>
                        {migrationStatusLabel(item.status)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted">{item.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </details>

        <details className="rounded-lg border border-line bg-bg/40 p-3">
          <summary className="cursor-pointer text-sm font-medium text-info">
            迁移对账基线 {reconciliation ? ` / ${reconciliation.label}` : " / 未生成"}
          </summary>
          <div className="mt-3 grid gap-3">
            <div className="grid gap-2 md:grid-cols-4">
              <MiniStat label="基线状态" value={reconciliation?.label ?? "待读取"} />
              <MiniStat label="目标配置" value={reconciliation?.configuredTargetProvider ?? "-"} />
              <MiniStat label="基线指纹" value={reconciliation?.baselineHash ?? "-"} />
              <MiniStat label="生成时间" value={reconciliation ? formatDateTime(reconciliation.generatedAt) : "-"} />
            </div>
            {reconciliation?.blockers.length ? (
              <div className="rounded-lg border border-warn/25 bg-warn/10 p-3 text-xs leading-5 text-warn">
                <p className="mb-1 font-medium text-text">阻断项</p>
                <ul className="grid gap-1">
                  {reconciliation.blockers.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            ) : null}
            {reconciliation?.warnings.length ? (
              <div className="rounded-lg border border-info/25 bg-info/10 p-3 text-xs leading-5 text-info">
                <p className="mb-1 font-medium text-text">复核提示</p>
                <ul className="grid gap-1">
                  {reconciliation.warnings.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            ) : null}
            <div className="grid gap-2 lg:grid-cols-2">
              <div className="rounded-lg border border-line bg-panel/55 p-3">
                <p className="text-sm font-medium">行数与最新时间</p>
                <div className="mt-2 grid gap-1 text-xs leading-5 text-muted">
                  {(reconciliation?.tableChecks ?? []).slice(0, 8).map((item) => (
                    <p key={item.table} className="flex justify-between gap-3">
                      <span className="font-mono">{item.table}</span>
                      <span>{item.rowCount.toLocaleString("zh-CN")} / {item.latestAt ? formatDateTime(item.latestAt) : "-"}</span>
                    </p>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-line bg-panel/55 p-3">
                <p className="text-sm font-medium">JSON 对账</p>
                <div className="mt-2 grid gap-1 text-xs leading-5 text-muted">
                  {(reconciliation?.jsonChecks ?? []).slice(0, 8).map((item) => (
                    <p key={`${item.table}.${item.column}`} className="flex justify-between gap-3">
                      <span className="truncate font-mono">{item.table}.{item.column}</span>
                      <span>{item.invalidRows ? `${item.invalidRows} 异常` : `${item.checkedRows}/${item.totalNonEmptyRows}`}</span>
                    </p>
                  ))}
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-line bg-panel/55 p-3">
              <p className="text-sm font-medium">下一步</p>
              <ul className="mt-2 grid gap-1 text-xs leading-5 text-muted">
                {(reconciliation?.nextSteps ?? ["等待基线生成。"]).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
        </details>

        <div className="grid gap-3 md:grid-cols-4">
          <MiniStat label="数据库" value={stats?.provider ?? "sqlite"} />
          <MiniStat label="文件大小" value={stats ? `${stats.sizeMB} MB` : "读取中"} />
          <MiniStat label="关键表" value={stats ? `${stats.tables.length} 张` : "读取中"} />
          <MiniStat label="路径" value={stats?.path ?? "-"} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            className="flex w-fit items-center gap-2 rounded-lg border border-line bg-bg/60 px-4 py-2 text-sm text-muted hover:border-info/50 hover:text-info"
            type="button"
            onClick={loadDatabaseStats}
          >
            <RefreshCw size={16} />
            刷新存储状态
          </button>
          <button
            className="flex w-fit items-center gap-2 rounded-lg border border-up/35 bg-up/10 px-4 py-2 text-sm text-up hover:border-up/60"
            type="button"
            onClick={loadDatabaseAudit}
          >
            <Stethoscope size={16} />
            运行体检
          </button>
          <button
            className="flex w-fit items-center gap-2 rounded-lg border border-info/40 bg-info/10 px-4 py-2 text-sm text-info hover:border-info/70"
            type="button"
            onClick={createDatabaseBackup}
          >
            <DownloadCloud size={16} />
            立即备份
          </button>
          <button
            className="flex w-fit items-center gap-2 rounded-lg border border-warn/35 bg-warn/10 px-4 py-2 text-sm text-warn hover:border-warn/60 disabled:cursor-not-allowed disabled:opacity-45"
            type="button"
            onClick={exportDatabaseArchive}
            disabled={!archivableRows}
            title={archivableRows ? "导出超过保留窗口的旧数据，不删除主库记录" : "当前没有超过保留窗口的旧数据"}
          >
            <Archive size={16} />
            导出归档
          </button>
          {stats?.generatedAt ? <span className="text-xs text-muted">更新时间：{formatDateTime(stats.generatedAt)}</span> : null}
          {status ? <span className="text-xs text-muted">{status}</span> : null}
          {backupStatus ? <span className="text-xs text-muted">{backupStatus}</span> : null}
          {archiveStatus ? <span className="text-xs text-muted">{archiveStatus}</span> : null}
        </div>

        <details className="rounded-lg border border-line bg-bg/40 p-3">
          <summary className="cursor-pointer text-sm font-medium text-info">
            报表摘要索引维护
            {reportSummaryStatus ? ` / 覆盖 ${reportSummaryStatus.coveragePct}%` : " / 待读取"}
          </summary>
          <div className="mt-3 grid gap-3">
            <div className="rounded-lg border border-info/25 bg-info/10 p-3 text-xs leading-5 text-muted">
              报表摘要索引用来支撑数据源健康、规则瓶颈、候选池复盘等高频面板，避免每次都解析完整 FactPackage。
              它是可重建的派生数据，不替代原始分析报告。
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              <MiniStat label="完整报告" value={reportSummaryStatus ? reportSummaryStatus.fullReportCount.toLocaleString("zh-CN") : "-"} />
              <MiniStat label="摘要索引" value={reportSummaryStatus ? reportSummaryStatus.summaryCount.toLocaleString("zh-CN") : "-"} />
              <MiniStat label="缺失摘要" value={reportSummaryStatus ? reportSummaryStatus.missingCount.toLocaleString("zh-CN") : "-"} />
              <MiniStat label="覆盖率" value={reportSummaryStatus ? `${reportSummaryStatus.coveragePct}%` : "-"} />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <MiniStat label="最新报告" value={reportSummaryStatus?.latestReportAt ? formatDateTime(reportSummaryStatus.latestReportAt) : "-"} />
              <MiniStat label="最新摘要生成" value={reportSummaryStatus?.latestSummaryAt ? formatDateTime(reportSummaryStatus.latestSummaryAt) : "-"} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="flex w-fit items-center gap-2 rounded-lg border border-info/40 bg-info/10 px-4 py-2 text-sm text-info hover:border-info/70"
                type="button"
                onClick={backfillReportSummaries}
              >
                <RefreshCw size={16} />
                补齐摘要索引
              </button>
              <button
                className="flex w-fit items-center gap-2 rounded-lg border border-line bg-bg/60 px-4 py-2 text-sm text-muted hover:border-info/50 hover:text-info"
                type="button"
                onClick={loadDatabaseStats}
              >
                <Database size={16} />
                刷新状态
              </button>
              {reportSummaryMaintenanceStatus ? <span className="text-xs text-muted">{reportSummaryMaintenanceStatus}</span> : null}
            </div>
            {reportSummaryStatus?.missingCount ? (
              <div className="rounded-lg border border-warn/25 bg-warn/10 p-3 text-xs leading-5 text-warn">
                仍有 {reportSummaryStatus.missingCount.toLocaleString("zh-CN")} 份历史报告缺少摘要。建议先补齐，避免健康面板回落到解析大 JSON 的慢路径。
              </div>
            ) : reportSummaryStatus ? (
              <div className="rounded-lg border border-up/25 bg-up/10 p-3 text-xs leading-5 text-up">
                当前摘要索引已覆盖完整报告，高频面板可以走轻量读取路径。
              </div>
            ) : null}
          </div>
        </details>

        <details className="rounded-lg border border-line bg-bg/40 p-3" open>
          <summary className="cursor-pointer text-sm font-medium text-info">
            数据库体检 {audit ? ` / ${audit.migrationReadiness.label} ${audit.migrationReadiness.score}` : " / 未运行"}
          </summary>
          <div className="mt-3 grid gap-3">
            <div className="grid gap-2 md:grid-cols-4">
              <MiniStat label="迁移健康度" value={audit ? `${audit.migrationReadiness.score} / ${audit.migrationReadiness.label}` : "等待体检"} />
              <MiniStat label="完整性" value={audit?.integrity.status === "ok" ? "通过" : audit ? "需排查" : "等待体检"} />
              <MiniStat label="索引" value={audit ? `${audit.indexes.presentCount}/${audit.indexes.requiredCount}` : "等待体检"} />
              <MiniStat label="JSON 异常" value={audit ? `${invalidJsonColumns.length} 处` : "等待体检"} />
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              <MiniStat label="WAL" value={audit?.pragmas.journalMode || "-"} />
              <MiniStat label="Foreign Keys" value={audit ? (audit.pragmas.foreignKeys ? "开启" : "未开启") : "-"} />
              <MiniStat label="Busy Timeout" value={audit ? `${audit.pragmas.busyTimeoutMs}ms` : "-"} />
              <MiniStat label="抽样上限" value={audit ? `${audit.sampleLimit} 行/字段` : "-"} />
            </div>

            {audit?.risks.length ? (
              <div className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-xs leading-5 text-warn">
                <p className="mb-1 font-medium text-text">风险提示</p>
                <ul className="grid gap-1">
                  {audit.risks.map((risk) => <li key={risk}>{risk}</li>)}
                </ul>
              </div>
            ) : audit ? (
              <div className="rounded-lg border border-up/25 bg-up/10 p-3 text-xs leading-5 text-up">
                当前抽样体检未发现阻断问题，SQLite 可继续支撑 MVP 阶段。
              </div>
            ) : (
              <div className="rounded-lg border border-line bg-panel/55 p-3 text-sm text-muted">
                点击“运行体检”后，会只读检查数据库完整性、关键索引和 JSON 字段可解析性。
              </div>
            )}

            {(invalidJsonColumns.length || missingIndexCount) ? (
              <div className="grid gap-2 md:grid-cols-2">
                {invalidJsonColumns.length ? (
                  <div className="rounded-lg border border-warn/25 bg-panel/55 p-3">
                    <p className="text-sm font-medium text-warn">JSON 异常字段</p>
                    <div className="mt-2 grid gap-2">
                      {invalidJsonColumns.slice(0, 6).map((item) => (
                        <p key={`${item.table}.${item.column}`} className="text-xs leading-5 text-muted">
                          {item.label}：{item.invalidRows} 行异常，首个 rowid {item.firstInvalidId ?? "-"}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}
                {missingIndexCount ? (
                  <div className="rounded-lg border border-warn/25 bg-panel/55 p-3">
                    <p className="text-sm font-medium text-warn">缺失索引</p>
                    <p className="mt-2 text-xs leading-5 text-muted">{audit?.indexes.missing.slice(0, 8).join("、")}</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {jsonWarningColumns.length ? (
              <p className="text-xs leading-5 text-muted">
                有 {jsonWarningColumns.length} 个 JSON 字段只完成最近样本抽查，完整迁库前建议用 CLI 提高抽样上限。
              </p>
            ) : null}
          </div>
        </details>

        <div className="rounded-lg border border-line bg-bg/40 p-3">
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 size={16} className="text-info" />
            <p className="text-sm font-medium">数据表规模</p>
          </div>
          <div className="grid gap-2">
            {biggestTables.map((table) => (
              <div key={table.name} className="rounded-lg border border-line bg-panel/55 p-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-text">{tableLabel(table.name)}</span>
                  <span className="text-muted">{table.rowCount.toLocaleString("zh-CN")} 行</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-info"
                    style={{ width: `${tableBarWidth(table.rowCount, biggestTables[0]?.rowCount ?? 1)}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  最新：{table.latestAt ? formatDateTime(table.latestAt) : "暂无"}
                </p>
              </div>
            ))}
          </div>
        </div>

        <details className="rounded-lg border border-line bg-bg/40 p-3">
          <summary className="cursor-pointer text-sm font-medium text-info">
            数据生命周期预估 {hotTables.length ? ` / ${hotTables.length} 张表存在可归档旧数据` : ""}
          </summary>
          <div className="mt-3 grid gap-2">
            {(retentionPreview?.policies ?? []).map((policy) => (
              <div key={policy.table} className="rounded-lg border border-line bg-panel/55 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{policy.label}</p>
                    <p className="mt-1 text-xs leading-5 text-muted">{policy.note}</p>
                  </div>
                  <span className={`rounded border px-2 py-1 text-xs ${policy.removableRows ? "border-warn/30 bg-warn/10 text-warn" : "border-up/30 bg-up/10 text-up"}`}>
                    {policy.removableRows ? `可归档 ${policy.removableRows}` : "无需清理"}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-4">
                  <MiniStat label="保留窗口" value={`${policy.retentionDays} 天`} />
                  <MiniStat label="总行数" value={policy.totalRows.toLocaleString("zh-CN")} />
                  <MiniStat label="可归档比例" value={`${policy.removablePct}%`} />
                  <MiniStat label="最早记录" value={policy.oldestAt ? formatDateTime(policy.oldestAt) : "-"} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-lg border border-warn/25 bg-warn/10 p-3 text-xs leading-5 text-warn">
            <Archive className="mr-1 inline" size={14} />
            当前只做预估，不执行删除。后续若开放清理，会先导出归档，再二次确认。
          </div>
        </details>

        <details className="rounded-lg border border-line bg-bg/40 p-3">
          <summary className="cursor-pointer text-sm font-medium text-info">
            数据归档 {archives.length ? ` / 最近 ${archives.length} 份` : archivableRows ? ` / 可导出 ${archivableRows} 行` : " / 暂无可归档旧数据"}
          </summary>
          <div className="mt-3 grid gap-2">
            {archives.length ? archives.map((archive) => (
              <div key={archive.id} className="rounded-lg border border-line bg-panel/55 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm text-text">{archive.fileName}</p>
                    <p className="mt-1 break-all text-xs text-muted">{archive.path}</p>
                    <p className="mt-1 break-all text-[11px] text-muted">manifest：{archive.manifestPath}</p>
                  </div>
                  <span className="rounded border border-info/30 bg-info/10 px-2 py-1 text-xs text-info">
                    {archive.rowCount.toLocaleString("zh-CN")} 行
                  </span>
                </div>
                <div className="mt-2 grid gap-2 text-xs text-muted md:grid-cols-3">
                  <span>表数：{archive.tableCount}</span>
                  <span>大小：{archive.sizeMB} MB</span>
                  <span>创建：{formatDateTime(archive.createdAt)}</span>
                </div>
              </div>
            )) : (
              <div className="rounded-lg border border-line bg-panel/55 p-3 text-sm text-muted">
                当前没有归档文件。归档只会导出超过保留窗口的旧快照，不会删除主库数据。
              </div>
            )}
          </div>
          <div className="mt-3 rounded-lg border border-warn/25 bg-warn/10 p-3 text-xs leading-5 text-warn">
            <Archive className="mr-1 inline" size={14} />
            归档用于未来冷存和迁移准备。正式清理必须先备份、再导出归档、最后人工确认。
          </div>
        </details>

        <details className="rounded-lg border border-line bg-bg/40 p-3" open>
          <summary className="cursor-pointer text-sm font-medium text-info">
            数据库备份 {backups.length ? ` / 最近 ${backups.length} 份` : ""}
          </summary>
          <div className="mt-3 grid gap-2">
            {backups.length ? backups.map((backup) => (
              <div key={backup.fileName} className="rounded-lg border border-line bg-panel/55 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm text-text">{backup.fileName}</p>
                    <p className="mt-1 break-all text-xs text-muted">{backup.path}</p>
                  </div>
                  <span className="rounded border border-up/30 bg-up/10 px-2 py-1 text-xs text-up">
                    {backup.sizeMB} MB
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted">创建时间：{formatDateTime(backup.createdAt)}</p>
              </div>
            )) : (
              <div className="rounded-lg border border-line bg-panel/55 p-3 text-sm text-muted">
                暂无备份。建议在清理旧数据、升级依赖、迁移服务器前先创建一次备份。
              </div>
            )}
          </div>
          <div className="mt-3 rounded-lg border border-up/25 bg-up/10 p-3 text-xs leading-5 text-up">
            <CopyCheck className="mr-1 inline" size={14} />
            备份使用 SQLite 原生 backup API，会合并 WAL 中尚未 checkpoint 的数据，适合当前开发环境和未来迁移前留档。
          </div>
        </details>
      </div>
    </Panel>
  );
}

function tableBarWidth(value: number, max: number) {
  if (!max) return 0;
  return Math.max(4, Math.min(100, Math.round((value / max) * 100)));
}

function priorityClass(value: "p0" | "p1" | "p2") {
  if (value === "p0") return "border-warn/35 bg-warn/10 text-warn";
  if (value === "p1") return "border-info/35 bg-info/10 text-info";
  return "border-line bg-bg/65 text-muted";
}

function migrationStatusClass(value: "ready" | "partial" | "blocked") {
  if (value === "ready") return "border-up/35 bg-up/10 text-up";
  if (value === "partial") return "border-info/35 bg-info/10 text-info";
  return "border-warn/35 bg-warn/10 text-warn";
}

function migrationStatusLabel(value: "ready" | "partial" | "blocked") {
  if (value === "ready") return "已具备";
  if (value === "partial") return "部分完成";
  return "待建设";
}

function tableLabel(value: string) {
  const labels: Record<string, string> = {
    analysis_reports: "分析报告",
    market_snapshots: "大盘快照",
    sector_snapshots: "板块快照",
    stock_signal_snapshots: "个股信号快照",
    stock_memories: "个股聚合记忆",
    stock_memory_snapshots: "个股记忆快照",
    rule_events: "规则事件",
    selection_runs: "策略选股运行",
    model_audit_feedback: "模型系统反馈",
    scheduler_runs: "定时运行记录",
    notification_channels: "通知通道",
    settings: "系统配置"
  };
  return labels[value] ?? value;
}
