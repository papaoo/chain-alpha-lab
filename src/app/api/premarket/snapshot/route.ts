import { NextResponse } from "next/server";
import { buildPremarketSnapshot } from "@/lib/premarket/service";
import type { PremarketSnapshot } from "@/lib/premarket/types";

export const dynamic = "force-dynamic";

const PREMARKET_CACHE_TTL_MS = 60_000;

let cachedSnapshot: { data: PremarketSnapshot; cachedAt: number } | null = null;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("refresh") === "1";
    const now = Date.now();
    const snapshotCache = cachedSnapshot;
    const cacheFresh = Boolean(snapshotCache && now - snapshotCache.cachedAt <= PREMARKET_CACHE_TTL_MS);
    const data = !forceRefresh && cacheFresh && snapshotCache ? snapshotCache.data : await buildPremarketSnapshot();
    if (!cacheFresh || forceRefresh) cachedSnapshot = { data, cachedAt: now };
    return NextResponse.json(
      {
        success: true,
        data: {
          ...data,
          cacheStatus: !forceRefresh && cacheFresh ? "hit" : "miss",
          cacheTtlSeconds: Math.round(PREMARKET_CACHE_TTL_MS / 1000),
          servedAt: new Date(now).toISOString()
        },
        error: null
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "PREMARKET_SNAPSHOT_FAILED",
          message: error instanceof Error ? error.message : String(error)
        }
      },
      { status: 502 }
    );
  }
}
