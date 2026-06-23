"use client";

import { RefreshCw } from "lucide-react";
import { StockDataHealthBadge } from "@/components/StockDataHealthBadge";
import { formatMoneyDisplay, formatPriceDisplay, formatSignedPctDisplay, MiniStat } from "@/components/ResearchStockHoverFormatters";
import { cleanDisplayList, cleanDisplayText } from "@/lib/display/text";
import type { StockRealtimeSnapshot } from "@/lib/market/stockSnapshot";
import type { SelectionPick } from "@/lib/selection/types";

export type SelectionLiveSnapshotMap = Record<string, StockRealtimeSnapshot | undefined>;

export function SelectionLiveSnapshotPanel({
  pick,
  snapshot,
  loading,
  error,
  compact = false
}: {
  pick: SelectionPick;
  snapshot?: StockRealtimeSnapshot;
  loading?: boolean;
  error?: string;
  compact?: boolean;
}) {
  const runPrice = pick.runtimeSnapshot?.latestPrice ?? pick.price;
  const latestPrice = snapshot?.latestPrice;
  const deltaPct = latestPrice !== undefined && runPrice !== undefined && runPrice > 0
    ? ((latestPrice - runPrice) / runPrice) * 100
    : undefined;
  const currentSource = cleanDisplayText(snapshot?.source) ?? "统一快照尚未加载";
  const actionability = snapshot?.actionability
    ? {
        ...snapshot.actionability,
        label: cleanDisplayText(snapshot.actionability.label) ?? snapshot.actionability.label,
        reason: cleanDisplayText(snapshot.actionability.reason) ?? snapshot.actionability.reason
      }
    : undefined;

  return (
    <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/52 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-200">当前行情快照</span>
          {loading ? <RefreshCw size={12} className="animate-spin text-cyan-200" /> : null}
        </div>
        <span className={`rounded border px-1.5 py-0.5 text-[10px] ${deltaClass(deltaPct)}`}>
          较运行时 {formatSignedPctDisplay(deltaPct) ?? "--"}
        </span>
      </div>
      <div className={`mt-2 grid gap-2 text-xs ${compact ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3"}`}>
        <MiniStat label="最新价" value={formatPriceDisplay(latestPrice)} />
        <MiniStat label="涨跌幅" value={formatSignedPctDisplay(snapshot?.changePct) ?? "--"} />
        <MiniStat label="运行价" value={formatPriceDisplay(runPrice)} />
        {!compact ? <MiniStat label="换手" value={snapshot?.turnoverRate !== undefined ? `${snapshot.turnoverRate.toFixed(2)}%` : "--"} /> : null}
        {!compact ? <MiniStat label="成交额" value={formatMoneyDisplay(snapshot?.amount) ?? "--"} /> : null}
        {!compact ? <MiniStat label="主力净流" value={formatMoneyDisplay(snapshot?.mainNetInflow) ?? "--"} /> : null}
      </div>
      {snapshot ? (
        <>
          <div className="mt-2 grid gap-1 text-[10px] leading-4 text-slate-500">
            <p className="truncate rounded border border-slate-800 bg-slate-950/45 px-1.5 py-1" title={currentSource}>
              来源：{currentSource}
            </p>
            <p className="rounded border border-slate-800 bg-slate-950/45 px-1.5 py-1">
              获取：{formatDateTimeOptional(snapshot.fetchedAt)} / 报价：{formatDateTimeOptional(snapshot.quoteUpdatedAt ?? snapshot.raw?.quoteUpdatedAt)}
            </p>
          </div>
          <StockDataHealthBadge
            className="mt-2"
            compact
            quality={snapshot.quality}
            qualityLabel={cleanDisplayText(snapshot.qualityLabel)}
            actionability={actionability}
            coverage={snapshot.coverage}
            fetchedAt={snapshot.fetchedAt}
            quoteUpdatedAt={snapshot.quoteUpdatedAt ?? snapshot.raw?.quoteUpdatedAt}
            source={currentSource}
            warnings={cleanDisplayList(snapshot.warnings)}
          />
        </>
      ) : (
        <p className="mt-2 rounded border border-amber-300/20 bg-amber-300/10 px-2 py-1.5 text-[11px] leading-4 text-amber-100">
          {cleanDisplayText(error) ?? (loading ? "当前快照正在刷新，稍后会自动展示最新可用数据。" : "当前快照尚未加载。这里的运行价来自选股运行快照，不一定等于当前行情。")}
        </p>
      )}
    </div>
  );
}

function deltaClass(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "border-slate-700 bg-slate-900/60 text-slate-400";
  if (value > 1) return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (value < -1) return "border-rose-300/25 bg-rose-300/10 text-rose-100";
  return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
}

function formatDateTimeOptional(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}
