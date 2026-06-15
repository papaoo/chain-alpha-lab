import { eastmoneyAdapter } from "@/lib/eastmoney/adapter";
import { effectiveTradeDateForSession, inferMarketSessionContext } from "@/lib/market/session";
import { tushareAdapter } from "@/lib/tushare/adapter";
import { westockAdapter } from "@/lib/westock/adapter";
import { toErrorMessage } from "@/lib/analysis/dataPipelineUtils";
import type { ParsedCommandResult } from "@/lib/westock/parser";

export async function fetchSupplementalMarketData(
  boardOverview: Awaited<ReturnType<typeof westockAdapter.getBoardOverview>>,
  timestamp: string,
  session: ReturnType<typeof inferMarketSessionContext>,
  marketKlines: ParsedCommandResult[]
) {
  const warnings: string[] = [];
  const calendarTradeDate = effectiveTradeDateForSession(timestamp, session);
  const latestKlineTradeDate = latestMarketKlineTradeDate(marketKlines);
  const tradeDate = latestKlineTradeDate ?? calendarTradeDate;
  if (latestKlineTradeDate && latestKlineTradeDate !== calendarTradeDate) {
    warnings.push(`交易日期自动校准：系统日历预期 ${calendarTradeDate}，指数K线最新交易日 ${latestKlineTradeDate}，东方财富涨跌停池按 ${latestKlineTradeDate} 拉取。`);
  }
  if (session.phase === "non_trading_day") {
    warnings.push(`非交易日研究模式：使用上一交易日 ${tradeDate} 的东方财富全A宽度、涨跌停池和板块成分做收盘复盘；这些数据不能视为实时盘口。`);
  }

  const sectorsToFetch = extractSectorsToFetch(boardOverview).slice(0, 8);
  const shouldFetchBreadth = session.phase !== "premarket" && session.phase !== "call_auction";
  if (!shouldFetchBreadth) {
    warnings.push(`${session.phaseLabel}：全A宽度暂不作为实时确认，等待开盘后行情。`);
  }
  if (session.phase === "call_auction") {
    warnings.push(`集合竞价阶段：涨跌停池使用上一交易日 ${tradeDate}，竞价异动只作为弱参考。`);
  }

  const [breadthResult, ztResult, dtResult, zbResult, ...constituentResults] = await Promise.all([
    shouldFetchBreadth
      ? eastmoneyAdapter.getMarketBreadth().catch((error) => ({ data: null, warnings: [toErrorMessage(error)] }))
      : Promise.resolve({ data: null, warnings: [] }),
    eastmoneyAdapter.getLimitPool("zt", tradeDate).catch((error) => ({ data: null, warnings: [toErrorMessage(error)] })),
    eastmoneyAdapter.getLimitPool("dt", tradeDate).catch((error) => ({ data: null, warnings: [toErrorMessage(error)] })),
    eastmoneyAdapter.getLimitPool("zb", tradeDate).catch((error) => ({ data: null, warnings: [toErrorMessage(error)] })),
    ...sectorsToFetch.map((sector) => fetchSectorConstituentsWithFallback(sector.name, sector.type))
  ]);

  for (const result of [breadthResult, ztResult, dtResult, zbResult, ...constituentResults]) {
    warnings.push(...result.warnings);
  }

  return {
    marketBreadth: breadthResult.data,
    limitPools: [ztResult.data, dtResult.data, zbResult.data].filter((item): item is NonNullable<typeof item> => Boolean(item)),
    sectorConstituents: constituentResults.map((result) => result.data).filter((item): item is NonNullable<typeof item> => Boolean(item)),
    warnings: Array.from(new Set(warnings))
  };
}

async function fetchSectorConstituentsWithFallback(name: string, preferredType: "industry" | "concept") {
  const fallbackType = preferredType === "industry" ? "concept" : "industry";
  const first = await eastmoneyAdapter.getSectorConstituents(name, preferredType).catch((error) => ({ data: null, warnings: [toErrorMessage(error)] }));
  if (first.data) return first;
  const second = await eastmoneyAdapter.getSectorConstituents(name, fallbackType).catch((error) => ({ data: null, warnings: [toErrorMessage(error)] }));
  if (second.data) return second;
  return {
    data: second.data,
    warnings: [...first.warnings, ...second.warnings]
  };
}

function extractSectorsToFetch(boardOverview: Awaited<ReturnType<typeof westockAdapter.getBoardOverview>>) {
  const names = new Map<string, { name: string; type: "industry" | "concept" }>();
  for (const section of boardOverview.sections.filter((item) => item.type === "markdownTable")) {
    const title = section.title ?? "";
    const type = title.includes("概念") ? "concept" : "industry";
    for (const row of section.rows) {
      const name = row.name ? String(row.name) : "";
      if (!name || /昨日|连板|首板|涨停|炸板|跌停|破板|ST|融资融券|预盈预增|预亏预减/.test(name)) continue;
      if (!names.has(name)) names.set(name, { name, type });
    }
  }
  return Array.from(names.values());
}

function latestMarketKlineTradeDate(marketKlines: ParsedCommandResult[]) {
  return marketKlines
    .map((result) => extractLatestKlineTradeDate(result))
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1);
}

function formatTradeDate(timestamp: string) {
  const date = new Date(timestamp);
  const cn = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  const year = cn.getFullYear();
  const month = String(cn.getMonth() + 1).padStart(2, "0");
  const day = String(cn.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function buildTradingCalendarVerificationWarnings(input: {
  timestamp: string;
  session: ReturnType<typeof inferMarketSessionContext>;
  marketKlines: ParsedCommandResult[];
}) {
  const expectedTradeDate = effectiveTradeDateForSession(input.timestamp, input.session);
  const latestDates = input.marketKlines
    .map((result) => extractLatestKlineTradeDate(result))
    .filter((date): date is string => Boolean(date));
  if (latestDates.length === 0) return [];

  const latestMarketDate = latestDates.sort().at(-1);
  if (!latestMarketDate || latestMarketDate === expectedTradeDate) return [];

  if (latestMarketDate > expectedTradeDate) {
    return [
      `交易日历自动校验：指数K线最新日期 ${latestMarketDate} 晚于系统预期交易日 ${expectedTradeDate}，可能存在调休交易日或本地休市日历需要更新。系统将继续使用真实行情数据，但请复核交易日历。`
    ];
  }

  if (input.session.isTradingDay && input.session.phase !== "premarket" && input.session.phase !== "call_auction") {
    return [
      `交易日历自动校验：系统预期交易日为 ${expectedTradeDate}，但指数K线最新日期为 ${latestMarketDate}，行情数据可能尚未刷新或接口返回滞后。盘中结论需降级确认。`
    ];
  }

  return [];
}

export async function buildTushareTradingCalendarWarnings(
  timestamp: string,
  session: ReturnType<typeof inferMarketSessionContext>
) {
  if (!tushareAdapter.isEnabled()) return [];
  const expectedTradeDate = effectiveTradeDateForSession(timestamp, session);
  const result = await tushareAdapter.getTradeCalendar(expectedTradeDate, expectedTradeDate);
  const warnings = [...result.warnings];
  const day = result.data[0];
  if (!day) return warnings;
  if (session.isTradingDay && !day.isOpen) {
    warnings.push(`Tushare 交易日历校验：${expectedTradeDate} 为非交易日，但系统当前按交易日处理，请复核本地交易日历。`);
  }
  return warnings;
}

export function latestReportPeriod(tradeDate: string) {
  const year = Number(tradeDate.slice(0, 4));
  const monthDay = tradeDate.slice(4);
  if (monthDay >= "1031") return `${year}0930`;
  if (monthDay >= "0831") return `${year}0630`;
  if (monthDay >= "0430") return `${year}0331`;
  return `${year - 1}1231`;
}

function extractLatestKlineTradeDate(result: ParsedCommandResult) {
  const dates = result.sections
    .filter((section) => section.type === "markdownTable")
    .flatMap((section) => section.rows)
    .map((row) => normalizeTradeDateCell(row.date ?? row.Date ?? row.日期 ?? row.tradeDate ?? row.trade_date))
    .filter((date): date is string => Boolean(date));
  return dates.sort().at(-1);
}

function normalizeTradeDateCell(value: unknown) {
  if (value === null || value === undefined) return undefined;
  const raw = String(value).trim();
  const compact = raw.replace(/[./-]/g, "");
  return /^\d{8}$/.test(compact) ? compact : undefined;
}
