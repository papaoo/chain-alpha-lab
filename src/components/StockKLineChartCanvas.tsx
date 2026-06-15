"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart3, Loader2 } from "lucide-react";
import type { KLineData } from "klinecharts";
import type { KLineChartsModule } from "@/components/StockKLineHoverTypes";

let klineChartsModulePromise: Promise<KLineChartsModule> | null = null;

export function ChartState({ loading, error }: { loading: boolean; error: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-[#080f18]/92 px-6 text-center text-xs text-slate-400">
      {loading ? <Loader2 className="animate-spin text-cyan-300" size={22} /> : <BarChart3 className="text-amber-300" size={24} />}
      <p>{loading ? "加载真实K线..." : error || "暂无真实K线数据"}</p>
    </div>
  );
}

export function KLineCanvas({ data }: { data: KLineData[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let disposeChart: ((target: HTMLElement) => void) | null = null;
    setReady(false);

    void loadKLineChartsModule().then(({ dispose, init }) => {
      if (disposed) return;
      disposeChart = dispose;
      const chart = init(container, {
        styles: {
          grid: {
            show: true,
            horizontal: { show: true, color: "rgba(148, 163, 184, 0.12)", size: 1, style: "solid" },
            vertical: { show: true, color: "rgba(148, 163, 184, 0.08)", size: 1, style: "solid" }
          },
          candle: {
            bar: {
              upColor: "#ef4444",
              downColor: "#22c55e",
              noChangeColor: "#94a3b8",
              upBorderColor: "#ef4444",
              downBorderColor: "#22c55e",
              noChangeBorderColor: "#94a3b8",
              upWickColor: "#ef4444",
              downWickColor: "#22c55e",
              noChangeWickColor: "#94a3b8"
            },
            tooltip: {
              showRule: "follow_cross",
              text: { color: "#cbd5e1", size: 11, family: "Arial", weight: "normal" }
            }
          },
          xAxis: {
            axisLine: { show: true, color: "rgba(148, 163, 184, 0.18)", size: 1 },
            tickText: { color: "#64748b", size: 10, family: "Arial", weight: "normal" }
          },
          yAxis: {
            axisLine: { show: true, color: "rgba(148, 163, 184, 0.18)", size: 1 },
            tickText: { color: "#64748b", size: 10, family: "Arial", weight: "normal" }
          }
        }
      } as any);
      chartRef.current = chart;
      chart?.applyNewData(data);
      chart?.createIndicator?.("MA", false, { id: "candle_pane" });
      chart?.createIndicator?.(
        {
          name: "VOL",
          styles: {
            bars: [
              {
                upColor: "#ef4444",
                downColor: "#22c55e",
                noChangeColor: "#94a3b8"
              }
            ]
          }
        } as any,
        false,
        { height: 92 }
      );
      chart?.setOffsetRightDistance?.(8);
      setReady(true);

      resizeObserver = new ResizeObserver(() => {
        chart?.resize?.();
      });
      resizeObserver.observe(container);
    }).catch((error) => {
      if (!disposed) {
        setReady(true);
        console.error("KLineChart 加载失败", error);
      }
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      chartRef.current = null;
      disposeChart?.(container);
    };
  }, [data]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {!ready ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#080f18]/92 text-xs text-slate-400">
          <Loader2 className="animate-spin text-cyan-300" size={22} />
          <p>加载 KLineChart...</p>
        </div>
      ) : null}
    </div>
  );
}

export function loadKLineChartsModule() {
  klineChartsModulePromise ??= import("klinecharts");
  return klineChartsModulePromise;
}
