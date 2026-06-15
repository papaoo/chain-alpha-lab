"use client";

import type * as React from "react";
import type { AnalysisReport, Fact, StockCandidate } from "@/lib/types";
import { formatFactId, formatTraceField, formatTraceQuality, localizeText, statusFill } from "@/components/ResearchCompanyFormatters";

export function SourceTraceChips({ traces }: { traces: NonNullable<StockCandidate["sourceTraces"]> }) {
  if (!traces.length) return null;
  const tencent = traces.filter((item) => item.provider === "tencent_zixuangu").length;
  const eastmoney = traces.filter((item) => item.provider === "eastmoney_public").length;
  const tushare = traces.filter((item) => item.provider === "tushare").length;
  const fallback = traces.filter((item) => item.quality === "fallback").length;
  const approximate = traces.filter((item) => item.quality === "approximate").length;
  const missing = traces.filter((item) => item.quality === "missing").length;
  const title = traces.map((item) => `${formatTraceField(item.field)}：${item.providerName} / ${formatTraceQuality(item.quality)}`).join("\n");
  const chips = [
    ["腾讯", tencent, "border-up/35 bg-up/10 text-up"],
    ["东财", eastmoney, "border-info/35 bg-info/10 text-info"],
    ["Tushare", tushare, "border-info/35 bg-info/10 text-info"],
    ["回退", fallback, "border-info/35 bg-info/10 text-info"],
    ["近似", approximate, "border-warn/35 bg-warn/10 text-warn"],
    ["缺失", missing, "border-warn/35 bg-warn/10 text-warn"]
  ].filter(([, count]) => Number(count) > 0);
  return (
    <div className="mt-3 flex flex-wrap gap-1.5" title={title}>
      {chips.map(([label, count, cls]) => (
        <span key={String(label)} className={`rounded border px-2 py-1 text-[11px] ${cls}`}>
          {label} {count}
        </span>
      ))}
    </div>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg/60 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

export function SectionTitle({ icon: Icon, title, meta }: { icon: React.ElementType; title: string; meta: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-bg/70 text-info">
        <Icon size={18} />
      </span>
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted">{meta}</p>
      </div>
    </div>
  );
}

export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line/70 bg-panel/70 p-2">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

export function SignalBadge({ candidate }: { candidate: StockCandidate }) {
  const tier = candidate.signalTier ?? "-";
  const score = candidate.signalScore ?? candidate.strengthScore;
  const label = candidate.signalLabel ?? "待分层";
  const title = candidate.signalReasons?.length ? candidate.signalReasons.join("；") : "旧报告暂无信号分层，重新运行分析后会生成。";
  const cls = tier === "S"
    ? "border-up/50 bg-up/15 text-up"
    : tier === "A"
      ? "border-info/50 bg-info/15 text-info"
      : tier === "B"
        ? "border-[#b779ff]/50 bg-[#b779ff]/15 text-[#d6b5ff]"
        : tier === "C"
          ? "border-warn/50 bg-warn/15 text-warn"
          : "border-line bg-bg/70 text-muted";
  return (
    <span className={`inline-flex min-w-[92px] flex-col rounded border px-2 py-1 text-xs ${cls}`} title={title}>
      <span className="font-semibold">{tier} · {label}</span>
      <span className="mt-0.5 font-mono text-[11px] opacity-80">{score ?? "-"} / 100</span>
    </span>
  );
}

export function StrengthBadge({ score }: { score?: number }) {
  if (score === undefined) return <span className="rounded border border-line px-2 py-1 text-xs text-muted">待刷新</span>;
  const cls = score >= 80
    ? "border-up/40 bg-up/10 text-up"
    : score >= 65
      ? "border-info/40 bg-info/10 text-info"
      : score >= 45
        ? "border-warn/40 bg-warn/10 text-warn"
        : "border-line bg-bg/70 text-muted";
  return <span className={`inline-flex min-w-14 justify-center rounded border px-2 py-1 text-xs font-medium ${cls}`}>{score}</span>;
}

export function PlanLine({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "warn" }) {
  return (
    <div className={`rounded-lg border p-3 text-xs leading-5 ${tone === "warn" ? "border-warn/30 bg-warn/10 text-warn" : "border-line/70 bg-panel/70 text-muted"}`}>
      <p className="mb-1 font-medium text-text">{label}</p>
      {localizeText(value)}
    </div>
  );
}

export function ScoreBreakdownPanel({
  items,
  compact = false
}: {
  items: NonNullable<AnalysisReport["ruleResult"]["market"]["scoreBreakdown"]>;
  compact?: boolean;
}) {
  if (!items.length) return null;
  return (
    <div className={`rounded-lg border border-line bg-bg/55 p-3 ${compact ? "mt-2" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">评分证据链</p>
        <span className="rounded border border-info/30 bg-info/10 px-2 py-0.5 text-[11px] text-info">{items.length} 项</span>
      </div>
      <div className={`mt-3 grid gap-2 ${compact ? "md:grid-cols-2" : "md:grid-cols-3 xl:grid-cols-5"}`}>
        {items.map((item) => {
          const pct = item.maxScore > 0 ? Math.max(0, Math.min(100, (item.score / item.maxScore) * 100)) : item.score < 0 ? 100 : 0;
          const tone = item.confidence === "高" ? "up" : item.confidence === "中" ? "info" : "warn";
          return (
            <div key={item.key} className="rounded-lg border border-line/80 bg-panel/70 p-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium" title={item.label}>{item.label}</span>
                <span className={`rounded border px-1.5 py-0.5 text-[10px] ${tone === "up" ? "border-up/35 text-up" : tone === "info" ? "border-info/35 text-info" : "border-warn/35 text-warn"}`}>
                  {item.confidence}
                </span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-line">
                <div className={`h-full rounded-full ${tone === "up" ? "bg-up" : tone === "info" ? "bg-info" : "bg-warn"}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span className="font-mono text-info">{item.maxScore > 0 ? `${item.score}/${item.maxScore}` : item.score}</span>
                <span className="truncate text-muted" title={item.dataSources.join("；")}>{item.dataSources[0] ?? "来源待写入"}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted" title={item.note}>{localizeText(item.note)}</p>
              {item.missingFields.length || item.downgradeReasons.length ? (
                <p
                  className="mt-1 line-clamp-1 text-[11px] leading-4 text-warn"
                  title={[...item.missingFields, ...item.downgradeReasons].join("；")}
                >
                  {[...item.missingFields, ...item.downgradeReasons][0]}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MiniDiagnostic({ item }: { item: AnalysisReport["ruleResult"]["market"]["diagnostics"][number] }) {
  const pct = item.max ? Math.max(0, Math.min(100, (item.score / item.max) * 100)) : 0;
  return (
    <div className="rounded-lg border border-line/80 bg-panel/70 p-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted">{item.label}</span>
        <span className={item.status === "强" ? "text-up" : item.status === "中" ? "text-info" : "text-warn"}>{item.status}</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-line">
        <div className={`h-full rounded-full ${statusFill(item.status)}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function EvidenceChips({ refs, factMap }: { refs: string[]; factMap: Map<string, Fact> }) {
  if (!refs.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {refs.map((ref, index) => {
        const fact = factMap.get(ref);
        return (
          <span
            key={`${ref}-${index}`}
            className="rounded border border-info/30 bg-info/10 px-2 py-1 text-[11px] text-info"
            title={fact?.text ? localizeText(fact.text) : ref}
          >
            {formatFactId(ref)}
          </span>
        );
      })}
    </div>
  );
}

export function Evidence({ fact }: { fact: Fact }) {
  return (
    <div className="rounded-lg border border-line bg-bg/60 p-3 text-sm">
      <p className="text-[11px] text-info">{formatFactId(fact.factId)}</p>
      <p className="mt-2 leading-6 text-muted">{localizeText(fact.text)}</p>
    </div>
  );
}
