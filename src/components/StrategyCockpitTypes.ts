import type { AnalysisReport, LimitPoolStock, MarketBreadthSnapshot } from "@/lib/types";

export type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };
export type ReportSummary = Pick<AnalysisReport, "id" | "reportType" | "title" | "summary" | "llmStatus" | "reportStatus" | "createdAt">;
export type Tone = "up" | "warn" | "risk" | "info" | "muted";

export type MacroSnapshot = {
  fetchedAt: string;
  source: string;
  assets: Array<{
    key: string;
    name: string;
    symbol: string;
    latest: number | null;
    changePct: number | null;
    change: number | null;
    source: string;
    sourceUrl?: string;
    dataType?: "index" | "futures" | "fx" | "commodity";
    note: string;
  }>;
  riskFlags: string[];
  warnings: string[];
};

export type MarketSessionSnapshot = {
  timestamp: string;
  date: string;
  weekday: string;
  isTradingDay: boolean;
  isTradingSession: boolean;
  phase: string;
  phaseLabel: string;
  headline: string;
  subline: string;
  expectedDataBasis: string;
  effectiveTradeDate: string;
  mode: "trade" | "watch" | "review" | "research";
  tasks: string[];
  restrictions: string[];
  canUseRealtimeQuotes: boolean;
  canUseAuctionQuotes: boolean;
};

export type BoardMomentum = {
  rank: number;
  code: string;
  name: string;
  type: "industry" | "concept";
  latest?: number;
  changePct?: number;
  turnoverRate?: number;
  totalMarketValue?: number;
  mainNetInflow?: number;
  upCount?: number;
  downCount?: number;
  leadStock?: string;
  leadStockChangePct?: number;
  breadthPct?: number;
  capitalIntensity?: number;
};

export type MarketCognitionSnapshot = {
  fetchedAt: string;
  elapsedMs: number;
  source: string;
  sourceNote: string;
  tradeDate: string;
  breadth: MarketBreadthSnapshot | null;
  emotion: {
    limitUpCount: number;
    limitDownCount: number;
    openBoardCount: number;
    burstRate: number;
    strongSealCount: number;
    earlyLimitCount: number;
    maxConsecutiveLimit: number;
    limitUpIndustries: Array<{ name: string; count: number }>;
    openBoardIndustries: Array<{ name: string; count: number }>;
    limitUpSamples: LimitPoolStock[];
    openBoardSamples: LimitPoolStock[];
    limitDownSamples: LimitPoolStock[];
  };
  sectorMoney: BoardMomentum[];
  topInflowBoards: BoardMomentum[];
  topChangeBoards: BoardMomentum[];
  warnings: string[];
};

export type CockpitWarning = {
  type: string;
  message: string;
  tone: Tone;
  scope: string;
};

export type SentimentItem = {
  label: string;
  status: string;
  tone: Tone;
  reason: string;
};
