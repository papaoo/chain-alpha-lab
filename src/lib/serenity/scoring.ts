import type {
  SerenityCandidateInput,
  SerenityCandidateScore,
  SerenityEvidence,
  SerenityEvidenceCoverage,
  SerenityResearchBoundaryLevel,
  SerenityEvidenceStrength,
  SerenityFactorKey,
  SerenityLayer,
  SerenityMarket,
  SerenityPenaltyKey,
  SerenityPriority
} from "@/lib/serenity/types";
import { buildSerenityEvidenceNeeds } from "@/lib/serenity/evidenceNeeds";

export const SERENITY_FACTOR_WEIGHTS: Record<SerenityFactorKey, number> = {
  demandInflection: 15,
  architectureCoupling: 10,
  chokepointSeverity: 15,
  supplierConcentration: 12,
  expansionDifficulty: 12,
  evidenceQuality: 15,
  valuationDisconnect: 11,
  catalystTiming: 10
};

export const SERENITY_PENALTY_KEYS: SerenityPenaltyKey[] = [
  "dilutionFinancing",
  "governance",
  "geopolitics",
  "liquidity",
  "hypeRisk",
  "accountingQuality",
  "cyclicality",
  "alternativeDesignRisk"
];

const PENALTY_MULTIPLIER = 2;

export function scoreSerenityCandidate(input: SerenityCandidateInput, fallbackMarket: SerenityMarket): SerenityCandidateScore {
  const factorDetails = Object.fromEntries(
    Object.entries(SERENITY_FACTOR_WEIGHTS).map(([key, weight]) => {
      const factorKey = key as SerenityFactorKey;
      const rating = normalizeRating(input.factors?.[factorKey] ?? 0);
      const points = round((rating / 5) * weight);
      return [factorKey, { rating, weight, points }];
    })
  ) as SerenityCandidateScore["factorDetails"];

  const rawFactorPoints = round(Object.values(factorDetails).reduce((sum, item) => sum + item.points, 0));
  const penaltyDetails = Object.fromEntries(
    SERENITY_PENALTY_KEYS.map((key) => {
      const rating = normalizeRating(input.penalties?.[key] ?? 0);
      return [key, { rating, points: round(rating * PENALTY_MULTIPLIER) }];
    })
  ) as SerenityCandidateScore["penaltyDetails"];
  const penaltyPoints = round(Object.values(penaltyDetails).reduce((sum, item) => sum + item.points, 0));
  const evidenceStrength = inferEvidenceStrength(input.evidence ?? []);
  const evidencePenalty = evidenceStrength === "strong" ? 0 : evidenceStrength === "medium" ? 4 : evidenceStrength === "weak" ? 12 : 18;
  const missingProof = buildMissingProof(input, evidenceStrength);
  const evidenceCoverage = summarizeEvidence(input.evidence ?? []);
  const evidenceNeeds = buildSerenityEvidenceNeeds({ missingProof, evidence: input.evidence ?? [], evidenceCoverage });
  const baseScore = Math.max(0, Math.min(100, round(rawFactorPoints - penaltyPoints - evidencePenalty)));
  const score = applyEvidenceScoreCap(baseScore, evidenceStrength, evidenceCoverage);
  const priority = inferPriority(score, evidenceStrength, evidenceCoverage, missingProof);
  const researchBoundary = buildResearchBoundary(priority, evidenceStrength, evidenceCoverage, missingProof);

  return {
    code: input.code?.trim() || undefined,
    name: input.name.trim(),
    market: input.market ?? fallbackMarket,
    chainPosition: input.chainPosition?.trim() || "待确认产业链位置",
    constrains: input.constrains?.trim() || "尚未说明卡住的具体环节",
    score,
    rawFactorPoints,
    penaltyPoints,
    priority,
    factorDetails,
    penaltyDetails,
    evidenceStrength,
    evidence: input.evidence ?? [],
    evidenceCoverage,
    evidenceNeeds,
    researchBoundary,
    nextResearchChecks: buildNextResearchChecks(input, evidenceCoverage, missingProof),
    missingProof,
    weakenConditions: (input.weakenConditions ?? []).filter(Boolean),
    verdict: verdictText(priority, evidenceStrength)
  };
}

function summarizeEvidence(evidence: SerenityEvidence[]): SerenityEvidenceCoverage {
  const fetchedTimes = evidence
    .map((item) => item.fetchedAt)
    .filter((item): item is string => Boolean(item))
    .filter((item) => Number.isFinite(Date.parse(item)))
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  const datedEvidence = evidence.map((item) => classifyEvidenceFreshness(item));
  const freshEvidenceCount = datedEvidence.filter((item) => item === "fresh").length;
  const agingEvidenceCount = datedEvidence.filter((item) => item === "aging").length;
  const staleEvidenceCount = datedEvidence.filter((item) => item === "stale").length;
  const undatedEvidenceCount = datedEvidence.filter((item) => item === "unknown").length;
  const hardEvidence = evidence.filter(isHardEvidence);
  const verifiedHardEvidenceCount = hardEvidence.filter((item) => item.strength === "strong" || item.strength === "medium").length;
  const constraintHardEvidenceCount = evidence.filter(isConstraintHardEvidence).length;
  const datedCount = freshEvidenceCount + agingEvidenceCount + staleEvidenceCount;
  const confidencePct = calculateEvidenceConfidence({
    evidenceCount: evidence.length,
    hardEvidenceCount: hardEvidence.length,
    verifiedHardEvidenceCount,
    constraintHardEvidenceCount,
    freshEvidenceCount,
    agingEvidenceCount,
    staleEvidenceCount,
    undatedEvidenceCount
  });
  return {
    sourceCount: evidence.length,
    strongCount: evidence.filter((item) => item.strength === "strong").length,
    mediumCount: evidence.filter((item) => item.strength === "medium").length,
    weakCount: evidence.filter((item) => item.strength === "weak").length,
    needsCheckingCount: evidence.filter((item) => item.strength === "needs_checking").length,
    hardEvidenceCount: hardEvidence.length,
    verifiedHardEvidenceCount,
    freshEvidenceCount,
    agingEvidenceCount,
    staleEvidenceCount,
    undatedEvidenceCount,
    freshnessLevel: inferFreshnessLevel(evidence.length, datedCount, freshEvidenceCount, agingEvidenceCount, staleEvidenceCount),
    confidencePct,
    sourceLabels: Array.from(new Set(evidence.map((item) => item.sourceLabel).filter(Boolean))).slice(0, 6),
    latestFetchedAt: fetchedTimes[0]
  };
}

function isHardEvidence(item: SerenityEvidence) {
  return /(company_profile|filing|announcement|financial_indicator|financial_report|customer|capacity|project|patent|standard)/i.test(item.sourceType);
}

function isConstraintHardEvidence(item: SerenityEvidence) {
  return /(filing|announcement|customer|capacity|project|patent|standard)/i.test(item.sourceType);
}

function calculateEvidenceConfidence(input: {
  evidenceCount: number;
  hardEvidenceCount: number;
  verifiedHardEvidenceCount: number;
  constraintHardEvidenceCount: number;
  freshEvidenceCount: number;
  agingEvidenceCount: number;
  staleEvidenceCount: number;
  undatedEvidenceCount: number;
}) {
  if (!input.evidenceCount) return 0;
  const sourceCoverage = Math.min(30, input.evidenceCount * 5 + input.hardEvidenceCount * 5);
  const verifiedHardScore = Math.min(45, input.verifiedHardEvidenceCount * 34);
  const freshnessScore = Math.min(
    25,
    input.freshEvidenceCount * 6 + input.agingEvidenceCount * 3 + input.staleEvidenceCount * 0.5 - input.undatedEvidenceCount * 1.5
  );
  const raw = Math.max(0, Math.min(100, Math.round(sourceCoverage + verifiedHardScore + freshnessScore)));

  if (!input.verifiedHardEvidenceCount) return Math.min(raw, input.hardEvidenceCount ? 42 : 30);
  if (!input.constraintHardEvidenceCount) return Math.min(raw, 78);
  if (input.verifiedHardEvidenceCount === 1 && input.hardEvidenceCount === 1) return Math.min(raw, 78);
  return raw;
}

function classifyEvidenceFreshness(item: SerenityEvidence): "fresh" | "aging" | "stale" | "unknown" {
  if (!item.fetchedAt) return "unknown";
  const time = Date.parse(item.fetchedAt);
  if (!Number.isFinite(time)) return "unknown";
  const ageDays = (Date.now() - time) / 86_400_000;
  if (ageDays <= 7) return "fresh";
  if (ageDays <= 45) return "aging";
  return "stale";
}

function inferFreshnessLevel(
  sourceCount: number,
  datedCount: number,
  freshEvidenceCount: number,
  agingEvidenceCount: number,
  staleEvidenceCount: number
): SerenityEvidenceCoverage["freshnessLevel"] {
  if (!sourceCount || !datedCount) return "unknown";
  if (freshEvidenceCount >= Math.ceil(sourceCount * 0.45)) return "fresh";
  if (freshEvidenceCount + agingEvidenceCount >= Math.ceil(sourceCount * 0.5)) return "aging";
  if (staleEvidenceCount >= Math.ceil(sourceCount * 0.5)) return "stale";
  return "unknown";
}

function applyEvidenceScoreCap(
  score: number,
  strength: SerenityEvidenceStrength,
  coverage: SerenityEvidenceCoverage
) {
  let capped = score;
  if (!coverage.verifiedHardEvidenceCount) capped = Math.min(capped, 58);
  if (strength === "weak") capped = Math.min(capped, 62);
  if (strength === "needs_checking") capped = Math.min(capped, 48);
  if (coverage.freshnessLevel === "stale") capped = Math.min(capped, 60);
  if (coverage.freshnessLevel === "unknown") capped = Math.min(capped, 56);
  return round(capped);
}

function buildResearchBoundary(
  priority: SerenityPriority,
  strength: SerenityEvidenceStrength,
  coverage: SerenityEvidenceCoverage,
  missingProof: string[]
): { level: SerenityResearchBoundaryLevel; label: string; text: string } {
  if (priority === "top" && coverage.verifiedHardEvidenceCount > 0 && coverage.strongCount > 0 && missingProof.length <= 1 && coverage.freshnessLevel !== "stale" && coverage.freshnessLevel !== "unknown") {
    return {
      level: "evidence_backed",
      label: "证据支撑较强",
      text: "已具备较强证据，可进入估值、催化和反证研究；仍不等同交易建议。"
    };
  }
  if ((priority === "high" || priority === "top") && coverage.verifiedHardEvidenceCount > 0 && strength !== "needs_checking" && coverage.freshnessLevel !== "stale") {
    return {
      level: "candidate_watch",
      label: "高优先研究",
      text: "适合进入研究池和追踪池，但还需要公告、财报、客户、产能证据继续确认。"
    };
  }
  if (strength === "weak" || strength === "needs_checking" || !coverage.verifiedHardEvidenceCount) {
    return {
      level: "needs_hard_evidence",
      label: "先补硬证据",
      text: "当前证据不足以证明瓶颈控制力，只能作为待核验线索。"
    };
  }
  return {
    level: "research_only",
    label: "研究线索",
    text: "结论边界较窄，先做补证与反证，不进入交易建议。"
  };
}

function buildNextResearchChecks(
  input: SerenityCandidateInput,
  coverage: SerenityEvidenceCoverage,
  missingProof: string[]
) {
  const name = input.name.trim() || "该公司";
  return Array.from(new Set([
    ...missingProof.map((item) => `补证：${item}`),
    ...(coverage.verifiedHardEvidenceCount ? [] : `核对 ${name} 的年报/半年报/公告/互动易，确认主营产品与产业链位置`),
    ...((coverage.freshnessLevel === "stale" || coverage.freshnessLevel === "unknown") ? [`刷新 ${name} 的 F10、公告、财报和行情证据，当前证据新鲜度不足`] : []),
    `验证 ${name} 是否存在客户导入、订单、产能、认证、良率或项目进展证据`,
    "列出最强反证：替代路线、竞争扩产、需求放缓、估值已透支或治理风险"
  ].filter(Boolean) as string[])).slice(0, 5);
}

export function summarizeSerenityRun(theme: string, candidates: SerenityCandidateScore[]) {
  const cleanTheme = theme.trim() || "未命名主题";
  if (!candidates.length) return `${cleanTheme} 当前只完成产业链层级预研，尚未生成可排序公司；下一步需要接入板块成分、主营业务、公告和财报证据。`;
  const topNames = candidates.slice(0, 3).map((item) => `${item.name}${item.code ? `(${item.code})` : ""}`).join("、");
  const top = candidates[0];
  return `${cleanTheme} 的初步瓶颈研究优先看 ${topNames}。当前最高分为 ${top.name}，但结论仍取决于证据强度和后续公告/财报验证。`;
}

export function buildDefaultLayers(theme: string): SerenityLayer[] {
  const normalized = theme.toLowerCase();
  if (normalized.includes("cpo") || normalized.includes("光") || normalized.includes("通信")) {
    return [
      layer("optical-materials", "上游材料/衬底", 1, "材料纯度、良率和扩产周期容易成为真实约束。", ["材料纯度", "产能扩张", "客户认证"]),
      layer("lasers-devices", "激光器/光芯片器件", 2, "高速光模块升级会把压力传导到核心器件。", ["供应商集中", "技术壁垒", "良率"]),
      layer("testing-packaging", "测试与封装", 3, "高速产品验证和良率爬坡需要专用测试能力。", ["测试设备", "封装良率", "认证周期"]),
      layer("modules", "光模块/系统集成", 4, "更接近订单和收入，但竞争与价格压力也更直接。", ["订单兑现", "毛利率", "客户结构"])
    ];
  }
  if (normalized.includes("半导体") || normalized.includes("芯片") || normalized.includes("ai")) {
    return [
      layer("equipment", "关键设备/工艺平台", 1, "扩产和工艺升级绕不开设备能力。", ["国产替代", "客户验证", "订单"]),
      layer("materials", "材料与耗材", 2, "纯度、认证和稳定供应决定工艺良率。", ["纯度", "认证周期", "消耗弹性"]),
      layer("packaging-testing", "先进封装与测试", 3, "AI 芯片放量会提高封装密度和测试复杂度。", ["产能", "良率", "客户绑定"]),
      layer("compute-design", "算力芯片/设计", 4, "故事最显性，但估值和兑现要求也最高。", ["生态", "流片", "客户"])
    ];
  }
  return [
    layer("demand", "终端需求/资本开支", 1, "先确认真实需求是否在扩张。", ["订单", "资本开支", "政策/技术变化"]),
    layer("subsystems", "模块与子系统", 2, "需求会先传导到关键模块。", ["客户验证", "交付能力", "毛利率"]),
    layer("components", "关键零部件", 3, "零部件可能承担真实物产约束。", ["供应商数量", "良率", "扩产周期"]),
    layer("materials-equipment", "材料/设备/测试", 4, "更上游但可能更接近稀缺约束。", ["设备", "材料纯度", "测试"])
  ];
}

function layer(id: string, name: string, rank: number, scarceReason: string, constraints: string[]): SerenityLayer {
  return {
    id,
    name,
    rank,
    scarceReason,
    constraints,
    evidenceNeeds: ["公告/财报证据", "客户或订单证据", "产能或认证证据"]
  };
}

function normalizeRating(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(5, number));
}

function inferEvidenceStrength(evidence: SerenityEvidence[]): SerenityEvidenceStrength {
  if (evidence.some((item) => item.strength === "strong")) return "strong";
  if (evidence.some((item) => item.strength === "medium")) return "medium";
  if (evidence.some((item) => item.strength === "weak")) return "weak";
  return "needs_checking";
}

function buildMissingProof(input: SerenityCandidateInput, evidenceStrength: SerenityEvidenceStrength) {
  return normalizeMissingProof([
    ...(input.missingProof ?? []),
    ...(!input.chainPosition ? ["产业链位置需要进一步确认"] : []),
    ...(!input.constrains ? ["尚未说明具体卡住的环节"] : []),
    ...(evidenceStrength === "needs_checking" ? ["缺少公告、财报、客户、产能或行业来源证据"] : []),
    ...(evidenceStrength === "weak" ? ["现有证据偏弱，需要用强/中证据交叉验证"] : []),
    ...(!input.weakenConditions?.length ? ["缺少反证条件"] : [])
  ]);
}

function normalizeMissingProof(items: string[]) {
  const buckets = new Map<string, string>();
  for (const raw of items.map((item) => item.trim()).filter(Boolean)) {
    const key = missingProofBucket(raw);
    if (!buckets.has(key)) buckets.set(key, missingProofLabel(key, raw));
  }
  return Array.from(buckets.values()).slice(0, 8);
}

function missingProofBucket(text: string) {
  if (/主营|业务|产品|F10|产业链位置|匹配/.test(text)) return "business";
  if (/具体卡住|环节|瓶颈/.test(text)) return "constraint";
  if (/公告|财报|占比|收入/.test(text)) return "filing";
  if (/客户|订单/.test(text)) return "customer";
  if (/产能|认证|项目|良率|扩产/.test(text)) return "capacity";
  if (/弱|交叉验证|来源证据|行业来源/.test(text)) return "evidence_strength";
  if (/反证|失效|削弱/.test(text)) return "falsification";
  return text;
}

function missingProofLabel(key: string, fallback: string) {
  const labels: Record<string, string> = {
    business: "主营/产品/产业链位置匹配证据",
    constraint: "具体卡住环节和瓶颈机制说明",
    filing: "公告或财报中相关业务收入、占比或产品证据",
    customer: "客户、订单或导入进度证据",
    capacity: "产能、认证、良率或扩产约束证据",
    evidence_strength: "强/中证据交叉验证",
    falsification: "反证条件或削弱条件"
  };
  return labels[key] ?? fallback;
}

function inferPriority(
  score: number,
  evidenceStrength: SerenityEvidenceStrength,
  coverage: SerenityEvidenceCoverage,
  missingProof: string[]
): SerenityPriority {
  const hasFreshHardEvidence = coverage.verifiedHardEvidenceCount > 0 && coverage.freshnessLevel !== "stale" && coverage.freshnessLevel !== "unknown";
  if (score >= 82 && hasFreshHardEvidence && evidenceStrength === "strong" && missingProof.length <= 1) return "top";
  if (score >= 68 && hasFreshHardEvidence && evidenceStrength !== "weak" && evidenceStrength !== "needs_checking") return "high";
  if (score >= 50) return "watch";
  return "low";
}

function verdictText(priority: SerenityPriority, evidenceStrength: SerenityEvidenceStrength) {
  const evidence = evidenceStrength === "strong" ? "证据强" : evidenceStrength === "medium" ? "证据中等" : evidenceStrength === "weak" ? "证据偏弱" : "待核验";
  if (priority === "top") return `核心瓶颈候选，${evidence}，值得优先深化。`;
  if (priority === "high") return `高优先级研究候选，${evidence}，需要继续补关键证明。`;
  if (priority === "watch") return `观察/待验证线索，${evidence}，暂不应直接进入交易判断。`;
  return `低优先级或早期线索，${evidence}，先补事实再讨论。`;
}

function round(value: number) {
  return Number(value.toFixed(2));
}
