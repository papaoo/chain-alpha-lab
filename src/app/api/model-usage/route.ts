import { NextResponse } from "next/server";
import { buildModelUsageSummary } from "@/lib/db/modelUsage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 80);
    const windowDays = Number(url.searchParams.get("windowDays") ?? 30);
    return NextResponse.json({
      success: true,
      data: buildModelUsageSummary({ limit, windowDays }),
      error: null
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "MODEL_USAGE_FAILED",
          message: error instanceof Error ? error.message : "模型调用统计读取失败"
        }
      },
      { status: 500 }
    );
  }
}
