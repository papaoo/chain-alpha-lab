import { listAnalysisReportSummaries, type ReportCandidateSummary } from "@/lib/db/reportSummaries";
import { buildCandidatePressureHistory } from "@/lib/db/candidatePressureHistory";
import type { CandidatePressureHistorySummary } from "@/lib/strategy/candidatePressureBuckets";
import type { StockCandidate } from "@/lib/types";

export type RuleBottleneckSeverity = "ok" | "watch" | "risk";

export type RuleBottleneckGate = {
  key: string;
  label: string;
  count: number;
  pct: number;
  severity: RuleBottleneckSeverity;
  description: string;
  evidence: string[];
  suggestion: string;
};

export type RuleBottleneckStock = {
  code: string;
  name: string;
  count: number;
  latestAction: string;
  latestReason: string;
};

export type RuleBottleneckFunnelItem = {
  key: string;
  label: string;
  count: number;
  pct: number;
  severity: RuleBottleneckSeverity;
  description: string;
};

export type RuleBottleneckConversionPath = {
  key: string;
  label: string;
  count: number;
  pct: number;
  severity: RuleBottleneckSeverity;
  summary: string;
  nextChecks: string[];
  examples: Array<{
    code: string;
    name: string;
    reportAt: string;
    action: string;
    reason: string;
  }>;
};

export type RuleBottleneckAuctionWatchItem = {
  code: string;
  name: string;
  reportAt: string;
  sectorName: string;
  sectorStage?: string;
  role?: string;
  action: string;
  score?: number;
  strengthScore?: number;
  signalTier?: string;
  price?: number;
  changePct?: number;
  amount?: number;
  turnoverRate?: number;
  mainNetInflow?: number;
  reason: string;
  preconditions: string[];
  doNotChase: string[];
  invalidConditions: string[];
};

export type RuleBottleneckSnapshot = {
  generatedAt: string;
  servedAt?: string;
  cacheStatus?: "hit" | "miss";
  cacheTtlSeconds?: number;
  reportCount: number;
  candidateCount: number;
  firstReportAt?: string;
  latestReportAt?: string;
  executableCount: number;
  pendingActivationCount: number;
  nextDayAuctionCount: number;
  blockedCount: number;
  buySignalRatePct: number;
  conclusion: {
    level: RuleBottleneckSeverity;
    title: string;
    summary: string;
  };
  calibration: {
    stance: "样本不足" | "偏保守" | "平衡" | "偏宽松" | "数据受限";
    severity: RuleBottleneckSeverity;
    summary: string;
    metrics: Array<{
      label: string;
      value: string;
      note: string;
      severity: RuleBottleneckSeverity;
    }>;
    recommendations: string[];
  };
  candidatePressureCalibration?: Pick<CandidatePressureHistorySummary, "reportCount" | "candidateObservationCount" | "calibrationHints" | "topBuckets" | "generatedAt">;
  triggerGuide: {
    title: string;
    summary: string;
    requiredConditions: string[];
    nearestOpportunities: Array<{
      code: string;
      name: string;
      action: string;
      opportunityState?: string;
      missingChecks: string[];
      reason: string;
    }>;
    hardBoundaries: string[];
  };
  gates: RuleBottleneckGate[];
  funnel: RuleBottleneckFunnelItem[];
  conversionPaths: RuleBottleneckConversionPath[];
  auctionWatchlist: RuleBottleneckAuctionWatchItem[];
  topBlockedStocks: RuleBottleneckStock[];
  topBlockReasons: Array<{ reason: string; count: number }>;
  cautions: string[];
};

type ReportRow = {
  id: string;
  createdAt: string;
  marketState: string;
  maxTotalPositionPct: number;
  candidateSummaries: ReportCandidateSummary[];
};

type CandidatePoint = {
  reportId: string;
  reportAt: string;
  marketState: string;
  maxTotalPositionPct: number;
  sectorName: string;
  sectorStage?: string;
  action: string;
  code: string;
  name: string;
  role?: string;
  score?: number;
  strengthScore?: number;
  signalTier?: string;
  price?: number;
  changePct?: number;
  amount?: number;
  turnoverRate?: number;
  mainNetInflow?: number;
  opportunityState?: string;
  buyPointStatus?: string;
  positionLimitPct: number;
  dataLevel?: string;
  mainlineStatus?: string;
  tradabilityStatus?: string;
  trendState?: string;
  fundFlowState?: string;
  reason: string;
  activationConditions: string[];
  blockingReasons: string[];
  nextSteps: string[];
  nextSessionPlan?: {
    mode: string;
    preconditions: string[];
    doNotChase: string[];
    invalidConditions: string[];
  };
};

const RULE_BOTTLENECK_CACHE_TTL_MS = 30_000;
type RuleBottleneckCacheEntry = { createdAt: number; snapshot: RuleBottleneckSnapshot };
const globalRuleBottleneckCache = globalThis as typeof globalThis & {
  __chainAlphaRuleBottleneckCache?: Map<string, RuleBottleneckCacheEntry>;
};

function getRuleBottleneckCache() {
  const cache = globalRuleBottleneckCache.__chainAlphaRuleBottleneckCache ?? new Map<string, RuleBottleneckCacheEntry>();
  globalRuleBottleneckCache.__chainAlphaRuleBottleneckCache = cache;
  return cache;
}

export function buildRuleBottleneckSnapshot(limit = 80): RuleBottleneckSnapshot {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 10), 240);
  const cacheKey = `limit:${safeLimit}`;
  const ruleBottleneckCache = getRuleBottleneckCache();
  const cached = ruleBottleneckCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.createdAt < RULE_BOTTLENECK_CACHE_TTL_MS) {
    return {
      ...cached.snapshot,
      servedAt: new Date(now).toISOString(),
      cacheStatus: "hit",
      cacheTtlSeconds: Math.ceil((RULE_BOTTLENECK_CACHE_TTL_MS - (now - cached.createdAt)) / 1000)
    };
  }
  const rows = listAnalysisReportSummaries(safeLimit).map((row) => ({
    id: row.reportId,
    createdAt: row.createdAt,
    marketState: row.marketState,
    maxTotalPositionPct: row.maxTotalPositionPct,
    candidateSummaries: row.candidateSummaries
  }));
  const points = rows
    .map(toCandidatePoints)
    .flat()
    .sort((left, right) => left.reportAt.localeCompare(right.reportAt));

  const candidateCount = points.length;
  const executableCount = points.filter((point) => point.opportunityState === "executable" || point.action === "小仓试错").length;
  const pendingActivationCount = points.filter((point) => point.opportunityState === "pending_activation").length;
  const nextDayAuctionCount = points.filter((point) => point.opportunityState === "next_day_auction").length;
  const blockedCount = points.filter((point) => isBlocked(point)).length;
  const gates = buildGates(points);
  const buySignalRatePct = pct(executableCount, candidateCount);
  const candidatePressureCalibration = summarizeCandidatePressureCalibration(Math.min(12, Math.max(3, rows.length || 8)));

  const snapshot: RuleBottleneckSnapshot = {
    generatedAt: new Date().toISOString(),
    servedAt: new Date().toISOString(),
    cacheStatus: "miss",
    cacheTtlSeconds: Math.ceil(RULE_BOTTLENECK_CACHE_TTL_MS / 1000),
    reportCount: rows.length,
    candidateCount,
    firstReportAt: points[0]?.reportAt,
    latestReportAt: points[points.length - 1]?.reportAt,
    executableCount,
    pendingActivationCount,
    nextDayAuctionCount,
    blockedCount,
    buySignalRatePct,
    conclusion: buildConclusion(candidateCount, executableCount, pendingActivationCount, nextDayAuctionCount, gates),
    calibration: buildCalibration({
      candidateCount,
      executableCount,
      pendingActivationCount,
      nextDayAuctionCount,
      blockedCount,
      gates,
      points
    }),
    candidatePressureCalibration,
    triggerGuide: buildTriggerGuide(points, gates),
    gates,
    funnel: buildFunnel(points),
    conversionPaths: buildConversionPaths(points),
    auctionWatchlist: buildAuctionWatchlist(points),
    topBlockedStocks: buildTopBlockedStocks(points),
    topBlockReasons: buildTopBlockReasons(points),
    cautions: [
      "这是规则触发瓶颈分析，不是收益回测；它用来定位系统为什么不发出买入建议。",
      "正式买入仍必须受大盘、主线、个股买点、流动性和数据质量共同约束；待激活和次日竞价观察不等于立即买入。",
      "如果长期没有正式买点，应优先检查瓶颈最大的规则层，而不是简单放松风控。"
    ]
  };
  ruleBottleneckCache.set(cacheKey, { createdAt: now, snapshot });
  return snapshot;
}

function summarizeCandidatePressureCalibration(limit: number): RuleBottleneckSnapshot["candidatePressureCalibration"] {
  const summary = buildCandidatePressureHistory(limit);
  return {
    generatedAt: summary.generatedAt,
    reportCount: summary.reportCount,
    candidateObservationCount: summary.candidateObservationCount,
    calibrationHints: summary.calibrationHints,
    topBuckets: summary.topBuckets.slice(0, 6)
  };
}

function buildCalibration({
  candidateCount,
  executableCount,
  pendingActivationCount,
  nextDayAuctionCount,
  blockedCount,
  gates,
  points
}: {
  candidateCount: number;
  executableCount: number;
  pendingActivationCount: number;
  nextDayAuctionCount: number;
  blockedCount: number;
  gates: RuleBottleneckGate[];
  points: CandidatePoint[];
}): RuleBottleneckSnapshot["calibration"] {
  const activeCount = executableCount + pendingActivationCount + nextDayAuctionCount;
  const executablePct = pct(executableCount, candidateCount);
  const activePct = pct(activeCount, candidateCount);
  const blockedPct = pct(blockedCount, candidateCount);
  const topGate = gates[0];
  const marketGate = gates.find((gate) => gate.key === "market");
  const dataGate = gates.find((gate) => gate.key === "data");
  const buyPointGate = gates.find((gate) => gate.key === "buyPoint");
  const tradabilityGate = gates.find((gate) => gate.key === "tradability");
  const highScoreBlockedPct = pct(points.filter((point) => isBlocked(point) && ((point.score ?? 0) >= 70 || (point.strengthScore ?? 0) >= 70)).length, candidateCount);
  const dataLimited = (dataGate?.pct ?? 0) >= 35;
  const veryStrict = executableCount === 0 && activePct >= 8 && ((marketGate?.pct ?? 0) >= 55 || (buyPointGate?.pct ?? 0) >= 55 || highScoreBlockedPct >= 12);
  const tooLoose = executablePct >= 12 || (executablePct >= 6 && (tradabilityGate?.pct ?? 0) >= 35);
  const sampleLimited = candidateCount < 20;

  const metrics = [
    metric("正式触发率", `${executablePct}%`, executablePct === 0 ? "没有正式买入触发，需要看待激活和最大闸门。" : "存在正式触发，规则不是完全封死。", executablePct === 0 ? "watch" : executablePct >= 12 ? "risk" : "ok"),
    metric("行动观察层", `${activePct}%`, "包含正式触发、待激活和次日竞价观察。", activePct >= 8 ? "ok" : "watch"),
    metric("硬阻断率", `${blockedPct}%`, "数据不足、回避、主线不匹配等明确阻断样本占比。", blockedPct >= 55 ? "risk" : blockedPct >= 30 ? "watch" : "ok"),
    metric("高分被阻断", `${highScoreBlockedPct}%`, "高分候选仍被硬阻断，可能是数据、买点或风控在压制。", highScoreBlockedPct >= 12 ? "risk" : highScoreBlockedPct >= 5 ? "watch" : "ok")
  ];

  if (sampleLimited) {
    return {
      stance: "样本不足",
      severity: "watch",
      summary: `最近只有 ${candidateCount} 个候选样本，不能据此调参，只能定位线索。`,
      metrics,
      recommendations: [
        "先积累更多自动分析快照，至少覆盖多个交易日和不同大盘状态。",
        "不要因为短样本没有买点就放松硬风控。"
      ]
    };
  }
  if (dataLimited) {
    return {
      stance: "数据受限",
      severity: "risk",
      summary: `数据完整性闸门占 ${dataGate?.pct ?? 0}%，当前最应该先补数据链路，而不是调宽买点或仓位。`,
      metrics,
      recommendations: [
        "优先核对报价、K线、技术指标、资金流、板块归属的缺失来源。",
        "保留潜在买点和待激活条件，补数后重跑，不要把所有候选直接永久剔除。",
        topGate ? `当前最大闸门是“${topGate.label}”，先看它的证据样本。` : "查看规则闸门样本，定位缺失字段。"
      ]
    };
  }
  if (veryStrict) {
    return {
      stance: "偏保守",
      severity: "watch",
      summary: "最近没有正式触发，但存在待激活/竞价观察或高分被阻断样本，说明规则可能偏保守但仍有机会层。",
      metrics,
      recommendations: [
        "不要直接放开总仓；先检查大盘防守、买点有效、涨停不可达这几个最大闸门是否合理。",
        "把待激活样本加入追踪，验证触发后表现，再决定是否微调阈值。",
        "若多次出现强核心涨停但主线仍无法升级，应复核主线阶段的涨停核心弹性路径。"
      ]
    };
  }
  if (tooLoose) {
    return {
      stance: "偏宽松",
      severity: "risk",
      summary: "正式触发率偏高或可交易性风险较多，后续需要防止信号过度泛化。",
      metrics,
      recommendations: [
        "复核正式触发样本是否存在追高、涨停不可达或数据不新鲜。",
        "对正式触发样本建立追踪收益验证，若失效率高，再收紧买点和流动性约束。"
      ]
    };
  }
  return {
    stance: "平衡",
    severity: activePct >= 8 ? "ok" : "watch",
    summary: activePct >= 8
      ? "规则有机会层但正式触发克制，当前更适合继续用追踪验证而不是大幅改阈值。"
      : "规则没有明显过宽，机会层偏少；继续观察是否由大盘或主线环境导致。",
    metrics,
    recommendations: [
      "继续积累自动分析快照，重点观察待激活样本的后续表现。",
      topGate ? `当前最大闸门是“${topGate.label}”，调参前先复核其证据是否真实。` : "继续观察规则闸门分布。",
      "下一步应把规则回放和个股追踪收益验证连起来。"
    ]
  };
}

function metric(label: string, value: string, note: string, severity: RuleBottleneckSeverity) {
  return { label, value, note, severity };
}

function toCandidatePoints(row: ReportRow): CandidatePoint[] {
  return row.candidateSummaries.map((candidate) => {
    return {
      reportId: row.id,
      reportAt: row.createdAt,
      marketState: row.marketState,
      maxTotalPositionPct: row.maxTotalPositionPct,
      sectorName: candidate.sectorName,
      sectorStage: candidate.sectorStage,
      action: candidate.action,
      code: candidate.code,
      name: candidate.name,
      role: candidate.role,
      score: candidate.score,
      strengthScore: candidate.strengthScore,
      signalTier: candidate.signalTier,
      price: candidate.price,
      changePct: candidate.changePct,
      amount: candidate.amount,
      turnoverRate: candidate.turnoverRate,
      mainNetInflow: candidate.mainNetInflow,
      opportunityState: candidate.opportunityState,
      buyPointStatus: candidate.buyPointStatus,
      positionLimitPct: candidate.positionLimitPct,
      dataLevel: candidate.dataLevel,
      mainlineStatus: candidate.mainlineStatus,
      tradabilityStatus: candidate.tradabilityStatus,
      trendState: candidate.trendState,
      fundFlowState: candidate.fundFlowState,
      reason: candidate.reason,
      activationConditions: candidate.activationConditions,
      blockingReasons: candidate.blockingReasons,
      nextSteps: candidate.nextSteps,
      nextSessionPlan: candidate.nextSessionPlan
    };
  });
}

function buildGates(points: CandidatePoint[]): RuleBottleneckGate[] {
  const total = Math.max(points.length, 1);
  const marketBlocked = points.filter((point) => point.marketState === "defensive" || point.maxTotalPositionPct <= 0);
  const sectorBlocked = points.filter((point) => !isConstructiveStage(point.sectorStage));
  const buyPointBlocked = points.filter((point) => {
    if (point.opportunityState === "executable" || point.opportunityState === "next_day_auction") return false;
    return point.buyPointStatus !== "有效" && point.buyPointStatus !== "待激活";
  });
  const dataBlocked = points.filter((point) => point.dataLevel === "insufficient" || point.action === "数据不足");
  const attributionBlocked = points.filter((point) => {
    return point.mainlineStatus === "mismatch" || point.mainlineStatus === "unknown";
  });
  const tradabilityBlocked = points.filter((point) => {
    const status = point.tradabilityStatus ?? "";
    return status.includes("涨停不可达") || status.includes("高位") || status.includes("接近涨停") || point.action === "不追";
  });
  const fundFlowBlocked = points.filter((point) => point.fundFlowState === "outflow" || point.action === "回避");

  return [
    gate("market", "大盘总仓闸门", marketBlocked, total, "大盘防守或总仓上限为 0 时，系统不会给正式买入。", "如果该项长期最高，说明不是个股没机会，而是大盘风控持续压制；应看状态翻转条件，而不是放松个股规则。"),
    gate("sector", "主线阶段闸门", sectorBlocked, total, "主线未进入启动/确认/加速时，候选股只能观察或等待。", "如果主线卡住但核心股活跃，应检查涨停核心优先路径和阶段迁移阈值。"),
    gate("buyPoint", "买点质量闸门", buyPointBlocked, total, "个股没有有效或待激活买点时，不输出正式买入。", "该项高说明需要继续拆分竞价、早盘、午间、尾盘买点，而不是只看日线形态。"),
    gate("data", "数据完整性闸门", dataBlocked, total, "核心数据不足会阻断正式动作，避免用假完整性做建议。", "该项高时优先补数据链路；但应同时保留潜在买点，不把所有机会都写成数据不足。"),
    gate("attribution", "主线归属闸门", attributionBlocked, total, "个股不能证明属于当前主线时，应剔除或人工复核。", "如果长期高，候选池来源需要收紧，主线归属证据链需要前置。"),
    gate("tradability", "可交易性闸门", tradabilityBlocked, total, "涨停不可达、接近涨停或高位追涨时，系统会压制买入。", "该项高时应更多输出次日竞价观察、回踩等待，而不是盘中追高。"),
    gate("fundFlow", "资金流闸门", fundFlowBlocked, total, "资金持续流出或流入质量差时，系统会回避。", "该项高说明需要重点观察资金流连续性和流入质量，而不是只看当日涨幅。")
  ].sort((left, right) => right.count - left.count);
}

function gate(key: string, label: string, points: CandidatePoint[], total: number, description: string, suggestion: string): RuleBottleneckGate {
  const count = points.length;
  const percent = pct(count, total);
  return {
    key,
    label,
    count,
    pct: percent,
    severity: percent >= 65 ? "risk" : percent >= 35 ? "watch" : "ok",
    description,
    evidence: summarizeEvidence(points),
    suggestion
  };
}

function buildConclusion(
  candidateCount: number,
  executableCount: number,
  pendingActivationCount: number,
  nextDayAuctionCount: number,
  gates: RuleBottleneckGate[]
): RuleBottleneckSnapshot["conclusion"] {
  if (!candidateCount) {
    return {
      level: "risk",
      title: "候选样本不足",
      summary: "最近报告没有可用于分析的候选股，先检查数据抓取和候选池生成。"
    };
  }
  const topGate = gates[0];
  if (executableCount > 0) {
    return {
      level: "ok",
      title: "存在正式买入触发",
      summary: `最近样本中已有 ${executableCount} 次正式买入/小仓试错触发，买入路径不是完全失效。`
    };
  }
  if (pendingActivationCount + nextDayAuctionCount > 0) {
    return {
      level: "watch",
      title: "有机会但多处于待激活",
      summary: `最近样本中有 ${pendingActivationCount + nextDayAuctionCount} 次待激活或次日竞价观察，最大瓶颈是“${topGate.label}”。`
    };
  }
  return {
    level: "risk",
    title: "正式买入长期被压制",
    summary: `最近样本未出现正式买入触发，最大瓶颈是“${topGate.label}”，占 ${topGate.pct}%。`
  };
}

function buildTopBlockedStocks(points: CandidatePoint[]) {
  const map = new Map<string, RuleBottleneckStock>();
  for (const point of points.filter(isBlocked)) {
    const current = map.get(point.code) ?? {
      code: point.code,
      name: point.name,
      count: 0,
      latestAction: point.action,
      latestReason: point.reason
    };
    current.count += 1;
    current.latestAction = point.action;
    current.latestReason = point.reason;
    map.set(point.code, current);
  }
  return Array.from(map.values()).sort((left, right) => right.count - left.count).slice(0, 8);
}

function buildTriggerGuide(points: CandidatePoint[], gates: RuleBottleneckGate[]): RuleBottleneckSnapshot["triggerGuide"] {
  const executable = points.filter((point) => normalizedOpportunityState(point) === "executable");
  const convertible = points
    .filter((point) => {
      const state = normalizedOpportunityState(point);
      return state === "pending_activation" || state === "next_day_auction" || state === "watch_only";
    })
    .sort((left, right) => opportunitySortScore(right) - opportunitySortScore(left))
    .slice(0, 5);
  const topGate = gates[0];
  const title = executable.length ? "买入路径已经存在" : convertible.length ? "存在近似机会，等待验证" : "当前买入路径被硬阻断";
  const summary = executable.length
    ? `最近样本出现 ${executable.length} 次正式可执行或小仓试错，说明系统不会永远不给买入。`
    : convertible.length
      ? `最近样本里有 ${convertible.length} 个较接近买入的观察样本，最大瓶颈仍是 ${topGate?.label ?? "未识别"}。`
      : `最近样本主要被 ${topGate?.label ?? "规则闸门"} 阻断，需要先修复硬条件。`;
  return {
    title,
    summary,
    requiredConditions: [
      "大盘不能处于防守且总仓上限需大于 0；盘前/竞价只能给观察，不直接确认盘中买点。",
      "主线至少处于启动，确认/加速更优；若只是观察阶段，需要核心股、资金和扩散继续补证。",
      "个股必须有完整或可用的核心交易数据，主线归属不能是 mismatch/unknown。",
      "买点需要有效或待激活：回踩、突破回踩、分歧修复、次日竞价承接等必须满足对应时段语义。",
      "可交易性不能是涨停不可达、接近涨停硬追、高位风险；资金流不能持续恶化。"
    ],
    nearestOpportunities: convertible.map((point) => ({
      code: point.code,
      name: point.name,
      action: point.action,
      opportunityState: point.opportunityState,
      missingChecks: inferMissingChecks(point).slice(0, 5),
      reason: point.reason
    })),
    hardBoundaries: [
      "正式买入不是 DeepSeek 自由生成，必须受规则引擎仓位、数据、主线、买点、流动性共同约束。",
      "次日竞价观察不是买入清单，只表示当日不可追后保留到次日验证。",
      "数据不足不会被硬凑成建议；但系统会保留潜在买点和缺失字段，方便补数后重新评估。",
      "如果长期没有买入信号，优先看最大瓶颈闸门和可转化路径，不直接放松总闸。"
    ]
  };
}

function opportunitySortScore(point: CandidatePoint) {
  const state = normalizedOpportunityState(point);
  const stateScore = state === "pending_activation" ? 28 : state === "next_day_auction" ? 24 : state === "watch_only" ? 12 : 0;
  return stateScore + (point.score ?? 0) * 0.7 + (point.strengthScore ?? 0) * 0.25;
}

function inferMissingChecks(point: CandidatePoint) {
  const checks: string[] = [];
  if (point.marketState === "defensive" || point.maxTotalPositionPct <= 0) checks.push("等待大盘从防守修复，总仓上限恢复到可试错。");
  if (!isConstructiveStage(point.sectorStage)) checks.push("等待主线从观察进入启动/确认，或核心股连续性增强。");
  if (point.dataLevel === "insufficient") checks.push("补齐核心交易数据，至少报价/K线/技术/资金可用。");
  if (point.mainlineStatus === "mismatch" || point.mainlineStatus === "unknown") checks.push("补齐主线归属证据，无法证明属于主线则剔除。");
  if (point.buyPointStatus !== "有效" && point.buyPointStatus !== "待激活") checks.push("等待买点从无效变成待激活/有效，避免凭强势追高。");
  if ((point.tradabilityStatus ?? "").includes("涨停") || (point.tradabilityStatus ?? "").includes("高位")) checks.push("当日不可追，转为次日竞价、开板承接或回踩验证。");
  if (point.fundFlowState === "outflow") checks.push("资金流需要从流出转为改善或分歧修复。");
  if (!checks.length) checks.push(...point.activationConditions.slice(0, 4));
  if (!checks.length) checks.push("继续核对大盘、主线、买点、资金和可交易性是否同时满足。");
  return unique(checks);
}

function buildFunnel(points: CandidatePoint[]): RuleBottleneckFunnelItem[] {
  const total = Math.max(points.length, 1);
  const groups = [
    {
      key: "executable",
      label: "正式可执行",
      points: points.filter((point) => normalizedOpportunityState(point) === "executable"),
      description: "规则、数据、风控同时允许的买入或小仓试错信号。"
    },
    {
      key: "pending_activation",
      label: "待激活",
      points: points.filter((point) => normalizedOpportunityState(point) === "pending_activation"),
      description: "形态或主线有雏形，但仍需要大盘、资金、买点之一继续确认。"
    },
    {
      key: "next_day_auction",
      label: "次日竞价观察",
      points: points.filter((point) => normalizedOpportunityState(point) === "next_day_auction"),
      description: "当日涨停或不可达，不盘中追高，转为次日竞价和承接验证。"
    },
    {
      key: "watch_only",
      label: "仅观察",
      points: points.filter((point) => normalizedOpportunityState(point) === "watch_only"),
      description: "没有触发正式买点，但仍保留在主线或候选观察池。"
    },
    {
      key: "blocked",
      label: "明确阻断",
      points: points.filter((point) => normalizedOpportunityState(point) === "blocked"),
      description: "数据、归属、可交易性或风险约束明确不支持当前动作。"
    }
  ];

  return groups.map((group) => {
    const percent = pct(group.points.length, total);
    return {
      key: group.key,
      label: group.label,
      count: group.points.length,
      pct: percent,
      severity: group.key === "blocked" && percent >= 50 ? "risk" : group.key === "executable" && group.points.length > 0 ? "ok" : "watch",
      description: group.description
    };
  });
}

function buildConversionPaths(points: CandidatePoint[]): RuleBottleneckConversionPath[] {
  const convertible = points.filter((point) => {
    const state = normalizedOpportunityState(point);
    return state === "pending_activation" || state === "next_day_auction";
  });
  const total = Math.max(convertible.length, 1);
  const pathDefs: Array<{
    key: string;
    label: string;
    summary: string;
    nextChecks: string[];
  }> = [
    {
      key: "market_repair",
      label: "大盘修复后激活",
      summary: "机会已经出现，但正式动作被大盘总仓或市场宽度压住。",
      nextChecks: ["全A上涨占比是否修复", "中位涨跌幅是否转正", "大盘状态是否从防守升至谨慎交易"]
    },
    {
      key: "next_day_auction",
      label: "次日竞价承接",
      summary: "当日已经过热或涨停不可达，合理路径是观察次日竞价、开板、回封和量能承接。",
      nextChecks: ["竞价涨幅是否温和", "开板后是否有承接", "回封是否带动同板块扩散"]
    },
    {
      key: "sector_confirm",
      label: "主线确认升级",
      summary: "个股强度需要板块阶段、核心股持续性或成分扩散进一步配合。",
      nextChecks: ["主线是否维持启动并走向确认", "核心股是否延续", "后排是否扩散而不是单点脉冲"]
    },
    {
      key: "fund_flow_repair",
      label: "资金流质量修复",
      summary: "形态可能具备观察价值，但资金流连续性或流入质量还没有确认。",
      nextChecks: ["当日与5日资金是否同向", "主力净流入是否改善", "放量上涨是否优于放量下跌"]
    },
    {
      key: "pullback_confirm",
      label: "回踩/低吸确认",
      summary: "当前不适合追高，等待回踩、突破回踩或分歧修复后的低风险买点。",
      nextChecks: ["是否缩量回踩关键均线", "是否突破后回踩不破", "是否分歧后修复而非继续走弱"]
    }
  ];
  const primaryPathByCode = new Map<string, CandidatePoint[]>();
  for (const point of convertible) {
    const key = classifyConversionPath(point);
    if (!key) continue;
    const list = primaryPathByCode.get(key) ?? [];
    list.push(point);
    primaryPathByCode.set(key, list);
  }

  return pathDefs
    .map((path) => {
      const matched = primaryPathByCode.get(path.key) ?? [];
      const percent = pct(matched.length, total);
      return {
        key: path.key,
        label: path.label,
        count: matched.length,
        pct: percent,
        severity: matched.length >= 8 ? "watch" : matched.length > 0 ? "ok" : "risk",
        summary: path.summary,
        nextChecks: path.nextChecks,
        examples: matched.slice(-3).reverse().map((point) => ({
          code: point.code,
          name: point.name,
          reportAt: point.reportAt,
          action: point.action,
          reason: point.reason
        }))
      } satisfies RuleBottleneckConversionPath;
    })
    .filter((path) => path.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
}

function buildAuctionWatchlist(points: CandidatePoint[]): RuleBottleneckAuctionWatchItem[] {
  const latestByCode = new Map<string, CandidatePoint>();
  for (const point of points) {
    const isAuction = normalizedOpportunityState(point) === "next_day_auction" || point.nextSessionPlan?.mode === "次日竞价观察";
    if (!isAuction) continue;
    const current = latestByCode.get(point.code);
    if (!current || current.reportAt.localeCompare(point.reportAt) < 0) {
      latestByCode.set(point.code, point);
    }
  }

  return Array.from(latestByCode.values())
    .sort((left, right) => {
      const leftScore = (left.score ?? 0) + (left.strengthScore ?? 0) * 0.35;
      const rightScore = (right.score ?? 0) + (right.strengthScore ?? 0) * 0.35;
      return rightScore - leftScore;
    })
    .slice(0, 12)
    .map((point) => ({
      code: point.code,
      name: point.name,
      reportAt: point.reportAt,
      sectorName: point.sectorName,
      sectorStage: point.sectorStage,
      role: point.role,
      action: point.action,
      score: point.score,
      strengthScore: point.strengthScore,
      signalTier: point.signalTier,
      price: point.price,
      changePct: point.changePct,
      amount: point.amount,
      turnoverRate: point.turnoverRate,
      mainNetInflow: point.mainNetInflow,
      reason: point.reason,
      preconditions: unique([
        ...(point.nextSessionPlan?.preconditions ?? []),
        ...point.activationConditions
      ]).slice(0, 4),
      doNotChase: unique(point.nextSessionPlan?.doNotChase ?? []).slice(0, 4),
      invalidConditions: unique([
        ...(point.nextSessionPlan?.invalidConditions ?? []),
        ...point.blockingReasons
      ]).slice(0, 4)
    }));
}

function classifyConversionPath(point: CandidatePoint) {
  const state = normalizedOpportunityState(point);
  const text = joinActivationText(point);
  if (state === "next_day_auction" || includesAny(text, ["竞价", "开板", "回封", "承接", "涨停不可达"])) {
    return "next_day_auction";
  }
  if (
    point.marketState === "defensive"
    || point.maxTotalPositionPct <= 0
    || includesAny(text, ["大盘", "全a", "全A", "宽度", "防守", "谨慎交易", "总仓"])
  ) {
    return "market_repair";
  }
  if (point.fundFlowState === "outflow" || point.fundFlowState === "mixed" || includesAny(text, ["资金", "流入", "流出", "净流入", "背离"])) {
    return "fund_flow_repair";
  }
  if (!isConstructiveStage(point.sectorStage) || includesAny(text, ["主线", "板块", "核心", "启动", "确认", "扩散", "后排"])) {
    return "sector_confirm";
  }
  if (point.buyPointStatus !== "有效" || includesAny(text, ["回踩", "ma20", "MA20", "ma10", "MA10", "均线", "追高", "不追", "高开"])) {
    return "pullback_confirm";
  }
  return null;
}

function buildTopBlockReasons(points: CandidatePoint[]) {
  const map = new Map<string, number>();
  for (const point of points.filter(isBlocked)) {
    const reason = point.reason || "未记录原因";
    map.set(reason, (map.get(reason) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 8);
}

function summarizeEvidence(points: CandidatePoint[]) {
  const examples = points.slice(-3).reverse();
  if (!examples.length) return ["最近样本中该闸门不是主要阻断项。"];
  return examples.map((point) => `${formatShortDate(point.reportAt)} ${point.name}：${point.action} / ${point.reason}`);
}

function primaryReason(candidate: StockCandidate) {
  return candidate.opportunityProfile?.primaryReason
    ?? candidate.buyPointEvaluation?.blockers?.[0]
    ?? candidate.tradability?.blockers?.[0]
    ?? candidate.dataCompleteness?.blockingReasons?.[0]
    ?? candidate.riskFlags?.[0]
    ?? candidate.invalidCondition
    ?? "未记录原因";
}

function isBlocked(point: CandidatePoint) {
  return point.action === "数据不足"
    || point.action === "回避"
    || point.action === "不追"
    || point.opportunityState === "blocked"
    || point.dataLevel === "insufficient";
}

function normalizedOpportunityState(point: CandidatePoint) {
  if (point.opportunityState === "executable" || point.action === "小仓试错" || point.action === "买入") return "executable";
  if (point.opportunityState === "pending_activation") return "pending_activation";
  if (point.opportunityState === "next_day_auction") return "next_day_auction";
  if (isBlocked(point)) return "blocked";
  return "watch_only";
}

function isConstructiveStage(stage?: string) {
  return stage === "启动" || stage === "确认" || stage === "加速";
}

function joinPointText(point: CandidatePoint) {
  return [
    point.marketState,
    point.sectorName,
    point.sectorStage,
    point.action,
    point.opportunityState,
    point.buyPointStatus,
    point.dataLevel,
    point.mainlineStatus,
    point.tradabilityStatus,
    point.trendState,
    point.fundFlowState,
    point.reason,
    ...point.activationConditions,
    ...point.blockingReasons,
    ...point.nextSteps
  ].filter(Boolean).join(" ");
}

function joinActivationText(point: CandidatePoint) {
  return [
    point.reason,
    point.tradabilityStatus,
    point.fundFlowState,
    ...point.activationConditions,
    ...point.blockingReasons,
    ...point.nextSteps
  ].filter(Boolean).join(" ");
}

function includesAny(text: string, keywords: string[]) {
  const normalized = text.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function unique(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function pct(value: number, total: number) {
  if (!total) return 0;
  return Number(((value / total) * 100).toFixed(1));
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

function safeJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
