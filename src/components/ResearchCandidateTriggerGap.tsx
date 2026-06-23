"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { StockCandidate } from "@/lib/types";
import { localizeText } from "@/components/ResearchCandidateCommon";

export function CandidateTriggerGapCell({ candidate }: { candidate: StockCandidate }) {
  const gaps = buildTriggerGaps(candidate);
  const tone = triggerGapTone(candidate, gaps);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const show = (target: EventTarget & HTMLElement) => {
    cancelHide();
    const rect = target.getBoundingClientRect();
    const width = 520;
    setPosition({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 16)),
      top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 380))
    });
  };
  const hide = () => {
    cancelHide();
    hideTimer.current = setTimeout(() => setPosition(null), 140);
  };

  return (
    <div className="max-w-[240px]" onMouseEnter={(event) => show(event.currentTarget)} onMouseLeave={hide}>
      <button
        type="button"
        className={`rounded-full border px-2 py-1 text-xs transition hover:brightness-110 ${tone.className}`}
        onFocus={(event) => show(event.currentTarget)}
        onBlur={hide}
        onClick={(event) => event.stopPropagation()}
      >
        {tone.label}
      </button>
      <div className="mt-1 space-y-0.5">
        {gaps.slice(0, 2).map((gap) => (
          <p key={gap} className="line-clamp-1 text-xs leading-4 text-muted" title={gap}>
            {localizeText(gap)}
          </p>
        ))}
      </div>
      {position && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed z-50 w-[520px] rounded-xl border border-info/25 bg-[#081019]/96 p-3 text-left shadow-2xl shadow-black/45 backdrop-blur"
              style={{ left: position.left, top: position.top }}
              onClick={(event) => event.stopPropagation()}
              onMouseEnter={cancelHide}
              onMouseLeave={hide}
            >
              <CandidateTriggerGapPanel candidate={candidate} compact />
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export function CandidateTriggerGapPanel({ candidate, compact = false }: { candidate: StockCandidate; compact?: boolean }) {
  const gaps = buildTriggerGaps(candidate);
  const tone = triggerGapTone(candidate, gaps);
  const activation = candidate.opportunityProfile?.activationConditions ?? [];
  const nextPlan = candidate.tradability?.nextSessionPlan;
  return (
    <div className={`rounded-lg border border-line bg-bg/60 ${compact ? "p-3" : "p-4"} text-sm`}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">触发差距与下一步</p>
        <span className={`rounded-full border px-2 py-1 text-xs ${tone.className}`}>{tone.label}</span>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <ReasonBlock title="当前卡点" items={gaps} empty="暂无硬阻断，继续看买点和仓位规则。" tone="warn" />
        <ReasonBlock title="激活条件" items={activation} empty={candidate.buyPointEvaluation?.triggerCondition ?? candidate.tradability?.waitFor ?? "等待新一轮快照确认。"} />
      </div>
      {nextPlan && nextPlan.mode !== "无" ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <ReasonBlock title={nextPlan.mode} items={nextPlan.preconditions} empty="暂无次日预案前提。" />
          <ReasonBlock title="不追条件" items={nextPlan.doNotChase} empty="暂无不追条件。" tone="warn" />
          <ReasonBlock title="失效条件" items={nextPlan.invalidConditions} empty="暂无失效条件。" tone="warn" />
        </div>
      ) : null}
    </div>
  );
}

function ReasonBlock({ title, items, empty, tone = "info" }: { title: string; items: string[]; empty: string; tone?: "info" | "warn" }) {
  const visible = items.filter(Boolean).slice(0, 5);
  return (
    <div className={`rounded-lg border p-3 ${tone === "warn" ? "border-warn/20 bg-warn/[0.055]" : "border-info/20 bg-info/[0.045]"}`}>
      <p className={`text-xs font-medium ${tone === "warn" ? "text-warn" : "text-info"}`}>{title}</p>
      {visible.length ? (
        <ul className="mt-2 space-y-1 text-xs leading-5 text-muted">
          {visible.map((item) => <li key={item}>· {localizeText(item)}</li>)}
        </ul>
      ) : (
        <p className="mt-2 text-xs leading-5 text-muted">{localizeText(empty)}</p>
      )}
    </div>
  );
}

export function buildTriggerGaps(candidate: StockCandidate) {
  const gaps = [
    ...(candidate.dataCompleteness.level === "insufficient" ? candidate.dataCompleteness.missingFields.map((item) => `数据缺口：${item}`) : []),
    ...(candidate.tradability?.blockers ?? []),
    ...(candidate.buyPointEvaluation?.blockers ?? []),
    ...(candidate.opportunityProfile?.blockingReasons ?? []),
    ...(candidate.mainlineAttribution?.shouldExclude ? [candidate.mainlineAttribution.reason] : []),
    ...(candidate.signalReasons?.filter((item) => /压制|扣分|防守|缺失|风险|无效|不可达|不足/.test(item)) ?? []),
    candidate.action === "观察" ? candidate.tradability?.waitFor : undefined,
    candidate.action === "等待回踩" ? candidate.buyPointEvaluation?.triggerCondition : undefined,
    candidate.action === "不追" ? candidate.tradability?.waitFor : undefined,
    candidate.action === "回避" ? candidate.invalidCondition : undefined
  ].filter((item): item is string => Boolean(item?.trim()));
  return unique(gaps).slice(0, 8);
}

function triggerGapTone(candidate: StockCandidate, gaps: string[]) {
  if (candidate.action === "小仓试错") return { label: "可执行", className: "border-up/35 bg-up/10 text-up" };
  if (candidate.action === "等待回踩") return { label: "等买点", className: "border-info/35 bg-info/10 text-info" };
  if (candidate.tradability?.nextSessionPlan?.mode === "次日竞价观察") return { label: "次日预案", className: "border-[#b779ff]/40 bg-[#b779ff]/12 text-[#d6b5ff]" };
  if (candidate.action === "不追") return { label: "不可追", className: "border-warn/35 bg-warn/10 text-warn" };
  if (candidate.action === "回避" || candidate.action === "数据不足") return { label: candidate.action, className: "border-warn/35 bg-warn/10 text-warn" };
  if (gaps.some((item) => /大盘防守|待激活|主线/.test(item))) return { label: "待激活", className: "border-info/35 bg-info/10 text-info" };
  return { label: "观察", className: "border-line bg-bg/70 text-muted" };
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
