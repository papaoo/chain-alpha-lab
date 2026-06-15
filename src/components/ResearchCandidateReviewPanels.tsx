"use client";

import type { AnalysisReport, CandidateReviewRecord, StockCandidate } from "@/lib/types";
import { CompanyBulletBlock } from "@/components/ResearchCompanyCards";
import { StockNameHover } from "@/components/ResearchStockHover";
import { BasicStockNameHover } from "@/components/SelectionStockHover";
import { attributionPillClass, formatAttributionSourceQuality, formatThemeMatchType, localizeText, MiniStat } from "@/components/ResearchCandidateCommon";

export function ExcludedCandidatePanel({ report }: { report: AnalysisReport }) {
  const structured = report.factPackage.candidateReviews ?? [];
  const excluded: CandidateReviewRecord[] = structured.length
    ? structured
    : report.factPackage.facts
      .filter((fact) => fact.factId.includes(".candidate_excluded"))
      .map((fact) => ({
        code: fact.factId.split(".")[2] ?? "unknown",
        name: fact.factId.split(".")[2] ?? "unknown",
        status: "人工复核" as const,
        reason: fact.text,
        missingEvidence: [],
        blockers: [],
        evidence: [],
        evidenceChain: undefined,
        attributionStatus: undefined,
        reviewRequired: true
      }));
  if (!excluded.length) {
    return <p className="rounded-lg border border-up/30 bg-up/10 p-3 text-sm text-up">当前候选池没有记录被剔除股票。</p>;
  }
  return (
    <div className="grid gap-3">
      {excluded.slice(0, 8).map((item) => (
        <div key={`${item.code}-${item.reason}`} className="rounded-lg border border-warn/25 bg-warn/[0.06] p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <BasicStockNameHover
                className="font-medium"
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
              <span className="font-mono text-xs text-warn">{item.code}</span>
            </div>
            <span className="rounded border border-warn/40 px-2 py-0.5 text-[11px] text-warn">{item.status}</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted">{localizeText(item.reason)}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <MiniStat label="归属状态" value={formatThemeMatchType(item.attributionStatus)} />
            <MiniStat label="来源质量" value={formatAttributionSourceQuality(item.evidenceChain?.sourceQuality)} />
            <MiniStat label="复核" value={item.reviewRequired ? "需要" : "不需要"} />
          </div>
          <div className="mt-3 grid gap-2 lg:grid-cols-3">
            <CompanyBulletBlock title="缺少证据" items={item.missingEvidence} empty="无" tone="warn" />
            <CompanyBulletBlock title="阻断原因" items={item.blockers} empty="无" tone="warn" />
            <CompanyBulletBlock title="已有证据" items={item.evidence} empty="无" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AttributionEvidencePanel({ candidates }: { candidates: StockCandidate[] }) {
  if (!candidates.length) return <p className="rounded-lg border border-line bg-bg/55 p-3 text-sm text-muted">暂无候选股。</p>;
  return (
    <div className="grid gap-2">
      {candidates.slice(0, 5).map((candidate) => {
        const attribution = candidate.mainlineAttribution;
        return (
          <div key={candidate.code} className="rounded-lg border border-line/70 bg-bg/55 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <StockNameHover candidate={candidate} className="font-medium" />
                <p className="font-mono text-[11px] text-muted">{candidate.code}</p>
              </div>
              <span className={`rounded-full border px-2 py-1 text-xs ${attributionPillClass(attribution?.status)}`}>
                {formatThemeMatchType(attribution?.status)} / {attribution?.confidence ?? "低"}
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <MiniStat label="目标主线" value={attribution?.matchedSector ?? candidate.sectorName} />
              <MiniStat label="成分证据" value={attribution?.membershipSector ?? "缺失"} />
              <MiniStat label="关键词" value={attribution?.businessKeywords.join("、") || "无"} />
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              <CompanyBulletBlock title="正向证据" items={attribution?.evidence ?? []} empty="暂无正向证据" />
              <CompanyBulletBlock title="否定/阻断" items={attribution?.blockers ?? []} empty="暂无阻断" tone="warn" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
