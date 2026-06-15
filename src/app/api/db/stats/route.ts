import { NextResponse } from "next/server";
import { getDatabaseAudit } from "@/lib/db/audit";
import { getDatabaseRuntimeInfo } from "@/lib/db/runtime";
import { getDatabaseRetentionPreview, getDatabaseStats } from "@/lib/db/stats";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const sampleLimit = Number(url.searchParams.get("sampleLimit") ?? undefined);
  const data = mode === "retention-preview"
    ? getDatabaseRetentionPreview()
    : mode === "runtime"
      ? getDatabaseRuntimeInfo()
      : mode === "audit"
        ? getDatabaseAudit({ maxJsonRowsPerColumn: Number.isFinite(sampleLimit) ? sampleLimit : undefined })
      : getDatabaseStats();
  return NextResponse.json({ success: true, data, error: null });
}
