import { NextResponse } from "next/server";
import { marketDataGateway, type BoardMomentum } from "@/lib/data/marketDataGateway";
import { effectiveTradeDateForSession, inferMarketSessionContext } from "@/lib/market/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  const warnings: string[] = [];
  const timestamp = new Date().toISOString();
  const session = inferMarketSessionContext(timestamp);
  const tradeDate = effectiveTradeDateForSession(timestamp, session);

  const [breadth, limitUp, limitDown, openBoard, industries, concepts] = await Promise.all([
    marketDataGateway.fetchMarketBreadth(true).catch((error) => ({ data: null, warnings: [errorMessage(error)] })),
    marketDataGateway.fetchLimitPool("zt", tradeDate).catch((error) => ({ data: null, warnings: [errorMessage(error)] })),
    marketDataGateway.fetchLimitPool("dt", tradeDate).catch((error) => ({ data: null, warnings: [errorMessage(error)] })),
    marketDataGateway.fetchLimitPool("zb", tradeDate).catch((error) => ({ data: null, warnings: [errorMessage(error)] })),
    marketDataGateway.fetchBoardMomentum("industry", 36).catch((error) => ({ data: [], warnings: [errorMessage(error)] })),
    marketDataGateway.fetchBoardMomentum("concept", 24).catch((error) => ({ data: [], warnings: [errorMessage(error)] }))
  ]);

  warnings.push(...breadth.warnings, ...limitUp.warnings, ...limitDown.warnings, ...openBoard.warnings, ...industries.warnings, ...concepts.warnings);

  const limitUpStocks = limitUp.data?.stocks ?? [];
  const limitDownStocks = limitDown.data?.stocks ?? [];
  const openBoardStocks = openBoard.data?.stocks ?? [];
  const sectorMoney = [...industries.data, ...concepts.data]
    .filter((item) => Number.isFinite(item.changePct ?? NaN) || Number.isFinite(item.mainNetInflow ?? NaN))
    .sort((left, right) => compositeBoardScore(right) - compositeBoardScore(left))
    .slice(0, 36);

  return NextResponse.json({
    success: true,
    data: {
      fetchedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      source: "eastmoney_public",
      sourceNote: "东方财富公开行情接口；仅用于首页展示和规则证据补充，不由模型自由改写。",
      tradeDate,
      breadth: breadth.data,
      emotion: {
        limitUpCount: limitUpStocks.length,
        limitDownCount: limitDownStocks.length,
        openBoardCount: openBoardStocks.length,
        burstRate: percent(openBoardStocks.length, openBoardStocks.length + limitUpStocks.length),
        strongSealCount: limitUpStocks.filter((item) => (item.sealAmount ?? 0) >= 100_000_000).length,
        earlyLimitCount: limitUpStocks.filter((item) => isBefore(item.firstLimitTime, "10:00:00")).length,
        maxConsecutiveLimit: Math.max(0, ...limitUpStocks.map((item) => item.consecutiveLimitCount ?? 0)),
        limitUpIndustries: topIndustryCounts(limitUpStocks.map((item) => item.industry).filter(Boolean) as string[]),
        openBoardIndustries: topIndustryCounts(openBoardStocks.map((item) => item.industry).filter(Boolean) as string[]),
        limitUpSamples: limitUpStocks.slice(0, 12),
        openBoardSamples: openBoardStocks.slice(0, 12),
        limitDownSamples: limitDownStocks.slice(0, 8)
      },
      sectorMoney,
      topInflowBoards: [...industries.data, ...concepts.data]
        .filter((item) => (item.mainNetInflow ?? 0) > 0)
        .sort((left, right) => (right.mainNetInflow ?? 0) - (left.mainNetInflow ?? 0))
        .slice(0, 12),
      topChangeBoards: [...industries.data, ...concepts.data]
        .filter((item) => Number.isFinite(item.changePct ?? NaN))
        .sort((left, right) => (right.changePct ?? -999) - (left.changePct ?? -999))
        .slice(0, 12),
      warnings: Array.from(new Set(warnings.filter(Boolean)))
    },
    error: null
  });
}

function compositeBoardScore(item: BoardMomentum) {
  const change = item.changePct ?? 0;
  const breadth = item.breadthPct ?? 50;
  const money = item.capitalIntensity ? item.capitalIntensity * 10000 : 0;
  const lead = item.leadStockChangePct ?? 0;
  return change * 2.2 + (breadth - 50) * 0.08 + money * 0.4 + Math.min(lead, 20) * 0.25;
}

function topIndustryCounts(names: string[]) {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 8);
}

function isBefore(value: string | undefined, target: string) {
  return Boolean(value && value <= target);
}

function percent(count: number, total: number) {
  return total ? Number(((count / total) * 100).toFixed(1)) : 0;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
