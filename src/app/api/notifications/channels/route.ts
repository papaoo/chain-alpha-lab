import { NextResponse } from "next/server";
import { listNotificationChannels, saveNotificationChannel } from "@/lib/db/notifications";
import type { NotificationChannelType } from "@/lib/types";

export async function GET() {
  return NextResponse.json({ success: true, data: listNotificationChannels(), error: null });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const type = parseType(body.type);
    const name = typeof body.name === "string" ? body.name : "";
    const webhookUrl = typeof body.webhookUrl === "string" ? body.webhookUrl.trim() : "";
    if (!webhookUrl.startsWith("https://")) {
      return NextResponse.json(
        { success: false, data: null, error: { code: "INVALID_WEBHOOK", message: "Webhook 地址必须是 https 链接" } },
        { status: 400 }
      );
    }
    const data = saveNotificationChannel({ type, name, webhookUrl, enabled: body.enabled !== false });
    return NextResponse.json({ success: true, data, error: null });
  } catch (error) {
    return NextResponse.json(
      { success: false, data: null, error: { code: "SAVE_NOTIFICATION_CHANNEL_FAILED", message: error instanceof Error ? error.message : String(error) } },
      { status: 500 }
    );
  }
}

function parseType(value: unknown): NotificationChannelType {
  return value === "wecom" ? "wecom" : "feishu";
}
