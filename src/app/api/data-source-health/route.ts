import { NextResponse } from "next/server";
import { buildDataSourceHealth } from "@/lib/db/dataSourceHealth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = boundedInteger(url.searchParams.get("limit"), 20, 1, 100);
    return NextResponse.json({ success: true, data: buildDataSourceHealth(limit), error: null });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "DATA_SOURCE_HEALTH_FAILED",
          message: error instanceof Error ? error.message : "读取数据源健康状态失败"
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
