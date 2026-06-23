"use client";

import { ArrowUpRight, Clock3, Crosshair, ShieldAlert, TimerReset } from "lucide-react";
import type { StockCandidate } from "@/lib/types";
import { StockNameHover } from "@/components/ResearchStockHover";
import { localizeText } from "@/components/ResearchCandidateCommon";

type TriggerGroupKey = "executable" | "auction" | "activation" | "watch" | "blocked";

const GROUPS: Array<{
  key: TriggerGroupKey;
  label: string;
  subtitle: string;
  icon: typeof Crosshair;
  className: string;
}> = [
  {
    key: "executable",
    label: "可执行",
    subtitle: "规则、买点、仓位边界基本共振",
    icon: Crosshair,
    className: "border-emerald-300/30 bg-emerald-300/[0.07] text-emerald-100"
  },
  {
    key: "auction",
    label: "次日竞价",
    subtitle: "今天不追，转为隔日承接验证",
    icon: Clock3,
    className: "border-violet-300/30 bg-violet-300/[0.07] text-violet-100"
  },
  {
    key: "activation",
    label: "待激活",
    subtitle: "有雏形，但还差市场/买点/资金确认",
    icon: TimerReset,
    className: "border-cyan-300/30 bg-cyan-300/[0.07] text-cyan-100"
  },
  {
    key: "watch",
    label: "仅观察",
    subtitle: "暂不形成买入动作，等待新证据",
    icon: ArrowUpRight,
    className: "border-slate-600 bg-slate-900/60 text-slate-300"
  },
  {
    key: "blocked",
    label: "风险阻断",
    subtitle: "数据、主线、买点或风控存在硬缺口",
    icon: ShieldAlert,
    className: "border-amber-300/30 bg-amber-300/[0.08] text-amber-100"
  }
];

export function CandidateTriggerMap({ candidates }: { candidates: StockCandidate[] }) {
  const grouped = groupByTriggerPath(candidates);
  const topActions = buildTopActionItems(candidates);
  return (
    <div className="mt-4 rounded-xl border border-line bg-bg/48 p-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-text">触发路径地图</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            把“为什么还不能买”拆成路径：可执行、次日竞价、待激活、仅观察、风险阻断；不改变规则，只把差距显性化。
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px] text-muted">
          {topActions.slice(0, 3).map((item) => (
            <span key={item.text} className="rounded border border-line bg-panel/60 px-2 py-1" title={item.text}>
              {item.count}x {localizeText(item.text)}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-5">
        {GROUPS.map((group) => (
          <TriggerGroupCard
            key={group.key}
            group={group}
            candidates={grouped[group.key]}
            total={candidates.length}
          />
        ))}
      </div>
    </div>
  );
}

function TriggerGroupCard({
  group,
  candidates,
  total
}: {
  group: (typeof GROUPS)[number];
  candidates: StockCandidate[];
  total: number;
}) {
  const pct = total ? Math.round((candidates.length / total) * 100) : 0;
  const Icon = group.icon;
  const sample = candidates.slice(0, 3);
  const actionItems = buildTopActionItems(candidates).slice(0, 2);
  return (
    <details className={`rounded-lg border p-2 ${group.className}`} open={group.key === "executable" || group.key === "auction" || group.key === "activation"}>
      <summary className="cursor-pointer list-none">
        <div className="flex items-start justify-between gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-current/20 bg-slate-950/20">
            <Icon size={15} />
          </span>
          <span className="font-mono text-[11px] opacity-80">{pct}%</span>
        </div>
        <p className="mt-2 text-sm font-semibold">{group.label}</p>
        <p className="mt-1 text-2xl font-semibold">{candidates.length}</p>
        <p className="mt-1 line-clamp-2 text-[11px] leading-4 opacity-80">{group.subtitle}</p>
      </summary>
      <div className="mt-3 grid gap-2">
        {sample.length ? (
          sample.map((candidate) => (
            <div key={candidate.code} className="rounded border border-current/15 bg-slate-950/22 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <StockNameHover candidate={candidate} className="min-w-0 truncate text-xs font-medium" />
                <span className="shrink-0 font-mono text-[10px] opacity-75">{candidate.signalScore ?? candidate.strengthScore ?? "--"}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-4 opacity-85">
                {localizeText(primaryNextStep(candidate))}
              </p>
            </div>
          ))
        ) : (
          <p className="rounded border border-current/15 bg-slate-950/20 px-2 py-2 text-[11px] leading-4 opacity-75">
            暂无股票落在该路径。
          </p>
        )}
        {actionItems.length ? (
          <div className="rounded border border-current/15 bg-slate-950/18 px-2 py-1.5">
            <p className="text-[10px] opacity-70">共性条件</p>
            {actionItems.map((item) => (
              <p key={item.text} className="mt-1 line-clamp-1 text-[11px] leading-4 opacity-85">
                {item.count}x {localizeText(item.text)}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function groupByTriggerPath(candidates: StockCandidate[]) {
  const groups: Record<TriggerGroupKey, StockCandidate[]> = {
    executable: [],
    auction: [],
    activation: [],
    watch: [],
    blocked: []
  };
  for (const candidate of candidates) {
    groups[classifyTriggerPath(candidate)].push(candidate);
  }
  return groups;
}

function classifyTriggerPath(candidate: StockCandidate): TriggerGroupKey {
  const state = candidate.opportunityProfile?.state;
  if (state === "executable" || candidate.action === "小仓试错") return "executable";
  if (state === "next_day_auction" || candidate.tradability?.nextSessionPlan?.mode === "次日竞价观察") return "auction";
  if (state === "pending_activation" || candidate.buyPointEvaluation?.status === "待激活") return "activation";
  if (state === "blocked" || candidate.action === "回避" || candidate.action === "数据不足" || candidate.dataCompleteness.level === "insufficient") return "blocked";
  return "watch";
}

function primaryNextStep(candidate: StockCandidate) {
  return (
    candidate.opportunityProfile?.activationConditions?.[0] ||
    candidate.tradability?.nextSessionPlan?.preconditions?.[0] ||
    candidate.buyPointEvaluation?.triggerCondition ||
    candidate.tradability?.waitFor ||
    candidate.opportunityProfile?.primaryReason ||
    candidate.invalidCondition
  );
}

function buildTopActionItems(candidates: StockCandidate[]) {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    const items = [
      ...candidate.opportunityProfile?.activationConditions ?? [],
      ...candidate.tradability?.nextSessionPlan?.preconditions ?? [],
      candidate.buyPointEvaluation?.triggerCondition,
      candidate.tradability?.waitFor,
      ...candidate.opportunityProfile?.blockingReasons ?? [],
      ...candidate.buyPointEvaluation?.blockers ?? [],
      ...candidate.tradability?.blockers ?? []
    ].filter((item): item is string => Boolean(item?.trim()));
    for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([text, count]) => ({ text, count }))
    .sort((left, right) => right.count - left.count || left.text.localeCompare(right.text));
}
