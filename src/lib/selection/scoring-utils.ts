import type { SelectionPick, SelectionPickScoreFactor } from "@/lib/selection/types";
import { isSelectionRejected } from "@/lib/selection/insights";

export function factor(
  key: string,
  label: string,
  score: number,
  maxScore: number,
  reasons: string[],
  blockers: string[]
): SelectionPickScoreFactor {
  return {
    key,
    label,
    score: Math.max(0, Math.min(maxScore, Math.round(score))),
    maxScore,
    reasons,
    blockers
  };
}

export function numberParam(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function booleanParam(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function stringParam(value: unknown, fallback: string) {
  return typeof value === "string" && value ? value : fallback;
}

export function uniqueText(values: Array<string | null | undefined | false>, limit = 8) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))).slice(0, limit);
}

export function tierFromScore(score: number): SelectionPick["tier"] {
  if (score >= 85) return "S";
  if (score >= 75) return "A";
  if (score >= 60) return "B";
  if (score >= 45) return "C";
  return "D";
}

export function splitPassedAndRejected(scored: SelectionPick[], maxFinalPicks: number) {
  const passed = scored
    .filter((pick) => !isSelectionRejected(pick.action))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFinalPicks);
  const selectedCodes = new Set(passed.map((pick) => pick.code));
  const rejected = scored
    .filter((pick) => !selectedCodes.has(pick.code))
    .sort((a, b) => b.score - a.score);
  return { passed, rejected };
}
