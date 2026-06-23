export type PremarketRiskLevel = "friendly" | "neutral" | "watch" | "risk" | "risk_off";

export interface PremarketMarketItem {
  code: string;
  name: string;
  latest: number | null;
  changePct: number | null;
  change: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  prevClose: number | null;
  source: "eastmoney_global";
  sourceUrl: string;
  updatedAt?: string;
  dataType?: "index" | "futures" | "fx" | "commodity";
  group: "us" | "asia" | "hk_cn" | "fx" | "other";
}

export interface PremarketCalendarEvent {
  date: string;
  time: string;
  country: string;
  weight: number;
  content: string;
  previous?: string;
  forecast?: string;
  actual?: string;
  source: "westock_calendar";
  timing?: "released" | "pending" | "upcoming" | "past";
  relevance?: "high" | "medium" | "low";
  relevanceReason?: string;
  decisionHint?: string;
}

export interface PremarketCatalystEvent {
  id: string;
  date: string;
  title: string;
  source: "sec_company_filings";
  sourceUrl: string;
  entity: string;
  market: "US" | "CN" | "HK" | "GLOBAL";
  weight: number;
  category: "IPO" | "REGULATORY" | "INDUSTRY" | "POLICY" | "EARNINGS" | "OTHER";
  relevance: string;
  status: "confirmed" | "watch";
}

export interface PremarketScoreBucket {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  state: "good" | "neutral" | "watch" | "risk" | "missing";
  note: string;
  evidence: string[];
}

export interface PremarketSourceTrace {
  key: string;
  label: string;
  status: "ok" | "partial" | "failed" | "unavailable";
  usage: "score_input" | "watch_only" | "excluded";
  usageLabel: string;
  source: string;
  sourceUrl?: string;
  command?: string;
  fetchedAt: string;
  dataUpdatedAt?: string;
  freshnessMinutes?: number;
  staleAfterMinutes?: number;
  critical?: boolean;
  impact?: string;
  records: number;
  warnings: string[];
}

export interface PremarketDataQuality {
  status: "ok" | "partial" | "degraded" | "failed";
  label: string;
  message: string;
  criticalOk: number;
  criticalTotal: number;
  staleSources: string[];
  okSources: string[];
  partialSources: string[];
  failedSources: string[];
  unavailableSources: string[];
}

export interface PremarketActionability {
  level: "plan_ready" | "degraded_reference" | "not_actionable";
  label: string;
  guidance: string;
  allowedUses: string[];
  blockedUses: string[];
  missingImpact: string[];
}

export interface PremarketTemperatureReliability {
  level: "high" | "medium" | "low" | "invalid";
  label: string;
  confidencePct: number;
  scoreInputOk: number;
  scoreInputTotal: number;
  fallbackBucketCount: number;
  staleScoreInputCount: number;
  failedScoreInputCount: number;
  message: string;
}

export interface PremarketSessionTrace {
  phase: string;
  phaseLabel: string;
  analysisMode: string;
  isTradingDay: boolean;
  isTradingSession: boolean;
  canUseRealtimeQuotes: boolean;
  canUseAuctionQuotes: boolean;
  expectedDataBasis: string;
  effectiveTradeDate: string;
  dataFreshnessHint: string;
  checkedAt: string;
}

export interface PremarketCatalystWatchConfig {
  enabled: boolean;
  keywords: string[];
  note: string;
}

export interface PremarketSnapshot {
  fetchedAt: string;
  dataBasis: string;
  session: PremarketSessionTrace;
  temperature: number;
  riskLevel: PremarketRiskLevel;
  emotionLabel: string;
  summary: string;
  markets: PremarketMarketItem[];
  calendarEvents: PremarketCalendarEvent[];
  calendarSummary: {
    total: number;
    today: number;
    tomorrow: number;
    pending: number;
    released: number;
    highRelevance: number;
    mediumRelevance: number;
    backgroundOnly: number;
  };
  catalystEvents: PremarketCatalystEvent[];
  catalystWatchConfig: PremarketCatalystWatchConfig;
  buckets: PremarketScoreBucket[];
  riskFlags: string[];
  watchItems: string[];
  sourceTraces: PremarketSourceTrace[];
  dataQuality: PremarketDataQuality;
  actionability: PremarketActionability;
  temperatureReliability: PremarketTemperatureReliability;
  warnings: string[];
}
