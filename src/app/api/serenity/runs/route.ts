import { NextResponse } from "next/server";
import { createSerenityRun, listSerenityRuns } from "@/lib/serenity/research";
import type { SerenityRunInput } from "@/lib/serenity/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = boundedInteger(url.searchParams.get("limit"), 20, 1, 100);
  return NextResponse.json({ success: true, data: listSerenityRuns(limit), error: null });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Partial<SerenityRunInput>;
    const input = normalizeInput(body);
    const result = createSerenityRun(input);
    return NextResponse.json({ success: true, data: result, error: null });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "SERENITY_RUN_FAILED",
          message: error instanceof Error ? error.message : "瓶颈研究创建失败"
        }
      },
      { status: 400 }
    );
  }
}

function normalizeInput(input: Partial<SerenityRunInput>): SerenityRunInput {
  const theme = input.theme?.trim();
  if (!theme) throw new Error("请填写研究主题");
  const market = input.market === "A-share" || input.market === "HK" || input.market === "US" || input.market === "global"
    ? input.market
    : "A-share";
  return {
    theme,
    market,
    timeWindow: input.timeWindow?.trim() || "未来 3-12 个月",
    layers: Array.isArray(input.layers) ? input.layers : undefined,
    candidatePreview: Array.isArray(input.candidatePreview) ? input.candidatePreview : undefined,
    candidates: Array.isArray(input.candidates) ? input.candidates.filter((item) => item?.name?.trim()) : [],
    notes: input.notes
  };
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Math.trunc(Number(value ?? fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
