import type { CompanyKnowledgeCard, Fact, SectorRuleResult, StockActivitySnapshot, StockCandidate, StockFundFlowQuality, StockFundFlowSnapshot, StockTechnicalSnapshot } from "@/lib/types";
import { pushFact } from "@/lib/strategy/utils";
import { formatMoney, formatPct } from "@/lib/strategy/candidateUtils";
import { trendLabel } from "@/lib/strategy/stockDataRules";
import { buildRoleReason } from "@/lib/strategy/stockSignalRules";
import { formatAttributionStatus } from "@/lib/strategy/candidateSources";

type CandidateSignalQualitySnapshot = {
  score: number;
  tier: NonNullable<StockCandidate["signalTier"]>;
  label: NonNullable<StockCandidate["signalLabel"]>;
  reasons: string[];
};

export type CandidateFactInput = {
  facts: Fact[];
  code: string;
  name: string;
  row: Record<string, unknown>;
  index: number;
  mainSector?: SectorRuleResult;
  changePct?: number;
  price?: number;
  tradability: NonNullable<StockCandidate["tradability"]>;
  klineSummary?: StockCandidate["klineSummary"];
  technical?: StockTechnicalSnapshot;
  technicalRow?: Record<string, unknown>;
  fundRow?: Record<string, unknown>;
  fundFlow?: StockFundFlowSnapshot;
  fundFlowQuality: StockFundFlowQuality;
  profile?: Record<string, unknown>;
  companyKnowledge: CompanyKnowledgeCard;
  attribution: NonNullable<StockCandidate["mainlineAttribution"]>;
  sectorEvidenceOk: boolean;
  role: StockCandidate["role"];
  strength: { score: number; diagnostics: NonNullable<StockCandidate["diagnostics"]> };
  buyPointEvaluation: NonNullable<StockCandidate["buyPointEvaluation"]>;
  activity: StockActivitySnapshot;
  signalQuality: CandidateSignalQualitySnapshot;
  opportunityProfile: NonNullable<StockCandidate["opportunityProfile"]>;
};

export function recordCandidateFacts(input: CandidateFactInput) {
  const {
    facts,
    code,
    name,
    row,
    index,
    mainSector,
    changePct,
    price,
    tradability,
    klineSummary,
    technical,
    technicalRow,
    fundRow,
    fundFlow,
    fundFlowQuality,
    profile,
    companyKnowledge,
    attribution,
    sectorEvidenceOk,
    role,
    strength,
    buyPointEvaluation,
    activity,
    signalQuality,
    opportunityProfile
  } = input;

  pushFact(facts, `stock.${code}.hot.zdf`, "dataSourceFact", `${name} 热门股涨跌幅 ${changePct ?? "缺失"}%，最新价 ${price ?? "缺失"}`, changePct ?? null, "%");
  pushFact(
    facts,
    `rule.stock.${code}.tradability`,
    "ruleComputed",
    `${name} 买入可达性：${tradability.status}，评分${tradability.score}/100；阻断：${tradability.blockers.join("；") || "无"}；等待条件：${tradability.waitFor}；次日/后续计划：${tradability.nextSessionPlan?.mode ?? "无"}，前提${tradability.nextSessionPlan?.preconditions.join("；") || "无"}，不追条件${tradability.nextSessionPlan?.doNotChase.join("；") || "无"}，失效${tradability.nextSessionPlan?.invalidConditions.join("；") || "无"}`,
    tradability.score
  );
  if (klineSummary) {
    pushFact(facts, `stock.${code}.kline.latest`, "dataSourceFact", `${name} 最新日线收盘价 ${klineSummary.latestClose ?? "缺失"}，趋势 ${trendLabel(klineSummary.trend)}，${klineSummary.volumePrice}`, klineSummary.latestClose ?? null);
  }
  if (technical) {
    pushFact(facts, `stock.${code}.technical.ma20`, "dataSourceFact", `${name} 收盘价 ${technical.closePrice ?? "缺失"}，MA20 ${technical.ma20 ?? "缺失"}，MA60 ${technical.ma60 ?? "缺失"}`, technical.ma20 ?? null);
  }
  if (fundFlow) {
    pushFact(facts, `stock.${code}.fund.MainNetFlow`, "dataSourceFact", `${name} 主力净流 ${fundFlow.mainNetFlow ?? "缺失"}，5日 ${fundFlow.mainNetFlow5D ?? "缺失"}，20日 ${fundFlow.mainNetFlow20D ?? "缺失"}`, fundFlow.mainNetFlow ?? null);
    pushFact(facts, `stock.${code}.fund.quality`, "ruleComputed", `${name} 资金流质量：${fundFlowQuality.state}，评分${fundFlowQuality.score}/100；依据：${fundFlowQuality.evidence.join("；") || "无"}；阻断：${fundFlowQuality.blockers.join("；") || "无"}`, fundFlowQuality.score);
  }
  if (profile) {
    pushFact(facts, `company.${code}.business`, "dataSourceFact", `${name} 主营业务：${companyKnowledge.coreBusiness}`, companyKnowledge.coreBusiness);
  }
  if (companyKnowledge.financialSummary) {
    pushFact(
      facts,
      `company.${code}.financial.summary`,
      "dataSourceFact",
      `${name} 财务摘要：${companyKnowledge.financialSummary.reportDate ?? "日期缺失"}，营收${formatMoney(companyKnowledge.financialSummary.revenue)}，归母净利${formatMoney(companyKnowledge.financialSummary.netProfit)}，毛利率${formatPct(companyKnowledge.financialSummary.grossMarginPct)}，资产负债率${formatPct(companyKnowledge.financialSummary.debtRatioPct)}，经营现金流${formatMoney(companyKnowledge.financialSummary.operatingCashFlow)}。`,
      companyKnowledge.financialTrend
    );
  }
  if (companyKnowledge.shareholderSummary) {
    pushFact(
      facts,
      `company.${code}.shareholder.summary`,
      "dataSourceFact",
      `${name} 股东摘要：${companyKnowledge.shareholderSummary.reportDate ?? "日期缺失"}，第一大股东${companyKnowledge.shareholderSummary.topHolder ?? "缺失"}，持股${formatPct(companyKnowledge.shareholderSummary.topHolderPct)}，股东户数${companyKnowledge.shareholderSummary.holderCount ?? "缺失"}。`,
      companyKnowledge.shareholderSummary.topHolderPct ?? null
    );
  }
  pushFact(
    facts,
    `rule.stock.${code}.mainline_match`,
    "ruleComputed",
    `${name} 主线归属：${formatAttributionStatus(attribution.status)}；目标主线 ${attribution.matchedSector ?? "无"}；成分板块 ${attribution.membershipSector ?? "缺失"}；命中关键词 ${attribution.businessKeywords.join("、") || "无"}；证据 ${attribution.evidence.join("；") || "无"}；阻断 ${attribution.blockers.join("；") || "无"}；结论：${attribution.reason}`,
    sectorEvidenceOk
  );
  pushFact(
    facts,
    `rule.stock.${code}.mainline_attribution`,
    "ruleComputed",
    `${name} 归属证据链：置信度${attribution.confidence}，来源质量${attribution.evidenceChain?.sourceQuality ?? "未知"}，${attribution.evidenceChain?.reviewRequired ? `需要复核：${attribution.evidenceChain.reviewReason ?? "证据链不完整"}` : "无需人工复核"}，${attribution.shouldExclude ? "剔除候选" : "允许进入候选"}。成分证据：${attribution.evidenceChain?.constituentEvidence.join("；") || "无"}；主营证据：${attribution.evidenceChain?.businessEvidence.join("；") || "无"}；产业链证据：${attribution.evidenceChain?.industryChainEvidence.join("；") || "无"}；否定证据：${attribution.evidenceChain?.negativeEvidence.join("；") || "无"}。${attribution.reason}`,
    attribution.status
  );
  pushFact(
    facts,
    `rule.stock.${code}.role`,
    "ruleComputed",
    `${name} 个股定位：${role}；定位依据：${buildRoleReason(code, row, mainSector, index)}`,
    role
  );
  pushFact(
    facts,
    `rule.stock.${code}.strength`,
    "ruleComputed",
    `${name} 阶段强股评分 ${strength.score}/100：${strength.diagnostics.map((item) => `${item.label}${item.score}/${item.max}`).join("，")}`,
    strength.score
  );
  pushFact(
    facts,
    `rule.stock.${code}.buyPoint`,
    "ruleComputed",
    `${name} 买点评估：${buyPointEvaluation.status}/${buyPointEvaluation.type}，评分${buyPointEvaluation.score}/20；满足：${buyPointEvaluation.satisfied.join("；") || "无"}；阻断：${buyPointEvaluation.blockers.join("；") || "无"}；时段：${buyPointEvaluation.sessionNote}；触发：${buyPointEvaluation.triggerCondition}；失效：${buyPointEvaluation.invalidCondition}`,
    buyPointEvaluation.score
  );
  pushFact(
    facts,
    `rule.stock.${code}.activity`,
    "ruleComputed",
    `${name} 活跃度评分 ${activity.score}/100：${activity.reasons.join("；") || "缺少成交额、换手率、资金流或板块排名证据"}；阻断：${activity.blockers.join("；") || "无"}`,
    activity.score
  );
  pushFact(
    facts,
    `rule.stock.${code}.signal_quality`,
    "ruleComputed",
    `${name} 候选信号质量：${signalQuality.tier}/${signalQuality.label}，排序分 ${signalQuality.score}/100；依据：${signalQuality.reasons.join("；")}`,
    signalQuality.score
  );
  pushFact(
    facts,
    `rule.stock.${code}.opportunity_profile`,
    "ruleComputed",
    `${name} 机会画像：${opportunityProfile.label}，机会分 ${opportunityProfile.score}/100；主因：${opportunityProfile.primaryReason}；激活条件：${opportunityProfile.activationConditions.join("；") || "无"}；阻断原因：${opportunityProfile.blockingReasons.join("；") || "无"}；后续动作：${opportunityProfile.nextSteps.join("；") || "无"}`,
    opportunityProfile.score
  );
  const evidenceRefs = [
    `stock.${code}.hot.zdf`,
    `rule.stock.${code}.tradability`,
    klineSummary ? `stock.${code}.kline.latest` : "",
    profile ? `company.${code}.business` : "",
    companyKnowledge.financialSummary ? `company.${code}.financial.summary` : "",
    companyKnowledge.shareholderSummary ? `company.${code}.shareholder.summary` : "",
    technicalRow ? `stock.${code}.technical.ma20` : "",
    fundRow ? `stock.${code}.fund.MainNetFlow` : "",
    fundRow ? `stock.${code}.fund.quality` : "",
    `rule.stock.${code}.mainline_match`,
    `rule.stock.${code}.mainline_attribution`,
    `rule.stock.${code}.role`,
    `rule.stock.${code}.strength`,
    `rule.stock.${code}.buyPoint`,
    `rule.stock.${code}.activity`,
    `rule.stock.${code}.signal_quality`,
    `rule.stock.${code}.opportunity_profile`
  ].filter(Boolean);
  evidenceRefs.forEach((factId) => {
    if (!facts.some((fact) => fact.factId === factId)) {
      pushFact(facts, factId, "dataSourceFact", `${name} 缺少 ${factId} 对应事实`, null);
    }
  });
  return evidenceRefs;
}
