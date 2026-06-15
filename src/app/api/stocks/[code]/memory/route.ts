import { NextResponse } from "next/server";
import { getStockMemory } from "@/lib/db/stockMemory";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "20");
  const memory = getStockMemory(code, Number.isFinite(limit) && limit > 0 ? Math.min(Math.trunc(limit), 50) : 20);

  if (!memory) {
    return NextResponse.json(
      { success: false, data: null, error: { code: "STOCK_MEMORY_NOT_FOUND", message: "该股票暂无历史跟踪记录" } },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, data: memory, error: null });
}
