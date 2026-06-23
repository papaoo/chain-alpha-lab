import type { KLineData } from "klinecharts";

export type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };
export type StockKlinePayload = {
  code: string;
  source: string;
  sourceUrl?: string;
  fetchedAt?: string;
  latestTradeDate?: string;
  expectedTradeDate?: string;
  freshnessStatus?: "current" | "stale" | "unknown";
  freshnessWarning?: string;
  warnings?: string[];
  klines: ChartKLineData[];
};
export type ChartKLineData = KLineData & {
  date?: string;
  changePct?: number;
  turnoverRate?: number;
  amount?: number;
};
export type HoverChartInput = {
  name: string;
  code?: string | null;
  latest?: number | null;
  changePct?: number | null;
  turnoverRate?: number | null;
  amount?: number | null;
  mainNetFlow?: number | null;
  ma20DistancePct?: number | null;
  score?: number | null;
  reportCreatedAt?: string | null;
  quoteUpdatedAt?: string | null;
  snapshotFetchedAt?: string | null;
  reportLatest?: number | null;
  reportChangePct?: number | null;
};
export type KLineCacheEntry = {
  data: ChartKLineData[];
  source: string;
  fetchedAt: number;
  sourceFetchedAt?: string;
  latestTradeDate?: string;
  expectedTradeDate?: string;
  freshnessStatus?: "current" | "stale" | "unknown";
  freshnessWarning?: string;
  warnings?: string[];
};
export type KLineChartsModule = typeof import("klinecharts");
