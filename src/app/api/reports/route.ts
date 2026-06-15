import { NextResponse } from "next/server";
import { listAnalysisReports } from "@/lib/db/reports";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = boundedInteger(url.searchParams.get("limit"), 30, 1, 100);
  const offset = boundedInteger(url.searchParams.get("offset"), 0, 0, 10000);
  const displayableOnly = url.searchParams.get("displayable") === "1";
  return NextResponse.json({ success: true, data: listAnalysisReports(limit, offset, { displayableOnly }), error: null });
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Math.trunc(Number(value ?? fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
