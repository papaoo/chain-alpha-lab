import { NextResponse } from "next/server";
import { getAnalysisReport, listAnalysisReports } from "@/lib/db/reports";
import { listTrackingItemsCached } from "@/lib/db/stockTrackingCache";
import { effectiveTradeDateForSession, inferMarketSessionContext } from "@/lib/market/session";
import { buildRiskAlerts, buildRiskSummary } from "@/lib/risk/warnings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const latest = listAnalysisReports(1, 0, { displayableOnly: true })[0] ?? null;
    const report = latest ? getAnalysisReport(latest.id) : null;
    const tracking = listTrackingItemsCached("active");
    const timestamp = new Date().toISOString();
    const session = inferMarketSessionContext(timestamp);
    const alerts = buildRiskAlerts({
      report,
      session,
      trackingItems: tracking.data
    });
    const summary = buildRiskSummary({
      alerts,
      report,
      trackingItems: tracking.data,
      freshnessStatus: report?.factPackage.tradeDate === effectiveTradeDateForSession(timestamp, session) ? "current" : "unknown"
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          reportId: report?.id ?? null,
          reportCreatedAt: report?.createdAt ?? null,
          session: {
            timestamp,
            phase: session.phase,
            phaseLabel: session.phaseLabel,
            isTradingDay: session.isTradingDay,
            isTradingSession: session.isTradingSession,
            expectedDataBasis: session.expectedDataBasis,
            effectiveTradeDate: effectiveTradeDateForSession(timestamp, session)
          },
          summary,
          alerts
        },
        meta: {
          trackingCacheStatus: tracking.cacheStatus,
          trackingCacheTtlSeconds: tracking.cacheTtlSeconds,
          generatedAt: timestamp
        },
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
          code: "RISK_WARNINGS_FAILED",
          message: error instanceof Error ? error.message : "风险预警读取失败"
        }
      },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
