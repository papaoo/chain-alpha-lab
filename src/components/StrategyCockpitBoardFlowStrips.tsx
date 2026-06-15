"use client";

import type { BoardMomentum } from "@/components/StrategyCockpitTypes";
import { formatMoney, formatSignedPct } from "@/components/StrategyCockpitUtils";

export function BoardFlowStrips({ inflow, change }: { inflow: BoardMomentum[]; change: BoardMomentum[] }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/62 p-4">
      <div>
        <p className="text-xs text-cyan-200">板块流向</p>
        <h3 className="mt-2 text-xl font-semibold text-slate-50">资金流入与涨幅前排</h3>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <BoardRankList title="主力净流入" boards={inflow.slice(0, 8)} value={(item) => formatMoney(item.mainNetInflow)} />
        <BoardRankList title="涨幅强度" boards={change.slice(0, 8)} value={(item) => formatSignedPct(item.changePct)} />
      </div>
    </div>
  );
}

export function BoardRankList({ title, boards, value }: { title: string; boards: BoardMomentum[]; value: (item: BoardMomentum) => string }) {
  const max = Math.max(1, ...boards.map((item) => Math.abs(item.mainNetInflow ?? item.changePct ?? 0)));
  return (
    <div>
      <p className="text-xs text-slate-500">{title}</p>
      <div className="mt-3 space-y-2">
        {boards.map((item) => {
          const raw = Math.abs(item.mainNetInflow ?? item.changePct ?? 0);
          return (
            <div key={`${title}-${item.type}-${item.code}`} className="rounded-xl border border-slate-800 bg-slate-900/50 p-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-slate-200">{item.name}</span>
                <span className={(item.mainNetInflow ?? item.changePct ?? 0) >= 0 ? "text-emerald-200" : "text-rose-200"}>{value(item)}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-cyan-300" style={{ width: `${Math.max(4, (raw / max) * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
