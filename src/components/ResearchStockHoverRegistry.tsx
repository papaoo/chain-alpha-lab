"use client";

import { createContext, useContext, useMemo } from "react";
import type React from "react";
import type { AnalysisReport, StockCandidate } from "@/lib/types";

export type CoreStockSnapshot = NonNullable<AnalysisReport["factPackage"]["sectors"][number]["coreStocks"]>[number];
export type StockHoverRegistry = {
  candidatesByCode: Map<string, StockCandidate>;
  candidatesByName: Map<string, StockCandidate>;
  coreStocksByCode: Map<string, CoreStockSnapshot>;
  coreStocksByName: Map<string, CoreStockSnapshot>;
};

const StockHoverContext = createContext<StockHoverRegistry>({
  candidatesByCode: new Map(),
  candidatesByName: new Map(),
  coreStocksByCode: new Map(),
  coreStocksByName: new Map()
});

export function StockHoverProvider({ report, children }: { report: AnalysisReport | null; children: React.ReactNode }) {
  const registry = useMemo(() => buildStockHoverRegistry(report), [report]);
  return <StockHoverContext.Provider value={registry}>{children}</StockHoverContext.Provider>;
}

export function buildStockHoverRegistry(report: AnalysisReport | null): StockHoverRegistry {
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
  return { candidatesByCode, candidatesByName, coreStocksByCode, coreStocksByName };
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

export function useStockHoverRegistry() {
  return useContext(StockHoverContext);
}
