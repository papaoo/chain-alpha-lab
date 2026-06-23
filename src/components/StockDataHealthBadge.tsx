"use client";

import { cleanDisplayList, cleanDisplayText } from "@/lib/display/text";

type Coverage = {
  quote?: boolean;
  kline?: boolean;
  technical?: boolean;
  fundFlow?: boolean;
  company?: boolean;
};

type StockDataQuality = "complete" | "partial" | "quote_only" | "missing" | string | undefined;
type HealthTone = "up" | "info" | "warn" | "risk" | "muted";

export function StockDataHealthBadge({
  quality,
  qualityLabel,
  actionability,
  coverage,
  fetchedAt,
  quoteUpdatedAt,
  source,
  warnings = [],
  compact = false,
  className = ""
}: {
  quality?: StockDataQuality;
  qualityLabel?: string;
  actionability?: {
    level: "actionable" | "reference_only" | "not_actionable" | string;
    label: string;
    reason: string;
    ageMinutes?: number;
    staleAfterMinutes?: number;
    sessionPhase?: string;
  };
  coverage?: Coverage;
  fetchedAt?: string;
  quoteUpdatedAt?: string;
  source?: string;
  warnings?: string[];
  compact?: boolean;
  className?: string;
}) {
  const cleanWarnings = cleanDisplayList(warnings);
  const cleanActionability = actionability
    ? {
        ...actionability,
        label: cleanDisplayText(actionability.label) ?? actionability.label,
        reason: cleanDisplayText(actionability.reason) ?? actionability.reason
      }
    : undefined;
  const health = buildStockDataHealth({
    quality,
    actionability: cleanActionability,
    coverage,
    fetchedAt,
    quoteUpdatedAt,
    warnings: cleanWarnings
  });
  const covered = coverage ? Object.values(coverage).filter(Boolean).length : null;
  const total = coverage ? Object.keys(coverage).length : null;
  const displayQualityLabel = cleanDisplayText(qualityLabel) ?? qualityLabelFromQuality(quality);
  const displaySource = cleanDisplayText(source);

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs leading-5 ${toneClass(health.tone)} ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{health.label}</span>
        <span className="font-mono text-[11px] opacity-80">{health.timeLabel}</span>
      </div>
      {!compact ? <p className="mt-1 opacity-90">{health.note}</p> : null}
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded border border-current/20 bg-slate-950/20 px-1.5 py-0.5">
          {displayQualityLabel}
        </span>
        {covered !== null && total !== null ? (
          <span className="rounded border border-current/20 bg-slate-950/20 px-1.5 py-0.5">
            覆盖 {covered}/{total}
          </span>
        ) : null}
        {quoteUpdatedAt ? (
          <span className="rounded border border-current/20 bg-slate-950/20 px-1.5 py-0.5">
            报价 {formatShortTime(quoteUpdatedAt)}
          </span>
        ) : null}
        {displaySource ? (
          <span className="max-w-[220px] truncate rounded border border-current/20 bg-slate-950/20 px-1.5 py-0.5" title={displaySource}>
            {shortSource(displaySource)}
          </span>
        ) : null}
        {cleanWarnings.length ? (
          <span className="rounded border border-current/20 bg-slate-950/20 px-1.5 py-0.5">
            警告 {cleanWarnings.length}
          </span>
        ) : null}
      </div>
      {cleanWarnings.length && !compact ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] opacity-90">查看数据警告</summary>
          <div className="mt-1 grid gap-1">
            {cleanWarnings.slice(0, 4).map((warning, index) => (
              <p key={`${warning}-${index}`} className="rounded border border-current/15 bg-slate-950/20 px-2 py-1 text-[11px] leading-4 opacity-90">
                {warning}
              </p>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function buildStockDataHealth({
  quality,
  actionability,
  coverage,
  fetchedAt,
  quoteUpdatedAt,
  warnings
}: {
  quality?: StockDataQuality;
  actionability?: {
    level: "actionable" | "reference_only" | "not_actionable" | string;
    label: string;
    reason: string;
    ageMinutes?: number;
    staleAfterMinutes?: number;
    sessionPhase?: string;
  };
  coverage?: Coverage;
  fetchedAt?: string;
  quoteUpdatedAt?: string;
  warnings: string[];
}) {
  if (actionability) {
    const tone = actionabilityTone(actionability.level);
    const age = actionability.ageMinutes;
    const timeLabel = age === undefined ? "时间未知" : age <= 0 ? "刚刷新" : `${age} 分钟前`;
    return {
      tone,
      label: actionability.label,
      timeLabel: actionability.sessionPhase ? `${sessionPhaseLabel(actionability.sessionPhase)} / ${timeLabel}` : timeLabel,
      note: actionability.reason
    };
  }

  const basisTime = quoteUpdatedAt ?? fetchedAt;
  const age = ageMinutes(basisTime);
  const hasMissingCoverage = coverage ? Object.values(coverage).some((value) => value === false) : false;
  const hasMissing = quality === "missing" || hasMissingCoverage;
  const hasRiskWarning = warnings.some(isRiskWarning);
  const tone = fallbackTone({ quality, age, hasMissing, hasRiskWarning, warningCount: warnings.length });
  return {
    tone,
    label: healthLabel(tone),
    timeLabel: age === null ? "时间未知" : age <= 0 ? "刚刷新" : `${age} 分钟前`,
    note: healthNote(tone)
  };
}

function actionabilityTone(level: string): HealthTone {
  if (level === "actionable") return "up";
  if (level === "reference_only") return "warn";
  if (level === "not_actionable") return "risk";
  return "muted";
}

function fallbackTone(input: {
  quality?: StockDataQuality;
  age: number | null;
  hasMissing: boolean;
  hasRiskWarning: boolean;
  warningCount: number;
}): HealthTone {
  if (input.quality === "missing" || input.hasRiskWarning) return "risk";
  if (input.age !== null && input.age > 30) return "warn";
  if (input.quality === "quote_only" || input.hasMissing || input.warningCount) return "warn";
  if (input.quality === "partial") return "info";
  if (input.quality === "complete") return "up";
  return "muted";
}

function healthLabel(tone: HealthTone): string {
  if (tone === "up") return "股票快照可用";
  if (tone === "info") return "股票快照部分可用";
  if (tone === "warn") return "股票快照需复核";
  if (tone === "risk") return "股票快照不可直接使用";
  return "股票快照待确认";
}

function healthNote(tone: HealthTone): string {
  if (tone === "up") return "报价、K 线、技术指标和资金字段覆盖较完整，可用于当前页面判断。";
  if (tone === "info") return "部分字段来自兜底来源或覆盖不完整，只适合作为观察证据。";
  if (tone === "warn") return "快照可能过期或字段不完整，用于买点、收益验证前建议先刷新。";
  if (tone === "risk") return "关键行情字段或上游接口失败，不能把这条数据直接转成可执行买入建议。";
  return "字段不足，暂时无法判断快照可靠性。";
}

function isRiskWarning(warning: string) {
  if (/fallback|supplement/i.test(warning)) return false;
  return /fetch failed|timeout|error|failed|missing|empty|stale|invalid|fail|缺失|失败|超时|空数据|未返回|不采用/i.test(warning);
}

function qualityLabelFromQuality(quality?: StockDataQuality) {
  if (quality === "complete") return "完整";
  if (quality === "partial") return "部分";
  if (quality === "quote_only") return "仅报价";
  if (quality === "missing") return "缺失";
  return "质量未知";
}

function ageMinutes(value?: string) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.round((Date.now() - time) / 60_000));
}

function toneClass(tone: HealthTone) {
  if (tone === "up") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (tone === "info") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  if (tone === "warn") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (tone === "risk") return "border-rose-300/25 bg-rose-300/10 text-rose-100";
  return "border-slate-700 bg-slate-900/60 text-slate-300";
}

function shortSource(source: string) {
  if (source.includes("eastmoney") && source.includes("westock")) return "东方财富 + westock";
  if (source.includes("eastmoney")) return "东方财富";
  if (source.includes("westock")) return "westock-data";
  if (source.includes("tushare")) return "Tushare";
  if (source.includes("analysis-report")) return "报告快照";
  return source.length > 24 ? `${source.slice(0, 24)}...` : source;
}

function sessionPhaseLabel(value: string) {
  const labels: Record<string, string> = {
    premarket: "盘前",
    call_auction: "集合竞价",
    morning: "早盘",
    midday_break: "午间休盘",
    afternoon: "午后",
    closing_auction: "尾盘竞价",
    postmarket: "盘后",
    night_research: "夜间复盘",
    non_trading_day: "闭市"
  };
  return labels[value] ?? value;
}

function formatShortTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
