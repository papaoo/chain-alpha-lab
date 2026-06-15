"use client";

import { BrainCircuit, CalendarDays, FileText, Gauge, Globe2, Radar, ShieldCheck } from "lucide-react";
import type { AnalysisReport } from "@/lib/types";
import type { MacroSnapshot, MarketSessionSnapshot, ReportSummary, Tone } from "@/components/StrategyCockpitTypes";
import type { SchedulerSettings } from "@/lib/types";
import { HoverMetric, MetricTile, Panel, SentimentChip, StatusBadge } from "@/components/StrategyCockpitPrimitives";
import { buildMacroItems, buildSentimentItems, dotClass, formatLlmStatus, formatMarketState, formatTime, macroNodeTone, macroPressureScore, marketStateTone, sentimentBoxClass, sessionTone, toneText } from "@/components/StrategyCockpitUtils";

export function MacroRiskPanel({
  report,
  macroSnapshot,
  status,
  error
}: {
  report: AnalysisReport | null;
  macroSnapshot: MacroSnapshot | null;
  status: "loading" | "ready" | "failed";
  error: string;
}) {
  const macroItems = buildMacroItems(macroSnapshot, status);
  const statusLabel = status === "loading" ? "读取中" : status === "failed" ? "快照失败" : `更新 ${formatTime(macroSnapshot?.fetchedAt ?? "")}`;
  const riskFlags = status === "failed"
    ? [error || "宏观快照暂时不可用，外盘、汇率、商品不进入当前展示。"]
    : macroSnapshot?.riskFlags ?? ["宏观快照读取中，外部市场只作为盘前语境，不直接决定买卖。"];
  return (
    <Panel title="宏观风险带" icon={Globe2} action={<span className="text-xs text-slate-500">{statusLabel}</span>}>
      <MacroPressureStrip snapshot={macroSnapshot} status={status} />
      <div className="grid gap-2 sm:grid-cols-2">
        {macroItems.map((item) => <HoverMetric key={item.label} {...item} />)}
      </div>
      <div className="mt-4 grid gap-2">
        {riskFlags.slice(0, 3).map((flag, index) => (
          <p key={`${flag}-${index}`} className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-xs leading-5 text-cyan-100">{flag}</p>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/58 p-3">
        <p className="text-xs font-medium text-slate-200">模型语境</p>
        <p className="mt-2 text-xs leading-5 text-slate-400">{report?.llmResult?.marketStructureInsight?.riskPressure ?? "外盘、汇率与事件日历只进入宏观风险语境；真正的交易结论仍以 A 股真实行情、规则引擎、证据链和风控边界为准。"}</p>
      </div>
    </Panel>
  );
}

export function MacroPressureStrip({ snapshot, status }: { snapshot: MacroSnapshot | null; status: "loading" | "ready" | "failed" }) {
  const assets = snapshot?.assets ?? [];
  const score = status === "ready" ? macroPressureScore(assets) : 0;
  const tone: Tone = status === "failed" ? "warn" : score >= 70 ? "risk" : score >= 45 ? "warn" : score > 0 ? "info" : "muted";
  const label = status === "loading" ? "读取外部风险" : status === "failed" ? "外部快照失败" : score >= 70 ? "外部压力偏高" : score >= 45 ? "外部压力中等" : "外部压力可控";
  const nodes = [
    { key: "nasdaq", label: "科技", asset: assets.find((item) => item.key === "nasdaq") },
    { key: "a50_future", label: "A50期指", asset: assets.find((item) => item.key === "a50_future") ?? assets.find((item) => item.key === "a50_index") },
    { key: "usdcnh", label: "汇率", asset: assets.find((item) => item.key === "usdcnh") },
    { key: "gold", label: "避险", asset: assets.find((item) => item.key === "gold") },
    { key: "oil", label: "资源", asset: assets.find((item) => item.key === "oil") }
  ];

  return (
    <div className={`mb-4 rounded-2xl border p-3 ${sentimentBoxClass(tone)}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs opacity-75">外部环境压力</p>
          <p className="mt-1 text-xl font-semibold">{label}</p>
        </div>
        <div className="min-w-[220px] flex-1 md:max-w-md">
          <div className="h-2 overflow-hidden rounded-full bg-slate-950/50">
            <div className="h-full rounded-full bg-current transition-all" style={{ width: `${Math.max(status === "ready" ? 8 : 0, Math.min(100, score))}%` }} />
          </div>
          <div className="mt-2 grid grid-cols-5 gap-1 text-center text-[11px]">
            {nodes.map((node) => (
              <span key={node.key} className={`rounded-md border border-slate-700/55 px-1 py-1 ${macroNodeTone(node.key, node.asset?.changePct)}`}>
                {node.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MarketStatusPanel({ report }: { report: AnalysisReport | null }) {
  const market = report?.ruleResult.market;
  return (
    <Panel
      title="今日市场状态"
      icon={Gauge}
      action={<span className="text-xs text-slate-500">宽度 / 情绪 / 风控</span>}
      collapsible
      defaultOpen={false}
      summary={
        <div className="grid gap-3 md:grid-cols-5">
          <MetricTile label="大盘状态" value={market ? formatMarketState(market.marketState) : "--"} tone={marketStateTone(market?.marketState)} compact />
          <MetricTile label="交易模式" value={market?.tradeMode ?? "--"} compact />
          <MetricTile label="情绪周期" value={market?.sentimentCycle ?? "--"} compact />
          <MetricTile label="风格偏向" value={market?.styleBias ?? "--"} compact />
          <MetricTile label="数据质量" value={market?.dataQuality ?? "--"} compact />
        </div>
      }
    >
      <div className="grid gap-3 md:grid-cols-5">
        <MetricTile label="大盘状态" value={market ? formatMarketState(market.marketState) : "--"} tone={marketStateTone(market?.marketState)} />
        <MetricTile label="交易模式" value={market?.tradeMode ?? "--"} />
        <MetricTile label="情绪周期" value={market?.sentimentCycle ?? "--"} />
        <MetricTile label="风格偏向" value={market?.styleBias ?? "--"} />
        <MetricTile label="数据质量" value={market?.dataQuality ?? "--"} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {(market?.diagnostics ?? []).slice(0, 3).map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-800 bg-slate-950/58 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-100">{item.label}</p>
              <span className="text-xs text-cyan-200">{item.score}/{item.max}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-cyan-300" style={{ width: `${Math.min(100, (item.score / Math.max(1, item.max)) * 100)}%` }} />
            </div>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400" title={item.note}>{item.note}</p>
          </div>
        ))}
        {!market?.diagnostics?.length ? <p className="text-sm text-slate-400">暂无市场诊断。运行分析后会展示宽度、指数、情绪和风险项。</p> : null}
      </div>
    </Panel>
  );
}

export function SentimentRadarPanel({ report, macroSnapshot }: { report: AnalysisReport | null; macroSnapshot: MacroSnapshot | null }) {
  const items = buildSentimentItems(report, macroSnapshot);
  return (
    <Panel
      title="情绪雷达"
      icon={BrainCircuit}
      action={<span className="text-xs text-slate-500">规则事实 + 模型语境</span>}
      collapsible
      defaultOpen={false}
      summary={
        <div className="grid gap-2 sm:grid-cols-2">
          {items.slice(0, 4).map((item) => (
            <SentimentChip key={item.label} {...item} />
          ))}
        </div>
      }
    >
      <div className="grid gap-2">
        {items.map((item) => (
          <div key={item.label} className={`rounded-xl border p-3 ${sentimentBoxClass(item.tone)}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{item.label}</p>
              <span className="text-xs">{item.status}</span>
            </div>
            <p className="mt-2 text-xs leading-5 opacity-85">{item.reason}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function EventTimelinePanel({
  report,
  session,
  scheduler
}: {
  report: AnalysisReport | null;
  session: MarketSessionSnapshot | null;
  scheduler: SchedulerSettings | null;
}) {
  const keypointTimes = scheduler?.keypointTimes?.length ? scheduler.keypointTimes : ["08:50", "09:26", "11:35", "14:50", "15:10"];
  const deepResearchTimes = scheduler?.deepResearchTimes?.length ? scheduler.deepResearchTimes : ["20:30"];
  const watchTask = report?.llmResult?.intradayWatchlist?.[0]?.triggerCondition ?? "等待报告生成后展示今日主线验证任务。";
  const events = [
    {
      time: session?.weekday ?? "今日",
      title: session?.phaseLabel ?? "交易时段",
      body: session?.subline ?? "等待交易时段识别。",
      tone: sessionTone(session)
    },
    {
      time: keypointTimes.join(" / "),
      title: scheduler?.enabled ? "关键时点自动分析" : "关键时点未启用",
      body: scheduler?.enabled
        ? `系统会在这些时点沉淀过程数据；模型反馈${scheduler.llmOnEvent ? "按配置参与" : "关闭"}，通知${scheduler.pushNotification ? "开启" : "关闭"}。`
        : "自动分析总开关关闭；当前仍可手动运行今日分析，避免闭市或调试阶段消耗 token。",
      tone: scheduler?.enabled ? "up" as Tone : "muted" as Tone
    },
    {
      time: scheduler?.intradayScanEnabled ? `${scheduler.intradayIntervalMinutes} 分钟` : "关闭",
      title: "盘中扫描节奏",
      body: scheduler?.intradayScanEnabled
        ? "用于补充市场宽度、涨跌停池、板块流向和候选池过程快照；不等同于每次都调用大模型。"
        : "盘中扫描关闭，系统不会自动积累盘中过程数据。",
      tone: scheduler?.intradayScanEnabled ? "info" as Tone : "warn" as Tone
    },
    {
      time: deepResearchTimes.join(" / "),
      title: "夜间研究窗口",
      body: "适合做公司认知补全、主线归属复核、规则反馈整理和下个交易日观察清单。",
      tone: "warn" as Tone
    },
    {
      time: "持续",
      title: "主线验证",
      body: watchTask,
      tone: "up" as Tone
    }
  ];
  return (
    <Panel
      title="系统节奏时间线"
      icon={CalendarDays}
      action={<span className="text-xs text-slate-500">{scheduler?.enabled ? "自动任务已启用" : "自动任务关闭"}</span>}
      collapsible
      defaultOpen={false}
      summary={<TimelineSummary session={session} scheduler={scheduler} />}
    >
      <div className="relative pl-4">
        <div className="absolute bottom-3 left-[9px] top-2 w-px bg-gradient-to-b from-cyan-300 via-amber-300 to-rose-300" />
        <div className="grid gap-3">
          {events.map((event) => (
            <div key={event.title} className="relative rounded-xl border border-slate-800 bg-slate-950/58 p-3">
              <span className={`absolute -left-[20px] top-4 h-3 w-3 rounded-full border-2 border-slate-950 ${dotClass(event.tone)}`} />
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-100">{event.title}</p>
                <span className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-400">{event.time}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">{event.body}</p>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

export function TimelineSummary({ session, scheduler }: { session: MarketSessionSnapshot | null; scheduler: SchedulerSettings | null }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <SentimentChip
        label="当前时段"
        status={session?.phaseLabel ?? "识别中"}
        reason={session?.subline ?? ""}
        tone={sessionTone(session)}
      />
      <SentimentChip
        label="自动分析"
        status={scheduler?.enabled ? "开启" : "关闭"}
        reason=""
        tone={scheduler?.enabled ? "up" : "muted"}
      />
      <SentimentChip
        label="盘中扫描"
        status={scheduler?.intradayScanEnabled ? `${scheduler.intradayIntervalMinutes} 分钟` : "关闭"}
        reason=""
        tone={scheduler?.intradayScanEnabled ? "info" : "warn"}
      />
    </div>
  );
}
