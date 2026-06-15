import { NextResponse } from "next/server";
import { buildPremarketSnapshot } from "@/lib/premarket/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await buildPremarketSnapshot();
    return NextResponse.json({ success: true, data, error: null });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "PREMARKET_SNAPSHOT_FAILED",
          message: error instanceof Error ? error.message : String(error)
        }
      },
      { status: 502 }
    );
  }
}
