"use client";

import type { AnalysisReport } from "@/lib/types";
import type { MarketCognitionSnapshot } from "@/components/StrategyCockpitTypes";
import { MiniStat } from "@/components/StrategyCockpitPrimitives";
import { emotionLabel, formatPercent } from "@/components/StrategyCockpitUtils";

export function EmotionCore({ emotion, report }: { emotion: MarketCognitionSnapshot["emotion"] | undefined; report: AnalysisReport | null }) {
  const burst = emotion?.burstRate ?? 0;
  const heat = Math.max(0, Math.min(100, ((emotion?.limitUpCount ?? 0) * 0.55 + (emotion?.earlyLimitCount ?? 0) * 1.2 - (emotion?.limitDownCount ?? 0) * 1.8 - burst * 0.45)));
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/62 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-cyan-200">短线情绪核心</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-50">{emotion ? emotionLabel(heat, burst) : "等待情绪池"}</h3>
        </div>
        <span className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300">{report?.ruleResult.market.sentimentCycle ?? "规则待判"}</span>
      </div>
      <div className="relative mx-auto mt-5 flex aspect-square max-h-[260px] max-w-[260px] items-center justify-center">
        <div className="absolute inset-2 rounded-full border border-cyan-300/15" />
        <div className="absolute inset-8 rounded-full border border-emerald-300/10" />
        <div className="absolute h-[78%] w-[78%] rounded-full" style={{ background: `conic-gradient(rgb(34 211 238) ${heat * 3.6}deg, rgba(30,41,59,0.85) 0deg)` }} />
        <div className="absolute h-[62%] w-[62%] rounded-full bg-slate-950 shadow-[inset_0_0_35px_rgba(14,165,233,0.22)]" />
        <div className="relative text-center">
          <p className="text-4xl font-semibold text-cyan-100">{Math.round(heat)}</p>
          <p className="mt-1 text-xs text-slate-500">情绪热度</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="涨停" value={`${emotion?.limitUpCount ?? "--"}`} tone="up" />
        <MiniStat label="跌停" value={`${emotion?.limitDownCount ?? "--"}`} tone="risk" />
        <MiniStat label="炸板" value={`${emotion?.openBoardCount ?? "--"}`} tone={burst >= 35 ? "risk" : "warn"} />
        <MiniStat label="最高连板" value={`${emotion?.maxConsecutiveLimit ?? "--"}`} tone="info" />
      </div>
    </div>
  );
}
