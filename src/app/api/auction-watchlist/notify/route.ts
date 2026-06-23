import { NextResponse } from "next/server";
import { sendAuctionWatchlistNotification } from "@/lib/notifications/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const limit = boundedInteger(body.limit, 80, 10, 240);
    const itemLimit = boundedInteger(body.itemLimit, 8, 1, 20);
    const deliveries = await sendAuctionWatchlistNotification({ limit, itemLimit });
    return NextResponse.json(
      {
        success: true,
        data: {
          sent: deliveries.filter((item) => item.ok).length,
          failed: deliveries.filter((item) => !item.ok).length,
          deliveries
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
          code: "AUCTION_WATCHLIST_NOTIFY_FAILED",
          message: error instanceof Error ? error.message : "次日竞价观察池推送失败"
        }
      },
      { status: 500 }
    );
  }
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Math.trunc(Number(value ?? fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
