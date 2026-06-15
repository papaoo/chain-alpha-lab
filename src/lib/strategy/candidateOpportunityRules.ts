import type { MarketRuleResult, SectorRuleResult, StockCandidate } from "@/lib/types";
import { ZH } from "@/lib/strategy/support";

type CandidateOpportunityState = NonNullable<StockCandidate["opportunityProfile"]>["state"];

export function evaluateCandidateOpportunity(input: {
  action: StockCandidate["action"];
  strengthScore: number;
  signalScore?: number;
  dataCompleteness: StockCandidate["dataCompleteness"];
  mainlineAttribution?: StockCandidate["mainlineAttribution"];
  role: StockCandidate["role"];
  trendState: StockCandidate["trendState"];
  fundFlowState: StockCandidate["fundFlowState"];
  buyPointEvaluation?: StockCandidate["buyPointEvaluation"];
  marketState: MarketRuleResult["marketState"];
  sectorStage?: SectorRuleResult["stage"];
  tradability?: StockCandidate["tradability"];
  riskFlags: string[];
}): NonNullable<StockCandidate["opportunityProfile"]> {
  const activationConditions = buildActivationConditions(input);
  const blockingReasons = buildBlockingReasons(input);
  const nextSteps = buildNextSteps(input);
  const score = scoreOpportunity(input);
  const state = inferOpportunityState(input, score);

  return {
    state,
    label: opportunityLabel(state),
    score,
    primaryReason: primaryReason(input, state),
    activationConditions,
    blockingReasons,
    nextSteps
  };
}

function inferOpportunityState(input: Parameters<typeof evaluateCandidateOpportunity>[0], score: number): CandidateOpportunityState {
  if (hasHardOpportunityBlocker(input)) return "blocked";
  if (input.action === ZH.smallTrial) return "executable";
  if (isQualifiedNextDayAuction(input, score)) return "next_day_auction";
  if (input.buyPointEvaluation?.status === "\u5f85\u6fc0\u6d3b" && score >= 50) return "pending_activation";
  if (input.action === ZH.avoid) return "blocked";
  return "watch_only";
}

function hasHardOpportunityBlocker(input: Parameters<typeof evaluateCandidateOpportunity>[0]) {
  return Boolean(
    input.dataCompleteness.level === "insufficient" ||
      input.mainlineAttribution?.shouldExclude ||
      input.fundFlowState === "outflow" ||
      input.trendState === "downtrend" ||
      input.trendState === "below_ma20" ||
      input.sectorStage === ZH.fading
  );
}

function isQualifiedNextDayAuction(input: Parameters<typeof evaluateCandidateOpportunity>[0], score: number) {
  if (input.tradability?.nextSessionPlan?.mode !== "\u6b21\u65e5\u7ade\u4ef7\u89c2\u5bdf") return false;
  if (input.action !== ZH.noChase) return false;
  const coreRole = input.role === ZH.leader || input.role === ZH.core;
  const sectorAlive = input.sectorStage === ZH.startup || input.sectorStage === ZH.confirmed || input.sectorStage === ZH.accelerating;
  const buyPointNotBroken = input.buyPointEvaluation?.status !== "\u65e0\u6548" || input.buyPointEvaluation.score >= 10;
  return coreRole && sectorAlive && buyPointNotBroken && input.fundFlowState !== "outflow" && input.strengthScore >= 52 && score >= 42;
}

function scoreOpportunity(input: Parameters<typeof evaluateCandidateOpportunity>[0]) {
  let score = Math.round(input.strengthScore * 0.42) + Math.round((input.signalScore ?? 0) * 0.28);

  if (input.role === ZH.leader) score += 12;
  else if (input.role === ZH.core) score += 9;
  else if (input.role === ZH.catchUp) score += 3;

  if (input.sectorStage === ZH.confirmed) score += 10;
  else if (input.sectorStage === ZH.startup) score += 8;
  else if (input.sectorStage === ZH.accelerating) score += 5;
  else if (input.sectorStage === ZH.diverging) score -= 4;
  else if (input.sectorStage === ZH.fading) score -= 18;

  if (input.buyPointEvaluation?.status === "\u6709\u6548") score += 10;
  else if (input.buyPointEvaluation?.status === "\u5f85\u6fc0\u6d3b") score += 5;
  else if (input.buyPointEvaluation?.status === "\u65e0\u6548") score -= 10;

  if (input.fundFlowState === "inflow") score += 7;
  else if (input.fundFlowState === "mixed") score += 1;
  else if (input.fundFlowState === "outflow") score -= 18;

  if (input.trendState === "above_ma20") score += 6;
  else if (input.trendState === "reclaim_ma20") score += 3;
  else if (input.trendState === "below_ma20" || input.trendState === "downtrend") score -= 18;

  if (input.marketState === "tradable") score += 8;
  else if (input.marketState === "cautious") score += 2;
  else score -= 8;

  if (input.tradability?.status === "\u6da8\u505c\u4e0d\u53ef\u8fbe") score -= 8;
  else if (input.tradability?.status === "\u63a5\u8fd1\u6da8\u505c") score -= 5;
  else if (input.tradability?.status === "\u9ad8\u4f4d\u62c9\u5347") score -= 3;

  if (input.dataCompleteness.level === "partial") score -= 4;
  if (input.dataCompleteness.level === "insufficient") score -= 30;
  if (input.mainlineAttribution?.shouldExclude) score -= 35;
  if (input.riskFlags.length >= 6) score -= 8;
  else if (input.riskFlags.length >= 3) score -= 4;

  return Math.max(0, Math.min(100, score));
}

function buildActivationConditions(input: Parameters<typeof evaluateCandidateOpportunity>[0]) {
  const items: string[] = [];
  if (input.marketState === "defensive") {
    items.push("\u5927\u76d8\u81f3\u5c11\u4fee\u590d\u5230\u8c28\u614e\u4ea4\u6613\uff1a\u5168A\u5bbd\u5ea6\u3001\u6da8\u8dcc\u505c\u60c5\u7eea\u548c\u6838\u5fc3\u6307\u6570\u5171\u632f\u9700\u540c\u65f6\u6539\u5584");
  }
  if (input.sectorStage === ZH.observe) {
    items.push("\u4e3b\u7ebf\u9700\u4ece\u89c2\u5bdf\u5347\u81f3\u542f\u52a8\uff1a\u6210\u5206\u6269\u6563\u3001\u6da8\u505c\u6838\u5fc3\u6216\u8d44\u91d1\u5ef6\u7eed\u81f3\u5c11\u6709\u4e00\u6761\u786e\u8ba4");
  }
  if (input.sectorStage === ZH.startup) {
    items.push("\u542f\u52a8\u4e3b\u7ebf\u9700\u7ee7\u7eed\u9a8c\u8bc1\uff1a\u6838\u5fc3\u80a1\u4e0d\u6389\u961f\uff0c\u540e\u6392\u4e0d\u5927\u9762\u8865\u8dcc");
  }
  if (input.buyPointEvaluation?.status === "\u5f85\u6fc0\u6d3b") items.push(input.buyPointEvaluation.triggerCondition);
  if (input.tradability?.nextSessionPlan?.preconditions.length) items.push(...input.tradability.nextSessionPlan.preconditions.slice(0, 3));
  if (input.fundFlowState === "mixed") items.push("\u8d44\u91d1\u5206\u6b67\u9700\u6536\u655b\uff1a\u5f53\u65e5\u548c5\u65e5\u4e3b\u529b\u8d44\u91d1\u4e0d\u80fd\u7ee7\u7eed\u80cc\u79bb");
  return unique(items).slice(0, 6);
}

function buildBlockingReasons(input: Parameters<typeof evaluateCandidateOpportunity>[0]) {
  const blockers = [
    ...input.dataCompleteness.blockingReasons,
    input.mainlineAttribution?.shouldExclude ? input.mainlineAttribution.reason : "",
    input.marketState === "defensive" ? "\u5927\u76d8\u9632\u5b88\u89c2\u671b\uff0c\u4e0d\u7ed9\u6b63\u5f0f\u65b0\u5f00\u4ed3\u4fe1\u53f7" : "",
    input.fundFlowState === "outflow" ? "\u4e3b\u529b\u8d44\u91d1\u6301\u7eed\u6d41\u51fa" : "",
    input.trendState === "below_ma20" || input.trendState === "downtrend" ? "\u8d8b\u52bf\u672a\u7ad9\u7a33MA20" : "",
    input.sectorStage === ZH.fading ? "\u4e3b\u7ebf\u9000\u6f6e" : "",
    ...(input.buyPointEvaluation?.blockers ?? []),
    ...(input.tradability?.blockers ?? [])
  ].filter(Boolean);
  return unique(blockers).slice(0, 8);
}

function buildNextSteps(input: Parameters<typeof evaluateCandidateOpportunity>[0]) {
  if (input.tradability?.nextSessionPlan?.mode === "\u6b21\u65e5\u7ade\u4ef7\u89c2\u5bdf") {
    return [
      "\u4eca\u65e5\u4e0d\u8ffd\u677f\uff0c\u8f6c\u5165\u6b21\u65e5\u7ade\u4ef7\u89c2\u5bdf",
      ...input.tradability.nextSessionPlan.preconditions.slice(0, 2),
      ...input.tradability.nextSessionPlan.doNotChase.slice(0, 2).map((item) => `\u4e0d\u8ffd\uff1a${item}`)
    ];
  }
  if (input.buyPointEvaluation?.status === "\u5f85\u6fc0\u6d3b") {
    return [
      "\u4fdd\u7559\u4e3a\u5f85\u6fc0\u6d3b\u673a\u4f1a\uff0c\u76d8\u4e2d\u53ea\u89c2\u5bdf\u6761\u4ef6\u662f\u5426\u6210\u7acb",
      input.buyPointEvaluation.triggerCondition,
      input.buyPointEvaluation.invalidCondition
    ];
  }
  if (input.action === ZH.smallTrial) return ["\u4ec5\u5728\u89c4\u5219\u4ed3\u4f4d\u5185\u6267\u884c\uff0c\u8dcc\u7834\u5931\u6548\u6761\u4ef6\u5fc5\u987b\u964d\u7ea7"];
  if (input.action === ZH.avoid) return ["\u4e0d\u7eb3\u5165\u5f53\u524d\u4e70\u5165\u8ba1\u5212\uff0c\u7b49\u8d8b\u52bf\u3001\u8d44\u91d1\u6216\u4e3b\u7ebf\u4fee\u590d\u540e\u91cd\u65b0\u8bc4\u4f30"];
  return ["\u7ee7\u7eed\u89c2\u5bdf\uff1a\u7b49\u4e3b\u7ebf\u9636\u6bb5\u3001\u4e70\u70b9\u548c\u8d44\u91d1\u8d28\u91cf\u540c\u5411\u786e\u8ba4"];
}

function primaryReason(input: Parameters<typeof evaluateCandidateOpportunity>[0], state: CandidateOpportunityState) {
  if (state === "executable") return "\u89c4\u5219\u3001\u4e3b\u7ebf\u3001\u4e70\u70b9\u548c\u4ed3\u4f4d\u8fb9\u754c\u540c\u65f6\u6ee1\u8db3\uff0c\u4f46\u4ecd\u53ea\u662f\u5c0f\u4ed3\u8bd5\u9519\u7ea7\u522b";
  if (state === "next_day_auction") return "\u5f53\u65e5\u4e70\u5165\u53ef\u8fbe\u6027\u5dee\uff0c\u4f46\u82e5\u4e3b\u7ebf\u548c\u7ade\u4ef7\u53cd\u9988\u5ef6\u7eed\uff0c\u53ef\u8f6c\u5165\u6b21\u65e5\u89c2\u5bdf";
  if (state === "pending_activation") return "\u5df2\u6709\u90e8\u5206\u5f62\u6001\u6216\u4e3b\u7ebf\u8bc1\u636e\uff0c\u4f46\u88ab\u5927\u76d8\u3001\u65f6\u6bb5\u6216\u6d3b\u8dc3\u5ea6\u7ea6\u675f\u538b\u5236";
  if (state === "blocked") return input.riskFlags[0] ?? "\u5b58\u5728\u786c\u98ce\u9669\u6216\u6838\u5fc3\u8bc1\u636e\u4e0d\u8db3";
  return "\u5f53\u524d\u4e0d\u662f\u6709\u6548\u4e70\u70b9\uff0c\u4f46\u53ef\u7ee7\u7eed\u8ddf\u8e2a\u4e3b\u7ebf\u548c\u80a1\u6027\u53d8\u5316";
}

function opportunityLabel(state: CandidateOpportunityState) {
  const labels: Record<CandidateOpportunityState, string> = {
    executable: "\u53ef\u6267\u884c\u8bd5\u9519",
    pending_activation: "\u5f85\u6fc0\u6d3b\u673a\u4f1a",
    next_day_auction: "\u6b21\u65e5\u7ade\u4ef7\u89c2\u5bdf",
    watch_only: "\u4ec5\u89c2\u5bdf\u8ddf\u8e2a",
    blocked: "\u98ce\u9669\u963b\u65ad"
  };
  return labels[state];
}

function unique(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}
