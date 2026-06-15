"use client";

import { useMemo } from "react";
import type { MarketBreadthSnapshot } from "@/lib/types";
import { MiniStat } from "@/components/StrategyCockpitPrimitives";
import { buildBreadthDots, formatSignedPct } from "@/components/StrategyCockpitUtils";

export function BreadthConstellation({ breadth }: { breadth: MarketBreadthSnapshot | null | undefined }) {
  const upPct = breadth?.upPct ?? 0;
  const downPct = breadth?.downPct ?? 0;
  const flatPct = Math.max(0, 100 - upPct - downPct);
  const dots = useMemo(() => buildBreadthDots(upPct, downPct, flatPct), [upPct, downPct, flatPct]);
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/62 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-cyan-200">全 A 宽度</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-50">{breadth ? `${upPct.toFixed(1)}% 上涨` : "等待宽度数据"}</h3>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>{breadth ? `${breadth.total} 只` : "--"}</p>
          <p className="mt-1">中位 {formatSignedPct(breadth?.medianChangePct)}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-1.5" style={{ gridTemplateColumns: "repeat(20, minmax(0, 1fr))" }}>
        {dots.map((dot, index) => (
          <span key={`${dot}-${index}`} className={`h-2.5 rounded-full ${dot === "up" ? "bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.55)]" : dot === "down" ? "bg-rose-400 shadow-[0_0_14px_rgba(251,113,133,0.45)]" : "bg-slate-600"}`} />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        <MiniStat label="上涨" value={`${breadth?.up ?? "--"}`} tone="up" />
        <MiniStat label="下跌" value={`${breadth?.down ?? "--"}`} tone="risk" />
        <MiniStat label="平盘" value={`${breadth?.flat ?? "--"}`} tone="muted" />
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className="flex h-full">
          <span className="bg-emerald-300" style={{ width: `${upPct}%` }} />
          <span className="bg-slate-600" style={{ width: `${flatPct}%` }} />
          <span className="bg-rose-400" style={{ width: `${downPct}%` }} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-slate-800 bg-slate-900/58 p-3">
          <p className="text-slate-500">强势家数</p>
          <p className="mt-1 text-lg font-semibold text-emerald-200">{breadth?.gt5Count ?? "--"}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/58 p-3">
          <p className="text-slate-500">大跌家数</p>
          <p className="mt-1 text-lg font-semibold text-rose-200">{breadth?.ltMinus5Count ?? "--"}</p>
        </div>
      </div>
    </div>
  );
}
