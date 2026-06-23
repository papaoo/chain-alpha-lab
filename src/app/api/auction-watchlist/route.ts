import { NextResponse } from "next/server";
import { buildAuctionWatchlistSnapshot } from "@/lib/db/auctionWatchlist";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = boundedInteger(url.searchParams.get("limit"), 80, 10, 240);
    const itemLimit = boundedInteger(url.searchParams.get("itemLimit"), 12, 1, 50);
    return NextResponse.json(
      { success: true, data: buildAuctionWatchlistSnapshot(limit, itemLimit), error: null },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "AUCTION_WATCHLIST_FAILED",
          message: error instanceof Error ? error.message : "次日竞价观察池读取失败"
        }
      },
      { status: 500 }
    );
  }
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Math.trunc(Number(value ?? fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
