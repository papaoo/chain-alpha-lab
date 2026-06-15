import type { LimitPoolSnapshot, MarketBreadthSnapshot } from "@/lib/types";
import { average } from "@/lib/strategy/utils";

export function scoreLimitPoolSentiment(limitPools: LimitPoolSnapshot[], marketBreadth: MarketBreadthSnapshot | null) {
  const byPool = new Map(limitPools.map((pool) => [pool.pool, pool]));
  const ztPool = byPool.get("zt");
  const dtPool = byPool.get("dt");
  const zbPool = byPool.get("zb");
  const ztSource: "pool" | "approx" | "missing" = ztPool ? "pool" : marketBreadth?.limitUpApprox !== undefined ? "approx" : "missing";
  const dtSource: "pool" | "approx" | "missing" = dtPool ? "pool" : marketBreadth?.limitDownApprox !== undefined ? "approx" : "missing";
  const zbSource: "pool" | "missing" = zbPool ? "pool" : "missing";
  const bigDownSource: "market" | "missing" = marketBreadth?.ltMinus5Count !== undefined ? "market" : "missing";
  const zt = ztPool?.stocks.length ?? marketBreadth?.limitUpApprox ?? 0;
  const dt = dtPool?.stocks.length ?? marketBreadth?.limitDownApprox ?? 0;
  const zb = zbPool?.stocks.length ?? 0;
  const bigDown = marketBreadth?.ltMinus5Count ?? 0;
  const allMissing = ztSource === "missing" && dtSource === "missing" && zbSource === "missing" && bigDownSource === "missing";
  const sourceQuality: "pool" | "mixed" | "approx" | "missing" = allMissing
    ? "missing"
    : ztSource === "pool" && dtSource === "pool" && zbSource === "pool" && bigDownSource === "market"
      ? "pool"
      : ztSource === "approx" || dtSource === "approx"
        ? "approx"
        : "mixed";
  const reliability = allMissing
    ? 0
    : Number(average([
        sourceReliability(ztSource),
        sourceReliability(dtSource),
        zbSource === "pool" ? 1 : 0.35,
        bigDownSource === "market" ? 1 : 0
      ])?.toFixed(2) ?? 0);
  const consecutiveZt = ztPool?.stocks.filter((stock) => (stock.consecutiveLimitCount ?? 1) >= 2).length ?? undefined;
  const firstZt = consecutiveZt !== undefined ? Math.max(0, zt - consecutiveZt) : undefined;
  const burstRate = zt > 0 && zbSource === "pool" ? Number((zb / Math.max(zt, 1)).toFixed(3)) : undefined;

  if (allMissing) {
    return {
      score: 0,
      riskPenalty: 0,
      limitDownRisk: false,
      panicRisk: false,
      sourceQuality,
      reliability,
      zt,
      dt,
      zb,
      bigDown,
      ztSource,
      dtSource,
      zbSource,
      bigDownSource,
      burstRate,
      consecutiveZt,
      firstZt
    };
  }

  let score = 0;
  const ztMultiplier = ztSource === "pool" ? 1 : ztSource === "approx" ? 0.6 : 0;
  if (zt >= 80) score += 6 * ztMultiplier;
  else if (zt >= 50) score += 5 * ztMultiplier;
  else if (zt >= 30) score += 3 * ztMultiplier;
  else if (zt >= 15) score += 1 * ztMultiplier;
  if (ztPool && zt >= 30 && consecutiveZt !== undefined && consecutiveZt / Math.max(zt, 1) >= 0.6) score -= 1;
  if (ztPool && zt >= 30 && firstZt !== undefined && firstZt >= zt * 0.5) score += 1;

  let bearScore = 0;
  if (dtSource !== "missing" && bigDownSource !== "missing" && dt <= 5 && bigDown < 120) bearScore += 4;
  else if (dtSource !== "missing" && bigDownSource !== "missing" && dt <= 15 && bigDown < 220) bearScore += 2;
  else {
    if (dtSource !== "missing") {
      if (dt >= 40) bearScore -= 5;
      else if (dt >= 25) bearScore -= 3;
      else if (dt >= 15) bearScore -= 1;
    }
    if (bigDownSource !== "missing") {
      if (bigDown >= 400) bearScore -= 5;
      else if (bigDown >= 300) bearScore -= 3;
      else if (bigDown >= 200) bearScore -= 1;
    }
  }
  if ((dt >= 20 || bigDown >= 250) && (dtSource !== "missing" || bigDownSource !== "missing")) bearScore = Math.min(bearScore, -1);
  score += bearScore;

  const burstPenalty = scoreBurstPenalty(zt, zb, zbSource);
  score -= burstPenalty;

  const riskPenalty = Math.max(0, Math.min(10,
    (dt >= 20 && dtSource !== "missing" ? 4 : 0) +
    (bigDown >= 250 && bigDownSource !== "missing" ? 4 : 0) +
    (burstPenalty >= 2 ? 2 : 0) +
    (zb >= 35 && zbSource === "pool" ? 2 : 0)
  ));
  return {
    score: Math.max(0, Math.min(10, score)),
    riskPenalty,
    limitDownRisk: dt >= 20 || bigDown >= 250,
    panicRisk: dt >= 40 || bigDown >= 400,
    sourceQuality,
    reliability,
    zt,
    dt,
    zb,
    bigDown,
    ztSource,
    dtSource,
    zbSource,
    bigDownSource,
    burstRate,
    consecutiveZt,
    firstZt
  };
}

function sourceReliability(source: "pool" | "approx" | "missing") {
  if (source === "pool") return 1;
  if (source === "approx") return 0.55;
  return 0;
}

function scoreBurstPenalty(zt: number, zb: number, zbSource: "pool" | "missing") {
  if (zbSource === "missing") return 0;
  const ratio = zb / Math.max(zt, 1);
  if (zt >= 10 && ratio >= 0.7) return 3;
  if (zt >= 10 && ratio >= 0.55) return 2;
  if (zt >= 5 && ratio >= 0.4) return 1;
  if (zt < 5 && zb >= 1) return 1;
  return 0;
}
