export const SCHEMA_VERSION = "mvp-1" as const;

export type SchemaVersion = typeof SCHEMA_VERSION;

export type SourceType =
  | "dataSourceFact"
  | "ruleComputed"
  | "inferredByModel"
  | "mixed";

export type DataStatus = "success" | "partial" | "empty" | "failed";
export type ParseStatus = DataStatus;
export type RuleStatus = "success" | "blocked" | "failed";
export type LlmStatus = "disabled" | "success" | "rejected" | "failed";
export type ReportStatus = "ruleOnly" | "llmEnhanced" | "blocked" | "failed";
export type ModelProvider = "openai_compatible" | "deepseek" | "anthropic_compatible";
export type NotificationChannelType = "feishu" | "wecom";

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
}

export interface Fact {
  factId: string;
  sourceType: SourceType;
  text: string;
  value?: string | number | boolean | null;
  unit?: string;
}

export interface RuleScoreBreakdownItem {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  evidenceRefs: string[];
  dataSources: string[];
  confidence: "高" | "中" | "低";
  missingFields: string[];
  downgradeReasons: string[];
  note: string;
}

export interface DataCompleteness {
  level: "complete" | "partial" | "insufficient";
  hasHotData: boolean;
  hasKlineData: boolean;
  hasTechnicalData: boolean;
  hasFundFlowData: boolean;
  hasSectorData: boolean;
  hasProfileData: boolean;
  hasCompanyKnowledge: boolean;
  missingFields: string[];
  blockingReasons: string[];
}

export interface CompanyKnowledgeCard {
  code: string;
  name: string;
  industry: string;
  mainBusiness: string;
  coreBusiness: string;
  productsOrServices: string[];
  industryChainPosition: "上游" | "中游" | "下游" | "终端应用" | "unknown";
  themeMatchType: "direct_constituent" | "business_direct" | "supply_chain_related" | "theme_indirect" | "mismatch" | "unknown";
  themeMatch: "strong" | "medium" | "weak" | "unknown";
  themeMatchLogic: string;
  oneLineUnderstanding: string;
  currentMoveDriver: "业绩" | "产业逻辑" | "情绪" | "资金" | "补涨" | "unknown";
  financialTrend: "改善" | "平稳" | "恶化" | "数据不足";
  financialSummary?: {
    reportDate?: string;
    revenue?: number;
    netProfit?: number;
    grossMarginPct?: number;
    netProfitMarginPct?: number;
    operatingCashFlow?: number;
    debtRatioPct?: number;
    roePct?: number;
    revenueChangePct?: number;
    netProfitChangePct?: number;
    grossMarginChangePct?: number;
    operatingCashFlowChangePct?: number;
    trendBasis?: string[];
  };
  shareholderSummary?: {
    reportDate?: string;
    topHolder?: string;
    topHolderPct?: number;
    holderCount?: number;
    holderCountChangePct?: number;
    northboundHolderPct?: number;
  };
  earningsPreview?: {
    reportEndDate?: string;
    disclosureDate?: string;
    disclosureDesc?: string;
  };
  fundamentalHighlights: string[];
  fundamentalRisks: string[];
  longTermWatchItems: string[];
  logicInvalidConditions: string[];
  companyKnowledgeState: "sufficient" | "partial" | "missing";
  longTermLogicAllowed: boolean;
  sourceType: SourceType;
  missingFields: string[];
}

export interface MarketIndexSnapshot {
  code: string;
  name: string;
  latestPrice?: number;
  changePct?: number;
  ma5?: number;
  ma10?: number;
  ma20?: number;
  ma60?: number;
  ma120?: number;
  ma250?: number;
  aboveMa20?: boolean;
  aboveMa60?: boolean;
  bullAlignment?: boolean;
  bearAlignment?: boolean;
  ma20SlopePct?: number;
  momentum20?: number;
  volumeRatio20?: number;
  volatility20?: number;
  intradayState?: "holding_high" | "pullback" | "downtrend" | "unknown";
  facts: Fact[];
}

export interface MarketBreadthSnapshot {
  source: "eastmoney";
  fetchedAt: string;
  total: number;
  up: number;
  down: number;
  flat: number;
  upPct?: number;
  downPct?: number;
  gt5Count: number;
  ltMinus5Count: number;
  limitUpApprox: number;
  limitDownApprox: number;
  medianChangePct?: number;
  amount: number;
}

export interface MarketRuleResult {
  marketState: "tradable" | "cautious" | "defensive";
  marketStateReason: "真实弱势" | "数据不足防守" | "风险事件防守" | "正常评估";
  marketRegime: "强势" | "震荡" | "弱势" | "退潮";
  tradeMode: "进攻" | "低吸" | "试错" | "防守" | "空仓";
  sentimentCycle: "冰点" | "修复" | "启动" | "高潮" | "分歧" | "退潮";
  styleBias: "权重" | "成长" | "题材小票" | "无明显风格";
  confidence: "高" | "中" | "低";
  dataQuality: "完整" | "部分" | "不足";
  diagnostics: Array<{
    label: string;
    score: number;
    max: number;
    status: "强" | "中" | "弱" | "缺失";
    note: string;
  }>;
  scoreBreakdown?: RuleScoreBreakdownItem[];
  maxTotalPositionPct: number;
  maxSingleStockPct: number;
  forbiddenActions: string[];
  score: number;
  breadthScore?: number;
  breadthSourceQuality?: "market" | "sector" | "hot" | "none";
  breadthReliability?: number;
  sentimentScore?: number;
  sentimentSourceQuality?: "pool" | "mixed" | "approx" | "missing";
  sentimentReliability?: number;
  sentimentSnapshot?: {
    zt: number;
    dt: number;
    zb: number;
    bigDown: number;
    ztSource: "pool" | "approx" | "missing";
    dtSource: "pool" | "approx" | "missing";
    zbSource: "pool" | "missing";
    bigDownSource: "market" | "missing";
    burstRate?: number;
    consecutiveZt?: number;
    firstZt?: number;
  };
  facts: Fact[];
  riskFlags: string[];
  status: RuleStatus;
}

export interface SectorSnapshot {
  code?: string;
  name: string;
  normalizedName?: string;
  sourceNames?: string[];
  changePct?: number;
  turnoverRate?: number;
  changePct5d?: number;
  changePct20d?: number;
  leadStock?: string;
  mainNetInflow?: number;
  mainNetInflow5d?: number;
  upDownRatio?: string;
  constituentCount?: number;
  constituentUpCount?: number;
  constituentDownCount?: number;
  constituentUpPct?: number;
  constituentStrongCount?: number;
  constituentWeakCount?: number;
  constituentAmount?: number;
  constituentMainNetInflow?: number;
  constituentFloatMarketValue?: number;
  limitUpCount?: number;
  openBoardCount?: number;
  coreStocks?: SectorCoreStockSnapshot[];
  facts: Fact[];
}

export interface SectorCoreStockSnapshot {
  code: string;
  marketCode: string;
  name: string;
  role: "龙头" | "中军" | "补涨";
  score: number;
  changePct?: number;
  amount?: number;
  turnoverRate?: number;
  floatMarketValue?: number;
  mainNetInflow?: number;
  limitStatus: "涨停" | "炸板" | "未涨停";
  consecutiveLimitCount?: number;
  risks: string[];
}

export interface SectorConstituentStock {
  code: string;
  marketCode: string;
  name: string;
  latest?: number;
  changePct?: number;
  changeAmount?: number;
  volume?: number;
  amount?: number;
  amplitude?: number;
  turnoverRate?: number;
  volumeRatio?: number;
  peDynamic?: number;
  peTtm?: number;
  psTtm?: number;
  dividendYieldTtm?: number;
  high?: number;
  low?: number;
  open?: number;
  prevClose?: number;
  floatMarketValue?: number;
  pb?: number;
  mainNetInflow?: number;
}

export interface SectorConstituentSnapshot {
  source: "eastmoney";
  fetchedAt: string;
  name: string;
  boardCode: string;
  boardType: "industry" | "concept";
  stocks: SectorConstituentStock[];
}

export interface LimitPoolStock {
  code: string;
  marketCode: string;
  name: string;
  latest?: number;
  changePct?: number;
  amount?: number;
  floatMarketValue?: number;
  totalMarketValue?: number;
  turnoverRate?: number;
  firstLimitTime?: string;
  lastLimitTime?: string;
  sealAmount?: number;
  openBoardCount?: number;
  consecutiveLimitCount?: number;
  limitStats?: string;
  industry?: string;
}

export interface LimitPoolSnapshot {
  source: "eastmoney";
  fetchedAt: string;
  pool: "zt" | "dt" | "zb" | "yesterday-zt";
  date: string;
  stocks: LimitPoolStock[];
}

export interface SectorRuleResult {
  name: string;
  code?: string;
  normalizedName?: string;
  sourceNames?: string[];
  stage: "观察" | "启动" | "确认" | "加速" | "分歧" | "退潮";
  rawStage?: SectorRuleResult["stage"];
  previousStage?: SectorRuleResult["stage"];
  stageTransition?: "新出现" | "延续" | "升级" | "降级" | "压制升级" | "降级修正";
  stageTransitionReason?: string;
  lineQuality: "日内热点" | "潜在主线" | "确认主线" | "核心主线" | "退潮主线";
  confidence: "高" | "中" | "低";
  coreStocks: SectorCoreStockSnapshot[];
  coreContinuity?: {
    retained: string[];
    appeared: string[];
    disappeared: string[];
    previousLeader?: string;
    currentLeader?: string;
    leaderChanged: boolean;
    score: number;
    state: "无历史" | "稳定" | "轮动健康" | "换龙头待确认" | "结构偏弱";
    reason: string;
  };
  diagnostics: Array<{
    label: string;
    score: number;
    max: number;
    status: "强" | "中" | "弱" | "缺失";
    note: string;
  }>;
  scoreBreakdown?: RuleScoreBreakdownItem[];
  leaderStrength: number;
  coreStrength: number;
  breadthScore: number;
  fundingScore: number;
  lifecycleDays: number;
  allowedBuyTypes: Array<StockCandidate["buyPointType"]>;
  forbiddenActions: string[];
  invalidConditions: string[];
  divergenceType?: "良性分歧" | "恶性分歧" | "日内分歧修复";
  score: number;
  facts: Fact[];
  sourceTraces?: DataSourceTrace[];
  riskFlags: string[];
}

export interface StockKlineSummary {
  period: "day" | "week" | "month" | "season" | "year";
  limit: number;
  latestClose?: number;
  maDistance?: {
    ma5?: number;
    ma10?: number;
    ma20?: number;
    ma60?: number;
  };
  trend: "above_ma20" | "below_ma20" | "reclaim_ma20" | "downtrend" | "unknown";
  volumePrice: string;
}

export interface StockTechnicalSnapshot {
  closePrice?: number;
  ma5?: number;
  ma10?: number;
  ma20?: number;
  ma60?: number;
  macdDif?: number;
  macdDea?: number;
  macd?: number;
  rsi6?: number;
  rsi12?: number;
  rsi24?: number;
}

export interface StockFundFlowSnapshot {
  mainNetFlow?: number;
  mainNetFlow5D?: number;
  mainNetFlow10D?: number;
  mainNetFlow20D?: number;
  jumboNetFlow?: number;
  blockNetFlow?: number;
  retailInFlow?: number;
  retailOutFlow?: number;
  lhbInfos?: unknown[];
}

export interface StockFundFlowQuality {
  score: number;
  state: "强流入" | "温和流入" | "弱修复" | "分歧" | "持续流出" | "未知";
  shortTerm: string;
  mediumTerm: string;
  evidence: string[];
  blockers: string[];
}

export interface StockActivitySnapshot {
  score: number;
  status: "强" | "中" | "弱" | "缺失";
  reasons: string[];
  blockers: string[];
  basis: {
    amount?: number;
    turnoverRate?: number;
    mainNetInflow?: number;
    sectorRank?: number;
    changePct?: number;
  };
}

export interface CompanyProfile {
  code: string;
  name: string;
  listedDate?: string;
  business?: string;
  website?: string;
  industry?: string;
  sector?: string;
}

export interface MainlineAttribution {
  status: "direct_constituent" | "business_direct" | "supply_chain_related" | "theme_indirect" | "mismatch" | "unknown";
  matchedSector?: string;
  membershipSector?: string;
  normalizedMembershipSector?: string;
  businessKeywords: string[];
  sectorKeywords: string[];
  evidence: string[];
  blockers: string[];
  evidenceChain?: {
    constituentEvidence: string[];
    businessEvidence: string[];
    industryChainEvidence: string[];
    negativeEvidence: string[];
    sourceQuality: "direct" | "inferred" | "weak" | "missing";
    reviewRequired: boolean;
    reviewReason?: string;
  };
  confidence: "高" | "中" | "低";
  shouldExclude: boolean;
  reason: string;
}

export interface CandidateReviewRecord {
  code: string;
  name: string;
  source?: string;
  quote?: StockCandidate["quote"];
  price?: number;
  signalScore?: number;
  strengthScore?: number;
  fundFlow?: StockCandidate["fundFlow"];
  activity?: StockCandidate["activity"];
  tradability?: StockCandidate["tradability"];
  klineSummary?: StockCandidate["klineSummary"];
  status: "剔除" | "人工复核";
  reason: string;
  missingEvidence: string[];
  blockers: string[];
  evidence: string[];
  evidenceChain?: MainlineAttribution["evidenceChain"];
  attributionStatus?: MainlineAttribution["status"];
  reviewRequired: boolean;
}

export interface StockCandidate {
  code: string;
  name: string;
  price?: number;
  quote?: {
    latest?: number;
    changePct?: number;
    amount?: number;
    volume?: number;
    turnoverRate?: number;
    volumeRatio?: number;
    peTtm?: number;
    pb?: number;
    psTtm?: number;
    dividendYieldTtm?: number;
    mainNetInflow?: number;
    floatMarketValue?: number;
  };
  sectorName: string;
  role: "龙头" | "中军" | "补涨" | "低吸观察" | "unknown";
  strengthScore?: number;
  signalScore?: number;
  signalTier?: "S" | "A" | "B" | "C" | "D";
  signalLabel?: "核心试错" | "重点观察" | "条件等待" | "风险压制" | "剔除/低质";
  signalReasons?: string[];
  opportunityProfile?: {
    state: "executable" | "pending_activation" | "next_day_auction" | "watch_only" | "blocked";
    label: string;
    score: number;
    primaryReason: string;
    activationConditions: string[];
    blockingReasons: string[];
    nextSteps: string[];
  };
  diagnostics?: Array<{
    label: string;
    score: number;
    max: number;
    status: "强" | "中" | "弱" | "缺失";
    note: string;
  }>;
  scoreBreakdown?: RuleScoreBreakdownItem[];
  trendState: "above_ma20" | "below_ma20" | "reclaim_ma20" | "downtrend" | "unknown";
  fundFlowState: "inflow" | "outflow" | "mixed" | "unknown";
  buyPointType: "回踩均线" | "突破回踩" | "分歧修复" | "无买点" | "unknown";
  buyPointEvaluation?: {
    type: StockCandidate["buyPointType"];
    score: number;
    status: "有效" | "待激活" | "无效" | "缺证据";
    satisfied: string[];
    blockers: string[];
    triggerCondition: string;
    invalidCondition: string;
    sessionNote: string;
  };
  action: "观察" | "小仓试错" | "等待回踩" | "不追" | "回避" | "数据不足";
  positionLimitPct: number;
  invalidCondition: string;
  riskFlags: string[];
  dataCompleteness: DataCompleteness;
  companyKnowledge: CompanyKnowledgeCard;
  mainlineAttribution?: MainlineAttribution;
  klineSummary?: StockKlineSummary;
  technical?: StockTechnicalSnapshot;
  fundFlow?: StockFundFlowSnapshot;
  fundFlowQuality?: StockFundFlowQuality;
  activity?: StockActivitySnapshot;
  tradability?: {
    status: "可买入观察" | "高位拉升" | "接近涨停" | "涨停不可达" | "未知";
    score: number;
    blockers: string[];
    waitFor: string;
    nextSessionPlan?: {
      mode: "次日竞价观察" | "盘中回踩观察" | "无";
      preconditions: string[];
      doNotChase: string[];
      invalidConditions: string[];
    };
  };
  evidenceRefs: string[];
  sourceTraces?: DataSourceTrace[];
}

export interface StockMemoryContext {
  code: string;
  name: string;
  firstSeenAt: string;
  lastSeenAt: string;
  seenCount: number;
  lastReportId: string;
  lastAction: StockCandidate["action"] | "减仓";
  lastPositionLimitPct: number;
  lastSectorName: string;
  lastTrendState: StockCandidate["trendState"];
  lastFundFlowState: StockCandidate["fundFlowState"];
  lastPrice?: number;
  lastInvalidCondition: string;
  lastSummary: string;
  recentSnapshots: Array<{
    reportId: string;
    createdAt: string;
    action: StockCandidate["action"] | "减仓";
    sectorName: string;
    trendState: StockCandidate["trendState"];
    fundFlowState: StockCandidate["fundFlowState"];
    price?: number;
    positionLimitPct: number;
    invalidCondition: string;
    summary: string;
  }>;
}

export interface MarketTimelinePoint {
  reportId: string;
  createdAt: string;
  marketState: MarketRuleResult["marketState"];
  marketRegime: MarketRuleResult["marketRegime"];
  tradeMode: MarketRuleResult["tradeMode"];
  sentimentCycle: MarketRuleResult["sentimentCycle"];
  score: number;
  breadthUpPct?: number;
  breadthMedianChangePct?: number;
  breadthScore?: number;
  breadthSourceQuality?: MarketRuleResult["breadthSourceQuality"];
  breadthReliability?: number;
  topSectors: Array<{
    name: string;
    stage: SectorRuleResult["stage"];
    score: number;
    coreStocks: Array<Pick<SectorCoreStockSnapshot, "code" | "name" | "role" | "score" | "limitStatus">>;
  }>;
}

export interface MainlineMemoryContext {
  name: string;
  normalizedName: string;
  currentStage: SectorRuleResult["stage"];
  previousStage?: SectorRuleResult["stage"];
  stagePath: Array<{
    reportId: string;
    createdAt: string;
    stage: SectorRuleResult["stage"];
    score: number;
  }>;
  trend: "新出现" | "改善" | "持平" | "转弱" | "退潮";
  coreStockChange: {
    retained: string[];
    appeared: string[];
    disappeared: string[];
  };
}

export interface MarketMemoryContext {
  lookbackCount: number;
  shortLookbackCount: number;
  mediumLookbackCount: number;
  generatedAt: string;
  marketTrend: "无历史" | "改善" | "持平" | "转弱";
  breadthTrend: "无历史" | "改善" | "持平" | "转弱";
  breadthDeltaPct?: number;
  timelineQuality: {
    scannedReportCount: number;
    displayableReportCount: number;
    filteredReportCount: number;
    parseErrorCount: number;
    effectivePointCount: number;
    calendarSpanDays?: number;
    reliability: "高" | "中" | "低";
    warning?: string;
  };
  timeline: MarketTimelinePoint[];
  mainlines: MainlineMemoryContext[];
  facts: Fact[];
}

export interface RiskConstraints {
  allowedCodes: string[];
  maxSingleStockPositionPct: number;
  maxThemePositionPct: number;
  minCashPct: number;
}

export interface MarketSessionContext {
  phase:
    | "premarket"
    | "call_auction"
    | "morning"
    | "midday_break"
    | "afternoon"
    | "closing_auction"
    | "postmarket"
    | "night_research"
    | "non_trading_day";
  phaseLabel: "盘前计划" | "集合竞价" | "早盘盯盘" | "午间复盘" | "午后确认" | "尾盘确认" | "收盘复盘" | "夜间研究" | "非交易日研究";
  analysisMode: "计划" | "竞价观察" | "盘中盯盘" | "半日复盘" | "尾盘决策" | "收盘复盘" | "深度研究";
  isTradingDay: boolean;
  isTradingSession: boolean;
  isIntraday: boolean;
  canUseRealtimeQuotes: boolean;
  canUseAuctionQuotes: boolean;
  expectedDataBasis: "上一交易日收盘" | "竞价数据" | "盘中实时/延迟行情" | "上午收盘快照" | "尾盘实时/延迟行情" | "当日收盘数据" | "历史数据";
  dataFreshnessHint: string;
  ruleFocus: string[];
  llmFocus: string[];
  outputRestrictions: string[];
}

export interface DataSourceStatus {
  provider: "腾讯自选股行情数据接口" | "腾讯自选股行情数据接口 + 东方财富公开行情接口" | "腾讯自选股行情数据接口 + 东方财富公开行情接口 + Tushare Pro";
  via: "westock-data-skillhub" | "westock-data-skillhub + eastmoney" | "westock-data-skillhub + eastmoney + tushare";
  packageVersion: string;
  status: DataStatus;
  warnings: string[];
  warningDetails?: DataSourceWarningDetail[];
  traces?: DataSourceTrace[];
}

export interface DataSourceWarningDetail {
  message: string;
  severity: "info" | "warning" | "risk";
  scope: "market" | "sector" | "stock" | "company" | "calendar" | "model" | "system";
  impact: string;
  action: string;
}

export type DataProviderId = "tencent_zixuangu" | "eastmoney_public" | "tushare" | "local_cache" | "rule_engine";

export interface DataSourceTrace {
  id: string;
  scope: "market" | "sector" | "stock" | "company" | "calendar" | "model";
  subjectCode?: string;
  subjectName?: string;
  field: string;
  provider: DataProviderId;
  providerName: string;
  accessPath: string;
  sourceLabel: string;
  sourceUrl?: string;
  command?: string;
  fetchedAt?: string;
  quality: "primary" | "fallback" | "approximate" | "derived" | "missing";
  freshness: "realtime" | "delayed" | "eod" | "historical" | "unknown";
  warning?: string;
}

export interface FactPackage {
  schemaVersion: SchemaVersion;
  timestamp: string;
  session: MarketSessionContext;
  facts: Fact[];
  dataSource: DataSourceStatus;
  market: {
    indices: MarketIndexSnapshot[];
    breadth?: MarketBreadthSnapshot;
    marketState: MarketRuleResult["marketState"];
    ruleScore: number;
    facts: Fact[];
  };
  premarket?: import("@/lib/premarket/types").PremarketSnapshot;
  sectors: SectorRuleResult[];
  candidates: StockCandidate[];
  candidateReviews?: CandidateReviewRecord[];
  stockMemories?: StockMemoryContext[];
  marketContext?: MarketMemoryContext;
  constraints: RiskConstraints;
  ruleResult: {
    status: RuleStatus;
    market: MarketRuleResult;
    sectors: SectorRuleResult[];
    candidates: StockCandidate[];
  };
  disclaimer: string;
}

export interface DeepSeekReport {
  schemaVersion: SchemaVersion;
  summary: string;
  marketJudgement: {
    level: "可交易" | "谨慎交易" | "防守观望";
    evidenceRefs: string[];
    logic: string;
    risk: string;
  };
  mainLines: Array<{
    name: string;
    stage: "观察" | "启动" | "确认" | "加速" | "分歧" | "退潮";
    evidenceRefs: string[];
    logic: string;
  }>;
  stockPlans: Array<{
    code: string;
    name: string;
    action: "观察" | "小仓试错" | "等待回踩" | "不追" | "回避" | "数据不足" | "减仓";
    companySummary: string;
    companySourceNote: "数据源事实" | "规则计算" | "基于主营业务的模型归纳" | "mixed";
    evidenceRefs: string[];
    buyCondition: string;
    sellCondition: string;
    positionSuggestion: string;
    invalidCondition: string;
    doNotBuyCondition: string;
    risk: string;
  }>;
  notifications: Array<{
    level: "info" | "warning" | "risk";
    message: string;
    evidenceRefs: string[];
  }>;
  marketStructureInsight?: {
    breadth: string;
    liquidity: string;
    riskPressure: string;
    evidenceRefs: string[];
  };
  marketStateFlipConditions?: Array<{
    targetState: DeepSeekReport["marketJudgement"]["level"];
    condition: string;
    evidenceRefs: string[];
  }>;
  mainlineCompetition?: Array<{
    lineName: string;
    rank: number;
    competitionLogic: string;
    evidenceRefs: string[];
  }>;
  mainlineStageForecasts?: Array<{
    name: string;
    currentStage: DeepSeekReport["mainLines"][number]["stage"];
    nextStage: DeepSeekReport["mainLines"][number]["stage"];
    triggerCondition: string;
    invalidCondition: string;
    evidenceRefs: string[];
  }>;
  coreStructureHealth?: Array<{
    lineName: string;
    health: string;
    leaderContinuity: string;
    breadthQuality: string;
    risk: string;
    evidenceRefs: string[];
  }>;
  intradayWatchlist?: Array<{
    code: string;
    name: string;
    watchType: string;
    triggerCondition: string;
    invalidCondition: string;
    evidenceRefs: string[];
  }>;
  disclaimer: string;
}

export type ModelAuditCategory = "数据缺口" | "规则疑点" | "报告质量" | "功能建议" | "不建议改动";
export type ModelAuditPriority = "高" | "中" | "低";
export type ModelAuditStatus = "待评估" | "已采纳" | "已拒绝" | "已实现";

export interface ModelAuditFeedbackItem {
  category: ModelAuditCategory;
  title: string;
  issue: string;
  impact: string;
  suggestion: string;
  priority: ModelAuditPriority;
  evidenceRefs: string[];
}

export interface ModelAuditFeedback {
  schemaVersion: SchemaVersion;
  summary: string;
  items: ModelAuditFeedbackItem[];
  doNotChange: Array<{
    reason: string;
    evidenceRefs: string[];
  }>;
  disclaimer: string;
}

export interface StoredModelAuditFeedback {
  id: string;
  reportId: string;
  summary: string;
  feedback: ModelAuditFeedback;
  status: ModelAuditStatus;
  createdAt: string;
  updatedAt: string;
  events: ModelAuditFeedbackEvent[];
}

export interface ModelAuditFeedbackEvent {
  id: string;
  feedbackId: string;
  eventType: "created" | "status_changed";
  fromStatus?: ModelAuditStatus | null;
  toStatus: ModelAuditStatus;
  note: string;
  createdAt: string;
}

export interface AnalysisReport {
  id: string;
  schemaVersion: SchemaVersion;
  reportType: "full" | "market" | "sectors" | "stocks" | "tracking";
  title: string;
  summary: string;
  dataSourceStatus: DataSourceStatus;
  ruleResult: FactPackage["ruleResult"];
  factPackage: FactPackage;
  llmResult: DeepSeekReport | null;
  llmStatus: LlmStatus;
  llmMetrics?: LlmCallMetrics;
  reportStatus: ReportStatus;
  createdAt: string;
}

export interface LlmCallMetrics {
  provider: string;
  model: string;
  reportPromptChars: number;
  repairPromptChars?: number;
  estimatedInputTokens?: number;
  elapsedMs: number;
  repairAttempted: boolean;
  requestCount: number;
  status: LlmStatus;
  errorCount: number;
  errors?: string[];
  skippedRepairReason?: string;
  maxTokens: number;
  temperature: number;
}

export interface AppSettings {
  provider: ModelProvider;
  providerName: string;
  baseUrl: string;
  apiKey?: string;
  apiKeyMasked?: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  enabled: boolean;
  modelAuditEnabled: boolean;
  westockPackageVersion: string;
}

export interface DataProviderSettings {
  id: DataProviderId;
  name: string;
  accessPath: string;
  sourceLabel: string;
  reliabilityNote: string;
  enabled: boolean;
  apiKey?: string;
  apiKeyMasked?: string;
  priority: number;
  status: "active" | "planned" | "disabled";
  capabilities: string[];
}

export interface DataSourceSettings {
  providers: DataProviderSettings[];
  updatedAt: string;
}

export interface SchedulerSettings {
  enabled: boolean;
  intradayScanEnabled: boolean;
  intradayIntervalMinutes: number;
  keypointTimes: string[];
  deepResearchTimes: string[];
  llmOnEvent: boolean;
  pushNotification: boolean;
}

export interface NotificationChannel {
  id: string;
  type: NotificationChannelType;
  name: string;
  webhookUrlMasked?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationDeliveryResult {
  channelId: string;
  channelName: string;
  ok: boolean;
  status?: number;
  error?: string;
}
