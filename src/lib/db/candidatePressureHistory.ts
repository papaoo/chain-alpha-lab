import { listAnalysisReportSummaries, type AnalysisReportSummary, type ReportCandidateSummary } from "@/lib/db/reportSummaries";
import {
  buildCandidatePressureHistorySummary,
  type CandidatePressureBucket,
  type CandidatePressureHistoryPoint,
  type CandidatePressureHistorySummary
} from "@/lib/strategy/candidatePressureBuckets";

export function buildCandidatePressureHistory(limit = 8): CandidatePressureHistorySummary {
  const reports = listAnalysisReportSummaries(limit).filter((report) => report.displayable !== 0);
  const points = reports.map(summaryToPressurePoint);
  return buildCandidatePressureHistorySummary(points);
}

function summaryToPressurePoint(report: AnalysisReportSummary): CandidatePressureHistoryPoint {
  const candidates = report.candidateSummaries ?? [];
  return {
    reportId: report.reportId,
    createdAt: report.createdAt,
    candidateCount: candidates.length,
    buckets: buildBucketsFromSummary(report, candidates)
  };
}

function buildBucketsFromSummary(report: AnalysisReportSummary, candidates: ReportCandidateSummary[]): CandidatePressureBucket[] {
  const marketBlocked = report.marketState === "defensive" || report.maxTotalPositionPct <= 0;
  const mainlineBlocked = candidates.filter((candidate) =>
    candidate.mainlineStatus === "mismatch" ||
    candidate.mainlineStatus === "unknown" ||
    includesAny(candidateText(candidate), ["主线", "板块", "归属", "成分", "主营"])
  );
  const buyPointBlocked = candidates.filter((candidate) => candidate.buyPointStatus !== "有效");
  const dataBlocked = candidates.filter((candidate) => candidate.dataLevel !== "complete");
  const reachabilityBlocked = candidates.filter((candidate) =>
    includesAny(candidate.tradabilityStatus ?? "", ["涨停不可达", "接近涨停", "高位拉升"])
  );
  const fundTrendBlocked = candidates.filter((candidate) =>
    candidate.fundFlowState === "outflow" ||
    candidate.fundFlowState === "mixed" ||
    candidate.trendState === "downtrend" ||
    candidate.trendState === "below_ma20" ||
    includesAny(candidateText(candidate), ["资金", "流出", "趋势", "均线", "破位", "回落"])
  );

  return [
    {
      key: "market",
      title: "大盘总闸",
      value: marketBlocked ? `${candidates.length}` : "0",
      subtitle: marketBlocked ? `市场 ${formatMarketState(report.marketState)}，总仓上限 ${report.maxTotalPositionPct}%` : "大盘没有形成硬压制",
      tone: marketBlocked ? "risk" : report.marketState === "cautious" ? "wait" : "open",
      details: [
        `市场状态：${formatMarketState(report.marketState)}`,
        `总仓上限：${report.maxTotalPositionPct}%`
      ]
    },
    {
      key: "mainline",
      title: "主线归属",
      value: `${mainlineBlocked.length}`,
      subtitle: mainlineBlocked.length ? "候选与当前主线证据不够硬" : "主线归属未形成集中阻断",
      tone: mainlineBlocked.length ? "risk" : "open",
      details: collectTopItems(mainlineBlocked.flatMap((candidate) => [
        candidate.reason,
        ...candidate.blockingReasons.filter((reason) => includesAny(reason, ["主线", "板块", "归属", "成分", "主营"]))
      ]), 5)
    },
    {
      key: "buy-point",
      title: "买点质量",
      value: `${buyPointBlocked.length}`,
      subtitle: buyPointBlocked.length ? "买点无效、待激活或缺少确认" : "买点没有形成集中压制",
      tone: buyPointBlocked.length ? "wait" : "open",
      details: collectTopItems(buyPointBlocked.flatMap((candidate) => [
        candidate.reason,
        ...candidate.activationConditions,
        ...candidate.blockingReasons.filter((reason) => includesAny(reason, ["买点", "回踩", "突破", "分歧", "量能", "承接"]))
      ]), 5)
    },
    {
      key: "data",
      title: "数据完整性",
      value: `${dataBlocked.length}`,
      subtitle: dataBlocked.length || hasDataWarnings(report) ? "字段缺失或来源降级会压制动作" : "关键数据覆盖较完整",
      tone: dataBlocked.length || hasDataWarnings(report) ? "risk" : "open",
      details: [
        ...report.warningSummaries.slice(0, 3).map((warning) => warning.message || warning.impact || warning.action || warning.scope || "数据源告警"),
        ...collectTopItems(dataBlocked.flatMap((candidate) => [
          candidate.dataLevel ? `数据层级：${candidate.name} ${candidate.dataLevel}` : `数据层级：${candidate.name} 未记录`,
          ...candidate.blockingReasons.filter((reason) => includesAny(reason, ["数据", "缺失", "接口", "行情", "资金", "K线"]))
        ]), 4)
      ].filter(isUsefulText)
    },
    {
      key: "reachability",
      title: "盘口可达性",
      value: `${reachabilityBlocked.length}`,
      subtitle: reachabilityBlocked.length ? "涨停、接近涨停或高位拉升不适合追" : "暂无集中不可达问题",
      tone: reachabilityBlocked.length ? "risk" : "open",
      details: collectTopItems(reachabilityBlocked.flatMap((candidate) => [
        `${candidate.name}：${candidate.tradabilityStatus ?? "未记录"}`,
        candidate.reason,
        ...candidate.nextSteps
      ]), 5)
    },
    {
      key: "fund-trend",
      title: "资金 / 趋势",
      value: `${fundTrendBlocked.length}`,
      subtitle: fundTrendBlocked.length ? "资金分歧、流出或趋势破坏" : "资金趋势未形成集中压制",
      tone: fundTrendBlocked.length ? "wait" : "open",
      details: collectTopItems(fundTrendBlocked.flatMap((candidate) => [
        `${candidate.name}：资金${formatFundFlowState(candidate.fundFlowState)}，趋势${formatTrendState(candidate.trendState)}`,
        ...candidate.blockingReasons.filter((reason) => includesAny(reason, ["资金", "流出", "趋势", "均线", "破位", "回落"]))
      ]), 5)
    }
  ];
}

function hasDataWarnings(report: AnalysisReportSummary) {
  return report.providerSummaries.some((provider) => provider.missingCount > 0 || provider.approximateCount > 0) || report.warningSummaries.length > 0;
}

function candidateText(candidate: ReportCandidateSummary) {
  return [
    candidate.reason,
    candidate.tradabilityStatus,
    ...candidate.activationConditions,
    ...candidate.blockingReasons,
    ...candidate.nextSteps
  ].filter(Boolean).join(" ");
}

function collectTopItems(values: Array<string | null | undefined | false>, limit: number) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!isUsefulText(value)) continue;
    const text = value.trim();
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([text, count]) => count > 1 ? `${text}（${count}次）` : text);
}

function includesAny(text: string, keywords: string[]) {
  const normalized = text.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function isUsefulText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim() !== "无";
}

function formatMarketState(value: string) {
  if (value === "tradable") return "可交易";
  if (value === "cautious") return "谨慎";
  if (value === "defensive") return "防守";
  return value || "未知";
}

function formatFundFlowState(value?: string) {
  if (value === "inflow") return "流入";
  if (value === "outflow") return "流出";
  if (value === "mixed") return "分歧";
  return "未知";
}

function formatTrendState(value?: string) {
  if (value === "above_ma20") return "站上MA20";
  if (value === "reclaim_ma20") return "收复MA20";
  if (value === "below_ma20") return "跌破MA20";
  if (value === "downtrend") return "下降趋势";
  return "未知";
}
