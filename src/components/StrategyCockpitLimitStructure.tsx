"use client";

import { BasicStockNameHover } from "@/components/SelectionStockHover";
import type { MarketCognitionSnapshot } from "@/components/StrategyCockpitTypes";

export function LimitStructure({ emotion }: { emotion: MarketCognitionSnapshot["emotion"] | undefined }) {
  const industries = emotion?.limitUpIndustries ?? [];
  const openIndustries = emotion?.openBoardIndustries ?? [];
  const max = Math.max(1, ...industries.map((item) => item.count));
  const openMax = Math.max(1, ...openIndustries.map((item) => item.count));
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/62 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-cyan-200">涨停结构</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-50">封板集中度与炸板压力</h3>
        </div>
        <span className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-xs text-emerald-100">强封 {emotion?.strongSealCount ?? "--"}</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_260px]">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs text-slate-500">涨停行业分布</p>
            {industries.slice(0, 7).map((item) => (
              <div key={item.name} className="grid grid-cols-[86px_1fr_34px] items-center gap-2 text-xs">
                <span className="truncate text-slate-300">{item.name}</span>
                <span className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <span className="block h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300" style={{ width: `${(item.count / max) * 100}%` }} />
                </span>
                <span className="text-right text-cyan-100">{item.count}</span>
              </div>
            ))}
            {!industries.length ? <p className="text-sm text-slate-500">暂无涨停行业分布</p> : null}
          </div>
          <div className="space-y-2">
            <p className="text-xs text-slate-500">炸板行业分布</p>
            {openIndustries.slice(0, 7).map((item) => (
              <div key={`${item.name}-open`} className="grid grid-cols-[86px_1fr_34px] items-center gap-2 text-xs">
                <span className="truncate text-slate-300">{item.name}</span>
                <span className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <span className="block h-full rounded-full bg-gradient-to-r from-amber-300 to-rose-400" style={{ width: `${(item.count / openMax) * 100}%` }} />
                </span>
                <span className="text-right text-amber-100">{item.count}</span>
              </div>
            ))}
            {!openIndustries.length ? <p className="text-sm text-slate-500">暂无炸板行业分布</p> : null}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(emotion?.limitUpSamples ?? []).slice(0, 8).map((stock) => (
            <div key={`${stock.marketCode}-zt`} className="rounded-xl border border-emerald-400/15 bg-emerald-400/8 p-2">
              <p className="truncate text-xs font-medium text-emerald-100">
                <BasicStockNameHover
                  stock={{
                    name: stock.name,
                    code: stock.marketCode ?? stock.code,
                    changePct: stock.changePct,
                    turnoverRate: stock.turnoverRate,
                    amount: stock.amount,
                    note: `${stock.firstLimitTime ?? "--"} / 炸板 ${stock.openBoardCount ?? 0}`
                  }}
                />
              </p>
              <p className="mt-1 text-[11px] text-slate-400">{stock.firstLimitTime ?? "--"} / 炸板 {stock.openBoardCount ?? 0}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
