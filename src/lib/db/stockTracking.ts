import crypto from "node:crypto";
import { dbAll, dbGet, dbRun, dbTransaction } from "@/lib/db/client";
import { getAnalysisReport } from "@/lib/db/reports";
import { fetchTrackingSupplement, fetchTrackingSupplements, type TrackingSupplement } from "@/lib/db/trackingSupplement";
import { calculateTrackingPerformance, resolveTrackingBaselinePrice, returnPct } from "@/lib/db/stockTrackingPerformance";
import type { StockCandidate } from "@/lib/types";

export type TrackingStatus = "active" | "paused" | "closed";
export type TrackingRecommendation = "继续观察" | "继续持有" | "减仓" | "卖出" | "加仓等待确认" | "数据不足";

export type StockTrackingItem = {
  id: string;
  code: string;
  name: string;
  source: "manual" | "mainline" | "selection" | "serenity";
  status: TrackingStatus;
  entryMode: "watch" | "simulated_buy";
  simulatedPrice?: number;
  simulatedPositionPct: number;
  sourceReportId?: string;
  sourceStrategyRunId?: string;
  sectorName?: string;
  thesis: string;
  invalidCondition: string;
  watchConditions: string[];
  riskNotes: string[];
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  latestSnapshot?: StockTrackingSnapshot;
  performance?: StockTrackingPerformance;
  derivedState?: StockTrackingDerivedState;
  baselineTrace?: StockTrackingBaselineTrace;
};

export type StockTrackingBaselineTrace = {
  price?: number;
  source?: string;
  fetchedAt?: string;
  quoteUpdatedAt?: string;
  warnings: string[];
};

export type StockTrackingDerivedState = {
  state: "watching" | "triggered" | "risk_deteriorating" | "invalidated" | "data_insufficient";
  label: string;
  severity: "info" | "positive" | "warning" | "danger" | "muted";
  reason: string;
  nextAction: string;
};

export type StockTrackingPerformance = {
  baselinePrice?: number;
  latestPrice?: number;
  latestReturnPct?: number;
  bestPrice?: number;
  bestReturnPct?: number;
  worstPrice?: number;
  worstReturnPct?: number;
  maxDrawdownPct?: number;
  snapshotCount: number;
  latestSnapshotAt?: string;
  bestSnapshotAt?: string;
  worstSnapshotAt?: string;
  recentPoints: Array<{
    createdAt: string;
    price: number;
    returnPct?: number;
  }>;
};

export type TrackingRefreshItemResult = {
  trackingId: string;
  code: string;
  name: string;
  source: "realtime" | "report";
  previousPrice?: number;
  latestPrice?: number;
  changePct?: number;
  unchanged: boolean;
  createdAt: string;
  fetchedAt?: string;
  quoteUpdatedAt?: string;
  latestKlineDate?: string;
  expectedKlineDate?: string;
  klineFreshnessStatus?: "current" | "stale" | "unknown";
  quality?: string;
  actionabilityLevel?: string;
  sourceLabel?: string;
  baselinePrice?: number;
  latestReturnPct?: number;
  warningCount: number;
  warnings: string[];
};

export type StockTrackingSnapshot = {
  id: string;
  trackingId: string;
  code: string;
  name: string;
  reportId?: string;
  createdAt: string;
  latestPrice?: number;
  changePct?: number;
  trendState?: string;
  fundFlowState?: string;
  buyPointStatus?: string;
  opportunityState?: string;
  recommendation: TrackingRecommendation;
  recommendationReason: string;
  raw?: unknown;
};

export type StockTrackingEvent = {
  id: string;
  trackingId: string;
  eventType: string;
  message: string;
  createdAt: string;
  raw?: unknown;
};

type TrackingRow = Omit<StockTrackingItem, "watchConditions" | "riskNotes" | "latestSnapshot" | "performance" | "derivedState"> & {
  watchConditionsJson: string;
  riskNotesJson: string;
};

type SnapshotRow = Omit<StockTrackingSnapshot, "raw"> & { rawJson: string };
type EventRow = Omit<StockTrackingEvent, "raw"> & { rawJson: string | null };

export function listTrackingItems(status?: TrackingStatus): StockTrackingItem[] {
  const rows = dbAll<TrackingRow>(
    `select *
       from stock_tracking_items
       ${status ? "where status = ?" : ""}
       order by updatedAt desc`,
    status ? [status] : undefined,
    { label: "stock_tracking_items.list" }
  );
  const snapshots = latestSnapshots(rows.map((row) => row.id));
  const baselineTraces = baselineTraceMap(rows.map((row) => row.id));
  const performance = performanceSnapshots(rows, baselineTraces);
  return rows.map((row) => toTrackingItem(row, snapshots.get(row.id), performance.get(row.id), baselineTraces.get(row.id)));
}

export function getActiveTrackingItemByCode(code: string): StockTrackingItem | null {
  const row = dbGet<TrackingRow>(
    `select *
       from stock_tracking_items
       where status = 'active'
         and lower(replace(replace(code, '.', ''), '-', '')) = ?
       order by updatedAt desc
       limit 1`,
    [normalizeCode(code)],
    { label: "stock_tracking_items.get_active_by_code" }
  );
  if (!row) return null;
  const baselineTraces = baselineTraceMap([row.id]);
  return toTrackingItem(
    row,
    latestSnapshots([row.id]).get(row.id),
    performanceSnapshots([row], baselineTraces).get(row.id),
    baselineTraces.get(row.id)
  );
}

export function listTrackingSnapshots(trackingId: string, limit = 20): StockTrackingSnapshot[] {
  const rows = dbAll<SnapshotRow>(
    `select *
       from stock_tracking_snapshots
       where trackingId = ?
       order by createdAt desc
       limit ?`,
    [trackingId, Math.min(Math.max(Math.trunc(limit), 1), 120)],
    { label: "stock_tracking_snapshots.list_by_tracking" }
  );
  return rows.map(toSnapshot);
}

export function listTrackingEvents(trackingId: string, limit = 30): StockTrackingEvent[] {
  const rows = dbAll<EventRow>(
    `select *
       from stock_tracking_events
       where trackingId = ?
       order by createdAt desc
       limit ?`,
    [trackingId, Math.min(Math.max(Math.trunc(limit), 1), 120)],
    { label: "stock_tracking_events.list_by_tracking" }
  );
  return rows.map(toTrackingEvent);
}

export function listSelectionTrackingLinks(limit = 1000): Array<{
  trackingId: string;
  code?: string;
  sourceStrategyRunId: string;
  createdAt: string;
  eventType: string;
}> {
  const rows = dbAll<Pick<EventRow, "trackingId" | "eventType" | "createdAt" | "rawJson">>(
    `select trackingId, eventType, createdAt, rawJson
       from stock_tracking_events
       where rawJson is not null
         and eventType in ('created', 'duplicate_ignored')
       order by createdAt desc
       limit ?`,
    [Math.min(Math.max(Math.trunc(limit), 1), 5000)],
    { label: "stock_tracking_events.selection_links" }
  );

  return rows.flatMap((row) => {
    const raw = safeJson(row.rawJson);
    if (!raw || typeof raw !== "object") return [];
    const payload = raw as Record<string, unknown>;
    const source = typeof payload.source === "string" ? payload.source : undefined;
    const sourceStrategyRunId = typeof payload.sourceStrategyRunId === "string" ? payload.sourceStrategyRunId : undefined;
    if (source !== "selection" || !sourceStrategyRunId) return [];
    return [{
      trackingId: row.trackingId,
      code: typeof payload.code === "string" ? payload.code : undefined,
      sourceStrategyRunId,
      createdAt: row.createdAt,
      eventType: row.eventType
    }];
  });
}

export function updateTrackingItemStatus(input: {
  id: string;
  status: TrackingStatus;
  note?: string;
}) {
  const item = getTrackingItemById(input.id);
  if (!item) throw new Error("追踪记录不存在");
  if (item.status === input.status) return toTrackingStatusResult(item, false);

  const now = new Date().toISOString();
  dbRun(
    `update stock_tracking_items
       set status = @status,
           updatedAt = @updatedAt,
           closedAt = @closedAt
       where id = @id`,
    {
      id: input.id,
      status: input.status,
      updatedAt: now,
      closedAt: input.status === "closed" ? now : null
    },
    { label: "stock_tracking_items.update_status" }
  );

  const nextItem = getTrackingItemById(input.id);
  const eventType = statusEventType(item.status, input.status);
  addTrackingEvent(
    input.id,
    eventType,
    statusEventMessage(item, input.status, input.note),
    {
      fromStatus: item.status,
      toStatus: input.status,
      note: input.note,
      changedAt: now,
      latestSnapshotId: item.latestSnapshot?.id,
      latestPrice: item.latestSnapshot?.latestPrice,
      latestReturnPct: item.performance?.latestReturnPct
    }
  );

  return toTrackingStatusResult(nextItem ?? item, true);
}

export async function createSupplementSnapshotForTracking(trackingId: string, reportId?: string) {
  const item = getTrackingItemById(trackingId);
  if (!item) return { updated: false, message: "追踪记录不存在，无法生成初始快照。" };
  const supplement = await fetchTrackingSupplement(item.code);
  const snapshot = buildSnapshotFromSupplement(item, reportId ?? item.sourceReportId ?? "manual-tracking", supplement);
  insertTrackingSnapshot(item, snapshot);
  return {
    updated: true,
    snapshot,
    message: supplement.latestPrice
      ? `已生成初始追踪快照，最新价 ${supplement.latestPrice.toFixed(2)}。`
      : "已生成初始追踪快照，但最新价缺失，请稍后刷新补数。"
  };
}

export function createTrackingItem(input: {
  code: string;
  name: string;
  source?: StockTrackingItem["source"];
  entryMode?: StockTrackingItem["entryMode"];
  simulatedPrice?: number;
  simulatedPositionPct?: number;
  sourceReportId?: string;
  sourceStrategyRunId?: string;
  sectorName?: string;
  thesis?: string;
  invalidCondition?: string;
  watchConditions?: string[];
  riskNotes?: string[];
  baselineMeta?: {
    price?: number;
    source?: string;
    fetchedAt?: string;
    quoteUpdatedAt?: string;
    warnings?: string[];
  };
}) {
  const existing = getActiveTrackingItemByCode(input.code);
  if (existing) {
    addTrackingEvent(existing.id, "duplicate_ignored", `${input.name || existing.name} 已在活跃追踪中，本次加入请求已复用原记录。`, {
      source: input.source,
      sourceReportId: input.sourceReportId,
      sourceStrategyRunId: input.sourceStrategyRunId,
      thesis: input.thesis
    });
    return {
      id: existing.id,
      created: false,
      baselinePrice: existing.performance?.baselinePrice ?? existing.baselineTrace?.price ?? existing.simulatedPrice,
      baselineSource: existing.baselineTrace?.source,
      baselineFetchedAt: existing.baselineTrace?.fetchedAt,
      baselineQuoteUpdatedAt: existing.baselineTrace?.quoteUpdatedAt
    };
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const item = {
    id,
    code: input.code,
    name: input.name,
    source: input.source ?? "manual",
    status: "active",
    entryMode: input.entryMode ?? "watch",
    simulatedPrice: input.simulatedPrice,
    simulatedPositionPct: input.simulatedPositionPct ?? 0,
    sourceReportId: input.sourceReportId,
    sourceStrategyRunId: input.sourceStrategyRunId,
    sectorName: input.sectorName,
    thesis: input.thesis ?? "手动加入追踪，等待后续报告补充依据。",
    invalidCondition: input.invalidCondition ?? "跌破关键均线、主线退潮或资金持续流出时重新评估。",
    watchConditions: input.watchConditions ?? [],
    riskNotes: input.riskNotes ?? [],
    createdAt: now,
    updatedAt: now
  } satisfies Omit<StockTrackingItem, "latestSnapshot" | "closedAt">;

  dbRun(
    `insert into stock_tracking_items
       (id, code, name, source, status, entryMode, simulatedPrice, simulatedPositionPct, sourceReportId, sourceStrategyRunId, sectorName, thesis, invalidCondition, watchConditionsJson, riskNotesJson, createdAt, updatedAt)
       values (@id, @code, @name, @source, @status, @entryMode, @simulatedPrice, @simulatedPositionPct, @sourceReportId, @sourceStrategyRunId, @sectorName, @thesis, @invalidCondition, @watchConditionsJson, @riskNotesJson, @createdAt, @updatedAt)`,
    {
      ...item,
      watchConditionsJson: JSON.stringify(item.watchConditions),
      riskNotesJson: JSON.stringify(item.riskNotes)
    },
    { label: "stock_tracking_items.insert" }
  );
  addTrackingEvent(id, "created", `${item.name} 已加入个股追踪。`, item);
  if (input.baselineMeta) {
    addTrackingEvent(
      id,
      "baseline_quote",
      input.baselineMeta.price
        ? `加入观察时记录基准价 ${input.baselineMeta.price.toFixed(2)}。`
        : "加入观察时未取得有效基准价。",
      input.baselineMeta
    );
  }
  return {
    id,
    created: true,
    baselinePrice: input.baselineMeta?.price ?? input.simulatedPrice,
    baselineSource: input.baselineMeta?.source,
    baselineFetchedAt: input.baselineMeta?.fetchedAt,
    baselineQuoteUpdatedAt: input.baselineMeta?.quoteUpdatedAt
  };
}

export async function refreshTrackingSnapshots(reportId?: string, options: { preferRealtime?: boolean } = {}) {
  const preferRealtime = options.preferRealtime ?? true;
  const report = reportId ? getAnalysisReport(reportId, "none") : getLatestDisplayableReport();
  const activeItems = listTrackingItems("active");
  if (!activeItems.length) return { reportId: report?.id ?? null, updated: 0, message: "暂无活跃追踪股票。" };

  let updated = 0;
  let realtimeUpdated = 0;
  let reportFallback = 0;
  let unchanged = 0;
  const refreshItems: TrackingRefreshItemResult[] = [];
  const supplementMap = preferRealtime ? await safeFetchTrackingSupplements(activeItems.map((item) => item.code)) : {};
  const snapshots = await Promise.all(activeItems.map(async (item) => {
    const candidate = report?.factPackage.candidates.find((entry) => normalizeCode(entry.code) === normalizeCode(item.code));
    if (preferRealtime) {
      const supplement = supplementMap[normalizeCode(item.code)] ?? await fetchTrackingSupplement(item.code);
      return { item, snapshot: buildSnapshotFromSupplement(item, report?.id ?? "realtime-tracking", supplement), source: "realtime" as const };
    }
    if (candidate && report) return { item, snapshot: buildSnapshot(item, report.id, report.createdAt, candidate), source: "report" as const };
    const supplement = await fetchTrackingSupplement(item.code);
    return { item, snapshot: buildSnapshotFromSupplement(item, report?.id ?? "realtime-tracking", supplement), source: "realtime" as const };
  }));

  dbTransaction("stock_tracking_snapshots.refresh", () => {
    for (const { item, snapshot, source } of snapshots) {
      const previousSnapshot = item.latestSnapshot;
      insertTrackingSnapshot(item, snapshot);
      updated += 1;
      if (source === "realtime") realtimeUpdated += 1;
      if (source === "report") reportFallback += 1;
      if (samePrice(previousSnapshot?.latestPrice, snapshot.latestPrice)) unchanged += 1;
      refreshItems.push(buildTrackingRefreshItemResult(item, snapshot, source, previousSnapshot));
    }
  });
  return {
    reportId: report?.id ?? null,
    updated,
    supplemented: realtimeUpdated,
    realtimeUpdated,
    reportFallback,
    unchanged,
    items: refreshItems,
    message: reportFallback
      ? `已刷新 ${updated} 个追踪快照，其中 ${realtimeUpdated} 个使用统一行情快照补数，${reportFallback} 个因实时补数不足回退报告快照。`
      : `已用统一行情快照刷新 ${updated} 个追踪快照${unchanged ? `，其中 ${unchanged} 个价格与上一快照一致` : ""}。`
  };
}

function buildTrackingRefreshItemResult(
  item: StockTrackingItem,
  snapshot: StockTrackingSnapshot,
  source: "realtime" | "report",
  previousSnapshot?: StockTrackingSnapshot
): TrackingRefreshItemResult {
  const raw = snapshot.raw && typeof snapshot.raw === "object" ? snapshot.raw as {
    source?: unknown;
    fetchedAt?: unknown;
    quoteUpdatedAt?: unknown;
    quality?: unknown;
    latestKlineDate?: unknown;
    expectedKlineDate?: unknown;
    klineFreshnessStatus?: unknown;
    actionability?: { level?: unknown };
    warnings?: unknown[];
  } : {};
  const warnings = Array.isArray(raw.warnings) ? raw.warnings.map(String).filter(Boolean) : [];
  const baselinePrice = item.performance?.baselinePrice ?? item.baselineTrace?.price ?? item.simulatedPrice;
  return {
    trackingId: item.id,
    code: item.code,
    name: snapshot.name || item.name,
    source,
    previousPrice: previousSnapshot?.latestPrice,
    latestPrice: snapshot.latestPrice,
    changePct: snapshot.changePct,
    unchanged: samePrice(previousSnapshot?.latestPrice, snapshot.latestPrice),
    createdAt: snapshot.createdAt,
    fetchedAt: typeof raw.fetchedAt === "string" ? raw.fetchedAt : undefined,
    quoteUpdatedAt: typeof raw.quoteUpdatedAt === "string" ? raw.quoteUpdatedAt : undefined,
    latestKlineDate: typeof raw.latestKlineDate === "string" ? raw.latestKlineDate : undefined,
    expectedKlineDate: typeof raw.expectedKlineDate === "string" ? raw.expectedKlineDate : undefined,
    klineFreshnessStatus: parseKlineFreshnessStatus(raw.klineFreshnessStatus),
    quality: typeof raw.quality === "string" ? raw.quality : undefined,
    actionabilityLevel: typeof raw.actionability?.level === "string" ? raw.actionability.level : undefined,
    sourceLabel: typeof raw.source === "string" ? raw.source : undefined,
    baselinePrice,
    latestReturnPct: returnPct(baselinePrice, snapshot.latestPrice),
    warningCount: warnings.length,
    warnings: warnings.slice(0, 5)
  };
}

function parseKlineFreshnessStatus(value: unknown) {
  return value === "current" || value === "stale" || value === "unknown" ? value : undefined;
}

async function safeFetchTrackingSupplements(codes: string[]) {
  try {
    return await fetchTrackingSupplements(codes);
  } catch {
    return {};
  }
}

export function addTrackingEvent(trackingId: string, eventType: string, message: string, raw?: unknown) {
  dbRun(
    `insert into stock_tracking_events
       (id, trackingId, eventType, message, createdAt, rawJson)
       values (@id, @trackingId, @eventType, @message, @createdAt, @rawJson)`,
    {
      id: crypto.randomUUID(),
      trackingId,
      eventType,
      message,
      createdAt: new Date().toISOString(),
      rawJson: raw ? JSON.stringify(raw) : null
    },
    { label: "stock_tracking_events.insert" }
  );
}

function getTrackingItemById(id: string): StockTrackingItem | null {
  const row = dbGet<TrackingRow>(
    "select * from stock_tracking_items where id = ? limit 1",
    [id],
    { label: "stock_tracking_items.get_by_id" }
  );
  if (!row) return null;
  const baselineTraces = baselineTraceMap([row.id]);
  return toTrackingItem(row, latestSnapshots([row.id]).get(row.id), performanceSnapshots([row], baselineTraces).get(row.id), baselineTraces.get(row.id));
}

function insertTrackingSnapshot(item: StockTrackingItem, snapshot: StockTrackingSnapshot) {
  const previousSnapshot = latestSnapshotByTrackingId(item.id);
  const previousPerformance = performanceForTracking(item.id, item.simulatedPrice);
  const previousState = previousSnapshot
    ? deriveTrackingState(item, previousSnapshot, previousPerformance)
    : undefined;

  dbRun(
    `insert into stock_tracking_snapshots
       (id, trackingId, code, name, reportId, createdAt, latestPrice, changePct, trendState, fundFlowState, buyPointStatus, opportunityState, recommendation, recommendationReason, rawJson)
       values (@id, @trackingId, @code, @name, @reportId, @createdAt, @latestPrice, @changePct, @trendState, @fundFlowState, @buyPointStatus, @opportunityState, @recommendation, @recommendationReason, @rawJson)`,
    {
      ...snapshot,
      rawJson: JSON.stringify(snapshot.raw ?? {})
    },
    { label: "stock_tracking_snapshots.insert" }
  );
  dbRun(
    "update stock_tracking_items set updatedAt = @updatedAt where id = @id",
    { id: item.id, updatedAt: snapshot.createdAt },
    { label: "stock_tracking_items.touch" }
  );
  repairTrackingNameFromSnapshot(item, snapshot);

  const nextPerformance = performanceForTracking(item.id, item.simulatedPrice);
  const nextState = deriveTrackingState(item, snapshot, nextPerformance);
  recordTrackingStateEvent(item, snapshot, previousState, nextState, nextPerformance);
}

function repairTrackingNameFromSnapshot(item: StockTrackingItem, snapshot: StockTrackingSnapshot) {
  if (!shouldReplaceTrackingName(item.name, snapshot.name)) return;
  dbRun(
    "update stock_tracking_items set name = @name where id = @id",
    { id: item.id, name: snapshot.name },
    { label: "stock_tracking_items.repair_name" }
  );
  addTrackingEvent(item.id, "name_repaired", `追踪名称已根据行情源修复为 ${snapshot.name}。`, {
    from: item.name,
    to: snapshot.name,
    snapshotId: snapshot.id
  });
}

function shouldReplaceTrackingName(current: string | undefined, next: string | undefined) {
  if (!next?.trim()) return false;
  const currentText = current?.trim() ?? "";
  if (!currentText) return true;
  if (/^\?+$/.test(currentText)) return true;
  if (/�/.test(currentText)) return true;
  return false;
}

function buildSnapshot(item: StockTrackingItem, reportId: string, createdAt: string, candidate?: StockCandidate): StockTrackingSnapshot {
  if (!candidate) {
    return {
      id: crypto.randomUUID(),
      trackingId: item.id,
      code: item.code,
      name: item.name,
      reportId,
      createdAt,
      recommendation: "数据不足",
      recommendationReason: "最新报告候选池未覆盖该股票，需要等待补数或单股追踪数据源接入。",
      raw: {
        missingCandidate: true,
        source: "report:candidate-missing",
        fetchedAt: createdAt,
        quality: "missing",
        qualityLabel: "报告未覆盖该股",
        actionability: {
          level: "not_actionable",
          label: "不可用于行动",
          reason: "最新报告候选池未覆盖该股票，缺少有效报价和结构字段。",
          staleAfterMinutes: 30
        },
        coverage: { quote: false, kline: false, technical: false, fundFlow: false },
        warnings: ["最新可展示研报候选池未覆盖该股，本快照不能代表当前实时盘面。"]
      }
    };
  }
  const recommendation = inferRecommendation(item, candidate);
  const coverage = {
    quote: Boolean(candidate.price ?? candidate.quote?.latest),
    kline: Boolean(candidate.klineSummary),
    technical: Boolean(candidate.technical),
    fundFlow: Boolean(candidate.fundFlow)
  };
  return {
    id: crypto.randomUUID(),
    trackingId: item.id,
    code: item.code,
    name: item.name,
    reportId,
    createdAt,
    latestPrice: candidate.price ?? candidate.quote?.latest,
    changePct: candidate.quote?.changePct,
    trendState: candidate.trendState,
    fundFlowState: candidate.fundFlowState,
    buyPointStatus: candidate.buyPointEvaluation?.status,
    opportunityState: candidate.opportunityProfile?.state,
    recommendation: recommendation.recommendation,
    recommendationReason: recommendation.reason,
    raw: {
      source: "analysis-report:snapshot",
      fetchedAt: createdAt,
      quoteUpdatedAt: stockQuoteUpdatedAt(candidate.quote),
      quality: trackingReportSnapshotQuality(coverage),
      qualityLabel: trackingReportSnapshotQualityLabel(coverage),
      actionability: trackingReportSnapshotActionability(coverage, createdAt),
      coverage,
      warnings: [
        "当前快照来自最新可展示研报候选股数据，不等同于刷新时刻的实时行情。",
        ...trackingReportSnapshotMissingWarnings(coverage)
      ],
      klineSummary: candidate.klineSummary,
      technical: candidate.technical,
      action: candidate.action,
      positionLimitPct: candidate.positionLimitPct,
      invalidCondition: candidate.invalidCondition,
      opportunityProfile: candidate.opportunityProfile,
      buyPointEvaluation: candidate.buyPointEvaluation
    }
  };
}

function buildSnapshotFromSupplement(item: StockTrackingItem, reportId: string, supplement: TrackingSupplement): StockTrackingSnapshot {
  return {
    id: crypto.randomUUID(),
    trackingId: item.id,
    code: item.code,
    name: shouldReplaceTrackingName(item.name, supplement.name) ? supplement.name! : item.name,
    reportId,
    createdAt: supplement.raw.fetchedAt,
    latestPrice: supplement.latestPrice,
    changePct: supplement.changePct,
    trendState: supplement.trendState,
    fundFlowState: supplement.fundFlowState,
    buyPointStatus: undefined,
    opportunityState: undefined,
    recommendation: inferSupplementRecommendation(item, supplement),
    recommendationReason: supplement.recommendationReason,
    raw: {
      supplement: true,
      sourceReportId: reportId,
      ...supplement.raw
    }
  };
}

function trackingReportSnapshotQuality(coverage: { quote: boolean; kline: boolean; technical: boolean; fundFlow: boolean }) {
  if (coverage.quote && coverage.kline && coverage.technical && coverage.fundFlow) return "partial";
  if (coverage.quote && (coverage.kline || coverage.technical || coverage.fundFlow)) return "partial";
  if (coverage.quote) return "quote_only";
  return "missing";
}

function trackingReportSnapshotQualityLabel(coverage: { quote: boolean; kline: boolean; technical: boolean; fundFlow: boolean }) {
  if (coverage.quote && coverage.kline && coverage.technical && coverage.fundFlow) return "研报候选快照完整";
  if (coverage.quote) return "研报候选快照部分字段";
  return "研报候选快照缺行情";
}

function trackingReportSnapshotActionability(
  coverage: { quote: boolean; kline: boolean; technical: boolean; fundFlow: boolean },
  createdAt: string
) {
  const age = snapshotAgeMinutes(createdAt);
  if (!coverage.quote) {
    return {
      level: "not_actionable",
      label: "不可用于行动",
      reason: "报告快照缺少有效报价，不能用于买卖或加入后涨跌验证。",
      ageMinutes: age,
      staleAfterMinutes: 30
    };
  }
  return {
    level: "reference_only",
    label: "仅可参考",
    reason: "该记录来自研报候选快照，不是刷新时刻的统一实时快照；涉及买点或收益验证请先刷新追踪。",
    ageMinutes: age,
    staleAfterMinutes: 30
  };
}

function snapshotAgeMinutes(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return undefined;
  return Math.max(0, Math.round((Date.now() - time) / 60_000));
}

function trackingReportSnapshotMissingWarnings(coverage: { quote: boolean; kline: boolean; technical: boolean; fundFlow: boolean }) {
  const warnings: string[] = [];
  if (!coverage.quote) warnings.push("研报候选快照缺少报价字段。");
  if (!coverage.kline) warnings.push("研报候选快照缺少K线摘要。");
  if (!coverage.technical) warnings.push("研报候选快照缺少技术指标。");
  if (!coverage.fundFlow) warnings.push("研报候选快照缺少资金流。");
  return warnings;
}

function stockQuoteUpdatedAt(quote: StockCandidate["quote"]) {
  if (!quote || typeof quote !== "object") return undefined;
  const value = (quote as { updatedAt?: unknown }).updatedAt;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function inferSupplementRecommendation(item: StockTrackingItem, supplement: TrackingSupplement): TrackingRecommendation {
  if (supplement.fundFlowState === "outflow" || supplement.trendState === "downtrend") return "减仓";
  if (supplement.trendState === "below_ma20") return item.entryMode === "simulated_buy" ? "减仓" : "继续观察";
  if (item.entryMode === "simulated_buy") return "继续持有";
  if (supplement.fundFlowState === "inflow" && (supplement.trendState === "above_ma20" || supplement.trendState === "reclaim_ma20")) return "加仓等待确认";
  return "继续观察";
}

function inferRecommendation(item: StockTrackingItem, candidate: StockCandidate): { recommendation: TrackingRecommendation; reason: string } {
  if (candidate.action === "回避" || candidate.fundFlowState === "outflow" || candidate.trendState === "downtrend") {
    return { recommendation: "卖出", reason: "规则显示资金流出、趋势破坏或动作回避，模拟追踪应优先退出或停止加仓。" };
  }
  if (candidate.action === "不追" || candidate.trendState === "below_ma20") {
    return { recommendation: "减仓", reason: "当前买入可达性或趋势位置不理想，已有模拟仓位应降低风险暴露。" };
  }
  if (candidate.opportunityProfile?.state === "executable" && candidate.positionLimitPct > item.simulatedPositionPct) {
    return { recommendation: "加仓等待确认", reason: "规则允许试错且仓位上限高于当前模拟仓位，但仍需要按买点触发条件执行。" };
  }
  if (item.entryMode === "simulated_buy") {
    return { recommendation: "继续持有", reason: "尚未触发硬失效条件，继续跟踪趋势、资金和主线阶段。" };
  }
  return { recommendation: "继续观察", reason: candidate.opportunityProfile?.primaryReason ?? "保持观察，等待买点和大盘状态进一步确认。" };
}

function latestSnapshots(trackingIds: string[]) {
  const map = new Map<string, StockTrackingSnapshot>();
  if (!trackingIds.length) return map;
  const placeholders = trackingIds.map(() => "?").join(", ");
  const rows = dbAll<SnapshotRow>(
    `select id, trackingId, code, name, reportId, createdAt, latestPrice, changePct, trendState, fundFlowState, buyPointStatus, opportunityState, recommendation, recommendationReason, rawJson
       from (
         select *,
                row_number() over (partition by trackingId order by createdAt desc) as rn
           from stock_tracking_snapshots
          where trackingId in (${placeholders})
       )
      where rn = 1`,
    trackingIds,
    { label: "stock_tracking_snapshots.latest" }
  );
  for (const row of rows) {
    if (!map.has(row.trackingId)) map.set(row.trackingId, toSnapshot(row));
  }
  return map;
}

function latestSnapshotByTrackingId(trackingId: string) {
  const row = dbGet<SnapshotRow>(
    `select *
       from stock_tracking_snapshots
       where trackingId = ?
       order by createdAt desc
       limit 1`,
    [trackingId],
    { label: "stock_tracking_snapshots.latest_one" }
  );
  return row ? toSnapshot(row) : undefined;
}

function performanceSnapshots(rows: TrackingRow[], baselineTraces = new Map<string, StockTrackingBaselineTrace>()) {
  const map = new Map<string, StockTrackingPerformance>();
  if (!rows.length) return map;
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => "?").join(", ");
  const snapshots = dbAll<Pick<SnapshotRow, "trackingId" | "createdAt" | "latestPrice">>(
    `select trackingId, createdAt, latestPrice
       from (
         select trackingId, createdAt, latestPrice,
                row_number() over (partition by trackingId order by createdAt desc) as rn
           from stock_tracking_snapshots
          where trackingId in (${placeholders})
            and latestPrice is not null
       )
      where rn <= 240
      order by trackingId asc, createdAt asc`,
    ids,
    { label: "stock_tracking_snapshots.performance" }
  );
  const grouped = new Map<string, Array<Pick<SnapshotRow, "trackingId" | "createdAt" | "latestPrice">>>();
  for (const snapshot of snapshots) {
    const list = grouped.get(snapshot.trackingId) ?? [];
    list.push(snapshot);
    grouped.set(snapshot.trackingId, list);
  }
  for (const row of rows) {
    const snapshotsForRow = grouped.get(row.id) ?? [];
    map.set(row.id, calculateTrackingPerformance(
      resolveTrackingBaselinePrice({
        simulatedPrice: row.simulatedPrice,
        baselineTrace: baselineTraces.get(row.id),
        snapshots: snapshotsForRow
      }),
      snapshotsForRow
    ));
  }
  return map;
}

function baselineTraceMap(trackingIds: string[]) {
  const map = new Map<string, StockTrackingBaselineTrace>();
  if (!trackingIds.length) return map;
  const placeholders = trackingIds.map(() => "?").join(", ");
  const rows = dbAll<EventRow>(
    `select *
       from stock_tracking_events
       where trackingId in (${placeholders})
         and eventType = 'baseline_quote'
       order by createdAt desc`,
    trackingIds,
    { label: "stock_tracking_events.baseline_trace" }
  );
  for (const row of rows) {
    if (map.has(row.trackingId)) continue;
    const raw = safeJson(row.rawJson);
    const payload = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    map.set(row.trackingId, {
      price: finiteNumber(payload.price),
      source: typeof payload.source === "string" ? payload.source : undefined,
      fetchedAt: typeof payload.fetchedAt === "string" ? payload.fetchedAt : row.createdAt,
      quoteUpdatedAt: typeof payload.quoteUpdatedAt === "string" ? payload.quoteUpdatedAt : undefined,
      warnings: Array.isArray(payload.warnings) ? payload.warnings.map(String).filter(Boolean) : []
    });
  }
  return map;
}

function performanceForTracking(trackingId: string, baselinePrice?: number) {
  const snapshots = dbAll<Pick<SnapshotRow, "trackingId" | "createdAt" | "latestPrice">>(
    `select trackingId, createdAt, latestPrice
       from stock_tracking_snapshots
       where trackingId = ?
         and latestPrice is not null
       order by createdAt asc`,
    [trackingId],
    { label: "stock_tracking_snapshots.performance_one" }
  );
  const trace = baselineTraceMap([trackingId]).get(trackingId);
  return calculateTrackingPerformance(
    resolveTrackingBaselinePrice({
      simulatedPrice: baselinePrice,
      baselineTrace: trace,
      snapshots
    }),
    snapshots
  );
}

function getLatestDisplayableReport() {
  const row = dbGet<{ id: string }>(
    "select id from analysis_reports where reportType = 'full' and displayable = 1 order by createdAt desc limit 1",
    undefined,
    { label: "analysis_reports.latest_for_tracking" }
  );
  return row ? getAnalysisReport(row.id, "none") : null;
}

function toTrackingItem(
  row: TrackingRow,
  latestSnapshot?: StockTrackingSnapshot,
  performance?: StockTrackingPerformance,
  baselineTrace?: StockTrackingBaselineTrace
): StockTrackingItem {
  const resolvedBaselineTrace = baselineTrace ?? inferredBaselineTrace(row, performance);
  return {
    ...row,
    thesis: normalizeTrackingText(row.thesis, "手动加入追踪，等待后续报告补充依据。"),
    invalidCondition: normalizeTrackingText(row.invalidCondition, "跌破关键均线、主线退潮或资金持续流出时重新评估。"),
    watchConditions: safeArray(row.watchConditionsJson),
    riskNotes: safeArray(row.riskNotesJson),
    latestSnapshot,
    performance,
    derivedState: deriveTrackingState(row, latestSnapshot, performance),
    baselineTrace: resolvedBaselineTrace
  };
}

function inferredBaselineTrace(
  row: Pick<TrackingRow, "simulatedPrice" | "createdAt">,
  performance?: StockTrackingPerformance
): StockTrackingBaselineTrace | undefined {
  const price = finiteNumber(row.simulatedPrice) ?? performance?.baselinePrice;
  if (price === undefined) return undefined;
  return {
    price,
    source: row.simulatedPrice ? "tracking:item.simulatedPrice" : "tracking:first-valid-snapshot",
    fetchedAt: row.simulatedPrice ? row.createdAt : performance?.recentPoints[0]?.createdAt ?? row.createdAt,
    quoteUpdatedAt: undefined,
    warnings: row.simulatedPrice ? [] : ["历史追踪记录缺少加入时基准价，系统已使用第一条有效快照作为收益计算基准。"]
  };
}

function toSnapshot(row: SnapshotRow): StockTrackingSnapshot {
  const raw = safeJson(row.rawJson);
  return {
    ...row,
    recommendation: normalizeTrackingRecommendation(row.recommendation),
    recommendationReason: normalizeLegacyDisplayText(row.recommendationReason),
    trendState: normalizeLegacyDisplayText(row.trendState),
    fundFlowState: normalizeLegacyDisplayText(row.fundFlowState),
    buyPointStatus: normalizeLegacyDisplayText(row.buyPointStatus),
    opportunityState: normalizeLegacyDisplayText(row.opportunityState),
    raw
  };
}

function toTrackingEvent(row: EventRow): StockTrackingEvent {
  return {
    ...row,
    message: normalizeLegacyDisplayText(row.message) ?? row.message,
    raw: normalizeTrackingEventRaw(safeJson(row.rawJson))
  };
}

function toTrackingStatusResult(item: StockTrackingItem, updated: boolean) {
  return {
    updated,
    item,
    message: updated ? `${item.name} 追踪状态已更新为「${statusLabel(item.status)}」。` : `${item.name} 已经是「${statusLabel(item.status)}」。`
  };
}

function statusEventType(fromStatus: TrackingStatus, toStatus: TrackingStatus) {
  if (toStatus === "paused") return "tracking_paused";
  if (toStatus === "closed") return "tracking_closed";
  if (fromStatus !== "active" && toStatus === "active") return "tracking_resumed";
  return "tracking_status_changed";
}

function statusEventMessage(item: StockTrackingItem, status: TrackingStatus, note?: string) {
  const suffix = note?.trim() ? `原因：${note.trim()}` : "未填写额外说明。";
  if (status === "paused") return `${item.name} 已暂停追踪。${suffix}`;
  if (status === "closed") return `${item.name} 已结束追踪并归档。${suffix}`;
  if (status === "active") return `${item.name} 已恢复为活跃追踪。${suffix}`;
  return `${item.name} 追踪状态变更为「${statusLabel(status)}」。${suffix}`;
}

function statusLabel(status: TrackingStatus) {
  if (status === "active") return "活跃";
  if (status === "paused") return "暂停";
  return "已结束";
}

function safeArray(raw: string) {
  const parsed = safeJson(raw);
  return Array.isArray(parsed) ? parsed.map(String) : [];
}

function safeJson(raw?: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeTrackingRecommendation(value: unknown): TrackingRecommendation {
  const text = normalizeLegacyDisplayText(value);
  if (text === "继续观察" || text === "继续持有" || text === "减仓" || text === "卖出" || text === "加仓等待确认" || text === "数据不足") {
    return text;
  }
  return "数据不足";
}

function normalizeLegacyDisplayText<T>(value: T): T;
function normalizeLegacyDisplayText(value: unknown): string | undefined;
function normalizeLegacyDisplayText(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return LEGACY_TEXT_ALIASES[value] ?? value;
}

function normalizeTrackingText(value: unknown, fallback: string) {
  const normalized = normalizeLegacyDisplayText(value);
  if (typeof normalized !== "string") return fallback;
  const trimmed = normalized.trim();
  if (!trimmed || isCorruptedPlaceholderText(trimmed)) return fallback;
  return trimmed;
}

function isCorruptedPlaceholderText(value: string) {
  const compact = value.replace(/\s/g, "");
  if (/^\?{4,}$/.test(compact)) return true;
  const questionCount = (compact.match(/\?/g) ?? []).length;
  return compact.length >= 6 && questionCount / compact.length > 0.6;
}

function normalizeTrackingEventRaw(raw: unknown) {
  if (!raw || typeof raw !== "object") return raw;
  const payload = raw as Record<string, unknown>;
  return {
    ...payload,
    recommendation: normalizeLegacyDisplayText(payload.recommendation),
    recommendationReason: normalizeLegacyDisplayText(payload.recommendationReason),
    from: normalizeTrackingStatePayload(payload.from),
    to: normalizeTrackingStatePayload(payload.to)
  };
}

function normalizeTrackingStatePayload(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const payload = value as Record<string, unknown>;
  return {
    ...payload,
    label: normalizeLegacyDisplayText(payload.label),
    reason: normalizeLegacyDisplayText(payload.reason),
    nextAction: normalizeLegacyDisplayText(payload.nextAction)
  };
}

const LEGACY_TEXT_ALIASES: Record<string, string> = {
  "\u7f01\u0445\u753b\u7459\u509a\u7642": "继续观察",
  "\u7f01\u0445\u753b\u93b8\u4f79\u6e41": "继续持有",
  "\u9351\u5fce\u7ca8": "减仓",
  "\u9357\u6827\u56ad": "卖出",
  "\u9354\u72b1\u7ca8\u7edb\u590a\u7ddf\u7ead\ue1bf\ue17b": "加仓等待确认",
  "\u93c1\u7248\u5d41\u6d93\u5d88\u51bb": "数据不足",
  "\u5bb8\u63d2\u3051\u93c1": "已失效",
  "\u5bb8\u63d2\u3051\u93c1\u003f": "已失效",
  "\u690b\u5ea8\u6ad3\u93ad\u8dfa\u5bf2": "风险恶化",
  "\u7459\ufe40\u5f42\u6d94\u626e\u5063": "触发买点",
  "\u93b8\u4f79\u6e41\u6960\u5c83\u7609": "持有验证",
  "\u7459\u509a\u7642\u6d93": "观察中",
  "\u7459\u509a\u7642\u6d93\u003f": "观察中",
  "\u5a32\u660f\u7a6c": "活跃",
  "\u93c6\u509a\u4ee0": "暂停",
  "\u5bb8\u832c\u7ca8\u93c9": "已结束",
  "\u5bb8\u832c\u7ca8\u93c9\u003f": "已结束"
};

function normalizeCode(code: string) {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function samePrice(left?: number, right?: number) {
  if (left === undefined || right === undefined) return false;
  return Math.abs(left - right) < 0.0001;
}

function recordTrackingStateEvent(
  item: StockTrackingItem,
  snapshot: StockTrackingSnapshot,
  previousState: StockTrackingDerivedState | undefined,
  nextState: StockTrackingDerivedState,
  performance: StockTrackingPerformance
) {
  const latestStateEvent = latestTrackingStateEvent(item.id);
  const initialized = !latestStateEvent;
  if (!initialized && previousState?.state === nextState.state) return;
  if (hasDuplicateLatestStateEvent(item.id, previousState?.state, nextState.state)) return;

  const message = initialized
    ? `${item.name} 追踪状态初始化为「${nextState.label}」。`
    : `${item.name} 追踪状态由「${previousState?.label ?? "未知"}」变为「${nextState.label}」。`;

  addTrackingEvent(item.id, initialized ? "state_initialized" : "state_changed", message, {
    from: initialized || !previousState ? null : pickState(previousState),
    to: pickState(nextState),
    snapshotId: snapshot.id,
    snapshotAt: snapshot.createdAt,
    latestPrice: snapshot.latestPrice,
    latestReturnPct: performance.latestReturnPct,
    recommendation: snapshot.recommendation,
    recommendationReason: snapshot.recommendationReason
  });
}

function hasDuplicateLatestStateEvent(trackingId: string, fromState: string | undefined, toState: string) {
  const latest = latestTrackingStateEvent(trackingId);
  const raw = latest ? safeJson(latest.rawJson) : null;
  if (!raw || typeof raw !== "object") return false;
  const payload = raw as { from?: { state?: string } | null; to?: { state?: string } | null };
  return payload.from?.state === fromState && payload.to?.state === toState;
}

function latestTrackingStateEvent(trackingId: string) {
  return dbGet<EventRow>(
    `select *
       from stock_tracking_events
       where trackingId = ?
         and eventType in ('state_initialized', 'state_changed')
       order by createdAt desc
       limit 1`,
    [trackingId],
    { label: "stock_tracking_events.latest_state" }
  );
}

function pickState(state: StockTrackingDerivedState) {
  return {
    state: state.state,
    label: state.label,
    severity: state.severity,
    reason: state.reason,
    nextAction: state.nextAction
  };
}

function deriveTrackingState(
  item: Pick<StockTrackingItem, "entryMode">,
  snapshot?: StockTrackingSnapshot,
  performance?: StockTrackingPerformance
): StockTrackingDerivedState {
  if (!snapshot || snapshot.recommendation === "数据不足") {
    return {
      state: "data_insufficient",
      label: "数据不足",
      severity: "muted",
      reason: snapshot?.recommendationReason ?? "还没有形成可用追踪快照。",
      nextAction: "等待下一次实时行情补数，或检查该股票代码/数据源是否可用。"
    };
  }

  if (snapshot.recommendation === "卖出" || snapshot.trendState === "downtrend") {
    return {
      state: "invalidated",
      label: "已失效",
      severity: "danger",
      reason: snapshot.recommendationReason || "趋势破坏或规则建议退出。",
      nextAction: "停止新增观察仓，复盘当初加入理由是否仍成立。"
    };
  }

  if (
    snapshot.recommendation === "减仓"
    || snapshot.fundFlowState === "outflow"
    || snapshot.trendState === "below_ma20"
    || (performance?.latestReturnPct !== undefined && performance.latestReturnPct <= -5)
  ) {
    return {
      state: "risk_deteriorating",
      label: "风险恶化",
      severity: "warning",
      reason: snapshot.recommendationReason || "资金、趋势或观察收益已经转弱。",
      nextAction: "只观察不加仓，重点检查失效条件是否已经触发。"
    };
  }

  if (
    snapshot.recommendation === "加仓等待确认"
    || snapshot.buyPointStatus === "有效"
    || snapshot.opportunityState === "executable"
    || (performance?.latestReturnPct !== undefined && performance.latestReturnPct >= 3 && snapshot.trendState === "above_ma20")
  ) {
    return {
      state: "triggered",
      label: item.entryMode === "simulated_buy" ? "持有验证" : "触发买点",
      severity: "positive",
      reason: snapshot.recommendationReason || "观察对象出现买点或趋势收益验证。",
      nextAction: item.entryMode === "simulated_buy" ? "继续按失效条件跟踪。" : "进入买点复核：确认大盘、主线、个股买点和仓位上限。"
    };
  }

  return {
    state: "watching",
    label: "观察中",
    severity: "info",
    reason: snapshot.recommendationReason || "尚未触发买点或失效条件。",
    nextAction: "继续刷新追踪快照，观察价格、趋势、资金和主线状态是否共振。"
  };
}
