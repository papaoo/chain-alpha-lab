import { NextResponse } from "next/server";
import { getTradingCalendarPath, readTradingCalendar, saveTradingCalendar } from "@/lib/market/tradingCalendar";

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      ...readTradingCalendar(),
      path: getTradingCalendarPath()
    },
    error: null
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const closedDates = Array.isArray(body.closedDates)
      ? body.closedDates
      : String(body.closedDates ?? "")
          .split(/\r?\n|,|，/)
          .map((date) => date.trim())
          .filter(Boolean);
    const invalid = closedDates.filter((date: string) => !/^\d{8}$/.test(String(date)));
    if (invalid.length) {
      return NextResponse.json({
        success: false,
        data: null,
        error: { code: "INVALID_DATE", message: `休市日期格式必须为 YYYYMMDD：${invalid.slice(0, 5).join("、")}` }
      }, { status: 400 });
    }
    const saved = saveTradingCalendar({
      market: "A_SHARE",
      source: "manual_ui",
      closedDates
    });
    return NextResponse.json({
      success: true,
      data: {
        ...saved,
        path: getTradingCalendarPath()
      },
      error: null
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      data: null,
      error: { code: "SAVE_FAILED", message: error instanceof Error ? error.message : String(error) }
    }, { status: 500 });
  }
}
