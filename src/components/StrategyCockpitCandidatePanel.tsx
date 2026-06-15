"use client";

import { ArrowRight, Radar } from "lucide-react";
import type { AnalysisReport, CandidateReviewRecord, MainlineAttribution } from "@/lib/types";
import type { Tone } from "@/components/StrategyCockpitTypes";
import { EvidencePill, MiniStat, Panel } from "@/components/StrategyCockpitPrimitives";
import { StockNameHover } from "@/components/ResearchStockHover";
import { BasicStockNameHover } from "@/components/SelectionStockHover";
import { formatAction, scoreTone, sentimentBoxClass, toneBadge } from "@/components/StrategyCockpitUtils";

export function CandidatePanel({ candidates, reviews }: { candidates: AnalysisReport["factPackage"]["candidates"]; reviews: CandidateReviewRecord[] }) {
  const topCandidates = candidates.slice(0, 5);
  const reviewRequiredCount = reviews.filter((item) => item.reviewRequired || item.status === "人工复核").length;
  const excludedCount = reviews.filter((item) => item.status === "剔除").length;
  return (
    <Panel
      title="候选机会"
      icon={Radar}
      action={<a className="inline-flex items-center gap-1 text-xs text-cyan-200" href="/mainline">更多 <ArrowRight size={12} /></a>}
      collapsible
      defaultOpen={false}
      testId="candidate-panel"
      summary={<CandidateSummary candidates={topCandidates} reviews={reviews} />}
    >
      <div className="grid gap-3">
        {topCandidates.map((candidate) => (
          <div key={candidate.code} className="rounded-xl border border-slate-800 bg-slate-950/58 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-100">
                  <StockNameHover candidate={candidate} />
                </p>
                <p className="mt-1 text-xs text-slate-500">{candidate.code} / {formatAction(candidate.action)}</p>
                {candidate.opportunityProfile ? (
                  <p className="mt-1 line-clamp-1 text-xs text-amber-100" title={candidate.opportunityProfile.primaryReason}>
                    {candidate.opportunityProfile.label} / {candidate.opportunityProfile.score}
                  </p>
                ) : null}
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-cyan-100">{candidate.signalScore ?? candidate.strengthScore ?? 0}</p>
                <p className="mt-1 text-xs text-slate-500">信号分</p>
              </div>
            </div>
            {candidate.opportunityProfile ? (
              <div className="mt-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.06] p-2 text-xs leading-5 text-amber-50/90">
                <p className="font-medium text-amber-100">机会预案：{candidate.opportunityProfile.primaryReason}</p>
                <p className="mt-1 line-clamp-2 text-slate-300">
                  激活：{candidate.opportunityProfile.activationConditions[0] ?? "等待更多证据"}；下一步：{candidate.opportunityProfile.nextSteps[0] ?? "继续观察"}
                </p>
              </div>
            ) : null}
            <AttributionMiniBar candidate={candidate} />
          </div>
        ))}
        {!topCandidates.length ? <p className="text-sm text-slate-400">暂无候选股。若数据源失败，系统不会伪造无效候选。</p> : null}
        {reviews.length ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/58 p-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-100">候选剔除 / 人工复核</p>
                <p className="mt-1 text-xs text-slate-500">未进入信号表的股票不会被模型推荐；这里只展示原因摘要。</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-amber-100">复核 {reviewRequiredCount}</span>
                <span className="rounded-lg border border-rose-400/25 bg-rose-400/10 px-2 py-1 text-rose-100">剔除 {excludedCount}</span>
              </div>
            </div>
            <div className="mt-3 grid gap-2">
              {reviews.slice(0, 5).map((item) => (
                <CandidateReviewRow key={`${item.code}-${item.reason}`} item={item} />
              ))}
            </div>
          </div>
        ) : (
          <p className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">当前报告没有记录被剔除或需人工复核的候选。</p>
        )}
      </div>
    </Panel>
  );
}

export function AttributionMiniBar({ candidate }: { candidate: AnalysisReport["factPackage"]["candidates"][number] }) {
  const attribution = candidate.mainlineAttribution;
  const chain = attribution?.evidenceChain;
  const constituentCount = chain?.constituentEvidence.length ?? 0;
  const businessCount = (chain?.businessEvidence.length ?? 0) + (attribution?.businessKeywords.length ?? 0);
  const industryCount = chain?.industryChainEvidence.length ?? 0;
  const negativeCount = (chain?.negativeEvidence.length ?? 0) + (attribution?.blockers.length ?? 0);
  const needsReview = chain?.reviewRequired || attribution?.shouldExclude || attribution?.confidence === "低";
  const qualityTone: Tone = attribution?.shouldExclude
    ? "risk"
    : needsReview
      ? "warn"
      : attribution?.status === "direct_constituent" || attribution?.status === "business_direct"
        ? "up"
        : "info";

  return (
    <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/45 p-2.5">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-lg border px-2 py-1 text-[11px] ${toneBadge(qualityTone)}`}>
              {formatAttributionStatus(attribution?.status)}
            </span>
            <span className="rounded-lg border border-slate-700 bg-slate-950/70 px-2 py-1 text-[11px] text-slate-300">
              置信度 {attribution?.confidence ?? "待确认"}
            </span>
            {needsReview ? (
              <span className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-[11px] text-amber-100">需复核</span>
            ) : (
              <span className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[11px] text-emerald-100">证据通过</span>
            )}
          </div>
          <p className="mt-2 line-clamp-1 text-xs text-slate-400" title={attribution?.reason ?? "等待主线归属证据链"}>
            {attribution?.reason ?? "等待主线归属证据链"}
          </p>
        </div>
        <div className="grid grid-cols-4 gap-1.5 text-center text-[11px] lg:w-[260px]">
          <EvidencePill label="成分" value={constituentCount} tone={constituentCount > 0 ? "up" : "muted"} />
          <EvidencePill label="主营" value={businessCount} tone={businessCount > 0 ? "info" : "muted"} />
          <EvidencePill label="产业链" value={industryCount} tone={industryCount > 0 ? "info" : "muted"} />
          <EvidencePill label="否定" value={negativeCount} tone={negativeCount > 0 ? "risk" : "muted"} />
        </div>
      </div>
    </div>
  );
}

export function formatAttributionStatus(status?: MainlineAttribution["status"]) {
  const map = {
    direct_constituent: "成分股直证",
    business_direct: "主营直连",
    supply_chain_related: "产业链相关",
    theme_indirect: "主题间接",
    mismatch: "主题偏离",
    unknown: "待确认"
  } satisfies Record<MainlineAttribution["status"], string>;
  return status ? map[status] : "待确认";
}

export function CandidateReviewRow({ item }: { item: CandidateReviewRecord }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/55 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-slate-100">
            <BasicStockNameHover
              stock={{
                name: item.name,
                code: item.code,
                latest: item.quote?.latest ?? item.price,
                changePct: item.quote?.changePct,
                turnoverRate: item.quote?.turnoverRate,
                amount: item.quote?.amount,
                mainNetFlow: item.fundFlow?.mainNetFlow ?? item.quote?.mainNetInflow,
                score: item.signalScore ?? item.strengthScore,
                note: item.reason
              }}
            />
          </p>
          <p className="mt-0.5 font-mono text-xs text-slate-500">{item.code}</p>
        </div>
        <span className={`rounded-lg border px-2 py-1 text-xs ${item.status === "剔除" ? "border-rose-400/30 bg-rose-400/10 text-rose-100" : "border-amber-400/30 bg-amber-400/10 text-amber-100"}`}>{item.status}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400" title={item.reason}>{item.reason}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <MiniStat label="缺少证据" value={item.missingEvidence.length ? `${item.missingEvidence.length} 项` : "无"} tone={item.missingEvidence.length ? "warn" : "muted"} />
        <MiniStat label="阻断原因" value={item.blockers.length ? `${item.blockers.length} 项` : "无"} tone={item.blockers.length ? "risk" : "muted"} />
        <MiniStat label="已有证据" value={item.evidence.length ? `${item.evidence.length} 项` : "无"} tone={item.evidence.length ? "info" : "muted"} />
      </div>
    </div>
  );
}

export function CandidateSummary({ candidates, reviews }: { candidates: AnalysisReport["factPackage"]["candidates"]; reviews: CandidateReviewRecord[] }) {
  if (!candidates.length && !reviews.length) return <p className="text-sm text-slate-400">暂无候选股。</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {candidates.slice(0, 4).map((candidate) => (
        <span key={`${candidate.code}-summary`} className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">
          <StockNameHover candidate={candidate} className="font-medium text-slate-100" />
          <span>{formatAction(candidate.action)}</span>
          <span className="text-cyan-200">{candidate.signalScore ?? candidate.strengthScore ?? 0}</span>
        </span>
      ))}
      {reviews.length ? (
        <span className="inline-flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
          复核/剔除 {reviews.length}
        </span>
      ) : null}
    </div>
  );
}
