"use client";

import { AlertTriangle, CheckCircle2, ClipboardCheck, ShieldQuestion } from "lucide-react";
import { cleanDisplayList, cleanDisplayText } from "@/lib/display/text";
import { buildSerenityEvidenceNeeds } from "@/lib/serenity/evidenceNeeds";
import type { SerenityCandidateScore, SerenityEvidenceCoverage, SerenityEvidenceNeed, SerenityPreviewCandidate, SerenityResearchBoundaryLevel } from "@/lib/serenity/types";

type SerenityEvidenceBoundaryInput = Pick<
  SerenityPreviewCandidate | SerenityCandidateScore,
  "evidenceStrength" | "missingProof" | "evidenceCoverage" | "evidenceNeeds" | "researchBoundary" | "nextResearchChecks" | "evidence"
>;

export function SerenityEvidenceBoundary({
  item,
  compact = false
}: {
  item: SerenityEvidenceBoundaryInput;
  compact?: boolean;
}) {
  const coverage = item.evidenceCoverage ?? buildCoverageFromEvidence(item.evidence);
  const boundary = normalizeBoundary(item.researchBoundary ?? fallbackBoundary(item, coverage));
  const Icon = boundaryIcon(boundary.level);
  const tone = boundaryTone(boundary.level);
  const checks = cleanDisplayList(item.nextResearchChecks?.length ? item.nextResearchChecks : item.missingProof.map((proof) => `Verify: ${proof}`));
  const needs = item.evidenceNeeds?.length
    ? item.evidenceNeeds
    : buildSerenityEvidenceNeeds({
        missingProof: item.missingProof ?? [],
        evidence: item.evidence ?? [],
        evidenceCoverage: coverage
      });

  return (
    <div className={`rounded-xl border p-3 ${tone.shell}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-2">
          <Icon className={tone.icon} size={17} />
          <div>
            <p className={`text-sm font-medium ${tone.title}`}>{boundary.label}</p>
            <p className="mt-1 text-xs leading-5 text-slate-300">{boundary.text}</p>
          </div>
        </div>
        {coverage ? (
          <div className="flex flex-wrap gap-1.5 md:justify-end">
            <Pill label="硬证据" value={coverage.hardEvidenceCount} tone="emerald" />
            <Pill label="已验证" value={coverage.verifiedHardEvidenceCount} tone="emerald" />
            <Pill label="强/中" value={coverage.strongCount + coverage.mediumCount} tone="cyan" />
            <Pill label="弱/待核" value={coverage.weakCount + coverage.needsCheckingCount} tone="amber" />
            <span
              className={`rounded-md border bg-slate-950/35 px-2 py-1 text-[11px] ${freshnessTone(coverage.freshnessLevel)}`}
              title="证据链可信度，不等于买入概率；行情和资金只作为弱证据。"
            >
              {freshnessLabel(coverage.freshnessLevel)} 可信度 {coverage.confidencePct}%
            </span>
          </div>
        ) : null}
      </div>

      {!compact && coverage?.sourceLabels.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {cleanDisplayList(coverage.sourceLabels).map((source) => (
            <span key={source} className="rounded-md border border-slate-700 bg-slate-950/35 px-2 py-1 text-[11px] text-slate-400">
              {source}
            </span>
          ))}
        </div>
      ) : null}

      {checks.length ? (
        <details className="mt-3 rounded-lg border border-slate-800 bg-slate-950/35 p-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-200">下一步核验证据</summary>
          <div className="mt-2 grid gap-1.5 text-xs leading-5 text-slate-300">
            {checks.slice(0, compact ? 3 : 5).map((check) => (
              <p key={check}>- {check}</p>
            ))}
          </div>
        </details>
      ) : null}

      {!compact && needs.length ? (
        <details className="mt-3 rounded-lg border border-slate-800 bg-slate-950/35 p-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-200">证据缺口路径</summary>
          <div className="mt-2 grid gap-2">
            {needs.slice(0, 4).map((need) => (
              <EvidenceNeedRow key={need.key} need={need} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function EvidenceNeedRow({ need }: { need: SerenityEvidenceNeed }) {
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs leading-5 ${needTone(need.priority)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{cleanDisplayText(need.label) ?? need.label}</span>
        <span className="rounded border border-current/20 px-1.5 py-0.5 text-[10px]">{need.canAutomate ? "可部分自动补" : "需人工/Agent 深查"}</span>
      </div>
      <p className="mt-1 opacity-90">{cleanDisplayText(need.reason) ?? need.reason}</p>
      <p className="mt-1 opacity-70">来源路径：{cleanDisplayList(need.sourcePaths).slice(0, 3).join(" / ")}</p>
    </div>
  );
}

function fallbackBoundary(item: SerenityEvidenceBoundaryInput, coverage?: SerenityEvidenceCoverage) {
  const hasVerifiedHardEvidence = (coverage?.verifiedHardEvidenceCount ?? 0) > 0;

  if (!hasVerifiedHardEvidence && coverage) {
    return {
      level: "needs_hard_evidence" as const,
      label: "先补硬证据",
      text: "当前证据链还没有已验证硬证据，行情、板块归属和资金只能作为线索，不能证明公司控制瓶颈。"
    };
  }
  if (item.evidenceStrength === "strong") {
    return {
      level: "evidence_backed" as const,
      label: "证据支撑较强",
      text: "已有较强证据支撑瓶颈位置，但仍需要继续跟踪估值、催化和反证条件。"
    };
  }
  if (item.evidenceStrength === "medium") {
    return {
      level: "candidate_watch" as const,
      label: "研究候选",
      text: "证据足以进入研究队列，但还不足以转成交易结论。"
    };
  }
  if (item.evidenceStrength === "weak") {
    return {
      level: "needs_hard_evidence" as const,
      label: "先补硬证据",
      text: "当前主要依赖弱证据，先核验公告、主营构成、客户、产能或认证，再决定是否提高排序。"
    };
  }
  return {
    level: "research_only" as const,
      label: "仅作线索",
    text: "在公开证据确认产业链位置和稀缺约束前，只能作为下一步研究线索。"
  };
}

function buildCoverageFromEvidence(evidence?: SerenityEvidenceBoundaryInput["evidence"]): SerenityEvidenceCoverage | undefined {
  if (!evidence?.length) return undefined;
  const fetchedTimes = evidence
    .map((item) => item.fetchedAt)
    .filter((item): item is string => Boolean(item))
    .filter((item) => Number.isFinite(Date.parse(item)))
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  const freshness = evidence.map(classifyEvidenceFreshness);
  const freshEvidenceCount = freshness.filter((item) => item === "fresh").length;
  const agingEvidenceCount = freshness.filter((item) => item === "aging").length;
  const staleEvidenceCount = freshness.filter((item) => item === "stale").length;
  const undatedEvidenceCount = freshness.filter((item) => item === "unknown").length;
  const hardEvidence = evidence.filter((item) => isHardEvidence(item.sourceType));
  const verifiedHardEvidenceCount = hardEvidence.filter((item) => item.strength === "strong" || item.strength === "medium").length;
  const constraintHardEvidenceCount = evidence.filter((item) => isConstraintHardEvidence(item.sourceType)).length;
  const datedCount = freshEvidenceCount + agingEvidenceCount + staleEvidenceCount;

  return {
    sourceCount: evidence.length,
    strongCount: evidence.filter((item) => item.strength === "strong").length,
    mediumCount: evidence.filter((item) => item.strength === "medium").length,
    weakCount: evidence.filter((item) => item.strength === "weak").length,
    needsCheckingCount: evidence.filter((item) => item.strength === "needs_checking").length,
    hardEvidenceCount: hardEvidence.length,
    verifiedHardEvidenceCount,
    freshEvidenceCount,
    agingEvidenceCount,
    staleEvidenceCount,
    undatedEvidenceCount,
    freshnessLevel: inferFreshnessLevel(evidence.length, datedCount, freshEvidenceCount, agingEvidenceCount, staleEvidenceCount),
    confidencePct: calculateEvidenceConfidence({
      evidenceCount: evidence.length,
      hardEvidenceCount: hardEvidence.length,
      verifiedHardEvidenceCount,
      constraintHardEvidenceCount,
      freshEvidenceCount,
      agingEvidenceCount,
      staleEvidenceCount,
      undatedEvidenceCount
    }),
    sourceLabels: Array.from(new Set(evidence.map((item) => cleanDisplayText(item.sourceLabel) ?? item.sourceLabel).filter(Boolean))).slice(0, 6),
    latestFetchedAt: fetchedTimes[0]
  };
}

function isHardEvidence(sourceType: string) {
  return /(company_profile|filing|announcement|financial_indicator|financial_report|customer|capacity|project|patent|standard)/i.test(sourceType);
}

function isConstraintHardEvidence(sourceType: string) {
  return /(filing|announcement|customer|capacity|project|patent|standard)/i.test(sourceType);
}

function classifyEvidenceFreshness(item: NonNullable<SerenityEvidenceBoundaryInput["evidence"]>[number]) {
  if (!item.fetchedAt) return "unknown" as const;
  const time = Date.parse(item.fetchedAt);
  if (!Number.isFinite(time)) return "unknown" as const;
  const ageDays = (Date.now() - time) / 86_400_000;
  if (ageDays <= 7) return "fresh" as const;
  if (ageDays <= 45) return "aging" as const;
  return "stale" as const;
}

function inferFreshnessLevel(
  sourceCount: number,
  datedCount: number,
  freshEvidenceCount: number,
  agingEvidenceCount: number,
  staleEvidenceCount: number
): SerenityEvidenceCoverage["freshnessLevel"] {
  if (!sourceCount || !datedCount) return "unknown";
  if (freshEvidenceCount >= Math.ceil(sourceCount * 0.45)) return "fresh";
  if (freshEvidenceCount + agingEvidenceCount >= Math.ceil(sourceCount * 0.5)) return "aging";
  if (staleEvidenceCount >= Math.ceil(sourceCount * 0.5)) return "stale";
  return "unknown";
}

function calculateEvidenceConfidence(input: {
  evidenceCount: number;
  hardEvidenceCount: number;
  verifiedHardEvidenceCount: number;
  constraintHardEvidenceCount: number;
  freshEvidenceCount: number;
  agingEvidenceCount: number;
  staleEvidenceCount: number;
  undatedEvidenceCount: number;
}) {
  if (!input.evidenceCount) return 0;
  const sourceCoverage = Math.min(30, input.evidenceCount * 5 + input.hardEvidenceCount * 5);
  const verifiedHardScore = Math.min(45, input.verifiedHardEvidenceCount * 34);
  const freshnessScore = Math.min(
    25,
    input.freshEvidenceCount * 6 + input.agingEvidenceCount * 3 + input.staleEvidenceCount * 0.5 - input.undatedEvidenceCount * 1.5
  );
  const raw = Math.max(0, Math.min(100, Math.round(sourceCoverage + verifiedHardScore + freshnessScore)));

  if (!input.verifiedHardEvidenceCount) return Math.min(raw, input.hardEvidenceCount ? 42 : 30);
  if (!input.constraintHardEvidenceCount) return Math.min(raw, 78);
  if (input.verifiedHardEvidenceCount === 1 && input.hardEvidenceCount === 1) return Math.min(raw, 78);
  return raw;
}

function normalizeBoundary(boundary: { level: SerenityResearchBoundaryLevel; label: string; text: string }) {
  return {
    level: boundary.level,
    label: cleanDisplayText(boundary.label) ?? boundary.label,
    text: cleanDisplayText(boundary.text) ?? boundary.text
  };
}

function boundaryIcon(level: SerenityResearchBoundaryLevel) {
  if (level === "evidence_backed") return CheckCircle2;
  if (level === "candidate_watch") return ClipboardCheck;
  if (level === "needs_hard_evidence") return AlertTriangle;
  return ShieldQuestion;
}

function boundaryTone(level: SerenityResearchBoundaryLevel) {
  if (level === "evidence_backed") {
    return {
      shell: "border-emerald-300/25 bg-emerald-300/[0.07]",
      icon: "mt-0.5 shrink-0 text-emerald-200",
      title: "text-emerald-100"
    };
  }
  if (level === "candidate_watch") {
    return {
      shell: "border-cyan-300/25 bg-cyan-300/[0.07]",
      icon: "mt-0.5 shrink-0 text-cyan-200",
      title: "text-cyan-100"
    };
  }
  if (level === "needs_hard_evidence") {
    return {
      shell: "border-amber-300/25 bg-amber-300/[0.07]",
      icon: "mt-0.5 shrink-0 text-amber-200",
      title: "text-amber-100"
    };
  }
  return {
    shell: "border-rose-300/25 bg-rose-300/[0.07]",
    icon: "mt-0.5 shrink-0 text-rose-200",
    title: "text-rose-100"
  };
}

function Pill({ label, value, tone }: { label: string; value: number; tone: "emerald" | "cyan" | "amber" }) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-300/25 text-emerald-100"
      : tone === "cyan"
        ? "border-cyan-300/25 text-cyan-100"
        : "border-amber-300/25 text-amber-100";
  return (
    <span className={`rounded-md border bg-slate-950/35 px-2 py-1 text-[11px] ${toneClass}`}>
      {label} {value}
    </span>
  );
}

function needTone(priority: SerenityEvidenceNeed["priority"]) {
  if (priority === "high") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (priority === "medium") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  return "border-slate-700 bg-slate-900/70 text-slate-300";
}

function freshnessLabel(value: NonNullable<SerenityEvidenceBoundaryInput["evidenceCoverage"]>["freshnessLevel"]) {
  if (value === "fresh") return "新鲜";
  if (value === "aging") return "可用";
  if (value === "stale") return "过期";
  return "日期未知";
}

function freshnessTone(value: NonNullable<SerenityEvidenceBoundaryInput["evidenceCoverage"]>["freshnessLevel"]) {
  if (value === "fresh") return "border-emerald-300/25 text-emerald-100";
  if (value === "aging") return "border-cyan-300/25 text-cyan-100";
  if (value === "stale") return "border-rose-300/25 text-rose-100";
  return "border-amber-300/25 text-amber-100";
}
