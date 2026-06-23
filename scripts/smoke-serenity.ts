import { buildSerenityCandidatePreview } from "@/lib/serenity/candidateBuilder";
import { enrichSerenityCandidatesWithEvidence, serenityPreviewToCandidateInput } from "@/lib/serenity/evidenceCollector";
import { importSerenityThemesFromLatestMainline } from "@/lib/serenity/importers/fromMainline";
import { createSerenityRun } from "@/lib/serenity/research";
import { buildSerenityThemePreview } from "@/lib/serenity/themes";

async function main() {
  const persist = process.argv.includes("--persist");
  const imported = importSerenityThemesFromLatestMainline(5, "A-share");
  console.log("IMPORT", JSON.stringify({
    count: imported.suggestions.length,
    warnings: imported.warnings,
    first: imported.suggestions[0]?.name
  }, null, 2));

  const theme = imported.suggestions[0]?.name ?? "CPO 光通信";
  const base = buildSerenityThemePreview({ theme, market: "A-share", timeWindow: "未来 3-12 个月" });
  const candidates = await buildSerenityCandidatePreview({
    theme,
    market: "A-share",
    normalizedTheme: base.normalizedTheme,
    limit: 8
  });
  console.log("CANDIDATES", JSON.stringify({
    count: candidates.candidates.length,
    warnings: candidates.warnings.slice(0, 3),
    first: candidates.candidates[0]
  }, null, 2));

  const enriched = await enrichSerenityCandidatesWithEvidence(candidates.candidates, { theme, limit: 5 });
  console.log("ENRICHED", JSON.stringify({
    count: enriched.candidates.length,
    warnings: enriched.warnings.slice(0, 3),
    first: enriched.candidates[0]
  }, null, 2));

  const runInput = {
    theme,
    market: "A-share",
    timeWindow: "未来 3-12 个月",
    layers: base.layerRanking,
    candidatePreview: enriched.candidates,
    candidates: enriched.candidates.slice(0, 5).map(serenityPreviewToCandidateInput)
  } as const;
  const run = persist ? createSerenityRun(runInput) : {
    id: "dry-run",
    candidates: runInput.candidates.map((candidate) => ({
      name: candidate.name,
      code: candidate.code,
      evidenceStrength: candidate.evidence?.[0]?.strength,
      missingProof: candidate.missingProof
    })),
    warnings: ["dry-run：未写入 serenity_research_runs"]
  };
  console.log("RUN", JSON.stringify({
    id: run.id,
    candidateCount: run.candidates.length,
    top: run.candidates[0],
    warnings: run.warnings
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
