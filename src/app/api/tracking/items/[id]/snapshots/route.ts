import { NextResponse } from "next/server";
import { listTrackingSnapshots } from "@/lib/db/stockTracking";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const rawLimit = Number(searchParams.get("limit") ?? 20);
  const limit = Number.isFinite(rawLimit) ? rawLimit : 20;
  return NextResponse.json({
    success: true,
    data: listTrackingSnapshots(id, limit),
    error: null
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
