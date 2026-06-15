"use client";

import type { AnalysisReport } from "@/lib/types";
import { CoreStockInlineList } from "@/components/ResearchStockHover";
import { formatStage, stagePillClass } from "@/components/ResearchMainlineCommon";

export function MainlinePulseStrip({ report }: { report: AnalysisReport }) {
  const sectors = report.factPackage.sectors.slice(0, 3);
  if (!sectors.length) return null;
  return (
    <div className="mt-5 grid gap-3 lg:grid-cols-3">
      {sectors.map((sector, index) => (
        <div key={`${sector.code ?? sector.name}-${index}`} className="relative overflow-hidden rounded-lg border border-line bg-bg/55 p-3">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-info/70 to-transparent" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{sector.name}</p>
              <p className="mt-1 text-xs text-muted">{sector.lineQuality} / 置信度{sector.confidence ?? "低"}</p>
              <p className="mt-1 text-[11px] text-muted">{sector.stageTransition ?? "新出现"} / 原始{sector.rawStage ?? sector.stage}</p>
              <p className="mt-1 text-[11px] text-muted">核心{sector.coreContinuity?.state ?? "待观察"} / 延续{sector.coreContinuity?.retained.length ?? 0}只</p>
              {(sector.sourceNames?.length ?? 0) > 1 ? <p className="mt-1 line-clamp-1 text-[11px] text-muted">来源 {sector.sourceNames?.join(" / ")}</p> : null}
            </div>
            <span className={`rounded border px-2 py-1 text-xs ${stagePillClass(sector.stage)}`}>{formatStage(sector.stage)}</span>
          </div>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-info shadow-[0_0_18px_rgba(56,189,248,0.45)]" style={{ width: `${Math.max(4, Math.min(100, sector.score))}%` }} />
            </div>
            <span className="font-mono text-xl font-semibold text-info">{sector.score.toFixed(0)}</span>
          </div>
          <p className="mt-3 line-clamp-1 text-xs text-muted">
            核心：<CoreStockInlineList stocks={sector.coreStocks?.slice(0, 3) ?? []} />
          </p>
        </div>
      ))}
    </div>
  );
}
