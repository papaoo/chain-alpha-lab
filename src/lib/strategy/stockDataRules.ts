import type { CompanyKnowledgeCard, DataCompleteness, StockCandidate, StockFundFlowQuality, StockFundFlowSnapshot, StockTechnicalSnapshot } from "@/lib/types";
import { distancePct, numberValue } from "@/lib/strategy/utils";

export function buildCompleteness(
  hasHotData: boolean,
  hasKlineData: boolean,
  hasTechnicalData: boolean,
  hasFundFlowData: boolean,
  hasSectorData: boolean,
  hasProfileData: boolean,
  companyKnowledge: CompanyKnowledgeCard
): DataCompleteness {
  const missingFields: string[] = [];
  const fields: Array<[boolean, string]> = [
    [hasHotData, "热门行情"],
    [hasKlineData, "K线"],
    [hasTechnicalData, "技术指标"],
    [hasFundFlowData, "资金流"],
    [hasSectorData, "板块证据"],
    [hasProfileData, "公司概况"]
  ];
  fields.forEach(([present, field]) => {
    if (!present) missingFields.push(field);
  });
  const blockingReasons = missingFields
    .filter((field) => ["K线", "技术指标", "资金流", "板块证据"].includes(field))
    .map((field) => `缺少${field}，禁止给出明确买入动作`);
  const level = blockingReasons.length ? "insufficient" : missingFields.length || companyKnowledge.companyKnowledgeState !== "sufficient" ? "partial" : "complete";
  return {
    level,
    hasHotData,
    hasKlineData,
    hasTechnicalData,
    hasFundFlowData,
    hasSectorData,
    hasProfileData,
    hasCompanyKnowledge: companyKnowledge.companyKnowledgeState !== "missing",
    missingFields,
    blockingReasons
  };
}

export function parseTechnical(row?: Record<string, unknown>): StockTechnicalSnapshot | undefined {
  if (!row) return undefined;
  return {
    closePrice: numberValue(row.closePrice),
    ma5: numberValue(row["ma.MA_5"]),
    ma10: numberValue(row["ma.MA_10"]),
    ma20: numberValue(row["ma.MA_20"]),
    ma60: numberValue(row["ma.MA_60"]),
    macdDif: numberValue(row["macd.DIF"]),
    macdDea: numberValue(row["macd.DEA"]),
    macd: numberValue(row["macd.MACD"]),
    rsi6: numberValue(row["rsi.RSI_6"]),
    rsi12: numberValue(row["rsi.RSI_12"]),
    rsi24: numberValue(row["rsi.RSI_24"])
  };
}

export function buildKlineSummary(row?: Record<string, unknown>, technical?: StockTechnicalSnapshot): StockCandidate["klineSummary"] | undefined {
  if (!row) return undefined;
  const latestClose = numberValue(row.last);
  const volume = numberValue(row.volume);
  const amount = numberValue(row.amount);
  const trend = inferTrend(technical);
  return {
    period: "day",
    limit: 30,
    latestClose,
    maDistance: technical?.closePrice
      ? {
          ma5: distancePct(technical.closePrice, technical.ma5),
          ma10: distancePct(technical.closePrice, technical.ma10),
          ma20: distancePct(technical.closePrice, technical.ma20),
          ma60: distancePct(technical.closePrice, technical.ma60)
        }
      : undefined,
    trend,
    volumePrice: `成交量 ${volume ?? "缺失"}，成交额 ${amount ?? "缺失"}`
  };
}

export function trendLabel(trend: StockCandidate["trendState"]) {
  if (trend === "above_ma20") return "站上MA20";
  if (trend === "below_ma20") return "跌破MA20";
  if (trend === "reclaim_ma20") return "收复MA20";
  if (trend === "downtrend") return "下降趋势";
  return "未知";
}

export function inferTrend(technical?: StockTechnicalSnapshot): StockCandidate["trendState"] {
  if (!technical?.closePrice || !technical.ma20) return "unknown";
  if (technical.closePrice >= technical.ma20) {
    const distanceToMa20 = Math.abs(distancePct(technical.closePrice, technical.ma20) ?? 99);
    const shortMaStillRepairing = Boolean(technical.ma5 && technical.ma10 && technical.ma5 < technical.ma10 && technical.ma10 <= technical.ma20);
    const longTermWeakRepair = Boolean(technical.ma60 && technical.ma20 < technical.ma60 && distanceToMa20 <= 4);
    if (distanceToMa20 <= 4 && (shortMaStillRepairing || longTermWeakRepair)) return "reclaim_ma20";
    return "above_ma20";
  }
  if (technical.ma60 && technical.closePrice < technical.ma20 && technical.ma20 < technical.ma60) return "downtrend";
  return "below_ma20";
}

export {
  evaluateFundFlowQuality,
  inferFundFlow,
  parseFundFlow,
  signOf
} from "@/lib/strategy/stockFundFlowRules";
