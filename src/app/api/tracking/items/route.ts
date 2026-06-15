import { NextResponse } from "next/server";
import { createTrackingItem, listTrackingItems, type TrackingStatus } from "@/lib/db/stockTracking";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = parseStatus(url.searchParams.get("status"));
  return NextResponse.json({ success: true, data: listTrackingItems(status), error: null });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const code = String(body.code ?? "").trim();
    const name = String(body.name ?? "").trim();
    if (!code || !name) throw new Error("股票代码和名称不能为空");
    const id = createTrackingItem({
      code,
      name,
      source: body.source === "mainline" || body.source === "selection" ? body.source : "manual",
      entryMode: body.entryMode === "simulated_buy" ? "simulated_buy" : "watch",
      simulatedPrice: numberOrUndefined(body.simulatedPrice),
      simulatedPositionPct: numberOrZero(body.simulatedPositionPct),
      sourceReportId: stringOrUndefined(body.sourceReportId),
      sourceStrategyRunId: stringOrUndefined(body.sourceStrategyRunId),
      sectorName: stringOrUndefined(body.sectorName),
      thesis: stringOrUndefined(body.thesis),
      invalidCondition: stringOrUndefined(body.invalidCondition),
      watchConditions: arrayOfString(body.watchConditions),
      riskNotes: arrayOfString(body.riskNotes)
    });
    return NextResponse.json({ success: true, data: { id }, error: null });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: { code: "TRACKING_CREATE_FAILED", message: error instanceof Error ? error.message : "创建追踪失败" }
      },
      { status: 400 }
    );
  }
}

function parseStatus(value: string | null): TrackingStatus | undefined {
  if (value === "active" || value === "paused" || value === "closed") return value;
  return undefined;
}

function numberOrUndefined(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numberOrZero(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringOrUndefined(value: unknown) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function arrayOfString(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : undefined;
}
