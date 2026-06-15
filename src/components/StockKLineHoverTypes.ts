import type { KLineData } from "klinecharts";

export type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };
export type StockKlinePayload = {
  code: string;
  source: string;
  sourceUrl?: string;
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
};
export type KLineCacheEntry = {
  data: ChartKLineData[];
  source: string;
  fetchedAt: number;
};
export type KLineChartsModule = typeof import("klinecharts");
