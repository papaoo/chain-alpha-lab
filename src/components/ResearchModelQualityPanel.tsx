"use client";

import type { AnalysisReport } from "@/lib/types";
import { formatLlmStatus, MiniStat } from "@/components/ResearchMarketCommon";

export function ModelQualityPanel({ report }: { report: AnalysisReport }) {
  const metrics = report.llmMetrics;
  if (!metrics) {
    return <p className="rounded-lg border border-line bg-bg/55 p-3 text-sm text-muted">当前报告没有模型调用指标，重新运行分析后会记录耗时和 Prompt 体积。</p>;
  }
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-4">
        <MiniStat label="模型状态" value={formatLlmStatus(metrics.status)} />
        <MiniStat label="耗时" value={`${metrics.elapsedMs} ms`} />
        <MiniStat label="请求次数" value={`${metrics.requestCount} 次`} />
        <MiniStat label="最大输出" value={`${metrics.maxTokens} tokens`} />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <MiniStat label="报告 Prompt" value={`${metrics.reportPromptChars} 字符`} />
        <MiniStat label="修复 Prompt" value={metrics.repairPromptChars ? `${metrics.repairPromptChars} 字符` : "未触发"} />
        <MiniStat label="修复重试" value={metrics.repairAttempted ? "是" : "否"} />
        <MiniStat label="错误数量" value={`${metrics.errorCount}`} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <MiniStat label="估算输入" value={metrics.estimatedInputTokens ? `${metrics.estimatedInputTokens} tokens` : "未记录"} />
        <MiniStat label="修复策略" value={metrics.skippedRepairReason ? "已跳过" : metrics.repairAttempted ? "已重试" : "未触发"} />
      </div>
      {metrics.skippedRepairReason ? (
        <p className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-xs leading-5 text-warn">{metrics.skippedRepairReason}</p>
      ) : null}
      {metrics.errors?.length ? (
        <details className="rounded-lg border border-line/70 bg-bg/55 p-3">
          <summary className="cursor-pointer text-xs font-medium text-info">查看模型校验错误</summary>
          <div className="mt-2 grid gap-2">
            {metrics.errors.map((error, index) => (
              <p key={`${index}-${error}`} className="rounded border border-line/70 bg-panel/60 px-2 py-1.5 text-xs leading-5 text-muted">
                {error}
              </p>
            ))}
          </div>
        </details>
      ) : null}
      <p className="rounded-lg border border-line/70 bg-bg/55 p-3 text-xs leading-5 text-muted">
        {metrics.provider} / {metrics.model} / temperature {metrics.temperature}。Prompt 已使用精简输出契约，完整格式仍由后端校验。
      </p>
    </div>
  );
}
