import type { StockCandidate, StockFundFlowQuality, StockFundFlowSnapshot } from "@/lib/types";
import { numberValue } from "@/lib/strategy/utils";
import { formatMoney } from "@/lib/strategy/candidateUtils";

export function parseFundFlow(row?: Record<string, unknown>): StockFundFlowSnapshot | undefined {
  if (!row) return undefined;
  return {
    mainNetFlow: numberValue(row.MainNetFlow),
    mainNetFlow5D: numberValue(row.MainNetFlow5D),
    mainNetFlow10D: numberValue(row.MainNetFlow10D),
    mainNetFlow20D: numberValue(row.MainNetFlow20D),
    jumboNetFlow: numberValue(row.JumboNetFlow),
    blockNetFlow: numberValue(row.BlockNetFlow),
    retailInFlow: numberValue(row.RetailInFlow),
    retailOutFlow: numberValue(row.RetailOutFlow),
    lhbInfos: Array.isArray(row.LhbInfos) ? row.LhbInfos : []
  };
}

export function inferFundFlow(fund?: StockFundFlowSnapshot, quality = evaluateFundFlowQuality(fund)): StockCandidate["fundFlowState"] {
  if (!fund || fund.mainNetFlow === undefined || quality.state === "未知") return "unknown";
  if (quality.state === "强流入" || quality.state === "温和流入") return "inflow";
  if (quality.state === "持续流出") return "outflow";
  if (quality.state === "弱修复" || quality.state === "分歧") return "mixed";
  const day = signOf(fund.mainNetFlow);
  const day5 = signOf(fund.mainNetFlow5D);
  const day10 = signOf(fund.mainNetFlow10D);
  const day20 = signOf(fund.mainNetFlow20D);
  const positiveCount = [day, day5, day10, day20].filter((value) => value > 0).length;
  const negativeCount = [day, day5, day10, day20].filter((value) => value < 0).length;

  if (day > 0 && day5 > 0 && (day20 >= 0 || positiveCount >= 3)) return "inflow";
  if (day < 0 && day5 < 0 && (day20 <= 0 || negativeCount >= 3)) return "outflow";
  if (day20 > 0 && (day > 0 || day5 > 0 || day10 > 0)) return "inflow";
  if (day20 < 0 && day < 0 && (day5 < 0 || day10 < 0)) return "outflow";
  return "mixed";
}

export function evaluateFundFlowQuality(fund?: StockFundFlowSnapshot): StockFundFlowQuality {
  if (!fund || fund.mainNetFlow === undefined) {
    return {
      score: 0,
      state: "未知",
      shortTerm: "缺少当日主力资金",
      mediumTerm: "缺少多周期资金",
      evidence: [],
      blockers: ["缺少资金流证据"]
    };
  }

  const day = fund.mainNetFlow ?? 0;
  const day5 = fund.mainNetFlow5D;
  const day10 = fund.mainNetFlow10D;
  const day20 = fund.mainNetFlow20D;
  const jumbo = fund.jumboNetFlow;
  const block = fund.blockNetFlow;
  const periodAverages = [
    { label: "当日", value: day, average: day, weight: 0.25 },
    { label: "5日", value: day5, average: day5 !== undefined ? day5 / 5 : undefined, weight: 0.3 },
    { label: "10日", value: day10, average: day10 !== undefined ? day10 / 10 : undefined, weight: 0.2 },
    { label: "20日", value: day20, average: day20 !== undefined ? day20 / 20 : undefined, weight: 0.15 },
    { label: "超大单", value: jumbo, average: jumbo, weight: 0.05 },
    { label: "大单", value: block, average: block, weight: 0.05 }
  ].filter((item): item is { label: string; value: number; average: number; weight: number } => item.value !== undefined && item.average !== undefined);
  const maxAverage = Math.max(...periodAverages.map((item) => Math.abs(item.average)), 1);
  const weightSum = periodAverages.reduce((sum, item) => sum + item.weight, 0) || 1;
  const weightedDirection = periodAverages.reduce((sum, item) => sum + (item.average / maxAverage) * item.weight, 0) / weightSum;
  const positiveCount = periodAverages.filter((item) => item.value > 0).length;
  const negativeCount = periodAverages.filter((item) => item.value < 0).length;
  const score = Math.max(0, Math.min(100, Math.round(50 + weightedDirection * 50)));
  const evidence = periodAverages
    .filter((item) => item.value > 0)
    .map((item) => `${item.label}流入${formatMoney(item.value)}`);
  const blockers = periodAverages
    .filter((item) => item.value < 0)
    .map((item) => `${item.label}流出${formatMoney(item.value)}`);
  const dayPositiveButMediumWeak =
    day > 0 &&
    ((day5 !== undefined && day5 < 0 && Math.abs(day5) > Math.abs(day) * 3) ||
      (day10 !== undefined && day10 < 0 && Math.abs(day10) > Math.abs(day) * 5));
  const largeOrderDivergence = day > 0 && ((jumbo !== undefined && jumbo < 0) || (block !== undefined && block < 0));
  const persistentOutflow = day < 0 && (day5 ?? 0) < 0 && ((day10 ?? 0) <= 0 || (day20 ?? 0) <= 0);
  const strongInflow = score >= 72 && positiveCount >= 3 && !dayPositiveButMediumWeak && !largeOrderDivergence;
  const mildInflow = score >= 58 && positiveCount >= negativeCount && !dayPositiveButMediumWeak;
  const state: StockFundFlowQuality["state"] = persistentOutflow
    ? "持续流出"
    : dayPositiveButMediumWeak
      ? "弱修复"
      : largeOrderDivergence || (positiveCount > 0 && negativeCount > 0)
        ? "分歧"
        : strongInflow
          ? "强流入"
          : mildInflow
            ? "温和流入"
            : score <= 38 && negativeCount >= positiveCount
              ? "持续流出"
              : "分歧";

  return {
    score,
    state,
    shortTerm: day > 0 ? `当日流入${formatMoney(day)}` : day < 0 ? `当日流出${formatMoney(day)}` : "当日资金持平",
    mediumTerm: `5日${formatMoney(day5)}，10日${formatMoney(day10)}，20日${formatMoney(day20)}`,
    evidence,
    blockers: [
      ...blockers,
      dayPositiveButMediumWeak ? "当日流入但5日/10日仍明显流出，按弱修复处理" : "",
      largeOrderDivergence ? "当日流入但超大单/大单分歧" : ""
    ].filter(Boolean)
  };
}

export function signOf(value?: number) {
  if (value === undefined || value === 0) return 0;
  return value > 0 ? 1 : -1;
}
