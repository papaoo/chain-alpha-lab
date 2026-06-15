import { NextResponse } from "next/server";
import { listRecentSchedulerRuns } from "@/lib/db/incremental";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    return NextResponse.json({
      success: true,
      data: listRecentSchedulerRuns(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50),
      error: null
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      data: null,
      error: {
        code: "SCHEDULER_RUNS_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }
    }, { status: 500 });
  }
}
