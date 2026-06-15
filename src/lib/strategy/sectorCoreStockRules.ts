import type { LimitPoolSnapshot, SectorConstituentSnapshot, SectorCoreStockSnapshot, SectorSnapshot } from "@/lib/types";
import { normalizeSectorName } from "@/lib/sector/normalization";

export function buildSectorCoreStocks(
  sector: SectorSnapshot,
  stocks: NonNullable<SectorConstituentSnapshot["stocks"]>,
  ztPools: LimitPoolSnapshot[],
  zbPools: LimitPoolSnapshot[]
): SectorCoreStockSnapshot[] {
  if (!stocks.length) return buildFallbackSectorCoreStocks(sector, ztPools, zbPools);
  const limitUpByCode = new Map(ztPools.flatMap((pool) => pool.stocks.map((stock) => [stock.marketCode || stock.code, stock] as const)));
  const openBoardByCode = new Map(zbPools.flatMap((pool) => pool.stocks.map((stock) => [stock.marketCode || stock.code, stock] as const)));
  const leadName = parseLeadStockName(sector.leadStock);
  const amounts = stocks.map((stock) => stock.amount).filter((value): value is number => value !== undefined).sort((a, b) => b - a);
  const floatValues = stocks.map((stock) => stock.floatMarketValue).filter((value): value is number => value !== undefined).sort((a, b) => b - a);
  const amountTop = amounts[Math.min(4, amounts.length - 1)] ?? 0;
  const floatTop = floatValues[Math.min(4, floatValues.length - 1)] ?? 0;

  const scored = stocks.map((stock) => {
    const key = stock.marketCode || stock.code;
    const limitUp = limitUpByCode.get(key);
    const openBoard = openBoardByCode.get(key);
    const change = stock.changePct ?? 0;
    let score = 0;
    if (stock.name === leadName) score += 28;
    if (limitUp) score += 24;
    if (openBoard) score += 10;
    if (change >= 9.8) score += 18;
    else if (change >= 5) score += 12;
    else if (change > 0) score += 5;
    if ((stock.amount ?? 0) >= amountTop && amountTop > 0) score += 12;
    if ((stock.floatMarketValue ?? 0) >= floatTop && floatTop > 0) score += 10;
    if ((stock.mainNetInflow ?? 0) > 0) score += 8;
    if (change < 0) score -= 6;
    const risks = [
      openBoard ? "炸板分歧" : "",
      change < 0 ? "当日转弱" : "",
      (stock.mainNetInflow ?? 0) < 0 ? "主力流出" : ""
    ].filter(Boolean);
    return {
      code: stock.code,
      marketCode: stock.marketCode,
      name: stock.name,
      score: Math.max(0, Math.min(100, score)),
      changePct: stock.changePct,
      amount: stock.amount,
      turnoverRate: stock.turnoverRate,
      floatMarketValue: stock.floatMarketValue,
      mainNetInflow: stock.mainNetInflow,
      limitStatus: limitUp ? "涨停" as const : openBoard ? "炸板" as const : "未涨停" as const,
      consecutiveLimitCount: limitUp?.consecutiveLimitCount ?? openBoard?.consecutiveLimitCount,
      risks
    };
  }).sort((a, b) => b.score - a.score).slice(0, 6);

  return scored.map((stock, index) => ({
    ...stock,
    role: inferCoreStockRole(stock, index)
  }));
}

function buildFallbackSectorCoreStocks(
  sector: SectorSnapshot,
  ztPools: LimitPoolSnapshot[],
  zbPools: LimitPoolSnapshot[]
): SectorCoreStockSnapshot[] {
  const leadName = parseLeadStockName(sector.leadStock);
  const limitStocks = ztPools
    .flatMap((pool) => pool.stocks)
    .filter((stock) => sectorNameMatches(stock.industry, sector.name))
    .map((stock) => ({
      code: stock.code,
      marketCode: stock.marketCode,
      name: stock.name,
      score: Math.min(100, 58 + Math.min(20, (stock.consecutiveLimitCount ?? 1) * 6)),
      changePct: stock.changePct,
      amount: stock.amount,
      turnoverRate: undefined,
      floatMarketValue: stock.floatMarketValue,
      mainNetInflow: undefined,
      limitStatus: "涨停" as const,
      consecutiveLimitCount: stock.consecutiveLimitCount,
      risks: ["缺少完整成分股结构"]
    }));
  const openBoardStocks = zbPools
    .flatMap((pool) => pool.stocks)
    .filter((stock) => sectorNameMatches(stock.industry, sector.name))
    .map((stock) => ({
      code: stock.code,
      marketCode: stock.marketCode,
      name: stock.name,
      score: 38,
      changePct: stock.changePct,
      amount: stock.amount,
      turnoverRate: undefined,
      floatMarketValue: stock.floatMarketValue,
      mainNetInflow: undefined,
      limitStatus: "炸板" as const,
      consecutiveLimitCount: stock.consecutiveLimitCount,
      risks: ["炸板分歧", "缺少完整成分股结构"]
    }));
  const leadStock = leadName
    ? [{
        code: `lead:${leadName}`,
        marketCode: `lead:${leadName}`,
        name: leadName,
        score: 46,
        changePct: undefined,
        amount: undefined,
        turnoverRate: undefined,
        floatMarketValue: undefined,
        mainNetInflow: undefined,
        limitStatus: "未涨停" as const,
        consecutiveLimitCount: undefined,
        risks: ["仅来自板块领涨股字段"]
      }]
    : [];

  const byName = new Map<string, Omit<SectorCoreStockSnapshot, "role">>();
  for (const stock of [...limitStocks, ...openBoardStocks, ...leadStock]) {
    const existing = byName.get(stock.name);
    if (!existing || stock.score > existing.score) byName.set(stock.name, stock);
  }
  return [...byName.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((stock, index) => ({ ...stock, role: inferCoreStockRole(stock, index) }));
}

function parseLeadStockName(value?: string) {
  if (!value) return undefined;
  return value.replace(/\(.+\)$/, "").trim();
}

function sectorNameMatches(industry: string | undefined, sectorName: string) {
  if (!industry) return false;
  const left = normalizeSectorName(industry);
  const right = normalizeSectorName(sectorName);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

function inferCoreStockRole(stock: Omit<SectorCoreStockSnapshot, "role">, index: number): SectorCoreStockSnapshot["role"] {
  if (index === 0 || stock.limitStatus === "涨停" || stock.consecutiveLimitCount) return "龙头";
  if ((stock.amount ?? 0) > 0 || (stock.floatMarketValue ?? 0) > 0) return "中军";
  return "补涨";
}
