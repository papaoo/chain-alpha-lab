import { NextResponse } from "next/server";
import { buildRuleReplay } from "@/lib/db/ruleReplay";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = boundedInteger(url.searchParams.get("limit"), 60, 5, 200);
    return NextResponse.json({ success: true, data: buildRuleReplay(limit), error: null });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "RULE_REPLAY_FAILED",
          message: error instanceof Error ? error.message : "规则历史回放失败"
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
