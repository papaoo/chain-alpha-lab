"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { StockCandidate } from "@/lib/types";
import { formatAction, localizeText } from "@/components/ResearchCandidateCommon";
import { buildTriggerGaps } from "@/components/ResearchCandidateTriggerGap";
import { StockNameHover } from "@/components/ResearchStockHover";

export function CandidateActionExplainCell({ candidate }: { candidate: StockCandidate }) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tone = actionTone(candidate);
  const summary = actionSummary(candidate);

  const cancelHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const show = (target: EventTarget & HTMLElement) => {
    cancelHide();
    const rect = target.getBoundingClientRect();
    const width = 560;
    setPosition({
      left: Math.max(12, Math.min(rect.left - 180, window.innerWidth - width - 16)),
      top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 460))
    });
  };

  const hide = () => {
    cancelHide();
    hideTimer.current = setTimeout(() => setPosition(null), 140);
  };

  return (
    <div className="max-w-[220px]" onMouseEnter={(event) => show(event.currentTarget)} onMouseLeave={hide}>
      <button
        type="button"
        data-candidate-action-explain
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition hover:brightness-110 ${tone.className}`}
        onClick={(event) => event.stopPropagation()}
        onFocus={(event) => show(event.currentTarget)}
        onBlur={hide}
      >
        <span>{tone.label}</span>
        {candidate.opportunityProfile ? <span className="font-mono opacity-80">{candidate.opportunityProfile.score}</span> : null}
      </button>
      <p className="mt-1 line-clamp-2 text-xs leading-4 text-muted" title={summary}>
        {localizeText(summary)}
      </p>
      {position && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed z-50 w-[560px] rounded-xl border border-info/25 bg-[#081019]/96 p-3 text-left shadow-2xl shadow-black/45 backdrop-blur"
              style={{ left: position.left, top: position.top }}
              onClick={(event) => event.stopPropagation()}
              onMouseEnter={cancelHide}
              onMouseLeave={hide}
            >
              <CandidateActionExplainPanel candidate={candidate} />
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export function CandidateActionExplainPanel({ candidate }: { candidate: StockCandidate }) {
  const opportunity = candidate.opportunityProfile;
  const nextPlan = candidate.tradability?.nextSessionPlan;
  const tone = actionTone(candidate);
  const conclusion = actionSummary(candidate);

  return (
    <div className="grid gap-3 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text">动作解释与触发路径</p>
          <p className="mt-1 text-muted">
            <StockNameHover candidate={candidate} className="font-medium text-info underline decoration-info/30 decoration-dotted underline-offset-2" />
            <span className="ml-1 font-mono">{candidate.code}</span>
            <span className="ml-1">/ {candidate.sectorName}</span>
          </p>
        </div>
        <span className={`rounded border px-2 py-1 ${tone.className}`}>{tone.label}</span>
      </div>

      <div className="rounded-lg border border-info/20 bg-info/[0.055] p-3 leading-5 text-muted">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-info">{opportunity?.label ?? "规则动作"}</p>
          <span className="font-mono text-info">{opportunity ? `${opportunity.score}/100` : `${candidate.positionLimitPct}%`}</span>
        </div>
        <p className="mt-1">{localizeText(conclusion)}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ExplainBlock title="当前为什么这样判" items={buildCurrentReasons(candidate)} empty="暂无明确阻断，继续看买点和仓位边界。" tone={candidate.action === "小仓试错" ? "info" : "warn"} />
        <ExplainBlock title="升级为买入需要什么" items={buildActivationPath(candidate)} empty="当前没有升级条件，需等待新一轮规则快照。" />
        <ExplainBlock title="下一步盯盘动作" items={buildNextSteps(candidate)} empty="继续观察主线、资金、买点和数据新鲜度。" />
        <ExplainBlock title="不追与失效条件" items={buildRiskPath(candidate, nextPlan)} empty="跌破MA20、主线退潮或资金连续流出时失效。" tone="warn" />
      </div>
    </div>
  );
}

function actionSummary(candidate: StockCandidate) {
  return (
    candidate.opportunityProfile?.primaryReason ||
    candidate.tradability?.waitFor ||
    candidate.buyPointEvaluation?.triggerCondition ||
    candidate.invalidCondition ||
    "等待主线、买点、资金和风控条件进一步确认。"
  );
}

function buildCurrentReasons(candidate: StockCandidate) {
  const items = [
    ...(candidate.action === "小仓试错" ? ["规则、主线、买点和仓位边界同时满足，仅允许小仓试错。"] : []),
    ...(candidate.opportunityProfile?.blockingReasons ?? []),
    ...buildTriggerGaps(candidate),
    ...(candidate.dataCompleteness.level !== "complete" ? candidate.dataCompleteness.blockingReasons : []),
    candidate.mainlineAttribution?.shouldExclude ? candidate.mainlineAttribution.reason : undefined
  ];
  return unique(items).slice(0, 6);
}

function buildActivationPath(candidate: StockCandidate) {
  const items = [
    ...(candidate.opportunityProfile?.activationConditions ?? []),
    candidate.buyPointEvaluation?.triggerCondition,
    ...(candidate.tradability?.nextSessionPlan?.preconditions ?? []),
    candidate.tradability?.waitFor
  ];
  return unique(items).slice(0, 6);
}

function buildNextSteps(candidate: StockCandidate) {
  const items = [
    ...(candidate.opportunityProfile?.nextSteps ?? []),
    candidate.tradability?.nextSessionPlan?.mode === "次日竞价观察" ? "今日不追板，把它转入次日竞价承接观察。" : undefined,
    candidate.tradability?.nextSessionPlan?.mode === "盘中回踩观察" ? "盘中只看回踩承接，不用追涨价作为计划买点。" : undefined,
    ...(candidate.signalReasons ?? []).filter((item) => !/扣分|风险|压制|缺失|不足/.test(item)).slice(0, 2)
  ];
  return unique(items).slice(0, 5);
}

function buildRiskPath(candidate: StockCandidate, nextPlan?: NonNullable<StockCandidate["tradability"]>["nextSessionPlan"]) {
  const items = [
    ...(nextPlan?.doNotChase ?? []).map((item) => `不追：${item}`),
    ...(nextPlan?.invalidConditions ?? []),
    candidate.buyPointEvaluation?.invalidCondition,
    candidate.invalidCondition,
    ...(candidate.riskFlags ?? []).slice(0, 2)
  ];
  return unique(items).slice(0, 6);
}

function ExplainBlock({
  title,
  items,
  empty,
  tone = "info"
}: {
  title: string;
  items: Array<string | undefined>;
  empty: string;
  tone?: "info" | "warn";
}) {
  const visible = unique(items).slice(0, 5);
  return (
    <div className={`rounded-lg border p-3 ${tone === "warn" ? "border-warn/20 bg-warn/[0.055]" : "border-info/20 bg-info/[0.045]"}`}>
      <p className={`font-medium ${tone === "warn" ? "text-warn" : "text-info"}`}>{title}</p>
      {visible.length ? (
        <ul className="mt-2 space-y-1 leading-5 text-muted">
          {visible.map((item) => <li key={item}>· {localizeText(item)}</li>)}
        </ul>
      ) : (
        <p className="mt-2 leading-5 text-muted">{localizeText(empty)}</p>
      )}
    </div>
  );
}

function actionTone(candidate: StockCandidate) {
  if (candidate.action === "小仓试错") return { label: "可小仓", className: "border-up/40 bg-up/12 text-up" };
  if (candidate.opportunityProfile?.state === "next_day_auction") return { label: "次日预案", className: "border-[#b779ff]/40 bg-[#b779ff]/12 text-[#d6b5ff]" };
  if (candidate.action === "等待回踩") return { label: "等回踩", className: "border-info/40 bg-info/12 text-info" };
  if (candidate.action === "不追") return { label: "不追", className: "border-warn/40 bg-warn/12 text-warn" };
  if (candidate.action === "回避" || candidate.action === "数据不足") return { label: formatAction(candidate.action), className: "border-warn/40 bg-warn/12 text-warn" };
  if (candidate.opportunityProfile?.state === "pending_activation") return { label: "待激活", className: "border-info/40 bg-info/12 text-info" };
  return { label: formatAction(candidate.action), className: "border-line bg-bg/70 text-muted" };
}

function unique(items: Array<string | undefined>) {
  return Array.from(new Set(items.map((item) => item?.trim()).filter((item): item is string => Boolean(item))));
}
