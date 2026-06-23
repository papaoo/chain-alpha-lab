"use client";

import type { AnalysisReport, StockCandidate } from "@/lib/types";
import { StockNameHover } from "@/components/ResearchStockHover";
import { CandidateActionExplainCell } from "@/components/ResearchCandidateActionExplain";
import { CandidateBuyPointCell } from "@/components/ResearchCandidateBuyPointCell";
import { CandidateTriggerGapCell } from "@/components/ResearchCandidateTriggerGap";
import {
  attributionPillClass,
  formatCompletenessDetail,
  formatCompletenessTitle,
  formatFundFlow,
  formatMemoryBadge,
  formatRole,
  formatThemeMatchType,
  formatTrend,
  localizeText,
  SignalBadge,
  StrengthBadge
} from "@/components/ResearchCandidateCommon";
import { getSerenityTag, SerenityTagPill, type SerenityTagMap } from "@/components/ResearchSerenityTags";

export function CandidateSignalTable({
  report,
  candidates,
  selected,
  onSelect,
  serenityTags = {},
  isHistoricalReport = false
}: {
  report: AnalysisReport;
  candidates: StockCandidate[];
  selected: StockCandidate | null;
  onSelect: (code: string) => void;
  serenityTags?: SerenityTagMap;
  isHistoricalReport?: boolean;
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[1220px] text-left text-sm">
        <thead className="border-b border-line text-xs text-muted">
          <tr>
            <th className="py-3">代码 / 名称</th>
            <th>历史跟踪</th>
            <th>本期数据</th>
            <th>主线</th>
            <th>瓶颈研究</th>
            <th>归属证据</th>
            <th>定位</th>
            <th>趋势</th>
            <th>资金</th>
            <th>买点 / 机会</th>
            <th>触发差距</th>
            <th>信号</th>
            <th>强度</th>
            <th>动作</th>
            <th>仓位上限</th>
            <th>失效条件</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/70">
          {candidates.map((candidate) => {
            const memory = report.factPackage.stockMemories?.find((item) => item.code.toLowerCase() === candidate.code.toLowerCase());
            const active = selected?.code === candidate.code;
            const serenityTag = getSerenityTag(serenityTags, candidate.code);
            return (
              <tr
                key={candidate.code}
                className={`cursor-pointer transition ${active ? "bg-info/10 outline outline-1 outline-info/25" : "hover:bg-white/[0.035]"}`}
                onClick={() => onSelect(candidate.code)}
              >
                <td className="py-3">
                  <StockNameHover candidate={candidate} className="block font-medium" />
                  <span className="font-mono text-xs text-muted">{candidate.code}</span>
                </td>
                <td>
                  <MemoryBadge seenCount={memory?.seenCount} lastAction={memory?.lastAction} />
                </td>
                <td>
                  <CandidateDataBadge candidate={candidate} isHistoricalReport={isHistoricalReport} />
                </td>
                <td>{candidate.sectorName}</td>
                <td><SerenityTagPill tag={serenityTag} /></td>
                <td>
                  <div className="max-w-[180px]">
                    <span className={`rounded-full border px-2 py-1 text-xs ${attributionPillClass(candidate.mainlineAttribution?.status)}`}>
                      {formatThemeMatchType(candidate.mainlineAttribution?.status)}
                    </span>
                    <p className="mt-1 line-clamp-1 text-xs text-muted">
                      {candidate.mainlineAttribution?.businessKeywords?.join("、") || candidate.mainlineAttribution?.reason || "待校验"}
                    </p>
                  </div>
                </td>
                <td>{formatRole(candidate.role)}</td>
                <td>{formatTrend(candidate.trendState)}</td>
                <td>{formatFundFlow(candidate.fundFlowState)}</td>
                <td>
                  <CandidateBuyPointCell candidate={candidate} />
                </td>
                <td><CandidateTriggerGapCell candidate={candidate} /></td>
                <td><SignalBadge candidate={candidate} /></td>
                <td><StrengthBadge score={candidate.strengthScore} /></td>
                <td><CandidateActionExplainCell candidate={candidate} /></td>
                <td>{candidate.positionLimitPct}%</td>
                <td className="max-w-[300px] text-muted">{localizeText(candidate.invalidCondition)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MemoryBadge({ seenCount, lastAction }: { seenCount?: number; lastAction?: string }) {
  const isHistoricalInsufficient = lastAction === "数据不足" || lastAction === "insufficient";
  return (
    <span
      className={`inline-flex rounded border px-2 py-1 text-xs ${
        isHistoricalInsufficient
          ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
          : "border-line/70 bg-bg/50 text-muted"
      }`}
      title="这里展示的是历史记忆里的上次动作，不代表本期数据完整性。请以旁边“本期数据”和顶部“候选股数据体检”为准。"
    >
      {isHistoricalInsufficient ? `历史 ${seenCount ?? 0} 次 / 上次缺数` : formatMemoryBadge(seenCount, lastAction)}
    </span>
  );
}

function CandidateDataBadge({ candidate, isHistoricalReport }: { candidate: StockCandidate; isHistoricalReport: boolean }) {
  const level = candidate.dataCompleteness.level;
  const hasHardGap = level === "insufficient" || (candidate.dataCompleteness.coreMarketLevel ?? level) === "insufficient";
  const label = isHistoricalReport && hasHardGap
    ? `历史缺口：${candidate.dataCompleteness.missingFields.slice(0, 2).join("、") || "核心字段"}`
    : formatCompletenessDetail(candidate.dataCompleteness);
  const title = [
    isHistoricalReport
      ? "这是当前打开的历史报告当时的数据状态，不代表最新报告仍然缺数。"
      : "这是当前报告的数据状态。",
    formatCompletenessTitle(candidate.dataCompleteness)
  ].join(" ");
  return (
    <span
      className={`inline-flex max-w-[150px] rounded border px-2 py-1 text-xs ${dataCompletenessClass(level, isHistoricalReport && hasHardGap)}`}
      title={title}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}

function dataCompletenessClass(level: StockCandidate["dataCompleteness"]["level"], historicalGap = false) {
  if (historicalGap) return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  if (level === "complete") return "border-emerald-300/30 bg-emerald-300/10 text-emerald-100";
  if (level === "partial") return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  return "border-rose-300/30 bg-rose-300/10 text-rose-100";
}
