import { NextResponse } from "next/server";
import { createSelectionRun, listSelectionRuns, listSelectionRunSummaries } from "@/lib/selection/runs";
import type { SelectionRunRequest } from "@/lib/selection/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const detail = searchParams.get("detail") === "1";
  const rawLimit = Number(searchParams.get("limit") ?? 20);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? Math.trunc(rawLimit) : 20, 1), detail ? 5 : 100);
  return NextResponse.json({
    success: true,
    data: detail ? listSelectionRuns(limit) : listSelectionRunSummaries(limit),
    error: null
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Partial<SelectionRunRequest>;
    const data = await createSelectionRun({
      strategyId: body.strategyId ?? "main_force_accumulation",
      mode: body.mode ?? "rule",
      parameters: body.parameters ?? {}
    });
    return NextResponse.json({ success: true, data, error: null });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "SELECTION_RUN_FAILED",
          message: error instanceof Error ? error.message : String(error)
        }
      },
      { status: 500 }
    );
  }
}
