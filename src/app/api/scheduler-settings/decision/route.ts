import { NextResponse } from "next/server";
import { getSchedulerSettings } from "@/lib/db/settings";
import { decideSchedulerJob, type SchedulerJobMode } from "@/lib/scheduler/decision";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = parseMode(url.searchParams.get("mode"));
  const at = url.searchParams.get("at");
  const now = at ? new Date(at) : new Date();
  if (Number.isNaN(now.getTime())) {
    return NextResponse.json({
      success: false,
      data: null,
      error: { code: "INVALID_TIME", message: "at 参数不是有效时间。" }
    }, { status: 400 });
  }
  const settings = getSchedulerSettings();
  const decision = decideSchedulerJob(mode, settings, now);
  return NextResponse.json(
    {
      success: true,
      data: {
        checkedAt: now.toISOString(),
        mode,
        decision,
        settings
      },
      error: null
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

function parseMode(value: string | null): SchedulerJobMode {
  if (value === "scan" || value === "keypoint" || value === "deep-research") return value;
  return "auto";
}
