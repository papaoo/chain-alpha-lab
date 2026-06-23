"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, BrainCircuit, Clock3, GitBranch, Network, ShieldCheck } from "lucide-react";
import type { AnalysisReport, MainlineMemoryContext, MarketMemoryContext, SectorCoreStockSnapshot, SectorRuleResult } from "@/lib/types";
import { cleanDisplayText, cleanDisplayList } from "@/lib/display/text";
import { MiniStat, StatusPill, formatMarketState, formatStage, sessionTone, stageColor } from "@/components/ResearchMainlineCommon";
import { StockMention } from "@/components/ResearchStockHover";
import { StockTrackingActionButton } from "@/components/StockTrackingActionButton";

type CoreChangeKind = "retained" | "appeared" | "disappeared";
type CoreChangeItem = {
  name: string;
  code?: string;
  role?: string;
  score?: number;
  limitStatus?: string;
  continuityText: string;
  advice: string;
  stock?: SectorCoreStockSnapshot;
};

export function MainlineHero({ report }: { report: AnalysisReport }) {
  const market = report.ruleResult.market;
  const context = report.factPackage.marketContext;
  const topSectors = report.factPackage.sectors.slice(0, 5);
  const topLine = context?.mainlines[0];

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
            <StatusPill icon={Clock3} label={cleanDisplayText(report.factPackage.session?.phaseLabel) ?? "时段待确认"} tone={sessionTone(report.factPackage.session?.phase)} />
            <StatusPill icon={ShieldCheck} label={`大盘 ${formatMarketState(market.marketState)}`} tone={market.marketState === "tradable" ? "up" : market.marketState === "cautious" ? "warn" : "info"} />
            <StatusPill icon={GitBranch} label={`连续性 ${cleanDisplayText(context?.marketTrend) ?? "暂无历史"}`} tone={trendTone(context?.marketTrend)} />
            <StatusPill icon={Activity} label={`宽度 ${cleanDisplayText(context?.breadthTrend) ?? "暂无历史"}`} tone={trendTone(context?.breadthTrend)} />
            <StatusPill icon={BrainCircuit} label={report.llmStatus === "success" ? "模型增强" : "规则优先"} tone={report.llmStatus === "success" ? "up" : "info"} />
          </div>
          <h2 className="mt-5 text-3xl font-semibold leading-tight lg:text-4xl">主线趋势驾驶舱</h2>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-muted">{cleanDisplayText(report.summary) ?? report.summary}</p>
          {report.factPackage.session ? (
            <p className="mt-3 max-w-3xl rounded-lg border border-line bg-bg/55 p-3 text-xs leading-5 text-muted">
              分析模式：{cleanDisplayText(report.factPackage.session.analysisMode) ?? report.factPackage.session.analysisMode} / 数据基准：{" "}
              {cleanDisplayText(report.factPackage.session.expectedDataBasis) ?? report.factPackage.session.expectedDataBasis}。{" "}
              {cleanDisplayText(report.factPackage.session.dataFreshnessHint) ?? report.factPackage.session.dataFreshnessHint}
            </p>
          ) : null}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <MiniStat label="交易模式" value={cleanDisplayText(market.tradeMode) ?? market.tradeMode} />
            <MiniStat label="情绪周期" value={cleanDisplayText(market.sentimentCycle) ?? market.sentimentCycle} />
            <MiniStat label="仓位上限" value={`${market.maxTotalPositionPct}%`} />
          </div>
        </div>

        <div className="rounded-lg border border-line/70 bg-bg/45 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">主线流向图</p>
              <p className="mt-1 text-xs text-muted">一屏查看阶段、评分与核心股连续性。</p>
            </div>
            <Network className="text-info" size={20} />
          </div>
          <div className="mt-5 grid gap-3">
            {topSectors.map((sector, index) => (
              <div key={`${sector.code ?? sector.name}-${sector.stage}-${index}`} className="grid grid-cols-[86px_1fr_52px] items-center gap-3">
                <div>
                  <p className="truncate text-sm font-medium">{cleanDisplayText(sector.name) ?? sector.name}</p>
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
              value={topLine?.coreStockChange.retained.length ? `${topLine.coreStockChange.retained.length}` : "观察"}
              kind="retained"
              items={buildCoreChangeItems("retained", report)}
              line={topLine}
              reportId={report.id}
            />
            <CoreChangeStat
              label="新核心"
              value={topLine?.coreStockChange.appeared.length ? `${topLine.coreStockChange.appeared.length}` : "0"}
              kind="appeared"
              items={buildCoreChangeItems("appeared", report)}
              line={topLine}
              reportId={report.id}
            />
            <CoreChangeStat
              label="退出核心"
              value={topLine?.coreStockChange.disappeared.length ? `${topLine.coreStockChange.disappeared.length}` : "0"}
              kind="disappeared"
              items={buildCoreChangeItems("disappeared", report)}
              line={topLine}
              reportId={report.id}
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
  line,
  reportId
}: {
  label: string;
  value: string;
  kind: CoreChangeKind;
  items: CoreChangeItem[];
  line?: MainlineMemoryContext;
  reportId?: string;
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
    const width = 460;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const top = Math.min(rect.bottom + 10, window.innerHeight - 500);
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
      {position && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed z-50 w-[460px] rounded-xl border border-info/25 bg-[#081019]/95 p-3 text-left shadow-2xl shadow-black/45 backdrop-blur"
              style={{ left: position.left, top: position.top }}
              onMouseEnter={cancelHide}
              onMouseLeave={hide}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text">{label}</p>
                  <p className="mt-1 text-xs text-muted">{cleanDisplayText(line?.name) ?? "当前主线"} / {coreChangeSubtitle(kind, items.length)}</p>
                </div>
                <span className={`rounded border px-2 py-1 text-[11px] ${coreChangeTone(kind)}`}>{value}</span>
              </div>

              <div className="mt-3 grid gap-2">
                {items.length ? (
                  items.map((item, index) => (
                    <div key={`${kind}-${item.name}-${index}`} className="rounded-lg border border-line/70 bg-bg/60 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            <StockMention name={item.name} code={item.code} className="text-info/95 underline decoration-info/30 decoration-dotted underline-offset-2" />
                          </p>
                          <p className="mt-1 text-[11px] text-muted">{item.continuityText}</p>
                        </div>
                        <span className="shrink-0 rounded border border-line bg-panel/70 px-2 py-1 text-[11px] text-muted">
                          {cleanDisplayText(item.role) ?? "核心"}{item.score !== undefined ? ` ${item.score.toFixed(0)}` : ""}
                        </span>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start">
                        <p className="text-xs leading-5 text-muted">{item.advice}</p>
                        {item.stock || item.code ? (
                          <StockTrackingActionButton
                            stock={item.stock ?? fallbackCoreStock(item)}
                            reportId={reportId}
                            sectorName={line?.name}
                            compact
                          />
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-line/70 bg-bg/60 p-3 text-xs leading-5 text-muted">{emptyCoreChangeText(kind)}</div>
                )}
              </div>

              <p className="mt-3 text-[11px] leading-5 text-muted">
                核心变化来自近期报告时间链，只用于判断主线结构连续性；个股动作仍必须服从候选股规则、买点可达性、数据新鲜度和仓位约束。
              </p>
            </div>,
            document.body
          )
        : null}
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
    const current = currentSector?.coreStocks.find((stock) => cleanDisplayText(stock.name) === cleanDisplayText(name) || stock.name === name);
    const timelineStock = findLatestTimelineCoreStock(context, line.name, name);
    const stock = current ?? timelineStock;
    return {
      name: cleanDisplayText(name) ?? name,
      code: current?.marketCode ?? stock?.code,
      role: cleanDisplayText(stock?.role),
      score: stock?.score,
      limitStatus: cleanDisplayText(stock?.limitStatus),
      continuityText: coreContinuityText(kind, name, line, context),
      advice: coreChangeAdvice(kind, line, stock),
      stock: current
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
  const cleanName = cleanDisplayText(name) ?? name;
  const stageCount = line.stagePath.length;
  if (kind === "retained") {
    const count = consecutiveCoreCount(context, line.name, name);
    return `${cleanName} 已连续 ${count} 次报告留在核心结构中；当前主线阶段路径共有 ${stageCount} 个观察点。`;
  }
  if (kind === "appeared") {
    const first = firstSeenCorePoint(context, line.name, name);
    return first ? `${cleanName} 本期新进入核心列表；首次出现在 ${formatShortDate(first.createdAt)}。` : `${cleanName} 本期新进入核心列表，需要下一次报告验证持续性。`;
  }
  const last = lastSeenCorePoint(context, line.name, name);
  return last ? `${cleanName} 在上一段时间链中仍是核心；最近一次出现于 ${formatShortDate(last.createdAt)}。` : `${cleanName} 已退出当前核心结构，历史时间点仍待补齐。`;
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
  const stage = cleanDisplayText(line.currentStage) ?? line.currentStage;
  const role = cleanDisplayText(stock?.role) ?? "角色待确认";
  const status = cleanDisplayText(stock?.limitStatus) ?? "状态待确认";
  if (kind === "retained") {
    return `核心延续是主线结构健康的正向证据。当前阶段为 ${stage}，只能作为结构强度参考，不能单独作为追高理由。`;
  }
  if (kind === "appeared") {
    return `当前角色：${role}，盘口状态：${status}。新核心至少还需要下一次报告或盘中回封/承接确认，才能视为稳定领涨。`;
  }
  return `退出核心是降温或轮动信号。若退出的是龙头或中军锚点，应降低主线确认等级；若只是后排退出，则重点观察新核心能否接力。`;
}

function coreChangeSubtitle(kind: CoreChangeKind, count: number) {
  if (kind === "retained") return count ? "上一期核心仍在" : "暂未形成连续核心";
  if (kind === "appeared") return count ? "本期新增核心结构" : "暂无新核心";
  return count ? "上一期核心本期退出" : "暂无退出核心";
}

function coreChangeTone(kind: CoreChangeKind) {
  if (kind === "retained") return "border-up/35 bg-up/10 text-up";
  if (kind === "appeared") return "border-info/35 bg-info/10 text-info";
  return "border-warn/35 bg-warn/10 text-warn";
}

function emptyCoreChangeText(kind: CoreChangeKind) {
  if (kind === "retained") return "暂无延续核心，主线连续性还需要下一次报告继续验证。";
  if (kind === "appeared") return "暂无新核心，当前核心结构还没有出现明确接力股。";
  return "暂无退出核心，当前核心结构暂未出现明显负反馈。";
}

function fallbackCoreStock(item: CoreChangeItem): SectorCoreStockSnapshot {
  return {
    code: item.code ?? "",
    marketCode: item.code ?? "",
    name: item.name,
    role: (item.role ?? "核心") as SectorCoreStockSnapshot["role"],
    score: item.score ?? 0,
    limitStatus: (item.limitStatus ?? "unknown") as SectorCoreStockSnapshot["limitStatus"],
    risks: []
  };
}

function trendTone(value?: "无历史" | "改善" | "持平" | "转弱") {
  if (value === "改善") return "up";
  if (value === "转弱") return "warn";
  return "info";
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
