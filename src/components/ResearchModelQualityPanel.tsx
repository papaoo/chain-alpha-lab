"use client";

import { useEffect, useState } from "react";
import { fetchApiJson } from "@/lib/client/api";
import { localizeModelError } from "@/lib/display/modelErrorText";
import type { AnalysisReport } from "@/lib/types";
import { formatLlmStatus, MiniStat } from "@/components/ResearchMarketCommon";

interface ModelUsageSummary {
  generatedAt: string;
  windowDays: number;
  callCount: number;
  analysisCallCount: number;
  selectionAgentCallCount: number;
  successCount: number;
  failedOrRejectedCount: number;
  disabledOrSkippedCount: number;
  totalEstimatedInputTokens: number | null;
  totalEstimatedOutputTokens: number | null;
  totalReportedTokens: number | null;
  avgElapsedMs: number | null;
  maxElapsedMs: number | null;
  repairOrRetryCount: number;
  errorCount: number;
  errorCategories: Array<{
    key: string;
    label: string;
    count: number;
    sampleMessages: string[];
    mitigation: string;
  }>;
  recentCalls: Array<{
    id: string;
    source: "analysis_report" | "selection_agent";
    label: string;
    createdAt: string;
    status: string;
    provider?: string;
    model?: string;
    elapsedMs?: number;
    requestCount?: number;
    retryCount?: number;
    errorCount?: number;
    estimatedInputTokens?: number;
    totalTokens?: number;
    skippedOrDisabledReason?: string;
    errors: string[];
  }>;
  notes: string[];
}

export function ModelQualityPanel({ report }: { report: AnalysisReport }) {
  return (
    <div className="grid gap-3">
      {report.llmMetrics ? (
        <CurrentReportModelMetrics report={report} />
      ) : (
        <p className="rounded-lg border border-line bg-bg/55 p-3 text-sm text-muted">
          当前报告没有模型调用指标，可能是模型未启用、旧报告，或只运行了规则分析。
        </p>
      )}
      <ModelUsageHistoryPanel />
    </div>
  );
}

function CurrentReportModelMetrics({ report }: { report: AnalysisReport }) {
  const metrics = report.llmMetrics;
  if (!metrics) return null;
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
        <MiniStat label="修复重试" value={metrics.repairAttempted ? "已重试" : "未重试"} />
        <MiniStat label="错误数量" value={`${metrics.errorCount}`} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <MiniStat label="估算输入" value={metrics.estimatedInputTokens ? `${metrics.estimatedInputTokens} tokens` : "未记录"} />
        <MiniStat label="修复策略" value={metrics.skippedRepairReason ? "已跳过" : metrics.repairAttempted ? "已重试" : "未触发"} />
      </div>
      {metrics.skippedRepairReason ? (
        <p className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-xs leading-5 text-warn">{localizeModelError(metrics.skippedRepairReason)}</p>
      ) : null}
      {metrics.errors?.length ? (
        <details className="rounded-lg border border-line/70 bg-bg/55 p-3">
          <summary className="cursor-pointer text-xs font-medium text-info">查看当前报告校验问题</summary>
          <div className="mt-2 grid gap-2">
            {metrics.errors.map((error, index) => (
              <p key={`${index}-${error}`} className="rounded border border-line/70 bg-panel/60 px-2 py-1.5 text-xs leading-5 text-muted">
                {localizeModelError(error)}
              </p>
            ))}
          </div>
        </details>
      ) : null}
      <p className="rounded-lg border border-line/70 bg-bg/55 p-3 text-xs leading-5 text-muted">
        {metrics.provider} / {metrics.model} / temperature {metrics.temperature}。规则引擎负责边界，模型负责结构化研判；所有模型输出仍由后端校验，不通过时不会作为有效建议展示。
      </p>
    </div>
  );
}

function ModelUsageHistoryPanel() {
  const [summary, setSummary] = useState<ModelUsageSummary | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetchApiJson<ModelUsageSummary>("/api/model-usage?windowDays=30&limit=120", { cache: "no-store", signal: controller.signal })
      .then((json) => {
        if (!json.data) throw new Error(json.error?.message ?? "模型调用统计读取失败");
        setSummary(json.data);
        setStatus("ready");
      })
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? localizeModelError(loadError.message) : localizeModelError(String(loadError)));
        setStatus("failed");
      });
    return () => controller.abort();
  }, []);

  if (status === "loading") {
    return <p className="rounded-lg border border-line bg-bg/55 p-3 text-sm text-muted">正在读取最近 30 天模型调用统计...</p>;
  }
  if (status === "failed" || !summary) {
    return <p className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">模型调用统计读取失败：{error || "未知错误"}</p>;
  }

  return (
    <div className="rounded-lg border border-line bg-bg/55 p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium">历史调用成本与质量</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            最近 {summary.windowDays} 天的主线报告与选股 Agent 调用统计。这里展示的是历史留痕，不等于当前报告全部失效；真正阻断当前建议的问题会在当前报告校验区单独显示。
          </p>
        </div>
        <span className="rounded border border-info/30 bg-info/10 px-2 py-1 text-xs text-info">{summary.callCount} 次调用</span>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <MiniStat label="主线 / Agent" value={`${summary.analysisCallCount} / ${summary.selectionAgentCallCount}`} />
        <MiniStat label="成功 / 拦截" value={`${summary.successCount} / ${summary.failedOrRejectedCount}`} />
        <MiniStat label="输入 Token" value={formatToken(summary.totalEstimatedInputTokens)} />
        <MiniStat label="官方 Token" value={formatToken(summary.totalReportedTokens)} />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <MiniStat label="平均耗时" value={summary.avgElapsedMs === null ? "--" : `${summary.avgElapsedMs} ms`} />
        <MiniStat label="最长耗时" value={summary.maxElapsedMs === null ? "--" : `${summary.maxElapsedMs} ms`} />
        <MiniStat label="修复/重试" value={`${summary.repairOrRetryCount} 次`} />
        <MiniStat label="错误数量" value={`${summary.errorCount}`} />
      </div>
      {summary.notes.length ? (
        <div className="mt-3 grid gap-2">
          {summary.notes.map((note) => (
            <p key={note} className="rounded border border-warn/20 bg-warn/10 px-2 py-1.5 text-xs leading-5 text-warn">
              {note}
            </p>
          ))}
        </div>
      ) : null}
      {summary.errorCategories.length ? (
        <details className="mt-3 rounded-lg border border-down/20 bg-down/[0.06] p-3" open>
          <summary className="cursor-pointer text-xs font-medium text-down">历史问题分布</summary>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {summary.errorCategories.slice(0, 6).map((category) => (
              <div key={category.key} className="rounded border border-line/70 bg-bg/60 px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium">{category.label}</p>
                  <span className="rounded border border-down/25 bg-down/10 px-1.5 py-0.5 font-mono text-[10px] text-down">{category.count}</span>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-muted">{category.mitigation}</p>
                {category.sampleMessages.length ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] text-info">查看中文样本</summary>
                    <div className="mt-1 grid gap-1">
                      {category.sampleMessages.map((message) => (
                        <p key={message} className="rounded border border-line/70 bg-panel/50 px-2 py-1 text-[11px] leading-4 text-muted">
                          {message}
                        </p>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
      <details className="mt-3 rounded-lg border border-line/70 bg-panel/55 p-3">
        <summary className="cursor-pointer text-xs font-medium text-info">最近调用明细</summary>
        <div className="mt-3 grid gap-2">
          {summary.recentCalls.length ? summary.recentCalls.map((call) => (
            <div key={`${call.source}-${call.id}`} className="rounded border border-line/70 bg-bg/60 px-2 py-1.5">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <p className="text-xs font-medium">{call.label}</p>
                <span className={`w-fit rounded border px-1.5 py-0.5 text-[10px] ${statusToneClass(call.status)}`}>{formatAnyStatus(call.status)}</span>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-muted">
                {formatDateTime(call.createdAt)} / {call.provider ?? "未记录"} / {call.model ?? "未记录"} / 输入 {formatToken(call.estimatedInputTokens)} / 耗时 {call.elapsedMs ? `${call.elapsedMs}ms` : "--"} / 请求 {call.requestCount ?? 1} 次
              </p>
              {call.skippedOrDisabledReason ? <p className="mt-1 text-[11px] leading-4 text-warn">{call.skippedOrDisabledReason}</p> : null}
            </div>
          )) : <p className="text-xs text-muted">暂无调用明细。</p>}
        </div>
      </details>
    </div>
  );
}

function formatToken(value: number | null | undefined) {
  if (value === null || value === undefined) return "未记录";
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return `${value}`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatAnyStatus(status: string) {
  if (status === "success") return "成功";
  if (status === "failed") return "失败";
  if (status === "rejected") return "校验拦截";
  if (status === "disabled") return "关闭";
  if (status === "skipped") return "跳过";
  return status;
}

function statusToneClass(status: string) {
  if (status === "success") return "border-up/30 bg-up/10 text-up";
  if (status === "failed" || status === "rejected") return "border-down/30 bg-down/10 text-down";
  if (status === "disabled" || status === "skipped") return "border-line bg-bg/70 text-muted";
  return "border-info/30 bg-info/10 text-info";
}
