import { NextResponse } from "next/server";
import { buildProjectHealthSnapshot } from "@/lib/project/health";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      data: buildProjectHealthSnapshot(),
      error: null
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "PROJECT_HEALTH_FAILED",
          message: error instanceof Error ? error.message : "系统健康状态读取失败"
        }
      },
      { status: 500 }
    );
  }
}
