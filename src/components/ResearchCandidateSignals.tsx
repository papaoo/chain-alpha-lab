"use client";

import { AlertTriangle, BarChart3, GitBranch } from "lucide-react";
import type { AnalysisReport, StockCandidate } from "@/lib/types";
import { CandidateSignalTable } from "@/components/ResearchCandidateSignalTable";
import { AttributionEvidencePanel, ExcludedCandidatePanel } from "@/components/ResearchCandidateReviewPanels";
import { CollapsibleSection, Panel, SectionTitle } from "@/components/ResearchCandidateCommon";

export function CandidateSignalsPanel({
  report,
  candidates,
  selected,
  onSelect
}: {
  report: AnalysisReport;
  candidates: StockCandidate[];
  selected: StockCandidate | null;
  onSelect: (code: string) => void;
}) {
  return (
    <div id="candidate-signals" className="scroll-mt-24 xl:col-span-2">
      <Panel>
        <SectionTitle icon={BarChart3} title="候选股信号" meta="点击行查看公司认知卡片" />
        <CandidateSignalTable report={report} candidates={candidates} selected={selected} onSelect={onSelect} />
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          <CollapsibleSection title="候选剔除 / 人工复核" meta="未进入信号表的股票和阻断原因" icon={AlertTriangle} defaultOpen={false}>
            <ExcludedCandidatePanel report={report} />
          </CollapsibleSection>
          <CollapsibleSection title="主线归属证据链" meta="成分股、主营关键词、否定证据" icon={GitBranch} defaultOpen={false}>
            <AttributionEvidencePanel candidates={candidates} />
          </CollapsibleSection>
        </div>
      </Panel>
    </div>
  );
}
