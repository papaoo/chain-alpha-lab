"use client";

import type { AnalysisReport, AppSettings } from "@/lib/types";
import type { CockpitWarning, Tone } from "@/components/StrategyCockpitTypes";
import { EvidencePill, MiniStat } from "@/components/StrategyCockpitPrimitives";
import { formatLlmStatus, llmStatusTone, sentimentBoxClass, toneBadge } from "@/components/StrategyCockpitUtils";

export function DataHealthStrip({
  groups,
  warnings,
  traces
}: {
  groups: Array<{ type: string; tone: Tone; scope: string; items: CockpitWarning[] }>;
  warnings: string[];
  traces: AnalysisReport["factPackage"]["dataSource"]["traces"];
}) {
  const visibleGroups = groups.slice(0, 6);
  if (!warnings.length) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">
          数据源未返回明显警告。当前报告的数据健康状态可以作为正常参考。
        </div>
        <DataSourceTraceDigest traces={traces ?? []} />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-950/58 p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-100">数据源状态细分</p>
            <p className="mt-1 text-xs text-slate-500">按影响类型分组；补源成功是能力提示，接口失败/空数据才是重点风险。</p>
          </div>
          <span className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-400">{warnings.length} 条来源提示</span>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {visibleGroups.map((group) => (
            <div key={`${group.type}-${group.scope}`} className={`rounded-xl border p-3 ${sentimentBoxClass(group.tone)}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{group.type}</p>
                <span className="text-xs opacity-75">{group.scope}</span>
              </div>
              <p className="mt-1 text-xs opacity-80">{group.items.length} 条</p>
              <p className="mt-2 line-clamp-2 text-xs leading-5 opacity-80" title={group.items[0]?.message}>{group.items[0]?.message}</p>
            </div>
          ))}
        </div>
      </div>
      <DataSourceTraceDigest traces={traces ?? []} />
    </div>
  );
}

export function DataSourceTraceDigest({ traces }: { traces: NonNullable<AnalysisReport["factPackage"]["dataSource"]["traces"]> }) {
  const rows = buildTraceDigestRows(traces);
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-950/58 p-3 text-sm text-slate-400">
        当前报告尚未写入字段级来源留痕。下一次完整分析后会展示真实来源、字段覆盖、质量和时效。
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/58 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-100">真实来源覆盖</p>
          <p className="mt-1 text-xs text-slate-500">按字段留痕统计，不把技能名当作最终数据来源。</p>
        </div>
        <span className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-400">{traces.length} 条字段记录</span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {rows.slice(0, 6).map((row) => (
          <div key={row.provider} className="rounded-xl border border-slate-800 bg-slate-900/55 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold text-slate-100" title={row.providerName}>{row.providerName}</p>
              <span className={`rounded-lg border px-2 py-1 text-[11px] ${toneBadge(row.tone)}`}>{row.coverage}项</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-[11px]">
              <EvidencePill label="主源" value={row.primary} tone={row.primary ? "up" : "muted"} />
              <EvidencePill label="补源" value={row.fallback} tone={row.fallback ? "info" : "muted"} />
              <EvidencePill label="降级" value={row.degraded} tone={row.degraded ? "warn" : "muted"} />
            </div>
            <p className="mt-2 line-clamp-1 text-xs text-slate-500" title={row.fields.join("、")}>
              {row.fields.slice(0, 4).join("、") || "暂无字段摘要"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function buildTraceDigestRows(traces: NonNullable<AnalysisReport["factPackage"]["dataSource"]["traces"]>) {
  const map = new Map<string, {
    provider: string;
    providerName: string;
    coverage: number;
    primary: number;
    fallback: number;
    degraded: number;
    fields: string[];
    tone: Tone;
  }>();
  for (const trace of traces) {
    const row = map.get(trace.provider) ?? {
      provider: trace.provider,
      providerName: trace.providerName,
      coverage: 0,
      primary: 0,
      fallback: 0,
      degraded: 0,
      fields: [],
      tone: "muted" as Tone
    };
    row.coverage += 1;
    if (trace.quality === "primary") row.primary += 1;
    if (trace.quality === "fallback") row.fallback += 1;
    if (trace.quality === "approximate" || trace.quality === "missing") row.degraded += 1;
    if (!row.fields.includes(trace.field)) row.fields.push(trace.field);
    row.tone = row.degraded > 0 ? "warn" : row.primary > 0 ? "up" : row.fallback > 0 ? "info" : "muted";
    map.set(trace.provider, row);
  }
  return Array.from(map.values()).sort((left, right) => right.coverage - left.coverage);
}

export function ModelQualityStrip({ report, settings }: { report: AnalysisReport | null; settings: AppSettings | null }) {
  const metrics = report?.llmMetrics;
  if (!report) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-950/58 p-3 text-sm text-slate-400">
        暂无报告，模型调用质量等待下一次分析后展示。
      </div>
    );
  }
  if (!metrics) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-950/58 p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-100">模型调用质量</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              当前报告没有模型调用指标。可能是模型未启用、旧报告、或只运行了规则分析。
            </p>
          </div>
          <span className={`rounded-lg border px-2 py-1 text-xs ${settings?.modelAuditEnabled ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-100" : "border-slate-700 bg-slate-900 text-slate-400"}`}>
            反馈开关 {settings?.modelAuditEnabled ? "开启" : "关闭"}
          </span>
        </div>
      </div>
    );
  }
  const promptTotal = metrics.reportPromptChars + (metrics.repairPromptChars ?? 0);
  const promptTone: Tone = promptTotal >= 120_000 ? "risk" : promptTotal >= 70_000 ? "warn" : "info";
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/58 p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-100">模型调用质量</p>
          <p className="mt-1 text-xs text-slate-500">{metrics.provider} / {metrics.model} / temperature {metrics.temperature}</p>
        </div>
        <span className={`rounded-lg border px-2 py-1 text-xs ${toneBadge(llmStatusTone(metrics.status))}`}>{formatLlmStatus(metrics.status)}</span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <MiniStat label="耗时" value={`${metrics.elapsedMs} ms`} tone={metrics.elapsedMs > 45_000 ? "warn" : "info"} />
        <MiniStat label="请求次数" value={`${metrics.requestCount} 次`} tone={metrics.requestCount > 1 ? "warn" : "muted"} />
        <MiniStat label="Prompt体积" value={`${promptTotal} 字符`} tone={promptTone} />
        <MiniStat label="修复重试" value={metrics.repairAttempted ? "是" : "否"} tone={metrics.repairAttempted ? "warn" : "up"} />
      </div>
      <p className="mt-3 rounded-xl border border-slate-800 bg-slate-900/55 p-2 text-xs leading-5 text-slate-400">
        报告 Prompt {metrics.reportPromptChars} 字符；修复 Prompt {metrics.repairPromptChars ?? 0} 字符；估算输入 {metrics.estimatedInputTokens ?? "未记录"} tokens；错误数量 {metrics.errorCount}；最大输出 {metrics.maxTokens} tokens。
      </p>
      {metrics.skippedRepairReason ? (
        <p className="mt-2 rounded-xl border border-amber-400/25 bg-amber-400/10 p-2 text-xs leading-5 text-amber-100">{metrics.skippedRepairReason}</p>
      ) : null}
      {metrics.errors?.length ? (
        <details className="mt-2 rounded-xl border border-slate-800 bg-slate-900/55 p-2">
          <summary className="cursor-pointer text-xs text-cyan-200">查看校验错误摘要</summary>
          <div className="mt-2 grid gap-1.5">
            {metrics.errors.slice(0, 6).map((error, index) => (
              <p key={`${index}-${error}`} className="rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1.5 text-xs leading-5 text-slate-400">{error}</p>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
