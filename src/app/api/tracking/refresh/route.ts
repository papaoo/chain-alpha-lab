import { NextResponse } from "next/server";
import { refreshTrackingSnapshots } from "@/lib/db/stockTracking";
import { invalidateTrackingItemsCache } from "@/lib/db/stockTrackingCache";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const reportId = typeof body.reportId === "string" && body.reportId.trim() ? body.reportId.trim() : undefined;
    const preferRealtime = body.preferRealtime !== false;
    const data = await refreshTrackingSnapshots(reportId, { preferRealtime });
    invalidateTrackingItemsCache();
    return NextResponse.json(
      { success: true, data, error: null },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: { code: "TRACKING_REFRESH_FAILED", message: error instanceof Error ? error.message : "刷新追踪快照失败" }
      },
      { status: 500 }
    );
  }
}
