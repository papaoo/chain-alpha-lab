"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { StockCandidate } from "@/lib/types";
import { localizeText } from "@/components/ResearchCandidateCommon";
import { StockNameHover } from "@/components/ResearchStockHover";

export function CandidateBuyPointCell({ candidate }: { candidate: StockCandidate }) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buyPoint = candidate.buyPointEvaluation;
  const label = buyPoint ? `${buyPoint.status} / ${buyPoint.type}` : candidate.buyPointType;
  const reason = candidate.opportunityProfile?.label
    ? `${candidate.opportunityProfile.label}；${candidate.opportunityProfile.primaryReason}`
    : buyPoint?.triggerCondition ?? "等待买点确认";

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
      top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 410))
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
        className={`rounded-full border px-2 py-1 text-xs transition hover:brightness-110 ${buyPointTone(buyPoint?.status)}`}
        onClick={(event) => event.stopPropagation()}
        onFocus={(event) => show(event.currentTarget)}
        onBlur={hide}
      >
        {label}
      </button>
      <p className="mt-1 line-clamp-2 text-xs leading-4 text-muted">{localizeText(reason)}</p>
      {position && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed z-50 w-[520px] rounded-xl border border-info/25 bg-[#081019]/96 p-3 text-left shadow-2xl shadow-black/45 backdrop-blur"
              style={{ left: position.left, top: position.top }}
              onClick={(event) => event.stopPropagation()}
              onMouseEnter={cancelHide}
              onMouseLeave={hide}
            >
              <BuyPointDetail candidate={candidate} />
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function BuyPointDetail({ candidate }: { candidate: StockCandidate }) {
  const buyPoint = candidate.buyPointEvaluation;
  const opportunity = candidate.opportunityProfile;
  return (
    <div className="grid gap-3 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text">买点纪律与机会解释</p>
          <p className="mt-1 text-muted">
            <StockNameHover candidate={candidate} className="font-medium text-info underline decoration-info/30 decoration-dotted underline-offset-2" />
            <span className="ml-1 font-mono">{candidate.code}</span>
            <span className="ml-1">/ {candidate.sectorName}</span>
          </p>
        </div>
        <span className={`rounded border px-2 py-1 ${buyPointTone(buyPoint?.status)}`}>
          {buyPoint ? `${buyPoint.status} ${buyPoint.score}/20` : "未生成"}
        </span>
      </div>

      {opportunity ? (
        <div className="rounded-lg border border-info/20 bg-info/[0.055] p-3 leading-5 text-muted">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-info">{opportunity.label}</p>
            <span className="font-mono text-info">{opportunity.score}/100</span>
          </div>
          <p className="mt-1">{localizeText(opportunity.primaryReason)}</p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <InfoBlock title="已经满足" items={buyPoint?.satisfied ?? []} empty="暂无明确满足项。" />
        <InfoBlock title="阻断/扣分" items={buyPoint?.blockers ?? []} empty="暂无硬阻断。" tone="warn" />
        <InfoBlock title="触发条件" items={[buyPoint?.triggerCondition, ...(opportunity?.activationConditions ?? [])]} empty="等待新一轮快照确认。" />
        <InfoBlock title="失效条件" items={[buyPoint?.invalidCondition, candidate.invalidCondition]} empty="暂无失效条件。" tone="warn" />
      </div>

      {buyPoint?.sessionNote ? (
        <div className="rounded-lg border border-line/70 bg-bg/60 p-3 leading-5 text-muted">
          <p className="font-medium text-text">时段语义</p>
          <p className="mt-1">{localizeText(buyPoint.sessionNote)}</p>
        </div>
      ) : null}
    </div>
  );
}

function InfoBlock({
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
  const visible = Array.from(new Set(items.filter((item): item is string => Boolean(item?.trim())))).slice(0, 5);
  return (
    <div className={`rounded-lg border p-3 ${tone === "warn" ? "border-warn/20 bg-warn/[0.055]" : "border-info/20 bg-info/[0.045]"}`}>
      <p className={`font-medium ${tone === "warn" ? "text-warn" : "text-info"}`}>{title}</p>
      {visible.length ? (
        <ul className="mt-2 space-y-1 leading-5 text-muted">
          {visible.map((item) => <li key={item}>· {localizeText(item)}</li>)}
        </ul>
      ) : (
        <p className="mt-2 leading-5 text-muted">{empty}</p>
      )}
    </div>
  );
}

function buyPointTone(status?: string) {
  if (status === "有效") return "border-up/35 bg-up/10 text-up";
  if (status === "待激活") return "border-info/35 bg-info/10 text-info";
  if (status === "缺证据" || status === "无效") return "border-warn/35 bg-warn/10 text-warn";
  return "border-info/30 bg-info/10 text-info";
}
