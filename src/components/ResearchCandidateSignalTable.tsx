"use client";

import type { AnalysisReport, StockCandidate } from "@/lib/types";
import { StockNameHover } from "@/components/ResearchStockHover";
import { attributionPillClass, formatAction, formatCompleteness, formatFundFlow, formatMemoryBadge, formatRole, formatThemeMatchType, formatTrend, localizeText, SignalBadge, StrengthBadge } from "@/components/ResearchCandidateCommon";

export function CandidateSignalTable({
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
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="border-b border-line text-xs text-muted">
          <tr>
            <th className="py-3">代码 / 名称</th>
            <th>跟踪</th>
            <th>主线</th>
            <th>归属证据</th>
            <th>定位</th>
            <th>趋势</th>
            <th>资金</th>
            <th>买点 / 机会</th>
            <th>信号</th>
            <th>强度</th>
            <th>动作</th>
            <th>仓位上限</th>
            <th>数据完整性</th>
            <th>失效条件</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/70">
          {candidates.map((candidate) => {
            const memory = report.factPackage.stockMemories?.find((item) => item.code.toLowerCase() === candidate.code.toLowerCase());
            const active = selected?.code === candidate.code;
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
                <td>{formatMemoryBadge(memory?.seenCount, memory?.lastAction)}</td>
                <td>{candidate.sectorName}</td>
                <td>
                  <div className="max-w-[180px]">
                    <span className={`rounded-full border px-2 py-1 text-xs ${attributionPillClass(candidate.mainlineAttribution?.status)}`}>
                      {formatThemeMatchType(candidate.mainlineAttribution?.status)}
                    </span>
                    <p className="mt-1 line-clamp-1 text-xs text-muted">{candidate.mainlineAttribution?.businessKeywords?.join("、") || candidate.mainlineAttribution?.reason || "待校验"}</p>
                  </div>
                </td>
                <td>{formatRole(candidate.role)}</td>
                <td>{formatTrend(candidate.trendState)}</td>
                <td>{formatFundFlow(candidate.fundFlowState)}</td>
                <td>
                  <div className="max-w-[220px]">
                    <span className="rounded-full border border-info/30 bg-info/10 px-2 py-1 text-xs text-info">
                      {candidate.buyPointEvaluation ? `${candidate.buyPointEvaluation.status} / ${candidate.buyPointEvaluation.type}` : candidate.buyPointType}
                    </span>
                    <p className="mt-1 line-clamp-2 text-xs leading-4 text-muted">
                      {candidate.opportunityProfile?.label
                        ? `${candidate.opportunityProfile.label}：${candidate.opportunityProfile.primaryReason}`
                        : candidate.buyPointEvaluation?.triggerCondition ?? "等待买点确认"}
                    </p>
                  </div>
                </td>
                <td><SignalBadge candidate={candidate} /></td>
                <td><StrengthBadge score={candidate.strengthScore} /></td>
                <td>{formatAction(candidate.action)}</td>
                <td>{candidate.positionLimitPct}%</td>
                <td>{formatCompleteness(candidate.dataCompleteness.level)}</td>
                <td className="max-w-[300px] text-muted">{localizeText(candidate.invalidCondition)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
