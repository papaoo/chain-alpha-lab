"use client";

import { buildStockDataConsistency, type StockDataConsistencyResult, type StockDataConsistencyTone } from "@/lib/market/stockDataConsistency";
import type { SelectionPick } from "@/lib/selection/types";

export function SelectionDataConsistencyCard({
  pick,
  compact = false
}: {
  pick: SelectionPick;
  compact?: boolean;
}) {
  const snapshot = pick.runtimeSnapshot;
  const consistency = buildStockDataConsistency({
    latestPrice: snapshot?.latestPrice ?? pick.price,
    quoteUpdatedAt: snapshot?.quoteUpdatedAt,
    snapshotFetchedAt: snapshot?.fetchedAt ?? pick.dataFreshness?.refreshedAt,
    latestKlineTradeDate: snapshot?.latestKlineDate,
    expectedKlineTradeDate: snapshot?.expectedKlineDate,
    klineFreshnessStatus: snapshot?.klineFreshnessStatus,
    klineClose: snapshot?.klineClose,
    referencePrice: pick.price,
    referenceLabel: "选股运行价",
    requireBaseline: false
  });

  return (
    <div className={`mt-2 rounded-lg border px-2.5 py-2 text-[11px] leading-4 ${selectionConsistencyClass(consistency.tone)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{consistency.label}</span>
        <span className="opacity-75">{formatSelectionConsistencyTone(consistency.tone)}</span>
      </div>
      {!compact ? <p className="mt-1 opacity-90">{consistency.summary}</p> : null}
      <details className={compact ? "mt-1" : "mt-2"}>
        <summary className="cursor-pointer opacity-85">口径证据</summary>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {consistency.checks.map((check) => (
            <div key={check.key} className={`rounded border px-2 py-1 ${selectionConsistencyMiniClass(check.tone)}`} title={check.detail}>
              <div className="flex items-center justify-between gap-2">
                <span className="opacity-70">{check.label}</span>
                <span className="font-mono opacity-60">{formatSelectionConsistencyTone(check.tone)}</span>
              </div>
              <p className="truncate font-mono">{check.value}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function formatSelectionConsistencyTone(tone: StockDataConsistencyTone) {
  if (tone === "ok") return "正常";
  if (tone === "review") return "复核";
  return "冲突";
}

function selectionConsistencyClass(tone: StockDataConsistencyResult["tone"]) {
  if (tone === "ok") return "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100";
  if (tone === "review") return "border-amber-300/25 bg-amber-300/[0.08] text-amber-100";
  return "border-rose-300/25 bg-rose-300/[0.08] text-rose-100";
}

function selectionConsistencyMiniClass(tone: StockDataConsistencyResult["tone"]) {
  if (tone === "ok") return "border-emerald-300/15 bg-emerald-300/[0.05]";
  if (tone === "review") return "border-amber-300/20 bg-amber-300/[0.07]";
  return "border-rose-300/20 bg-rose-300/[0.07]";
}
