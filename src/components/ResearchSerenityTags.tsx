"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Microscope } from "lucide-react";
import { normalizeStockCode } from "@/lib/strategy/candidateUtils";
import { serenityTagEvidenceLabel, serenityTagPriorityLabel, type SerenityResearchTag } from "@/lib/serenity/tagTypes";

type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };

export type SerenityTagMap = Record<string, SerenityResearchTag>;

export function useSerenityTags(codes: string[]) {
  const codeKey = codes.map(normalizeStockCode).filter(Boolean).sort().join(",");
  const normalizedCodes = useMemo(
    () => Array.from(new Set(codeKey.split(",").filter(Boolean))),
    [codeKey]
  );
  const [tags, setTags] = useState<SerenityTagMap>({});

  useEffect(() => {
    if (!normalizedCodes.length) {
      setTags({});
      return;
    }
    const controller = new AbortController();
    fetch(`/api/serenity/tags?codes=${encodeURIComponent(normalizedCodes.join(","))}`, {
      cache: "no-store",
      signal: controller.signal
    })
      .then(async (response) => {
        const json = (await response.json()) as ApiResponse<SerenityTagMap>;
        if (response.ok && json.success && json.data) setTags(json.data);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setTags({});
      });
    return () => controller.abort();
  }, [normalizedCodes]);

  return tags;
}

export function getSerenityTag(tags: SerenityTagMap, code?: string) {
  if (!code) return undefined;
  return tags[normalizeStockCode(code)];
}

export function SerenityTagPill({ tag }: { tag?: SerenityResearchTag }) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const show = (target: EventTarget & HTMLElement) => {
    if (!tag) return;
    cancelHide();
    const rect = target.getBoundingClientRect();
    const width = 420;
    setPosition({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 16)),
      top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 320))
    });
  };
  const hide = () => {
    cancelHide();
    hideTimer.current = setTimeout(() => setPosition(null), 140);
  };

  if (!tag) {
    return <span className="rounded-full border border-line bg-bg/60 px-2 py-1 text-xs text-muted">未进入瓶颈研究</span>;
  }
  return (
    <span className="relative inline-flex" onMouseEnter={(event) => show(event.currentTarget)} onMouseLeave={hide}>
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition hover:brightness-110 ${tagTone(tag)}`}
        title={tag.verdict}
        onClick={(event) => event.stopPropagation()}
        onFocus={(event) => show(event.currentTarget)}
        onBlur={hide}
      >
        <Microscope size={13} />
        {serenityTagPriorityLabel(tag.priority)} / {tag.score.toFixed(0)}
      </button>
      {position && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed z-50 w-[420px] rounded-xl border border-lime-300/25 bg-[#081019]/96 p-3 text-left shadow-2xl shadow-black/45 backdrop-blur"
              style={{ left: position.left, top: position.top }}
              onClick={(event) => event.stopPropagation()}
              onMouseEnter={cancelHide}
              onMouseLeave={hide}
            >
              <SerenityTagPanel tag={tag} compact={false} />
            </div>,
            document.body
          )
        : null}
    </span>
  );
}

export function SerenityTagPanel({ tag, compact = false }: { tag?: SerenityResearchTag; compact?: boolean }) {
  if (!tag) return null;
  return (
    <div className={`rounded-lg border border-lime-300/25 bg-lime-300/[0.065] text-lime-50 ${compact ? "p-2 text-xs" : "p-3 text-sm"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 font-medium">
          <Microscope size={compact ? 13 : 15} />
          瓶颈研究标签
        </span>
        <span className="rounded border border-lime-300/30 px-1.5 py-0.5 text-[10px]">{tag.theme}</span>
        <span className="rounded border border-lime-300/25 px-1.5 py-0.5 text-[10px]">{serenityTagPriorityLabel(tag.priority)}</span>
        <span className="rounded border border-lime-300/25 px-1.5 py-0.5 text-[10px]">{serenityTagEvidenceLabel(tag.evidenceStrength)}</span>
        <span className="font-mono text-[11px] text-lime-200">{tag.score.toFixed(0)}</span>
      </div>
      <p className="mt-2 line-clamp-2 leading-5 text-slate-300">{tag.verdict}</p>
      <p className="mt-2 text-[11px] leading-4 text-lime-100/75">
        这是产业链研究增强标签，用于解释长期瓶颈和证据缺口；是否观察、追踪或买入仍以候选股规则、买点和风控为准。
      </p>
      {tag.researchBoundary ? (
        <div className="mt-2 rounded border border-lime-300/15 bg-slate-950/24 px-2 py-1.5">
          <p className="text-[10px] text-lime-200/75">研究边界：{tag.researchBoundary.label}</p>
          <p className="mt-1 text-[11px] leading-4 text-slate-300">{tag.researchBoundary.text}</p>
        </div>
      ) : null}
      {!compact ? (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <MiniLine label="产业链位置" value={tag.chainPosition} />
            <MiniLine label="卡住环节" value={tag.constrains} />
            <MiniLine label="研究时间" value={formatDateTime(tag.createdAt)} />
            <MiniLine label="证据缺口" value={tag.missingProof.length ? tag.missingProof.slice(0, 3).join("；") : "暂无关键缺口"} />
          </div>
          {tag.evidenceCoverage ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <MiniLine label="证据源" value={`${tag.evidenceCoverage.sourceCount}`} />
              <MiniLine label="强/中证据" value={`${tag.evidenceCoverage.strongCount + tag.evidenceCoverage.mediumCount}`} />
              <MiniLine label="硬证据" value={`${tag.evidenceCoverage.hardEvidenceCount}`} />
              <MiniLine label="证据时间" value={formatDateTime(tag.evidenceCoverage.latestFetchedAt)} />
            </div>
          ) : null}
          {tag.nextResearchChecks?.length ? (
            <details className="mt-3 rounded border border-lime-300/15 bg-slate-950/24 px-2 py-1.5">
              <summary className="cursor-pointer text-xs text-lime-100">下一步核验动作</summary>
              <div className="mt-2 grid gap-1 text-[11px] leading-4 text-slate-300">
                {tag.nextResearchChecks.slice(0, 4).map((item) => <p key={item}>{item}</p>)}
              </div>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function MiniLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-lime-300/15 bg-slate-950/24 px-2 py-1.5">
      <p className="text-[10px] text-lime-200/75">{label}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-4 text-slate-300">{value || "暂无"}</p>
    </div>
  );
}

function tagTone(tag: SerenityResearchTag) {
  if (tag.priority === "top") return "border-lime-300/45 bg-lime-300/12 text-lime-100";
  if (tag.priority === "high") return "border-cyan-300/35 bg-cyan-300/10 text-cyan-100";
  if (tag.priority === "watch") return "border-amber-300/35 bg-amber-300/10 text-amber-100";
  return "border-line bg-bg/60 text-muted";
}

function formatDateTime(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}
