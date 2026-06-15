import { NextResponse } from "next/server";
import { eastmoneyAdapter } from "@/lib/eastmoney/adapter";
import { effectiveTradeDateForSession, inferMarketSessionContext } from "@/lib/market/session";

export const dynamic = "force-dynamic";

type BoardType = "industry" | "concept";

type RawBoardQuote = {
  f2?: number | string;
  f3?: number | string;
  f4?: number | string;
  f5?: number | string;
  f8?: number | string;
  f12?: string;
  f14?: string;
  f20?: number | string;
  f62?: number | string;
  f104?: number | string;
  f105?: number | string;
  f128?: string;
  f136?: number | string;
};

type BoardMomentum = {
  rank: number;
  code: string;
  name: string;
  type: BoardType;
  latest?: number;
  changePct?: number;
  turnoverRate?: number;
  totalMarketValue?: number;
  mainNetInflow?: number;
  upCount?: number;
  downCount?: number;
  leadStock?: string;
  leadStockChangePct?: number;
  breadthPct?: number;
  capitalIntensity?: number;
};

export async function GET() {
  const startedAt = Date.now();
  const warnings: string[] = [];
  const timestamp = new Date().toISOString();
  const session = inferMarketSessionContext(timestamp);
  const tradeDate = effectiveTradeDateForSession(timestamp, session);

  const [breadth, limitUp, limitDown, openBoard, industries, concepts] = await Promise.all([
    eastmoneyAdapter.getMarketBreadth().catch((error) => ({ data: null, warnings: [errorMessage(error)] })),
    eastmoneyAdapter.getLimitPool("zt", tradeDate).catch((error) => ({ data: null, warnings: [errorMessage(error)] })),
    eastmoneyAdapter.getLimitPool("dt", tradeDate).catch((error) => ({ data: null, warnings: [errorMessage(error)] })),
    eastmoneyAdapter.getLimitPool("zb", tradeDate).catch((error) => ({ data: null, warnings: [errorMessage(error)] })),
    fetchBoardMomentum("industry", 36).catch((error) => ({ data: [], warnings: [errorMessage(error)] })),
    fetchBoardMomentum("concept", 24).catch((error) => ({ data: [], warnings: [errorMessage(error)] }))
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

async function fetchBoardMomentum(type: BoardType, limit: number) {
  const fs = type === "industry" ? "m:90+t:2+f:!50" : "m:90+t:3+f:!50";
  const url = "https://push2delay.eastmoney.com/api/qt/clist/get";
  const params = new URLSearchParams({
    pz: String(Math.min(Math.max(limit, 20), 100)),
    po: "1",
    np: "1",
    ut: "bd1d9ddb04089700cf9c27f6f7426281",
    fltt: "2",
    invt: "2",
    fid: type === "industry" ? "f3" : "f12",
    fs,
    fields: "f2,f3,f4,f5,f8,f12,f14,f20,f62,f104,f105,f128,f136",
    pn: "1"
  });
  const sourceUrl = `${url}?${params.toString()}`;
  const response = await fetch(sourceUrl, {
    cache: "no-store",
    headers: {
      "user-agent": "Mozilla/5.0 AShareMainlineAssistant/0.1",
      referer: "https://quote.eastmoney.com/"
    }
  });
  if (!response.ok) throw new Error(`东方财富板块列表 HTTP ${response.status}`);
  const json = await response.json() as { data?: { diff?: RawBoardQuote[] } };
  const rows = json.data?.diff ?? [];
  return {
    data: rows.slice(0, limit).map((row, index): BoardMomentum => {
      const upCount = numberValue(row.f104);
      const downCount = numberValue(row.f105);
      const total = (upCount ?? 0) + (downCount ?? 0);
      const totalMarketValue = numberValue(row.f20);
      const mainNetInflow = numberValue(row.f62);
      return {
        rank: index + 1,
        code: String(row.f12 ?? ""),
        name: String(row.f14 ?? ""),
        type,
        latest: numberValue(row.f2),
        changePct: numberValue(row.f3),
        turnoverRate: numberValue(row.f8),
        totalMarketValue,
        mainNetInflow,
        upCount,
        downCount,
        leadStock: stringValue(row.f128),
        leadStockChangePct: numberValue(row.f136),
        breadthPct: total ? Number((((upCount ?? 0) / total) * 100).toFixed(1)) : undefined,
        capitalIntensity: totalMarketValue && mainNetInflow !== undefined ? mainNetInflow / totalMarketValue : undefined
      };
    }).filter((item) => item.code && item.name),
    warnings: rows.length ? [] : [`东方财富${type === "industry" ? "行业" : "概念"}板块列表返回空数据`]
  };
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

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === "" || value === "-") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringValue(value: unknown) {
  return value === null || value === undefined || value === "" || value === "-" ? undefined : String(value);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
