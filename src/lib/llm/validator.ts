import type { DeepSeekReport, FactPackage, ModelAuditFeedback, StockCandidate } from "../types";
import { normalizeDeepSeekOutput } from "./normalize";
import { deepSeekReportSchema, degradedActionValues, modelAuditFeedbackSchema } from "./schema";

export interface LlmValidationResult {
  ok: boolean;
  report: DeepSeekReport | null;
  errors: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const FORBIDDEN_TERMS = ["必涨", "稳赚", "保证收益", "确定性机会", "无风险", "稳赚不赔", "保本", "包赚"];
const EXTERNAL_TOOL_CLAIMS = ["我调用了", "已调用", "查询了实时", "访问了外部", "联网查询", "实时数据接口", "westock-data", "CLI"];
const LONG_TERM_TERMS = ["长期持有", "长线持有", "长期加仓", "长线加仓", "长期投资", "长线投资", "中长期持有", "中长期投资"];
const CORE_COMPLETENESS_KEYS: Array<keyof StockCandidate["dataCompleteness"]> = ["hasKlineData", "hasTechnicalData", "hasFundFlowData", "hasSectorData"];
const FALSE_MISSING_CLAIMS = [
  "大面积缺失",
  "核心数据缺失",
  "核心数据大面积缺失",
  "涨跌幅、技术指标、资金流等核心数据缺失",
  "技术指标缺失",
  "资金流数据均为空",
  "均为空值",
  "等待数据补全",
  "无法制定有效买入条件"
];
const AUDIT_FORBIDDEN_TERMS = ["建议买入", "推荐买入", "可以重仓", "提高仓位上限", "放松风控", "突破仓位", "忽略规则"];
const FINANCIAL_IMPROVEMENT_CLAIMS = ["财务改善", "业绩改善", "基本面改善", "财务趋势改善", "财务支撑较强", "基本面支撑较强"];
const UNSUPPORTED_FUND_WINDOW_CLAIMS = ["连续2日", "连续两日", "连续3日", "连续三日", "连续4日", "连续四日"];

export function parseJsonReport(text: string): DeepSeekReport | null {
  const result = parseJsonOnly(text);
  if (!result.ok) return null;
  const schemaResult = deepSeekReportSchema.safeParse(result.value);
  return schemaResult.success ? (schemaResult.data as DeepSeekReport) : null;
}

export function parseAndValidateDeepSeekOutput(rawOutput: string, factPackage: FactPackage): LlmValidationResult {
  const parsed = parseJsonOnly(rawOutput);
  if (parsed.ok === false) return { ok: false, report: null, errors: parsed.errors };

  const normalized = normalizeDeepSeekOutput(parsed.value, factPackage);
  const schemaResult = deepSeekReportSchema.safeParse(normalized.value);
  if (!schemaResult.success) {
    return {
      ok: false,
      report: null,
      errors: schemaResult.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`),
    };
  }

  const report = schemaResult.data as DeepSeekReport;
  const errors = validateDeepSeekReport(report, factPackage).errors;
  return { ok: errors.length === 0, report, errors };
}

export function parseAndValidateModelAuditOutput(rawOutput: string, factPackage: FactPackage): { ok: boolean; feedback: ModelAuditFeedback | null; errors: string[] } {
  const parsed = parseJsonOnly(rawOutput);
  if (parsed.ok === false) return { ok: false, feedback: null, errors: parsed.errors };

  const schemaResult = modelAuditFeedbackSchema.safeParse(parsed.value);
  if (!schemaResult.success) {
    return {
      ok: false,
      feedback: null,
      errors: schemaResult.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`),
    };
  }
  const feedback = schemaResult.data as ModelAuditFeedback;
  const evidenceIds = buildEvidenceIdSet(factPackage);
  const errors: string[] = [];
  const fullText = JSON.stringify(feedback);
  for (const term of FORBIDDEN_TERMS) {
    if (fullText.includes(term)) errors.push(`forbidden term appears in audit feedback: ${term}`);
  }
  for (const term of AUDIT_FORBIDDEN_TERMS) {
    if (fullText.includes(term)) errors.push(`audit feedback crosses system boundary: ${term}`);
  }
  feedback.items.forEach((item, index) => validateEvidenceRefs(`items.${index}`, item.evidenceRefs, evidenceIds, errors));
  feedback.doNotChange.forEach((item, index) => validateEvidenceRefs(`doNotChange.${index}`, item.evidenceRefs, evidenceIds, errors));
  return { ok: errors.length === 0, feedback: errors.length ? null : feedback, errors };
}

export function validateDeepSeekReport(report: DeepSeekReport, factPackage: FactPackage): ValidationResult {
  const errors: string[] = [];
  const candidateByCode = new Map(factPackage.candidates.map((candidate) => [normalizeCode(candidate.code), candidate]));
  const allowedCodes = new Set(factPackage.constraints.allowedCodes.map(normalizeCode));
  const evidenceIds = buildEvidenceIdSet(factPackage);
  const fullText = JSON.stringify(report);

  for (const term of FORBIDDEN_TERMS) {
    if (fullText.includes(term)) errors.push(`forbidden term appears in report: ${term}`);
  }
  for (const claim of EXTERNAL_TOOL_CLAIMS) {
    if (fullText.includes(claim)) errors.push(`report claims tool or external data access: ${claim}`);
  }
  validateFalseMissingClaims(report, factPackage, fullText, errors);
  validateUnsupportedFundWindowClaims(fullText, errors);

  validateEvidenceRefs("marketJudgement", report.marketJudgement.evidenceRefs, evidenceIds, errors);
  report.mainLines.forEach((line, index) => validateEvidenceRefs(`mainLines.${index}`, line.evidenceRefs, evidenceIds, errors));
  report.notifications.forEach((notification, index) => validateEvidenceRefs(`notifications.${index}`, notification.evidenceRefs, evidenceIds, errors));
  validateStructuredInsightEvidence(report, evidenceIds, errors);
  validateIntradayWatchlist(report, candidateByCode, allowedCodes, evidenceIds, errors);

  for (const [index, plan] of report.stockPlans.entries()) {
    const code = normalizeCode(plan.code);
    const candidate = candidateByCode.get(code);
    if (!allowedCodes.has(code)) errors.push(`stockPlans.${index}.code is outside allowedCodes: ${plan.code}`);
    if (!candidate) errors.push(`stockPlans.${index}.code is not in FactPackage candidates: ${plan.code}`);
    validateEvidenceRefs(`stockPlans.${index}`, plan.evidenceRefs, evidenceIds, errors);
    validatePositionSuggestion(`stockPlans.${index}.positionSuggestion`, plan.positionSuggestion, factPackage.constraints.maxSingleStockPositionPct, errors);

    if (!candidate) continue;
    validateCandidatePositionLimit(`stockPlans.${index}.positionSuggestion`, plan.positionSuggestion, candidate, errors);
    if (plan.name !== candidate.name) errors.push(`stockPlans.${index}.name does not match candidate name for ${plan.code}`);
    if (candidate.dataCompleteness.level !== "complete" && plan.action === "小仓试错") {
      errors.push(`stockPlans.${index}.action must be degraded because dataCompleteness.level is ${candidate.dataCompleteness.level}`);
    }
    if (CORE_COMPLETENESS_KEYS.some((key) => candidate.dataCompleteness[key] === false) && plan.action === "小仓试错") {
      errors.push(`stockPlans.${index}.action must be degraded because core market data is missing`);
    }
    if (hasCompleteCoreData(candidate) && plan.action === "数据不足") {
      errors.push(`stockPlans.${index}.action cannot be 数据不足 because core market data is complete for ${plan.code}; use 观察/不追/回避 when the conclusion is conservative due to risk, valuation, company knowledge, mainline mismatch or buy-point quality`);
    }
    validatePlanFalseMissingClaims(index, plan, candidate, errors);
    if (!isDegradedAction(plan.action) && candidate.dataCompleteness.level !== "complete") {
      errors.push(`stockPlans.${index}.action is not allowed for incomplete data: ${plan.action}`);
    }
    validateCompanyInformationBoundary(index, plan, candidate, errors);
  }

  return { valid: errors.length === 0, errors };
}

function validateUnsupportedFundWindowClaims(fullText: string, errors: string[]) {
  for (const claim of UNSUPPORTED_FUND_WINDOW_CLAIMS) {
    const escaped = claim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nearFundTerm = new RegExp(`(${escaped})[^。；，,]{0,16}(资金|净流入|净流出|主力)|(资金|净流入|净流出|主力)[^。；，,]{0,16}(${escaped})`);
    if (nearFundTerm.test(fullText)) {
      errors.push(`report uses unsupported fund-flow window not present in FactPackage: ${claim}`);
    }
  }
}

function validateFalseMissingClaims(report: DeepSeekReport, factPackage: FactPackage, fullText: string, errors: string[]) {
  const compactCandidates = factPackage.candidates.slice(0, Math.max(1, report.stockPlans.length));
  const allCoreComplete = compactCandidates.length > 0 && compactCandidates.every(hasCompleteCoreData);
  if (!allCoreComplete) return;
  for (const claim of FALSE_MISSING_CLAIMS) {
    if (fullText.includes(claim)) {
      errors.push(`report falsely claims missing core data while FactPackage candidates are complete: ${claim}`);
    }
  }
}

function validatePlanFalseMissingClaims(index: number, plan: DeepSeekReport["stockPlans"][number], candidate: StockCandidate, errors: string[]) {
  if (!hasCompleteCoreData(candidate)) return;
  const planText = [plan.buyCondition, plan.sellCondition, plan.positionSuggestion, plan.invalidCondition, plan.doNotBuyCondition, plan.risk].join("\n");
  for (const claim of FALSE_MISSING_CLAIMS) {
    if (planText.includes(claim)) {
      errors.push(`stockPlans.${index} falsely claims missing core data for complete candidate ${plan.code}: ${claim}`);
    }
  }
}

function hasCompleteCoreData(candidate: StockCandidate) {
  return (
    candidate.dataCompleteness.level === "complete" &&
    CORE_COMPLETENESS_KEYS.every((key) => candidate.dataCompleteness[key] !== false) &&
    Boolean(candidate.technical) &&
    Boolean(candidate.fundFlow) &&
    Boolean(candidate.klineSummary)
  );
}

function parseJsonOnly(rawOutput: string): { ok: true; value: unknown } | { ok: false; errors: string[] } {
  const output = rawOutput.trim();
  const errors: string[] = [];
  if (output.length === 0) return { ok: false, errors: ["output is empty"] };
  const normalized = output.startsWith("{") && output.endsWith("}") ? output : extractSingleJsonObject(output);
  if (!normalized) return { ok: false, errors: ["output must contain a JSON object"] };
  try {
    return { ok: true, value: JSON.parse(normalized) };
  } catch (error) {
    return { ok: false, errors: [`output is not valid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`] };
  }
}

function extractSingleJsonObject(output: string): string | null {
  const start = output.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaping = false;
  for (let index = start; index < output.length; index += 1) {
    const char = output[index];
    if (escaping) {
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return output.slice(start, index + 1);
    }
  }
  return null;
}

function buildEvidenceIdSet(factPackage: FactPackage): Set<string> {
  const ids = new Set(factPackage.facts.map((fact) => fact.factId));
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
  return ids;
}

function validateStructuredInsightEvidence(report: DeepSeekReport, evidenceIds: Set<string>, errors: string[]) {
  if (report.marketStructureInsight) {
    validateEvidenceRefs("marketStructureInsight", report.marketStructureInsight.evidenceRefs, evidenceIds, errors);
  }
  report.marketStateFlipConditions?.forEach((item, index) => {
    validateEvidenceRefs(`marketStateFlipConditions.${index}`, item.evidenceRefs, evidenceIds, errors);
  });
  report.mainlineCompetition?.forEach((item, index) => {
    validateEvidenceRefs(`mainlineCompetition.${index}`, item.evidenceRefs, evidenceIds, errors);
  });
  report.mainlineStageForecasts?.forEach((item, index) => {
    validateEvidenceRefs(`mainlineStageForecasts.${index}`, item.evidenceRefs, evidenceIds, errors);
  });
  report.coreStructureHealth?.forEach((item, index) => {
    validateEvidenceRefs(`coreStructureHealth.${index}`, item.evidenceRefs, evidenceIds, errors);
  });
}

function validateIntradayWatchlist(
  report: DeepSeekReport,
  candidateByCode: Map<string, StockCandidate>,
  allowedCodes: Set<string>,
  evidenceIds: Set<string>,
  errors: string[],
) {
  report.intradayWatchlist?.forEach((item, index) => {
    const code = normalizeCode(item.code);
    const candidate = candidateByCode.get(code);
    if (!allowedCodes.has(code)) errors.push(`intradayWatchlist.${index}.code is outside allowedCodes: ${item.code}`);
    if (!candidate) errors.push(`intradayWatchlist.${index}.code is not in FactPackage candidates: ${item.code}`);
    if (candidate && item.name !== candidate.name) errors.push(`intradayWatchlist.${index}.name does not match candidate name for ${item.code}`);
    validateEvidenceRefs(`intradayWatchlist.${index}`, item.evidenceRefs, evidenceIds, errors);
  });
}

function validateEvidenceRefs(path: string, refs: string[], evidenceIds: Set<string>, errors: string[]) {
  if (refs.length === 0) {
    errors.push(`${path}.evidenceRefs must not be empty`);
    return;
  }
  for (const ref of refs) {
    if (!evidenceIds.has(ref)) errors.push(`${path}.evidenceRefs contains unknown factId: ${ref}`);
  }
}

function validatePositionSuggestion(path: string, text: string, maxSingleStockPositionPct: number, errors: string[]) {
  for (const pct of extractPercentages(text)) {
    if (pct > maxSingleStockPositionPct) errors.push(`${path} exceeds maxSingleStockPositionPct ${maxSingleStockPositionPct}: ${pct}`);
  }
}

function validateCandidatePositionLimit(path: string, text: string, candidate: StockCandidate, errors: string[]) {
  for (const pct of extractPercentages(text)) {
    if (pct > candidate.positionLimitPct) {
      errors.push(`${path} exceeds rule positionLimitPct ${candidate.positionLimitPct} for ${candidate.code}: ${pct}`);
    }
  }
}

function validateCompanyInformationBoundary(index: number, plan: DeepSeekReport["stockPlans"][number], candidate: StockCandidate, errors: string[]) {
  const companyText = [plan.companySummary, plan.buyCondition, plan.sellCondition, plan.positionSuggestion, plan.invalidCondition, plan.doNotBuyCondition, plan.risk].join("\n");
  const companyInfoInsufficient =
    !candidate.dataCompleteness.hasProfileData ||
    !candidate.dataCompleteness.hasCompanyKnowledge ||
    candidate.companyKnowledge.companyKnowledgeState !== "sufficient" ||
    !candidate.companyKnowledge.longTermLogicAllowed;

  if (companyInfoInsufficient) {
    for (const term of LONG_TERM_TERMS) {
      if (companyText.includes(term)) errors.push(`stockPlans.${index} contains long-term logic while company information is insufficient: ${term}`);
    }
  }
  if (candidate.companyKnowledge.sourceType === "inferredByModel" && plan.companySourceNote !== "基于主营业务的模型归纳" && plan.companySourceNote !== "mixed") {
    errors.push(`stockPlans.${index}.companySourceNote must disclose model inference for company knowledge`);
  }
  if (candidate.companyKnowledge.financialTrend !== "改善") {
    for (const claim of FINANCIAL_IMPROVEMENT_CLAIMS) {
      if (companyText.includes(claim)) {
        errors.push(`stockPlans.${index} contradicts companyKnowledge.financialTrend ${candidate.companyKnowledge.financialTrend}: ${claim}`);
      }
    }
  }
  if (
    candidate.companyKnowledge.themeMatch === "weak" ||
    candidate.companyKnowledge.themeMatchType === "theme_indirect" ||
    candidate.companyKnowledge.themeMatchType === "mismatch"
  ) {
    const overclaimTerms = ["主线核心受益", "核心受益股", "主线核心股", "深度受益"];
    for (const term of overclaimTerms) {
      if (companyText.includes(term)) {
        errors.push(`stockPlans.${index} overclaims weak company mainline match for ${candidate.code}: ${term}`);
      }
    }
  }
}

function extractPercentages(text: string): number[] {
  return Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*%/g), (match) => Number(match[1])).filter((value) => Number.isFinite(value));
}

function normalizeCode(code: string): string {
  return code.toLowerCase();
}

function isDegradedAction(action: DeepSeekReport["stockPlans"][number]["action"]): boolean {
  return (degradedActionValues as readonly string[]).includes(action);
}
