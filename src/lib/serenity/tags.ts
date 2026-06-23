import { listSerenityRuns, getSerenityRun } from "@/lib/serenity/research";
import { normalizeStockCode } from "@/lib/strategy/candidateUtils";
import type { SerenityResearchTag } from "@/lib/serenity/tagTypes";

export const DEFAULT_SERENITY_TAG_LOOKBACK = 12;

export function buildSerenityTagMap({
  codes,
  lookback = DEFAULT_SERENITY_TAG_LOOKBACK
}: {
  codes?: string[];
  lookback?: number;
} = {}) {
  const wanted = codes?.length ? new Set(codes.map(normalizeStockCode)) : null;
  const map = new Map<string, SerenityResearchTag>();
  for (const summary of listSerenityRuns(lookback)) {
    const run = getSerenityRun(summary.id);
    if (!run) continue;
    for (const candidate of run.candidates) {
      if (!candidate.code) continue;
      const code = normalizeStockCode(candidate.code);
      if (wanted && !wanted.has(code)) continue;
      const tag: SerenityResearchTag = {
        theme: run.theme,
        runId: run.id,
        createdAt: run.createdAt,
        priority: candidate.priority,
        score: candidate.score,
        evidenceStrength: candidate.evidenceStrength,
        chainPosition: candidate.chainPosition,
        constrains: candidate.constrains,
        verdict: candidate.verdict,
        missingProof: candidate.missingProof.slice(0, 6),
        evidenceCoverage: candidate.evidenceCoverage,
        researchBoundary: candidate.researchBoundary,
        nextResearchChecks: candidate.nextResearchChecks?.slice(0, 6)
      };
      const existing = map.get(code);
      if (!existing || tagRank(tag) > tagRank(existing) || (tagRank(tag) === tagRank(existing) && tag.createdAt > existing.createdAt)) {
        map.set(code, tag);
      }
    }
  }
  return map;
}

function tagRank(tag: SerenityResearchTag) {
  const priority = { top: 4, high: 3, watch: 2, low: 1 }[tag.priority];
  const evidence = { strong: 4, medium: 3, weak: 2, needs_checking: 1 }[tag.evidenceStrength];
  return priority * 10 + evidence + tag.score / 100;
}
