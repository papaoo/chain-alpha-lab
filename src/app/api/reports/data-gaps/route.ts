import { NextResponse } from "next/server";
import { getAnalysisReport, listAnalysisReports } from "@/lib/db/reports";
import { buildReportDataGapAudit } from "@/lib/dataQuality/reportGaps";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const reportId = url.searchParams.get("reportId")?.trim();
    const latest = listAnalysisReports(1, 0, { displayableOnly: true })[0];
    const id = reportId || latest?.id;
    if (!id) throw new Error("暂无可审计的分析报告。");
    const report = getAnalysisReport(id, "none");
    if (!report) throw new Error(`报告不存在：${id}`);
    const audit = await buildReportDataGapAudit(report, {
      latestReportId: latest?.id,
      latestReportCreatedAt: latest?.createdAt
    });
    return NextResponse.json(
      {
        success: true,
        data: audit,
        error: null
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "REPORT_DATA_GAPS_FAILED",
          message: error instanceof Error ? error.message : "读取报告数据缺口失败"
        }
      },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
