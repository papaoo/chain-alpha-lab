import type { SectorSnapshot } from "@/lib/types";

export function scoreSectorPrice(change: number, change5: number, change20: number) {
  let score = 0;
  if (change > 0) score += Math.min(8, change * 2);
  else if (change < -1) score -= 4;
  if (change5 > 0) score += Math.min(9, change5);
  else if (change5 < -2) score -= 5;
  if (change20 > 0) score += Math.min(8, change20 * 0.35);
  else if (change20 < -3) score -= 5;
  return Math.max(0, Math.min(25, score));
}

export function scoreSectorBreadth(sector: SectorSnapshot) {
  if (sector.constituentUpPct !== undefined) {
    let score = 0;
    if (sector.constituentUpPct >= 70) score += 14;
    else if (sector.constituentUpPct >= 60) score += 11;
    else if (sector.constituentUpPct >= 50) score += 7;
    else if (sector.constituentUpPct >= 40) score += 3;
    else score -= 6;
    if ((sector.constituentStrongCount ?? 0) >= 8) score += 4;
    if ((sector.constituentWeakCount ?? 0) >= 8) score -= 4;
    return Math.max(0, Math.min(20, score));
  }
  return breadthRatioScore(sector.upDownRatio);
}

function breadthRatioScore(value?: string) {
  if (!value) return 0;
  const [upText, downText] = value.split(/[/:：]/);
  const up = Number(upText);
  const down = Number(downText);
  if (!Number.isFinite(up) || !Number.isFinite(down) || up + down <= 0) return 0;
  const ratio = up / (up + down);
  if (ratio >= 0.7) return 14;
  if (ratio >= 0.55) return 9;
  if (ratio <= 0.35) return -8;
  return 4;
}

export function scoreSectorLimitPool(sector: SectorSnapshot) {
  const limitUp = sector.limitUpCount ?? 0;
  const openBoard = sector.openBoardCount ?? 0;
  let score = 0;
  if (limitUp >= 8) score += 12;
  else if (limitUp >= 5) score += 9;
  else if (limitUp >= 3) score += 6;
  else if (limitUp >= 1) score += 3;
  if (openBoard >= limitUp && limitUp > 0) score -= 4;
  else if (openBoard >= 3) score -= 2;
  return Math.max(0, Math.min(15, score));
}

export function scoreSectorFunding(sector: SectorSnapshot) {
  return scoreSectorFundingQuality(sector).score;
}

export function scoreSectorFundingQuality(sector: SectorSnapshot): {
  score: number;
  state: "强流入" | "温和流入" | "分歧" | "流出" | "缺失";
  evidence: string[];
  blockers: string[];
} {
  const inflow = sector.mainNetInflow;
  const inflow5 = sector.mainNetInflow5d;
  const constituentInflow = sector.constituentMainNetInflow;
  const amount = sector.constituentAmount;
  const floatMarketValue = sector.constituentFloatMarketValue;
  const ratioFlow = constituentInflow;
  const evidence: string[] = [];
  const blockers: string[] = [];

  if (inflow === undefined && inflow5 === undefined && constituentInflow === undefined) {
    return { score: 0, state: "缺失", evidence, blockers: ["缺少板块资金流字段"] };
  }

  let score = 0;
  const day = inflow ?? constituentInflow;
  const day5 = inflow5;
  if (day !== undefined) {
    if (day > 0) {
      score += 7;
      evidence.push("当日主力净流入为正");
    } else if (day < 0) {
      score -= 5;
      blockers.push("当日主力净流出");
    }
  }
  if (day5 !== undefined) {
    if (day5 > 0) {
      score += 7;
      evidence.push("5日主力净流入为正");
    } else if (day5 < 0) {
      score -= 6;
      blockers.push("5日主力净流出");
    }
  }

  if (ratioFlow !== undefined && amount !== undefined && amount > 0) {
    const flowToAmount = Math.abs(ratioFlow) / amount;
    if (ratioFlow > 0 && flowToAmount >= 0.03) {
      score += 5;
      evidence.push(`当日净流入/成交额约${formatRatio(flowToAmount)}，资金参与度强`);
    } else if (ratioFlow > 0 && flowToAmount >= 0.01) {
      score += 3;
      evidence.push(`当日净流入/成交额约${formatRatio(flowToAmount)}，资金参与度尚可`);
    } else if (ratioFlow > 0) {
      score += 1;
      blockers.push(`当日净流入/成交额仅${formatRatio(flowToAmount)}，不能按强流入处理`);
    } else if (ratioFlow < 0 && flowToAmount >= 0.02) {
      score -= 3;
      blockers.push(`当日净流出/成交额约${formatRatio(flowToAmount)}，流出压力较大`);
    }
  } else if (day !== undefined && day > 0) {
    blockers.push("缺少同源成分股成交额/资金流，无法校验净流入占比");
  }

  if (ratioFlow !== undefined && floatMarketValue !== undefined && floatMarketValue > 0) {
    const flowToFloat = Math.abs(ratioFlow) / floatMarketValue;
    if (ratioFlow > 0 && flowToFloat >= 0.003) {
      score += 4;
      evidence.push(`当日净流入/流通市值约${formatRatio(flowToFloat)}，容量校验通过`);
    } else if (ratioFlow > 0 && flowToFloat >= 0.001) {
      score += 2;
      evidence.push(`当日净流入/流通市值约${formatRatio(flowToFloat)}，容量校验一般`);
    } else if (ratioFlow > 0) {
      blockers.push(`当日净流入/流通市值仅${formatRatio(flowToFloat)}，大容量板块资金强度需降权`);
    }
  }

  if (day !== undefined && day5 !== undefined) {
    if (day > 0 && day5 < 0 && Math.abs(day5) > Math.abs(day) * 2) {
      score -= 5;
      blockers.push("当日流入但5日仍明显流出，按弱修复处理");
    }
    if (day < 0 && day5 > 0) {
      score -= 2;
      blockers.push("当日转流出，资金连续性被破坏");
    }
  }

  const bounded = Math.max(0, Math.min(25, Math.round(score)));
  const state = bounded >= 18 ? "强流入" : bounded >= 12 ? "温和流入" : bounded >= 6 ? "分歧" : bounded > 0 ? "流出" : blockers.length ? "流出" : "缺失";
  return { score: bounded, state, evidence, blockers };
}

function formatRatio(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

export function scoreCoreStockStructure(sector: SectorSnapshot) {
  return Math.min(15, (sector.coreStocks ?? []).reduce((sum, stock) => {
    const roleScore = stock.role === "龙头" ? 5 : stock.role === "中军" ? 4 : 2;
    const riskPenalty = stock.risks.length >= 2 ? 3 : stock.risks.length ? 1 : 0;
    return sum + Math.max(0, roleScore - riskPenalty);
  }, 0));
}

export function scoreSectorLeader(sector: SectorSnapshot, score: number, rankScore: number) {
  let leaderScore = rankScore;
  if (sector.leadStock) leaderScore += 4;
  if ((sector.changePct ?? 0) > 2) leaderScore += 4;
  if (score >= 75) leaderScore += 4;
  const leader = (sector.coreStocks ?? []).find((stock) => stock.role === "龙头");
  if (leader) leaderScore += Math.min(8, leader.score / 10);
  return Math.max(0, Math.min(20, leaderScore));
}

export function scoreSectorCore(change5: number, change20: number, fundingScore: number, sector: SectorSnapshot) {
  let score = 0;
  if (change5 > 0) score += 6;
  if (change5 > 5) score += 4;
  if (change20 > 0) score += 4;
  if (fundingScore >= 15) score += 6;
  if ((sector.constituentStrongCount ?? 0) >= 8) score += 3;
  if ((sector.limitUpCount ?? 0) >= 3) score += 3;
  const coreStocks = sector.coreStocks ?? [];
  if (coreStocks.some((stock) => stock.role === "中军" && stock.score >= 35)) score += 4;
  if (coreStocks.filter((stock) => stock.role === "龙头" || stock.role === "中军").some((stock) => stock.risks.length >= 2)) score -= 5;
  return Math.max(0, Math.min(20, score));
}
