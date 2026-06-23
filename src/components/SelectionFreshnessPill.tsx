"use client";

import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import type { SelectionRunRecord, SelectionRunSummary } from "@/lib/selection/types";
import { formatTradeDate } from "@/lib/market/freshness";

type SelectionFreshnessRun = Pick<
  SelectionRunRecord | SelectionRunSummary,
  "freshnessStatus" | "sourceReportTradeDate" | "runEffectiveTradeDate" | "sourceReportCreatedAt"
>;

export function SelectionFreshnessPill({ run, compact = false }: { run: SelectionFreshnessRun; compact?: boolean }) {
  const status = run.freshnessStatus ?? "unknown";
  const Icon = status === "current" ? CheckCircle2 : status === "stale" ? AlertTriangle : Clock3;
  const label = status === "current" ? "数据基准匹配" : status === "stale" ? "来源已过期" : "基准待确认";
  const toneClass = status === "current"
    ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
    : status === "stale"
      ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
      : "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] ${toneClass}`}
      title={`来源报告交易日 ${formatTradeDate(run.sourceReportTradeDate)}；本次运行有效交易日 ${formatTradeDate(run.runEffectiveTradeDate)}；来源报告时间 ${formatDateTime(run.sourceReportCreatedAt)}`}
    >
      <Icon size={12} />
      {compact ? label : `${label} ${formatTradeDate(run.sourceReportTradeDate)} -> ${formatTradeDate(run.runEffectiveTradeDate)}`}
    </span>
  );
}

export function SelectionFreshnessNotice({ run }: { run: SelectionFreshnessRun }) {
  if (run.freshnessStatus !== "stale") return null;
  return (
    <div className="mt-3 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-100">
      这次选股使用的来源报告基于 {formatTradeDate(run.sourceReportTradeDate)}，本次运行有效交易日为 {formatTradeDate(run.runEffectiveTradeDate)}。
      短线动作只能作为历史复盘或观察池沉淀，建议先重新运行今日分析。
    </div>
  );
}

function formatDateTime(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}
