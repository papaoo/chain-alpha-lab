import { uniqueText } from "@/lib/selection/scoring-utils";
import type { SelectionPick } from "@/lib/selection/types";
import type { StockCandidate } from "@/lib/types";

export type SelectionBlockerSeverity = "hard" | "major" | "soft" | "info";

export interface SelectionBlockerAssessment {
  text: string;
  severity: SelectionBlockerSeverity;
}

export interface BlockerPenaltyOptions {
  maxPenalty?: number;
  hardPenalty?: number;
  majorPenalty?: number;
  softPenalty?: number;
  infoPenalty?: number;
  hardPatterns?: RegExp[];
  softPatterns?: RegExp[];
}

export interface SelectionTradabilityPlan {
  isNextSessionOnly: boolean;
  scoreCap?: number;
  reason?: string;
  blocker?: string;
}

const DEFAULT_HARD_PATTERNS = [
  /退潮/,
  /持续流出/,
  /资金状态流出/,
  /下降趋势/,
  /主力资金没有形成正向吸筹证据/,
  /核心数据完整性/,
  /缺少可识别板块归属/,
  /缺少板块阶段证据/,
  /主营或成分股证据.*不匹配/,
  /低波动.*金融资产/,
  /低波动资产/
];

const DEFAULT_SOFT_PATTERNS = [
  /涨停不可达/,
  /接近涨停/,
  /次日竞价观察/,
  /次日承接观察/,
  /新闻\/政策.*尚未接入/,
  /外部验证\/来源留痕不足/,
  /来源留痕不足/,
  /股东户数变化缺失/,
  /只能低权重/,
  /低置信/,
  /观察/
];

const DEFAULT_MAJOR_PATTERNS = [
  /缺少/,
  /不匹配/,
  /超过.*上限/,
  /远离 MA20/,
  /低于最低流动性/,
  /不可达/,
  /高位/,
  /分歧/,
  /扩散不足/,
  /偏弱/
];

export function normalizeSelectionBlockers(blockers: string[], limit = 10) {
  return uniqueText(blockers.map((item) => item.trim()), limit);
}

export function assessSelectionBlockers(blockers: string[], options: BlockerPenaltyOptions = {}): SelectionBlockerAssessment[] {
  const uniqueBlockers = normalizeSelectionBlockers(blockers, blockers.length);
  return uniqueBlockers.map((text) => ({
    text,
    severity: classifySelectionBlocker(text, options)
  }));
}

export function classifySelectionBlocker(text: string, options: BlockerPenaltyOptions = {}): SelectionBlockerSeverity {
  if (options.hardPatterns?.some((pattern) => pattern.test(text))) return "hard";
  if (options.softPatterns?.some((pattern) => pattern.test(text))) return "soft";
  if (DEFAULT_SOFT_PATTERNS.some((pattern) => pattern.test(text))) return "soft";
  if (DEFAULT_HARD_PATTERNS.some((pattern) => pattern.test(text))) return "hard";
  if (DEFAULT_MAJOR_PATTERNS.some((pattern) => pattern.test(text))) return "major";
  return "info";
}

export function calculateSelectionBlockerPenalty(blockers: string[], options: BlockerPenaltyOptions = {}) {
  const maxPenalty = options.maxPenalty ?? 55;
  const hardPenalty = options.hardPenalty ?? 14;
  const majorPenalty = options.majorPenalty ?? 8;
  const softPenalty = options.softPenalty ?? 3;
  const infoPenalty = options.infoPenalty ?? 1;
  const assessments = assessSelectionBlockers(blockers, options);
  const penalty = assessments.reduce((sum, item) => {
    if (item.severity === "hard") return sum + hardPenalty;
    if (item.severity === "major") return sum + majorPenalty;
    if (item.severity === "soft") return sum + softPenalty;
    return sum + infoPenalty;
  }, 0);
  return Math.min(maxPenalty, penalty);
}

export function countSelectionBlockers(blockers: string[], severity: SelectionBlockerSeverity, options: BlockerPenaltyOptions = {}) {
  return assessSelectionBlockers(blockers, options).filter((item) => item.severity === severity).length;
}

export function hasSelectionHardBlock(blockers: string[], hardPatterns: RegExp[], options: BlockerPenaltyOptions = {}) {
  const assessments = assessSelectionBlockers(blockers, { ...options, hardPatterns });
  return assessments.some((item) => item.severity === "hard" || hardPatterns.some((pattern) => pattern.test(item.text)));
}

export function buildTradabilityPlan(candidate: StockCandidate): SelectionTradabilityPlan {
  const tradability = candidate.tradability;
  if (tradability?.status === "涨停不可达") {
    const preconditions = tradability.nextSessionPlan?.preconditions.slice(0, 3).join("；");
    return {
      isNextSessionOnly: true,
      scoreCap: 72,
      blocker: "当前涨停不可达，当日不追，只保留次日竞价承接观察。",
      reason: preconditions ? `次日竞价观察前提：${preconditions}。` : "次日只看竞价承接、开板回封和板块强度，不按当日买入处理。"
    };
  }
  if (tradability?.status === "接近涨停") {
    const preconditions = tradability.nextSessionPlan?.preconditions.slice(0, 3).join("；");
    return {
      isNextSessionOnly: true,
      scoreCap: 70,
      blocker: "价格接近涨停，当日不追，只保留次日承接或回踩确认。",
      reason: preconditions ? `次日承接观察前提：${preconditions}。` : "接近涨停只记录强度，不给当日追价信号。"
    };
  }
  return { isNextSessionOnly: false };
}

export function decideActionByScore(input: {
  score: number;
  blockers: string[];
  hardPatterns: RegExp[];
  nextSessionOnly?: boolean;
  hardBlockerThreshold?: number;
  focusScore?: number;
  trackScore?: number;
  minScore?: number;
  options?: BlockerPenaltyOptions;
}): SelectionPick["action"] {
  const {
    score,
    blockers,
    hardPatterns,
    nextSessionOnly = false,
    hardBlockerThreshold = 3,
    focusScore = 78,
    trackScore = 62,
    minScore = 45,
    options
  } = input;
  if (hasSelectionHardBlock(blockers, hardPatterns, options)) return "剔除";
  const hardCount = countSelectionBlockers(blockers, "hard", options);
  if (hardCount >= hardBlockerThreshold || score < minScore) return "剔除";
  if (nextSessionOnly) return "条件等待";
  if (score >= focusScore) return "重点观察";
  if (score >= trackScore) return "跟踪观察";
  return "条件等待";
}
