import type { CompanyKnowledgeCard, SectorRuleResult } from "@/lib/types";
import type { ParsedCommandResult } from "@/lib/westock/parser";
import { businessMatchesSector, inferIndustryChainPosition } from "@/lib/strategy/candidateSources";
import { formatMoney, formatPct, formatSignedPct, normalizeStockCode, pctChange } from "@/lib/strategy/candidateUtils";
import { allTableRows, numberValue, rowDateKey } from "@/lib/strategy/utils";
import { buildEarningsPreview, buildFinancialSummary, buildShareholderSummary, inferFinancialTrend } from "@/lib/strategy/companyFinancialKnowledge";
import { buildCompanyInvalidConditions, buildFundamentalHighlights, buildFundamentalRisks, buildLongTermWatchItems, inferMoveDriver, themeMatchTypeLabel } from "@/lib/strategy/companyNarrativeKnowledge";

export type ShareholderParsed = {
  topHolders?: Record<string, unknown>[];
  holderStats?: Record<string, unknown>[];
};

export function latestRowsByCode(result: ParsedCommandResult | null | undefined, codeField: string) {
  const latest = new Map<string, Record<string, unknown>>();
  for (const [code, list] of rowsByCode(result, codeField)) {
    latest.set(code, list[0]);
  }
  return latest;
}

export function rowsByCode(result: ParsedCommandResult | null | undefined, codeField: string) {
  const rows = allTableRows(result).filter((row) => row[codeField] !== undefined || row.SecuCode !== undefined || row.code !== undefined);
  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const code = normalizeStockCode(String(row[codeField] ?? row.SecuCode ?? row.code ?? ""));
    if (!code) continue;
    const list = grouped.get(code) ?? [];
    list.push(row);
    grouped.set(code, list);
  }
  for (const [code, list] of grouped) {
    list.sort((a, b) => rowDateKey(b).localeCompare(rowDateKey(a)));
  }
  return grouped;
}

export function buildShareholderMap(result: ParsedCommandResult | null | undefined, codes: string[]) {
  const map = new Map<string, ShareholderParsed>();
  const directStats = rowsByCode(result, "code");
  const tables = result?.sections.filter((section) => section.type === "markdownTable" && section.columns.length > 0) ?? [];
  const normalizedCodes = Array.from(new Set(codes.map(normalizeStockCode).filter(Boolean)));
  for (const code of normalizedCodes) {
    const rows = directStats.get(code)?.filter((row) => String(row.source ?? "").includes("tushare")) ?? [];
    if (rows.length) map.set(code, { holderStats: rows });
  }
  let tableIndex = 0;
  for (const code of normalizedCodes) {
    const topHolders = tables[tableIndex]?.title === "十大股东" ? tables[tableIndex].rows : undefined;
    const holderStats = tables[tableIndex + 2]?.title === "股东户数统计" ? tables[tableIndex + 2].rows : undefined;
    if (topHolders || holderStats) map.set(code, { topHolders, holderStats });
    tableIndex += 3;
  }
  return map;
}

function inferThemeMatchType(
  hasSectorMembership: boolean,
  hasBusinessMatch: boolean,
  business: string,
  sectorName: string
): CompanyKnowledgeCard["themeMatchType"] {
  if (hasSectorMembership) return "direct_constituent";
  if (hasBusinessMatch) return "business_direct";
  const text = `${business} ${sectorName}`.toLowerCase();
  if (/材料|设备|封装|模组|元器件|电路板|印制电路板|被动元件|电容|电感|连接器|气体|显示|面板|oled|led|晶圆|封测|功率器件/.test(text)) return "supply_chain_related";
  if (business) return "theme_indirect";
  return "unknown";
}

export function buildCompanyKnowledge(
  code: string,
  name: string,
  row: Record<string, unknown> | undefined,
  mainSector: string,
  match: {
    hasSectorMembership: boolean;
    hasBusinessMatch: boolean;
    themeMatchType?: CompanyKnowledgeCard["themeMatchType"];
    themeMatchLogic?: string;
    incomeHistory?: Record<string, unknown>[];
    balanceHistory?: Record<string, unknown>[];
    cashFlowHistory?: Record<string, unknown>[];
    shareholder?: ShareholderParsed;
    reserve?: Record<string, unknown>;
  }
): CompanyKnowledgeCard {
  const business = row?.business ? String(row.business) : "";
  const industry = row?.industry ? String(row.industry) : "";
  const missingFields: string[] = [];
  if (!business) missingFields.push("business");
  if (!industry) missingFields.push("industry");
  if (!match.incomeHistory?.[0] || !match.balanceHistory?.[0] || !match.cashFlowHistory?.[0]) missingFields.push("financial");
  if (!match.shareholder) missingFields.push("shareholder");
  const state = missingFields.length === 0 ? "sufficient" : missingFields.length < 2 ? "partial" : "missing";
  const industryChainPosition = inferIndustryChainPosition(business, industry, mainSector);
  const themeMatchType = match.themeMatchType ?? inferThemeMatchType(match.hasSectorMembership, match.hasBusinessMatch, business, mainSector);
  const themeMatch: CompanyKnowledgeCard["themeMatch"] = match.hasSectorMembership
    ? "strong"
    : match.hasBusinessMatch
      ? "medium"
      : themeMatchType === "supply_chain_related"
        ? "weak"
      : business && mainSector !== "unknown"
        ? "weak"
        : "unknown";
  const themeMatchLogic = match.themeMatchLogic ?? (match.hasSectorMembership
    ? `成分股数据证明公司属于当前主线 ${mainSector}。`
    : match.hasBusinessMatch
      ? `主营业务或行业关键词与当前主线 ${mainSector} 存在匹配。`
      : business
        ? `主营业务与当前主线 ${mainSector} 缺少直接匹配证据，标记为主题偏离/待确认。`
        : "公司基础信息不足。");
  const financialSummary = buildFinancialSummary(match.incomeHistory, match.balanceHistory, match.cashFlowHistory);
  const financialTrend = inferFinancialTrend(financialSummary);
  const shareholderSummary = buildShareholderSummary(match.shareholder);
  const earningsPreview = buildEarningsPreview(match.reserve);
  const driver = inferMoveDriver(themeMatchType, financialTrend, shareholderSummary);
  const highlights = buildFundamentalHighlights(financialSummary, shareholderSummary, earningsPreview, industryChainPosition);
  const risks = buildFundamentalRisks(financialSummary, shareholderSummary, business, mainSector);
  const watchItems = buildLongTermWatchItems(financialSummary, shareholderSummary, earningsPreview, themeMatchType);
  const logicInvalidConditions = buildCompanyInvalidConditions(themeMatchType, financialTrend, industryChainPosition);
  return {
    code,
    name,
    industry,
    mainBusiness: business,
    coreBusiness: business || "公司基础信息不足",
    productsOrServices: business ? [business] : [],
    industryChainPosition,
    themeMatchType,
    themeMatch,
    themeMatchLogic,
    oneLineUnderstanding: business ? `${name}主要从事${business}，当前按${mainSector}主线进行${themeMatchTypeLabel(themeMatchType)}校验。` : `${name}公司基础信息不足，不能形成稳定公司认知。`,
    currentMoveDriver: driver,
    financialTrend,
    financialSummary,
    shareholderSummary,
    earningsPreview,
    fundamentalHighlights: highlights,
    fundamentalRisks: risks,
    longTermWatchItems: watchItems,
    logicInvalidConditions,
    companyKnowledgeState: state,
    longTermLogicAllowed: state === "sufficient" && financialTrend !== "恶化" && themeMatch !== "weak",
    sourceType: "mixed",
    missingFields
  };
}
