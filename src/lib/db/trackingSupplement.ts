import { stockSnapshotGateway, type StockRealtimeSnapshot } from "@/lib/data/stockSnapshotGateway";
import type { StockCandidate, StockFundFlowSnapshot, StockTechnicalSnapshot } from "@/lib/types";

export interface TrackingSupplement {
  name?: string;
  latestPrice?: number;
  changePct?: number;
  trendState?: StockCandidate["trendState"];
  fundFlowState?: StockCandidate["fundFlowState"];
  recommendationReason: string;
  raw: {
    source: string;
    fetchedAt: string;
    quoteUpdatedAt?: string;
    latestKlineDate?: string;
    expectedKlineDate?: string;
    klineFreshnessStatus?: "current" | "stale" | "unknown";
    quote?: unknown;
    technical?: StockTechnicalSnapshot;
    fundFlow?: StockFundFlowSnapshot;
    quality?: string;
    qualityLabel?: string;
    actionability?: {
      level: "actionable" | "reference_only" | "not_actionable";
      label: string;
      reason: string;
      ageMinutes?: number;
      staleAfterMinutes: number;
    };
    coverage?: {
      quote: boolean;
      kline: boolean;
      technical: boolean;
      fundFlow: boolean;
    };
    warnings: string[];
  };
}

export async function fetchTrackingSupplement(code: string): Promise<TrackingSupplement> {
  const snapshot = await stockSnapshotGateway.fetchOne(code);
  return trackingSupplementFromSnapshot(snapshot);
}

export async function fetchTrackingSupplements(codes: string[]): Promise<Record<string, TrackingSupplement>> {
  const snapshots = await stockSnapshotGateway.fetchMany(codes);
  return Object.fromEntries(
    Object.entries(snapshots).map(([code, snapshot]) => [code, trackingSupplementFromSnapshot(snapshot)])
  );
}

export function trackingSupplementFromSnapshot(snapshot: StockRealtimeSnapshot): TrackingSupplement {
  return {
    name: quoteName(snapshot.raw?.quote),
    latestPrice: snapshot.latestPrice,
    changePct: snapshot.changePct,
    trendState: snapshot.trendState,
    fundFlowState: snapshot.fundFlowState,
    recommendationReason: stockSnapshotGateway.buildReason(snapshot),
    raw: {
      source: snapshot.source,
      fetchedAt: snapshot.fetchedAt,
      quoteUpdatedAt: snapshot.raw?.quoteUpdatedAt,
      latestKlineDate: snapshot.raw?.latestKlineDate,
      expectedKlineDate: snapshot.raw?.expectedKlineDate,
      klineFreshnessStatus: snapshot.raw?.klineFreshnessStatus,
      quote: snapshot.raw?.quote,
      technical: snapshot.technical,
      fundFlow: snapshot.fundFlow,
      quality: snapshot.quality,
      qualityLabel: snapshot.qualityLabel,
      actionability: snapshot.actionability,
      coverage: snapshot.coverage,
      warnings: snapshot.warnings
    }
  };
}

function quoteName(quote: unknown) {
  if (!quote || typeof quote !== "object") return undefined;
  const value = (quote as { name?: unknown }).name;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
