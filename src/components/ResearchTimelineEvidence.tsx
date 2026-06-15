"use client";

import { Clock3, GitBranch, Layers3 } from "lucide-react";
import type { AnalysisReport } from "@/lib/types";
import { StockMention } from "@/components/ResearchStockHover";
import { formatMarketState, formatPctDisplay, formatShortDate, formatSignedPctDisplay, formatStage, marketStateFill, marketStateTextClass, SectionTitle, stagePillClass, timelineTrendClass } from "@/components/ResearchMarketCommon";

export function TimelineEvidence({ report }: { report: AnalysisReport }) {
  const context = report.factPackage.marketContext;
  if (!context) return null;
  return (
    <div className="mt-5 rounded-lg border border-line bg-panel/70 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <SectionTitle icon={GitBranch} title="时间链证据" meta={`最近 ${context.timeline.length} 次报告 / 大盘${context.marketTrend} / 宽度${context.breadthTrend}`} />
        <div className="flex flex-wrap gap-2">
          <span className={`w-fit rounded border px-2 py-1 text-xs ${timelineTrendClass(context.marketTrend)}`}>大盘{context.marketTrend}</span>
          <span className={`w-fit rounded border px-2 py-1 text-xs ${timelineTrendClass(context.breadthTrend)}`}>
            宽度{context.breadthTrend}{context.breadthDeltaPct !== undefined ? ` ${formatSignedPctDisplay(context.breadthDeltaPct)}` : ""}
          </span>
        </div>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <div className="rounded-lg border border-line/70 bg-bg/50 p-3">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Clock3 size={15} className="text-info" />
            大盘连续性
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {context.timeline.map((point, index) => (
              <div key={`${point.reportId}-${point.createdAt}`} className="relative rounded-lg border border-line bg-panel/70 p-3">
                {index > 0 ? <div className="absolute -left-2 top-1/2 hidden h-px w-2 bg-line md:block" /> : null}
                <p className="text-[11px] text-muted">{formatShortDate(point.createdAt)}</p>
                <p className={`mt-2 text-sm font-semibold ${marketStateTextClass(point.marketState)}`}>{formatMarketState(point.marketState)}</p>
                <div className="mt-2 h-1.5 rounded-full bg-line">
                  <div className={`h-full rounded-full ${marketStateFill(point.marketState)}`} style={{ width: `${Math.max(4, Math.min(100, point.score))}%` }} />
                </div>
                <p className="mt-2 text-xs text-muted">{point.tradeMode} / {point.sentimentCycle} / {point.score}</p>
                <p className="mt-1 text-[11px] text-muted">
                  宽度 {formatPctDisplay(point.breadthUpPct) ?? "缺失"} / 中位 {formatSignedPctDisplay(point.breadthMedianChangePct) ?? "缺失"}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-line/70 bg-bg/50 p-3">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Layers3 size={15} className="text-info" />
            主线迁移与核心股
          </div>
          <div className="space-y-3">
            {context.mainlines.slice(0, 3).map((line) => (
              <div key={line.normalizedName} className="rounded-lg border border-line bg-panel/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{line.name}</p>
                    <p className="mt-1 text-xs text-muted">阶段{line.trend} / 当前{line.currentStage}</p>
                  </div>
                  <span className={`rounded border px-2 py-1 text-xs ${timelineTrendClass(line.trend)}`}>{line.trend}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {line.stagePath.map((item, index) => (
                    <div key={`${line.normalizedName}-${item.reportId}-${index}`} className="flex items-center gap-1.5">
                      {index > 0 ? <span className="text-muted">→</span> : null}
                      <span className={`rounded border px-2 py-1 text-[11px] ${stagePillClass(item.stage)}`}>
                        {formatShortDate(item.createdAt)} {item.stage}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <CoreChange label="延续" items={line.coreStockChange.retained} tone="up" />
                  <CoreChange label="新出现" items={line.coreStockChange.appeared} tone="info" />
                  <CoreChange label="退出" items={line.coreStockChange.disappeared} tone="warn" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CoreChange({ label, items, tone }: { label: string; items: string[]; tone: "up" | "info" | "warn" }) {
  const cls = tone === "up" ? "border-up/30 bg-up/10 text-up" : tone === "warn" ? "border-warn/30 bg-warn/10 text-warn" : "border-info/30 bg-info/10 text-info";
  return (
    <div className={`rounded-lg border p-2 text-xs ${cls}`}>
      <p className="font-medium">{label}</p>
      <p className="mt-1 leading-5">
        {items.length
          ? items.slice(0, 4).map((name, index) => (
            <span key={`${name}-${index}`}>
              {index > 0 ? "、" : ""}
              <StockMention name={name} />
            </span>
          ))
          : "无"}
      </p>
    </div>
  );
}
