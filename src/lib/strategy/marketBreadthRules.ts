import type { MarketBreadthSnapshot, SectorSnapshot } from "@/lib/types";
import type { ParsedCommandResult } from "@/lib/westock/parser";
import { firstTableRows, numberValue } from "@/lib/strategy/utils";

export function scoreMarketBreadth(
  sectors: SectorSnapshot[],
  hotStocks: ParsedCommandResult,
  marketBreadth: MarketBreadthSnapshot | null
): { score: number; available: boolean; sourceQuality: "market" | "sector" | "hot" | "none"; reliability: number } {
  if (marketBreadth && marketBreadth.total >= 1000 && marketBreadth.upPct !== undefined) {
    const upPct = marketBreadth.upPct;
    const median = marketBreadth.medianChangePct ?? 0;
    const strongThreshold = Math.max(150, Math.round(marketBreadth.total * 0.05));
    const weakThreshold = Math.max(150, Math.round(marketBreadth.total * 0.05));
    let score = 0;
    if (upPct >= 68) score += 12;
    else if (upPct >= 58) score += 9;
    else if (upPct >= 48) score += 6;
    else if (upPct >= 38) score += 3;

    if (median >= 0.8) score += 5;
    else if (median >= 0.5) score += 4;
    else if (median >= 0.1) score += 2;
    else if (median >= -0.3) score -= 1;
    else if (median >= -0.8) score -= 3;
    else if (median >= -1.5) score -= 5;
    else score -= 7;

    if (marketBreadth.gt5Count >= strongThreshold) score += 3;
    if (marketBreadth.ltMinus5Count >= weakThreshold) score -= 5;

    return { score: Math.max(0, Math.min(20, score)), available: true, sourceQuality: "market", reliability: 1 };
  }

  const weightedSectorRatio = weightedSectorPositiveRatio(sectors);
  const hotRatio = weightedSectorRatio === undefined ? hotStockPositiveRatio(hotStocks) : undefined;
  const ratio = weightedSectorRatio ?? hotRatio;
  const sourceQuality = weightedSectorRatio !== undefined ? "sector" : hotRatio !== undefined ? "hot" : "none";
  const reliability = sourceQuality === "sector" ? 0.45 : sourceQuality === "hot" ? 0.25 : 0;
  if (ratio === undefined) return { score: 0, available: false, sourceQuality, reliability };

  let score = 0;
  if (ratio >= 0.65) score = sourceQuality === "sector" ? 10 : 6;
  else if (ratio >= 0.55) score = sourceQuality === "sector" ? 8 : 5;
  else if (ratio >= 0.45) score = sourceQuality === "sector" ? 5 : 3;
  else if (ratio >= 0.35) score = 2;
  return { score, available: true, sourceQuality, reliability };
}

export { scoreLimitPoolSentiment } from "@/lib/strategy/marketSentimentRules";

function parseUpDownRatio(value?: string) {
  if (!value) return undefined;
  const [upText, downText] = value.split(/[/:：]/);
  const up = Number(upText);
  const down = Number(downText);
  if (!Number.isFinite(up) || !Number.isFinite(down) || up + down <= 0) return undefined;
  return up / (up + down);
}

function weightedSectorPositiveRatio(sectors: SectorSnapshot[]) {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const sector of sectors) {
    const ratio = sector.constituentUpPct !== undefined ? sector.constituentUpPct / 100 : parseUpDownRatio(sector.upDownRatio);
    if (ratio === undefined) continue;
    const weight = Math.max(10, sector.constituentCount ?? 50);
    weightedSum += ratio * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : undefined;
}

function hotStockPositiveRatio(hotStocks: ParsedCommandResult) {
  const rows = firstTableRows(hotStocks).filter((row) => String(row.stock_type ?? "").includes("GP-A"));
  if (rows.length < 30) return undefined;
  if (rows.length === 0) return undefined;
  const valid = rows.map((row) => numberValue(row.zdf)).filter((value): value is number => value !== undefined);
  if (valid.length < 30) return undefined;
  if (valid.length === 0) return undefined;
  return valid.filter((value) => value > 0).length / valid.length;
}
