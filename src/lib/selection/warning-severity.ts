import type { SelectionRunSummary } from "@/lib/selection/types";

export type SelectionWarningCategory =
  | "freshness"
  | "data_gap"
  | "source_fallback"
  | "legacy_compat"
  | "model"
  | "system"
  | "other";

export type SelectionWarningSeverity = "info" | "warning" | "risk";

export type SelectionWarningSummary = {
  total: number;
  riskCount: number;
  warningCount: number;
  infoCount: number;
  categories: Record<SelectionWarningCategory, number>;
  primaryCategory: SelectionWarningCategory | null;
  primarySeverity: SelectionWarningSeverity;
  primaryWarning?: string;
  label: string;
  summary: string;
};

const WARNING_CATEGORIES: SelectionWarningCategory[] = [
  "freshness",
  "data_gap",
  "source_fallback",
  "legacy_compat",
  "model",
  "system",
  "other"
];

export function buildSelectionWarningSummary(
  warnings: string[],
  context: Pick<SelectionRunSummary, "freshnessStatus" | "topPickPreview"> | null = null
): SelectionWarningSummary {
  const categories = Object.fromEntries(WARNING_CATEGORIES.map((category) => [category, 0])) as Record<SelectionWarningCategory, number>;
  let riskCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  let primaryWarning: string | undefined;
  let primaryWarningRank = Number.POSITIVE_INFINITY;

  for (const warning of warnings) {
    const classified = classifySelectionWarningWithContext(warning, context);
    const rank = warningRank(warning, classified);
    if (rank < primaryWarningRank) {
      primaryWarningRank = rank;
      primaryWarning = warning;
    }
    categories[classified.category] += 1;
    if (classified.severity === "risk") riskCount += 1;
    else if (classified.severity === "warning") warningCount += 1;
    else infoCount += 1;
  }

  const legacyUnknownCount = context?.topPickPreview.filter((pick) => !pick.runtimeSnapshot?.actionability).length ?? 0;
  if (legacyUnknownCount > 0) {
    categories.legacy_compat += legacyUnknownCount;
    infoCount += legacyUnknownCount;
  }

  const total = riskCount + warningCount + infoCount;
  const primarySeverity: SelectionWarningSeverity = riskCount > 0 ? "risk" : warningCount > 0 ? "warning" : total > 0 ? "info" : "info";
  const primaryCategory = primaryCategoryBySeverity(categories, primarySeverity);

  return {
    total,
    riskCount,
    warningCount,
    infoCount,
    categories,
    primaryCategory,
    primarySeverity,
    primaryWarning,
    label: buildWarningLabel(primarySeverity, primaryCategory, total),
    summary: buildWarningSummary({ total, riskCount, warningCount, infoCount, categories, primaryWarning, freshnessStatus: context?.freshnessStatus })
  };
}

export function classifySelectionWarning(warning: string): { category: SelectionWarningCategory; severity: SelectionWarningSeverity } {
  const text = warning.toLowerCase();
  if (isRoutineSelectionProcessNote(text)) return { category: "other", severity: "info" };
  if (/补不到|未取得|缺失|缺口|missing|not found/.test(text) && /仍会|可能|若|如果|会保留|不等于|不替代/.test(text)) {
    return { category: "other", severity: "info" };
  }
  if (isReferenceOnlyFreshnessWarning(text)) return { category: "freshness", severity: "warning" };
  if (isHardFreshnessRisk(text)) return { category: "freshness", severity: "risk" };
  if (isSoftFreshnessWarning(text)) return { category: "freshness", severity: "warning" };
  if (/缺失|缺口|missing|not found|未取得|补不到|为空|无有效/.test(text)) return { category: "data_gap", severity: "risk" };
  if (/fallback|降级|备用|补源|接口请求失败|fetch failed|timeout|超时|解析错误/.test(text)) return { category: "source_fallback", severity: "warning" };
  if (/历史|旧版|兼容|未分级|缺少行动分级/.test(text)) return { category: "legacy_compat", severity: "info" };
  if (/模型|deepseek|agent|llm|校验|json/.test(text)) return { category: "model", severity: "warning" };
  if (/后台|任务|中断|失败|异常|error|http\s*\d+/.test(text)) return { category: "system", severity: "risk" };
  return { category: "other", severity: "warning" };
}

function classifySelectionWarningWithContext(
  warning: string,
  context: Pick<SelectionRunSummary, "freshnessStatus" | "topPickPreview"> | null
): { category: SelectionWarningCategory; severity: SelectionWarningSeverity } {
  const classified = classifySelectionWarning(warning);
  if (classified.category !== "freshness" || classified.severity !== "risk") return classified;
  if (!isLongAgeFreshnessWarning(warning)) return classified;
  if (context?.freshnessStatus !== "current") return classified;
  if (!hasReferenceOnlyResearchSnapshot(context.topPickPreview)) return classified;
  return { category: "freshness", severity: "warning" };
}

function isReferenceOnlyFreshnessWarning(text: string) {
  const hasReferenceOnlySignal =
    /仅可参考|研究可参考|研究参考|研究排队|只适合观察|只能用于研究|参考快照|上一交易日|盘前|夜间|非交易日|休市|集合竞价|午间|收盘后|不应用作盘中确认|不应直接触发|不适合直接触发|不能作为当前行动依据|reference_only/.test(text);
  const hasFreshnessContext =
    /快照|报价|行情|运行|交易日|盘中|刷新|新鲜|时效|连续竞价|quote|snapshot|actionability/.test(text);
  return hasReferenceOnlySignal && hasFreshnessContext && !isHardFreshnessRisk(text);
}

function isHardFreshnessRisk(text: string) {
  return /已过期|过期|4\s*小时|stale|重新运行今日分析|重新运行.*分析|来源报告.*历史快照|报告.*历史快照|候选股动作.*历史快照/.test(text);
}

function isSoftFreshnessWarning(text: string) {
  return /新鲜度|时效|交易日|距离.*运行|超过\s*\d+\s*分钟|降级解读|真实报价时间|k线交易日落后/.test(text);
}

function isRoutineSelectionProcessNote(text: string) {
  if (/候选池预筛|策略自适应预排序|预排序只改变入池顺序|不替代最终评分|按股票代码去重|补充公司概况|补充财务层数据|运行前刷新候选池/.test(text)) {
    return !/失败|异常|缺失|未取得|为空|无有效|fetch failed|timeout|超时/.test(text);
  }
  return false;
}

function isLongAgeFreshnessWarning(text: string) {
  return /超过\s*4\s*小时|距离本次运行已超过|older than\s*4\s*hours/i.test(text);
}

function hasReferenceOnlyResearchSnapshot(topPickPreview: SelectionRunSummary["topPickPreview"] | undefined) {
  if (!topPickPreview?.length) return false;
  return topPickPreview.some((pick) => pick.runtimeSnapshot?.actionability?.level === "reference_only");
}

function primaryCategoryBySeverity(
  categories: Record<SelectionWarningCategory, number>,
  severity: SelectionWarningSeverity
): SelectionWarningCategory | null {
  const priority: SelectionWarningCategory[] =
    severity === "risk"
      ? ["freshness", "data_gap", "system", "model", "source_fallback", "other", "legacy_compat"]
      : severity === "warning"
        ? ["source_fallback", "model", "other", "freshness", "data_gap", "system", "legacy_compat"]
        : ["legacy_compat", "other", "source_fallback", "model", "freshness", "data_gap", "system"];
  return priority.find((category) => categories[category] > 0) ?? null;
}

function buildWarningLabel(severity: SelectionWarningSeverity, category: SelectionWarningCategory | null, total: number) {
  if (!total) return "无警告";
  const prefix = severity === "risk" ? "需复核" : severity === "warning" ? "有降级" : "提示";
  const categoryLabel = category ? categoryName(category) : "数据状态";
  return `${prefix} · ${categoryLabel}`;
}

function buildWarningSummary(input: {
  total: number;
  riskCount: number;
  warningCount: number;
  infoCount: number;
  categories: Record<SelectionWarningCategory, number>;
  primaryWarning?: string;
  freshnessStatus?: SelectionRunSummary["freshnessStatus"];
}) {
  if (!input.total) return "本次运行没有记录数据源或兼容性警告。";
  const parts: string[] = [];
  if (input.riskCount) parts.push(`${input.riskCount} 条高风险`);
  if (input.warningCount) parts.push(`${input.warningCount} 条降级/待复核`);
  if (input.infoCount) parts.push(`${input.infoCount} 条历史兼容或说明`);
  const categoryParts = WARNING_CATEGORIES
    .filter((category) => input.categories[category] > 0)
    .map((category) => `${categoryName(category)} ${input.categories[category]}`);
  const freshness = input.freshnessStatus === "stale" ? "来源报告已过期，不能直接当成盘中结论。" : "";
  const primary = input.primaryWarning ? `主触发：${input.primaryWarning}` : "";
  return [`共 ${input.total} 条提示：${parts.join("，")}。`, categoryParts.length ? `类别：${categoryParts.join("，")}。` : "", primary, freshness].filter(Boolean).join("");
}

function categoryName(category: SelectionWarningCategory) {
  const labels: Record<SelectionWarningCategory, string> = {
    freshness: "新鲜度",
    data_gap: "数据缺口",
    source_fallback: "数据源降级",
    legacy_compat: "历史兼容",
    model: "模型输出",
    system: "系统任务",
    other: "其他"
  };
  return labels[category];
}

function warningRank(
  warning: string,
  classified: { category: SelectionWarningCategory; severity: SelectionWarningSeverity }
) {
  const text = warning.toLowerCase();
  let rank = severityRank(classified.severity) * 100;
  if (/失败|异常|缺失|缺口|未取得|为空|无有效|fetch failed|timeout|超时/.test(text)) rank += 0;
  else if (/数据状态为\s*partial|partial|降级解读|补源|备用/.test(text)) rank += 8;
  else if (/超过\s*4\s*小时|距离本次运行已超过/.test(text)) rank += 18;
  else if (classified.category === "model") rank += 25;
  else if (classified.category === "source_fallback") rank += 30;
  else if (classified.category === "freshness") rank += 35;
  else rank += 50;
  return rank;
}

function severityRank(severity: SelectionWarningSeverity) {
  if (severity === "risk") return 0;
  if (severity === "warning") return 1;
  return 2;
}
