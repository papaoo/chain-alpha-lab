"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw, ShieldAlert } from "lucide-react";
import type { ExternalWidgetDescriptor } from "@/lib/data/contracts";
import { EXTERNAL_MARKET_WIDGETS } from "@/lib/data/contracts";

export function ExternalMarketHeatmap({
  widget = EXTERNAL_MARKET_WIDGETS[0]
}: {
  widget?: ExternalWidgetDescriptor;
}) {
  const [frameKey, setFrameKey] = useState(0);
  const [failed, setFailed] = useState(false);
  const refreshLabel = useMemo(() => `${Math.round(widget.refreshIntervalMs / 1000)} 秒`, [widget.refreshIntervalMs]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setFailed(false);
      setFrameKey((value) => value + 1);
    }, widget.refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, [widget.refreshIntervalMs]);

  const frameScale = 0.62;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/72 shadow-[0_24px_100px_rgba(2,6,23,0.45)]">
      <div className="flex flex-col gap-3 border-b border-slate-800/90 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.85)]" />
            <h2 className="text-sm font-semibold text-slate-100">{widget.title}</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            外部展示组件，每 {refreshLabel} 刷新。只用于市场体感，不参与系统决策。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 transition hover:border-cyan-400/60 hover:text-cyan-200"
            onClick={() => {
              setFailed(false);
              setFrameKey((value) => value + 1);
            }}
          >
            <RefreshCw size={14} />
            刷新
          </button>
          <a
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 transition hover:border-cyan-400/60 hover:text-cyan-200"
            href={widget.fallbackUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={14} />
            原站
          </a>
        </div>
      </div>

      <div className="relative h-[760px] overflow-hidden bg-[#252931] xl:h-[820px]">
        {failed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <ShieldAlert className="text-amber-300" size={34} />
            <div>
              <p className="text-sm font-medium text-slate-100">外部热力图暂不可用</p>
              <p className="mt-2 max-w-md text-xs leading-5 text-slate-400">
                可能是目标站点限制嵌入、网络暂时不可达或原站流量过高。系统分析不会依赖该组件，仍以本地事实包和规则引擎为准。
              </p>
            </div>
          </div>
        ) : (
          <iframe
            key={frameKey}
            className="absolute border-0"
            src={widget.url}
            title={`${widget.title}全貌适配`}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            onError={() => setFailed(true)}
            style={{
              width: `${100 / frameScale}%`,
              height: `${820 / frameScale}px`,
              left: "0",
              top: "0",
              transform: `scale(${frameScale})`,
              transformOrigin: "top left"
            }}
          />
        )}
      </div>
    </section>
  );
}
