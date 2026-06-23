"use client";

import { Activity, AlertTriangle, Clock3, Gauge, ListChecks } from "lucide-react";
import type { StockCandidate } from "@/lib/types";
import { localizeText } from "@/components/ResearchCandidateCommon";

type OpportunityState = NonNullable<StockCandidate["opportunityProfile"]>["state"];

const STATE_META: Record<OpportunityState, { label: string; hint: string; className: string }> = {
  executable: {
    label: "可执行试错",
    hint: "规则、主线、买点和仓位边界同时满足",
    className: "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
  },
  pending_activation: {
    label: "待激活",
    hint: "有部分证据，但仍被大盘、时段、买点或活跃度约束",
    className: "border-cyan-300/35 bg-cyan-300/10 text-cyan-100"
  },
  next_day_auction: {
    label: "次日竞价",
    hint: "今日不追，转入次日竞价和开盘承接验证",
    className: "border-violet-300/35 bg-violet-300/10 text-violet-100"
  },
  watch_only: {
    label: "仅观察",
    hint: "当前不是买点，继续跟踪主线、资金和股性",
    className: "border-slate-600 bg-slate-900/70 text-slate-300"
  },
  blocked: {
    label: "风险阻断",
    hint: "存在硬风险、证据不足或主线归属问题",
    className: "border-amber-300/35 bg-amber-300/10 text-amber-100"
  }
};

const ORDER: OpportunityState[] = ["executable", "next_day_auction", "pending_activation", "watch_only", "blocked"];

export function CandidateOpportunitySummary({ candidates }: { candidates: StockCandidate[] }) {
  const groups = groupCandidates(candidates);
  const topBlockers = collectTopBlockers(candidates);
  const activeCount = groups.executable.length + groups.next_day_auction.length + groups.pending_activation.length;

  return (
    <div className="mt-4 grid gap-3 rounded-xl border border-line bg-bg/55 p-3 lg:grid-cols-[1.25fr_0.95fr]">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-info/25 bg-info/10 text-info">
              <Gauge size={16} />
            </span>
            <div>
              <p className="text-sm font-medium text-text">候选买入可达性</p>
              <p className="mt-0.5 text-xs text-muted">把“能不能买、为什么不能买、次日看什么”从表格里提出来。</p>
            </div>
          </div>
          <span className="rounded-full border border-info/25 bg-info/10 px-2 py-1 text-xs text-info">
            {activeCount}/{candidates.length} 只进入行动观察层
          </span>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-5">
          {ORDER.map((state) => (
            <StateCard key={state} state={state} count={groups[state].length} samples={groups[state]} total={candidates.length} />
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-line/70 bg-panel/60 p-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={15} className="text-warn" />
          <p className="text-sm font-medium text-text">主要阻断项</p>
        </div>
        {topBlockers.length ? (
          <div className="mt-2 grid gap-2">
            {topBlockers.map((item) => (
              <div key={item.text} className="rounded-lg border border-warn/15 bg-warn/[0.055] px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="line-clamp-1 text-xs text-warn">{localizeText(item.text)}</p>
                  <span className="shrink-0 rounded border border-warn/25 px-1.5 py-0.5 text-[10px] text-warn">{item.count} 次</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs leading-5 text-muted">暂无集中阻断项，继续看单股买点和主线阶段。</p>
        )}
      </div>
    </div>
  );
}

function StateCard({ state, count, samples, total }: { state: OpportunityState; count: number; samples: StockCandidate[]; total: number }) {
  const meta = STATE_META[state];
  const pct = total ? Math.round((count / total) * 100) : 0;
  const Icon = state === "executable" ? Activity : state === "next_day_auction" ? Clock3 : ListChecks;
  return (
    <div className={`rounded-lg border p-2 ${meta.className}`} title={meta.hint}>
      <div className="flex items-center justify-between gap-2">
        <Icon size={14} />
        <span className="font-mono text-[11px]">{pct}%</span>
      </div>
      <p className="mt-2 text-xs font-medium">{meta.label}</p>
      <p className="mt-1 text-lg font-semibold">{count}</p>
      <p className="mt-1 line-clamp-1 text-[11px] opacity-75">
        {samples.slice(0, 2).map((item) => item.name).join("、") || meta.hint}
      </p>
    </div>
  );
}

function groupCandidates(candidates: StockCandidate[]) {
  const groups: Record<OpportunityState, StockCandidate[]> = {
    executable: [],
    pending_activation: [],
    next_day_auction: [],
    watch_only: [],
    blocked: []
  };
  for (const candidate of candidates) {
    groups[candidate.opportunityProfile?.state ?? "watch_only"].push(candidate);
  }
  return groups;
}

function collectTopBlockers(candidates: StockCandidate[]) {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    const blockers = [
      ...(candidate.opportunityProfile?.blockingReasons ?? []),
      ...(candidate.buyPointEvaluation?.blockers ?? []),
      ...(candidate.tradability?.blockers ?? []),
      ...candidate.riskFlags.slice(0, 2)
    ];
    for (const blocker of blockers) {
      const text = blocker.trim();
      if (!text) continue;
      counts.set(text, (counts.get(text) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([text, count]) => ({ text, count }));
}
