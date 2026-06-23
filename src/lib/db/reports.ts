import crypto from "node:crypto";
import { dbAll, dbGet, dbRun } from "@/lib/db/client";
import { persistAnalysisReportSummary } from "@/lib/db/reportSummaries";
import { getStockMemories, getStockMemoriesAsOf } from "@/lib/db/stockMemory";
import { normalizeSectorName } from "@/lib/sector/normalization";
import type {
  AnalysisReport,
  Fact,
  MarketMemoryContext,
  MarketRuleResult,
  MarketTimelinePoint,
  SectorCoreStockSnapshot,
  SectorRuleResult
} from "@/lib/types";

export type ReportMemoryMode = "asOf" | "latest" | "none";

export function saveAnalysisReport(report: Omit<AnalysisReport, "id">) {
  const id = crypto.randomUUID();
  dbRun(
    `insert into analysis_reports
       (id, reportType, title, summary, rawDataJson, ruleResultJson, factPackageJson, llmResultJson, llmStatus, llmMetricsJson, displayable, reportStatus, createdAt)
       values (@id, @reportType, @title, @summary, @rawDataJson, @ruleResultJson, @factPackageJson, @llmResultJson, @llmStatus, @llmMetricsJson, @displayable, @reportStatus, @createdAt)`,
    {
      id,
      reportType: report.reportType,
      title: report.title,
      summary: report.summary,
      rawDataJson: JSON.stringify(report.factPackage.dataSource),
      ruleResultJson: JSON.stringify(report.ruleResult),
      factPackageJson: JSON.stringify(report.factPackage),
      llmResultJson: report.llmResult ? JSON.stringify(report.llmResult) : null,
      llmStatus: report.llmStatus,
      llmMetricsJson: report.llmMetrics ? JSON.stringify(report.llmMetrics) : null,
      displayable: isDisplayableFactPackage(report.factPackage) ? 1 : 0,
      reportStatus: report.reportStatus,
      createdAt: report.createdAt
    },
    { label: "analysis_reports.insert", slowMs: 300 }
  );
  persistAnalysisReportSummary({ ...report, id });

  return id;
}

export function listAnalysisReports(limit = 20, offset = 0, options: { displayableOnly?: boolean } = {}) {
  const rows = dbAll<{
    id: string;
    reportType: AnalysisReport["reportType"];
    title: string;
    summary: string;
    llmStatus: AnalysisReport["llmStatus"];
    reportStatus: AnalysisReport["reportStatus"];
    createdAt: string;
  }>(
    `select id, reportType, title, summary, llmStatus, reportStatus, createdAt
       from analysis_reports
       ${options.displayableOnly ? "where displayable = 1" : ""}
       order by createdAt desc
       limit ? offset ?`,
    [limit, offset],
    { label: options.displayableOnly ? "analysis_reports.list_displayable" : "analysis_reports.list" }
  );
  return rows;
}

export function getAnalysisReport(id: string, memoryMode: ReportMemoryMode = "asOf") {
  const row = dbGet<{
    id: string;
    reportType: AnalysisReport["reportType"];
    title: string;
    summary: string;
    factPackageJson: string;
    ruleResultJson: string;
    llmResultJson: string | null;
    llmMetricsJson?: string | null;
    llmStatus: AnalysisReport["llmStatus"];
    reportStatus: AnalysisReport["reportStatus"];
    createdAt: string;
  }>(`select * from analysis_reports where id = ?`, [id], { label: "analysis_reports.get" });

  if (!row) return null;
  const factPackage = parseReportJson<AnalysisReport["factPackage"]>(row.factPackageJson, row.id, "factPackageJson");
  const ruleResult = parseReportJson<AnalysisReport["ruleResult"]>(row.ruleResultJson, row.id, "ruleResultJson");
  if (!factPackage || !ruleResult) return null;
  if (memoryMode === "latest") {
    factPackage.stockMemories = getStockMemories(factPackage.candidates.map((candidate) => candidate.code));
  } else if (memoryMode === "asOf") {
    factPackage.stockMemories = getStockMemoriesAsOf(factPackage.candidates.map((candidate) => candidate.code), row.createdAt);
  } else {
    delete factPackage.stockMemories;
  }

  return {
    id: row.id,
    schemaVersion: factPackage.schemaVersion,
    reportType: row.reportType,
    title: row.title,
    summary: row.summary,
    dataSourceStatus: factPackage.dataSource,
    factPackage,
    ruleResult,
    llmResult: row.llmResultJson ? parseReportJson<AnalysisReport["llmResult"]>(row.llmResultJson, row.id, "llmResultJson") : null,
    llmStatus: row.llmStatus,
    llmMetrics: row.llmMetricsJson ? parseReportJson<AnalysisReport["llmMetrics"]>(row.llmMetricsJson, row.id, "llmMetricsJson") ?? undefined : undefined,
    reportStatus: row.reportStatus,
    createdAt: row.createdAt
  };
}

const SHORT_MEMORY_LOOKBACK = 3;
const MEDIUM_MEMORY_LOOKBACK = 10;
const QUALITY_MEMORY_LOOKBACK = 20;

export function buildMarketMemoryContext(current: AnalysisReport["factPackage"], lookback = MEDIUM_MEMORY_LOOKBACK): MarketMemoryContext {
  const history = getRecentMarketTimelinePoints(lookback);
  const currentPoint = toTimelinePoint({
    id: "current",
    createdAt: current.timestamp,
    factPackage: current
  });
  const timeline = [...history, currentPoint].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const shortTimeline = timeline.slice(-(SHORT_MEMORY_LOOKBACK + 1));
  const currentSectors = currentPoint.topSectors;
  const mainlines = currentSectors.map((sector) => buildMainlineMemory(sector, timeline));
  const marketTrend = inferMarketTrend(shortTimeline);
  const breadthContinuity = inferBreadthTrend(shortTimeline);
  const timelineQuality = buildTimelineQuality(timeline, QUALITY_MEMORY_LOOKBACK);
  const facts = buildMarketMemoryFacts(timeline, mainlines, marketTrend, breadthContinuity.breadthTrend, timelineQuality);
  return {
    lookbackCount: history.length,
    shortLookbackCount: Math.max(0, shortTimeline.length - 1),
    mediumLookbackCount: history.length,
    generatedAt: current.timestamp,
    marketTrend,
    breadthTrend: breadthContinuity.breadthTrend,
    breadthDeltaPct: breadthContinuity.breadthDeltaPct,
    timelineQuality,
    timeline,
    mainlines,
    facts
  };
}

export function getRecentMarketTimelinePoints(limit: number): MarketTimelinePoint[] {
  const marketRows = dbAll<MarketSnapshotTimelineRow>(
    `select reportId, createdAt, marketState, marketRegime, tradeMode, sentimentCycle, score, breadthUpPct, breadthMedianChangePct, breadthScore, rawJson
       from market_snapshots
       order by createdAt desc
       limit ?`,
    [Math.min(Math.max(limit * 5, 30), 100)],
    { label: "market_snapshots.timeline" }
  );
  if (marketRows.length) {
    const sectorsByReportId = readTimelineSectors(marketRows.map((row) => row.reportId));
    return marketRows
      .map((row) => toSnapshotTimelinePoint(row, sectorsByReportId.get(row.reportId) ?? []))
      .slice(0, limit)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  return getRecentMarketTimelinePointsFromReports(limit);
}

function getRecentMarketTimelinePointsFromReports(limit: number): MarketTimelinePoint[] {
  const rows = dbAll<{ id: string; createdAt: string; factPackageJson: string }>(
    `select id, createdAt, factPackageJson
       from analysis_reports
       where reportType = 'full' and displayable = 1
       order by createdAt desc
       limit ?`,
    [Math.min(Math.max(limit * 5, 30), 200)],
    { label: "analysis_reports.timeline_scan_fallback", slowMs: 300 }
  );
  return rows
    .filter((row) => isDisplayableReport(row.factPackageJson))
    .map((row) => {
      try {
        return toTimelinePoint({
          id: row.id,
          createdAt: row.createdAt,
          factPackage: JSON.parse(row.factPackageJson) as AnalysisReport["factPackage"]
        });
      } catch {
        return null;
      }
    })
    .filter((item): item is MarketTimelinePoint => Boolean(item))
    .slice(0, limit)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

type MarketSnapshotTimelineRow = {
  reportId: string;
  createdAt: string;
  marketState: MarketRuleResult["marketState"];
  marketRegime: MarketRuleResult["marketRegime"] | null;
  tradeMode: MarketRuleResult["tradeMode"] | null;
  sentimentCycle: MarketRuleResult["sentimentCycle"] | null;
  score: number;
  breadthUpPct: number | null;
  breadthMedianChangePct: number | null;
  breadthScore: number | null;
  rawJson: string;
};

type SectorSnapshotTimelineRow = {
  reportId: string;
  createdAt: string;
  name: string;
  stage: SectorRuleResult["stage"];
  score: number;
  rank: number;
  rawJson: string;
};

type MarketSnapshotRaw = {
  market?: Partial<MarketRuleResult>;
  breadth?: AnalysisReport["factPackage"]["market"]["breadth"];
};

function readTimelineSectors(reportIds: string[]) {
  const byReportId = new Map<string, SectorSnapshotTimelineRow[]>();
  if (!reportIds.length) return byReportId;
  const placeholders = reportIds.map(() => "?").join(", ");
  const rows = dbAll<SectorSnapshotTimelineRow>(
    `select reportId, createdAt, name, stage, score, rank, rawJson
       from sector_snapshots
       where reportId in (${placeholders}) and rank <= 5
       order by createdAt desc, rank asc`,
    reportIds,
    { label: "sector_snapshots.timeline_top" }
  );
  for (const row of rows) {
    const list = byReportId.get(row.reportId) ?? [];
    list.push(row);
    byReportId.set(row.reportId, list);
  }
  return byReportId;
}

function toSnapshotTimelinePoint(row: MarketSnapshotTimelineRow, sectors: SectorSnapshotTimelineRow[]): MarketTimelinePoint {
  const raw = safeJson<MarketSnapshotRaw>(row.rawJson, {});
  return {
    reportId: row.reportId,
    createdAt: row.createdAt,
    marketState: row.marketState,
    marketRegime: row.marketRegime ?? raw.market?.marketRegime ?? fallbackMarketRegime(row.marketState),
    tradeMode: row.tradeMode ?? raw.market?.tradeMode ?? fallbackTradeMode(row.marketState),
    sentimentCycle: row.sentimentCycle ?? raw.market?.sentimentCycle ?? fallbackSentimentCycle(row.marketState),
    score: row.score,
    breadthUpPct: row.breadthUpPct ?? raw.breadth?.upPct,
    breadthMedianChangePct: row.breadthMedianChangePct ?? raw.breadth?.medianChangePct,
    breadthScore: row.breadthScore ?? raw.market?.breadthScore,
    breadthSourceQuality: raw.market?.breadthSourceQuality,
    breadthReliability: raw.market?.breadthReliability,
    topSectors: sectors
      .sort((left, right) => left.rank - right.rank)
      .slice(0, 5)
      .map(toSnapshotTimelineSector)
  };
}

function toSnapshotTimelineSector(row: SectorSnapshotTimelineRow): MarketTimelinePoint["topSectors"][number] {
  const raw = safeJson<Partial<SectorRuleResult>>(row.rawJson, {});
  return {
    name: row.name,
    stage: row.stage,
    score: row.score,
    coreStocks: (raw.coreStocks ?? [])
      .slice(0, 5)
      .map(toTimelineCoreStock)
      .filter((stock): stock is Pick<SectorCoreStockSnapshot, "code" | "name" | "role" | "score" | "limitStatus"> => Boolean(stock))
  };
}

function toTimelineCoreStock(stock: Partial<SectorCoreStockSnapshot>) {
  if (!stock.code || !stock.name || !stock.role || !stock.limitStatus) return null;
  return {
    code: stock.code,
    name: stock.name,
    role: stock.role,
    score: stock.score ?? 0,
    limitStatus: stock.limitStatus
  };
}

function fallbackMarketRegime(state: MarketRuleResult["marketState"]): MarketRuleResult["marketRegime"] {
  if (state === "tradable") return "强势";
  if (state === "cautious") return "震荡";
  return "退潮";
}

function fallbackTradeMode(state: MarketRuleResult["marketState"]): MarketRuleResult["tradeMode"] {
  if (state === "tradable") return "进攻";
  if (state === "cautious") return "试错";
  return "空仓";
}

function fallbackSentimentCycle(state: MarketRuleResult["marketState"]): MarketRuleResult["sentimentCycle"] {
  if (state === "tradable") return "启动";
  if (state === "cautious") return "修复";
  return "退潮";
}

function toTimelinePoint(input: { id: string; createdAt: string; factPackage: AnalysisReport["factPackage"] }): MarketTimelinePoint {
  const market = input.factPackage.ruleResult.market;
  const breadth = input.factPackage.market.breadth;
  const breadthScore = market.breadthScore ?? market.diagnostics.find((item) => item.label === "市场宽度")?.score;
  const breadthSourceQuality = market.breadthSourceQuality ?? (breadth ? "market" : undefined);
  const breadthReliability = market.breadthReliability ?? (breadth ? 1 : undefined);
  return {
    reportId: input.id,
    createdAt: input.createdAt,
    marketState: market.marketState,
    marketRegime: market.marketRegime,
    tradeMode: market.tradeMode,
    sentimentCycle: market.sentimentCycle,
    score: market.score,
    breadthUpPct: breadth?.upPct,
    breadthMedianChangePct: breadth?.medianChangePct,
    breadthScore,
    breadthSourceQuality,
    breadthReliability,
    topSectors: input.factPackage.sectors.slice(0, 5).map((sector) => ({
      name: sector.name,
      stage: sector.stage,
      score: sector.score,
      coreStocks: sector.coreStocks.slice(0, 5).map((stock) => ({
        code: stock.code,
        name: stock.name,
        role: stock.role,
        score: stock.score,
        limitStatus: stock.limitStatus
      }))
    }))
  };
}

export function isDisplayableReport(raw: string) {
  try {
    const factPackage = JSON.parse(raw) as AnalysisReport["factPackage"];
    return isDisplayableFactPackage(factPackage);
  } catch {
    return false;
  }
}

function isDisplayableFactPackage(factPackage: AnalysisReport["factPackage"]) {
  const sectorCount = factPackage.sectors?.length ?? 0;
  const candidateCount = factPackage.candidates?.length ?? 0;
  if (sectorCount > 0 || candidateCount > 0) return true;
  return factPackage.dataSource?.status === "success";
}

function buildMainlineMemory(
  current: MarketTimelinePoint["topSectors"][number],
  timeline: MarketTimelinePoint[]
): MarketMemoryContext["mainlines"][number] {
  const normalizedName = normalizeLineName(current.name);
  const stagePath = timeline
    .map((point) => {
      const matched = point.topSectors.find((sector) => sameLine(sector.name, normalizedName));
      return matched
        ? {
            reportId: point.reportId,
            createdAt: point.createdAt,
            stage: matched.stage,
            score: matched.score
          }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const previous = stagePath.length >= 2 ? stagePath[stagePath.length - 2] : undefined;
  const currentCore = current.coreStocks.map((stock) => stock.name);
  const previousPoint = timeline.length >= 2 ? timeline[timeline.length - 2] : undefined;
  const previousSector = previousPoint?.topSectors.find((sector) => sameLine(sector.name, normalizedName));
  const previousCore = previousSector?.coreStocks.map((stock) => stock.name) ?? [];
  return {
    name: current.name,
    normalizedName,
    currentStage: current.stage,
    previousStage: previous?.stage,
    stagePath,
    trend: inferStageTrend(previous?.stage, current.stage, stagePath.length),
    coreStockChange: {
      retained: currentCore.filter((name) => previousCore.includes(name)),
      appeared: currentCore.filter((name) => !previousCore.includes(name)),
      disappeared: previousCore.filter((name) => !currentCore.includes(name))
    }
  };
}

function inferMarketTrend(timeline: MarketTimelinePoint[]): MarketMemoryContext["marketTrend"] {
  if (timeline.length < 2) return "无历史";
  const previous = timeline[timeline.length - 2];
  const current = timeline[timeline.length - 1];
  const stateDelta = marketStateRank(current.marketState) - marketStateRank(previous.marketState);
  const scoreDelta = current.score - previous.score;
  if (stateDelta > 0 || scoreDelta >= 8) return "改善";
  if (stateDelta < 0 || scoreDelta <= -8) return "转弱";
  return "持平";
}

function inferBreadthTrend(timeline: MarketTimelinePoint[]): Pick<MarketMemoryContext, "breadthTrend" | "breadthDeltaPct"> {
  const reliablePoints = timeline.filter(
    (point) => point.breadthUpPct !== undefined && (point.breadthReliability ?? 1) >= 0.8
  );
  if (reliablePoints.length < 2) return { breadthTrend: "无历史" };
  const previous = reliablePoints[reliablePoints.length - 2];
  const current = reliablePoints[reliablePoints.length - 1];
  const breadthDeltaPct = Number(((current.breadthUpPct ?? 0) - (previous.breadthUpPct ?? 0)).toFixed(2));
  if (breadthDeltaPct >= 8) return { breadthTrend: "改善", breadthDeltaPct };
  if (breadthDeltaPct <= -8) return { breadthTrend: "转弱", breadthDeltaPct };
  return { breadthTrend: "持平", breadthDeltaPct };
}

function inferStageTrend(previous: SectorRuleResult["stage"] | undefined, current: SectorRuleResult["stage"], pathLength: number): MarketMemoryContext["mainlines"][number]["trend"] {
  if (!previous || pathLength <= 1) return "新出现";
  if (current === "退潮") return "退潮";
  const delta = stageRank(current) - stageRank(previous);
  if (delta > 0) return "改善";
  if (delta < 0) return "转弱";
  return "持平";
}

function buildTimelineQuality(timeline: MarketTimelinePoint[], rawLookback: number): MarketMemoryContext["timelineQuality"] {
  const raw = getRecentReportQualityRows(rawLookback);
  const first = timeline[0];
  const latest = timeline[timeline.length - 1];
  const calendarSpanDays = first && latest ? diffDays(first.createdAt, latest.createdAt) : undefined;
  const effectivePointCount = timeline.length;
  const filteredReportCount = Math.max(0, raw.scannedReportCount - raw.displayableReportCount - raw.parseErrorCount);
  let reliability: MarketMemoryContext["timelineQuality"]["reliability"] = "高";
  const warnings: string[] = [];

  if (effectivePointCount < 4) warnings.push(`有效时间点仅${effectivePointCount}个，短线连续性证据偏少`);
  if (raw.parseErrorCount > 0) warnings.push(`最近${raw.scannedReportCount}份报告中有${raw.parseErrorCount}份解析失败`);
  if (filteredReportCount > 0) warnings.push(`最近${raw.scannedReportCount}份报告中有${filteredReportCount}份不可展示或低质量报告被过滤`);
  if ((calendarSpanDays ?? 0) > 10 && effectivePointCount <= 6) warnings.push(`时间链横跨${calendarSpanDays}天但有效点不足，存在断档风险`);

  if (effectivePointCount < 4 || raw.parseErrorCount > 0 || filteredReportCount >= Math.max(2, raw.scannedReportCount * 0.4)) {
    reliability = "低";
  } else if (effectivePointCount < 7 || filteredReportCount > 0 || (calendarSpanDays ?? 0) > 10) {
    reliability = "中";
  }

  return {
    scannedReportCount: raw.scannedReportCount,
    displayableReportCount: raw.displayableReportCount,
    filteredReportCount,
    parseErrorCount: raw.parseErrorCount,
    effectivePointCount,
    calendarSpanDays,
    reliability,
    warning: warnings.join("；") || undefined
  };
}

function getRecentReportQualityRows(limit: number) {
  const rows = dbAll<{ displayable: number | null }>(
    `select displayable
       from analysis_reports
       where reportType = 'full'
       order by createdAt desc
       limit ?`,
    [limit],
    { label: "analysis_reports.quality_scan" }
  );

  return {
    scannedReportCount: rows.length,
    displayableReportCount: rows.filter((row) => row.displayable === 1).length,
    parseErrorCount: 0
  };
}

function buildMarketMemoryFacts(
  timeline: MarketTimelinePoint[],
  mainlines: MarketMemoryContext["mainlines"],
  marketTrend: MarketMemoryContext["marketTrend"],
  breadthTrend: MarketMemoryContext["breadthTrend"],
  timelineQuality: MarketMemoryContext["timelineQuality"]
): Fact[] {
  const latest = timeline[timeline.length - 1];
  const facts: Fact[] = [];
  if (latest) {
    facts.push({
      factId: "memory.market.timeline",
      sourceType: "ruleComputed",
      text: `最近${Math.min(timeline.length, SHORT_MEMORY_LOOKBACK + 1)}个短线时间点大盘连续性：${timeline.slice(-(SHORT_MEMORY_LOOKBACK + 1)).map((point) => `${formatDate(point.createdAt)} ${marketStateLabel(point.marketState)}(${point.score})`).join(" -> ")}，当前判断为${marketTrend}；中线有效点${timeline.length}个。`,
      value: marketTrend
    });
    facts.push({
      factId: "memory.market.timeline_quality",
      sourceType: "ruleComputed",
      text: `历史时间链质量：最近${timelineQuality.scannedReportCount}份已保存报告中，可展示${timelineQuality.displayableReportCount}份，过滤${timelineQuality.filteredReportCount}份，解析失败${timelineQuality.parseErrorCount}份；本次纳入有效点${timelineQuality.effectivePointCount}个，横跨${timelineQuality.calendarSpanDays ?? "未知"}天，可靠性${timelineQuality.reliability}${timelineQuality.warning ? `；${timelineQuality.warning}` : ""}。`,
      value: timelineQuality.reliability
    });
    const breadthPoints = timeline.filter((point) => point.breadthUpPct !== undefined);
    if (breadthPoints.length) {
      facts.push({
        factId: "memory.market.breadth_timeline",
        sourceType: "ruleComputed",
        text: `最近${Math.min(breadthPoints.length, 8)}个宽度时间点连续性：${breadthPoints.slice(-8).map((point) => `${formatDate(point.createdAt)} 上涨${formatPercent(point.breadthUpPct)} / 中位${formatPercent(point.breadthMedianChangePct)} / 宽度分${point.breadthScore ?? "缺失"}`).join(" -> ")}，短线宽度趋势${breadthTrend}。`,
        value: breadthTrend
      });
    }
  }
  for (const line of mainlines.slice(0, 5)) {
    facts.push({
      factId: `memory.sector.${line.normalizedName}.stage_path`,
      sourceType: "ruleComputed",
      text: `${line.name} 阶段迁移：${line.stagePath.map((item) => `${formatDate(item.createdAt)} ${item.stage}(${item.score.toFixed(0)})`).join(" -> ")}，趋势${line.trend}；核心股延续${line.coreStockChange.retained.join("、") || "无"}，新出现${line.coreStockChange.appeared.join("、") || "无"}，退出${line.coreStockChange.disappeared.join("、") || "无"}。`,
      value: line.trend
    });
  }
  return facts;
}

function diffDays(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return undefined;
  return Number(((endDate.getTime() - startDate.getTime()) / 86_400_000).toFixed(1));
}

function marketStateRank(state: MarketTimelinePoint["marketState"]) {
  if (state === "tradable") return 2;
  if (state === "cautious") return 1;
  return 0;
}

function stageRank(stage: SectorRuleResult["stage"]) {
  const map: Record<SectorRuleResult["stage"], number> = {
    "观察": 0,
    "启动": 1,
    "确认": 2,
    "加速": 3,
    "分歧": 1,
    "退潮": -1
  };
  return map[stage];
}

function sameLine(name: string, normalizedName: string) {
  const current = normalizeLineName(name);
  if (current === normalizedName) return true;
  if (current.length < 3 || normalizedName.length < 3) return false;
  return current.includes(normalizedName) || normalizedName.includes(current);
}

function normalizeLineName(value: string) {
  return normalizeSectorName(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatPercent(value: number | undefined) {
  return value === undefined ? "缺失" : `${value.toFixed(2)}%`;
}

function marketStateLabel(state: MarketTimelinePoint["marketState"]) {
  if (state === "tradable") return "可交易";
  if (state === "cautious") return "谨慎";
  return "防守";
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseReportJson<T>(raw: string, reportId: string, column: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[reports:invalid-json] ${reportId}.${column}: ${message}`);
    return null;
  }
}
