"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type React from "react";
import type { AnalysisReport, StockCandidate } from "@/lib/types";
import type { StockRealtimeSnapshot } from "@/lib/market/stockSnapshot";
import type { MarketSessionSnapshot } from "@/components/StrategyCockpitTypes";

const TRADING_HOVER_SNAPSHOT_REFRESH_MS = 60_000;
const WATCH_HOVER_SNAPSHOT_REFRESH_MS = 5 * 60_000;
const RESEARCH_HOVER_SNAPSHOT_REFRESH_MS = 30 * 60_000;

export type CoreStockSnapshot = NonNullable<AnalysisReport["factPackage"]["sectors"][number]["coreStocks"]>[number];
export type StockHoverRegistry = {
  reportId?: string;
  reportCreatedAt?: string;
  reportTitle?: string;
  realtimeSnapshots: Record<string, StockRealtimeSnapshot>;
  refreshState: {
    status: "idle" | "loading" | "success" | "failed";
    refreshedAt?: string;
    error?: string;
    codeCount: number;
  };
  candidatesByCode: Map<string, StockCandidate>;
  candidatesByName: Map<string, StockCandidate>;
  coreStocksByCode: Map<string, CoreStockSnapshot>;
  coreStocksByName: Map<string, CoreStockSnapshot>;
};

const StockHoverContext = createContext<StockHoverRegistry>({
  reportId: undefined,
  reportCreatedAt: undefined,
  reportTitle: undefined,
  realtimeSnapshots: {},
  refreshState: { status: "idle", codeCount: 0 },
  candidatesByCode: new Map(),
  candidatesByName: new Map(),
  coreStocksByCode: new Map(),
  coreStocksByName: new Map()
});

export function StockHoverProvider({ report, children }: { report: AnalysisReport | null; children: React.ReactNode }) {
  const codes = useMemo(() => collectStockCodes(report), [report]);
  const codeKey = codes.join(",");
  const [realtimeSnapshots, setRealtimeSnapshots] = useState<Record<string, StockRealtimeSnapshot>>({});
  const [refreshError, setRefreshError] = useState("");
  const [refreshState, setRefreshState] = useState<StockHoverRegistry["refreshState"]>({ status: "idle", codeCount: 0 });
  const [session, setSession] = useState<MarketSessionSnapshot | null>(null);
  const refreshIntervalMs = session?.isTradingSession
    ? TRADING_HOVER_SNAPSHOT_REFRESH_MS
    : session?.isTradingDay
      ? WATCH_HOVER_SNAPSHOT_REFRESH_MS
      : RESEARCH_HOVER_SNAPSHOT_REFRESH_MS;

  useEffect(() => {
    let cancelled = false;
    const refreshSession = () => {
      fetch("/api/market-session", { cache: "no-store" })
        .then(async (response) => {
          const json = (await response.json()) as { success?: boolean; data?: MarketSessionSnapshot | null };
          if (!response.ok || !json.success || !json.data) throw new Error("market-session failed");
          if (!cancelled) setSession(json.data);
        })
        .catch(() => {
          if (!cancelled) setSession(null);
        });
    };
    refreshSession();
    const timer = window.setInterval(refreshSession, WATCH_HOVER_SNAPSHOT_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!codeKey) {
      setRealtimeSnapshots({});
      setRefreshError("");
      setRefreshState({ status: "idle", codeCount: 0 });
      return;
    }
    let cancelled = false;
    let activeController: AbortController | null = null;

    const refresh = () => {
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      setRefreshState((current) => ({
        ...current,
        status: current.status === "success" ? "success" : "loading",
        codeCount: codes.length
      }));
      fetch(`/api/stock-snapshots?codes=${encodeURIComponent(codeKey)}&_t=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal
      })
        .then(async (response) => {
          const json = (await response.json()) as { success?: boolean; data?: Record<string, StockRealtimeSnapshot> | null; error?: { message?: string } | null };
          if (!response.ok || !json.success || !json.data) throw new Error(json.error?.message ?? "股票悬浮快照刷新失败");
          if (!cancelled) {
            setRealtimeSnapshots(json.data);
            setRefreshError("");
            setRefreshState({
              status: "success",
              refreshedAt: new Date().toISOString(),
              codeCount: Object.keys(json.data).length
            });
          }
        })
        .catch((error) => {
          if (cancelled || error instanceof DOMException && error.name === "AbortError") return;
          const message = error instanceof Error ? error.message : String(error);
          setRefreshError(message);
          setRefreshState((current) => ({
            status: "failed",
            refreshedAt: current.refreshedAt,
            error: message,
            codeCount: codes.length
          }));
        });
    };

    refresh();
    const timer = window.setInterval(refresh, refreshIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      activeController?.abort();
    };
  }, [codeKey, refreshIntervalMs]);

  const registry = useMemo(
    () => buildStockHoverRegistry(report, realtimeSnapshots, refreshError, refreshState),
    [report, realtimeSnapshots, refreshError, refreshState]
  );
  return <StockHoverContext.Provider value={registry}>{children}</StockHoverContext.Provider>;
}

export function buildStockHoverRegistry(
  report: AnalysisReport | null,
  realtimeSnapshots: Record<string, StockRealtimeSnapshot> = {},
  refreshError = "",
  refreshState: StockHoverRegistry["refreshState"] = { status: "idle", codeCount: 0 }
): StockHoverRegistry {
  const candidatesByCode = new Map<string, StockCandidate>();
  const candidatesByName = new Map<string, StockCandidate>();
  const coreStocksByCode = new Map<string, CoreStockSnapshot>();
  const coreStocksByName = new Map<string, CoreStockSnapshot>();
  for (const candidate of report?.factPackage?.candidates ?? []) {
    candidatesByCode.set(normalizeStockLookupKey(candidate.code), candidate);
    candidatesByName.set(normalizeStockLookupKey(candidate.name), candidate);
  }
  for (const sector of report?.factPackage?.sectors ?? []) {
    for (const stock of sector.coreStocks ?? []) {
      const code = stock.marketCode ?? stock.code;
      if (code) coreStocksByCode.set(normalizeStockLookupKey(code), stock);
      coreStocksByName.set(normalizeStockLookupKey(stock.name), stock);
    }
  }
  return {
    reportId: report?.id,
    reportCreatedAt: report?.createdAt,
    reportTitle: report?.title,
    realtimeSnapshots: refreshError ? withRefreshError(realtimeSnapshots, refreshError) : realtimeSnapshots,
    refreshState,
    candidatesByCode,
    candidatesByName,
    coreStocksByCode,
    coreStocksByName
  };
}

function withRefreshError(snapshots: Record<string, StockRealtimeSnapshot>, refreshError: string) {
  return Object.fromEntries(Object.entries(snapshots).map(([code, snapshot]) => [
    code,
    {
      ...snapshot,
      warnings: Array.from(new Set([...snapshot.warnings, `悬浮行情自动刷新失败，暂用上一快照：${refreshError}`]))
    }
  ]));
}

export function normalizeStockLookupKey(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

export function findCandidateForStock(registry: StockHoverRegistry, name?: string, code?: string | null) {
  return registry.candidatesByCode.get(normalizeStockLookupKey(code)) ?? registry.candidatesByName.get(normalizeStockLookupKey(name));
}

export function findCoreStock(registry: StockHoverRegistry, name?: string, code?: string | null) {
  return registry.coreStocksByCode.get(normalizeStockLookupKey(code)) ?? registry.coreStocksByName.get(normalizeStockLookupKey(name));
}

export function findRealtimeSnapshot(registry: StockHoverRegistry, code?: string | null) {
  return registry.realtimeSnapshots[normalizeRealtimeCode(code)];
}

export function useStockHoverRegistry() {
  return useContext(StockHoverContext);
}

function collectStockCodes(report: AnalysisReport | null) {
  const codes = new Set<string>();
  for (const candidate of report?.factPackage?.candidates ?? []) {
    const code = normalizeRealtimeCode(candidate.code);
    if (code) codes.add(code);
  }
  for (const sector of report?.factPackage?.sectors ?? []) {
    for (const stock of sector.coreStocks ?? []) {
      const code = normalizeRealtimeCode(stock.marketCode ?? stock.code);
      if (code) codes.add(code);
    }
  }
  return Array.from(codes).sort();
}

function normalizeRealtimeCode(value?: string | null) {
  const raw = String(value ?? "").trim().toLowerCase();
  const digits = raw.match(/\d{6}/)?.[0];
  if (!digits) return raw;
  if (raw.startsWith("sh") || digits.startsWith("6")) return `sh${digits}`;
  if (raw.startsWith("bj") || /^[489]/.test(digits)) return `bj${digits}`;
  return `sz${digits}`;
}
