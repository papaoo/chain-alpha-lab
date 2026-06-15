import { NextResponse } from "next/server";
import { refreshTrackingSnapshots } from "@/lib/db/stockTracking";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const reportId = typeof body.reportId === "string" && body.reportId.trim() ? body.reportId.trim() : undefined;
    return NextResponse.json({ success: true, data: refreshTrackingSnapshots(reportId), error: null });
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
