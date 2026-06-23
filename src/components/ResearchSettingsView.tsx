"use client";

import { useEffect, useState } from "react";
import { AutomationSettingsPanel, TradingCalendarPanel } from "@/components/ResearchAutomationSettingsPanels";
import { DatabaseSettingsPanel } from "@/components/ResearchDatabaseSettingsPanel";
import { ProjectHealthPanel } from "@/components/ProjectHealthPanel";
import { DataSourceSettingsPanel, ModelServiceSettingsPanel } from "@/components/ResearchSettingsPanels";
import type {
  ApiResponse,
  DataSourceSettingsForm,
  DatabaseArchiveRecord,
  DatabaseArchiveResult,
  DatabaseAuditReport,
  DatabaseBackupRecord,
  DatabaseBackupResult,
  DatabaseReconciliationBaseline,
  DatabaseRetentionPreview,
  DatabaseRuntimeInfo,
  DatabaseStatsSummary,
  ReportSummaryBackfillResult,
  ReportSummaryMaintenanceStatus,
  RuleEventSummary,
  SchedulerDecisionPreview,
  SchedulerForm,
  SchedulerRunSummary,
  SettingsForm,
  TradingCalendarSettings
} from "@/components/ResearchSettingsTypes";
import type { AppSettings, DataSourceSettings, SchedulerSettings } from "@/lib/types";
import type { ProviderCapabilityAudit } from "@/lib/data/providerCapabilityAudit";

export function SettingsView({ settings, onSaved }: { settings: AppSettings | null; onSaved: (settings: AppSettings) => void }) {
  const [form, setForm] = useState<SettingsForm>(() => toSettingsForm(settings));
  const [modelKeyVisible, setModelKeyVisible] = useState(false);
  const [dataSettings, setDataSettings] = useState<DataSourceSettings | null>(null);
  const [dataForm, setDataForm] = useState<DataSourceSettingsForm>({ providers: [] });
  const [dataStatus, setDataStatus] = useState("");
  const [visibleDataKeys, setVisibleDataKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [modelTestStatus, setModelTestStatus] = useState("");
  const [dataTestStatus, setDataTestStatus] = useState<Record<string, string>>({});
  const [dataCapabilityAudit, setDataCapabilityAudit] = useState<Record<string, ProviderCapabilityAudit["providers"][number]>>({});
  const [calendar, setCalendar] = useState<TradingCalendarSettings | null>(null);
  const [calendarText, setCalendarText] = useState("");
  const [calendarStatus, setCalendarStatus] = useState("");
  const [calendarEditorOpen, setCalendarEditorOpen] = useState(false);
  const [schedulerRuns, setSchedulerRuns] = useState<SchedulerRunSummary[]>([]);
  const [ruleEvents, setRuleEvents] = useState<RuleEventSummary[]>([]);
  const [schedulerForm, setSchedulerForm] = useState<SchedulerForm>(() => toSchedulerForm(null));
  const [schedulerDecision, setSchedulerDecision] = useState<SchedulerDecisionPreview | null>(null);
  const [automationStatus, setAutomationStatus] = useState("");
  const [databaseStats, setDatabaseStats] = useState<DatabaseStatsSummary | null>(null);
  const [databaseRuntime, setDatabaseRuntime] = useState<DatabaseRuntimeInfo | null>(null);
  const [databaseAudit, setDatabaseAudit] = useState<DatabaseAuditReport | null>(null);
  const [databaseReconciliation, setDatabaseReconciliation] = useState<DatabaseReconciliationBaseline | null>(null);
  const [retentionPreview, setRetentionPreview] = useState<DatabaseRetentionPreview | null>(null);
  const [databaseBackups, setDatabaseBackups] = useState<DatabaseBackupRecord[]>([]);
  const [databaseArchives, setDatabaseArchives] = useState<DatabaseArchiveRecord[]>([]);
  const [reportSummaryStatus, setReportSummaryStatus] = useState<ReportSummaryMaintenanceStatus | null>(null);
  const [databaseStatus, setDatabaseStatus] = useState("");
  const [databaseBackupStatus, setDatabaseBackupStatus] = useState("");
  const [databaseArchiveStatus, setDatabaseArchiveStatus] = useState("");
  const [reportSummaryMaintenanceStatus, setReportSummaryMaintenanceStatus] = useState("");

  useEffect(() => {
    setForm(toSettingsForm(settings));
  }, [settings]);

  useEffect(() => {
    void loadTradingCalendar();
    void loadDataSourceSettings();
    void loadSchedulerSettings();
    void loadSchedulerDecision();
    void loadAutomationStatus();
    void refreshDatabasePanel();
  }, []);

  async function refreshDatabasePanel() {
    await Promise.all([loadDatabaseStats(), loadDatabaseBackups(), loadDatabaseArchives(), loadReportSummaryStatus()]);
  }

  async function loadDatabaseStats() {
    setDatabaseStatus("正在读取数据库状态...");
    try {
      const [stats, runtime, retention] = await Promise.all([
        fetchJson<DatabaseStatsSummary>("/api/db/stats"),
        fetchJson<DatabaseRuntimeInfo>("/api/db/stats?mode=runtime"),
        fetchJson<DatabaseRetentionPreview>("/api/db/stats?mode=retention-preview")
      ]);
      if (!stats.success || !stats.data) throw new Error(stats.error?.message ?? "数据库状态读取失败");
      if (!runtime.success || !runtime.data) throw new Error(runtime.error?.message ?? "数据库运行信息读取失败");
      if (!retention.success || !retention.data) throw new Error(retention.error?.message ?? "生命周期预估读取失败");
      setDatabaseStats(stats.data);
      setDatabaseRuntime(runtime.data);
      setRetentionPreview(retention.data);
      void loadDatabaseAudit({ silent: true });
      void loadDatabaseReconciliation();
      setDatabaseStatus("");
    } catch (error) {
      setDatabaseStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function loadDatabaseAudit(options: { silent?: boolean } = {}) {
    if (!options.silent) setDatabaseStatus("正在执行数据库只读体检...");
    try {
      const json = await fetchJson<DatabaseAuditReport>("/api/db/stats?mode=audit&sampleLimit=500");
      if (!json.success || !json.data) throw new Error(json.error?.message ?? "数据库体检读取失败");
      setDatabaseAudit(json.data);
      if (!options.silent) setDatabaseStatus("数据库体检完成。");
    } catch (error) {
      setDatabaseStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function loadDatabaseReconciliation() {
    try {
      const json = await fetchJson<DatabaseReconciliationBaseline>("/api/db/stats?mode=reconciliation");
      if (!json.success || !json.data) throw new Error(json.error?.message ?? "数据库迁移对账基线读取失败");
      setDatabaseReconciliation(json.data);
    } catch {
      setDatabaseReconciliation(null);
    }
  }

  async function loadReportSummaryStatus() {
    try {
      const json = await fetchJson<ReportSummaryMaintenanceStatus>("/api/db/report-summaries/backfill");
      if (!json.success || !json.data) throw new Error(json.error?.message ?? "报表摘要状态读取失败");
      setReportSummaryStatus(json.data);
    } catch {
      setReportSummaryStatus(null);
    }
  }

  async function backfillReportSummaries() {
    setReportSummaryMaintenanceStatus("正在补齐报表摘要索引...");
    try {
      const response = await fetch("/api/db/report-summaries/backfill?limit=500", { method: "POST" });
      const json = (await response.json()) as ApiResponse<ReportSummaryBackfillResult>;
      if (!json.success || !json.data) throw new Error(json.error?.message ?? "报表摘要回填失败");
      setReportSummaryMaintenanceStatus(
        `回填完成：扫描 ${json.data.scanned} 份，新增 ${json.data.created} 份，剩余缺口 ${json.data.remainingMissing}，耗时 ${json.data.elapsedMs}ms。`
      );
      await Promise.all([loadDatabaseStats(), loadReportSummaryStatus()]);
    } catch (error) {
      setReportSummaryMaintenanceStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function loadDatabaseBackups(options: { silent?: boolean } = {}) {
    if (!options.silent) setDatabaseBackupStatus("正在读取数据库备份列表...");
    try {
      const json = await fetchJson<DatabaseBackupRecord[]>("/api/db/backups?limit=5");
      if (!json.success || !json.data) throw new Error(json.error?.message ?? "数据库备份列表读取失败");
      setDatabaseBackups(json.data);
      if (!options.silent) setDatabaseBackupStatus("");
    } catch (error) {
      setDatabaseBackupStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function loadDatabaseArchives(options: { silent?: boolean } = {}) {
    if (!options.silent) setDatabaseArchiveStatus("正在读取数据库归档列表...");
    try {
      const json = await fetchJson<DatabaseArchiveRecord[]>("/api/db/archives?limit=5");
      if (!json.success || !json.data) throw new Error(json.error?.message ?? "数据库归档列表读取失败");
      setDatabaseArchives(json.data);
      if (!options.silent) setDatabaseArchiveStatus("");
    } catch (error) {
      setDatabaseArchiveStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function createDatabaseBackup() {
    setDatabaseBackupStatus("正在创建数据库备份...");
    try {
      const response = await fetch("/api/db/backups", { method: "POST" });
      const json = (await response.json()) as ApiResponse<DatabaseBackupResult>;
      if (!json.success || !json.data) throw new Error(json.error?.message ?? "数据库备份失败");
      setDatabaseBackupStatus(`备份完成：${json.data.fileName}，${json.data.sizeMB} MB，耗时 ${json.data.elapsedMs}ms。`);
      await Promise.all([loadDatabaseStats(), loadDatabaseBackups({ silent: true })]);
    } catch (error) {
      setDatabaseBackupStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function exportDatabaseArchive() {
    setDatabaseArchiveStatus("正在导出可归档数据...");
    try {
      const response = await fetch("/api/db/archives", { method: "POST" });
      const json = (await response.json()) as ApiResponse<DatabaseArchiveResult>;
      if (!json.success || !json.data) throw new Error(json.error?.message ?? "数据库归档导出失败");
      const tableText = json.data.tableCount ? `${json.data.tableCount} 张表` : "暂无可归档表";
      setDatabaseArchiveStatus(`归档完成：${json.data.fileName}，${tableText}，${json.data.rowCount} 行。主库未删除数据。`);
      await Promise.all([loadDatabaseStats(), loadDatabaseArchives({ silent: true })]);
    } catch (error) {
      setDatabaseArchiveStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function loadDataSourceSettings() {
    setDataStatus("正在读取数据源配置...");
    try {
      const json = await fetchJson<DataSourceSettings>("/api/data-settings");
      if (!json.success || !json.data) throw new Error(json.error?.message ?? "数据源配置读取失败");
      setDataSettings(json.data);
      setDataForm({ providers: json.data.providers });
      setDataStatus("");
    } catch (error) {
      setDataStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveDataSourceSettings() {
    setDataStatus("正在保存数据源配置...");
    try {
      const response = await fetch("/api/data-settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ providers: dataForm.providers })
      });
      const json = (await response.json()) as ApiResponse<DataSourceSettings>;
      if (!json.success || !json.data) throw new Error(json.error?.message ?? "数据源配置保存失败");
      setDataSettings(json.data);
      setDataForm({ providers: json.data.providers });
      setDataStatus("数据源配置已保存。Tushare 接入真实数据前不会改变现有腾讯/东方财富数据流。");
    } catch (error) {
      setDataStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function loadAutomationStatus() {
    setAutomationStatus("正在读取自动分析记录...");
    try {
      const [runs, events] = await Promise.all([
        fetchJson<SchedulerRunSummary[]>("/api/scheduler-runs?limit=5"),
        fetchJson<RuleEventSummary[]>("/api/rule-events?limit=5")
      ]);
      if (!runs.success || !runs.data) throw new Error(runs.error?.message ?? "调度记录读取失败");
      if (!events.success || !events.data) throw new Error(events.error?.message ?? "规则事件读取失败");
      setSchedulerRuns(runs.data);
      setRuleEvents(events.data);
      setAutomationStatus("");
    } catch (error) {
      setAutomationStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function loadSchedulerSettings() {
    const json = await fetchJson<SchedulerSettings>("/api/scheduler-settings");
    if (!json.success || !json.data) throw new Error(json.error?.message ?? "自动分析配置读取失败");
    setSchedulerForm(toSchedulerForm(json.data));
  }

  async function loadSchedulerDecision() {
    try {
      const json = await fetchJson<SchedulerDecisionPreview>("/api/scheduler-settings/decision");
      setSchedulerDecision(json.data);
    } catch {
      setSchedulerDecision(null);
    }
  }

  async function saveSchedulerSettings() {
    setAutomationStatus("正在保存自动分析配置...");
    try {
      const response = await fetch("/api/scheduler-settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled: schedulerForm.enabled,
          intradayScanEnabled: schedulerForm.intradayScanEnabled,
          intradayIntervalMinutes: Number(schedulerForm.intradayIntervalMinutes),
          keypointTimes: schedulerForm.keypointTimes,
          deepResearchTimes: schedulerForm.deepResearchTimes,
          llmOnEvent: schedulerForm.llmOnEvent,
          pushNotification: schedulerForm.pushNotification,
          auctionWatchlistPushEnabled: schedulerForm.auctionWatchlistPushEnabled,
          riskWarningPushEnabled: schedulerForm.riskWarningPushEnabled
        })
      });
      const json = (await response.json()) as ApiResponse<SchedulerSettings>;
      if (!json.success || !json.data) throw new Error(json.error?.message ?? "自动分析配置保存失败");
      setSchedulerForm(toSchedulerForm(json.data));
      void loadSchedulerDecision();
      setAutomationStatus("自动分析配置已保存。daemon/服务器任务会读取这份配置。");
    } catch (error) {
      setAutomationStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function loadTradingCalendar() {
    setCalendarStatus("正在读取交易日历...");
    try {
      const json = await fetchJson<TradingCalendarSettings>("/api/trading-calendar");
      if (!json.success || !json.data) throw new Error(json.error?.message ?? "交易日历读取失败");
      setCalendar(json.data);
      setCalendarText(json.data.closedDates.join("\n"));
      setCalendarStatus("");
    } catch (error) {
      setCalendarStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveTradingCalendar() {
    setCalendarStatus("正在保存交易日历...");
    try {
      const response = await fetch("/api/trading-calendar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ closedDates: calendarText })
      });
      const json = (await response.json()) as ApiResponse<TradingCalendarSettings>;
      if (!json.success || !json.data) throw new Error(json.error?.message ?? "交易日历保存失败");
      setCalendar(json.data);
      setCalendarText(json.data.closedDates.join("\n"));
      setCalendarStatus("已保存。后续大盘状态会按这份休市日历判断交易时段。");
    } catch (error) {
      setCalendarStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveSettings() {
    setSaving(true);
    setStatus("正在保存模型服务配置...");
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          temperature: Number(form.temperature),
          maxTokens: Number(form.maxTokens),
          timeoutMs: Number(form.timeoutMs)
        })
      });
      const json = (await response.json()) as ApiResponse<AppSettings>;
      if (!json.success || !json.data) throw new Error(json.error?.message ?? "配置保存失败");
      onSaved(json.data);
      setForm(toSettingsForm(json.data));
      setStatus("已保存。密钥只保存在服务端，前端仅返回掩码。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function testModelConnection() {
    setModelTestStatus("正在测试模型连接...");
    try {
      const response = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: form.provider,
          baseUrl: form.baseUrl,
          model: form.model,
          apiKey: form.apiKey,
          timeoutMs: Number(form.timeoutMs)
        })
      });
      const json = (await response.json()) as ApiResponse<{ ok: boolean; elapsedMs: number; message: string }>;
      if (!json.success || !json.data?.ok) throw new Error(json.error?.message ?? "模型连接测试失败");
      setModelTestStatus(`${json.data.message}，耗时 ${json.data.elapsedMs}ms。`);
    } catch (error) {
      setModelTestStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function testDataProviderConnection(provider: DataSourceSettings["providers"][number]) {
    setDataTestStatus((current) => ({ ...current, [provider.id]: "正在测试连接..." }));
    try {
      const response = await fetch("/api/data-settings/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerId: provider.id,
          apiKey: provider.apiKey
        })
      });
      const json = (await response.json()) as ApiResponse<{
        ok: boolean;
        elapsedMs: number;
        message: string;
        recordCount?: number;
        capabilityAudit?: ProviderCapabilityAudit["providers"][number];
      }>;
      if (!json.success || !json.data?.ok) throw new Error(json.error?.message ?? "数据源连接测试失败");
      const result = json.data;
      const countText = typeof result.recordCount === "number" ? `，返回 ${result.recordCount} 条` : "";
      setDataTestStatus((current) => ({ ...current, [provider.id]: `${result.message}${countText}，耗时 ${result.elapsedMs}ms。` }));
      if (result.capabilityAudit) {
        setDataCapabilityAudit((current) => ({ ...current, [provider.id]: result.capabilityAudit! }));
      }
    } catch (error) {
      setDataTestStatus((current) => ({ ...current, [provider.id]: error instanceof Error ? error.message : String(error) }));
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <ProjectHealthPanel />
      <ModelServiceSettingsPanel
        form={form}
        setForm={setForm}
        settings={settings}
        modelKeyVisible={modelKeyVisible}
        setModelKeyVisible={setModelKeyVisible}
        saving={saving}
        status={status}
        modelTestStatus={modelTestStatus}
        saveSettings={saveSettings}
        testModelConnection={testModelConnection}
        formatProvider={formatProvider}
      />
      <div className="grid gap-4">
        <DataSourceSettingsPanel
          dataForm={dataForm}
          setDataForm={setDataForm}
          dataStatus={dataStatus}
          dataTestStatus={dataTestStatus}
          dataCapabilityAudit={dataCapabilityAudit}
          visibleDataKeys={visibleDataKeys}
          setVisibleDataKeys={setVisibleDataKeys}
          saveDataSourceSettings={saveDataSourceSettings}
          testDataProviderConnection={testDataProviderConnection}
        />
        <AutomationSettingsPanel
          schedulerForm={schedulerForm}
          setSchedulerForm={setSchedulerForm}
          schedulerRuns={schedulerRuns}
          ruleEvents={ruleEvents}
          schedulerDecision={schedulerDecision}
          automationStatus={automationStatus}
          saveSchedulerSettings={saveSchedulerSettings}
          loadAutomationStatus={loadAutomationStatus}
          loadSchedulerDecision={loadSchedulerDecision}
          formatSchedulerJobType={formatSchedulerJobType}
          formatSchedulerStatus={formatSchedulerStatus}
          formatDateTime={formatDateTime}
        />
        <TradingCalendarPanel
          calendar={calendar}
          calendarText={calendarText}
          setCalendarText={setCalendarText}
          calendarStatus={calendarStatus}
          calendarEditorOpen={calendarEditorOpen}
          setCalendarEditorOpen={setCalendarEditorOpen}
          loadTradingCalendar={loadTradingCalendar}
          saveTradingCalendar={saveTradingCalendar}
          formatDateTime={formatDateTime}
        />
        <DatabaseSettingsPanel
          stats={databaseStats}
          runtime={databaseRuntime}
          retentionPreview={retentionPreview}
          audit={databaseAudit}
          reconciliation={databaseReconciliation}
          backups={databaseBackups}
          archives={databaseArchives}
          status={databaseStatus}
          backupStatus={databaseBackupStatus}
          archiveStatus={databaseArchiveStatus}
          reportSummaryStatus={reportSummaryStatus}
          reportSummaryMaintenanceStatus={reportSummaryMaintenanceStatus}
          loadDatabaseStats={refreshDatabasePanel}
          loadDatabaseAudit={loadDatabaseAudit}
          backfillReportSummaries={backfillReportSummaries}
          createDatabaseBackup={createDatabaseBackup}
          exportDatabaseArchive={exportDatabaseArchive}
          formatDateTime={formatDateTime}
        />
      </div>
    </section>
  );
}


function toSettingsForm(settings: AppSettings | null): SettingsForm {
  return {
    provider: settings?.provider ?? "deepseek",
    providerName: settings?.providerName ?? "DeepSeek",
    baseUrl: settings?.baseUrl ?? "https://api.deepseek.com",
    model: settings?.model ?? "deepseek-v4-pro",
    apiKey: settings?.apiKey ?? "",
    temperature: String(settings?.temperature ?? 0.2),
    maxTokens: String(settings?.maxTokens ?? 4000),
    timeoutMs: String(settings?.timeoutMs ?? 120000),
    enabled: settings?.enabled ?? true,
    modelAuditEnabled: settings?.modelAuditEnabled ?? false
  };
}

function toSchedulerForm(settings: SchedulerSettings | null): SchedulerForm {
  return {
    enabled: settings?.enabled ?? false,
    intradayScanEnabled: settings?.intradayScanEnabled ?? true,
    intradayIntervalMinutes: String(settings?.intradayIntervalMinutes ?? 10),
    keypointTimes: (settings?.keypointTimes ?? ["08:50", "09:26", "11:35", "14:50", "15:10"]).join("\n"),
    deepResearchTimes: (settings?.deepResearchTimes ?? ["20:30"]).join("\n"),
    llmOnEvent: settings?.llmOnEvent ?? true,
    pushNotification: settings?.pushNotification ?? false,
    auctionWatchlistPushEnabled: settings?.auctionWatchlistPushEnabled ?? false,
    riskWarningPushEnabled: settings?.riskWarningPushEnabled ?? true
  };
}

function formatSchedulerJobType(value: string) {
  const labels: Record<string, string> = {
    scan: "轻量扫描",
    keypoint: "关键节点",
    "deep-research": "夜间研究",
    auto: "自动",
    skip: "跳过"
  };
  return labels[value] ?? value;
}

function formatSchedulerStatus(value: string) {
  const labels: Record<string, string> = {
    running: "运行中",
    success: "成功",
    failed: "失败"
  };
  return labels[value] ?? value;
}

function formatProvider(provider?: AppSettings["provider"]) {
  if (provider === "deepseek") return "DeepSeek";
  if (provider === "openai_compatible") return "OpenAI 兼容接口";
  if (provider === "anthropic_compatible") return "Anthropic 兼容接口";
  return null;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const response = await fetch(url, init);
  const json = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!response.ok || !json?.success) {
    throw new Error(json?.error?.message ?? ("请求失败：" + url));
  }
  return json;
}
