import crypto from "node:crypto";
import { dbAll, dbGet, dbRun, dbTransaction } from "@/lib/db/client";
import { getAnalysisReport } from "@/lib/db/reports";
import type { StockCandidate } from "@/lib/types";

export type TrackingStatus = "active" | "paused" | "closed";
export type TrackingRecommendation = "继续观察" | "继续持有" | "减仓" | "卖出" | "加仓等待确认" | "数据不足";

export type StockTrackingItem = {
  id: string;
  code: string;
  name: string;
  source: "manual" | "mainline" | "selection";
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

type TrackingRow = Omit<StockTrackingItem, "watchConditions" | "riskNotes" | "latestSnapshot"> & {
  watchConditionsJson: string;
  riskNotesJson: string;
};

type SnapshotRow = Omit<StockTrackingSnapshot, "raw"> & { rawJson: string };

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
  return rows.map((row) => toTrackingItem(row, snapshots.get(row.id)));
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
}) {
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
  return id;
}

export function refreshTrackingSnapshots(reportId?: string) {
  const report = reportId ? getAnalysisReport(reportId, "none") : getLatestDisplayableReport();
  if (!report) return { reportId: null, updated: 0, message: "没有可用报告，无法刷新追踪快照。" };
  const activeItems = listTrackingItems("active");
  if (!activeItems.length) return { reportId: report.id, updated: 0, message: "暂无活跃追踪股票。" };

  let updated = 0;
  dbTransaction("stock_tracking_snapshots.refresh", () => {
    for (const item of activeItems) {
      const candidate = report.factPackage.candidates.find((entry) => normalizeCode(entry.code) === normalizeCode(item.code));
      const snapshot = buildSnapshot(item, report.id, report.createdAt, candidate);
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
      updated += 1;
    }
  });
  return { reportId: report.id, updated, message: `已基于最新报告刷新 ${updated} 个追踪快照。` };
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
      raw: { missingCandidate: true }
    };
  }
  const recommendation = inferRecommendation(item, candidate);
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
      action: candidate.action,
      positionLimitPct: candidate.positionLimitPct,
      invalidCondition: candidate.invalidCondition,
      opportunityProfile: candidate.opportunityProfile,
      buyPointEvaluation: candidate.buyPointEvaluation
    }
  };
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
    `select *
       from stock_tracking_snapshots
       where trackingId in (${placeholders})
       order by createdAt desc`,
    trackingIds,
    { label: "stock_tracking_snapshots.latest" }
  );
  for (const row of rows) {
    if (!map.has(row.trackingId)) map.set(row.trackingId, toSnapshot(row));
  }
  return map;
}

function getLatestDisplayableReport() {
  const row = dbGet<{ id: string }>(
    "select id from analysis_reports where reportType = 'full' and displayable = 1 order by createdAt desc limit 1",
    undefined,
    { label: "analysis_reports.latest_for_tracking" }
  );
  return row ? getAnalysisReport(row.id, "none") : null;
}

function toTrackingItem(row: TrackingRow, latestSnapshot?: StockTrackingSnapshot): StockTrackingItem {
  return {
    ...row,
    watchConditions: safeArray(row.watchConditionsJson),
    riskNotes: safeArray(row.riskNotesJson),
    latestSnapshot
  };
}

function toSnapshot(row: SnapshotRow): StockTrackingSnapshot {
  return {
    ...row,
    raw: safeJson(row.rawJson)
  };
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

function normalizeCode(code: string) {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}
