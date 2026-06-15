import type { Fact, MarketIndexSnapshot } from "@/lib/types";
import type { ParsedCommandResult } from "@/lib/westock/parser";
import { ZH } from "@/lib/strategy/support";
import { average, calculateVolatility20, firstTableRows, numberValue, pushFact, rowMap, sortRowsByDateDesc } from "@/lib/strategy/utils";

export function buildIndexSnapshots(results: ParsedCommandResult[], facts: Fact[], technicalResult?: ParsedCommandResult | null): MarketIndexSnapshot[] {
  const names: Record<string, string> = {
    sh000001: ZH.sh,
    sz399001: ZH.sz,
    sz399006: ZH.cyb,
    sh000688: ZH.kcb
  };
  const technicalRows = rowMap(technicalResult);

  return results.map((result) => {
    const rows = sortRowsByDateDesc(firstTableRows(result));
    const row = rows[0];
    const code = String(result.args[0] || "unknown");
    const technical = technicalRows.get(code);
    const close = numberValue(technical?.closePrice) ?? numberValue(row?.last);
    const previousClose = numberValue(rows[1]?.last);
    const closes = rows.map((item) => numberValue(item.last)).filter((value): value is number => value !== undefined);
    const highs = rows.map((item) => numberValue(item.high)).filter((value): value is number => value !== undefined);
    const lows = rows.map((item) => numberValue(item.low)).filter((value): value is number => value !== undefined);
    const amounts = rows.map((item) => numberValue(item.amount)).filter((value): value is number => value !== undefined);
    const ma5 = numberValue(technical?.["ma.MA_5"]) ?? average(closes.slice(0, 5));
    const ma10 = numberValue(technical?.["ma.MA_10"]) ?? average(closes.slice(0, 10));
    const ma20Fallback = closes.length >= 20 ? average(closes.slice(0, 20)) : undefined;
    const ma60Fallback = closes.length >= 60 ? average(closes.slice(0, 60)) : undefined;
    const ma20 = numberValue(technical?.["ma.MA_20"]) ?? ma20Fallback;
    const ma60 = numberValue(technical?.["ma.MA_60"]) ?? ma60Fallback;
    const ma120 = numberValue(technical?.["ma.MA_120"]);
    const ma250 = numberValue(technical?.["ma.MA_250"]);
    const ma20FiveDaysAgo = closes.length >= 25 ? average(closes.slice(5, 25)) : undefined;
    const ma20SlopePct = ma20 !== undefined && ma20FiveDaysAgo ? Number((((ma20 - ma20FiveDaysAgo) / ma20FiveDaysAgo) * 100).toFixed(2)) : undefined;
    const recentHighs = highs.slice(0, 20);
    const recentLows = lows.slice(0, 20);
    const high20 = recentHighs.length ? Math.max(...recentHighs) : undefined;
    const low20 = recentLows.length ? Math.min(...recentLows) : undefined;
    const momentum20 = close !== undefined && high20 !== undefined && low20 !== undefined && high20 > low20
      ? Number(((close - low20) / (high20 - low20)).toFixed(2))
      : undefined;
    const amountBase = amounts.length >= 21 ? average(amounts.slice(1, 21)) : amounts.length >= 2 ? average(amounts.slice(1)) : undefined;
    const volumeRatio20 = amounts[0] !== undefined && amountBase ? Number((amounts[0] / amountBase).toFixed(2)) : undefined;
    const volatility20 = calculateVolatility20(closes);
    const bullAlignment = close !== undefined && ma5 !== undefined && ma20 !== undefined && ma60 !== undefined ? close > ma5 && ma5 > ma20 && ma20 > ma60 : undefined;
    const bearAlignment = close !== undefined && ma5 !== undefined && ma20 !== undefined && ma60 !== undefined ? close < ma5 && ma5 < ma20 && ma20 < ma60 : undefined;
    const changePct = numberValue(row?.changePct) ?? (close !== undefined && previousClose ? Number((((close - previousClose) / previousClose) * 100).toFixed(2)) : undefined);
    const indexFacts: Fact[] = [];
    if (close !== undefined) {
      indexFacts.push(pushFact(facts, `market.${code}.kline.close.latest`, "dataSourceFact", `${names[code] ?? code} 最新收盘价 ${close}`, close));
    }
    if (changePct !== undefined) {
      indexFacts.push(pushFact(facts, `market.${code}.kline.changePct`, "dataSourceFact", `${names[code] ?? code} 最新涨跌幅 ${changePct}%`, changePct, "%"));
    }
    if (ma20 !== undefined) {
      indexFacts.push(pushFact(facts, `market.${code}.technical.ma20`, "dataSourceFact", `${names[code] ?? code} MA20 ${ma20.toFixed(2)}，当前${close !== undefined && close >= ma20 ? "站上" : "未站上"}MA20`, ma20));
    }
    if (ma60 !== undefined) {
      indexFacts.push(pushFact(facts, `market.${code}.technical.ma60`, "dataSourceFact", `${names[code] ?? code} MA60 ${ma60.toFixed(2)}，当前${close !== undefined && close >= ma60 ? "站上" : "未站上"}MA60`, ma60));
    }
    if (bullAlignment !== undefined || bearAlignment !== undefined || ma20SlopePct !== undefined || volumeRatio20 !== undefined) {
      indexFacts.push(pushFact(
        facts,
        `market.${code}.technical.structure`,
        "dataSourceFact",
        `${names[code] ?? code} 指数结构：${bullAlignment ? "多头排列" : bearAlignment ? "空头排列" : "非单边排列"}，MA20斜率${ma20SlopePct ?? "缺失"}%，20日动量${momentum20 ?? "缺失"}，量能比${volumeRatio20 ?? "缺失"}`,
        bullAlignment ? "bull" : bearAlignment ? "bear" : "mixed"
      ));
    }
    return {
      code,
      name: names[code] ?? code,
      latestPrice: close,
      changePct,
      ma5,
      ma10,
      ma20,
      ma60,
      ma120,
      ma250,
      aboveMa20: close !== undefined && ma20 !== undefined ? close >= ma20 : undefined,
      aboveMa60: close !== undefined && ma60 !== undefined ? close >= ma60 : undefined,
      bullAlignment,
      bearAlignment,
      ma20SlopePct,
      momentum20,
      volumeRatio20,
      volatility20,
      intradayState: "unknown",
      facts: indexFacts
    };
  });
}

export { calculateIndexResonance, scoreIndexTrend } from "@/lib/strategy/marketIndexScoreRules";
