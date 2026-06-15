"use client";

import { BrainCircuit, ShieldCheck } from "lucide-react";
import type { SelectionAgentReport, SelectionFinalReview, SelectionLlmMetrics } from "@/lib/selection/types";

export function SelectionAgentReview({
  agentReports,
  finalReview,
  llmStatus,
  llmErrors,
  llmMetrics
}: {
  agentReports?: SelectionAgentReport[];
  finalReview?: SelectionFinalReview;
  llmStatus?: string;
  llmErrors?: string[];
  llmMetrics?: SelectionLlmMetrics;
}) {
  if (!agentReports?.length && !finalReview && !llmStatus) return null;
  return (
    <section className="mt-4 rounded-lg border border-violet-300/20 bg-violet-300/[0.055] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-violet-300/25 bg-violet-300/10 text-violet-100">
            <BrainCircuit size={18} />
          </span>
          <div>
            <p className="text-xs tracking-[0.16em] text-violet-200">AI ANALYST REVIEW</p>
            <h3 className="mt-1 font-semibold text-slate-100">五位 Agent 复核与总评审</h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              模型只复核规则候选池，不新增股票，不突破硬阻断；最终建议仍以规则风控为边界。
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <MiniStat label="模型状态" value={formatStatus(llmStatus)} />
          <MiniStat label="输入估算" value={llmMetrics?.estimatedInputTokens ? `${llmMetrics.estimatedInputTokens}` : "--"} />
          <MiniStat label="耗时" value={llmMetrics?.elapsedMs ? `${(llmMetrics.elapsedMs / 1000).toFixed(1)}s` : "--"} />
        </div>
      </div>

      {llmErrors?.length ? (
        <div className="mt-3 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-100">
          {llmErrors.slice(0, 3).join("；")}
        </div>
      ) : null}

      {finalReview ? (
        <div className="mt-4 rounded-lg border border-violet-300/20 bg-slate-950/45 p-3">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-300/25 bg-emerald-300/10 text-emerald-100">
              <ShieldCheck size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-100">资深研究员综合评审</p>
              <p className="mt-1 text-xs leading-5 text-slate-300">{finalReview.summary}</p>
              <p className="mt-2 text-xs leading-5 text-slate-400">策略适用性：{finalReview.strategySuitability}</p>
              {finalReview.portfolioRisk ? <p className="mt-1 text-xs leading-5 text-slate-400">组合风险：{finalReview.portfolioRisk}</p> : null}
            </div>
          </div>
          {finalReview.finalPicks.length ? (
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {finalReview.finalPicks.slice(0, 6).map((pick) => (
                <div key={pick.code} className="rounded border border-slate-800 bg-slate-950/56 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-slate-100">{pick.name} <span className="font-mono text-xs text-slate-500">{pick.code}</span></p>
                      <p className="mt-1 text-[11px] text-violet-200">{formatRecommendation(pick.recommendation)} / 置信 {formatConfidence(pick.confidence)} / 仓位 {pick.suggestedPositionPct}%</p>
                    </div>
                    <span className="rounded border border-violet-300/25 px-2 py-1 font-mono text-xs text-violet-100">{pick.tier}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{pick.logic}</p>
                  {pick.invalidConditions[0] ? <p className="mt-1 text-[11px] leading-4 text-rose-100/80">失效：{pick.invalidConditions[0]}</p> : null}
                </div>
              ))}
            </div>
          ) : null}
          {finalReview.noTradeConditions.length ? (
            <details className="mt-3 rounded border border-slate-800 bg-slate-950/45 px-3 py-2">
              <summary className="cursor-pointer text-xs text-amber-100">不适合交易的情况</summary>
              <div className="mt-2 grid gap-1">
                {finalReview.noTradeConditions.slice(0, 6).map((item) => (
                  <p key={item} className="text-[11px] leading-4 text-slate-400">{item}</p>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}

      {agentReports?.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {agentReports.map((report) => (
            <details key={report.agentId} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-100">
                {report.agentName}
                <span className="ml-2 rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">{formatStatus(report.status)}</span>
              </summary>
              <p className="mt-2 text-xs leading-5 text-slate-400">{report.summary}</p>
              {report.topPicks.length ? <p className="mt-2 text-[11px] leading-4 text-emerald-100/85">支持：{report.topPicks.join("、")}</p> : null}
              {report.avoidStocks.length ? <p className="mt-1 text-[11px] leading-4 text-rose-100/85">回避：{report.avoidStocks.join("、")}</p> : null}
              {report.missingData.length ? <p className="mt-1 text-[11px] leading-4 text-amber-100/85">缺口：{report.missingData.slice(0, 3).join("；")}</p> : null}
            </details>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function formatStatus(value?: string) {
  if (value === "success") return "成功";
  if (value === "disabled") return "未启用";
  if (value === "rejected") return "被校验拒绝";
  if (value === "failed") return "失败";
  return "--";
}

function formatRecommendation(value: string) {
  if (value === "priority") return "优先";
  if (value === "watch") return "观察";
  if (value === "avoid") return "回避";
  return "等待";
}

function formatConfidence(value: string) {
  if (value === "high") return "高";
  if (value === "low") return "低";
  return "中";
}
