"use client";

import type { AnalysisReport } from "@/lib/types";
import { CoreStockHover } from "@/components/ResearchStockHover";
import { coreStockClass, localizeText, stageColor, statusClass, statusFill } from "@/components/ResearchMarketCommon";

export function MarketDiagnostics({ report }: { report: AnalysisReport }) {
  const diagnostics = report.ruleResult.market.diagnostics ?? [];
  if (!diagnostics.length) return null;
  return (
    <div className="mt-5 space-y-3">
      <div className="grid gap-3 lg:grid-cols-4">
        {diagnostics.map((item) => (
          <DiagnosticTile key={item.label} item={item} />
        ))}
      </div>
      <ScoreBreakdownPanel items={report.ruleResult.market.scoreBreakdown ?? []} />
    </div>
  );
}

export function SectorDiagnostics({ sector }: { sector: AnalysisReport["factPackage"]["sectors"][number] }) {
  const stages = ["观察", "启动", "确认", "加速", "分歧", "退潮"];
  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-6 gap-1">
        {stages.map((stage) => (
          <div
            key={stage}
            className={`h-1.5 rounded-full ${sector.stage === stage ? stageColor(stage) : "bg-line"}`}
            title={stage}
          />
        ))}
      </div>
      <div className="grid gap-2 md:grid-cols-5">
        {(sector.diagnostics ?? []).map((item) => (
          <MiniDiagnostic key={item.label} item={item} />
        ))}
      </div>
      <ScoreBreakdownPanel items={sector.scoreBreakdown ?? []} compact />
      {sector.coreStocks?.length ? (
        <div className="flex flex-wrap gap-2">
          {sector.coreStocks.slice(0, 4).map((stock) => (
            <span
              key={`${stock.marketCode}-${stock.role}`}
              className={`rounded-lg border px-2 py-1 text-[11px] ${coreStockClass(stock.role, stock.limitStatus)}`}
              title={`${stock.name} ${stock.changePct ?? ""}% ${stock.risks.join("、")}`}
            >
              {stock.role} · <CoreStockHover stock={stock} />{stock.limitStatus !== "未涨停" ? ` · ${stock.limitStatus}` : ""}
            </span>
          ))}
        </div>
      ) : null}
      {sector.coreContinuity?.reason ? (
        <div className="rounded-lg border border-line/70 bg-panel/70 p-3 text-xs leading-5 text-muted">
          {localizeText(sector.coreContinuity.reason)}
        </div>
      ) : null}
    </div>
  );
}

function ScoreBreakdownPanel({
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

export function PositionGauge({ report }: { report: AnalysisReport }) {
  const total = report.ruleResult.market.maxTotalPositionPct;
  const single = report.ruleResult.market.maxSingleStockPct;
  const theme = report.factPackage.constraints.maxThemePositionPct;
  return (
    <div className="rounded-lg border border-line bg-bg/60 p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-medium text-text">仓位仪表</span>
        <span className="text-xs text-muted">置信度 {report.ruleResult.market.confidence ?? "低"} / 数据{report.ruleResult.market.dataQuality ?? "部分"}</span>
      </div>
      <GaugeBar label="总仓" value={total} max={100} tone={total > 50 ? "up" : total > 20 ? "info" : "warn"} />
      <GaugeBar label="单票" value={single} max={10} tone={single >= 6 ? "up" : single >= 3 ? "info" : "warn"} />
      <GaugeBar label="单主线" value={theme} max={40} tone={theme >= 25 ? "up" : theme >= 15 ? "info" : "warn"} />
    </div>
  );
}

function DiagnosticTile({ item }: { item: AnalysisReport["ruleResult"]["market"]["diagnostics"][number] }) {
  const pct = item.max ? Math.max(0, Math.min(100, (item.score / item.max) * 100)) : 0;
  return (
    <div className="rounded-lg border border-line bg-bg/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{item.label}</p>
        <span className={`rounded border px-2 py-0.5 text-[11px] ${statusClass(item.status)}`}>{item.status}</span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-line">
        <div className={`h-full rounded-full ${statusFill(item.status)}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="font-mono text-info">{item.score.toFixed(0)} / {item.max}</span>
        <span className="text-muted">{Math.round(pct)}%</span>
      </div>
      <p className="mt-2 min-h-[32px] text-xs leading-4 text-muted">{item.note}</p>
    </div>
  );
}

function MiniDiagnostic({ item }: { item: AnalysisReport["ruleResult"]["market"]["diagnostics"][number] }) {
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

function GaugeBar({ label, value, max, tone }: { label: string; value: number; max: number; tone: "up" | "info" | "warn" }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color = tone === "up" ? "bg-up" : tone === "info" ? "bg-info" : "bg-warn";
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-mono text-text">{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-line">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
