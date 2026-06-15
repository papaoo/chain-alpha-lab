"use client";

import { Building2, X } from "lucide-react";
import type { AnalysisReport, Fact, StockCandidate } from "@/lib/types";
import { SectionTitle } from "@/components/ResearchCompanyUi";
import { CompanyDetailCard } from "@/components/ResearchCompanyDetailCard";

export function CompanyDetailOverlay({
  open,
  candidate,
  factMap,
  report,
  onClose
}: {
  open: boolean;
  candidate: StockCandidate;
  factMap: Map<string, Fact>;
  report: AnalysisReport;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-sm">
      <button className="absolute inset-0 cursor-default" type="button" aria-label="关闭公司详情" onClick={onClose} />
      <aside className="drawer-enter relative h-full w-full max-w-3xl overflow-y-auto border-l border-line bg-bg/95 p-4 shadow-[0_0_90px_rgba(0,0,0,0.55)] sm:p-6">
        <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-4 flex items-center justify-between border-b border-line bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:-mt-6 sm:px-6">
          <SectionTitle icon={Building2} title="公司详情" meta={`${candidate.name} / ${candidate.code}`} />
          <button className="rounded-lg border border-line bg-panel/70 p-2 text-muted hover:text-text" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <CompanyDetailCard candidate={candidate} factMap={factMap} report={report} />
      </aside>
    </div>
  );
}
