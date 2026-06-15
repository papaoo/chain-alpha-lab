"use client";

import { ArrowRight, BrainCircuit, Clock3, LineChart, Loader2, ShieldCheck, SunMoon } from "lucide-react";
import type { AnalysisReport } from "@/lib/types";
import type { MarketSessionSnapshot, Tone } from "@/components/StrategyCockpitTypes";
import { InfoRow, MetricTile, StatusBadge } from "@/components/StrategyCockpitPrimitives";
import { formatLlmStatus, formatMarketState, formatTradeDate, marketStateTone, sessionBorder, sessionChipClass, sessionGradient, sessionModeLabel, sessionTone } from "@/components/StrategyCockpitUtils";

export function TopBar({ report, loading, onRun, session }: { report: AnalysisReport | null; loading: boolean; onRun: () => void; session: MarketSessionSnapshot | null }) {
  const runLabel = session?.isTradingDay ? "运行今日分析" : "生成研究复盘";
  return (
    <header className="sticky top-0 z-30 rounded-2xl border border-slate-800/90 bg-slate-950/82 p-4 shadow-[0_24px_100px_rgba(2,6,23,0.38)] backdrop-blur-xl">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs text-slate-400">策略操作系统 / 首页驾驶舱</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-normal">先看宏观，再看大盘，再看主线</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge icon={ShieldCheck} label={report ? formatMarketState(report.ruleResult.market.marketState) : "等待报告"} tone={marketStateTone(report?.ruleResult.market.marketState)} />
          <StatusBadge icon={BrainCircuit} label={report ? formatLlmStatus(report.llmStatus) : "模型待命"} tone={report?.llmStatus === "success" ? "up" : "info"} />
          <button className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/35 bg-emerald-400/12 px-3 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-400/18 disabled:opacity-60" type="button" onClick={onRun} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" size={16} /> : <LineChart size={16} />}
            {runLabel}
          </button>
        </div>
      </div>
    </header>
  );
}

export function SessionAwarenessPanel({ session }: { session: MarketSessionSnapshot | null }) {
  const tone = sessionTone(session);
  const tasks = session?.tasks ?? ["读取交易时段中，请稍候。"];
  const restrictions = session?.restrictions ?? [];
  return (
    <section className={`overflow-hidden rounded-2xl border ${sessionBorder(tone)} bg-slate-950/74 shadow-[0_22px_90px_rgba(2,6,23,0.36)]`}>
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className={`relative p-5 ${sessionGradient(tone)}`}>
          <div className="absolute right-6 top-5 hidden h-24 w-24 rounded-full border border-white/10 bg-white/[0.03] blur-[1px] md:block" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge icon={SunMoon} label={session ? `${session.date} ${session.weekday}` : "读取时段"} tone={tone} />
                <StatusBadge icon={Clock3} label={session?.phaseLabel ?? "时段识别中"} tone={tone} />
                <span className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-300">{session?.isTradingDay ? "A股交易日" : "A股闭市"}</span>
              </div>
              <h3 className="mt-4 text-2xl font-semibold tracking-normal text-slate-50">{session?.headline ?? "正在识别今天的交易节奏"}</h3>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{session?.subline ?? "系统会按交易日、盘前、盘中、午间、尾盘、收盘后和非交易日切换展示重点。"}</p>
            </div>
            <div className="grid min-w-[220px] gap-2 text-xs">
              <InfoRow label="数据基准" value={session?.expectedDataBasis ?? "--"} />
              <InfoRow label="有效交易日" value={formatTradeDate(session?.effectiveTradeDate)} />
              <InfoRow label="实时行情" value={session?.canUseRealtimeQuotes ? "可用" : "不可用"} />
            </div>
          </div>
        </div>
        <div className="border-t border-slate-800 bg-slate-950/82 p-4 xl:border-l xl:border-t-0">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-100">{session?.isTradingDay ? "当前任务" : "闭市研究清单"}</p>
            <span className={`rounded-lg px-2 py-1 text-xs ${sessionChipClass(tone)}`}>{sessionModeLabel(session?.mode)}</span>
          </div>
          <div className="mt-3 grid gap-2">
            {tasks.slice(0, 4).map((task, index) => (
              <p key={`${task}-${index}`} className="rounded-xl border border-slate-800 bg-slate-900/66 px-3 py-2 text-xs leading-5 text-slate-300">{task}</p>
            ))}
          </div>
          {restrictions.length ? <p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">{restrictions.slice(0, 2).join("；")}</p> : null}
        </div>
      </div>
    </section>
  );
}

export function HeroPanel({ report, sectors, candidatesCount, marketTone, session }: { report: AnalysisReport | null; sectors: AnalysisReport["factPackage"]["sectors"]; candidatesCount: number; marketTone: Tone; session: MarketSessionSnapshot | null }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-[linear-gradient(135deg,rgba(14,165,233,0.12),rgba(15,23,42,0.86)_45%,rgba(239,68,68,0.08))] p-5 shadow-[0_24px_100px_rgba(2,6,23,0.42)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs text-cyan-200">最新报告摘要</p>
          <h3 className="mt-3 text-3xl font-semibold leading-tight lg:text-4xl">{report?.summary ?? "等待生成市场报告"}</h3>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">首页只保留宏观风险、市场情绪、资金流向、主线强弱和风险约束。完整证据链、公司认知和规则细节进入主线趋势工作台。</p>
          {!session?.isTradingDay ? <p className="mt-2 text-xs text-amber-200/80">今天为非交易日，下方摘要可能来自上一轮保存报告；是否可交易以顶部交易节奏面板为准。</p> : null}
        </div>
        <a className="inline-flex w-fit items-center gap-2 rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-300/16" href="/mainline">
          进入主线趋势
          <ArrowRight size={16} />
        </a>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="大盘总闸" value={report ? formatMarketState(report.ruleResult.market.marketState) : "待分析"} tone={marketTone} />
        <MetricTile label="总仓上限" value={report ? `${report.ruleResult.market.maxTotalPositionPct}%` : "--"} />
        <MetricTile label="主线数量" value={`${sectors.length} 条`} />
        <MetricTile label="候选股票" value={`${candidatesCount} 只`} />
      </div>
    </section>
  );
}
