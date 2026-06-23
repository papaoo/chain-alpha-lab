import { NextResponse } from "next/server";
import { listTrackingEvents } from "@/lib/db/stockTracking";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const rawLimit = Number(searchParams.get("limit") ?? 30);
  const limit = Number.isFinite(rawLimit) ? rawLimit : 30;
  return NextResponse.json({
    success: true,
    data: listTrackingEvents(id, limit),
    error: null
  });
}
