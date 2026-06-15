"use client";

import type { BoardMomentum } from "@/components/StrategyCockpitTypes";
import { MiniTooltipStat } from "@/components/StrategyCockpitPrimitives";
import { clamp, formatMoney, formatPercent, formatSignedPct } from "@/components/StrategyCockpitUtils";

export function SectorMoneyMap({ boards }: { boards: BoardMomentum[] }) {
  const items = boards.slice(0, 24);
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/62 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-cyan-200">板块资金矩阵</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-50">强度 / 宽度 / 资金</h3>
        </div>
        <span className="text-xs text-slate-500">横轴=涨跌幅，纵轴=上涨宽度</span>
      </div>
      <div className="relative mt-5 h-[330px] rounded-2xl border border-slate-800 bg-[linear-gradient(180deg,rgba(15,23,42,0.55),rgba(2,6,23,0.72))]">
        <div className="absolute left-4 right-4 top-1/2 h-px bg-slate-700/60" />
        <div className="absolute bottom-4 top-4 left-1/2 w-px bg-slate-700/60" />
        <span className="absolute left-3 top-2 text-[10px] text-slate-600">宽度强</span>
        <span className="absolute bottom-2 right-3 text-[10px] text-slate-600">涨幅强</span>
        {items.map((board, index) => {
          const x = clamp(50 + (board.changePct ?? 0) * 6.5, 9, 91);
          const y = clamp(92 - (board.breadthPct ?? 50) * 0.84, 9, 88);
          const size = clamp(28 + Math.sqrt(Math.abs(board.mainNetInflow ?? 0)) / 950, 30, 78);
          const positive = (board.mainNetInflow ?? 0) >= 0;
          return (
            <div
              key={`${board.type}-${board.code}`}
              className={`group absolute -translate-x-1/2 -translate-y-1/2 rounded-full border text-[10px] transition duration-300 hover:z-30 hover:scale-125 ${positive ? "border-emerald-300/45 bg-emerald-300/18 text-emerald-50 shadow-[0_0_28px_rgba(16,185,129,0.2)]" : "border-rose-300/40 bg-rose-400/14 text-rose-50 shadow-[0_0_24px_rgba(244,63,94,0.16)]"}`}
              style={{ left: `${x}%`, top: `${y}%`, width: size, height: size }}
            >
              <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full px-1 text-center leading-3">{index < 9 ? board.name.slice(0, 4) : ""}</span>
              <div className="pointer-events-none absolute left-1/2 top-[calc(100%+10px)] z-40 hidden w-64 -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-950/98 p-3 text-left text-xs leading-5 text-slate-300 shadow-[0_20px_60px_rgba(2,6,23,0.75)] backdrop-blur group-hover:block">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-slate-100">{board.name}</span>
                  <span className="shrink-0 rounded-md border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">{board.type === "industry" ? "行业" : "概念"}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <MiniTooltipStat label="涨跌幅" value={formatSignedPct(board.changePct)} tone={(board.changePct ?? 0) >= 0 ? "up" : "risk"} />
                  <MiniTooltipStat label="上涨宽度" value={formatPercent(board.breadthPct)} tone={(board.breadthPct ?? 0) >= 55 ? "up" : (board.breadthPct ?? 0) >= 40 ? "warn" : "risk"} />
                  <MiniTooltipStat label="主力净流入" value={formatMoney(board.mainNetInflow)} tone={positive ? "up" : "risk"} />
                  <MiniTooltipStat label="换手率" value={formatPercent(board.turnoverRate)} tone="info" />
                </div>
                <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5">
                  <p className="text-[11px] text-slate-500">领涨股</p>
                  <p className="mt-0.5 truncate text-slate-200">{board.leadStock ?? "--"} <span className={(board.leadStockChangePct ?? 0) >= 0 ? "text-emerald-200" : "text-rose-200"}>{formatSignedPct(board.leadStockChangePct)}</span></p>
                </div>
              </div>
            </div>
          );
        })}
        {!items.length ? <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">等待板块资金数据</p> : null}
      </div>
    </div>
  );
}
