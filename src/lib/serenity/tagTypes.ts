import type { SerenityEvidenceCoverage, SerenityEvidenceStrength, SerenityPriority, SerenityResearchBoundaryLevel } from "@/lib/serenity/types";

export interface SerenityResearchTag {
  theme: string;
  runId: string;
  createdAt: string;
  priority: SerenityPriority;
  score: number;
  evidenceStrength: SerenityEvidenceStrength;
  chainPosition: string;
  constrains: string;
  verdict: string;
  missingProof: string[];
  evidenceCoverage?: SerenityEvidenceCoverage;
  researchBoundary?: {
    level: SerenityResearchBoundaryLevel;
    label: string;
    text: string;
  };
  nextResearchChecks?: string[];
}

export function serenityTagPriorityLabel(value: SerenityResearchTag["priority"]) {
  if (value === "top") return "核心瓶颈";
  if (value === "high") return "高优先级";
  if (value === "watch") return "待验证";
  return "低优先级";
}

export function serenityTagEvidenceLabel(value: SerenityResearchTag["evidenceStrength"]) {
  if (value === "strong") return "强证据";
  if (value === "medium") return "中证据";
  if (value === "weak") return "弱证据";
  return "待核验";
}
