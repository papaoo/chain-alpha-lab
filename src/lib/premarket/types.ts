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
  source: string;
  sourceUrl?: string;
  command?: string;
  fetchedAt: string;
  records: number;
  warnings: string[];
}

export interface PremarketCatalystWatchConfig {
  enabled: boolean;
  keywords: string[];
  note: string;
}

export interface PremarketSnapshot {
  fetchedAt: string;
  dataBasis: string;
  temperature: number;
  riskLevel: PremarketRiskLevel;
  emotionLabel: string;
  summary: string;
  markets: PremarketMarketItem[];
  calendarEvents: PremarketCalendarEvent[];
  catalystEvents: PremarketCatalystEvent[];
  catalystWatchConfig: PremarketCatalystWatchConfig;
  buckets: PremarketScoreBucket[];
  riskFlags: string[];
  watchItems: string[];
  sourceTraces: PremarketSourceTrace[];
  warnings: string[];
}
