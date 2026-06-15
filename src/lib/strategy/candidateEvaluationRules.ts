import type { Fact, MarketRuleResult, MarketSessionContext, SectorConstituentSnapshot, SectorRuleResult, StockCandidate } from "@/lib/types";
import { TREND_STRETCH_LIMIT, ZH } from "@/lib/strategy/support";
import { diagnosticsToScoreBreakdown, numberValue } from "@/lib/strategy/utils";
import { normalizeStockCode } from "@/lib/strategy/candidateUtils";
import { evaluateBuyPoint } from "@/lib/strategy/buyPointRules";
import { buildCompleteness, buildKlineSummary, evaluateFundFlowQuality, inferFundFlow, inferTrend, parseFundFlow, parseTechnical } from "@/lib/strategy/stockDataRules";
import { evaluateCandidateSignalQuality } from "@/lib/strategy/candidateSignalQuality";
import { buildInvalidCondition, decideCandidateAction, evaluateStockActivity, evaluateTradability, inferCandidateRole, positionLimitForAction, roleAllowsTrial, scoreCandidateStrength } from "@/lib/strategy/stockSignalRules";
import { evaluateMainlineAttribution } from "@/lib/strategy/candidateSources";
import { buildCompanyKnowledge, type ShareholderParsed } from "@/lib/strategy/companyKnowledge";
import { recordCandidateFacts } from "@/lib/strategy/candidateFactRules";
import { evaluateCandidateOpportunity } from "@/lib/strategy/candidateOpportunityRules";

type RowMap = Map<string, Record<string, unknown>>;
type RowListMap = Map<string, Record<string, unknown>[]>;
type SectorMembership = Map<string, { name: string; boardCode: string; boardType: SectorConstituentSnapshot["boardType"] }>;

export type CandidateEvaluationContext = {
  session: MarketSessionContext;
  sectors: SectorRuleResult[];
  market: MarketRuleResult;
  facts: Fact[];
  technicalRows: RowMap;
  fundRows: RowMap;
  profileRows: RowMap;
  klineRows: RowMap;
  incomeRows: RowListMap;
  balanceRows: RowListMap;
  cashFlowRows: RowListMap;
  shareholderRows: Map<string, ShareholderParsed>;
  reserveRows: RowMap;
  sectorMembership: SectorMembership;
};

export function evaluateCandidateRow(row: Record<string, unknown>, index: number, context: CandidateEvaluationContext): StockCandidate {
  const {
    session,
    sectors,
    market,
    facts,
    technicalRows,
    fundRows,
    profileRows,
    klineRows,
    incomeRows,
    balanceRows,
    cashFlowRows,
    shareholderRows,
    reserveRows,
    sectorMembership
  } = context;

const code = String(row.code);
  const name = String(row.name);
  const technicalRow = technicalRows.get(code);
  const fundRow = fundRows.get(code);
  const profile = profileRows.get(code);
  const kline = klineRows.get(code);
  const technical = parseTechnical(technicalRow);
  const fundFlow = parseFundFlow(fundRow);
  const membership = sectorMembership.get(normalizeStockCode(code));
  const attribution = evaluateMainlineAttribution(name, sectors, membership, profile);
  const mainSector = attribution.matchedSector ? sectors.find((sector) => sector.name === attribution.matchedSector) : undefined;
  const hasSectorMembership = attribution.status === "direct_constituent";
  const hasBusinessMatch = attribution.status === "business_direct";
  const sectorEvidenceOk = !attribution.shouldExclude && Boolean(mainSector);
  const companyKnowledge = buildCompanyKnowledge(code, name, profile, mainSector?.name ?? "unknown", {
    hasSectorMembership,
    hasBusinessMatch,
    themeMatchType: attribution.status,
    themeMatchLogic: attribution.reason,
    incomeHistory: incomeRows.get(normalizeStockCode(code)),
    balanceHistory: balanceRows.get(normalizeStockCode(code)),
    cashFlowHistory: cashFlowRows.get(normalizeStockCode(code)),
    shareholder: shareholderRows.get(normalizeStockCode(code)),
    reserve: reserveRows.get(normalizeStockCode(code))
  });
  const klineSummary = buildKlineSummary(kline, technical);
  const price = numberValue(row.zxj);
  const changePct = numberValue(row.zdf);
  const quote = {
    latest: price,
    changePct,
    amount: numberValue(row.cje ?? row.amount),
    volume: numberValue(row.volume ?? row.cjl),
    turnoverRate: numberValue(row.hsl ?? row.turnoverRate),
    volumeRatio: numberValue(row.lb ?? row.volumeRatio),
    peTtm: numberValue(row.peTtm ?? row.pe_ttm),
    pb: numberValue(row.pb),
    psTtm: numberValue(row.psTtm ?? row.ps_ttm),
    dividendYieldTtm: numberValue(row.dividendYieldTtm ?? row.dv_ttm),
    mainNetInflow: numberValue(row.mainNetInflow) ?? fundFlow?.mainNetFlow,
    floatMarketValue: numberValue(row.floatMarketValue)
  };
  const tradability = evaluateTradability(changePct);
  const dataCompleteness = buildCompleteness(Boolean(changePct !== undefined), Boolean(klineSummary), Boolean(technicalRow), Boolean(fundRow), sectorEvidenceOk, Boolean(profile), companyKnowledge);
  const trendState = inferTrend(technical);
  const fundFlowQuality = evaluateFundFlowQuality(fundFlow);
  const fundFlowState = inferFundFlow(fundFlow, fundFlowQuality);
  const role: StockCandidate["role"] = sectorEvidenceOk ? inferCandidateRole(code, row, mainSector, index) : "unknown";
  const maDistance = klineSummary?.maDistance;
  const activity = evaluateStockActivity({
    quote,
    fundFlow,
    fundFlowQuality,
    changePct,
    sectorRank: numberValue(row.sectorRank),
    maDistance,
    tradability
  });
  const farAboveMa5 = (maDistance?.ma5 ?? 0) > TREND_STRETCH_LIMIT.ma5;
  const farAboveMa20 = (maDistance?.ma20 ?? 0) > TREND_STRETCH_LIMIT.ma20;
  const sectorFading = mainSector?.stage === ZH.fading;
  const sectorDiverging = mainSector?.stage === ZH.diverging;
  const riskFlags = [...dataCompleteness.blockingReasons];
  if (!sectorEvidenceOk) riskFlags.push(attribution.reason);
  attribution.blockers.forEach((blocker) => riskFlags.push(blocker));
  if (trendState === "downtrend" || trendState === "below_ma20") riskFlags.push("趋势弱于MA20");
  if (fundFlowState === "outflow") riskFlags.push("主力资金净流出");
  fundFlowQuality.blockers.forEach((blocker) => riskFlags.push(blocker));
  if (farAboveMa5 || farAboveMa20) riskFlags.push("股价明显远离均线，禁止追涨");
  tradability.blockers.forEach((blocker) => riskFlags.push(blocker));
  if (sectorFading) riskFlags.push("主线处于退潮阶段");
  if (market.marketState === "defensive") riskFlags.push("大盘防守状态下不主动开新仓");
  const buyPointEvaluation = evaluateBuyPoint({
    trendState,
    fundFlowState,
    maDistance,
    technical,
    sectorStage: mainSector?.stage,
    allowedBuyTypes: mainSector?.allowedBuyTypes ?? [],
    marketState: market.marketState,
    sessionPhase: session.phase,
    activity,
    quote
  });
  const buyPointType = buyPointEvaluation.type;
  const strength = scoreCandidateStrength({
    role,
    trendState,
    fundFlowState,
    buyPointType,
    buyPointEvaluation,
    fundFlow,
    fundFlowQuality,
    activity,
    technical,
    sectorStage: mainSector?.stage,
    maDistance,
    dataCompleteness,
    companyKnowledge,
    marketState: market.marketState
  });
  if (buyPointEvaluation.status !== "有效") riskFlags.push(`买点${buyPointEvaluation.status}：${buyPointEvaluation.blockers.join("；") || buyPointEvaluation.triggerCondition}`);
  if (strength.score < 60) riskFlags.push(`阶段强度不足：${strength.score}/100`);
  if (!roleAllowsTrial(role, market.marketState, mainSector?.stage)) riskFlags.push("非核心定位，不给明确试错仓位");
  const action = decideCandidateAction({
    dataCompleteness,
    trendState,
    fundFlowState,
    buyPointType,
    marketState: market.marketState,
    sectorStage: mainSector?.stage,
    sectorAllowedBuyTypes: mainSector?.allowedBuyTypes ?? [],
    role,
    farAboveMa5,
    farAboveMa20,
    tradability,
    strengthScore: strength.score,
    sectorEvidenceOk,
    buyPointStatus: buyPointEvaluation.status
  });
  const signalQuality = evaluateCandidateSignalQuality({
    action,
    strengthScore: strength.score,
    buyPointEvaluation,
    dataCompleteness,
    attribution,
    role,
    trendState,
    fundFlowState,
    marketState: market.marketState,
    sectorStage: mainSector?.stage,
    tradability,
    activity,
    riskFlags
  });
  const opportunityProfile = evaluateCandidateOpportunity({
    action,
    strengthScore: strength.score,
    signalScore: signalQuality.score,
    dataCompleteness,
    mainlineAttribution: attribution,
    role,
    trendState,
    fundFlowState,
    buyPointEvaluation,
    marketState: market.marketState,
    sectorStage: mainSector?.stage,
    tradability,
    riskFlags
  });
  const evidenceRefs = recordCandidateFacts({
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
  });
  return {
    code,
    name,
    price,
    quote,
    sectorName: sectorEvidenceOk ? mainSector?.name ?? "未知" : "主线关联待确认",
    role,
    strengthScore: strength.score,
    signalScore: signalQuality.score,
    signalTier: signalQuality.tier,
    signalLabel: signalQuality.label,
    signalReasons: signalQuality.reasons,
    opportunityProfile,
    diagnostics: strength.diagnostics,
    scoreBreakdown: diagnosticsToScoreBreakdown({
      prefix: `stock.${code}`,
      diagnostics: strength.diagnostics,
      defaultDataSources: ["westock-data: kline/technical/fund/profile", "东方财富: sector membership", "Tushare: daily/daily_basic/fundamental fallback"],
      evidenceRefs
    }),
    trendState,
    fundFlowState,
    buyPointType,
    action,
    positionLimitPct: positionLimitForAction(action, market, sectorDiverging),
    invalidCondition: buildInvalidCondition(trendState, fundFlowState, mainSector?.stage),
    riskFlags,
    dataCompleteness,
    companyKnowledge,
    mainlineAttribution: attribution,
    buyPointEvaluation,
    klineSummary,
    technical,
    fundFlow,
    fundFlowQuality,
    activity,
    tradability,
    evidenceRefs
  };}
