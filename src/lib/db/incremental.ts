import crypto from "node:crypto";
import { dbAll, dbGet, dbRun, dbTransaction } from "@/lib/db/client";
import type { AnalysisReport, SectorRuleResult, StockCandidate } from "@/lib/types";

export interface PersistedRuleEvent {
  id: string;
  reportId: string;
  createdAt: string;
  eventType: "market_state_change" | "sector_stage_change" | "stock_action_change" | "stock_buy_point_change";
  subjectType: "market" | "sector" | "stock";
  subjectKey: string;
  subjectName: string;
  severity: "info" | "warning" | "risk";
  fromValue?: string | null;
  toValue: string;
  message: string;
  evidence: string[];
}

type ReportWithId = Omit<AnalysisReport, "id"> & { id: string };

export function persistIncrementalAnalysis(report: ReportWithId): PersistedRuleEvent[] {
  const events = buildRuleEvents(report);
  dbTransaction("incremental.persist_analysis", () => {
    insertMarketSnapshot(report);
    report.factPackage.sectors.slice(0, 20).forEach((sector, index) => insertSectorSnapshot(report, sector, index));
    report.factPackage.candidates.slice(0, 80).forEach((candidate) => insertStockSignalSnapshot(report, candidate));
    events.forEach(insertRuleEvent);
  }, 500);
  return events;
}

export function listRecentRuleEvents(limit = 50): PersistedRuleEvent[] {
  const rows = dbAll<Omit<PersistedRuleEvent, "evidence"> & { evidenceJson: string }>(
    `select id, reportId, createdAt, eventType, subjectType, subjectKey, subjectName, severity, fromValue, toValue, message, evidenceJson
       from rule_events
       order by createdAt desc
       limit ?`,
    [limit],
    { label: "rule_events.list_recent" }
  );
  return rows.map((row) => ({
    ...row,
    evidence: safeJson<string[]>(row.evidenceJson, [])
  }));
}

export function listRecentSchedulerRuns(limit = 50) {
  return dbAll<Record<string, unknown>>(
    `select id, jobType, startedAt, finishedAt, status, useLLM, pushNotification, reportId, eventCount, message, rawJson
       from scheduler_runs
       order by startedAt desc
       limit ?`,
    [limit],
    { label: "scheduler_runs.list_recent" }
  ).map((row) => {
      const item = row as Record<string, unknown>;
      return {
        ...item,
        useLLM: Boolean(item.useLLM),
        pushNotification: Boolean(item.pushNotification),
        raw: typeof item.rawJson === "string" ? safeJson(item.rawJson, null) : null
      };
    });
}

export function createSchedulerRun(input: {
  jobType: string;
  startedAt: string;
  status: "running" | "success" | "failed";
  useLLM: boolean;
  pushNotification: boolean;
  message: string;
}) {
  const id = crypto.randomUUID();
  dbRun(
    `insert into scheduler_runs
       (id, jobType, startedAt, status, useLLM, pushNotification, message)
       values (@id, @jobType, @startedAt, @status, @useLLM, @pushNotification, @message)`,
    {
      ...input,
      id,
      useLLM: input.useLLM ? 1 : 0,
      pushNotification: input.pushNotification ? 1 : 0
    },
    { label: "scheduler_runs.create" }
  );
  return id;
}

export function finishSchedulerRun(id: string, input: {
  status: "success" | "failed";
  finishedAt: string;
  reportId?: string | null;
  eventCount?: number;
  message: string;
  rawJson?: unknown;
}) {
  dbRun(
    `update scheduler_runs
       set status = @status,
           finishedAt = @finishedAt,
           reportId = @reportId,
           eventCount = @eventCount,
           message = @message,
           rawJson = @rawJson
       where id = @id`,
    {
      id,
      status: input.status,
      finishedAt: input.finishedAt,
      reportId: input.reportId ?? null,
      eventCount: input.eventCount ?? 0,
      message: input.message,
      rawJson: input.rawJson ? JSON.stringify(input.rawJson) : null
    },
    { label: "scheduler_runs.finish" }
  );
}

function insertMarketSnapshot(report: ReportWithId) {
  const market = report.factPackage.ruleResult.market;
  const breadth = report.factPackage.market.breadth;
  dbRun(
    `insert into market_snapshots
       (id, reportId, createdAt, sessionPhase, marketState, marketRegime, tradeMode, sentimentCycle, score, breadthUpPct, breadthMedianChangePct, breadthScore, llmStatus, rawJson)
       values (@id, @reportId, @createdAt, @sessionPhase, @marketState, @marketRegime, @tradeMode, @sentimentCycle, @score, @breadthUpPct, @breadthMedianChangePct, @breadthScore, @llmStatus, @rawJson)`,
    {
      id: crypto.randomUUID(),
      reportId: report.id,
      createdAt: report.createdAt,
      sessionPhase: report.factPackage.session.phase,
      marketState: market.marketState,
      marketRegime: market.marketRegime ?? null,
      tradeMode: market.tradeMode ?? null,
      sentimentCycle: market.sentimentCycle ?? null,
      score: market.score,
      breadthUpPct: breadth?.upPct ?? null,
      breadthMedianChangePct: breadth?.medianChangePct ?? null,
      breadthScore: market.breadthScore ?? null,
      llmStatus: report.llmStatus,
      rawJson: JSON.stringify({
        market,
        breadth,
        constraints: report.factPackage.constraints
      })
    },
    { label: "market_snapshots.insert" }
  );
}

function insertSectorSnapshot(report: ReportWithId, sector: SectorRuleResult, index: number) {
  const fundScore = sector.diagnostics.find((item) => item.label.includes("资金"))?.score;
  const breadthScore = sector.diagnostics.find((item) => item.label.includes("扩散") || item.label.includes("成分"))?.score;
  const coreScore = sector.diagnostics.find((item) => item.label.includes("核心") || item.label.includes("涨停"))?.score;
  dbRun(
    `insert into sector_snapshots
       (id, reportId, createdAt, name, normalizedName, stage, score, rank, fundScore, breadthScore, coreScore, rawJson)
       values (@id, @reportId, @createdAt, @name, @normalizedName, @stage, @score, @rank, @fundScore, @breadthScore, @coreScore, @rawJson)`,
    {
      id: crypto.randomUUID(),
      reportId: report.id,
      createdAt: report.createdAt,
      name: sector.name,
      normalizedName: normalizeSubjectName(sector.name),
      stage: sector.stage,
      score: sector.score,
      rank: index + 1,
      fundScore: fundScore ?? null,
      breadthScore: breadthScore ?? null,
      coreScore: coreScore ?? null,
      rawJson: JSON.stringify(sector)
    },
    { label: "sector_snapshots.insert" }
  );
}

function insertStockSignalSnapshot(report: ReportWithId, candidate: StockCandidate) {
  dbRun(
    `insert into stock_signal_snapshots
       (id, reportId, createdAt, code, name, sectorName, action, trendState, fundFlowState, buyPointStatus, buyPointType, score, price, positionLimitPct, dataCompletenessLevel, rawJson)
       values (@id, @reportId, @createdAt, @code, @name, @sectorName, @action, @trendState, @fundFlowState, @buyPointStatus, @buyPointType, @score, @price, @positionLimitPct, @dataCompletenessLevel, @rawJson)`,
    {
      id: crypto.randomUUID(),
      reportId: report.id,
      createdAt: report.createdAt,
      code: candidate.code.toLowerCase(),
      name: candidate.name,
      sectorName: candidate.sectorName,
      action: candidate.action,
      trendState: candidate.trendState,
      fundFlowState: candidate.fundFlowState,
      buyPointStatus: candidate.buyPointEvaluation?.status ?? null,
      buyPointType: candidate.buyPointEvaluation?.type ?? candidate.buyPointType,
      score: candidate.signalScore ?? candidate.strengthScore ?? 0,
      price: candidate.price ?? null,
      positionLimitPct: candidate.positionLimitPct,
      dataCompletenessLevel: candidate.dataCompleteness.level,
      rawJson: JSON.stringify(candidate)
    },
    { label: "stock_signal_snapshots.insert" }
  );
}

function insertRuleEvent(event: PersistedRuleEvent) {
  dbRun(
    `insert into rule_events
       (id, reportId, createdAt, eventType, subjectType, subjectKey, subjectName, severity, fromValue, toValue, message, evidenceJson, rawJson)
       values (@id, @reportId, @createdAt, @eventType, @subjectType, @subjectKey, @subjectName, @severity, @fromValue, @toValue, @message, @evidenceJson, @rawJson)`,
    {
      ...event,
      evidenceJson: JSON.stringify(event.evidence),
      rawJson: JSON.stringify(event)
    },
    { label: "rule_events.insert" }
  );
}

function buildRuleEvents(report: ReportWithId): PersistedRuleEvent[] {
  return [
    ...buildMarketEvents(report),
    ...report.factPackage.sectors.slice(0, 8).flatMap((sector) => buildSectorEvents(report, sector)),
    ...report.factPackage.candidates.slice(0, 40).flatMap((candidate) => buildStockEvents(report, candidate))
  ];
}

function buildMarketEvents(report: ReportWithId): PersistedRuleEvent[] {
  const previous = getPreviousDisplayableMarketState(report.createdAt);
  const current = report.factPackage.ruleResult.market.marketState;
  if (!previous || previous.marketState === current) return [];
  return [{
    id: crypto.randomUUID(),
    reportId: report.id,
    createdAt: report.createdAt,
    eventType: "market_state_change",
    subjectType: "market",
    subjectKey: "A_SHARE",
    subjectName: "A股大盘",
    severity: marketSeverity(previous.marketState, current),
    fromValue: previous.marketState,
    toValue: current,
    message: `大盘状态从${stateLabel(previous.marketState)}变为${stateLabel(current)}。`,
    evidence: report.factPackage.market.facts.map((fact) => fact.factId).slice(0, 8)
  }];
}

function getPreviousDisplayableMarketState(before: string) {
  return dbGet<{ marketState: AnalysisReport["factPackage"]["ruleResult"]["market"]["marketState"] }>(
    `select marketState
       from market_snapshots
       where createdAt < ?
       order by createdAt desc
       limit 1`,
    [before],
    { label: "market_snapshots.previous_market_state" }
  );
}

function buildSectorEvents(report: ReportWithId, sector: SectorRuleResult): PersistedRuleEvent[] {
  const normalizedName = normalizeSubjectName(sector.name);
  const previous = dbGet<{ stage: string }>(
    "select stage from sector_snapshots where normalizedName = ? order by createdAt desc limit 1",
    [normalizedName],
    { label: "sector_snapshots.previous_stage" }
  );
  if (!previous || previous.stage === sector.stage) return [];
  return [{
    id: crypto.randomUUID(),
    reportId: report.id,
    createdAt: report.createdAt,
    eventType: "sector_stage_change",
    subjectType: "sector",
    subjectKey: normalizedName,
    subjectName: sector.name,
    severity: sectorSeverity(previous.stage, sector.stage),
    fromValue: previous.stage,
    toValue: sector.stage,
    message: `${sector.name}主线阶段从${previous.stage}变为${sector.stage}。`,
    evidence: sector.facts.map((fact) => fact.factId).slice(0, 8)
  }];
}

function buildStockEvents(report: ReportWithId, candidate: StockCandidate): PersistedRuleEvent[] {
  const previous = dbGet<{ action: string; buyPointStatus: string | null }>(
    "select action, buyPointStatus from stock_signal_snapshots where code = ? order by createdAt desc limit 1",
    [candidate.code.toLowerCase()],
    { label: "stock_signal_snapshots.previous_signal" }
  );
  if (!previous) return [];

  const events: PersistedRuleEvent[] = [];
  if (previous.action !== candidate.action) {
    events.push({
      id: crypto.randomUUID(),
      reportId: report.id,
      createdAt: report.createdAt,
      eventType: "stock_action_change",
      subjectType: "stock",
      subjectKey: candidate.code.toLowerCase(),
      subjectName: candidate.name,
      severity: stockActionSeverity(previous.action, candidate.action),
      fromValue: previous.action,
      toValue: candidate.action,
      message: `${candidate.name}动作从${previous.action}变为${candidate.action}。`,
      evidence: candidate.evidenceRefs.slice(0, 8)
    });
  }
  const currentBuyPoint = candidate.buyPointEvaluation?.status ?? "";
  if (previous.buyPointStatus && currentBuyPoint && previous.buyPointStatus !== currentBuyPoint) {
    events.push({
      id: crypto.randomUUID(),
      reportId: report.id,
      createdAt: report.createdAt,
      eventType: "stock_buy_point_change",
      subjectType: "stock",
      subjectKey: candidate.code.toLowerCase(),
      subjectName: candidate.name,
      severity: currentBuyPoint === "有效" ? "warning" : currentBuyPoint === "无效" ? "risk" : "info",
      fromValue: previous.buyPointStatus,
      toValue: currentBuyPoint,
      message: `${candidate.name}买点状态从${previous.buyPointStatus}变为${currentBuyPoint}。`,
      evidence: candidate.evidenceRefs.slice(0, 8)
    });
  }
  return events;
}

function normalizeSubjectName(value: string) {
  return value.replace(/[ⅠⅡⅢIVX0-9（）()概念行业板块\s]/g, "").toLowerCase();
}

function stateLabel(value: string) {
  if (value === "tradable") return "可交易";
  if (value === "cautious") return "谨慎交易";
  if (value === "defensive") return "防守观望";
  return value;
}

function marketSeverity(previous: string, current: string): PersistedRuleEvent["severity"] {
  const delta = marketRank(current) - marketRank(previous);
  if (delta > 0) return "warning";
  if (delta < 0) return "risk";
  return "info";
}

function marketRank(value: string) {
  if (value === "tradable") return 2;
  if (value === "cautious") return 1;
  return 0;
}

function sectorSeverity(previous: string, current: string): PersistedRuleEvent["severity"] {
  const delta = sectorRank(current) - sectorRank(previous);
  if (current === "退潮") return "risk";
  if (current === "分歧") return "warning";
  if (delta > 0) return "warning";
  if (delta < 0) return "risk";
  return "info";
}

function sectorRank(value: string) {
  const rank: Record<string, number> = { 观察: 0, 启动: 1, 确认: 2, 加速: 3, 分歧: 1, 退潮: -1 };
  return rank[value] ?? 0;
}

function stockActionSeverity(previous: string, current: string): PersistedRuleEvent["severity"] {
  if (/卖出|减仓|回避|不追/.test(current)) return "risk";
  if (/小仓|持有|加仓/.test(current)) return "warning";
  if (/卖出|减仓|回避/.test(previous) && /观察/.test(current)) return "info";
  return "info";
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
