"use client";

import { AlertTriangle, BarChart3, GitBranch } from "lucide-react";
import type { AnalysisReport, DataCompleteness, StockCandidate } from "@/lib/types";
import { CandidateDecisionGate } from "@/components/ResearchCandidateDecisionGate";
import { CandidateSignalTable } from "@/components/ResearchCandidateSignalTable";
import { CandidateOpportunitySummary } from "@/components/ResearchCandidateOpportunitySummary";
import { CandidatePressureHistoryPanel } from "@/components/ResearchCandidatePressureHistory";
import { CandidateTriggerMap } from "@/components/ResearchCandidateTriggerMap";
import { AttributionEvidencePanel, ExcludedCandidatePanel } from "@/components/ResearchCandidateReviewPanels";
import { CollapsibleSection, Panel, SectionTitle, SIGNAL_SCORE_BOUNDARY } from "@/components/ResearchCandidateCommon";
import { ReportDataGapPanel } from "@/components/ResearchReportDataGapPanel";
import type { SerenityTagMap } from "@/components/ResearchSerenityTags";

export function CandidateSignalsPanel({
  report,
  candidates,
  selected,
  onSelect,
  serenityTags = {},
  latestReportCreatedAt
}: {
  report: AnalysisReport;
  candidates: StockCandidate[];
  selected: StockCandidate | null;
  onSelect: (code: string) => void;
  serenityTags?: SerenityTagMap;
  latestReportCreatedAt?: string;
}) {
  const isHistoricalReport = Boolean(latestReportCreatedAt && latestReportCreatedAt !== report.createdAt);
  return (
    <div id="candidate-signals" className="scroll-mt-24 xl:col-span-2">
      <Panel>
        <SectionTitle icon={BarChart3} title="候选股信号" meta="点击行查看公司认知卡片" />
        {isHistoricalReport ? <CandidateHistoricalSnapshotNotice reportCreatedAt={report.createdAt} latestReportCreatedAt={latestReportCreatedAt} /> : null}
        <CandidateDecisionGate report={report} candidates={candidates} />
        <CandidateDataCompletenessDigest candidates={candidates} isHistoricalReport={isHistoricalReport} />
        <ReportDataGapPanel report={report} />
        <CandidateOpportunitySummary candidates={candidates} />
        <CandidatePressureHistoryPanel />
        <CandidateTriggerMap candidates={candidates} />
        <p className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-2 text-xs leading-5 text-cyan-100">
          {SIGNAL_SCORE_BOUNDARY}
        </p>
        <CandidateSignalTable
          report={report}
          candidates={candidates}
          selected={selected}
          onSelect={onSelect}
          serenityTags={serenityTags}
          isHistoricalReport={isHistoricalReport}
        />
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

function CandidateHistoricalSnapshotNotice({
  reportCreatedAt,
  latestReportCreatedAt
}: {
  reportCreatedAt: string;
  latestReportCreatedAt?: string;
}) {
  return (
    <div className="mt-4 rounded-lg border border-amber-300/25 bg-amber-300/[0.08] px-3 py-3 text-xs leading-5 text-amber-100">
      你正在查看 {formatDateTime(reportCreatedAt)} 的历史候选池；最新报告为 {formatDateTime(latestReportCreatedAt)}。
      表格里的“上次数据不足”“缺少K线”等字样如果来自旧快照，只能说明当时接口或补源链路不完整，不能代表当前盘面仍然缺数。
    </div>
  );
}

function CandidateDataCompletenessDigest({ candidates, isHistoricalReport }: { candidates: StockCandidate[]; isHistoricalReport: boolean }) {
  const summary = summarizeCandidateCompleteness(candidates);
  const isHealthy = summary.coreCompleteCount === summary.total && summary.total > 0;
  const message = !summary.total
    ? "本期还没有候选股，无法判断候选数据完整性。"
    : isHistoricalReport && !isHealthy
      ? `这是历史报告当时的数据状态：${summary.total - summary.coreCompleteCount} 只候选存在核心缺口；请切回最新报告判断当前是否仍缺数。`
      : isHealthy
      ? `本期 ${summary.total} 只候选股的 K线、技术指标、资金流和主线归属均已补齐；若仍看到“上次数据不足”，那是历史跟踪动作，不代表本期缺数。`
      : `本期仍有 ${summary.total - summary.coreCompleteCount} 只候选存在核心交易数据缺口，不能直接生成可执行买入建议。`;
  const tone = isHealthy
    ? "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100"
    : isHistoricalReport
      ? "border-cyan-300/25 bg-cyan-300/[0.07] text-cyan-100"
      : "border-amber-300/25 bg-amber-300/[0.08] text-amber-100";

  return (
    <div className={`mt-4 rounded-lg border px-3 py-3 ${tone}`}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-sm font-semibold">候选股数据体检</p>
          <p className="mt-1 text-xs leading-5 opacity-85">{message}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 xl:min-w-[620px] xl:grid-cols-6">
          <DigestMini label="核心完整" value={`${summary.coreCompleteCount}/${summary.total}`} ok={isHealthy} />
          <DigestMini label="K线缺失" value={`${summary.missingKline}`} ok={summary.missingKline === 0} />
          <DigestMini label="技术缺失" value={`${summary.missingTechnical}`} ok={summary.missingTechnical === 0} />
          <DigestMini label="资金缺失" value={`${summary.missingFundFlow}`} ok={summary.missingFundFlow === 0} />
          <DigestMini label="归属缺失" value={`${summary.missingSector}`} ok={summary.missingSector === 0} />
          <DigestMini label="公司待补" value={`${summary.companyNeedsSupplement}`} ok={summary.companyNeedsSupplement === 0} />
        </div>
      </div>
      {summary.topMissingFields.length ? (
        <p className="mt-2 text-xs opacity-75">高频缺口：{summary.topMissingFields.join("、")}</p>
      ) : null}
    </div>
  );
}

function DigestMini({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className={`rounded border px-2 py-1.5 ${ok ? "border-emerald-300/20 bg-emerald-300/10" : "border-amber-300/25 bg-amber-300/10"}`}>
      <p className="opacity-65">{label}</p>
      <p className="mt-0.5 font-mono text-[11px] font-semibold">{value}</p>
    </div>
  );
}

function summarizeCandidateCompleteness(candidates: StockCandidate[]) {
  const counts = {
    total: candidates.length,
    coreCompleteCount: 0,
    missingKline: 0,
    missingTechnical: 0,
    missingFundFlow: 0,
    missingSector: 0,
    missingProfile: 0,
    companyNeedsSupplement: 0,
    topMissingFields: [] as string[]
  };
  const fieldCounts = new Map<string, number>();
  for (const candidate of candidates) {
    const data = candidate.dataCompleteness;
    if (isCoreComplete(data)) counts.coreCompleteCount += 1;
    if (!data.hasKlineData) counts.missingKline += 1;
    if (!data.hasTechnicalData) counts.missingTechnical += 1;
    if (!data.hasFundFlowData) counts.missingFundFlow += 1;
    if (!data.hasSectorData) counts.missingSector += 1;
    if (!data.hasProfileData) counts.missingProfile += 1;
    if (data.companyKnowledgeLevel && data.companyKnowledgeLevel !== "sufficient") counts.companyNeedsSupplement += 1;
    for (const field of data.missingFields ?? []) {
      fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1);
    }
  }
  counts.topMissingFields = Array.from(fieldCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([field, count]) => `${field} ${count}`);
  return counts;
}

function isCoreComplete(data: DataCompleteness) {
  return (data.coreMarketLevel ?? data.level) === "complete" && data.hasKlineData && data.hasTechnicalData && data.hasFundFlowData && data.hasSectorData;
}

function formatDateTime(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}
