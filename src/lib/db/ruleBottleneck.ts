import { dbAll } from "@/lib/db/client";
import type { AnalysisReport, StockCandidate } from "@/lib/types";

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

export type RuleBottleneckSnapshot = {
  generatedAt: string;
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
  gates: RuleBottleneckGate[];
  topBlockedStocks: RuleBottleneckStock[];
  topBlockReasons: Array<{ reason: string; count: number }>;
  cautions: string[];
};

type ReportRow = {
  id: string;
  createdAt: string;
  factPackageJson: string;
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
  opportunityState?: string;
  buyPointStatus?: string;
  positionLimitPct: number;
  dataLevel?: string;
  mainlineStatus?: string;
  tradabilityStatus?: string;
  trendState?: string;
  fundFlowState?: string;
  reason: string;
};

export function buildRuleBottleneckSnapshot(limit = 80): RuleBottleneckSnapshot {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 10), 240);
  const rows = dbAll<ReportRow>(
    `select id, createdAt, factPackageJson
       from analysis_reports
       where reportType = 'full'
       order by createdAt desc
       limit ?`,
    [safeLimit],
    { label: "analysis_reports.rule_bottleneck", slowMs: 500 }
  );
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

  return {
    generatedAt: new Date().toISOString(),
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
    gates,
    topBlockedStocks: buildTopBlockedStocks(points),
    topBlockReasons: buildTopBlockReasons(points),
    cautions: [
      "这是规则触发瓶颈分析，不是收益回测；它用来定位系统为什么不发出买入建议。",
      "正式买入仍必须受大盘、主线、个股买点、流动性和数据质量共同约束；待激活和次日竞价观察不等于立即买入。",
      "如果长期没有正式买点，应优先检查瓶颈最大的规则层，而不是简单放松风控。"
    ]
  };
}

function toCandidatePoints(row: ReportRow): CandidatePoint[] {
  const factPackage = safeJson<AnalysisReport["factPackage"]>(row.factPackageJson);
  if (!factPackage) return [];
  const market = factPackage.ruleResult?.market;
  const sectors = new Map((factPackage.sectors ?? []).map((sector) => [sector.name, sector]));
  return (factPackage.candidates ?? []).map((candidate) => {
    const sector = sectors.get(candidate.sectorName);
    return {
      reportId: row.id,
      reportAt: row.createdAt,
      marketState: market?.marketState ?? factPackage.market?.marketState ?? "unknown",
      maxTotalPositionPct: market?.maxTotalPositionPct ?? 0,
      sectorName: candidate.sectorName,
      sectorStage: sector?.stage,
      action: candidate.action,
      code: candidate.code,
      name: candidate.name,
      opportunityState: candidate.opportunityProfile?.state,
      buyPointStatus: candidate.buyPointEvaluation?.status,
      positionLimitPct: candidate.positionLimitPct,
      dataLevel: candidate.dataCompleteness?.level,
      mainlineStatus: candidate.mainlineAttribution?.status,
      tradabilityStatus: candidate.tradability?.status,
      trendState: candidate.trendState,
      fundFlowState: candidate.fundFlowState,
      reason: primaryReason(candidate)
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

function isConstructiveStage(stage?: string) {
  return stage === "启动" || stage === "确认" || stage === "加速";
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
