import { NextResponse } from "next/server";
import { getSchedulerSettings, saveSchedulerSettings } from "@/lib/db/settings";

export async function GET() {
  return NextResponse.json({ success: true, data: getSchedulerSettings(), error: null });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = saveSchedulerSettings({
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      intradayScanEnabled: typeof body.intradayScanEnabled === "boolean" ? body.intradayScanEnabled : undefined,
      intradayIntervalMinutes: Number(body.intradayIntervalMinutes),
      keypointTimes: body.keypointTimes,
      deepResearchTimes: body.deepResearchTimes,
      llmOnEvent: typeof body.llmOnEvent === "boolean" ? body.llmOnEvent : undefined,
      pushNotification: typeof body.pushNotification === "boolean" ? body.pushNotification : undefined
    });
    return NextResponse.json({ success: true, data, error: null });
  } catch (error) {
    return NextResponse.json({
      success: false,
      data: null,
      error: {
        code: "SAVE_SCHEDULER_SETTINGS_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }
    }, { status: 500 });
  }
}
