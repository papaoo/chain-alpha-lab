import type { KLineChartsModule, KLineCacheEntry, StockKlinePayload, ChartKLineData, ApiResponse } from "@/components/StockKLineHoverTypes";
import { fetchApiJson } from "@/lib/client/api";

const KLINE_CACHE_TTL_MS = 30 * 60 * 1000;
const klineDataCache = new Map<string, KLineCacheEntry>();
const klineDataInflight = new Map<string, Promise<KLineCacheEntry>>();
let klineChartsModulePromise: Promise<KLineChartsModule> | null = null;

export function getCachedKLine(cacheKey: string) {
  const cached = klineDataCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > KLINE_CACHE_TTL_MS) {
    klineDataCache.delete(cacheKey);
    return null;
  }
  return cached;
}

export function loadCachedKLine(code: string, cacheKey: string, forceRefresh: boolean) {
  if (!forceRefresh) {
    const cached = getCachedKLine(cacheKey);
    if (cached) return Promise.resolve(cached);
    const inflight = klineDataInflight.get(cacheKey);
    if (inflight) return inflight;
  }

  const request = fetchApiJson<StockKlinePayload>(`/api/stocks/${encodeURIComponent(code)}/kline?limit=90${forceRefresh ? "&refresh=1" : ""}`)
    .then((json) => {
      if (!json.success || !json.data?.klines.length) throw new Error(json.error?.message ?? "真实K线为空");
      const normalized = normalizeKLineData(json.data.klines);
      if (!normalized.length) throw new Error("真实K线字段不完整");
      const entry = {
        data: normalized,
        source: json.data.source,
        fetchedAt: Date.now(),
        sourceFetchedAt: json.data.fetchedAt,
        latestTradeDate: json.data.latestTradeDate,
        expectedTradeDate: json.data.expectedTradeDate,
        freshnessStatus: json.data.freshnessStatus,
        freshnessWarning: json.data.freshnessWarning,
        warnings: json.data.warnings
      };
      klineDataCache.set(cacheKey, entry);
      return entry;
    })
    .finally(() => {
      klineDataInflight.delete(cacheKey);
    });

  if (!forceRefresh) klineDataInflight.set(cacheKey, request);
  return request;
}

export function normalizeKLineData(rows: ChartKLineData[]) {
  const sorted = rows
    .filter((item) => isValidKLine(item))
    .map((item) => ({
      ...item,
      timestamp: Number(item.timestamp),
      open: Number(item.open),
      high: Number(item.high),
      low: Number(item.low),
      close: Number(item.close),
      volume: finiteNumber(item.volume) ?? 0,
      amount: finiteNumber(item.amount),
      turnoverRate: finiteNumber(item.turnoverRate)
    }))
    .sort((left, right) => left.timestamp - right.timestamp);

  return sorted.map((item, index) => ({
    ...item,
    changePct: finiteNumber(item.changePct) ?? calcChangePct(item.close, sorted[index - 1]?.close)
  }));
}

export function finiteNumber(value?: number | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function calcChangePct(close?: number | null, prevClose?: number | null) {
  const current = finiteNumber(close);
  const previous = finiteNumber(prevClose);
  if (current === undefined || previous === undefined || previous <= 0) return undefined;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

export function isValidKLine(item: ChartKLineData) {
  const timestamp = Number(item.timestamp);
  const open = Number(item.open);
  const high = Number(item.high);
  const low = Number(item.low);
  const close = Number(item.close);
  return (
    [timestamp, open, high, low, close].every((value) => Number.isFinite(value)) &&
    high >= Math.max(open, close) &&
    low <= Math.min(open, close)
  );
}
