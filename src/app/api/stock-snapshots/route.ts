import { NextResponse } from "next/server";
import { stockSnapshotGateway } from "@/lib/data/stockSnapshotGateway";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const codes = (url.searchParams.get("codes") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 80);
    const filtered = stockSnapshotGateway.filterCodes(codes);
    const data = await stockSnapshotGateway.fetchMany(filtered.validCodes);
    return NextResponse.json({ success: true, data, warnings: filtered.warnings, error: null }, { headers: noStoreHeaders() });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawCodes = Array.isArray(body.codes) ? body.codes.map((item: unknown) => String(item)) : [];
    const filtered = stockSnapshotGateway.filterCodes(rawCodes);
    const data = await stockSnapshotGateway.fetchMany(filtered.validCodes);
    return NextResponse.json({ success: true, data, warnings: filtered.warnings, error: null }, { headers: noStoreHeaders() });
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown) {
  return NextResponse.json(
    {
      success: false,
      data: null,
      error: {
        code: "STOCK_SNAPSHOT_FAILED",
        message: error instanceof Error ? error.message : "获取统一个股行情快照失败"
      }
    },
    { status: 500, headers: noStoreHeaders() }
  );
}

function noStoreHeaders() {
  return { "Cache-Control": "no-store, max-age=0" };
}
