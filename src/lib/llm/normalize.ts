import type { DeepSeekReport, FactPackage } from "../types";

const STAGE_VALUES = ["观察", "启动", "确认", "加速", "分歧", "退潮"] as const;
type StageValue = (typeof STAGE_VALUES)[number];

export interface NormalizedLlmOutput {
  value: unknown;
  changed: boolean;
  changes: string[];
}

export function normalizeDeepSeekOutput(value: unknown, factPackage: FactPackage): NormalizedLlmOutput {
  if (!isRecord(value)) return { value, changed: false, changes: [] };
  const cloned = cloneJson(value) as Record<string, unknown>;
  const changes: string[] = [];
  const evidenceAliases = buildEvidenceAliasMap(factPackage);

  normalizeEvidenceRefsDeep(cloned, evidenceAliases, changes);
  normalizeStageForecasts(cloned, changes);

  return { value: cloned, changed: changes.length > 0, changes };
}

function normalizeEvidenceRefsDeep(value: unknown, aliases: Map<string, string>, changes: string[], path = "root") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => normalizeEvidenceRefsDeep(item, aliases, changes, `${path}.${index}`));
    return;
  }
  if (!isRecord(value)) return;

  const refs = value.evidenceRefs;
  if (Array.isArray(refs)) {
    value.evidenceRefs = refs.map((ref) => {
      if (typeof ref !== "string") return ref;
      const normalized = aliases.get(ref.trim());
      if (normalized && normalized !== ref) changes.push(`${path}.evidenceRefs: ${ref} -> ${normalized}`);
      return normalized ?? ref;
    });
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === "evidenceRefs") continue;
    normalizeEvidenceRefsDeep(child, aliases, changes, `${path}.${key}`);
  }
}

function normalizeStageForecasts(report: Record<string, unknown>, changes: string[]) {
  const forecasts = report.mainlineStageForecasts;
  if (!Array.isArray(forecasts)) return;
  for (const [index, item] of forecasts.entries()) {
    if (!isRecord(item)) continue;
    const currentStage = normalizeStageValue(item.currentStage);
    const nextStage = normalizeStageValue(item.nextStage, currentStage);
    if (currentStage && item.currentStage !== currentStage) {
      changes.push(`mainlineStageForecasts.${index}.currentStage: ${String(item.currentStage)} -> ${currentStage}`);
      item.currentStage = currentStage;
    }
    if (nextStage && item.nextStage !== nextStage) {
      changes.push(`mainlineStageForecasts.${index}.nextStage: ${String(item.nextStage)} -> ${nextStage}`);
      item.nextStage = nextStage;
    }
  }
}

function normalizeStageValue(value: unknown, fallback?: StageValue): StageValue | undefined {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if ((STAGE_VALUES as readonly string[]).includes(trimmed)) return trimmed as StageValue;
  if (trimmed.includes("修复") || trimmed.includes("反弹")) return fallback === "确认" || fallback === "启动" ? "确认" : "分歧";
  if (trimmed.includes("试错") || trimmed.includes("酝酿")) return "启动";
  if (trimmed.includes("强化") || trimmed.includes("走强")) return "确认";
  if (trimmed.includes("高潮") || trimmed.includes("主升")) return "加速";
  if (trimmed.includes("分化") || trimmed.includes("震荡")) return "分歧";
  if (trimmed.includes("失败") || trimmed.includes("走弱") || trimmed.includes("降温")) return "退潮";
  return fallback;
}

function buildEvidenceAliasMap(factPackage: FactPackage) {
  const aliases = new Map<string, string>();
  const evidenceIds = new Set<string>();
  collectEvidenceIds(factPackage, evidenceIds);
  const add = (alias: string, target: string) => {
    if (evidenceIds.has(target)) aliases.set(alias, target);
  };

  add("constraints", "audit.constraints");
  add("dataSource.warnings", "audit.dataSource.warnings");
  add("dataSource.status", "audit.dataSource.status");
  add("llm.errors", "audit.llm.errors");
  add("premarket", "premarket.risk.overlay");
  add("premarket.risk", "premarket.risk.overlay");
  add("premarket.overlay", "premarket.risk.overlay");
  add("market.phase", "session.market.phase");
  add("session.phase", "session.market.phase");

  for (const id of evidenceIds) aliases.set(id, id);
  return aliases;
}

function collectEvidenceIds(factPackage: FactPackage, ids: Set<string>) {
  for (const fact of factPackage.facts) ids.add(fact.factId);
  for (const fact of factPackage.market.facts) ids.add(fact.factId);
  for (const fact of factPackage.marketContext?.facts ?? []) ids.add(fact.factId);
  for (const index of factPackage.market.indices) {
    for (const fact of index.facts) ids.add(fact.factId);
  }
  for (const sector of factPackage.sectors) {
    for (const fact of sector.facts) ids.add(fact.factId);
  }
  for (const candidate of factPackage.candidates) {
    for (const ref of candidate.evidenceRefs) ids.add(ref);
  }
}

function cloneJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function applyNormalizedReport<T extends DeepSeekReport>(report: T, factPackage: FactPackage): T {
  return normalizeDeepSeekOutput(report, factPackage).value as T;
}
