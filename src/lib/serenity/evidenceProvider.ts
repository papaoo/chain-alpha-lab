import { eastmoneyAdapter } from "@/lib/eastmoney/adapter";
import { normalizeStockCode } from "@/lib/strategy/candidateUtils";
import { tushareAdapter, type TushareFinancialIndicator, type TushareForecast, type TushareHolderNumber } from "@/lib/tushare/adapter";
import type { DataProviderId } from "@/lib/types";

export type SerenityEvidenceProviderRole = "primary" | "fallback" | "planned";
export type SerenityEvidenceScope = "quote" | "company_profile" | "fund_flow" | "financial_indicator" | "shareholder_count" | "forecast" | "filing_announcement";
export type SerenityEvidenceHardness = "hard" | "medium" | "weak";

export type SerenityEvidenceProviderSource = {
  provider: DataProviderId;
  role: SerenityEvidenceProviderRole;
  scopes: SerenityEvidenceScope[];
  hardness: SerenityEvidenceHardness;
  note: string;
};

export type SerenityQuoteEvidenceData = {
  code: string;
  marketCode: string;
  name: string;
  latest?: number;
  changePct?: number;
  amount?: number;
  turnoverRate?: number;
  mainNetInflow?: number;
  industry?: string;
  updatedAt?: string;
};

export type SerenityProfileEvidenceData = {
  industry?: string;
  business?: string;
  businessScope?: string;
  orgProfile?: string;
  businessComposition?: Array<{
    itemName: string;
    ratio?: number;
    reportDate?: string;
    type?: string;
  }>;
};

export type SerenityFundFlowEvidenceData = Array<{
  date: string;
  mainNetFlow?: number;
}>;

export type SerenityEvidenceBundle = {
  quoteMap: Map<string, SerenityQuoteEvidenceData>;
  profileMap: Map<string, SerenityProfileEvidenceData>;
  fundFlowMap: Map<string, SerenityFundFlowEvidenceData>;
  financialMap: Map<string, TushareFinancialIndicator>;
  holderMap: Map<string, TushareHolderNumber>;
  forecastMap: Map<string, TushareForecast>;
  warnings: string[];
};

const MAX_PROFILE_FETCH = 12;
const MAX_FUND_FETCH = 12;
const MAX_TUSHARE_FETCH = 12;

const SOURCES: SerenityEvidenceProviderSource[] = [
  {
    provider: "eastmoney_public",
    role: "primary",
    scopes: ["company_profile"],
    hardness: "medium",
    note: "东方财富 F10 可提供主营、行业和主营构成线索；能证明公司业务位置，但还不足以替代公告/财报原文。"
  },
  {
    provider: "eastmoney_public",
    role: "fallback",
    scopes: ["quote", "fund_flow"],
    hardness: "weak",
    note: "行情和资金流只说明市场关注度和短线承接，不能证明产业链瓶颈。"
  },
  {
    provider: "tushare",
    role: "fallback",
    scopes: ["financial_indicator", "shareholder_count", "forecast"],
    hardness: "medium",
    note: "Tushare 财务、股东户数和业绩预告用于基本面/筹码/预期验证，不直接证明客户或产能卡点。"
  },
  {
    provider: "tushare",
    role: "planned",
    scopes: ["filing_announcement"],
    hardness: "hard",
    note: "后续应接公告、定期报告、项目/合同/客户验证，作为供应链瓶颈研究的强证据。"
  }
];

export class SerenityEvidenceProvider {
  describe() {
    return {
      name: "SerenityEvidenceProvider",
      providers: SOURCES,
      contract: "为 Serenity 产业链瓶颈研究采集候选公司的行情、F10、资金流、财务指标、股东户数和业绩预告，并明确证据强弱边界。",
      boundary: "只负责证据采集和来源分层，不负责产业链评分、研究结论排序、交易建议或 LLM 生成。"
    };
  }

  async collect(codes: string[]): Promise<SerenityEvidenceBundle> {
    const normalizedCodes = Array.from(new Set(codes.map(normalizeStockCode).filter(Boolean)));
    const warnings: string[] = [];
    const quoteMap = await fetchQuoteMap(normalizedCodes, warnings);
    const profileMap = await fetchProfileMap(normalizedCodes, warnings);
    const fundFlowMap = await fetchFundFlowMap(normalizedCodes, warnings);
    const tushare = await fetchTushareEvidence(normalizedCodes, warnings);

    return {
      quoteMap,
      profileMap,
      fundFlowMap,
      financialMap: tushare.financialMap,
      holderMap: tushare.holderMap,
      forecastMap: tushare.forecastMap,
      warnings
    };
  }
}

async function fetchQuoteMap(codes: string[], warnings: string[]) {
  const quoteMap = new Map<string, SerenityQuoteEvidenceData>();
  if (!codes.length) return quoteMap;
  const quotes = await eastmoneyAdapter.getStockQuotes(codes, { timeoutMs: 12000, retries: 1 }).catch((error) => ({
    data: null,
    warnings: [`东方财富个股报价补证失败：${error instanceof Error ? error.message : String(error)}`]
  }));
  warnings.push(...(quotes.warnings ?? []));
  for (const quote of quotes.data ?? []) quoteMap.set(normalizeStockCode(quote.marketCode || quote.code), quote);
  return quoteMap;
}

async function fetchProfileMap(codes: string[], warnings: string[]) {
  const profileMap = new Map<string, SerenityProfileEvidenceData>();
  const profileSettled = await Promise.all(codes.slice(0, MAX_PROFILE_FETCH).map(async (code) => {
    const profile = await eastmoneyAdapter.getCompanyProfile(code, { timeoutMs: 12000, retries: 1 }).catch((error) => ({
      data: null,
      warnings: [`东方财富 F10 公司概况补证失败：${code} ${error instanceof Error ? error.message : String(error)}`]
    }));
    return { code: normalizeStockCode(code), profile };
  }));
  for (const item of profileSettled) {
    warnings.push(...(item.profile.warnings ?? []));
    if (item.profile.data) profileMap.set(item.code, item.profile.data);
  }
  return profileMap;
}

async function fetchFundFlowMap(codes: string[], warnings: string[]) {
  const fundFlowMap = new Map<string, SerenityFundFlowEvidenceData>();
  const fundSettled = await Promise.all(codes.slice(0, MAX_FUND_FETCH).map(async (code) => {
    const fund = await eastmoneyAdapter.getStockFundFlow(code, 5, { timeoutMs: 12000, retries: 1 }).catch((error) => ({
      data: null,
      warnings: [`东方财富资金流补证失败：${code} ${error instanceof Error ? error.message : String(error)}`]
    }));
    return { code: normalizeStockCode(code), fund };
  }));
  for (const item of fundSettled) {
    warnings.push(...(item.fund.warnings ?? []));
    if (item.fund.data?.length) fundFlowMap.set(item.code, item.fund.data);
  }
  return fundFlowMap;
}

async function fetchTushareEvidence(codes: string[], warnings: string[]) {
  const financialMap = new Map<string, TushareFinancialIndicator>();
  const holderMap = new Map<string, TushareHolderNumber>();
  const forecastMap = new Map<string, TushareForecast>();

  if (!tushareAdapter.isEnabled() || !codes.length) return { financialMap, holderMap, forecastMap };

  const period = latestReportPeriodForSerenity();
  const endDate = compactToday();
  const limitedCodes = codes.slice(0, MAX_TUSHARE_FETCH);
  const [financials, holders, forecasts] = await Promise.all([
    tushareAdapter.getFinancialIndicators(limitedCodes, period).catch((error) => ({
      data: [],
      warnings: [`Tushare 财务指标补证失败：${error instanceof Error ? error.message : String(error)}`]
    })),
    tushareAdapter.getHolderNumbers(limitedCodes, endDate).catch((error) => ({
      data: [],
      warnings: [`Tushare 股东户数补证失败：${error instanceof Error ? error.message : String(error)}`]
    })),
    tushareAdapter.getForecasts(limitedCodes, endDate).catch((error) => ({
      data: [],
      warnings: [`Tushare 业绩预告补证失败：${error instanceof Error ? error.message : String(error)}`]
    }))
  ]);
  warnings.push(...financials.warnings, ...holders.warnings, ...forecasts.warnings);
  for (const item of financials.data) financialMap.set(normalizeStockCode(item.code), item);
  for (const item of holders.data) holderMap.set(normalizeStockCode(item.code), item);
  for (const item of forecasts.data) forecastMap.set(normalizeStockCode(item.code), item);
  return { financialMap, holderMap, forecastMap };
}

function latestReportPeriodForSerenity() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 11) return `${year}0930`;
  if (month >= 8) return `${year}0630`;
  if (month >= 5) return `${year}0331`;
  return `${year - 1}1231`;
}

function compactToday() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

export const serenityEvidenceProvider = new SerenityEvidenceProvider();
