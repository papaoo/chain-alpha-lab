import type {
  SerenityCandidateInput,
  SerenityCandidateScore,
  SerenityEvidence,
  SerenityEvidenceStrength,
  SerenityFactorKey,
  SerenityLayer,
  SerenityMarket,
  SerenityPenaltyKey,
  SerenityPriority
} from "@/lib/serenity/types";

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
  const score = Math.max(0, Math.min(100, round(rawFactorPoints - penaltyPoints - evidencePenalty)));
  const missingProof = buildMissingProof(input, evidenceStrength);
  const priority = inferPriority(score, evidenceStrength, missingProof);

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
    missingProof,
    weakenConditions: (input.weakenConditions ?? []).filter(Boolean),
    verdict: verdictText(priority, evidenceStrength)
  };
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
  const missing: string[] = [];
  if (!input.chainPosition) missing.push("产业链位置需要进一步确认");
  if (!input.constrains) missing.push("尚未说明具体卡住的环节");
  if (evidenceStrength === "needs_checking") missing.push("缺少公告、财报、客户、产能或行业来源证据");
  if (evidenceStrength === "weak") missing.push("现有证据偏弱，需要用强/中证据交叉验证");
  if (!input.weakenConditions?.length) missing.push("缺少反证条件");
  return missing;
}

function inferPriority(score: number, evidenceStrength: SerenityEvidenceStrength, missingProof: string[]): SerenityPriority {
  if (score >= 82 && evidenceStrength !== "weak" && evidenceStrength !== "needs_checking" && missingProof.length <= 1) return "top";
  if (score >= 68 && evidenceStrength !== "needs_checking") return "high";
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
