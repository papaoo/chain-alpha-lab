import { NextResponse } from "next/server";
import { listModelAuditFeedback, listModelAuditFeedbackSummaries } from "@/lib/db/modelAudit";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = boundedInteger(url.searchParams.get("limit"), 30, 1, 100);
  const offset = boundedInteger(url.searchParams.get("offset"), 0, 0, 10000);
  const detail = url.searchParams.get("detail") === "1";
  return NextResponse.json({
    success: true,
    data: detail ? listModelAuditFeedback(Math.min(limit, 10), offset) : listModelAuditFeedbackSummaries(limit, offset),
    error: null
  });
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Math.trunc(Number(value ?? fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
