"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, Database, ShieldAlert } from "lucide-react";
import type { AnalysisReport, DataSourceTrace } from "@/lib/types";
import { isCriticalDecisionDatasetFailure, normalizeDataSourceWarningDetails } from "@/lib/dataQuality/warningSeverity";

type DataTone = "up" | "info" | "warn" | "risk" | "muted";

export function ReportDataHealthBanner({
  report,
  compact = false
}: {
  report: Pick<AnalysisReport, "createdAt" | "factPackage" | "dataSourceStatus"> | null;
  compact?: boolean;
}) {
  if (!report) return null;
  const source = report.dataSourceStatus ?? report.factPackage.dataSource;
  const traces = source.traces ?? report.factPackage.dataSource.traces ?? [];
  const warningDetails = normalizeDataSourceWarningDetails(source.warningDetails ?? report.factPackage.dataSource.warningDetails ?? []);
  const warnings = source.warnings ?? [];
  const summary = buildCurrentReportHealth(source.status, warnings, traces, warningDetails);
  const Icon = summary.tone === "up" ? CheckCircle2 : summary.tone === "risk" ? ShieldAlert : summary.tone === "warn" ? AlertTriangle : Database;

  return (
    <section className={`rounded-2xl border ${tonePanel(summary.tone)} ${compact ? "p-3" : "p-4"} shadow-[0_18px_70px_rgba(2,6,23,0.24)]`}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-current/25 bg-slate-950/35">
            <Icon size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={`${compact ? "text-sm" : "text-base"} font-semibold`}>{summary.title}</h3>
              <span className="rounded-lg border border-current/20 bg-slate-950/25 px-2 py-1 text-[11px]">{formatDataStatus(source.status)}</span>
              {summary.degradationLabel ? <span className="rounded-lg border border-current/20 bg-slate-950/25 px-2 py-1 text-[11px]">{summary.degradationLabel}</span> : null}
            </div>
            <p className={`mt-1 ${compact ? "text-xs" : "text-sm"} leading-6 opacity-90`}>{summary.message}</p>
            {!compact ? <p className="mt-1 text-xs opacity-75">{summary.actionHint}</p> : null}
          </div>
        </div>
        <div className="grid min-w-[280px] grid-cols-2 gap-2 text-xs sm:grid-cols-5 xl:max-w-[620px]">
          <HealthMiniStat label="警告" value={`${warnings.length}`} tone={warnings.length ? "warn" : "up"} />
          <HealthMiniStat label="主源" value={`${summary.primaryCount}`} tone={summary.primaryCount ? "up" : "muted"} />
          <HealthMiniStat label="兜底" value={`${summary.fallbackCount}`} tone={summary.fallbackCount ? "info" : "muted"} />
          <HealthMiniStat label="缺失" value={`${summary.missingCount}`} tone={summary.missingCount ? "risk" : "up"} />
          <HealthMiniStat label="最近抓取" value={formatDateTime(summary.latestFetchedAt ?? report.factPackage.timestamp ?? report.createdAt)} tone="info" />
        </div>
      </div>

      <details className="group mt-3 rounded-xl border border-current/12 bg-slate-950/22">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs opacity-90">
          <span>{summary.detailTitle}</span>
          <ChevronDown className="transition-transform group-open:rotate-180" size={16} />
        </summary>
        <div className="grid gap-3 border-t border-current/10 p-3 lg:grid-cols-[0.9fr_1.1fr]">
          <CurrentWarningDigest warnings={warnings} details={warningDetails} />
          <div className="grid gap-3">
            <CriticalDomainDigest traces={traces} details={warningDetails} />
            <CurrentTraceDigest traces={traces} />
          </div>
        </div>
      </details>
    </section>
  );
}

function CriticalDomainDigest({
  traces,
  details
}: {
  traces: DataSourceTrace[];
  details: NonNullable<AnalysisReport["factPackage"]["dataSource"]["warningDetails"]>;
}) {
  const rows = buildDomainHealthRows(traces, details);
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-3">
      <p className="text-sm font-semibold text-slate-100">关键域可用性</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <div key={row.scope} className={`rounded-lg border p-2 ${miniTone(row.tone)}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold">{row.label}</p>
              <span className={`rounded border px-1.5 py-0.5 text-[10px] ${toneBadge(row.tone)}`}>{row.status}</span>
            </div>
            <p className="mt-1 text-[11px] leading-4 opacity-80">{row.message}</p>
            <p className="mt-1 text-[11px] opacity-60">最近：{formatDateTime(row.latestFetchedAt)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildDomainHealthRows(
  traces: DataSourceTrace[],
  details: NonNullable<AnalysisReport["factPackage"]["dataSource"]["warningDetails"]>
) {
  const scopes: Array<{ scope: DataSourceTrace["scope"]; label: string; required: string[] }> = [
    { scope: "market", label: "大盘/情绪", required: ["breadth", "limit", "index", "market"] },
    { scope: "sector", label: "板块/主线", required: ["sector", "constituent", "fund", "stage"] },
    { scope: "stock", label: "候选股行情", required: ["quote", "kline", "technical", "fund"] },
    { scope: "company", label: "公司认知", required: ["profile", "financial", "shareholder", "business"] },
    { scope: "calendar", label: "交易日历", required: ["calendar", "trade"] },
    { scope: "model", label: "大模型/Agent", required: ["llm", "model", "agent"] }
  ];
  return scopes.map((scope) => {
    const scopeTraces = traces.filter((trace) => trace.scope === scope.scope);
    const scopeWarnings = details.filter((detail) => detail.scope === scope.scope);
    const missing = scopeTraces.filter((trace) => trace.quality === "missing").length;
    const approximate = scopeTraces.filter((trace) => trace.quality === "approximate").length;
    const fallback = scopeTraces.filter((trace) => trace.quality === "fallback").length;
    const primary = scopeTraces.filter((trace) => trace.quality === "primary" || trace.quality === "derived").length;
    const risk = scopeWarnings.some((detail) => detail.severity === "risk");
    const matchedRequired = scope.required.filter((key) => scopeTraces.some((trace) => trace.field.toLowerCase().includes(key))).length;
    const latestFetchedAt = scopeTraces.map((trace) => trace.fetchedAt).filter(Boolean).sort().at(-1);
    const tone: DataTone = risk || missing > 0
      ? "risk"
      : approximate > 0 || scopeWarnings.length > 0
        ? "warn"
        : fallback > 0
          ? "info"
          : primary > 0
            ? "up"
            : "muted";
    const status = tone === "up" ? "可用" : tone === "info" ? "补源" : tone === "warn" ? "降级" : tone === "risk" ? "风险" : "未覆盖";
    const message = scopeTraces.length
      ? `${primary}项主源/派生，${fallback}项兜底，${approximate}项近似，${missing}项缺失；覆盖关键线索 ${matchedRequired}/${scope.required.length}。`
      : "本期没有该域字段级留痕，若相关结论出现，应回看报告证据链。";
    return { ...scope, tone, status, message, latestFetchedAt };
  });
}

function buildCurrentReportHealth(
  status: AnalysisReport["factPackage"]["dataSource"]["status"],
  warnings: string[],
  traces: DataSourceTrace[],
  details: NonNullable<AnalysisReport["factPackage"]["dataSource"]["warningDetails"]>
) {
  const primaryCount = traces.filter((trace) => trace.quality === "primary" || trace.quality === "derived").length;
  const fallbackCount = traces.filter((trace) => trace.quality === "fallback").length;
  const approximateCount = traces.filter((trace) => trace.quality === "approximate").length;
  const missingCount = traces.filter((trace) => trace.quality === "missing").length;
  const riskCount = details.filter((item) => item.severity === "risk").length + warnings.filter(isRiskWarning).length;
  const latestFetchedAt = traces.map((trace) => trace.fetchedAt).filter(Boolean).sort().at(-1);
  const providerCount = new Set(traces.map((trace) => trace.provider).filter(Boolean)).size;
  const hasDegradation = status !== "success" || warnings.length > 0 || fallbackCount > 0 || approximateCount > 0 || missingCount > 0;
  const softOnly = status === "partial" && missingCount === 0 && riskCount === 0 && (fallbackCount > 0 || approximateCount > 0 || warnings.length > 0);
  const tone: DataTone =
    status === "failed" || status === "empty" || missingCount > 0 || riskCount > 0
      ? "risk"
      : softOnly || fallbackCount > 0
        ? "info"
        : status === "partial" || approximateCount > 0 || warnings.length > 0
          ? "warn"
          : "up";
  const title =
    tone === "up"
      ? "当前报告数据健康"
      : tone === "info"
        ? "当前报告存在软补充项"
        : tone === "warn"
          ? "当前报告需要降级解读"
          : "当前报告存在数据风险";
  const message =
    tone === "up"
      ? `本期报告有 ${traces.length} 条字段级来源留痕，未发现明显缺失或接口风险。`
      : tone === "info"
        ? `本期没有字段级硬缺失；有 ${fallbackCount} 项由备用来源补齐、${approximateCount} 项板块近似映射，属于软补充项。`
        : tone === "warn"
          ? `本期报告存在 ${warnings.length} 条数据提示，部分指标可能来自近似映射、时段降级或非主源。`
          : `本期报告存在缺失、接口失败或高风险提示，涉及买点、主线或候选股判断时必须看证据链。`;
  const actionHint =
    tone === "up"
      ? "可以把规则结论作为当前报告基准，同时仍保留仓位和时段约束。"
      : tone === "info"
        ? "这不等于候选股行情缺失；主要需要复核近似板块映射和备用来源的一致性。"
        : tone === "warn"
          ? "建议展开查看影响范围；若影响大盘宽度、涨跌停池、候选股行情，应重跑分析或刷新快照。"
          : "不要用空数据生成有效买入建议；先补齐失败字段或等待数据源恢复。";
  return {
    tone,
    title,
    message,
    actionHint,
    primaryCount,
    fallbackCount,
    approximateCount,
    missingCount,
    providerCount,
    latestFetchedAt,
    degradationLabel: hasDegradation
      ? tone === "info"
        ? "软补充留痕"
        : tone === "warn"
          ? "需要复核"
          : "需要补数"
      : "",
    detailTitle: `展开来源证据：${providerCount || 0} 个来源 / ${traces.length} 条留痕 / ${warnings.length} 条提示`
  };
}

function CurrentWarningDigest({
  warnings,
  details
}: {
  warnings: string[];
  details: NonNullable<AnalysisReport["factPackage"]["dataSource"]["warningDetails"]>;
}) {
  const visibleDetails = details.slice(0, 6);
  const visibleWarnings = warnings.slice(0, 6);
  if (!visibleDetails.length && !visibleWarnings.length) {
    return (
      <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">
        本期没有数据源警告。若仍看到局部价格不同步，优先检查该股票悬浮卡里的行情时间与快照时间。
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-3">
      <p className="text-sm font-semibold text-slate-100">影响范围</p>
      <div className="mt-3 grid gap-2">
        {visibleDetails.map((item, index) => (
          <div key={`${item.message}-${index}`} className={`rounded-lg border p-2 ${warningTonePanel(item.severity)}`}>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded border border-current/20 bg-slate-950/25 px-2 py-0.5">{scopeLabel(item.scope)}</span>
              <span className="rounded border border-current/20 bg-slate-950/25 px-2 py-0.5">{severityLabel(item.severity)}</span>
            </div>
            <p className="mt-2 text-xs leading-5">{item.message}</p>
            <p className="mt-1 text-[11px] leading-5 opacity-75">{item.impact} / {item.action}</p>
          </div>
        ))}
        {!visibleDetails.length ? visibleWarnings.map((warning, index) => (
          <p key={`${warning}-${index}`} className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-2 text-xs leading-5 text-amber-100">{warning}</p>
        )) : null}
      </div>
    </div>
  );
}

function CurrentTraceDigest({ traces }: { traces: DataSourceTrace[] }) {
  const rows = summarizeTraces(traces);
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-3 text-sm text-slate-400">
        本期报告尚未写入字段级来源留痕。下一次完整分析后会展示真实来源、字段覆盖、时效和质量。
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-3">
      <p className="text-sm font-semibold text-slate-100">真实来源覆盖</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {rows.slice(0, 8).map((row) => (
          <div key={row.provider} className="rounded-lg border border-slate-800 bg-slate-900/55 p-2">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-semibold text-slate-100" title={row.providerName}>{row.providerName}</p>
              <span className={`rounded border px-2 py-0.5 text-[11px] ${toneBadge(row.tone)}`}>{row.total}项</span>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[11px]">
              <TraceMini label="主" value={row.primary} tone={row.primary ? "up" : "muted"} />
              <TraceMini label="补" value={row.fallback} tone={row.fallback ? "info" : "muted"} />
              <TraceMini label="近" value={row.approximate} tone={row.approximate ? "warn" : "muted"} />
              <TraceMini label="缺" value={row.missing} tone={row.missing ? "risk" : "muted"} />
            </div>
            <p className="mt-2 line-clamp-1 text-[11px] text-slate-500" title={row.fields.join(" / ")}>
              {row.fields.slice(0, 4).join(" / ") || "暂无字段摘要"}
            </p>
            <p className="mt-1 text-[11px] text-slate-600">最近：{formatDateTime(row.latestFetchedAt)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function summarizeTraces(traces: DataSourceTrace[]) {
  const map = new Map<string, {
    provider: string;
    providerName: string;
    total: number;
    primary: number;
    fallback: number;
    approximate: number;
    missing: number;
    fields: string[];
    latestFetchedAt?: string;
    tone: DataTone;
  }>();
  for (const trace of traces) {
    const row = map.get(trace.provider) ?? {
      provider: trace.provider,
      providerName: trace.providerName,
      total: 0,
      primary: 0,
      fallback: 0,
      approximate: 0,
      missing: 0,
      fields: [],
      latestFetchedAt: undefined,
      tone: "muted" as DataTone
    };
    row.total += 1;
    if (trace.quality === "primary" || trace.quality === "derived") row.primary += 1;
    if (trace.quality === "fallback") row.fallback += 1;
    if (trace.quality === "approximate") row.approximate += 1;
    if (trace.quality === "missing") row.missing += 1;
    if (!row.fields.includes(trace.field)) row.fields.push(trace.field);
    row.latestFetchedAt = maxIso(row.latestFetchedAt, trace.fetchedAt);
    row.tone = row.missing > 0 ? "risk" : row.approximate > 0 ? "warn" : row.fallback > 0 ? "info" : row.primary > 0 ? "up" : "muted";
    map.set(trace.provider, row);
  }
  return Array.from(map.values()).sort((left, right) => toneWeight(right.tone) - toneWeight(left.tone) || right.total - left.total);
}

function HealthMiniStat({ label, value, tone }: { label: string; value: string; tone: DataTone }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${miniTone(tone)}`}>
      <p className="opacity-60">{label}</p>
      <p className="mt-1 truncate font-mono text-[11px] opacity-95">{value}</p>
    </div>
  );
}

function TraceMini({ label, value, tone }: { label: string; value: number; tone: DataTone }) {
  return (
    <div className={`rounded border px-1.5 py-1 ${miniTone(tone)}`}>
      <p className="opacity-65">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function isRiskWarning(message: string) {
  if (isCriticalDecisionDatasetFailure(message)) return true;
  if (/接口请求失败|fetch failed|timeout|超时|网络|解析错误|HTTP/i.test(message)) return false;
  return /失败|缺失|空数据|未取得|未返回|error|failed/i.test(message);
}

function formatDataStatus(status: AnalysisReport["factPackage"]["dataSource"]["status"]) {
  if (status === "success") return "成功";
  if (status === "partial") return "部分可用";
  if (status === "empty") return "空数据";
  return "失败";
}

function scopeLabel(scope: string) {
  const labels: Record<string, string> = {
    market: "大盘",
    sector: "板块",
    stock: "个股",
    company: "公司",
    calendar: "日历",
    model: "模型",
    system: "系统"
  };
  return labels[scope] ?? scope;
}

function severityLabel(severity: string) {
  if (severity === "risk") return "风险";
  if (severity === "warning") return "警告";
  return "提示";
}

function toneWeight(tone: DataTone) {
  if (tone === "risk") return 4;
  if (tone === "warn") return 3;
  if (tone === "info") return 2;
  if (tone === "up") return 1;
  return 0;
}

function tonePanel(tone: DataTone) {
  if (tone === "up") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  if (tone === "info") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  if (tone === "warn") return "border-amber-300/30 bg-amber-300/12 text-amber-100";
  if (tone === "risk") return "border-rose-300/30 bg-rose-300/12 text-rose-100";
  return "border-slate-800 bg-slate-950/58 text-slate-300";
}

function warningTonePanel(severity: string) {
  if (severity === "risk") return "border-rose-400/25 bg-rose-400/10 text-rose-100";
  if (severity === "warning") return "border-amber-400/25 bg-amber-400/10 text-amber-100";
  return "border-cyan-400/25 bg-cyan-400/10 text-cyan-100";
}

function toneBadge(tone: DataTone) {
  if (tone === "up") return "border-emerald-400/35 bg-emerald-400/10 text-emerald-200";
  if (tone === "info") return "border-cyan-400/35 bg-cyan-400/10 text-cyan-200";
  if (tone === "warn") return "border-amber-400/35 bg-amber-400/10 text-amber-200";
  if (tone === "risk") return "border-rose-400/35 bg-rose-400/10 text-rose-200";
  return "border-slate-700 bg-slate-900 text-slate-300";
}

function miniTone(tone: DataTone) {
  if (tone === "up") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
  if (tone === "info") return "border-cyan-400/20 bg-cyan-400/10 text-cyan-100";
  if (tone === "warn") return "border-amber-400/20 bg-amber-400/10 text-amber-100";
  if (tone === "risk") return "border-rose-400/20 bg-rose-400/10 text-rose-100";
  return "border-current/15 bg-slate-950/30 text-slate-300";
}

function maxIso(left: string | undefined, right: string | undefined) {
  if (!right) return left;
  if (!left) return right;
  return right > left ? right : left;
}

function formatDateTime(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}
