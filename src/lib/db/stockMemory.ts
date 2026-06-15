import crypto from "node:crypto";
import { dbAll, dbGet, dbRun, dbTransaction } from "@/lib/db/client";
import type { DeepSeekReport, StockCandidate, StockMemoryContext } from "@/lib/types";

interface PersistInput {
  reportId: string;
  createdAt: string;
  candidates: StockCandidate[];
  llmResult: DeepSeekReport | null;
}

export function getStockMemories(codes: string[], snapshotLimit = 3): StockMemoryContext[] {
  const uniqueCodes = Array.from(new Set(codes.map((code) => code.toLowerCase())));
  return uniqueCodes
    .map((code) => readMemory(code, snapshotLimit))
    .filter((memory): memory is StockMemoryContext => Boolean(memory));
}

export function getStockMemory(code: string, snapshotLimit = 20): StockMemoryContext | null {
  return readMemory(code.toLowerCase(), snapshotLimit);
}

export function getStockMemoriesAsOf(codes: string[], asOf: string, snapshotLimit = 3): StockMemoryContext[] {
  const uniqueCodes = Array.from(new Set(codes.map((code) => code.toLowerCase())));
  return uniqueCodes
    .map((code) => readMemoryAsOf(code, asOf, snapshotLimit))
    .filter((memory): memory is StockMemoryContext => Boolean(memory));
}

export function persistStockMemories(input: PersistInput) {
  const planByCode = new Map(input.llmResult?.stockPlans.map((plan) => [plan.code.toLowerCase(), plan]) ?? []);

  dbTransaction("stock_memories.persist", () => {
    for (const candidate of input.candidates) {
      const code = candidate.code.toLowerCase();
      const plan = planByCode.get(code);
      const summary = buildSnapshotSummary(candidate, plan);
      const snapshot = {
        id: crypto.randomUUID(),
        code,
        name: candidate.name,
        reportId: input.reportId,
        createdAt: input.createdAt,
        action: plan?.action ?? candidate.action,
        sectorName: candidate.sectorName,
        trendState: candidate.trendState,
        fundFlowState: candidate.fundFlowState,
        price: candidate.price ?? null,
        positionLimitPct: candidate.positionLimitPct,
        invalidCondition: plan?.invalidCondition ?? candidate.invalidCondition,
        summary,
        rawJson: JSON.stringify({
          candidate: {
            code: candidate.code,
            name: candidate.name,
            action: candidate.action,
            sectorName: candidate.sectorName,
            trendState: candidate.trendState,
            fundFlowState: candidate.fundFlowState,
            price: candidate.price,
            positionLimitPct: candidate.positionLimitPct,
            invalidCondition: candidate.invalidCondition,
            riskFlags: candidate.riskFlags,
            dataCompleteness: candidate.dataCompleteness
          },
          plan: plan ?? null
        })
      };

      dbRun(
        `insert into stock_memory_snapshots
         (id, code, name, reportId, createdAt, action, sectorName, trendState, fundFlowState, price, positionLimitPct, invalidCondition, summary, rawJson)
         values (@id, @code, @name, @reportId, @createdAt, @action, @sectorName, @trendState, @fundFlowState, @price, @positionLimitPct, @invalidCondition, @summary, @rawJson)`,
        snapshot,
        { label: "stock_memory_snapshots.insert" }
      );

      dbRun(
        `insert into stock_memories
         (code, name, firstSeenAt, lastSeenAt, seenCount, lastReportId, lastAction, lastPositionLimitPct, lastSectorName, lastTrendState, lastFundFlowState, lastPrice, lastInvalidCondition, lastSummary)
         values (@code, @name, @createdAt, @createdAt, 1, @reportId, @action, @positionLimitPct, @sectorName, @trendState, @fundFlowState, @price, @invalidCondition, @summary)
         on conflict(code) do update set
           name = excluded.name,
           lastSeenAt = excluded.lastSeenAt,
           seenCount = stock_memories.seenCount + 1,
           lastReportId = excluded.lastReportId,
           lastAction = excluded.lastAction,
           lastPositionLimitPct = excluded.lastPositionLimitPct,
           lastSectorName = excluded.lastSectorName,
           lastTrendState = excluded.lastTrendState,
           lastFundFlowState = excluded.lastFundFlowState,
           lastPrice = excluded.lastPrice,
           lastInvalidCondition = excluded.lastInvalidCondition,
           lastSummary = excluded.lastSummary`,
        snapshot,
        { label: "stock_memories.upsert" }
      );
    }
  }, 500);
}

function readMemory(code: string, snapshotLimit: number): StockMemoryContext | null {
  const memory = dbGet<Omit<StockMemoryContext, "recentSnapshots">>(
    "select * from stock_memories where code = ?",
    [code],
    { label: "stock_memories.get" }
  );
  if (!memory) return null;

  const recentSnapshots = dbAll<StockMemoryContext["recentSnapshots"][number]>(
    `select reportId, createdAt, action, sectorName, trendState, fundFlowState, price, positionLimitPct, invalidCondition, summary
       from stock_memory_snapshots
       where code = ?
       order by createdAt desc
       limit ?`,
    [code, snapshotLimit],
    { label: "stock_memory_snapshots.recent_by_code" }
  );

  return { ...memory, recentSnapshots };
}

function readMemoryAsOf(code: string, asOf: string, snapshotLimit: number): StockMemoryContext | null {
  const recentSnapshots = dbAll<StockMemoryContext["recentSnapshots"][number]>(
    `select reportId, createdAt, action, sectorName, trendState, fundFlowState, price, positionLimitPct, invalidCondition, summary
       from stock_memory_snapshots
       where code = ? and createdAt <= ?
       order by createdAt desc
       limit ?`,
    [code, asOf, snapshotLimit],
    { label: "stock_memory_snapshots.as_of_by_code" }
  );
  const last = recentSnapshots[0];
  if (!last) return null;

  const aggregate = dbGet<{ firstSeenAt: string; seenCount: number }>(
    `select min(createdAt) as firstSeenAt, count(*) as seenCount
       from stock_memory_snapshots
       where code = ? and createdAt <= ?`,
    [code, asOf],
    { label: "stock_memory_snapshots.as_of_aggregate" }
  );

  const row = dbGet<{ name: string }>(
    "select name from stock_memory_snapshots where code = ? and createdAt <= ? order by createdAt desc limit 1",
    [code, asOf],
    { label: "stock_memory_snapshots.as_of_name" }
  );

  return {
    code,
    name: row?.name ?? code,
    firstSeenAt: aggregate?.firstSeenAt ?? last.createdAt,
    lastSeenAt: last.createdAt,
    seenCount: aggregate?.seenCount ?? recentSnapshots.length,
    lastReportId: last.reportId,
    lastAction: last.action,
    lastPositionLimitPct: last.positionLimitPct,
    lastSectorName: last.sectorName,
    lastTrendState: last.trendState,
    lastFundFlowState: last.fundFlowState,
    lastPrice: last.price,
    lastInvalidCondition: last.invalidCondition,
    lastSummary: last.summary,
    recentSnapshots
  };
}

function buildSnapshotSummary(candidate: StockCandidate, plan: DeepSeekReport["stockPlans"][number] | undefined) {
  if (plan) {
    return `${plan.action}：${plan.buyCondition}；失效条件：${plan.invalidCondition}`;
  }
  return `${candidate.action}：趋势 ${candidate.trendState}，资金 ${candidate.fundFlowState}，失效条件：${candidate.invalidCondition}`;
}
