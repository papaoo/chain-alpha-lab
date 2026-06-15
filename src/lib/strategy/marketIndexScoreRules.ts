import type { MarketIndexSnapshot } from "@/lib/types";
import { average, standardDeviation } from "@/lib/strategy/utils";

export function scoreIndexTrend(indices: MarketIndexSnapshot[]) {
  const valid = indices.filter((index) => index.latestPrice !== undefined);
  if (!valid.length) return 0;
  const weightedTotal = valid.reduce((sum, index) => sum + scoreSingleIndexTrend(index) * indexWeight(index.code), 0);
  const weightTotal = valid.reduce((sum, index) => sum + indexWeight(index.code), 0);
  const normalized = (weightedTotal / Math.max(weightTotal, 1)) * 4;
  return Math.round(normalized * calculateIndexResonance(valid));
}

function scoreSingleIndexTrend(index: MarketIndexSnapshot) {
  let score = 0;
  if (index.bullAlignment) score += 5;
  else if (index.aboveMa20 && index.aboveMa60) score += 4;
  else if (index.aboveMa60) score += 2.5;
  else if (index.aboveMa20) score += 1.5;
  if (index.bearAlignment) score -= 1;

  if (index.ma20SlopePct !== undefined) {
    if (index.ma20SlopePct > 0.5) score += 1.5;
    else if (index.ma20SlopePct > 0.2) score += 1.2;
    else if (index.ma20SlopePct > 0) score += 0.8;
    else if (index.ma20SlopePct < -0.5) score -= 1;
    else if (index.ma20SlopePct < -0.2) score -= 0.5;
  }

  if (index.momentum20 !== undefined) {
    if (index.momentum20 >= 0.8) score += 1.5;
    else if (index.momentum20 >= 0.55) score += 1.1;
    else if (index.momentum20 >= 0.35) score += 0.6;
    else score -= 0.3;
  }

  if (index.volumeRatio20 !== undefined) {
    if ((index.changePct ?? 0) > 0 && index.volumeRatio20 >= 1.15) score += 1;
    else if ((index.changePct ?? 0) > 0 && index.volumeRatio20 < 0.8) score -= 0.5;
    else if ((index.changePct ?? 0) < -0.5 && index.volumeRatio20 >= 1.2) score -= 0.8;
  }

  if ((index.changePct ?? 0) > 0.3) score += 0.5;
  else if ((index.changePct ?? 0) < -1) score -= 1;
  else if ((index.changePct ?? 0) < -0.5) score -= 0.5;

  if (index.volatility20 !== undefined && index.volatility20 > 35 && !index.bullAlignment) score -= 0.5;
  return Math.max(0, Math.min(10, score));
}

export function calculateIndexResonance(indices: MarketIndexSnapshot[]) {
  const structureScores = indices.map(getIndexStructureScore);
  if (structureScores.length < 2) return 0.7;
  const mainBoard = indices.filter((item) => item.code === "sh000001" || item.code === "sz399001").map(getIndexStructureScore);
  const growth = indices.filter((item) => item.code === "sz399006" || item.code === "sh000688").map(getIndexStructureScore);
  const mainResonance = mainBoard.length >= 2 ? 1 - standardDeviation(mainBoard) : 0.8;
  const growthResonance = growth.length >= 2 ? 1 - standardDeviation(growth) : 0.8;
  const styleDiff = mainBoard.length && growth.length ? Math.abs((average(mainBoard) ?? 0) - (average(growth) ?? 0)) : 0;
  const stylePenalty = styleDiff > 0.55 ? 0.12 : styleDiff > 0.35 ? 0.06 : 0;
  return Math.max(0.45, Math.min(1, (mainResonance + growthResonance) / 2 - stylePenalty));
}

function getIndexStructureScore(index: MarketIndexSnapshot) {
  if (index.bullAlignment) return 1;
  if (index.aboveMa20 && index.aboveMa60) return 0.75;
  if (index.aboveMa60) return 0.45;
  if (index.aboveMa20) return 0.25;
  if (index.bearAlignment) return 0;
  return 0.15;
}

function indexWeight(code: string) {
  const weights: Record<string, number> = {
    sh000001: 1.15,
    sz399001: 1,
    sz399006: 0.85,
    sh000688: 0.7
  };
  return weights[code] ?? 1;
}
