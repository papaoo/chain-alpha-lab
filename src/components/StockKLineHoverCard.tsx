"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, CandlestickChart, RefreshCw } from "lucide-react";
import type { ChartKLineData, HoverChartInput } from "@/components/StockKLineHoverTypes";
import { ChartState, KLineCanvas } from "@/components/StockKLineChartCanvas";
import { buildLevels, formatPct, formatPrice, SideMetric } from "@/components/StockKLineHoverMetrics";
import { getCachedKLine, loadCachedKLine } from "@/components/StockKLineData";
import { buildStockDataConsistency, type StockDataConsistencyResult, type StockDataConsistencyTone } from "@/lib/market/stockDataConsistency";

export function StockKLineHoverCard({
  stock,
  left,
  top,
  width = 520
}: {
  stock: HoverChartInput;
  left: number;
  top: number;
  width?: number;
}) {
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<ChartKLineData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState("");
  const [sourceFetchedAt, setSourceFetchedAt] = useState<string | undefined>();
  const [latestTradeDate, setLatestTradeDate] = useState<string | undefined>();
  const [expectedTradeDate, setExpectedTradeDate] = useState<string | undefined>();
  const [freshnessStatus, setFreshnessStatus] = useState<"current" | "stale" | "unknown" | undefined>();
  const [warnings, setWarnings] = useState<string[]>([]);

  const last = data[data.length - 1];
  const levels = useMemo(() => (data.length ? buildLevels(data, stock.ma20DistancePct) : null), [data, stock.ma20DistancePct]);
  const reportLatest = stock.reportLatest ?? stock.latest;
  const reportChangePct = stock.reportChangePct ?? stock.changePct;
  const consistency = useMemo(
    () => buildStockDataConsistency({
      latestPrice: stock.latest,
      quoteUpdatedAt: stock.quoteUpdatedAt,
      snapshotFetchedAt: stock.snapshotFetchedAt ?? sourceFetchedAt,
      latestKlineTradeDate: latestTradeDate ?? last?.date,
      expectedKlineTradeDate: expectedTradeDate,
      klineFreshnessStatus: freshnessStatus,
      klineClose: last?.close,
      klineChangePct: last?.changePct,
      referencePrice: reportLatest,
      referenceLabel: "报告快照价",
      requireBaseline: false
    }),
    [
      stock.latest,
      stock.quoteUpdatedAt,
      stock.snapshotFetchedAt,
      sourceFetchedAt,
      latestTradeDate,
      last?.date,
      expectedTradeDate,
      freshnessStatus,
      last?.close,
      last?.changePct,
      reportLatest
    ]
  );

  useEffect(() => {
    const code = stock.code?.trim();
    if (!code) {
      setData([]);
      setError("缺少股票代码，无法加载真实K线。");
      return;
    }

    let cancelled = false;
    const cacheKey = code.toLowerCase();
    const cached = reloadKey === 0 ? getCachedKLine(cacheKey) : null;
    if (cached) {
      setData(cached.data);
      setSource(cached.source);
      setSourceFetchedAt(cached.sourceFetchedAt);
      setLatestTradeDate(cached.latestTradeDate);
      setExpectedTradeDate(cached.expectedTradeDate);
      setFreshnessStatus(cached.freshnessStatus);
      setWarnings(cached.warnings ?? []);
      setLoading(false);
      setError("");
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError("");
    loadCachedKLine(code, cacheKey, reloadKey > 0)
      .then((entry) => {
        if (cancelled) return;
        setData(entry.data);
        setSource(entry.source);
        setSourceFetchedAt(entry.sourceFetchedAt);
        setLatestTradeDate(entry.latestTradeDate);
        setExpectedTradeDate(entry.expectedTradeDate);
        setFreshnessStatus(entry.freshnessStatus);
        setWarnings(entry.warnings ?? []);
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setData([]);
        setWarnings([]);
        setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [stock.code, reloadKey]);

  return (
    <div
      className="fixed z-50 overflow-hidden rounded-xl border border-cyan-400/25 bg-[#07111c]/96 text-left shadow-2xl shadow-black/45 backdrop-blur"
      style={{ left, top, width }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-100">{stock.name}</p>
          <p className="mt-0.5 font-mono text-[11px] text-slate-500">
            {stock.code ?? "代码缺失"} / {source ? `真实K线 · ${source}` : "真实K线"}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            K线交易日 {latestTradeDate ?? last?.date ?? "--"} / 预期 {formatCompactTradeDate(expectedTradeDate)} / {freshnessLabel(freshnessStatus)}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/35 bg-cyan-300/12 px-2.5 py-1.5 text-xs text-cyan-100">
            <CandlestickChart size={13} />
            K线
          </span>
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-cyan-300/50 hover:text-cyan-100"
            type="button"
            title="刷新K线"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {warnings.length ? (
        <div className="border-b border-sky-300/20 bg-sky-300/8 px-3 py-1.5 text-[11px] leading-5 text-sky-100">
          数据源降级：{warnings.slice(0, 2).join("；")}
        </div>
      ) : null}

      <HoverDataConsistencyCard
        consistency={consistency}
        reportCreatedAt={stock.reportCreatedAt}
        reportLatest={reportLatest}
        reportChangePct={reportChangePct}
        klineClose={last?.close}
        klineChangePct={last?.changePct}
      />

      <div className="border-b border-slate-800 bg-[#091522] px-3 py-2 text-[11px] text-slate-500">
        <span>行情时间 {formatDateTime(stock.quoteUpdatedAt)}</span>
        <span className="mx-2 text-slate-700">/</span>
        <span>快照抓取 {formatDateTime(stock.snapshotFetchedAt)}</span>
        {sourceFetchedAt ? (
          <>
            <span className="mx-2 text-slate-700">/</span>
            <span>K线源 {formatDateTime(sourceFetchedAt)}</span>
          </>
        ) : null}
      </div>

      <div className="grid grid-cols-[1fr_132px] gap-0">
        <div className="h-[320px] bg-[#080f18]">
          {data.length ? <KLineCanvas key={`${stock.code}-${reloadKey}-${data.length}`} data={data} /> : <ChartState loading={loading} error={error} />}
        </div>
        <div className="border-l border-slate-800 bg-[#091522] p-3">
          <p className="text-xs font-medium text-cyan-100">关键结构</p>
          <div className="mt-3 grid gap-2">
            <SideMetric label="收盘价" value={formatPrice(last?.close)} tone={(last?.changePct ?? 0) >= 0 ? "up" : "down"} />
            <SideMetric label="涨跌幅" value={formatPct(last?.changePct)} tone={(last?.changePct ?? 0) >= 0 ? "up" : "down"} />
            <SideMetric label="压力位" value={formatPrice(levels?.resistance)} tone="warn" />
            <SideMetric label="支撑位" value={formatPrice(levels?.support)} tone="info" />
            <SideMetric label="MA20" value={formatPrice(levels?.ma20)} tone="info" />
            <SideMetric label="信号分" value={stock.score !== undefined && stock.score !== null ? String(stock.score) : "--"} tone="info" />
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 border-t border-slate-800 px-3 py-2 text-[11px] leading-5 text-slate-500">
        <BarChart3 className="mt-0.5 shrink-0 text-slate-600" size={13} />
        <p>
          当前图表使用独立K线接口绘制，只用于悬浮查看。若报告快照与K线不同步，必须以重新运行分析后的统一事实包为准。
        </p>
      </div>
    </div>
  );
}

function HoverDataConsistencyCard({
  consistency,
  reportCreatedAt,
  reportLatest,
  reportChangePct,
  klineClose,
  klineChangePct
}: {
  consistency: StockDataConsistencyResult;
  reportCreatedAt?: string | null;
  reportLatest?: number | null;
  reportChangePct?: number | null;
  klineClose?: number | null;
  klineChangePct?: number | null;
}) {
  const shouldShowDetails = consistency.tone !== "ok" || consistency.checks.some((check) => check.tone !== "ok");
  return (
    <div className={`border-b px-3 py-2 text-[11px] leading-5 ${hoverConsistencyClass(consistency.tone)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{consistency.label}</span>
        <span className="opacity-75">{consistency.tone === "ok" ? "同口径" : consistency.tone === "review" ? "需复核" : "冲突"}</span>
      </div>
      <p className="mt-1 opacity-90">
        {consistency.summary}
        {reportCreatedAt ? ` 报告时间：${formatDateTime(reportCreatedAt)}。` : ""}
      </p>
      <div className="mt-1 grid grid-cols-2 gap-1.5">
        <MiniEvidence label="报告快照" value={`${formatPrice(reportLatest)} / ${formatPct(reportChangePct)}`} />
        <MiniEvidence label="K线收盘" value={`${formatPrice(klineClose)} / ${formatPct(klineChangePct)}`} />
      </div>
      {shouldShowDetails ? (
        <details className="mt-1.5">
          <summary className="cursor-pointer opacity-85">查看口径证据</summary>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {consistency.checks.map((check) => (
              <div key={check.key} className={`rounded border px-2 py-1 ${hoverMiniClass(check.tone)}`} title={check.detail}>
                <div className="flex items-center justify-between gap-2">
                  <span className="opacity-75">{check.label}</span>
                  <span className="font-mono opacity-60">{check.tone === "ok" ? "正常" : check.tone === "review" ? "复核" : "冲突"}</span>
                </div>
                <p className="truncate font-mono">{check.value}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function MiniEvidence({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-700/70 bg-slate-950/35 px-2 py-1">
      <span className="text-slate-500">{label}</span>
      <span className="ml-1 font-mono text-slate-200">{value}</span>
    </div>
  );
}

function hoverConsistencyClass(tone: StockDataConsistencyTone) {
  if (tone === "ok") return "border-emerald-300/20 bg-emerald-300/8 text-emerald-100";
  if (tone === "review") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-rose-300/25 bg-rose-300/10 text-rose-100";
}

function hoverMiniClass(tone: StockDataConsistencyTone) {
  if (tone === "ok") return "border-emerald-300/15 bg-emerald-300/8 text-emerald-100";
  if (tone === "review") return "border-amber-300/20 bg-amber-300/10 text-amber-100";
  return "border-rose-300/20 bg-rose-300/10 text-rose-100";
}

function formatDateTime(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function freshnessLabel(status?: "current" | "stale" | "unknown") {
  if (status === "current") return "数据日期正常";
  if (status === "stale") return "数据可能滞后";
  if (status === "unknown") return "日期待确认";
  return "日期未校验";
}

function formatCompactTradeDate(value?: string) {
  if (!value || !/^\d{8}$/.test(value)) return "--";
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}
