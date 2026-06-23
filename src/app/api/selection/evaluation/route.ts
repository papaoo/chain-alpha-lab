import { NextResponse } from "next/server";
import { buildLatestSelectionEvaluation } from "@/lib/selection/evaluation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = numberParam(searchParams.get("limit"), 12);
    const maxPicksPerRun = numberParam(searchParams.get("maxPicksPerRun"), 5);
    const data = await buildLatestSelectionEvaluation({ limit, maxPicksPerRun });
    return NextResponse.json(
      { success: true, data, error: null },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "SELECTION_EVALUATION_FAILED",
          message: error instanceof Error ? error.message : "选股后验评估读取失败"
        }
      },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}

function numberParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
