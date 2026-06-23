"use client";

import { AlertTriangle, CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import type { AnalysisReport } from "@/lib/types";
import type { MarketSessionSnapshot } from "@/components/StrategyCockpitTypes";
import { buildReportFreshness, formatTradeDate, type ReportFreshness } from "@/lib/market/freshness";

export function ReportFreshnessBanner({
  report,
  session,
  compact = false
}: {
  report: Pick<AnalysisReport, "createdAt" | "factPackage"> | null;
  session: MarketSessionSnapshot | null;
  compact?: boolean;
}) {
  const freshness = buildReportFreshness(report, session);
  return <FreshnessBannerView freshness={freshness} compact={compact} />;
}

export function FreshnessBannerView({
  freshness,
  compact = false
}: {
  freshness: ReportFreshness;
  compact?: boolean;
}) {
  const Icon = freshness.status === "current" ? CheckCircle2 : freshness.status === "stale" ? AlertTriangle : Clock3;
  const classes = freshness.status === "current"
    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
    : freshness.status === "stale"
      ? "border-amber-300/30 bg-amber-300/12 text-amber-100"
      : "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";

  return (
    <section className={`rounded-2xl border ${classes} ${compact ? "p-3" : "p-4"} shadow-[0_18px_70px_rgba(2,6,23,0.28)]`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-current/25 bg-slate-950/35">
            <Icon size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={`${compact ? "text-sm" : "text-base"} font-semibold`}>{freshness.title}</h3>
              {freshness.isStale ? (
                <span className="inline-flex items-center gap-1 rounded-lg border border-current/25 bg-slate-950/28 px-2 py-1 text-[11px]">
                  <RefreshCw size={12} />
                  需要重跑
                </span>
              ) : null}
            </div>
            <p className={`mt-1 ${compact ? "text-xs" : "text-sm"} leading-6 opacity-90`}>{freshness.message}</p>
            {!compact ? <p className="mt-1 text-xs opacity-75">{freshness.actionHint}</p> : null}
          </div>
        </div>
        <div className="grid min-w-[250px] grid-cols-2 gap-2 text-xs lg:max-w-[360px]">
          <FreshnessMiniStat label="报告基准" value={formatTradeDate(freshness.reportTradeDate)} />
          <FreshnessMiniStat label="当前基准" value={formatTradeDate(freshness.currentTradeDate)} />
          <FreshnessMiniStat label="报告生成" value={formatDateTime(freshness.reportCreatedAt)} />
          <FreshnessMiniStat label="校验时间" value={formatDateTime(freshness.checkedAt)} />
        </div>
      </div>
    </section>
  );
}

function FreshnessMiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-current/15 bg-slate-950/30 px-3 py-2">
      <p className="opacity-60">{label}</p>
      <p className="mt-1 truncate font-mono text-[11px] opacity-95">{value}</p>
    </div>
  );
}

function formatDateTime(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}
