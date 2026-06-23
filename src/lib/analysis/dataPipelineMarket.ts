import { effectiveTradeDateForSession, inferMarketSessionContext } from "@/lib/market/session";
import { westockAdapter } from "@/lib/westock/adapter";
import { marketDataGateway } from "@/lib/data/marketDataGateway";
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

  const sectorsToFetch = marketDataGateway.extractSectorsToFetch(boardOverview).slice(0, 8);
  const shouldFetchBreadth = session.phase !== "premarket" && session.phase !== "call_auction";
  if (!shouldFetchBreadth) {
    warnings.push(`${session.phaseLabel}：全A宽度暂不作为实时确认，等待开盘后行情。`);
  }
  if (session.phase === "call_auction") {
    warnings.push(`集合竞价阶段：涨跌停池使用上一交易日 ${tradeDate}，竞价异动只作为弱参考。`);
  }

  const [breadthResult, ztResult, dtResult, zbResult, ...constituentResults] = await Promise.all([
    marketDataGateway.fetchMarketBreadth(shouldFetchBreadth),
    marketDataGateway.fetchLimitPool("zt", tradeDate),
    marketDataGateway.fetchLimitPool("dt", tradeDate),
    marketDataGateway.fetchLimitPool("zb", tradeDate),
    ...sectorsToFetch.map((sector) => marketDataGateway.fetchSectorConstituentsWithFallback(sector.name, sector.type))
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

function latestMarketKlineTradeDate(marketKlines: ParsedCommandResult[]) {
  return marketDataGateway.latestMarketKlineTradeDate(marketKlines);
}

export function buildTradingCalendarVerificationWarnings(input: {
  timestamp: string;
  session: ReturnType<typeof inferMarketSessionContext>;
  marketKlines: ParsedCommandResult[];
}) {
  return marketDataGateway.buildTradingCalendarVerificationWarnings(input);
}

export async function buildTushareTradingCalendarWarnings(
  timestamp: string,
  session: ReturnType<typeof inferMarketSessionContext>
) {
  return marketDataGateway.buildTushareTradingCalendarWarnings(timestamp, session);
}

export function latestReportPeriod(tradeDate: string) {
  const year = Number(tradeDate.slice(0, 4));
  const monthDay = tradeDate.slice(4);
  if (monthDay >= "1031") return `${year}0930`;
  if (monthDay >= "0831") return `${year}0630`;
  if (monthDay >= "0430") return `${year}0331`;
  return `${year - 1}1231`;
}
