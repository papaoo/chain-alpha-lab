"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, BrainCircuit, Clock3, GitBranch, Network, ShieldCheck } from "lucide-react";
import type { AnalysisReport, MainlineMemoryContext, MarketMemoryContext, SectorCoreStockSnapshot, SectorRuleResult } from "@/lib/types";
import { formatMarketState, formatStage, localizeText, MiniStat, sessionTone, stageColor, StatusPill } from "@/components/ResearchMainlineCommon";
import { StockMention } from "@/components/ResearchStockHover";

type CoreChangeKind = "retained" | "appeared" | "disappeared";
type CoreChangeItem = {
  name: string;
  code?: string;
  role?: string;
  score?: number;
  limitStatus?: string;
  continuityText: string;
  advice: string;
};

export function MainlineHero({ report }: { report: AnalysisReport }) {
  const market = report.ruleResult.market;
  const context = report.factPackage.marketContext;
  const topSectors = report.factPackage.sectors.slice(0, 5);
  return (
    <div className="relative overflow-hidden rounded-lg border border-info/20 bg-[linear-gradient(120deg,rgba(8,13,21,0.96),rgba(15,23,42,0.86)_48%,rgba(56,189,248,0.08))] p-5 shadow-[0_30px_120px_rgba(0,0,0,0.3)]">
      <div className="absolute inset-0 opacity-50">
        <div className="flow-line left-[8%] top-[30%] w-[42%]" />
        <div className="flow-line left-[44%] top-[58%] w-[36%] delay-300" />
        <div className="flow-line left-[26%] top-[78%] w-[55%] delay-700" />
      </div>
      <div className="relative grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill icon={Clock3} label={report.factPackage.session?.phaseLabel ?? "时段待识别"} tone={sessionTone(report.factPackage.session?.phase)} />
            <StatusPill icon={ShieldCheck} label={`大盘${formatMarketState(market.marketState)}`} tone={market.marketState === "tradable" ? "up" : market.marketState === "cautious" ? "warn" : "info"} />
            <StatusPill icon={GitBranch} label={`连续性${context?.marketTrend ?? "无历史"}`} tone={context?.marketTrend === "改善" ? "up" : context?.marketTrend === "转弱" ? "warn" : "info"} />
            <StatusPill icon={Activity} label={`宽度${context?.breadthTrend ?? "无历史"}`} tone={context?.breadthTrend === "改善" ? "up" : context?.breadthTrend === "转弱" ? "warn" : "info"} />
            <StatusPill icon={BrainCircuit} label={report.llmStatus === "success" ? "模型已研判" : "规则优先"} tone={report.llmStatus === "success" ? "up" : "info"} />
          </div>
          <h2 className="mt-5 text-3xl font-semibold leading-tight lg:text-4xl">主线趋势驾驶舱</h2>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-muted">{localizeText(report.summary)}</p>
          {report.factPackage.session ? (
            <p className="mt-3 max-w-3xl rounded-lg border border-line bg-bg/55 p-3 text-xs leading-5 text-muted">
              当前模式：{report.factPackage.session.analysisMode} / 数据基准：{report.factPackage.session.expectedDataBasis}。{report.factPackage.session.dataFreshnessHint}
            </p>
          ) : null}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <MiniStat label="交易模式" value={market.tradeMode} />
            <MiniStat label="情绪周期" value={market.sentimentCycle} />
            <MiniStat label="总仓上限" value={`${market.maxTotalPositionPct}%`} />
          </div>
        </div>
        <div className="rounded-lg border border-line/70 bg-bg/45 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">主线流向地图</p>
              <p className="mt-1 text-xs text-muted">阶段、分数、核心结构同屏扫视</p>
            </div>
            <Network className="text-info" size={20} />
          </div>
          <div className="mt-5 grid gap-3">
            {topSectors.map((sector, index) => (
              <div key={`${sector.code ?? sector.name}-${sector.stage}-${index}`} className="grid grid-cols-[86px_1fr_52px] items-center gap-3">
                <div>
                  <p className="truncate text-sm font-medium">{sector.name}</p>
                  <p className="mt-1 text-[11px] text-muted">{formatStage(sector.stage)}</p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-line">
                  <div className={`h-full rounded-full ${stageColor(sector.stage)}`} style={{ width: `${Math.max(6, Math.min(100, sector.score))}%` }} />
                </div>
                <p className="text-right font-mono text-sm text-info">{sector.score.toFixed(0)}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-2 md:grid-cols-3">
            <CoreChangeStat
              label="核心延续"
              value={context?.mainlines[0]?.coreStockChange.retained.length ? `${context.mainlines[0].coreStockChange.retained.length} 只` : "待观察"}
              kind="retained"
              items={buildCoreChangeItems("retained", report)}
              line={context?.mainlines[0]}
            />
            <CoreChangeStat
              label="新核心"
              value={context?.mainlines[0]?.coreStockChange.appeared.length ? `${context.mainlines[0].coreStockChange.appeared.length} 只` : "无"}
              kind="appeared"
              items={buildCoreChangeItems("appeared", report)}
              line={context?.mainlines[0]}
            />
            <CoreChangeStat
              label="退出核心"
              value={context?.mainlines[0]?.coreStockChange.disappeared.length ? `${context.mainlines[0].coreStockChange.disappeared.length} 只` : "无"}
              kind="disappeared"
              items={buildCoreChangeItems("disappeared", report)}
              line={context?.mainlines[0]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function CoreChangeStat({
  label,
  value,
  kind,
  items,
  line
}: {
  label: string;
  value: string;
  kind: CoreChangeKind;
  items: CoreChangeItem[];
  line?: MainlineMemoryContext;
}) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const show = (target: EventTarget & HTMLElement) => {
    cancelHide();
    const rect = target.getBoundingClientRect();
    const width = 430;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const top = Math.min(rect.bottom + 10, window.innerHeight - 460);
    setPosition({ left, top: Math.max(12, top) });
  };
  const hide = () => {
    cancelHide();
    hideTimer.current = setTimeout(() => setPosition(null), 120);
  };

  return (
    <span className="relative block">
      <button
        className="w-full rounded-lg border border-line/70 bg-panel/70 p-2 text-left transition hover:border-info/45 hover:bg-info/10 focus:border-info/45 focus:outline-none"
        type="button"
        onFocus={(event) => show(event.currentTarget)}
        onBlur={hide}
        onMouseEnter={(event) => show(event.currentTarget)}
        onMouseLeave={hide}
      >
        <p className="text-[11px] text-muted">{label}</p>
        <p className="mt-1 text-sm font-medium">{value}</p>
      </button>
      {position && typeof document !== "undefined" ? createPortal(
        <div
          className="fixed z-50 w-[430px] rounded-xl border border-info/25 bg-[#081019]/95 p-3 text-left shadow-2xl shadow-black/45 backdrop-blur"
          style={{ left: position.left, top: position.top }}
          onMouseEnter={cancelHide}
          onMouseLeave={hide}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-text">{label}</p>
              <p className="mt-1 text-xs text-muted">{line?.name ?? "当前主线"} · {coreChangeSubtitle(kind, items.length)}</p>
            </div>
            <span className={`rounded border px-2 py-1 text-[11px] ${coreChangeTone(kind)}`}>{value}</span>
          </div>

          <div className="mt-3 grid gap-2">
            {items.length ? items.map((item, index) => (
              <div key={`${kind}-${item.name}-${index}`} className="rounded-lg border border-line/70 bg-bg/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      <StockMention name={item.name} code={item.code} className="text-info/95 underline decoration-info/30 decoration-dotted underline-offset-2" />
                    </p>
                    <p className="mt-1 text-[11px] text-muted">{item.continuityText}</p>
                  </div>
                  <span className="shrink-0 rounded border border-line bg-panel/70 px-2 py-1 text-[11px] text-muted">
                    {item.role ?? "核心"}{item.score !== undefined ? ` ${item.score.toFixed(0)}` : ""}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted">{item.advice}</p>
              </div>
            )) : (
              <div className="rounded-lg border border-line/70 bg-bg/60 p-3 text-xs leading-5 text-muted">
                {emptyCoreChangeText(kind)}
              </div>
            )}
          </div>

          <p className="mt-3 text-[11px] leading-5 text-muted">
            说明：核心变化来自最近报告时间链，仅用于判断主线结构延续性；个股买卖仍要服从候选股规则、买点可达性和仓位约束。
          </p>
        </div>
      , document.body) : null}
    </span>
  );
}

function buildCoreChangeItems(kind: CoreChangeKind, report: AnalysisReport): CoreChangeItem[] {
  const context = report.factPackage.marketContext;
  const line = context?.mainlines[0];
  if (!context || !line) return [];
  const names = line.coreStockChange[kind];
  const currentSector = findSectorForLine(report.factPackage.sectors, line.name);
  return names.map((name) => {
    const current = currentSector?.coreStocks.find((stock) => stock.name === name);
    const timelineStock = findLatestTimelineCoreStock(context, line.name, name);
    const stock = current ?? timelineStock;
    return {
      name,
      code: stock?.code,
      role: stock?.role,
      score: stock?.score,
      limitStatus: stock?.limitStatus,
      continuityText: coreContinuityText(kind, name, line, context),
      advice: coreChangeAdvice(kind, line, stock)
    };
  });
}

function findSectorForLine(sectors: SectorRuleResult[], name: string) {
  return sectors.find((sector) => sector.name === name || sector.normalizedName === name || sector.sourceNames?.includes(name)) ?? sectors[0];
}

function findLatestTimelineCoreStock(context: MarketMemoryContext, lineName: string, stockName: string) {
  for (const point of [...context.timeline].reverse()) {
    const sector = point.topSectors.find((item) => item.name === lineName);
    const stock = sector?.coreStocks.find((item) => item.name === stockName);
    if (stock) return stock;
  }
  return undefined;
}

function coreContinuityText(kind: CoreChangeKind, name: string, line: MainlineMemoryContext, context: MarketMemoryContext) {
  const stageCount = line.stagePath.length;
  if (kind === "retained") {
    const count = consecutiveCoreCount(context, line.name, name);
    return `已连续出现在核心结构 ${count} 期；主线时间链 ${stageCount} 期。`;
  }
  if (kind === "appeared") {
    const first = firstSeenCorePoint(context, line.name, name);
    return first ? `本轮新进入核心；首次出现 ${formatShortDate(first.createdAt)}。` : "本轮新进入核心；等待下一期验证延续性。";
  }
  const last = lastSeenCorePoint(context, line.name, name);
  return last ? `上一轮仍在核心；最后出现 ${formatShortDate(last.createdAt)}。` : "已退出当前核心结构；历史出现时间待确认。";
}

function consecutiveCoreCount(context: MarketMemoryContext, lineName: string, stockName: string) {
  let count = 0;
  for (const point of [...context.timeline].reverse()) {
    const sector = point.topSectors.find((item) => item.name === lineName);
    const hasStock = sector?.coreStocks.some((stock) => stock.name === stockName);
    if (!hasStock) break;
    count += 1;
  }
  return Math.max(1, count);
}

function firstSeenCorePoint(context: MarketMemoryContext, lineName: string, stockName: string) {
  return context.timeline.find((point) =>
    point.topSectors.some((sector) => sector.name === lineName && sector.coreStocks.some((stock) => stock.name === stockName))
  );
}

function lastSeenCorePoint(context: MarketMemoryContext, lineName: string, stockName: string) {
  return [...context.timeline].reverse().find((point) =>
    point.topSectors.some((sector) => sector.name === lineName && sector.coreStocks.some((stock) => stock.name === stockName))
  );
}

function coreChangeAdvice(kind: CoreChangeKind, line: MainlineMemoryContext, stock?: Pick<SectorCoreStockSnapshot, "role" | "score" | "limitStatus">) {
  if (kind === "retained") {
    return `延续核心是主线健康度的正证据。当前主线${line.currentStage}，若核心继续承接、资金不转弱，可作为继续观察主线的依据；不等于直接追高买入。`;
  }
  if (kind === "appeared") {
    const roleText = stock?.role ? `当前定位${stock.role}` : "当前定位待确认";
    return `${roleText}。新核心先看下一期是否继续进入核心结构，若只是一日脉冲或后排补涨，不应直接当作稳定龙头。`;
  }
  return "退出核心属于结构降温或换手信号。若退出的是龙头/中军，需要降低该主线确认度；若只是后排退出，重点观察新核心能否接力。";
}

function coreChangeSubtitle(kind: CoreChangeKind, count: number) {
  if (kind === "retained") return count ? "上一期到本期仍在核心" : "缺少连续核心";
  if (kind === "appeared") return count ? "本期新进入核心结构" : "暂无新增核心";
  return count ? "上一期核心本期退出" : "暂无退出核心";
}

function coreChangeTone(kind: CoreChangeKind) {
  if (kind === "retained") return "border-up/35 bg-up/10 text-up";
  if (kind === "appeared") return "border-info/35 bg-info/10 text-info";
  return "border-warn/35 bg-warn/10 text-warn";
}

function emptyCoreChangeText(kind: CoreChangeKind) {
  if (kind === "retained") return "暂未形成延续核心，主线连续性需要下一期继续验证。";
  if (kind === "appeared") return "暂无新核心，说明当前核心结构没有明显新增接力。";
  return "暂无退出核心，核心结构没有出现明确负反馈。";
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
