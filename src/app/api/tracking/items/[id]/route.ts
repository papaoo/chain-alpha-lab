import { NextResponse } from "next/server";
import { updateTrackingItemStatus, type TrackingStatus } from "@/lib/db/stockTracking";
import { invalidateTrackingItemsCache } from "@/lib/db/stockTrackingCache";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const status = parseStatus(body.status);
    if (!status) throw new Error("追踪状态不合法");

    const result = updateTrackingItemStatus({
      id,
      status,
      note: typeof body.note === "string" ? body.note : undefined
    });
    invalidateTrackingItemsCache();
    return NextResponse.json(
      { success: true, data: result, error: null },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "TRACKING_STATUS_UPDATE_FAILED",
          message: error instanceof Error ? error.message : "更新追踪状态失败"
        }
      },
      { status: 400 }
    );
  }
}

function parseStatus(value: unknown): TrackingStatus | null {
  if (value === "active" || value === "paused" || value === "closed") return value;
  return null;
}
