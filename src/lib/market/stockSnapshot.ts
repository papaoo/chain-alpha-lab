import { eastmoneyAdapter } from "@/lib/eastmoney/adapter";
import { effectiveTradeDateForSession, inferMarketSessionContext } from "@/lib/market/session";
import { evaluateFundFlowQuality, inferFundFlow, inferTrend, parseFundFlow } from "@/lib/strategy/stockDataRules";
import { tushareAdapter } from "@/lib/tushare/adapter";
import { westockAdapter } from "@/lib/westock/adapter";
import type { StockCandidate, StockFundFlowSnapshot, StockTechnicalSnapshot } from "@/lib/types";

export interface StockRealtimeSnapshot {
  code: string;
  normalizedCode: string;
  latestPrice?: number;
  changePct?: number;
  amount?: number;
  turnoverRate?: number;
  mainNetInflow?: number;
  trendState?: StockCandidate["trendState"];
  fundFlowState?: StockCandidate["fundFlowState"];
  technical?: StockTechnicalSnapshot;
  fundFlow?: StockFundFlowSnapshot;
  source: string;
  fetchedAt: string;
  quoteUpdatedAt?: string;
  quality: "complete" | "partial" | "quote_only" | "missing";
  qualityLabel: string;
  actionability: {
    level: "actionable" | "reference_only" | "not_actionable";
    label: string;
    reason: string;
    ageMinutes?: number;
    staleAfterMinutes: number;
    sessionPhase?: string;
  };
  coverage: {
    quote: boolean;
    kline: boolean;
    technical: boolean;
    fundFlow: boolean;
  };
  warnings: string[];
  raw?: {
    quote?: unknown;
    klineSource?: string;
    latestKlineDate?: string;
    expectedKlineDate?: string;
    klineFreshnessStatus?: "current" | "stale" | "unknown";
    quoteSource?: string;
    quoteUpdatedAt?: string;
    fundFlowSource?: string;
  };
}

export async function fetchStockRealtimeSnapshot(code: string): Promise<StockRealtimeSnapshot> {
  const fetchedAt = new Date().toISOString();
  const normalizedCode = normalizeAshareCode(code);
  const warnings: string[] = [];
  const [quotes, eastmoneyKlines, fundFlows] = await Promise.all([
    eastmoneyAdapter.getStockQuotes([normalizedCode], { timeoutMs: 12000, retries: 1 }).catch((error) => ({
      data: null,
      warnings: [`东方财富个股报价失败：${errorMessage(error)}`]
    })),
    eastmoneyAdapter.getStockKlines(normalizedCode, 80, { timeoutMs: 12000, retries: 1 }).catch((error) => ({
      data: null,
      warnings: [`东方财富日K失败：${errorMessage(error)}`]
    })),
    eastmoneyAdapter.getStockFundFlow(normalizedCode, 20, { timeoutMs: 12000, retries: 1 }).catch((error) => ({
      data: null,
      warnings: [`东方财富资金流失败：${errorMessage(error)}`]
    }))
  ]);
  warnings.push(...(quotes.warnings ?? []), ...(eastmoneyKlines.warnings ?? []), ...(fundFlows.warnings ?? []));

  const klineResult = eastmoneyKlines.data?.length
    ? { rows: eastmoneyKlines.data, source: "eastmoney:stock-kline", warnings: [] as string[] }
    : await fetchWestockKlines(normalizedCode);
  warnings.push(...klineResult.warnings);

  const quote = quotes.data?.[0];
  const technical = buildTechnicalFromKlines(klineResult.rows, quote?.latest, warnings);
  const fundFlowResult = await fetchFundFlowWithFallback(
    normalizedCode,
    fundFlows.data ?? [],
    klineResult.rows,
    quote?.updatedAt
  );
  warnings.push(...fundFlowResult.warnings);
  const fundFlow = fundFlowResult.fundFlow;
  const fundFlowQuality = evaluateFundFlowQuality(fundFlow);
  const trendState = inferTrend(technical);
  const fundFlowState = inferFundFlow(fundFlow, fundFlowQuality);
  const latestKline = klineResult.rows.at(-1);
  const expectedKlineDate = expectedKlineTradeDate(fetchedAt);
  const klineFreshnessStatus = inferKlineFreshness(latestKline?.date, expectedKlineDate);
  const coverage = {
    quote: Boolean(quote?.latest),
    kline: Boolean(klineResult.rows.length),
    technical: Boolean(technical),
    fundFlow: Boolean(fundFlow)
  };
  const quality = stockSnapshotQuality(coverage);
  const normalizedWarnings = uniqueWarnings(warnings);
  const actionability = stockSnapshotActionability({
    quality,
    coverage,
    quoteUpdatedAt: quote?.updatedAt,
    fetchedAt,
    warnings: normalizedWarnings
  });
  const source = buildSnapshotSource({
    quote: coverage.quote,
    fundFlowSource: fundFlowResult.source,
    klineSource: klineResult.source
  });

  return {
    code,
    normalizedCode,
    latestPrice: quote?.latest ?? latestKline?.close,
    changePct: quote?.changePct ?? latestKline?.changePct,
    amount: quote?.amount ?? latestKline?.amount,
    turnoverRate: quote?.turnoverRate ?? latestKline?.turnoverRate,
    mainNetInflow: fundFlow?.mainNetFlow ?? quote?.mainNetInflow,
    trendState,
    fundFlowState,
    technical,
    fundFlow,
    source,
    fetchedAt,
    quoteUpdatedAt: quote?.updatedAt,
    quality,
    qualityLabel: stockSnapshotQualityLabel(quality),
    actionability,
    coverage,
    warnings: normalizedWarnings,
    raw: {
      quote,
      klineSource: klineResult.source,
      latestKlineDate: latestKline?.date,
      expectedKlineDate,
      klineFreshnessStatus,
      quoteSource: "eastmoney:stock-quote",
      quoteUpdatedAt: quote?.updatedAt,
      fundFlowSource: fundFlowResult.source
    }
  };
}

export async function fetchStockRealtimeSnapshots(codes: string[]) {
  const uniqueCodes = Array.from(new Set(codes.map(normalizeAshareCode).filter(Boolean))).slice(0, 80);
  if (uniqueCodes.length <= 1) {
    const results = await Promise.all(uniqueCodes.map((code) => fetchStockRealtimeSnapshot(code)));
    return Object.fromEntries(results.map((item) => [item.normalizedCode, item]));
  }
  const batch = await fetchStockRealtimeSnapshotsBatch(uniqueCodes);
  const missingCodes = uniqueCodes.filter((code) => !batch[code] || batch[code].quality === "missing");
  if (!missingCodes.length) return batch;
  const fallbackResults = await Promise.all(missingCodes.map((code) => fetchStockRealtimeSnapshot(code)));
  return {
    ...batch,
    ...Object.fromEntries(fallbackResults.map((item) => [item.normalizedCode, item]))
  };
}

async function fetchStockRealtimeSnapshotsBatch(uniqueCodes: string[]) {
  const fetchedAt = new Date().toISOString();
  const expectedKlineDate = expectedKlineTradeDate(fetchedAt);
  const [quotes, klineResult, fundFlowResult] = await Promise.all([
    eastmoneyAdapter.getStockQuotes(uniqueCodes, { timeoutMs: 18000, retries: 1 }).catch((error) => ({
      data: null,
      warnings: [`东方财富批量报价失败：${errorMessage(error)}`]
    })),
    fetchWestockKlinesBatch(uniqueCodes),
    fetchWestockFundFlowsBatch(uniqueCodes)
  ]);
  const quoteRows = new Map((quotes.data ?? []).map((quote) => [normalizeAshareCode(quote.marketCode || quote.code), quote]));
  const results: StockRealtimeSnapshot[] = uniqueCodes.map((code) => {
    const warnings = uniqueWarnings([
      ...(quotes.warnings ?? []),
      ...(klineResult.warningsByCode.get(code) ?? []),
      ...(fundFlowResult.warningsByCode.get(code) ?? [])
    ]);
    const quote = quoteRows.get(code);
    const rows = klineResult.rowsByCode.get(code) ?? [];
    const fundFlow = fundFlowResult.fundFlowByCode.get(code);
    const technical = buildTechnicalFromKlines(rows, quote?.latest, warnings);
    const fundFlowQuality = evaluateFundFlowQuality(fundFlow);
    const latestKline = rows.at(-1);
    const klineFreshnessStatus = inferKlineFreshness(latestKline?.date, expectedKlineDate);
    const coverage = {
      quote: Boolean(quote?.latest),
      kline: Boolean(rows.length),
      technical: Boolean(technical),
      fundFlow: Boolean(fundFlow)
    };
    const quality = stockSnapshotQuality(coverage);
    const actionability = stockSnapshotActionability({
      quality,
      coverage,
      quoteUpdatedAt: quote?.updatedAt,
      fetchedAt,
      warnings
    });
    return {
      code,
      normalizedCode: code,
      latestPrice: quote?.latest ?? latestKline?.close,
      changePct: quote?.changePct ?? latestKline?.changePct,
      amount: quote?.amount ?? latestKline?.amount,
      turnoverRate: quote?.turnoverRate ?? latestKline?.turnoverRate,
      mainNetInflow: fundFlow?.mainNetFlow ?? quote?.mainNetInflow,
      trendState: inferTrend(technical),
      fundFlowState: inferFundFlow(fundFlow, fundFlowQuality),
      technical,
      fundFlow,
      source: buildSnapshotSource({
        quote: coverage.quote,
        fundFlowSource: fundFlowResult.sourceByCode.get(code) ?? "fund-flow:missing",
        klineSource: klineResult.sourceByCode.get(code) ?? "kline:missing"
      }),
      fetchedAt,
      quoteUpdatedAt: quote?.updatedAt,
      quality,
      qualityLabel: stockSnapshotQualityLabel(quality),
      actionability,
      coverage,
      warnings,
      raw: {
        quote,
        klineSource: klineResult.sourceByCode.get(code),
        latestKlineDate: latestKline?.date,
        expectedKlineDate,
        klineFreshnessStatus,
        quoteSource: "eastmoney:stock-quote",
        quoteUpdatedAt: quote?.updatedAt,
        fundFlowSource: fundFlowResult.sourceByCode.get(code)
      }
    };
  });
  return Object.fromEntries(results.map((item) => [item.normalizedCode, item]));
}

export function buildRealtimeSnapshotReason(snapshot: StockRealtimeSnapshot) {
  const parts = [
    snapshot.latestPrice !== undefined ? "已补最新报价" : "报价缺失",
    snapshot.technical ? `趋势${stockSnapshotTrendLabel(snapshot.trendState)}` : "K线/技术缺失",
    snapshot.fundFlow ? `资金${stockSnapshotFundFlowLabel(snapshot.fundFlowState)}` : "资金流缺失",
    `质量=${snapshot.qualityLabel}`
  ];
  if (snapshot.warnings.length) parts.push(`警告${snapshot.warnings.length}条`);
  return `已用统一行情快照补数：${parts.join("；")}。`;
}

function stockSnapshotTrendLabel(value?: string) {
  if (value === "uptrend") return "上升趋势";
  if (value === "downtrend") return "下降趋势";
  if (value === "above_ma20") return "站上 MA20";
  if (value === "below_ma20") return "跌破 MA20";
  if (value === "reclaim_ma20") return "收复 MA20";
  if (value === "range") return "震荡";
  return "未知";
}

function stockSnapshotFundFlowLabel(value?: string) {
  if (value === "inflow") return "流入";
  if (value === "outflow") return "流出";
  if (value === "flat") return "平稳";
  if (value === "mixed") return "分歧";
  return "未知";
}

function stockSnapshotQuality(coverage: StockRealtimeSnapshot["coverage"]): StockRealtimeSnapshot["quality"] {
  if (coverage.quote && coverage.kline && coverage.technical && coverage.fundFlow) return "complete";
  if (coverage.quote && (coverage.kline || coverage.technical || coverage.fundFlow)) return "partial";
  if (coverage.quote) return "quote_only";
  return "missing";
}

function stockSnapshotQualityLabel(quality: StockRealtimeSnapshot["quality"]) {
  if (quality === "complete") return "报价/K线/技术/资金完整";
  if (quality === "partial") return "部分实时补齐";
  if (quality === "quote_only") return "仅有报价";
  return "关键行情缺失";
}

export function __testStockSnapshotActionability(input: {
  quality: StockRealtimeSnapshot["quality"];
  coverage: StockRealtimeSnapshot["coverage"];
  quoteUpdatedAt?: string;
  fetchedAt: string;
  warnings: string[];
  now?: string;
}) {
  return stockSnapshotActionability(input);
}

function stockSnapshotActionability(input: {
  quality: StockRealtimeSnapshot["quality"];
  coverage: StockRealtimeSnapshot["coverage"];
  quoteUpdatedAt?: string;
  fetchedAt: string;
  warnings: string[];
  now?: string;
}): StockRealtimeSnapshot["actionability"] {
  const staleAfterMinutes = 30;
  const basisTime = input.quoteUpdatedAt ?? input.fetchedAt;
  const now = input.now ?? new Date().toISOString();
  const session = inferMarketSessionContext(now);
  const ageMinutes = ageMinutesFromIso(basisTime, now);
  const riskWarnings = input.warnings.filter(isStockSnapshotRiskWarning);
  const hasRiskWarning = riskWarnings.length > 0;
  const missingQuote = !input.coverage.quote;
  const isStale = ageMinutes !== undefined && ageMinutes > staleAfterMinutes;
  const missingDecisionFields = !input.coverage.technical || !input.coverage.fundFlow;
  const nonRealtimePhase = !session.canUseRealtimeQuotes;
  const hasDecisionFields = input.coverage.technical && input.coverage.fundFlow;

  if (input.quality === "missing" || missingQuote) {
    return {
      level: "not_actionable",
      label: "不可用于行动",
      reason: missingQuote ? "缺少有效报价，不能用于买卖或涨跌验证。" : "关键行情字段缺失。",
      ageMinutes,
      staleAfterMinutes,
      sessionPhase: session.phase
    };
  }

  if (nonRealtimePhase && hasDecisionFields && !hasRiskWarning) {
    return {
      level: "reference_only",
      label: session.phase === "postmarket" ? "收盘复盘可用" : session.phase === "midday_break" ? "午间复盘可用" : "研究可参考",
      reason: stockSnapshotSessionReferenceReason(session.phase),
      ageMinutes,
      staleAfterMinutes,
      sessionPhase: session.phase
    };
  }

  if (isStale || hasRiskWarning || input.quality === "quote_only" || missingDecisionFields) {
    return {
      level: "reference_only",
      label: "仅可参考",
      reason: hasRiskWarning
        ? "存在主源失败、补源或缺失警告，字段可观察但不应直接触发买卖动作。"
        : isStale
        ? `行情时间已超过 ${staleAfterMinutes} 分钟，适合观察，不适合直接触发行动。`
        : "报价可用，但技术或资金字段不完整，只适合作为观察参考。",
      ageMinutes,
      staleAfterMinutes,
      sessionPhase: session.phase
    };
  }

  return {
    level: "actionable",
    label: "可用于当前判断",
    reason: "报价、技术和资金字段覆盖较完整，且时间未明显过期。",
    ageMinutes,
    staleAfterMinutes,
    sessionPhase: session.phase
  };
}

function isStockSnapshotRiskWarning(warning: string) {
  if (/已使用|兜底|批量路径未使用/i.test(warning)) return false;
  return /fetch failed|timeout|error|failed|失败|缺失|空数据|未返回|偏离超过|不采用/i.test(warning);
}

function stockSnapshotSessionReferenceReason(phase: string) {
  if (phase === "postmarket") return "当前处于收盘后，快照用于正式复盘和次日计划，不应解释为盘中实时买卖信号。";
  if (phase === "midday_break") return "当前处于午间休盘，上午快照可用于半日复盘，下午仍需重新验证承接。";
  if (phase === "premarket" || phase === "call_auction") return "当前尚未进入连续竞价，快照主要反映上一交易日或竞价参考，不应用作盘中确认。";
  if (phase === "night_research" || phase === "non_trading_day") return "当前不是 A 股连续交易时段，快照用于研究、复盘和候选维护，不用于实时行动。";
  return "当前不处于连续交易时段，快照只适合观察和复盘。";
}

function ageMinutesFromIso(value?: string, now = new Date().toISOString()) {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  const nowTime = new Date(now).getTime();
  if (!Number.isFinite(time)) return undefined;
  if (!Number.isFinite(nowTime)) return undefined;
  return Math.max(0, Math.round((nowTime - time) / 60_000));
}

function buildSnapshotSource(input: { quote: boolean; fundFlowSource: string; klineSource: string }) {
  const parts = [
    input.quote ? "eastmoney:stock-quote" : "quote:missing",
    input.fundFlowSource,
    input.klineSource
  ];
  return parts.join("; ");
}

function uniqueWarnings(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function buildTechnicalFromKlines(rows: Array<{ close?: number; date?: string }>, quoteLatest?: number, warnings: string[] = []): StockTechnicalSnapshot | undefined {
  const sortedRows = [...rows].sort((left, right) => String(left.date ?? "").localeCompare(String(right.date ?? "")));
  const closes = sortedRows.map((row) => finiteNumber(row.close)).filter((value): value is number => value !== undefined);
  if (closes.length < 5) return undefined;
  const latestClose = closes.at(-1);
  if (quoteLatest !== undefined && latestClose !== undefined && Math.abs(((latestClose - quoteLatest) / quoteLatest) * 100) > 12) {
    warnings.push(`K线最新收盘价 ${latestClose} 与报价 ${quoteLatest} 偏离超过12%，本次不采用K线技术兜底。`);
    return undefined;
  }
  const macd = calculateMacd(closes);
  return {
    closePrice: closes.at(-1),
    ma5: averageLast(closes, 5),
    ma10: averageLast(closes, 10),
    ma20: averageLast(closes, 20),
    ma60: averageLast(closes, 60),
    macdDif: macd?.dif,
    macdDea: macd?.dea,
    macd: macd?.macd
  };
}

function expectedKlineTradeDate(timestamp: string) {
  const session = inferMarketSessionContext(timestamp);
  return effectiveTradeDateForSession(timestamp, session);
}

function inferKlineFreshness(latestKlineDate?: string, expectedKlineDate?: string): "current" | "stale" | "unknown" {
  const latest = normalizeTradeDate(latestKlineDate);
  const expected = normalizeTradeDate(expectedKlineDate);
  if (!latest || !expected) return "unknown";
  return latest < expected ? "stale" : "current";
}

async function fetchWestockKlines(code: string): Promise<{
  rows: Array<{ date?: string; close?: number; changePct?: number; amount?: number; turnoverRate?: number }>;
  source: string;
  warnings: string[];
}> {
  const result = await westockAdapter.kline(normalizeAshareCode(code), 80, { timeoutMs: 90000, retries: 1 }).catch((error) => ({
    status: "failed" as const,
    sections: [],
    warnings: [`westock K线兜底失败：${errorMessage(error)}`]
  }));
  const rows = result.sections.flatMap((section) => section.rows ?? []).map((row) => ({
    date: typeof row.date === "string" ? row.date : undefined,
    close: finiteNumber(row.last ?? row.close ?? row.zxj),
    changePct: finiteNumber(row.changePct ?? row.zdf),
    amount: finiteNumber(row.amount),
    turnoverRate: finiteNumber(row.turnoverRate ?? row.hsl)
  })).filter((row) => row.close !== undefined);
  const warnings = [
    ...(result.warnings ?? []),
    ...(rows.length ? ["东方财富K线缺失，已使用westock-data K线兜底。"] : ["东方财富K线缺失，westock-data K线兜底也未返回有效收盘价。"])
  ];
  return {
    rows,
    source: rows.length ? "westock-data:kline-fallback" : "kline:missing",
    warnings
  };
}

async function fetchWestockKlinesBatch(codes: string[]): Promise<{
  rowsByCode: Map<string, Array<{ date?: string; close?: number; changePct?: number; amount?: number; turnoverRate?: number }>>;
  sourceByCode: Map<string, string>;
  warningsByCode: Map<string, string[]>;
}> {
  const result = await westockAdapter.getStockKlines(codes, 80, { timeoutMs: 120000, retries: 1 }).catch((error) => ({
    status: "failed" as const,
    sections: [],
    warnings: [`westock batch K-line fallback failed: ${errorMessage(error)}`]
  }));
  const rowsByCode = new Map<string, Array<{ date?: string; close?: number; changePct?: number; amount?: number; turnoverRate?: number }>>();
  for (const section of result.sections) {
    for (const row of section.rows ?? []) {
      const code = normalizeAshareCode(String(row.symbol ?? row.code ?? row.SecuCode ?? ""));
      if (!codes.includes(code)) continue;
      const parsed = {
        date: typeof row.date === "string" ? row.date : undefined,
        close: finiteNumber(row.last ?? row.close ?? row.zxj),
        changePct: finiteNumber(row.changePct ?? row.zdf),
        amount: finiteNumber(row.amount),
        turnoverRate: finiteNumber(row.turnoverRate ?? row.hsl ?? row.exchange)
      };
      if (parsed.close === undefined) continue;
      const list = rowsByCode.get(code) ?? [];
      list.push(parsed);
      rowsByCode.set(code, list);
    }
  }
  const sourceByCode = new Map<string, string>();
  const warningsByCode = new Map<string, string[]>();
  for (const code of codes) {
    const rows = (rowsByCode.get(code) ?? []).sort((left, right) => String(left.date ?? "").localeCompare(String(right.date ?? "")));
    rowsByCode.set(code, rows);
    const hasRows = rows.length > 0;
    sourceByCode.set(code, hasRows ? "westock-data:kline-batch" : "kline:missing");
    warningsByCode.set(code, [
      ...(result.warnings ?? []),
      hasRows ? "东方财富K线批量路径未使用，已使用 westock-data K线。" : "westock-data 批量K线未返回有效收盘价。"
    ]);
  }
  return { rowsByCode, sourceByCode, warningsByCode };
}

async function fetchWestockFundFlowsBatch(codes: string[]): Promise<{
  fundFlowByCode: Map<string, StockFundFlowSnapshot>;
  sourceByCode: Map<string, string>;
  warningsByCode: Map<string, string[]>;
}> {
  const result = await westockAdapter.getStockFundFlows(codes, { timeoutMs: 120000, retries: 1 }).catch((error) => ({
    status: "failed" as const,
    sections: [],
    warnings: [`westock batch fund-flow fallback failed: ${errorMessage(error)}`]
  }));
  const fundFlowByCode = new Map<string, StockFundFlowSnapshot>();
  for (const section of result.sections) {
    for (const row of section.rows ?? []) {
      const code = normalizeAshareCode(String(row.code ?? row.SecuCode ?? row.symbol ?? ""));
      if (!codes.includes(code)) continue;
      const fundFlow = parseFundFlow(row);
      if (fundFlow?.mainNetFlow !== undefined) fundFlowByCode.set(code, fundFlow);
    }
  }
  const sourceByCode = new Map<string, string>();
  const warningsByCode = new Map<string, string[]>();
  for (const code of codes) {
    const hasFundFlow = fundFlowByCode.has(code);
    sourceByCode.set(code, hasFundFlow ? "westock-data:asfund-batch" : "fund-flow:missing");
    warningsByCode.set(code, [
      ...(result.warnings ?? []),
      hasFundFlow ? "东方财富资金流批量路径未使用，已使用 westock-data 资金流。" : "westock-data 批量资金流未返回有效主力净流入。"
    ]);
  }
  return { fundFlowByCode, sourceByCode, warningsByCode };
}

function buildFundFlow(rows: Array<{
  mainNetFlow?: number;
  superLargeNetFlow?: number;
  largeNetFlow?: number;
}>): StockFundFlowSnapshot | undefined {
  if (!rows.length) return undefined;
  const latest = rows.at(-1)!;
  return {
    mainNetFlow: latest.mainNetFlow,
    mainNetFlow5D: sumLast(rows, "mainNetFlow", 5),
    mainNetFlow10D: sumLast(rows, "mainNetFlow", 10),
    mainNetFlow20D: sumLast(rows, "mainNetFlow", 20),
    jumboNetFlow: latest.superLargeNetFlow,
    blockNetFlow: latest.largeNetFlow,
    lhbInfos: []
  };
}

async function fetchFundFlowWithFallback(
  code: string,
  eastmoneyRows: Array<{
    mainNetFlow?: number;
    superLargeNetFlow?: number;
    largeNetFlow?: number;
  }>,
  klineRows: Array<{ date?: string }>,
  quoteUpdatedAt?: string
): Promise<{ fundFlow?: StockFundFlowSnapshot; source: string; warnings: string[] }> {
  const eastmoneyFundFlow = buildFundFlow(eastmoneyRows);
  if (eastmoneyFundFlow?.mainNetFlow !== undefined) {
    return { fundFlow: eastmoneyFundFlow, source: "eastmoney:stock-fund-flow", warnings: [] };
  }

  const warnings: string[] = [];
  const westockResult = await westockAdapter.getStockFundFlows([code], { timeoutMs: 90000, retries: 1 }).catch((error) => ({
    status: "failed" as const,
    sections: [],
    warnings: [`westock fund-flow fallback failed: ${errorMessage(error)}`]
  }));
  warnings.push(...(westockResult.warnings ?? []));
  const westockRows = westockResult.sections.flatMap((section) => section.rows ?? []);
  const westockRow = westockRows.find((row) => normalizeAshareCode(String(row.code ?? row.SecuCode ?? "")) === code) ?? westockRows[0];
  const westockFundFlow = parseFundFlow(westockRow);
  if (westockFundFlow?.mainNetFlow !== undefined) {
    warnings.push("东方财富资金流缺失，已使用 westock-data 资金流兜底。");
    return { fundFlow: westockFundFlow, source: "westock-data:asfund-fallback", warnings };
  }

  const tradeDate = compactTradeDateFromSnapshot(quoteUpdatedAt, klineRows);
  if (tradeDate) {
    const tushareResult = await tushareAdapter.getFundFlows([code], tradeDate).catch((error) => ({
      data: [],
      warnings: [`Tushare fund-flow fallback failed: ${errorMessage(error)}`]
    }));
    warnings.push(...(tushareResult.warnings ?? []));
    const tushareFund = tushareResult.data.find((item) => item.code === code);
    if (tushareFund?.mainNetFlow !== undefined) {
      warnings.push("东方财富/westock 资金流缺失，已使用 Tushare moneyflow 兜底。");
      return {
        fundFlow: {
          mainNetFlow: tushareFund.mainNetFlow,
          mainNetFlow5D: tushareFund.mainNetFlow5D,
          mainNetFlow10D: tushareFund.mainNetFlow10D,
          mainNetFlow20D: tushareFund.mainNetFlow20D,
          lhbInfos: []
        },
        source: "tushare:moneyflow-fallback",
        warnings
      };
    }
  }

  warnings.push("资金流缺失：东方财富、westock-data、Tushare 均未返回有效主力净流入。");
  return { source: "fund-flow:missing", warnings };
}

function compactTradeDateFromSnapshot(quoteUpdatedAt: string | undefined, klineRows: Array<{ date?: string }>) {
  const quoteDate = compactDate(quoteUpdatedAt);
  if (quoteDate) return quoteDate;
  const sortedDates = klineRows
    .map((row) => compactDate(row.date))
    .filter((value): value is string => Boolean(value))
    .sort();
  return sortedDates.at(-1);
}

function compactDate(value: string | undefined) {
  if (!value) return undefined;
  const compact = value.match(/\d{8}/)?.[0];
  if (compact) return compact;
  const dashed = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (dashed) return `${dashed[1]}${dashed[2]}${dashed[3]}`;
  return undefined;
}

function sumLast<T extends Record<string, unknown>>(rows: T[], key: keyof T, count: number) {
  const values = rows.slice(-count).map((row) => finiteNumber(row[key]));
  const present = values.filter((value): value is number => value !== undefined);
  if (!present.length) return undefined;
  return present.reduce((sum, value) => sum + value, 0);
}

function averageLast(values: number[], count: number) {
  const slice = values.slice(-count);
  if (!slice.length) return undefined;
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

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeTradeDate(value?: string) {
  if (!value) return undefined;
  const compact = String(value).replace(/[./-]/g, "");
  return /^\d{8}$/.test(compact) ? compact : undefined;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function normalizeAshareCode(code: string) {
  const normalized = code.trim().toLowerCase();
  if (/^(sh|sz|bj)\d{6}$/.test(normalized)) return normalized;
  const digits = normalized.match(/\d{6}/)?.[0] ?? normalized;
  if (/^6/.test(digits)) return `sh${digits}`;
  if (/^[489]/.test(digits)) return `bj${digits}`;
  return `sz${digits}`;
}
