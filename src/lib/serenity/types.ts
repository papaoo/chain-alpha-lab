export type SerenityMarket = "A-share" | "HK" | "US" | "global";

export type SerenityEvidenceStrength = "strong" | "medium" | "weak" | "needs_checking";

export type SerenityPriority = "top" | "high" | "watch" | "low";

export type SerenityResearchBoundaryLevel = "evidence_backed" | "candidate_watch" | "needs_hard_evidence" | "research_only";

export type SerenityEvidenceCoverage = {
  sourceCount: number;
  strongCount: number;
  mediumCount: number;
  weakCount: number;
  needsCheckingCount: number;
  hardEvidenceCount: number;
  verifiedHardEvidenceCount: number;
  freshEvidenceCount: number;
  agingEvidenceCount: number;
  staleEvidenceCount: number;
  undatedEvidenceCount: number;
  freshnessLevel: "fresh" | "aging" | "stale" | "unknown";
  confidencePct: number;
  sourceLabels: string[];
  latestFetchedAt?: string;
};

export type SerenityEvidenceNeedKey =
  | "business"
  | "filing"
  | "customer"
  | "capacity"
  | "constraint"
  | "falsification"
  | "market"
  | "evidence_strength";

export type SerenityEvidenceNeed = {
  key: SerenityEvidenceNeedKey;
  label: string;
  priority: "high" | "medium" | "low";
  reason: string;
  sourcePaths: string[];
  canAutomate: boolean;
};

export type SerenityFactorKey =
  | "demandInflection"
  | "architectureCoupling"
  | "chokepointSeverity"
  | "supplierConcentration"
  | "expansionDifficulty"
  | "evidenceQuality"
  | "valuationDisconnect"
  | "catalystTiming";

export type SerenityPenaltyKey =
  | "dilutionFinancing"
  | "governance"
  | "geopolitics"
  | "liquidity"
  | "hypeRisk"
  | "accountingQuality"
  | "cyclicality"
  | "alternativeDesignRisk";

export type SerenityLayer = {
  id: string;
  name: string;
  rank: number;
  scarceReason: string;
  constraints: string[];
  evidenceNeeds: string[];
};

export type SerenityThemeSuggestion = {
  id: string;
  name: string;
  market: SerenityMarket;
  category: string;
  aliases: string[];
  description: string;
  chainKeywords: string[];
  source: "builtin" | "mainline" | "history";
  sourceLabel?: string;
  score: number;
};

export type SerenityPreviewCandidate = {
  code?: string;
  name: string;
  source: "manual" | "latest_mainline" | "eastmoney_sector";
  sourceLabel: string;
  sourceUrl?: string;
  fetchedAt?: string;
  sectorName?: string;
  chainPosition: string;
  matchReason: string;
  evidenceStrength: SerenityEvidenceStrength;
  evidence?: SerenityEvidence[];
  missingProof: string[];
  changePct?: number;
  amount?: number;
  turnoverRate?: number;
  mainNetInflow?: number;
  latest?: number;
  industry?: string;
  business?: string;
  evidenceSummary?: {
    sourceCount: number;
    strongCount: number;
    mediumCount: number;
    weakCount: number;
    needsCheckingCount: number;
  };
  evidenceCoverage?: SerenityEvidenceCoverage;
  evidenceNeeds?: SerenityEvidenceNeed[];
  researchBoundary?: {
    level: SerenityResearchBoundaryLevel;
    label: string;
    text: string;
  };
  nextResearchChecks?: string[];
  score: number;
};

export type SerenityThemePreview = {
  theme: string;
  market: SerenityMarket;
  timeWindow: string;
  normalizedTheme?: SerenityThemeSuggestion;
  layerRanking: SerenityLayer[];
  candidatePreview: SerenityPreviewCandidate[];
  evidencePlan: string[];
  warnings: string[];
};

export type SerenityEvidence = {
  claim: string;
  sourceType: string;
  sourceLabel: string;
  sourceUrl?: string;
  fetchedAt?: string;
  strength: SerenityEvidenceStrength;
};

export type SerenityCandidateInput = {
  code?: string;
  name: string;
  market?: SerenityMarket;
  chainPosition?: string;
  constrains?: string;
  factors?: Partial<Record<SerenityFactorKey, number>>;
  penalties?: Partial<Record<SerenityPenaltyKey, number>>;
  evidence?: SerenityEvidence[];
  missingProof?: string[];
  weakenConditions?: string[];
};

export type SerenityCandidateScore = {
  code?: string;
  name: string;
  market: SerenityMarket;
  chainPosition: string;
  constrains: string;
  score: number;
  rawFactorPoints: number;
  penaltyPoints: number;
  priority: SerenityPriority;
  factorDetails: Record<SerenityFactorKey, { rating: number; weight: number; points: number }>;
  penaltyDetails: Record<SerenityPenaltyKey, { rating: number; points: number }>;
  evidenceStrength: SerenityEvidenceStrength;
  evidence: SerenityEvidence[];
  evidenceCoverage?: SerenityEvidenceCoverage;
  evidenceNeeds?: SerenityEvidenceNeed[];
  researchBoundary?: {
    level: SerenityResearchBoundaryLevel;
    label: string;
    text: string;
  };
  nextResearchChecks?: string[];
  missingProof: string[];
  weakenConditions: string[];
  verdict: string;
};

export type SerenityRunInput = {
  theme: string;
  market: SerenityMarket;
  timeWindow?: string;
  layers?: SerenityLayer[];
  candidates: SerenityCandidateInput[];
  candidatePreview?: SerenityPreviewCandidate[];
  notes?: string;
};

export type SerenityRunResult = {
  id: string;
  theme: string;
  market: SerenityMarket;
  timeWindow: string;
  createdAt: string;
  layerRanking: SerenityLayer[];
  candidatePreview?: SerenityPreviewCandidate[];
  candidates: SerenityCandidateScore[];
  summary: string;
  methodNote: string;
  warnings: string[];
};

export type SerenityRunSummary = Pick<SerenityRunResult, "id" | "theme" | "market" | "timeWindow" | "summary" | "createdAt"> & {
  candidateCount: number;
  topCandidate?: SerenityCandidateScore;
};
