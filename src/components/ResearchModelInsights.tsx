"use client";

import { ServerCog } from "lucide-react";
import type { AnalysisReport, Fact } from "@/lib/types";
import { ExtendedModelInsights } from "@/components/ResearchExtendedModelInsights";
import { EvidenceChips, formatLlmStatus, formatMarketState, formatReportStatus, localizeText, MiniStat, SectionTitle, stagePillClass } from "@/components/ResearchModelInsightCommon";

export function ModelJudgementPanel({ report, factMap }: { report: AnalysisReport; factMap: Map<string, Fact> }) {
  const model = report.llmResult;
  return (
    <div className="mt-5 rounded-lg border border-line bg-bg/55 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <SectionTitle icon={ServerCog} title="规则边界 × 模型研判" meta={`${formatReportStatus(report.reportStatus)} / ${formatLlmStatus(report.llmStatus)}`} />
        <span className={`w-fit rounded border px-2 py-1 text-xs ${model ? "border-up/40 bg-up/10 text-up" : "border-warn/40 bg-warn/10 text-warn"}`}>
          {model ? "DeepSeek 已参与" : "仅规则输出"}
        </span>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-line/80 bg-panel/70 p-3">
          <p className="text-sm font-medium">规则硬边界</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <MiniStat label="大盘状态" value={formatMarketState(report.ruleResult.market.marketState)} />
            <MiniStat label="交易模式" value={report.ruleResult.market.tradeMode} />
            <MiniStat label="总仓上限" value={`${report.ruleResult.market.maxTotalPositionPct}%`} />
            <MiniStat label="单票上限" value={`${report.ruleResult.market.maxSingleStockPct}%`} />
          </div>
          <div className="mt-3 rounded-lg border border-warn/30 bg-warn/10 p-3 text-xs leading-5 text-warn">
            {report.ruleResult.market.forbiddenActions.length ? `禁止：${report.ruleResult.market.forbiddenActions.join("、")}` : "无额外禁止动作"}
          </div>
        </div>
        <div className="rounded-lg border border-line/80 bg-panel/70 p-3">
          <p className="text-sm font-medium">DeepSeek 研判</p>
          {model ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm leading-6 text-muted">{localizeText(model.marketJudgement.logic)}</p>
              <p className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-xs leading-5 text-warn">{localizeText(model.marketJudgement.risk)}</p>
              <EvidenceChips refs={model.marketJudgement.evidenceRefs} factMap={factMap} />
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm leading-6 text-warn">
              当前报告没有模型增强。请确认配置中心已启用模型并重新运行今日分析；若模型输出不合规，系统会回退到规则报告。
            </div>
          )}
        </div>
      </div>
      {model?.mainLines.length ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {model.mainLines.slice(0, 3).map((line, index) => (
            <div key={`${line.name}-${line.stage}-${index}`} className="rounded-lg border border-line/80 bg-panel/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{line.name}</p>
                <span className={`rounded border px-2 py-1 text-[11px] ${stagePillClass(line.stage)}`}>{line.stage}</span>
              </div>
              <p className="mt-3 min-h-[72px] text-xs leading-5 text-muted">{localizeText(line.logic)}</p>
              <EvidenceChips refs={line.evidenceRefs.slice(0, 4)} factMap={factMap} />
            </div>
          ))}
        </div>
      ) : null}
      {model ? <ExtendedModelInsights model={model} factMap={factMap} /> : null}
    </div>
  );
}
