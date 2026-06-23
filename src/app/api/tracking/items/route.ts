import { NextResponse } from "next/server";
import { createSupplementSnapshotForTracking, createTrackingItem, type TrackingStatus } from "@/lib/db/stockTracking";
import { invalidateTrackingItemsCache, listTrackingItemsCached } from "@/lib/db/stockTrackingCache";
import { stockSnapshotGateway } from "@/lib/data/stockSnapshotGateway";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = parseStatus(url.searchParams.get("status"));
  const result = listTrackingItemsCached(status);
  return NextResponse.json(
    { success: true, data: result.data, meta: { cacheStatus: result.cacheStatus, cacheTtlSeconds: result.cacheTtlSeconds }, error: null },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const code = String(body.code ?? "").trim();
    const name = String(body.name ?? "").trim();
    if (!code || !name) throw new Error("股票代码和名称不能为空。");

    const quoteBaseline = await fetchLatestBaselinePrice(code);
    const fallbackPrice = numberOrUndefined(body.simulatedPrice);
    const fallbackQuoteUpdatedAt = stringOrUndefined(body.baselineMeta?.quoteUpdatedAt);
    const baselinePrice = quoteBaseline.price ?? fallbackPrice;
    const baselineQuoteUpdatedAt = quoteBaseline.quoteUpdatedAt ?? fallbackQuoteUpdatedAt;
    const baselineWarnings = [
      ...quoteBaseline.warnings,
      ...(quoteBaseline.price === undefined && fallbackPrice !== undefined ? ["最新报价获取失败，已使用调用方传入价格作为观察基准。"] : []),
      ...(baselinePrice === undefined ? ["未取得最新报价，观察基准价为空；后续收益需要等刷新快照后补齐。"] : [])
    ];

    const result = createTrackingItem({
      code,
      name,
      source: parseSource(body.source),
      entryMode: body.entryMode === "simulated_buy" ? "simulated_buy" : "watch",
      simulatedPrice: baselinePrice,
      simulatedPositionPct: numberOrZero(body.simulatedPositionPct),
      sourceReportId: stringOrUndefined(body.sourceReportId),
      sourceStrategyRunId: stringOrUndefined(body.sourceStrategyRunId),
      sectorName: stringOrUndefined(body.sectorName),
      thesis: stringOrUndefined(body.thesis),
      invalidCondition: stringOrUndefined(body.invalidCondition),
      watchConditions: arrayOfString(body.watchConditions),
      riskNotes: [...(arrayOfString(body.riskNotes) ?? []), ...baselineWarnings],
      baselineMeta: {
        price: baselinePrice,
        source: quoteBaseline.source,
        fetchedAt: quoteBaseline.fetchedAt,
        quoteUpdatedAt: baselineQuoteUpdatedAt,
        warnings: baselineWarnings
      }
    });

    const initialSnapshot = result.created
      ? await createSupplementSnapshotForTracking(result.id, stringOrUndefined(body.sourceReportId))
      : undefined;
    invalidateTrackingItemsCache();
    return NextResponse.json(
      {
        success: true,
        data: {
          ...result,
          baselinePrice: result.baselinePrice ?? baselinePrice,
          baselineSource: result.baselineSource ?? quoteBaseline.source,
          baselineFetchedAt: result.baselineFetchedAt ?? quoteBaseline.fetchedAt,
          baselineQuoteUpdatedAt: result.baselineQuoteUpdatedAt ?? baselineQuoteUpdatedAt,
          initialSnapshot,
          warnings: baselineWarnings
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
        error: { code: "TRACKING_CREATE_FAILED", message: error instanceof Error ? error.message : "创建追踪失败" }
      },
      { status: 400 }
    );
  }
}

async function fetchLatestBaselinePrice(code: string): Promise<{
  price?: number;
  source: string;
  fetchedAt: string;
  quoteUpdatedAt?: string;
  warnings: string[];
}> {
  try {
    const snapshot = await stockSnapshotGateway.fetchOne(code);
    return {
      price: snapshot.latestPrice,
      source: snapshot.source,
      fetchedAt: snapshot.fetchedAt,
      quoteUpdatedAt: snapshot.quoteUpdatedAt ?? snapshot.raw?.quoteUpdatedAt,
      warnings: [
        ...(snapshot.warnings ?? []),
        ...(snapshot.latestPrice === undefined ? [`统一快照未返回有效最新价：${code}`] : [])
      ]
    };
  } catch (error) {
    return {
      source: "unified-stock-snapshot",
      fetchedAt: new Date().toISOString(),
      warnings: [`统一快照获取失败：${error instanceof Error ? error.message : String(error)}`]
    };
  }
}

function parseStatus(value: string | null): TrackingStatus | undefined {
  if (value === "active" || value === "paused" || value === "closed") return value;
  return undefined;
}

function parseSource(value: unknown) {
  if (value === "mainline" || value === "selection" || value === "serenity") return value;
  return "manual";
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
