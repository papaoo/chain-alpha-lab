import { NextResponse } from "next/server";
import { eastmoneyAdapter } from "@/lib/eastmoney/adapter";
import { westockAdapter } from "@/lib/westock/adapter";
import { firstTableRows } from "@/lib/westock/parser";

type StockKlinePayload = {
  code: string;
  source: string;
  sourceUrl?: string;
  klines: Array<{
    date: string;
    timestamp: number;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number;
    amount?: number;
    changePct?: number;
    turnoverRate?: number;
  }>;
};
type ServerCacheEntry = {
  payload: StockKlinePayload;
  fetchedAt: number;
};

const SERVER_KLINE_CACHE_TTL_MS = 30 * 60 * 1000;
const serverKlineCache = new Map<string, ServerCacheEntry>();

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { searchParams } = new URL(request.url);
  const limit = clampInteger(Number(searchParams.get("limit") ?? 90), 20, 240);
  const cacheKey = `${code.toLowerCase()}:${limit}`;
  const cached = searchParams.get("refresh") === "1" ? null : getServerCachedKlines(cacheKey);
  if (cached) {
    return NextResponse.json({ success: true, data: cached.payload, error: null });
  }

  try {
    const result = await eastmoneyAdapter.getStockKlines(code, limit);
    if (result.data?.length) {
      const payload = {
        code,
        source: "eastmoney",
        sourceUrl: result.sourceUrl,
        klines: result.data.map((item) => ({
          date: item.date,
          timestamp: toTimestamp(item.date),
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
          volume: item.volume,
          amount: item.amount,
          changePct: item.changePct,
          turnoverRate: item.turnoverRate
        }))
      };
      setServerCachedKlines(cacheKey, payload);
      return NextResponse.json({ success: true, data: payload, error: null });
    }

    const fallback = await getWestockKlines(code, limit);
    if (!fallback.klines.length) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: {
            code: "STOCK_KLINE_NOT_FOUND",
            message: [result.warnings.join("; "), fallback.warning, "该股票暂无真实K线数据"].filter(Boolean).join("；")
          }
        },
        { status: 404 }
      );
    }

    const payload = {
      code,
      source: fallback.source,
      klines: fallback.klines
    };
    setServerCachedKlines(cacheKey, payload);
    return NextResponse.json({ success: true, data: payload, error: null });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "STOCK_KLINE_FAILED",
          message: error instanceof Error ? error.message : String(error)
        }
      },
      { status: 500 }
    );
  }
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function toTimestamp(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1).getTime();
}

function getServerCachedKlines(cacheKey: string) {
  const cached = serverKlineCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > SERVER_KLINE_CACHE_TTL_MS) {
    serverKlineCache.delete(cacheKey);
    return null;
  }
  return cached;
}

function setServerCachedKlines(cacheKey: string, payload: StockKlinePayload) {
  serverKlineCache.set(cacheKey, { payload, fetchedAt: Date.now() });
}

async function getWestockKlines(code: string, limit: number) {
  try {
    const result = await westockAdapter.kline(code, limit, { timeoutMs: 60000, retries: 0 });
    const rows = firstTableRows(result);
    const parsed = rows
      .map((row) => {
        const date = stringValue(row.date);
        const open = numberValue(row.open);
        const high = numberValue(row.high);
        const low = numberValue(row.low);
        const close = numberValue(row.last ?? row.close);
        if (!date || open === undefined || high === undefined || low === undefined || close === undefined) return null;
        return {
          date,
          timestamp: toTimestamp(date),
          open,
          high,
          low,
          close,
          volume: numberValue(row.volume),
          amount: numberValue(row.amount),
          turnoverRate: numberValue(row.turnoverRate ?? row.exchange)
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((left, right) => left.timestamp - right.timestamp);
    return {
      source: "westock-data",
      warning: result.warnings.join("; "),
      klines: parsed.map((item, index) => ({
        ...item,
        changePct: calcChangePct(item.close, parsed[index - 1]?.close)
      }))
    };
  } catch (error) {
    return {
      source: "westock-data",
      warning: `westock-data K线补源失败：${error instanceof Error ? error.message : String(error)}`,
      klines: []
    };
  }
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value && value !== "-") {
    const parsed = Number(value.replace(/,/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function calcChangePct(close?: number, prevClose?: number) {
  if (close === undefined || prevClose === undefined || prevClose <= 0) return undefined;
  return Number((((close - prevClose) / prevClose) * 100).toFixed(2));
}
