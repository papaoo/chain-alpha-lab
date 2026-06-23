import { NextResponse } from "next/server";
import { stockKlineGateway, type StockKlinePayload } from "@/lib/data/stockKlineGateway";

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
    const result = await stockKlineGateway.fetch(code, limit);
    if (!result.payload) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: {
            code: "STOCK_KLINE_NOT_FOUND",
            message: result.warnings.join("；")
          }
        },
        { status: 404 }
      );
    }

    setServerCachedKlines(cacheKey, result.payload);
    return NextResponse.json({ success: true, data: result.payload, error: null });
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
