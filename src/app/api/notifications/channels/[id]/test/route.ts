import { NextResponse } from "next/server";
import { sendTestNotification } from "@/lib/notifications/service";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await sendTestNotification(id);
  return NextResponse.json({ success: data.ok, data, error: data.ok ? null : { code: "NOTIFICATION_TEST_FAILED", message: data.error ?? "测试发送失败" } }, { status: data.ok ? 200 : 502 });
}
