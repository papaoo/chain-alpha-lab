import { NextResponse } from "next/server";
import { getPublicSettings, saveModelSettings } from "@/lib/db/settings";

export async function GET() {
  return NextResponse.json({ success: true, data: getPublicSettings(), error: null });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = saveModelSettings({
      provider: body.provider,
      providerName: body.providerName,
      baseUrl: body.baseUrl,
      apiKey: body.apiKey,
      model: body.model,
      temperature: Number(body.temperature),
      maxTokens: Number(body.maxTokens),
      timeoutMs: Number(body.timeoutMs),
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      modelAuditEnabled: typeof body.modelAuditEnabled === "boolean" ? body.modelAuditEnabled : undefined
    });
    return NextResponse.json({ success: true, data, error: null });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "SAVE_SETTINGS_FAILED",
          message: error instanceof Error ? error.message : String(error)
        }
      },
      { status: 500 }
    );
  }
}
