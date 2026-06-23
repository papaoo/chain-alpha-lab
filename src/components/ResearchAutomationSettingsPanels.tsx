"use client";

import type { Dispatch, SetStateAction } from "react";
import { Activity, CheckCircle2, ChevronDown, Clock3, Database, RefreshCw, Save } from "lucide-react";
import {
  SettingsMiniStat as MiniStat,
  SettingsPanel as Panel,
  SettingsReadOnlyField as Setting,
  SettingsSectionTitle as SectionTitle,
  SettingsTextInput as TextInput
} from "@/components/ResearchSettingsControls";
import type { RuleEventSummary, SchedulerDecisionPreview, SchedulerForm, SchedulerRunSummary, TradingCalendarSettings } from "@/components/ResearchSettingsTypes";

export function AutomationSettingsPanel({
  schedulerForm,
  setSchedulerForm,
  schedulerRuns,
  ruleEvents,
  schedulerDecision,
  automationStatus,
  saveSchedulerSettings,
  loadAutomationStatus,
  loadSchedulerDecision,
  formatSchedulerJobType,
  formatSchedulerStatus,
  formatDateTime
}: {
  schedulerForm: SchedulerForm;
  setSchedulerForm: Dispatch<SetStateAction<SchedulerForm>>;
  schedulerRuns: SchedulerRunSummary[];
  ruleEvents: RuleEventSummary[];
  schedulerDecision: SchedulerDecisionPreview | null;
  automationStatus: string;
  saveSchedulerSettings: () => void;
  loadAutomationStatus: () => void;
  loadSchedulerDecision: () => void;
  formatSchedulerJobType: (value: string) => string;
  formatSchedulerStatus: (value: string) => string;
  formatDateTime: (value: string) => string;
}) {
  return (
    <Panel>
      <SectionTitle icon={Activity} title="自动分析与增量记忆" meta="高频快照，低频模型，事件触发" />
      <div className="mt-5 grid gap-3">
        <div className="rounded-lg border border-info/30 bg-info/10 p-3 text-sm">
          <p className="font-medium text-text">推荐运行方式</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Windows 可双击 <span className="font-mono text-info">start-scheduler.bat</span>；
            Linux 服务器可用 <span className="font-mono text-info">npm run analysis:daemon</span>，
            或由 systemd/cron 定时执行 <span className="font-mono text-info">npm run analysis:scheduled</span>。
          </p>
        </div>
        <div className="grid gap-3 rounded-lg border border-line bg-bg/40 p-3">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              <span className="block font-medium">启用自动分析</span>
              <span className="mt-1 block text-xs text-muted">关闭后 daemon 不会自动触发分析，手动命令仍可运行。</span>
            </span>
            <input
              className="h-4 w-4 accent-info"
              type="checkbox"
              checked={schedulerForm.enabled}
              onChange={(event) => setSchedulerForm((current) => ({ ...current, enabled: event.target.checked }))}
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              <span className="block font-medium">盘中轻量扫描</span>
              <span className="mt-1 block text-xs text-muted">只写快照和规则事件，默认不调用模型。</span>
            </span>
            <input
              className="h-4 w-4 accent-info"
              type="checkbox"
              checked={schedulerForm.intradayScanEnabled}
              onChange={(event) => setSchedulerForm((current) => ({ ...current, intradayScanEnabled: event.target.checked }))}
            />
          </label>
          <TextInput
            label="盘中扫描间隔，分钟"
            value={schedulerForm.intradayIntervalMinutes}
            onChange={(intradayIntervalMinutes) => setSchedulerForm((current) => ({ ...current, intradayIntervalMinutes }))}
          />
          <label className="grid gap-2 text-sm">
            <span className="text-xs text-muted">关键节点时间，每行一个 HH:mm</span>
            <textarea
              className="min-h-24 rounded-lg border border-line bg-bg/60 px-3 py-2 font-mono text-xs outline-none focus:border-info/60"
              value={schedulerForm.keypointTimes}
              onChange={(event) => setSchedulerForm((current) => ({ ...current, keypointTimes: event.target.value }))}
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-xs text-muted">夜间研究时间，每行一个 HH:mm</span>
            <textarea
              className="min-h-16 rounded-lg border border-line bg-bg/60 px-3 py-2 font-mono text-xs outline-none focus:border-info/60"
              value={schedulerForm.deepResearchTimes}
              onChange={(event) => setSchedulerForm((current) => ({ ...current, deepResearchTimes: event.target.value }))}
            />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center justify-between rounded-lg border border-line bg-bg/60 p-3 text-sm">
              <span>事件触发模型</span>
              <input className="h-4 w-4 accent-info" type="checkbox" checked={schedulerForm.llmOnEvent} onChange={(event) => setSchedulerForm((current) => ({ ...current, llmOnEvent: event.target.checked }))} />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-line bg-bg/60 p-3 text-sm">
              <span>关键节点推送</span>
              <input className="h-4 w-4 accent-info" type="checkbox" checked={schedulerForm.pushNotification} onChange={(event) => setSchedulerForm((current) => ({ ...current, pushNotification: event.target.checked }))} />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-line bg-bg/60 p-3 text-sm">
              <span>
                <span className="block">观察池推送</span>
                <span className="mt-1 block text-[11px] text-muted">关键节点后推送次日竞价观察池，不调用模型。</span>
              </span>
              <input
                className="h-4 w-4 accent-info"
                type="checkbox"
                checked={schedulerForm.auctionWatchlistPushEnabled}
                onChange={(event) => setSchedulerForm((current) => ({ ...current, auctionWatchlistPushEnabled: event.target.checked }))}
              />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-line bg-bg/60 p-3 text-sm">
              <span>
                <span className="block">风险预警推送</span>
                <span className="mt-1 block text-[11px] text-muted">关键节点后推送高风险清单，由规则和追踪数据生成，不调用模型。</span>
              </span>
              <input
                className="h-4 w-4 accent-info"
                type="checkbox"
                checked={schedulerForm.riskWarningPushEnabled}
                onChange={(event) => setSchedulerForm((current) => ({ ...current, riskWarningPushEnabled: event.target.checked }))}
              />
            </label>
          </div>
          <button className="flex w-fit items-center gap-2 rounded-lg border border-info/40 bg-info/10 px-4 py-2 text-sm text-info" type="button" onClick={saveSchedulerSettings}>
            <Save size={16} />
            保存自动分析配置
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <MiniStat label="扫描频率" value={`盘中${schedulerForm.intradayIntervalMinutes}分钟`} />
          <MiniStat label="模型策略" value="关键节点/事件触发" />
          <MiniStat label="自动状态" value={schedulerForm.enabled ? "已开启" : "已关闭"} />
        </div>
        <SchedulerDecisionPreviewCard
          preview={schedulerDecision}
          refresh={loadSchedulerDecision}
          formatSchedulerJobType={formatSchedulerJobType}
          formatDateTime={formatDateTime}
        />
        <div className="rounded-lg border border-line bg-bg/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-medium">最近定时运行</p>
            <button className="text-xs text-info" type="button" onClick={loadAutomationStatus}>刷新</button>
          </div>
          <div className="grid gap-2">
            {schedulerRuns.length ? schedulerRuns.map((run) => (
              <div key={run.id} className="rounded-md border border-line bg-panel/50 p-2 text-xs text-muted">
                <div className="flex flex-wrap items-center justify-between gap-2 text-text">
                  <span>{formatSchedulerJobType(run.jobType)} / {formatSchedulerStatus(run.status)}</span>
                  <span>{formatDateTime(run.startedAt)}</span>
                </div>
                <p className="mt-1 leading-5">{run.message}</p>
              </div>
            )) : <p className="text-xs text-muted">暂无定时运行记录。</p>}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-bg/40 p-3">
          <p className="mb-2 text-sm font-medium">最近规则事件</p>
          <div className="grid gap-2">
            {ruleEvents.length ? ruleEvents.map((event) => (
              <div key={event.id} className={`rounded-md border p-2 text-xs ${event.severity === "risk" ? "border-down/30 bg-down/10 text-down" : event.severity === "warning" ? "border-warn/30 bg-warn/10 text-warn" : "border-line bg-panel/50 text-muted"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>{event.subjectName} → {event.toValue}</span>
                  <span>{formatDateTime(event.createdAt)}</span>
                </div>
                <p className="mt-1 leading-5">{event.message}</p>
              </div>
            )) : <p className="text-xs text-muted">暂无状态变化事件。</p>}
          </div>
        </div>
        {automationStatus ? <p className="text-sm text-muted">{automationStatus}</p> : null}
      </div>
    </Panel>
  );
}

function SchedulerDecisionPreviewCard({
  preview,
  refresh,
  formatSchedulerJobType,
  formatDateTime
}: {
  preview: SchedulerDecisionPreview | null;
  refresh: () => void;
  formatSchedulerJobType: (value: string) => string;
  formatDateTime: (value: string) => string;
}) {
  const decision = preview?.decision;
  const enabledItems = decision
    ? [
        { label: "模型调用", active: decision.useLLM, note: decision.useLLM ? "会消耗 token" : "本次不消耗 token" },
        { label: "总推送", active: decision.pushNotification, note: decision.pushNotification ? "会发送关键节点通知" : "不主动推送" },
        { label: "竞价观察池", active: decision.auctionWatchlistPush, note: decision.auctionWatchlistPush ? "关键节点后生成" : "未触发" },
        { label: "风险预警", active: decision.riskWarningPush, note: decision.riskWarningPush ? "规则生成高风险清单" : "未触发" }
      ]
    : [];

  return (
    <div className="rounded-lg border border-line bg-bg/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">当前调度预览</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            只读取配置和交易时段，不会启动分析，也不会调用模型。
          </p>
        </div>
        <button className="flex items-center gap-1 rounded-md border border-line bg-panel/60 px-2 py-1 text-xs text-muted hover:border-info/50 hover:text-info" type="button" onClick={refresh}>
          <RefreshCw size={13} />
          刷新判断
        </button>
      </div>

      {decision ? (
        <div className="mt-3 grid gap-3">
          <div className={`rounded-lg border p-3 ${decision.shouldRun ? "border-info/30 bg-info/10" : "border-line bg-panel/50"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`text-sm font-medium ${decision.shouldRun ? "text-info" : "text-muted"}`}>
                {decision.shouldRun ? "当前时间窗会执行" : "当前时间窗不会执行"}
              </span>
              <span className="rounded-full border border-line bg-bg/70 px-2 py-0.5 text-xs text-muted">
                {formatSchedulerJobType(decision.jobType)}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted">{decision.reason}</p>
          </div>

          <div className="grid gap-2 md:grid-cols-4">
            {enabledItems.map((item) => (
              <div key={item.label} className={`rounded-md border p-2 ${item.active ? "border-info/30 bg-info/10" : "border-line bg-panel/40"}`}>
                <p className={`text-xs font-medium ${item.active ? "text-info" : "text-muted"}`}>{item.label}</p>
                <p className="mt-1 text-[11px] leading-4 text-muted">{item.note}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 text-[11px] text-muted">
            <span>检查时间：{formatDateTime(preview.checkedAt)}</span>
            <span>模式：{formatSchedulerJobType(preview.mode)}</span>
            <span>事件触发模型：{decision.llmOnEvent ? "开启" : "关闭"}</span>
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-warn/30 bg-warn/10 p-3 text-xs leading-5 text-warn">
          暂时无法读取调度判断。请先确认服务已启动，或点击刷新重试。
        </div>
      )}
    </div>
  );
}

export function TradingCalendarPanel({
  calendar,
  calendarText,
  setCalendarText,
  calendarStatus,
  calendarEditorOpen,
  setCalendarEditorOpen,
  loadTradingCalendar,
  saveTradingCalendar,
  formatDateTime
}: {
  calendar: TradingCalendarSettings | null;
  calendarText: string;
  setCalendarText: Dispatch<SetStateAction<string>>;
  calendarStatus: string;
  calendarEditorOpen: boolean;
  setCalendarEditorOpen: Dispatch<SetStateAction<boolean>>;
  loadTradingCalendar: () => void;
  saveTradingCalendar: () => void;
  formatDateTime: (value: string) => string;
}) {
  return (
    <Panel>
      <SectionTitle icon={Clock3} title="A 股交易日历" meta="系统自动判断，手动维护仅用于兜底" />
      <div className="mt-5 grid gap-3">
        <div className="rounded-lg border border-info/30 bg-info/10 p-3 text-sm text-text">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 shrink-0 text-info" size={16} />
            <div>
              <p className="font-medium">无需日常配置</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                系统会按交易时段和内置 A 股休市日历自动判断盘前、盘中、午间、收盘后和非交易日。
                这里只是高级维护入口，用于未来交易所节假日变化或数据源异常时手动修正。
              </p>
            </div>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <MiniStat label="市场" value={calendar?.market ?? "A_SHARE"} />
          <MiniStat label="已维护休市日" value={calendar ? `${calendar.closedDates.length} 个` : "读取中"} />
        </div>
        <Setting label="来源" value={calendar?.source ?? "自动兜底"} />
        <Setting label="更新时间" value={calendar?.updatedAt ? formatDateTime(calendar.updatedAt) : ""} />
        {calendarStatus ? <p className="text-sm text-muted">{calendarStatus}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <button className="flex w-fit items-center gap-2 rounded-lg border border-line bg-bg/60 px-4 py-2 text-sm text-muted" type="button" onClick={() => setCalendarEditorOpen((open) => !open)}>
            <ChevronDown className={`transition ${calendarEditorOpen ? "rotate-180" : ""}`} size={16} />
            {calendarEditorOpen ? "收起高级维护" : "高级维护"}
          </button>
          <button className="flex w-fit items-center gap-2 rounded-lg border border-line bg-bg/60 px-4 py-2 text-sm text-muted" type="button" onClick={loadTradingCalendar}>
            <Database size={16} />
            重新读取
          </button>
        </div>
        {calendarEditorOpen ? (
          <div className="grid gap-3 rounded-lg border border-line bg-bg/40 p-3">
            <Setting label="存储路径" value={calendar?.path ?? ""} />
            <label className="grid gap-2 text-sm">
              <span className="text-xs text-muted">休市日期，每行一个 YYYYMMDD</span>
              <textarea
                className="min-h-40 rounded-lg border border-line bg-bg/60 px-3 py-2 font-mono text-xs outline-none focus:border-info/60"
                value={calendarText}
                onChange={(event) => setCalendarText(event.target.value)}
                placeholder="例如：20260101"
              />
            </label>
            <button className="flex w-fit items-center gap-2 rounded-lg border border-info/40 bg-info/10 px-4 py-2 text-sm text-info disabled:opacity-60" type="button" onClick={saveTradingCalendar} disabled={!calendarText.trim()}>
              <Save size={16} />
              保存交易日历
            </button>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
