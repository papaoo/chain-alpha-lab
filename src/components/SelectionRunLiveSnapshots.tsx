"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { fetchApiJson } from "@/lib/client/api";
import type { StockRealtimeSnapshot } from "@/lib/market/stockSnapshot";
import type { SelectionPick } from "@/lib/selection/types";

export type SelectionLiveSnapshotMap = Record<string, StockRealtimeSnapshot | undefined>;

export interface SelectionRunLiveSnapshotSummary {
  total: number;
  loaded: number;
  complete: number;
  partial: number;
  quoteOnly: number;
  pending: number;
  missing: number;
  warningCount: number;
  loading: boolean;
  error: string;
  latestFetchedAt?: string;
  latestQuoteUpdatedAt?: string;
  maxDelta?: {
    code: string;
    name: string;
    value: number;
  };
}

export function SelectionRunLiveSnapshotSummaryPanel({
  summary,
  onRefresh
}: {
  summary: SelectionRunLiveSnapshotSummary;
  onRefresh: () => void;
}) {
  const coveragePct = summary.total ? Math.round((summary.loaded / summary.total) * 100) : 0;
  const tone =
    summary.error || (!summary.loading && summary.missing > 0)
      ? "border-amber-300/25 bg-amber-300/[0.07]"
      : summary.loaded === summary.total && summary.complete + summary.partial + summary.quoteOnly === summary.total
        ? "border-emerald-300/25 bg-emerald-300/[0.06]"
        : "border-cyan-300/25 bg-cyan-300/[0.06]";

  return (
    <section className={`rounded-lg border p-4 ${tone}`} data-selection-live-snapshot-summary>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs tracking-[0.16em] text-cyan-100">当前快照校验</p>
            {summary.loading ? <RefreshCw size={13} className="animate-spin text-cyan-200" /> : null}
          </div>
          <h2 className="mt-1 text-base font-semibold text-slate-100">运行快照 vs 当前统一行情</h2>
          <p className="mt-2 max-w-4xl text-xs leading-5 text-slate-400">
            策略评分以运行时快照为准；当前统一行情只用于复核价格漂移、确认加入追踪前的盘面状态。
            {summary.loading ? " 当前正在刷新，未返回的股票暂按等待处理，不计为缺失。" : null}
          </p>
          {summary.error ? (
            <p className="mt-2 rounded border border-amber-300/20 bg-amber-300/10 px-2 py-1.5 text-xs leading-5 text-amber-100">
              当前快照刷新失败：{summary.error}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={summary.loading || !summary.total}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <RefreshCw size={14} className={summary.loading ? "animate-spin" : ""} />
          刷新当前快照
        </button>
      </div>

      <div className="mt-4 grid gap-2 text-xs md:grid-cols-3 xl:grid-cols-6">
        <MiniStat label="覆盖" value={`${summary.loaded}/${summary.total} (${coveragePct}%)`} />
        <MiniStat label="完整" value={`${summary.complete}`} />
        <MiniStat label="部分/报价" value={`${summary.partial + summary.quoteOnly}`} />
        <MiniStat label={summary.loading ? "等待返回" : "缺失"} value={`${summary.loading ? summary.pending : summary.missing}`} />
        <MiniStat label="警告" value={`${summary.warningCount}`} />
        <MiniStat
          label="最大漂移"
          value={summary.maxDelta ? `${summary.maxDelta.name} ${formatSignedPct(summary.maxDelta.value)}` : "--"}
        />
      </div>

      <div className="mt-3 grid gap-2 text-[11px] leading-4 text-slate-400 lg:grid-cols-2">
        <p className="rounded border border-slate-800 bg-slate-950/45 px-2 py-1.5">
          快照获取：{formatDateTimeOptional(summary.latestFetchedAt)}
        </p>
        <p className="rounded border border-slate-800 bg-slate-950/45 px-2 py-1.5">
          最新报价时间：{formatDateTimeOptional(summary.latestQuoteUpdatedAt)}
        </p>
      </div>
    </section>
  );
}

export function useSelectionRunLiveSnapshotSummary(
  picks: SelectionPick[],
  snapshots: SelectionLiveSnapshotMap,
  loading: boolean,
  error: string
): SelectionRunLiveSnapshotSummary {
  return useMemo(() => buildSelectionRunLiveSnapshotSummary(picks, snapshots, loading, error), [picks, snapshots, loading, error]);
}

export function buildSelectionRunLiveSnapshotSummary(
  picks: SelectionPick[],
  snapshots: SelectionLiveSnapshotMap,
  loading: boolean,
  error: string
): SelectionRunLiveSnapshotSummary {
  const uniquePicks = Array.from(new Map(picks.map((pick) => [normalizeCode(pick.code), pick])).values());
  let complete = 0;
  let partial = 0;
  let quoteOnly = 0;
  let warningCount = 0;
  let loaded = 0;
  let latestFetchedAt = "";
  let latestQuoteUpdatedAt = "";
  let maxDelta: SelectionRunLiveSnapshotSummary["maxDelta"];

  for (const pick of uniquePicks) {
    const snapshot = snapshots[normalizeCode(pick.code)];
    if (!snapshot) continue;
    loaded += 1;
    if (snapshot.quality === "complete") complete += 1;
    else if (snapshot.quality === "partial") partial += 1;
    else if (snapshot.quality === "quote_only") quoteOnly += 1;
    warningCount += snapshot.warnings.length;
    latestFetchedAt = newestIso(latestFetchedAt, snapshot.fetchedAt);
    latestQuoteUpdatedAt = newestIso(latestQuoteUpdatedAt, snapshot.quoteUpdatedAt ?? snapshot.raw?.quoteUpdatedAt);

    const runPrice = pick.runtimeSnapshot?.latestPrice ?? pick.price;
    if (snapshot.latestPrice !== undefined && runPrice !== undefined && runPrice > 0) {
      const delta = ((snapshot.latestPrice - runPrice) / runPrice) * 100;
      if (!maxDelta || Math.abs(delta) > Math.abs(maxDelta.value)) {
        maxDelta = { code: pick.code, name: pick.name, value: delta };
      }
    }
  }

  const pending = loading ? Math.max(0, uniquePicks.length - loaded) : 0;
  const missing = loading ? 0 : Math.max(0, uniquePicks.length - loaded);
  return {
    total: uniquePicks.length,
    loaded,
    complete,
    partial,
    quoteOnly,
    pending,
    missing,
    warningCount,
    loading,
    error,
    latestFetchedAt: latestFetchedAt || undefined,
    latestQuoteUpdatedAt: latestQuoteUpdatedAt || undefined,
    maxDelta
  };
}

export function useSelectionRunLiveSnapshots(picks: SelectionPick[], enabled: boolean) {
  const codes = useMemo(
    () => Array.from(new Set(picks.map((pick) => normalizeCode(pick.code)).filter(Boolean))).slice(0, 80),
    [picks]
  );
  const [snapshots, setSnapshots] = useState<SelectionLiveSnapshotMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requested, setRequested] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!enabled || !codes.length) {
      setLoading(false);
      setRequested(false);
      return;
    }
    const controller = new AbortController();
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setRequested(true);
    setLoading(true);
    setError("");
    fetchApiJson<Record<string, StockRealtimeSnapshot>>("/api/stock-snapshots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({ codes })
    })
      .then((json) => {
        if (seq !== requestSeq.current) return;
        if (!json.data) {
          throw new Error(json.error?.message ?? "统一股票快照读取失败");
        }
        const next: SelectionLiveSnapshotMap = {};
        for (const [code, snapshot] of Object.entries(json.data)) {
          next[normalizeCode(code)] = snapshot;
        }
        setSnapshots(next);
      })
      .catch((loadError) => {
        if (seq !== requestSeq.current) return;
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, codes.join(","), refreshNonce]);

  const refresh = useCallback(() => {
    if (!enabled || !codes.length) return;
    setRefreshNonce((value) => value + 1);
  }, [enabled, codes.length]);

  const effectiveLoading = loading || (enabled && codes.length > 0 && !requested && !error);

  return { snapshots, loading: effectiveLoading, error, refresh };
}

export function normalizeCode(code: string) {
  const normalized = code.trim().toLowerCase();
  if (/^(sh|sz|bj)\d{6}$/.test(normalized)) return normalized;
  const digits = normalized.match(/\d{6}/)?.[0] ?? normalized;
  if (/^6/.test(digits)) return `sh${digits}`;
  if (/^[489]/.test(digits)) return `bj${digits}`;
  return `sz${digits}`;
}

function newestIso(left?: string, right?: string) {
  if (!right) return left ?? "";
  if (!left) return right;
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  if (!Number.isFinite(leftTime)) return right;
  if (!Number.isFinite(rightTime)) return left;
  return rightTime > leftTime ? right : left;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function formatDateTimeOptional(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatSignedPct(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}
