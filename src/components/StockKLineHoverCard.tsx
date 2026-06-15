"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, CandlestickChart, RefreshCw } from "lucide-react";
import type { ChartKLineData, HoverChartInput } from "@/components/StockKLineHoverTypes";
import { ChartState, KLineCanvas } from "@/components/StockKLineChartCanvas";
import { buildLevels, formatPct, formatPrice, SideMetric } from "@/components/StockKLineHoverMetrics";
import { getCachedKLine, loadCachedKLine } from "@/components/StockKLineData";



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
  const last = data[data.length - 1];
  const levels = useMemo(() => (data.length ? buildLevels(data, stock.ma20DistancePct) : null), [data, stock.ma20DistancePct]);

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
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setData([]);
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
          <p className="mt-0.5 font-mono text-[11px] text-slate-500">{stock.code ?? "代码缺失"} / {source ? `真实K线 · ${source}` : "真实K线"}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/35 bg-cyan-300/12 px-2.5 py-1.5 text-xs text-cyan-100">
            <CandlestickChart size={13} />
            K线
          </span>
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-cyan-300/50 hover:text-cyan-100"
            type="button"
            title="重绘图表"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            <RefreshCw size={14} />
          </button>
        </div>
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
          当前使用标题所示数据源的真实日K线绘制。成交量颜色跟随当日 K 线涨跌，图表仅用于悬浮查看，不直接写入规则事实包。
        </p>
      </div>
    </div>
  );
}

