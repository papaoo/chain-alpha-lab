import { NextResponse } from "next/server";
import { getAnalysisReport, type ReportMemoryMode } from "@/lib/db/reports";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const memoryMode = parseMemoryMode(url.searchParams.get("memory"));
  const report = getAnalysisReport(id, memoryMode);
  if (!report) {
    return NextResponse.json(
      { success: false, data: null, error: { code: "REPORT_NOT_FOUND", message: "报告不存在或报告 JSON 已损坏" } },
      { status: 404 }
    );
  }
  return NextResponse.json({ success: true, data: report, error: null });
}

function parseMemoryMode(value: string | null): ReportMemoryMode {
  if (value === "latest" || value === "none" || value === "asOf") return value;
  return "asOf";
}
