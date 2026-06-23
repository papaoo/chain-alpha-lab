export type SelectionStrategyId =
  | "main_force_accumulation"
  | "short_term_breakout"
  | "value_stable"
  | "growth_potential"
  | "sector_rotation"
  | "low_risk_return";

export type SelectionRiskLevel = "low" | "medium" | "medium_high";
export type SelectionCycle = "short" | "mid" | "long";

export interface SelectionParameterField {
  key: string;
  label: string;
  type: "number" | "select" | "boolean" | "range";
  defaultValue: number | string | boolean | [number | null, number | null] | null;
  unit?: string;
  min?: number;
  max?: number;
  options?: Array<{ label: string; value: string | number | boolean }>;
  description: string;
}

export interface SelectionStrategyDefinition {
  id: SelectionStrategyId;
  order: number;
  name: string;
  subtitle: string;
  description: string;
  defaultTimeRange: "15d" | "30d" | "3m" | "6m" | "1y";
  recommendedPickCount: number;
  candidatePoolLimit: number;
  riskLevel: SelectionRiskLevel;
  cycle: SelectionCycle;
  enabledInMvp: boolean;
  hardFilters: string[];
  scoreFactors: Array<{ key: string; label: string; weight: number; description: string }>;
  requiredData: string[];
  outputFocus: string[];
  parameters: SelectionParameterField[];
}

export type SelectionRunMode = "rule" | "agent";
export type SelectionRunStatus = "running" | "success" | "failed";

export interface SelectionRunRequest {
  strategyId: SelectionStrategyId;
  mode?: SelectionRunMode;
  parameters?: Record<string, unknown>;
}

export interface SelectionPickScoreFactor {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  reasons: string[];
  blockers: string[];
}

export interface SelectionPick {
  code: string;
  name: string;
  sectorName: string;
  price?: number;
  changePct?: number;
  runtimeSnapshot?: {
    latestPrice?: number;
    changePct?: number;
    amount?: number;
    turnoverRate?: number;
    mainNetInflow?: number;
    trendState?: string;
    fundFlowState?: string;
    source: string;
    fetchedAt?: string;
    quoteUpdatedAt?: string;
    latestKlineDate?: string;
    expectedKlineDate?: string;
    klineFreshnessStatus?: "current" | "stale" | "unknown";
    klineClose?: number;
    basis: "runtime_refresh" | "report_snapshot" | "mixed";
    quality?: "complete" | "partial" | "quote_only" | "missing";
    qualityLabel?: string;
    actionability?: {
      level: "actionable" | "reference_only" | "not_actionable";
      label: string;
      reason: string;
      ageMinutes?: number;
      staleAfterMinutes: number;
      sessionPhase?: string;
    };
    coverage?: {
      quote: boolean;
      kline: boolean;
      technical: boolean;
      fundFlow: boolean;
      company: boolean;
    };
    warnings: string[];
  };
  dataFreshness?: {
    basis: "runtime_refresh" | "report_snapshot" | "mixed";
    label: string;
    refreshedAt?: string;
    quote: "fresh" | "snapshot" | "missing";
    kline: "fresh" | "snapshot" | "missing";
    technical: "fresh" | "snapshot" | "missing";
    fundFlow: "fresh" | "snapshot" | "missing";
    company: "fresh" | "snapshot" | "missing";
    warnings: string[];
  };
  score: number;
  tier: "S" | "A" | "B" | "C" | "D";
  action: "重点观察" | "跟踪观察" | "条件等待" | "剔除";
  reasons: string[];
  blockers: string[];
  evidenceRefs: string[];
  scoreFactors: SelectionPickScoreFactor[];
  serenityTag?: {
    theme: string;
    runId: string;
    createdAt: string;
    priority: "top" | "high" | "watch" | "low";
    score: number;
    evidenceStrength: "strong" | "medium" | "weak" | "needs_checking";
    chainPosition: string;
    constrains: string;
    verdict: string;
    missingProof: string[];
    evidenceCoverage?: {
      sourceCount: number;
      strongCount: number;
      mediumCount: number;
      weakCount: number;
      needsCheckingCount: number;
      hardEvidenceCount: number;
      sourceLabels: string[];
      latestFetchedAt?: string;
    };
    researchBoundary?: {
      level: "evidence_backed" | "candidate_watch" | "needs_hard_evidence" | "research_only";
      label: string;
      text: string;
    };
    nextResearchChecks?: string[];
  };
}

export type SelectionAgentId =
  | "fund_flow"
  | "sector"
  | "fundamental"
  | "technical"
  | "risk"
  | "chief_reviewer";

export type SelectionAgentStatus = "success" | "disabled" | "skipped" | "rejected" | "failed";

export interface SelectionAgentStockOpinion {
  code: string;
  name: string;
  recommendation: "support" | "neutral" | "reject";
  confidence: "high" | "medium" | "low";
  logic: string;
  riskFlags: string[];
  evidenceRefs: string[];
}

export interface SelectionAgentReport {
  agentId: SelectionAgentId;
  agentName: string;
  status: SelectionAgentStatus;
  summary: string;
  topPicks: string[];
  avoidStocks: string[];
  missingData: string[];
  stockOpinions: SelectionAgentStockOpinion[];
  evidenceRefs: string[];
  raw?: unknown;
}

export interface SelectionFinalReview {
  status: SelectionAgentStatus;
  summary: string;
  strategySuitability: string;
  finalPicks: Array<{
    code: string;
    name: string;
    tier: SelectionPick["tier"];
    recommendation: "priority" | "watch" | "wait" | "avoid";
    confidence: "high" | "medium" | "low";
    logic: string;
    risk: string;
    suggestedPositionPct: number;
    watchConditions: string[];
    invalidConditions: string[];
    evidenceRefs: string[];
  }>;
  portfolioRisk: string;
  noTradeConditions: string[];
  evidenceRefs: string[];
}

export interface SelectionLlmMetrics {
  provider: string;
  model: string;
  promptChars: number;
  responseChars?: number;
  estimatedInputTokens: number;
  estimatedOutputTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  elapsedMs: number;
  status: SelectionAgentStatus;
  errorCount: number;
  errors?: string[];
  maxTokens: number;
  temperature: number;
  retryCount?: number;
  skipReason?: string;
}

export interface SelectionRunResult {
  strategyId: SelectionStrategyId;
  strategyName: string;
  mode: SelectionRunMode;
  ruleVersion?: string;
  ruleVersionLabel?: string;
  sourceReportId?: string;
  sourceReportCreatedAt?: string;
  sourceReportTradeDate?: string;
  runEffectiveTradeDate?: string;
  freshnessStatus?: "current" | "stale" | "unknown";
  parameters: Record<string, unknown>;
  picks: SelectionPick[];
  rejected: SelectionPick[];
  warnings: string[];
  dataBasis: string;
  agentReports?: SelectionAgentReport[];
  finalReview?: SelectionFinalReview;
  llmStatus?: SelectionAgentStatus;
  llmErrors?: string[];
  llmMetrics?: SelectionLlmMetrics;
}

export interface SelectionRunRecord extends SelectionRunResult {
  id: string;
  status: SelectionRunStatus;
  startedAt: string;
  finishedAt?: string;
  candidateCount: number;
  pickCount: number;
  errorMessage?: string;
}

export interface SelectionRunSummary {
  id: string;
  strategyId: SelectionStrategyId;
  strategyName: string;
  mode: SelectionRunMode;
  status: SelectionRunStatus;
  startedAt: string;
  finishedAt?: string;
  ruleVersion?: string;
  ruleVersionLabel?: string;
  sourceReportId?: string;
  sourceReportCreatedAt?: string;
  sourceReportTradeDate?: string;
  runEffectiveTradeDate?: string;
  freshnessStatus?: "current" | "stale" | "unknown";
  candidateCount: number;
  pickCount: number;
  rejectedCount: number;
  warningCount: number;
  warnings: string[];
  warningPreview?: string[];
  warningSummary?: import("@/lib/selection/warning-severity").SelectionWarningSummary;
  topPickPreview: Array<
    Pick<SelectionPick, "code" | "name" | "score" | "tier" | "action"> &
      Partial<Pick<SelectionPick, "sectorName" | "price" | "changePct" | "runtimeSnapshot" | "dataFreshness">>
  >;
  errorMessage?: string;
}
