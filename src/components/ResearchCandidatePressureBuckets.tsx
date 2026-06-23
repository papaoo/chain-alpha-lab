"use client";

import type { AnalysisReport, StockCandidate } from "@/lib/types";
import { localizeText } from "@/components/ResearchCandidateCommon";
import { buildCandidatePressureBuckets, type CandidatePressureTone } from "@/lib/strategy/candidatePressureBuckets";

export function CandidatePressureBuckets({ report, candidates }: { report: AnalysisReport; candidates: StockCandidate[] }) {
  const buckets = buildCandidatePressureBuckets(report, candidates);
  return (
    <div className="mt-3 rounded-lg border border-line/70 bg-slate-950/24 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-text">压制来源分布</p>
          <p className="mt-1 text-xs leading-5 text-muted">不改变买入规则，只解释候选股为什么还没进入可执行层。</p>
        </div>
        <span className="rounded-full border border-line bg-panel/60 px-2 py-1 text-[11px] text-muted">用于排查过严 / 数据瓶颈</span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {buckets.map((bucket) => (
          <details key={bucket.key} className={`rounded-lg border p-2 ${toneSoftClass(bucket.tone)}`} open={bucket.tone === "risk"}>
            <summary className="cursor-pointer list-none">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium">{bucket.title}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 opacity-75">{bucket.subtitle}</p>
                </div>
                <span className="shrink-0 text-lg font-semibold">{bucket.value}</span>
              </div>
            </summary>
            <div className="mt-2 grid gap-1">
              {bucket.details.length ? bucket.details.slice(0, 4).map((detail) => (
                <p key={detail} className="rounded border border-current/15 bg-slate-950/18 px-2 py-1 text-[11px] leading-4 opacity-85">
                  {localizeText(detail)}
                </p>
              )) : (
                <p className="text-[11px] leading-4 opacity-70">暂无明显压制，继续观察下一轮数据。</p>
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function toneSoftClass(tone: CandidatePressureTone) {
  if (tone === "open") return "border-emerald-300/25 bg-emerald-300/[0.07] text-emerald-100";
  if (tone === "wait") return "border-cyan-300/25 bg-cyan-300/[0.07] text-cyan-100";
  return "border-amber-300/25 bg-amber-300/[0.08] text-amber-100";
}
