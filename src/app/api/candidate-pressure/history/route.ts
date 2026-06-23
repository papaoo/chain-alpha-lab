import { NextResponse } from "next/server";
import { buildCandidatePressureHistory } from "@/lib/db/candidatePressureHistory";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = boundedInteger(url.searchParams.get("limit"), 8, 3, 20);
    const includePoints = url.searchParams.get("includePoints") === "1";
    const data = buildCandidatePressureHistory(limit);
    const payload = includePoints ? data : { ...data, points: [] };
    return NextResponse.json(
      { success: true, data: payload, error: null },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "CANDIDATE_PRESSURE_HISTORY_FAILED",
          message: error instanceof Error ? error.message : "候选压制历史读取失败"
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
