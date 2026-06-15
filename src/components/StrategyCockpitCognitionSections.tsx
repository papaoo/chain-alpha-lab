"use client";

import { Activity, ExternalLink, RefreshCw } from "lucide-react";
import type { AnalysisReport } from "@/lib/types";
import type { MarketCognitionSnapshot } from "@/components/StrategyCockpitTypes";
import { toolbarButtonClass } from "@/components/StrategyCockpitPrimitives";
import { formatTime } from "@/components/StrategyCockpitUtils";
import { BoardFlowStrips, BreadthConstellation, EmotionCore, LimitStructure, MarketCognitionStateBanner, MarketCognitionSummary, SectorMoneyMap } from "@/components/StrategyCockpitCognitionWidgets";

export function MarketCognitionCanvas({
  snapshot,
  status,
  refreshing,
  error,
  report,
  onRefresh
}: {
  snapshot: MarketCognitionSnapshot | null;
  status: "loading" | "ready" | "failed";
  refreshing: boolean;
  error: string;
  report: AnalysisReport | null;
  onRefresh: () => void;
}) {
  const breadth = snapshot?.breadth;
  const emotion = snapshot?.emotion;
  const statusLabel = refreshing
    ? "正在刷新，保留上一轮快照"
    : status === "loading"
      ? "读取真实行情中"
      : status === "failed"
        ? "数据源异常"
        : `更新 ${formatTime(snapshot?.fetchedAt ?? "")} / ${snapshot?.elapsedMs ?? 0}ms`;
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/76 shadow-[0_24px_100px_rgba(2,6,23,0.45)]">
      <div className="border-b border-slate-800/90 px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Activity size={17} className="text-cyan-200" />
              <h2 className="text-sm font-semibold text-slate-100">市场认知画布</h2>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-400">基于东方财富公开行情、涨跌停池与板块资金数据自研展示；只呈现真实字段，不使用外部页面拼接。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300">
              {statusLabel}
            </span>
            <button type="button" className={toolbarButtonClass} onClick={onRefresh}>
              <RefreshCw size={14} />
              刷新
            </button>
            <a className={toolbarButtonClass} href="https://dapanyuntu.com/" target="_blank" rel="noreferrer">
              <ExternalLink size={14} />
              大盘云图
            </a>
          </div>
        </div>
      </div>
      <div className="bg-[radial-gradient(circle_at_18%_12%,rgba(34,211,238,0.14),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(16,185,129,0.08),transparent_28%),linear-gradient(180deg,rgba(15,23,42,0.74),rgba(2,6,23,0.94))] p-4">
        {(status !== "ready" && !snapshot) || refreshing ? <MarketCognitionStateBanner status={refreshing ? "refreshing" : status} error={error} onRefresh={onRefresh} /> : null}
        <MarketCognitionSummary snapshot={snapshot} report={report} />
        <div className="grid gap-4 2xl:grid-cols-[1fr_390px]">
          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <BreadthConstellation breadth={breadth} />
            <SectorMoneyMap boards={snapshot?.sectorMoney ?? []} />
          </div>
          <EmotionCore emotion={emotion} report={report} />
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <LimitStructure emotion={emotion} />
          <BoardFlowStrips inflow={snapshot?.topInflowBoards ?? []} change={snapshot?.topChangeBoards ?? []} />
        </div>
        {snapshot?.warnings.length ? (
          <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
            {snapshot.warnings.slice(0, 3).join("；")}
          </div>
        ) : null}
      </div>
    </section>
  );
}

