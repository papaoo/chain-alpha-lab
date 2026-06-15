import { NextResponse } from "next/server";
import { getDataSourceSettings, saveDataSourceSettings } from "@/lib/db/settings";

export async function GET() {
  return NextResponse.json({ success: true, data: getDataSourceSettings(), error: null });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = saveDataSourceSettings({
      providers: Array.isArray(body.providers) ? body.providers : []
    });
    return NextResponse.json({ success: true, data, error: null });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "SAVE_DATA_SETTINGS_FAILED",
          message: error instanceof Error ? error.message : String(error)
        }
      },
      { status: 500 }
    );
  }
}
