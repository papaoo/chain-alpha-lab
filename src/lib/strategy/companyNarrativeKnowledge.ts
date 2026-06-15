import type { CompanyKnowledgeCard } from "@/lib/types";
import { businessMatchesSector } from "@/lib/strategy/candidateSources";
import { formatMoney, formatSignedPct } from "@/lib/strategy/candidateUtils";

export function inferMoveDriver(
  matchType: CompanyKnowledgeCard["themeMatchType"],
  financialTrend: CompanyKnowledgeCard["financialTrend"],
  shareholder?: CompanyKnowledgeCard["shareholderSummary"]
): CompanyKnowledgeCard["currentMoveDriver"] {
  if (financialTrend === "改善") return "业绩";
  if (matchType === "direct_constituent" || matchType === "business_direct") return "产业逻辑";
  if ((shareholder?.holderCountChangePct ?? 0) < -3) return "资金";
  if (matchType === "supply_chain_related") return "补涨";
  return "情绪";
}

export function buildFundamentalHighlights(
  financial?: CompanyKnowledgeCard["financialSummary"],
  shareholder?: CompanyKnowledgeCard["shareholderSummary"],
  preview?: CompanyKnowledgeCard["earningsPreview"],
  chainPosition?: CompanyKnowledgeCard["industryChainPosition"]
) {
  return [
    financial?.revenue !== undefined ? `最新一期营收 ${formatMoney(financial.revenue)}` : "",
    financial?.netProfit !== undefined ? `归母净利润 ${formatMoney(financial.netProfit)}` : "",
    financial?.operatingCashFlow !== undefined ? `经营现金流 ${formatMoney(financial.operatingCashFlow)}` : "",
    financial?.revenueChangePct !== undefined && financial.revenueChangePct > 0 ? `最近多期营收变化 ${formatSignedPct(financial.revenueChangePct)}` : "",
    financial?.netProfitChangePct !== undefined && financial.netProfitChangePct > 0 ? `最近多期归母净利变化 ${formatSignedPct(financial.netProfitChangePct)}` : "",
    shareholder?.topHolder ? `第一大股东：${shareholder.topHolder}` : "",
    chainPosition && chainPosition !== "unknown" ? `产业链位置：${chainPosition}` : "",
    preview?.disclosureDate ? `后续披露日期：${preview.disclosureDate}` : ""
  ].filter(Boolean);
}

export function buildFundamentalRisks(
  financial?: CompanyKnowledgeCard["financialSummary"],
  shareholder?: CompanyKnowledgeCard["shareholderSummary"],
  business?: string,
  mainSector?: string
) {
  return [
    !business ? "公司基础信息不足，不能形成长期逻辑。" : "",
    !financial ? "财务数据未接入或解析不足，不能给出基本面支撑结论。" : "",
    financial?.operatingCashFlow !== undefined && financial.operatingCashFlow < 0 ? "经营现金流为负，基本面承接需要谨慎。" : "",
    financial?.netProfitChangePct !== undefined && financial.netProfitChangePct < -15 ? `归母净利最近多期变化 ${formatSignedPct(financial.netProfitChangePct)}，基本面趋势承压。` : "",
    financial?.grossMarginChangePct !== undefined && financial.grossMarginChangePct < -2 ? `毛利率较上一期下降 ${Math.abs(financial.grossMarginChangePct).toFixed(1)} 个百分点。` : "",
    financial?.debtRatioPct !== undefined && financial.debtRatioPct > 75 ? "资产负债率偏高，财务风险需跟踪。" : "",
    !shareholder ? "股东结构未接入或解析不足。" : "",
    mainSector && business && !businessMatchesSector({ business }, mainSector) ? "主营业务与当前主线缺少直接证据。" : ""
  ].filter(Boolean);
}

export function buildLongTermWatchItems(
  financial?: CompanyKnowledgeCard["financialSummary"],
  shareholder?: CompanyKnowledgeCard["shareholderSummary"],
  preview?: CompanyKnowledgeCard["earningsPreview"],
  matchType?: CompanyKnowledgeCard["themeMatchType"]
) {
  return [
    financial ? "持续跟踪营收、归母净利润、毛利率和经营现金流是否同步改善。" : "补充财报关键指标后再判断中期逻辑。",
    financial?.trendBasis?.length ? `当前财务趋势依据：${financial.trendBasis.slice(0, 3).join("；")}。` : "",
    shareholder ? "观察股东户数变化与核心股东持仓是否稳定。" : "补充股东户数和前十大股东变化。",
    preview?.disclosureDate ? `关注 ${preview.disclosureDate} 业绩披露。` : "关注后续业绩预告、定期报告和正式公告。",
    matchType === "direct_constituent" ? "验证公司是否仍处于当前主线成分核心位置。" : "验证主线匹配是否从间接题材转为直接业务证据。"
  ].filter(Boolean);
}

export function buildCompanyInvalidConditions(
  matchType: CompanyKnowledgeCard["themeMatchType"],
  financialTrend: CompanyKnowledgeCard["financialTrend"],
  chainPosition: CompanyKnowledgeCard["industryChainPosition"]
) {
  return [
    matchType === "mismatch" || matchType === "theme_indirect" ? "主营业务无法补充当前主线直接证据时，公司逻辑失效。" : "退出当前主线核心成分或主营匹配证据消失。",
    financialTrend === "恶化" ? "财务趋势继续恶化时，不允许生成中长期持有理由。" : "财务数据与主线预期背离时降低公司认知等级。",
    chainPosition === "unknown" ? "产业链位置无法确认时，只能按短线题材观察。" : "产业链位置与主线逻辑不再匹配时降低权重。"
  ];
}

export function themeMatchTypeLabel(type: CompanyKnowledgeCard["themeMatchType"]) {
  const labels: Record<CompanyKnowledgeCard["themeMatchType"], string> = {
    direct_constituent: "成分股直接匹配",
    business_direct: "主营业务直接匹配",
    supply_chain_related: "产业链相关",
    theme_indirect: "题材间接相关",
    mismatch: "主题偏离",
    unknown: "未知"
  };
  return labels[type];
}
