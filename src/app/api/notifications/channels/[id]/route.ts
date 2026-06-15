import { NextResponse } from "next/server";
import { deleteNotificationChannel, setNotificationChannelEnabled } from "@/lib/db/notifications";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const data = setNotificationChannelEnabled(id, Boolean(body.enabled));
  if (!data) {
    return NextResponse.json(
      { success: false, data: null, error: { code: "NOTIFICATION_CHANNEL_NOT_FOUND", message: "通知渠道不存在" } },
      { status: 404 }
    );
  }
  return NextResponse.json({ success: true, data, error: null });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteNotificationChannel(id);
  return NextResponse.json({ success: true, data: { id }, error: null });
}
