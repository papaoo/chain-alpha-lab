import type { Fact, MarketRuleResult } from "@/lib/types";
import type { ParsedCommandResult } from "@/lib/westock/parser";
import { normalizeStockCode } from "@/lib/strategy/candidateUtils";

export function firstRow(result?: ParsedCommandResult | null) {
  return firstTableRows(result)[0];
}

export function firstTableRows(result?: ParsedCommandResult | null): Array<Record<string, unknown>> {
  const tables = result?.sections.filter((section) => section.type === "markdownTable") ?? [];
  const dataTables = tables.filter((section) => section.columns.length > 0 && section.rows.length > 0);
  if (dataTables.length) return dataTables.flatMap((section) => section.rows);
  return tables.find((section) => section.rows.length > 0)?.rows ?? [];
}

export function allTableRows(result?: ParsedCommandResult | null): Array<Record<string, unknown>> {
  return result?.sections
    .filter((section) => section.type === "markdownTable" && section.columns.length > 0)
    .flatMap((section) => section.rows) ?? [];
}

export function rowMap(result?: ParsedCommandResult | null, codeField = "code") {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of firstTableRows(result)) {
    const code = String(row[codeField] ?? "");
    if (!map.has(code)) map.set(code, row);
  }
  return map;
}

const DEFAULT_CODE_FIELDS = [
  "code",
  "symbol",
  "SecuCode",
  "secuCode",
  "marketCode",
  "ts_code",
  "tsCode",
  "stockCode"
] as const;

export function rowMapByNormalizedCode(
  result?: ParsedCommandResult | null,
  preferredFields: string[] = []
) {
  const map = new Map<string, Record<string, unknown>>();
  const fields = Array.from(new Set([...preferredFields, ...DEFAULT_CODE_FIELDS]));
  for (const row of firstTableRows(result)) {
    for (const field of fields) {
      const raw = row[field];
      if (raw === undefined || raw === null) continue;
      const code = normalizeStockCode(String(raw));
      if (!code || map.has(code)) continue;
      map.set(code, row);
    }
  }
  return map;
}

export function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function average(values: number[]) {
  if (!values.length) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function standardDeviation(values: number[]) {
  const avg = average(values) ?? 0;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / Math.max(values.length, 1);
  return Math.sqrt(variance);
}

export function sortRowsByDateDesc(rows: Array<Record<string, unknown>>) {
  return [...rows].sort((left, right) => rowDateKey(right).localeCompare(rowDateKey(left)));
}

export function rowDateKey(row: Record<string, unknown>) {
  return String(row.EndDate ?? row.reportDate ?? row.reportEndDate ?? row._date ?? row.date ?? row.Date ?? "");
}

export function calculateVolatility20(closes: number[]) {
  const recent = closes.slice(0, 20);
  if (recent.length < 10) return undefined;
  const returns = recent.slice(0, -1)
    .map((close, index) => {
      const previous = recent[index + 1];
      return previous ? (close - previous) / previous : undefined;
    })
    .filter((value): value is number => value !== undefined && Number.isFinite(value));
  if (!returns.length) return undefined;
  const avgReturn = average(returns) ?? 0;
  const variance = returns.reduce((sum, value) => sum + (value - avgReturn) ** 2, 0) / returns.length;
  return Number((Math.sqrt(variance) * Math.sqrt(252) * 100).toFixed(2));
}

export function maxDefined(first?: number, second?: number) {
  if (first === undefined) return second;
  if (second === undefined) return first;
  return Math.max(first, second);
}

export function distancePct(price: number, ma?: number) {
  if (!ma) return undefined;
  return Number((((price - ma) / ma) * 100).toFixed(2));
}

export function pushFact(facts: Fact[], factId: string, sourceType: Fact["sourceType"], text: string, value?: Fact["value"], unit?: string) {
  const existing = facts.find((fact) => fact.factId === factId);
  if (existing) return existing;
  const fact: Fact = { factId, sourceType, text, value, unit };
  facts.push(fact);
  return fact;
}

export function diagnosticsToScoreBreakdown(input: {
  prefix: string;
  diagnostics: Array<{ label: string; score: number; max: number; status: string; note: string }>;
  defaultDataSources: string[];
  evidenceRefs: string[];
}): NonNullable<MarketRuleResult["scoreBreakdown"]> {
  return input.diagnostics.map((item, index) => {
    const missing = item.status === "缺失" || item.note.includes("缺失");
    const weak = item.status === "弱" || item.score <= item.max * 0.35;
    const medium = item.status === "中" || item.score <= item.max * 0.65;
    return {
      key: `${input.prefix}.${index}.${item.label}`,
      label: item.label,
      score: item.score,
      maxScore: item.max,
      evidenceRefs: input.evidenceRefs,
      dataSources: input.defaultDataSources,
      confidence: missing || weak ? "低" : medium ? "中" : "高",
      missingFields: missing ? [item.label] : [],
      downgradeReasons: weak && !missing ? [item.note] : [],
      note: item.note
    };
  });
}

export function scoreStatus(score: number, max: number): "强" | "中" | "弱" {
  const ratio = max ? score / max : 0;
  if (ratio >= 0.7) return "强";
  if (ratio >= 0.4) return "中";
  return "弱";
}
