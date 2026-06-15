import type { CompanyKnowledgeCard } from "@/lib/types";
import type { ShareholderParsed } from "@/lib/strategy/companyKnowledge";
import { formatMoney, formatPct, formatSignedPct, pctChange } from "@/lib/strategy/candidateUtils";
import { numberValue, rowDateKey } from "@/lib/strategy/utils";

export function buildFinancialSummary(
  incomeHistory?: Record<string, unknown>[],
  balanceHistory?: Record<string, unknown>[],
  cashFlowHistory?: Record<string, unknown>[]
): CompanyKnowledgeCard["financialSummary"] | undefined {
  const income = incomeHistory?.[0];
  const previousIncome = incomeHistory?.[1];
  const balance = balanceHistory?.[0];
  const cashFlow = cashFlowHistory?.[0];
  const previousCashFlow = cashFlowHistory?.[1];
  if (!income && !balance && !cashFlow) return undefined;
  const revenue = numberValue(income?.OperatingRevenue ?? income?.TotalOperatingRevenue);
  const previousRevenue = numberValue(previousIncome?.OperatingRevenue ?? previousIncome?.TotalOperatingRevenue);
  const netProfit = numberValue(income?.NPParentCompanyOwners);
  const previousNetProfit = numberValue(previousIncome?.NPParentCompanyOwners);
  const grossProfit = numberValue(income?.GrossProfitTTM);
  const previousGrossProfit = numberValue(previousIncome?.GrossProfitTTM);
  const totalAssets = numberValue(balance?.TotalAssets);
  const totalLiability = numberValue(balance?.TotalLiability);
  const equity = numberValue(balance?.TotalShareholderEquity);
  const operatingCashFlow = numberValue(cashFlow?.NetOperateCashFlow);
  const previousOperatingCashFlow = numberValue(previousCashFlow?.NetOperateCashFlow);
  const directGrossMarginPct = numberValue(income?.grossMarginPct);
  const directDebtRatioPct = numberValue(income?.debtRatioPct ?? balance?.debtRatioPct);
  const directRoePct = numberValue(income?.roePct ?? balance?.roePct);
  const grossMarginPct = directGrossMarginPct ?? (revenue && grossProfit ? Number(((grossProfit / revenue) * 100).toFixed(2)) : undefined);
  const previousGrossMarginPct = previousRevenue && previousGrossProfit ? Number(((previousGrossProfit / previousRevenue) * 100).toFixed(2)) : undefined;
  const netProfitMarginPct = revenue && netProfit ? Number(((netProfit / revenue) * 100).toFixed(2)) : undefined;
  const debtRatioPct = directDebtRatioPct ?? (totalAssets && totalLiability ? Number(((totalLiability / totalAssets) * 100).toFixed(2)) : undefined);
  const revenueChangePct = numberValue(income?.revenueChangePct) ?? pctChange(revenue, previousRevenue);
  const netProfitChangePct = numberValue(income?.netProfitChangePct) ?? pctChange(netProfit, previousNetProfit);
  const operatingCashFlowChangePct = pctChange(operatingCashFlow, previousOperatingCashFlow);
  const grossMarginChangePct =
    grossMarginPct !== undefined && previousGrossMarginPct !== undefined
      ? Number((grossMarginPct - previousGrossMarginPct).toFixed(2))
      : undefined;
  const trendBasis = [
    revenueChangePct !== undefined ? `最近多期营收变化 ${formatSignedPct(revenueChangePct)}` : "",
    netProfitChangePct !== undefined ? `最近多期归母净利变化 ${formatSignedPct(netProfitChangePct)}` : "",
    operatingCashFlowChangePct !== undefined ? `最近多期经营现金流变化 ${formatSignedPct(operatingCashFlowChangePct)}` : "",
    grossMarginChangePct !== undefined ? `毛利率较上一期变化 ${formatSignedPct(grossMarginChangePct)}` : "",
    debtRatioPct !== undefined ? `最新资产负债率 ${formatPct(debtRatioPct)}` : ""
  ].filter(Boolean);
  return {
    reportDate: String(income?.EndDate ?? balance?.EndDate ?? cashFlow?.EndDate ?? income?._date ?? ""),
    revenue,
    netProfit,
    grossMarginPct,
    netProfitMarginPct,
    operatingCashFlow,
    debtRatioPct,
    roePct: directRoePct ?? (equity && netProfit ? Number(((netProfit / equity) * 100).toFixed(2)) : undefined),
    revenueChangePct,
    netProfitChangePct,
    grossMarginChangePct,
    operatingCashFlowChangePct,
    trendBasis
  };
}

export function inferFinancialTrend(summary?: CompanyKnowledgeCard["financialSummary"]): CompanyKnowledgeCard["financialTrend"] {
  if (!summary) return "数据不足";
  let score = 0;
  if ((summary.revenueChangePct ?? 0) >= 5) score += 1;
  if ((summary.revenueChangePct ?? 0) <= -8) score -= 1;
  if ((summary.netProfitChangePct ?? 0) >= 8) score += 2;
  if ((summary.netProfitChangePct ?? 0) <= -15) score -= 2;
  if ((summary.grossMarginChangePct ?? 0) >= 1) score += 1;
  if ((summary.grossMarginChangePct ?? 0) <= -2) score -= 1;
  if (summary.operatingCashFlow !== undefined && summary.operatingCashFlow > 0) score += 1;
  if (summary.operatingCashFlow !== undefined && summary.operatingCashFlow < 0) score -= 2;
  if ((summary.operatingCashFlowChangePct ?? 0) >= 10) score += 1;
  if ((summary.operatingCashFlowChangePct ?? 0) <= -20) score -= 1;
  if (summary.debtRatioPct !== undefined && summary.debtRatioPct > 75) score -= 2;
  if (summary.debtRatioPct !== undefined && summary.debtRatioPct < 60) score += 1;
  if (summary.netProfitMarginPct !== undefined && summary.netProfitMarginPct < 0) score -= 2;
  if (score >= 3) return "改善";
  if (score <= -3) return "恶化";
  return "平稳";
}

export function buildShareholderSummary(parsed?: ShareholderParsed): CompanyKnowledgeCard["shareholderSummary"] | undefined {
  if (!parsed) return undefined;
  const top = parsed.topHolders?.[0];
  const latest = parsed.holderStats?.[0];
  const previous = parsed.holderStats?.[1];
  const holderCount = numberValue(latest?.totalSHNum ?? latest?.aSHNum);
  const previousCount = numberValue(previous?.totalSHNum ?? previous?.aSHNum ?? latest?.previousTotalSHNum);
  return {
    reportDate: latest?.date ? String(latest.date) : undefined,
    topHolder: top?.name ? String(top.name) : undefined,
    topHolderPct: numberValue(top?.holdPct),
    holderCount,
    holderCountChangePct: holderCount && previousCount ? Number((((holderCount - previousCount) / previousCount) * 100).toFixed(2)) : undefined,
    northboundHolderPct: parsed.topHolders?.find((holder) => String(holder.name ?? "").includes("香港中央结算"))?.holdPct as number | undefined
  };
}

export function buildEarningsPreview(row?: Record<string, unknown>): CompanyKnowledgeCard["earningsPreview"] | undefined {
  if (!row) return undefined;
  return {
    reportEndDate: row.reportEndDate ? String(row.reportEndDate) : undefined,
    disclosureDate: row.disclosureDate ? String(row.disclosureDate) : undefined,
    disclosureDesc: row.disclosureDesc ? String(row.disclosureDesc) : undefined
  };
}
