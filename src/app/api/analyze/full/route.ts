import { NextResponse } from "next/server";
import { runFullAnalysis } from "@/lib/analysis/service";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const data = await runFullAnalysis({
      useLLM: body.useLLM !== false,
      pushNotification: Boolean(body.pushNotification)
    });
    return NextResponse.json({ success: true, data, error: null });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "ANALYZE_FULL_FAILED",
          message: error instanceof Error ? error.message : String(error)
        }
      },
      { status: 500 }
    );
  }
}
