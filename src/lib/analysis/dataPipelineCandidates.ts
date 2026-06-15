import { eastmoneyAdapter } from "@/lib/eastmoney/adapter";
import { tushareAdapter } from "@/lib/tushare/adapter";
import { westockAdapter } from "@/lib/westock/adapter";
import { appendFallbackRows, firstMarkdownRows, sumLastFundFlow, toErrorMessage, type FallbackParsedRow } from "@/lib/analysis/dataPipelineUtils";
import type { SectorConstituentSnapshot } from "@/lib/types";
import type { ParsedCommandResult } from "@/lib/westock/parser";

export async function supplementHotStocksWithEastmoney(
  hotStocks: Awaited<ReturnType<typeof westockAdapter.getHotStocks>>,
  warnings: string[]
) {
  const currentRows = extractHotStockCodes(hotStocks);
  if (hotStocks.status === "success" && currentRows.length >= 8) return hotStocks;

  const eastmoney = await eastmoneyAdapter.getAllAQuotes(80).catch((error) => ({
    data: null,
    warnings: [toErrorMessage(error)]
  }));
  warnings.push(...eastmoney.warnings);
  if (!eastmoney.data?.length) return hotStocks;

  const existingRows = hotStocks.sections.find((section) => section.type === "markdownTable")?.rows ?? [];
  const existingCodes = new Set(existingRows.map((row) => String(row.code ?? "").toLowerCase()).filter(Boolean));
  const fallbackRows = eastmoney.data
    .filter((quote) => quote.marketCode && quote.name && !quote.name.includes("ST") && !/^[NC]/i.test(quote.name))
    .filter((quote) => !existingCodes.has(quote.marketCode.toLowerCase()))
    .map((quote, index) => ({
      rank: existingRows.length + index + 1,
      code: quote.marketCode,
      name: quote.name,
      stock_type: "GP-A",
      zxj: quote.latest ?? null,
      zdf: quote.changePct ?? null,
      cje: quote.amount ?? null,
      hsl: quote.turnoverRate ?? null,
      mainNetInflow: quote.mainNetInflow ?? null,
      source: "eastmoney_all_a_quote_fallback"
    }));

  return {
    ...hotStocks,
    status: fallbackRows.length ? "partial" as const : hotStocks.status,
    warnings: hotStocks.warnings,
    sections: [
      {
        type: "markdownTable" as const,
        title: "涓滄柟璐㈠瘜鍏ˋ琛屾儏琛ュ厖鍊欓€夋簮",
        columns: ["rank", "code", "name", "stock_type", "zxj", "zdf", "cje", "hsl", "mainNetInflow", "source"],
        rows: [...existingRows, ...fallbackRows].slice(0, 80),
        raw: "eastmoney_all_a_quote_fallback"
      },
      ...hotStocks.sections.filter((section) => section.type !== "markdownTable")
    ]
  };
}

export async function fetchTushareCandidateMetrics(
  candidateCodes: string[],
  tradeDate: string,
  warnings: string[]
) {
  if (!candidateCodes.length || !tushareAdapter.isEnabled()) return [];
  const result = await tushareAdapter.getDailyMetrics(candidateCodes.slice(0, 80), tradeDate).catch((error) => ({
    data: [],
    warnings: [`Tushare 鍊欓€夎偂鎸囨爣琛ュ厖澶辫触锛?{toErrorMessage(error)}`]
  }));
  warnings.push(...result.warnings);
  return result.data;
}

export function supplementHotStocksWithTushare(
  hotStocks: Awaited<ReturnType<typeof westockAdapter.getHotStocks>>,
  metrics: Awaited<ReturnType<typeof fetchTushareCandidateMetrics>>,
  tradeDate: string
) {
  if (!metrics.length) return hotStocks;
  const existingRows = hotStocks.sections.find((section) => section.type === "markdownTable")?.rows ?? [];
  if (!existingRows.length) return hotStocks;
  const metricsByCode = new Map(metrics.map((item) => [item.code.toLowerCase(), item]));
  const enrichedRows = existingRows.map((row) => {
    const code = String(row.code ?? "").toLowerCase();
    const metric = metricsByCode.get(code);
    if (!metric) return row;
    return {
      ...row,
      zxj: row.zxj ?? metric.close ?? null,
      zdf: row.zdf ?? metric.changePct ?? null,
      cje: row.cje ?? row.amount ?? metric.amount ?? null,
      amount: row.amount ?? row.cje ?? metric.amount ?? null,
      hsl: row.hsl ?? row.turnoverRate ?? metric.turnoverRate ?? null,
      turnoverRate: row.turnoverRate ?? row.hsl ?? metric.turnoverRate ?? null,
      lb: row.lb ?? row.volumeRatio ?? metric.volumeRatio ?? null,
      volumeRatio: row.volumeRatio ?? row.lb ?? metric.volumeRatio ?? null,
      peTtm: row.peTtm ?? row.pe_ttm ?? metric.peTtm ?? null,
      pb: row.pb ?? metric.pb ?? null,
      psTtm: row.psTtm ?? row.ps_ttm ?? metric.psTtm ?? null,
      dividendYieldTtm: row.dividendYieldTtm ?? row.dv_ttm ?? metric.dividendYieldTtm ?? null,
      floatMarketValue: row.floatMarketValue ?? metric.floatMarketValue ?? null,
      totalMarketValue: row.totalMarketValue ?? metric.totalMarketValue ?? null,
      tushareTradeDate: metric.tradeDate || tradeDate,
      source: row.source ? `${row.source}+tushare_daily_basic` : "tushare_daily_basic"
    };
  });

  return {
    ...hotStocks,
    status: hotStocks.status === "failed" ? "partial" as const : hotStocks.status,
    warnings: hotStocks.warnings,
    sections: [
      {
        type: "markdownTable" as const,
        title: "\u5019\u9009\u80a1\u884c\u60c5\u6307\u6807\uff08\u542b Tushare \u8865\u5145\uff09",
        columns: Array.from(new Set([
          ...Object.keys(enrichedRows[0] ?? {}),
          "cje",
          "hsl",
          "lb",
          "peTtm",
          "pb",
          "psTtm",
          "dividendYieldTtm",
          "floatMarketValue",
          "tushareTradeDate",
          "source"
        ])),
        rows: enrichedRows,
        raw: "tushare_daily_basic_enriched"
      },
      ...hotStocks.sections.filter((section) => section.type !== "markdownTable")
    ]
  };
}

export function supplementSectorConstituentsWithTushare(
  constituents: SectorConstituentSnapshot[],
  metrics: Awaited<ReturnType<typeof fetchTushareCandidateMetrics>>
) {
  if (!metrics.length || !constituents.length) return constituents;
  const metricsByCode = new Map(metrics.map((item) => [item.code.toLowerCase(), item]));
  return constituents.map((sector) => ({
    ...sector,
    stocks: sector.stocks.map((stock) => {
      const key = String(stock.marketCode || stock.code).toLowerCase();
      const metric = metricsByCode.get(key);
      if (!metric) return stock;
      return {
        ...stock,
        latest: stock.latest ?? metric.close,
        changePct: stock.changePct ?? metric.changePct,
        amount: stock.amount ?? metric.amount,
        turnoverRate: stock.turnoverRate ?? metric.turnoverRate,
        volumeRatio: metric.volumeRatio,
        peDynamic: metric.peTtm,
        peTtm: metric.peTtm,
        psTtm: metric.psTtm,
        dividendYieldTtm: metric.dividendYieldTtm,
        pb: metric.pb,
        floatMarketValue: stock.floatMarketValue ?? metric.floatMarketValue,
        source: "eastmoney+tushare_daily_basic"
      };
    })
  }));
}

export async function supplementStockFundFlowsWithTushare(
  stockFundFlows: ParsedCommandResult | null,
  candidateCodes: string[],
  tradeDate: string,
  warnings: string[]
) {
  if (!candidateCodes.length || !tushareAdapter.isEnabled()) return stockFundFlows;
  const existing = new Set(firstMarkdownRows(stockFundFlows).map((row) => String(row.code ?? row.SecuCode ?? "").toLowerCase()).filter(Boolean));
  const missing = candidateCodes.filter((code) => !existing.has(code.toLowerCase())).slice(0, 80);
  if (!missing.length) return stockFundFlows;
  const result = await tushareAdapter.getFundFlows(missing, tradeDate).catch((error) => ({
    data: [],
    warnings: [`Tushare 璧勯噾娴佽ˉ鍏呭け璐ワ細${toErrorMessage(error)}`]
  }));
  warnings.push(...result.warnings);
  if (!result.data.length) return stockFundFlows;
  const rows = result.data.map((item) => ({
    code: item.code,
    SecuCode: item.code,
    EndDate: item.tradeDate ?? tradeDate,
    MainNetFlow: item.mainNetFlow ?? null,
    MainNetFlow5D: item.mainNetFlow5D ?? null,
    MainNetFlow10D: item.mainNetFlow10D ?? null,
    MainNetFlow20D: item.mainNetFlow20D ?? null,
    source: "tushare_moneyflow_fallback"
  }));
  return appendFallbackRows(stockFundFlows, {
    command: "asfund",
    args: [candidateCodes.join(",")],
    title: "Tushare 璧勯噾娴佽ˉ鍏呭€欓€夎偂",
    columns: ["code", "SecuCode", "EndDate", "MainNetFlow", "MainNetFlow5D", "MainNetFlow10D", "MainNetFlow20D", "source"],
    rows,
    warning: "\u5019\u9009\u80a1\u8d44\u91d1\u6d41\u6570\u636e\u5df2\u7531 Tushare moneyflow \u8865\u5145\u3002"
  });
}

export async function supplementStockFinancialIndicatorsWithTushare(
  stockIncomeStatements: ParsedCommandResult | null,
  candidateCodes: string[],
  period: string,
  warnings: string[]
) {
  if (!candidateCodes.length || !tushareAdapter.isEnabled()) return stockIncomeStatements;
  const existing = new Set(firstMarkdownRows(stockIncomeStatements).map((row) => String(row.symbol ?? row.code ?? "").toLowerCase()).filter(Boolean));
  const missing = candidateCodes.filter((code) => !existing.has(code.toLowerCase())).slice(0, 80);
  if (!missing.length) return stockIncomeStatements;
  const result = await tushareAdapter.getFinancialIndicators(missing, period).catch((error) => ({
    data: [],
    warnings: [`Tushare 璐㈠姟鎸囨爣琛ュ厖澶辫触锛?{toErrorMessage(error)}`]
  }));
  warnings.push(...result.warnings);
  if (!result.data.length) return stockIncomeStatements;
  const rows = result.data.map((item) => ({
    symbol: item.code,
    code: item.code,
    EndDate: item.endDate ?? period,
    _date: item.endDate ?? period,
    roePct: item.roePct ?? null,
    revenueChangePct: item.revenueChangePct ?? null,
    netProfitChangePct: item.netProfitChangePct ?? null,
    grossMarginPct: item.grossMarginPct ?? null,
    debtRatioPct: item.debtRatioPct ?? null,
    source: "tushare_fina_indicator_fallback"
  }));
  return appendFallbackRows(stockIncomeStatements, {
    command: "finance",
    args: [candidateCodes.join(","), "--type", "tushare_fina_indicator"],
    title: "Tushare 璐㈠姟鎸囨爣琛ュ厖鍊欓€夎偂",
    columns: ["symbol", "code", "EndDate", "_date", "roePct", "revenueChangePct", "netProfitChangePct", "grossMarginPct", "debtRatioPct", "source"],
    rows,
    warning: "\u5019\u9009\u80a1\u8d22\u52a1\u6307\u6807\u5df2\u7531 Tushare fina_indicator \u8865\u5145\u3002"
  });
}

export async function supplementStockShareholdersWithTushare(
  stockShareholders: ParsedCommandResult | null,
  candidateCodes: string[],
  tradeDate: string,
  warnings: string[]
) {
  if (!candidateCodes.length || !tushareAdapter.isEnabled()) return stockShareholders;
  const existing = new Set(firstMarkdownRows(stockShareholders).map((row) => String(row.code ?? row.symbol ?? "").toLowerCase()).filter(Boolean));
  const missing = candidateCodes.filter((code) => !existing.has(code.toLowerCase())).slice(0, 80);
  if (!missing.length) return stockShareholders;
  const result = await tushareAdapter.getHolderNumbers(missing, tradeDate).catch((error) => ({
    data: [],
    warnings: [`Tushare 鑲′笢鎴锋暟琛ュ厖澶辫触锛?{toErrorMessage(error)}`]
  }));
  warnings.push(...result.warnings);
  if (!result.data.length) return stockShareholders;
  const rows = result.data.map((item) => ({
    code: item.code,
    date: item.endDate ?? tradeDate,
    totalSHNum: item.holderCount ?? null,
    previousTotalSHNum: item.previousHolderCount ?? null,
    source: "tushare_stk_holdernumber_fallback"
  }));
  return appendFallbackRows(stockShareholders, {
    command: "shareholder",
    args: [candidateCodes.join(","), "--source", "tushare"],
    title: "Tushare \u80a1\u4e1c\u6237\u6570\u8865\u5145\u5019\u9009\u80a1",
    columns: ["code", "date", "totalSHNum", "previousTotalSHNum", "source"],
    rows,
    warning: "\u5019\u9009\u80a1\u80a1\u4e1c\u6237\u6570\u5df2\u7531 Tushare stk_holdernumber \u8865\u5145\u3002"
  });
}

export async function supplementStockKlinesWithEastmoney(
  stockKlines: ParsedCommandResult | null,
  candidateCodes: string[],
  warnings: string[]
) {
  if (!candidateCodes.length) return stockKlines;
  const existing = new Set(firstMarkdownRows(stockKlines).map((row) => String(row.symbol ?? row.code ?? "").toLowerCase()).filter(Boolean));
  const missing = candidateCodes.filter((code) => !existing.has(code.toLowerCase())).slice(0, 80);
  if (!missing.length) return stockKlines;

  const settled = await Promise.all(missing.map(async (code): Promise<FallbackParsedRow | null> => {
    const result = await eastmoneyAdapter.getStockKlines(code, 30).catch((error) => ({ data: null, warnings: [toErrorMessage(error)] }));
    warnings.push(...result.warnings);
    const latest = result.data?.at(-1);
    if (!latest) return null;
    return {
      symbol: code,
      date: latest.date,
      open: latest.open ?? null,
      last: latest.close ?? null,
      high: latest.high ?? null,
      low: latest.low ?? null,
      volume: latest.volume ?? null,
      amount: latest.amount ?? null,
      exchange: latest.turnoverRate ?? null,
      source: "eastmoney_stock_kline_fallback"
    } satisfies FallbackParsedRow;
  }));
  const fallbackRows = settled.filter((row): row is FallbackParsedRow => Boolean(row));
  if (!fallbackRows.length) return stockKlines;

  return appendFallbackRows(stockKlines, {
    command: "kline",
    args: [candidateCodes.join(","), "--period", "day", "--limit", "30"],
    title: "\u4e1c\u65b9\u8d22\u5bcc\u65e5K\u8865\u5145\u5019\u9009\u80a1",
    columns: ["symbol", "date", "open", "last", "high", "low", "volume", "amount", "exchange", "source"],
    rows: fallbackRows,
    warning: "\u5019\u9009\u80a1K\u7ebf\u6570\u636e\u5df2\u7531\u4e1c\u65b9\u8d22\u5bcc\u65e5K\u8865\u5145\u3002"
  });
}

export function supplementStockTechnicalsFromKlines(
  stockTechnicals: ParsedCommandResult | null,
  stockKlines: ParsedCommandResult | null,
  candidateCodes: string[],
  warnings: string[]
) {
  if (!candidateCodes.length) return stockTechnicals;
  const existing = new Set(firstMarkdownRows(stockTechnicals).map((row) => String(row.code ?? row.symbol ?? "").toLowerCase()).filter(Boolean));
  const klineRows = firstMarkdownRows(stockKlines);
  const rowsByCode = new Map<string, Array<Record<string, unknown>>>();
  for (const row of klineRows) {
    const code = String(row.symbol ?? row.code ?? "").toLowerCase();
    if (!code) continue;
    const rows = rowsByCode.get(code) ?? [];
    rows.push(row);
    rowsByCode.set(code, rows);
  }

  const fallbackRows = candidateCodes
    .filter((code) => !existing.has(code.toLowerCase()))
    .map((code) => buildTechnicalFallbackRow(code, rowsByCode.get(code.toLowerCase()) ?? []))
    .filter((row): row is FallbackParsedRow => Boolean(row));
  if (!fallbackRows.length) return stockTechnicals;
  warnings.push(`\u5019\u9009\u80a1\u6280\u672f\u6307\u6807\u4e2d ${fallbackRows.length} \u53ea\u7531K\u7ebf\u672c\u5730\u8ba1\u7b97 MA/MACD/RSI \u515c\u5e95\uff0c\u6765\u6e90\u4ecd\u4e3a\u5df2\u83b7\u53d6K\u7ebf\uff0c\u4e0d\u4f5c\u4e3a\u72ec\u7acb\u5916\u90e8\u6570\u636e\u3002`);
  return appendFallbackRows(stockTechnicals, {
    command: "technical",
    args: [candidateCodes.join(","), "--group", "ma,macd,rsi"],
    title: "K\u7ebf\u672c\u5730\u8ba1\u7b97\u6280\u672f\u6307\u6807\u8865\u5145\u5019\u9009\u80a1",
    columns: ["code", "name", "date", "closePrice", "ma.MA_5", "ma.MA_10", "ma.MA_20", "ma.MA_60", "macd.DIF", "macd.DEA", "macd.MACD", "rsi.RSI_6", "rsi.RSI_12", "rsi.RSI_24", "source"],
    rows: fallbackRows,
    warning: "\u5019\u9009\u80a1\u6280\u672f\u6307\u6807\u5df2\u7531K\u7ebf\u672c\u5730\u8ba1\u7b97\u8865\u5145\u3002"
  });
}

export async function supplementStockFundFlowsWithEastmoney(
  stockFundFlows: ParsedCommandResult | null,
  candidateCodes: string[],
  warnings: string[]
) {
  if (!candidateCodes.length) return stockFundFlows;
  const existing = new Set(firstMarkdownRows(stockFundFlows).map((row) => String(row.code ?? row.SecuCode ?? "").toLowerCase()).filter(Boolean));
  const missing = candidateCodes.filter((code) => !existing.has(code.toLowerCase())).slice(0, 80);
  if (!missing.length) return stockFundFlows;

  const settled = await Promise.all(missing.map(async (code): Promise<FallbackParsedRow | null> => {
    const result = await eastmoneyAdapter.getStockFundFlow(code, 20).catch((error) => ({ data: null, warnings: [toErrorMessage(error)] }));
    warnings.push(...result.warnings);
    const rows = result.data ?? [];
    const latest = rows.at(-1);
    if (!latest) return null;
    return {
      code,
      SecuCode: code,
      EndDate: latest.date,
      ClosePrice: latest.close ?? null,
      LastestTradedPrice: latest.close ?? null,
      MainNetFlow: latest.mainNetFlow ?? null,
      MainNetFlow5D: sumLastFundFlow(rows, 5),
      MainNetFlow10D: sumLastFundFlow(rows, 10),
      MainNetFlow20D: sumLastFundFlow(rows, 20),
      JumboNetFlow: latest.superLargeNetFlow ?? null,
      BlockNetFlow: latest.largeNetFlow ?? null,
      MidNetFlow: latest.mediumNetFlow ?? null,
      SmallNetFlow: latest.smallNetFlow ?? null,
      source: rows.length >= 5 ? "eastmoney_stock_fund_flow_fallback" : "eastmoney_stock_fund_flow_latest_only"
    } satisfies FallbackParsedRow;
  }));
  const fallbackRows = settled.filter((row): row is FallbackParsedRow => Boolean(row));
  if (!fallbackRows.length) return stockFundFlows;

  const latestOnlyCount = fallbackRows.filter((row) => row.source === "eastmoney_stock_fund_flow_latest_only").length;
  if (latestOnlyCount > 0) {
    warnings.push(`东方财富资金流补充中 ${latestOnlyCount} 只仅具备最近一日资金流，连续性需降级参考。`);
  }
  return appendFallbackRows(stockFundFlows, {
    command: "asfund",
    args: [candidateCodes.join(",")],
    title: "\u4e1c\u65b9\u8d22\u5bcc\u8d44\u91d1\u6d41\u8865\u5145\u5019\u9009\u80a1",
    columns: ["code", "SecuCode", "EndDate", "ClosePrice", "LastestTradedPrice", "MainNetFlow", "MainNetFlow5D", "MainNetFlow10D", "MainNetFlow20D", "JumboNetFlow", "BlockNetFlow", "MidNetFlow", "SmallNetFlow", "source"],
    rows: fallbackRows,
    warning: "\u5019\u9009\u80a1\u8d44\u91d1\u6d41\u6570\u636e\u5df2\u7531\u4e1c\u65b9\u8d22\u5bcc\u8d44\u91d1\u6d41\u8865\u5145\u3002"
  });
}

export async function supplementStockProfilesWithEastmoney(
  stockProfiles: ParsedCommandResult | null,
  candidateCodes: string[],
  warnings: string[]
) {
  if (!candidateCodes.length) return stockProfiles;
  const existing = new Set(firstMarkdownRows(stockProfiles).map((row) => String(row.code ?? row.symbol ?? "").toLowerCase()).filter(Boolean));
  const missing = candidateCodes.filter((code) => !existing.has(code.toLowerCase())).slice(0, 80);
  if (!missing.length) return stockProfiles;

  const settled = await Promise.all(missing.map(async (code): Promise<FallbackParsedRow | null> => {
    const result = await eastmoneyAdapter.getCompanyProfile(code).catch((error) => ({ data: null, warnings: [toErrorMessage(error)] }));
    warnings.push(...result.warnings);
    if (!result.data) return null;
    return {
      code,
      name: result.data.name || code,
      industry: result.data.industry ?? null,
      business: result.data.business ?? null,
      businessScope: result.data.businessScope ?? null,
      orgProfile: result.data.orgProfile ?? null,
      mainProducts: result.data.mainProducts?.join("\u3001") ?? null,
      source: "eastmoney_f10_profile_fallback"
    };
  }));
  const fallbackRows = settled.filter((row): row is FallbackParsedRow => Boolean(row));
  if (!fallbackRows.length) return stockProfiles;

  return appendFallbackRows(stockProfiles, {
    command: "profile",
    args: [candidateCodes.join(",")],
    title: "\u4e1c\u65b9\u8d22\u5bccF10\u8865\u5145\u516c\u53f8\u6982\u51b5",
    columns: ["code", "name", "industry", "business", "businessScope", "orgProfile", "mainProducts", "source"],
    rows: fallbackRows,
    warning: "\u5019\u9009\u80a1\u516c\u53f8\u57fa\u7840\u4fe1\u606f\u5df2\u7531\u4e1c\u65b9\u8d22\u5bccF10\u8865\u5145\u3002"
  });
}

function extractHotStockCodes(hotStocks: Awaited<ReturnType<typeof westockAdapter.getHotStocks>>) {
  const rows = hotStocks.sections.find((section) => section.type === "markdownTable")?.rows ?? [];
  return rows
    .filter((row) => String(row.stock_type ?? "").includes("GP-A"))
    .filter((row) => !String(row.name ?? "").includes("ST"))
    .map((row) => String(row.code));
}

export function extractCandidateStockCodes(
  hotStocks: Awaited<ReturnType<typeof westockAdapter.getHotStocks>>,
  sectorConstituents: SectorConstituentSnapshot[]
) {
  const codes = new Map<string, string>();
  for (const sector of sectorConstituents.slice(0, 8)) {
    const leaders = [...sector.stocks]
      .sort((left, right) => {
        const leftLimit = (left.changePct ?? 0) >= 9.8 ? 1 : 0;
        const rightLimit = (right.changePct ?? 0) >= 9.8 ? 1 : 0;
        if (rightLimit !== leftLimit) return rightLimit - leftLimit;
        const changeDelta = (right.changePct ?? -99) - (left.changePct ?? -99);
        if (Math.abs(changeDelta) > 0.01) return changeDelta;
        const fundDelta = (right.mainNetInflow ?? 0) - (left.mainNetInflow ?? 0);
        if (Math.abs(fundDelta) > 1000000) return fundDelta;
        return (right.amount ?? 0) - (left.amount ?? 0);
      })
      .slice(0, 8);
    for (const stock of leaders) {
      const code = stock.marketCode || stock.code;
      if (code) codes.set(code.toLowerCase(), code);
    }
  }
  for (const code of extractHotStockCodes(hotStocks).slice(0, 30)) {
    codes.set(code.toLowerCase(), code);
  }
  return Array.from(codes.values());
}

function buildTechnicalFallbackRow(code: string, rows: Array<Record<string, unknown>>): FallbackParsedRow | null {
  const sorted = [...rows]
    .filter((row) => Number.isFinite(Number(row.last)))
    .sort((left, right) => String(left.date ?? "").localeCompare(String(right.date ?? "")));
  if (sorted.length < 5) return null;
  const closes = sorted.map((row) => Number(row.last));
  const latest = sorted.at(-1)!;
  const macd = calculateMacd(closes);
  return {
    code,
    name: String(latest.name ?? ""),
    date: String(latest.date ?? ""),
    closePrice: closes.at(-1) ?? null,
    "ma.MA_5": averageLast(closes, 5),
    "ma.MA_10": averageLast(closes, 10),
    "ma.MA_20": averageLast(closes, 20),
    "ma.MA_60": averageLast(closes, 60),
    "macd.DIF": macd?.dif ?? null,
    "macd.DEA": macd?.dea ?? null,
    "macd.MACD": macd?.macd ?? null,
    "rsi.RSI_6": calculateRsi(closes, 6),
    "rsi.RSI_12": calculateRsi(closes, 12),
    "rsi.RSI_24": calculateRsi(closes, 24),
    source: "local_from_kline_fallback"
  };
}

function averageLast(values: number[], count: number) {
  const slice = values.slice(-count);
  if (!slice.length) return null;
  return Number((slice.reduce((sum, value) => sum + value, 0) / slice.length).toFixed(4));
}

function calculateEma(values: number[], period: number) {
  if (!values.length) return [];
  const multiplier = 2 / (period + 1);
  const ema: number[] = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    ema.push((values[index] - ema[index - 1]) * multiplier + ema[index - 1]);
  }
  return ema;
}

function calculateMacd(closes: number[]) {
  if (closes.length < 26) return null;
  const ema12 = calculateEma(closes, 12);
  const ema26 = calculateEma(closes, 26);
  const difSeries = closes.map((_, index) => (ema12[index] ?? 0) - (ema26[index] ?? 0));
  const deaSeries = calculateEma(difSeries, 9);
  const dif = difSeries.at(-1) ?? 0;
  const dea = deaSeries.at(-1) ?? 0;
  return {
    dif: Number(dif.toFixed(4)),
    dea: Number(dea.toFixed(4)),
    macd: Number(((dif - dea) * 2).toFixed(4))
  };
}

function calculateRsi(closes: number[], period: number) {
  if (closes.length <= period) return null;
  const recent = closes.slice(-(period + 1));
  let gains = 0;
  let losses = 0;
  for (let index = 1; index < recent.length; index += 1) {
    const delta = recent[index] - recent[index - 1];
    if (delta > 0) gains += delta;
    else losses += Math.abs(delta);
  }
  if (gains + losses === 0) return 50;
  return Number(((gains / (gains + losses)) * 100).toFixed(2));
}
