import type {
  SelectionAgentReport,
  SelectionAgentStatus,
  SelectionFinalReview,
  SelectionRunResult
} from "@/lib/selection/types";

const VALID_AGENT_IDS = new Set(["fund_flow", "sector", "fundamental", "technical", "risk"]);
const VALID_AGENT_NAMES: Record<string, string> = {
  fund_flow: "资金流向分析师",
  sector: "行业板块分析师",
  fundamental: "财务基本面分析师",
  technical: "技术形态分析师",
  risk: "量化风控分析师"
};

export function parseSelectionAgentOutput(text: string, ruleResult: SelectionRunResult): {
  ok: boolean;
  agentReports: SelectionAgentReport[];
  finalReview: SelectionFinalReview | null;
  errors: string[];
} {
  let parsed: any = null;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch (error) {
    return {
      ok: false,
      agentReports: [],
      finalReview: null,
      errors: [`Agent 输出不是合法 JSON：${error instanceof Error ? error.message : String(error)}`]
    };
  }

  const errors: string[] = [];
  const allowedCodes = new Set([...ruleResult.picks, ...ruleResult.rejected].map((pick) => pick.code));
  const allowedFinalCodes = new Set(ruleResult.picks.map((pick) => pick.code));
  const allowedRefs = new Set([...ruleResult.picks, ...ruleResult.rejected].flatMap((pick) => pick.evidenceRefs));

  const agentReports = normalizeAgentReports(parsed?.agentReports, allowedCodes, allowedRefs, errors);
  const finalReview = normalizeFinalReview(parsed?.finalReview, allowedCodes, allowedFinalCodes, allowedRefs, errors);
  for (const agentId of VALID_AGENT_IDS) {
    if (!agentReports.some((report) => report.agentId === agentId)) {
      errors.push(`缺少 ${VALID_AGENT_NAMES[agentId]} 输出。`);
    }
  }
  return {
    ok: errors.length === 0,
    agentReports,
    finalReview,
    errors
  };
}

export function disabledSelectionAgentResult(reason: string): {
  agentReports: SelectionAgentReport[];
  finalReview: SelectionFinalReview;
  errors: string[];
} {
  const agentReports = Array.from(VALID_AGENT_IDS).map((agentId) => ({
    agentId: agentId as SelectionAgentReport["agentId"],
    agentName: VALID_AGENT_NAMES[agentId],
    status: "disabled" as SelectionAgentStatus,
    summary: reason,
    topPicks: [],
    avoidStocks: [],
    missingData: [reason],
    stockOpinions: [],
    evidenceRefs: []
  }));
  return {
    agentReports,
    finalReview: {
      status: "disabled",
      summary: reason,
      strategySuitability: "模型未运行，当前仅保留规则选股结果。",
      finalPicks: [],
      portfolioRisk: "未生成模型组合风险复核。",
      noTradeConditions: [reason],
      evidenceRefs: []
    },
    errors: [reason]
  };
}

function normalizeAgentReports(raw: unknown, allowedCodes: Set<string>, allowedRefs: Set<string>, errors: string[]) {
  if (!Array.isArray(raw)) {
    errors.push("agentReports 必须是数组。");
    return [];
  }
  const seen = new Set<string>();
  return raw.slice(0, 8).flatMap((item): SelectionAgentReport[] => {
    const agentId = stringValue((item as any)?.agentId);
    if (!VALID_AGENT_IDS.has(agentId)) {
      errors.push(`未知 Agent：${agentId || "缺失"}`);
      return [];
    }
    if (seen.has(agentId)) errors.push(`Agent 重复输出：${agentId}`);
    seen.add(agentId);
    const refs = filterEvidenceRefs((item as any)?.evidenceRefs, allowedRefs);
    const missingData = stringArray((item as any)?.missingData, 8);
    if (!refs.length && allowedRefs.size > 0) {
      missingData.unshift(`${VALID_AGENT_NAMES[agentId]} 顶层证据引用缺失，已降为低置信质量提示；不作为整体拒绝原因。`);
    }
    return [{
      agentId: agentId as SelectionAgentReport["agentId"],
      agentName: stringValue((item as any)?.agentName) || VALID_AGENT_NAMES[agentId],
      status: normalizeStatus((item as any)?.status),
      summary: stringValue((item as any)?.summary) || "未给出摘要。",
      topPicks: filterCodes((item as any)?.topPicks, allowedCodes),
      avoidStocks: filterCodes((item as any)?.avoidStocks, allowedCodes),
      missingData: Array.from(new Set(missingData)).slice(0, 8),
      stockOpinions: normalizeStockOpinions((item as any)?.stockOpinions, allowedCodes, allowedRefs, errors),
      evidenceRefs: refs,
      raw: item
    }];
  });
}

function normalizeStockOpinions(raw: unknown, allowedCodes: Set<string>, allowedRefs: Set<string>, errors: string[]) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).flatMap((item): SelectionAgentReport["stockOpinions"] => {
    const code = stringValue((item as any)?.code);
    if (!allowedCodes.has(code)) {
      if (code) errors.push(`Agent 输出了候选池外股票：${code}`);
      return [];
    }
    const refs = filterEvidenceRefs((item as any)?.evidenceRefs, allowedRefs);
    const riskFlags = stringArray((item as any)?.riskFlags, 6);
    if (!refs.length && allowedRefs.size > 0) {
      riskFlags.unshift("该条个股观点缺少有效证据引用，仅作低置信补充。");
    }
    return [{
      code,
      name: stringValue((item as any)?.name),
      recommendation: normalizeOpinion((item as any)?.recommendation),
      confidence: normalizeConfidence((item as any)?.confidence),
      logic: stringValue((item as any)?.logic) || "未给出逻辑。",
      riskFlags: Array.from(new Set(riskFlags)).slice(0, 6),
      evidenceRefs: refs
    }];
  });
}

function normalizeFinalReview(
  raw: unknown,
  allowedCodes: Set<string>,
  allowedFinalCodes: Set<string>,
  allowedRefs: Set<string>,
  errors: string[]
): SelectionFinalReview | null {
  if (!raw || typeof raw !== "object") {
    errors.push("finalReview 缺失。");
    return null;
  }
  const finalPicksRaw = Array.isArray((raw as any).finalPicks) ? (raw as any).finalPicks : [];
  const finalPicks = finalPicksRaw.slice(0, 20).flatMap((item: any): SelectionFinalReview["finalPicks"] => {
    const code = stringValue(item?.code);
    if (!allowedCodes.has(code)) {
      if (code) errors.push(`总评审输出了候选池外股票：${code}`);
      return [];
    }
    if (!allowedFinalCodes.has(code) && normalizeFinalRecommendation(item?.recommendation) !== "avoid") {
      errors.push(`总评审不能把规则未精选股票 ${code} 提升为非回避建议。`);
      return [];
    }
    const refs = filterEvidenceRefs(item?.evidenceRefs, allowedRefs);
    if (!refs.length && allowedRefs.size > 0) errors.push(`总评审股票 ${code} 缺少有效 evidenceRefs。`);
    return [{
      code,
      name: stringValue(item?.name),
      tier: normalizeTier(item?.tier),
      recommendation: normalizeFinalRecommendation(item?.recommendation),
      confidence: normalizeConfidence(item?.confidence),
      logic: stringValue(item?.logic) || "未给出综合逻辑。",
      risk: stringValue(item?.risk) || "需继续观察风险条件。",
      suggestedPositionPct: normalizePosition(item?.suggestedPositionPct, normalizeFinalRecommendation(item?.recommendation)),
      watchConditions: stringArray(item?.watchConditions, 6),
      invalidConditions: stringArray(item?.invalidConditions, 6),
      evidenceRefs: refs
    }];
  });
  const refs = filterEvidenceRefs((raw as any).evidenceRefs, allowedRefs);
  if (!refs.length && allowedRefs.size > 0) errors.push("总评审缺少有效 evidenceRefs。");
  return {
    status: normalizeStatus((raw as any).status),
    summary: stringValue((raw as any).summary) || "未给出总评审摘要。",
    strategySuitability: stringValue((raw as any).strategySuitability) || "未说明当前策略适用性。",
    finalPicks,
    portfolioRisk: stringValue((raw as any).portfolioRisk) || "未给出组合风险。",
    noTradeConditions: stringArray((raw as any).noTradeConditions, 8),
    evidenceRefs: refs
  };
}

function stripCodeFence(text: string) {
  return text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown, limit: number) {
  return Array.isArray(value)
    ? value.map(stringValue).filter(Boolean).slice(0, limit)
    : [];
}

function filterCodes(value: unknown, allowedCodes: Set<string>) {
  return stringArray(value, 20).filter((code) => allowedCodes.has(code));
}

function filterEvidenceRefs(value: unknown, allowedRefs: Set<string>) {
  const refs = stringArray(value, 30);
  if (allowedRefs.size === 0) return refs;
  return refs.filter((ref) => allowedRefs.has(ref));
}

function normalizeStatus(value: unknown): SelectionAgentStatus {
  return value === "disabled" || value === "rejected" || value === "failed" ? value : "success";
}

function normalizeOpinion(value: unknown): SelectionAgentReport["stockOpinions"][number]["recommendation"] {
  return value === "support" || value === "reject" ? value : "neutral";
}

function normalizeConfidence(value: unknown) {
  return value === "high" || value === "low" ? value : "medium";
}

function normalizeTier(value: unknown) {
  return value === "S" || value === "A" || value === "B" || value === "C" || value === "D" ? value : "C";
}

function normalizeFinalRecommendation(value: unknown): SelectionFinalReview["finalPicks"][number]["recommendation"] {
  return value === "priority" || value === "watch" || value === "avoid" ? value : "wait";
}

function normalizePosition(value: unknown, recommendation: SelectionFinalReview["finalPicks"][number]["recommendation"]) {
  if (recommendation === "avoid") return 0;
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(10, Math.round(number * 10) / 10));
}
