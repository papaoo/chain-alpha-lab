import { cleanDisplayList, cleanDisplayText } from "@/lib/display/text";
import type { StockTrackingItem } from "@/lib/db/stockTracking";
import type { AnalysisReport, DataSourceWarningDetail } from "@/lib/types";

export type RiskAlertLevel = "high" | "medium" | "low";
export type RiskAlertScope = "大盘" | "数据" | "主线" | "个股" | "追踪";

export type RiskSessionLike = {
  isTradingSession?: boolean;
  isTradingDay?: boolean;
  phaseLabel?: string;
  expectedDataBasis?: string;
  restrictions?: string[];
};

export type RiskAlert = {
  id: string;
  level: RiskAlertLevel;
  scope: RiskAlertScope;
  title: string;
  summary: string;
  evidence: string[];
  action: string;
  code?: string;
  name?: string;
};

export type RiskAlertSummary = {
  high: number;
  medium: number;
  low: number;
  trackingActive: number;
  trackingRisk: number;
  dataWarnings: number;
  stale: boolean;
};

export function buildRiskAlerts(input: {
  report: AnalysisReport | null;
  session: RiskSessionLike | null;
  trackingItems: StockTrackingItem[];
  trackingError?: string;
}): RiskAlert[] {
  const { report, session, trackingItems, trackingError = "" } = input;
  const alerts: RiskAlert[] = [];
  if (!report) {
    alerts.push({
      id: "report-missing",
      level: "high",
      scope: "数据",
      title: "没有可用报告",
      summary: "当前缺少最新分析报告，不能生成任何交易相关预警。",
      evidence: ["报告为空"],
      action: "先运行今日分析，生成带交易日基准和数据源留痕的报告。"
    });
    return alerts;
  }

  const market = report.ruleResult.market;
  if (market.marketState === "defensive") {
    alerts.push({
      id: "market-defensive",
      level: "high",
      scope: "大盘",
      title: "大盘处于防守观望",
      summary: `总仓上限 ${market.maxTotalPositionPct}% ，单票上限 ${market.maxSingleStockPct}% 。`,
      evidence: cleanList([...market.riskFlags, ...market.forbiddenActions]).slice(0, 6),
      action: "不把候选股强度直接转成买入动作，只保留观察和次日验证条件。"
    });
  } else if (market.marketState === "cautious") {
    alerts.push({
      id: "market-cautious",
      level: "medium",
      scope: "大盘",
      title: "大盘只允许谨慎交易",
      summary: `总仓上限 ${market.maxTotalPositionPct}% ，需要主线与买点同步确认。`,
      evidence: cleanList(market.riskFlags).slice(0, 4),
      action: "优先等待核心股回踩、分歧修复或主线确认，不追后排。"
    });
  }

  if (!session?.isTradingSession) {
    alerts.push({
      id: "session-reference",
      level: session?.isTradingDay ? "medium" : "low",
      scope: "数据",
      title: session?.phaseLabel ? `${session.phaseLabel}只适合参考研判` : "非盘中数据只适合参考",
      summary: session?.expectedDataBasis ?? "当前报价可能是上一有效交易快照。",
      evidence: cleanList(session?.restrictions ?? []).slice(0, 4),
      action: "涉及买入、止损、涨停可达性的判断，等盘中真实报价刷新后再确认。"
    });
  }

  const dataWarnings = report.factPackage.dataSource.warningDetails ?? [];
  const riskWarnings = dataWarnings.filter((item) => item.severity === "risk");
  if (riskWarnings.length) {
    alerts.push({
      id: "data-risk",
      level: "high",
      scope: "数据",
      title: "关键数据源存在风险级提示",
      summary: `${riskWarnings.length} 条风险级数据源提示会影响规则判断。`,
      evidence: riskWarnings.map(formatRiskWarningDetail).slice(0, 5),
      action: "先查看数据源状态，缺少盘口、涨跌停池、宽度或 K 线时不要把报告当作当前信号。"
    });
  } else if (report.factPackage.dataSource.warnings.length) {
    alerts.push({
      id: "data-warning",
      level: "medium",
      scope: "数据",
      title: "数据源存在降级或缺口",
      summary: `${report.factPackage.dataSource.warnings.length} 条数据源提示，需要降级解读。`,
      evidence: cleanList(report.factPackage.dataSource.warnings).slice(0, 5),
      action: "优先检查警告影响范围，避免用部分数据推导强结论。"
    });
  }

  for (const sector of report.ruleResult.sectors.slice(0, 8)) {
    if (sector.stage !== "退潮" && sector.stage !== "分歧") continue;
    alerts.push({
      id: `sector-${sector.name}-${sector.stage}`,
      level: sector.stage === "退潮" ? "high" : "medium",
      scope: "主线",
      title: `${cleanText(sector.name)}处于${sector.stage}`,
      summary: `阶段分 ${sector.score}/100，核心强度 ${sector.coreStrength}/100，资金分 ${sector.fundingScore}/25。`,
      evidence: cleanList([...sector.invalidConditions, ...sector.riskFlags, sector.stageTransitionReason].filter(Boolean) as string[]).slice(0, 5),
      action: sector.stage === "退潮" ? "不新增该主线暴露，已有观察股优先验证失效条件。" : "只看核心承接和回封质量，后排反弹不作为确认。"
    });
  }

  for (const forecast of report.llmResult?.mainlineStageForecasts ?? []) {
    if (!forecast.invalidCondition) continue;
    alerts.push({
      id: `forecast-${forecast.name}`,
      level: forecast.nextStage === "退潮" || forecast.nextStage === "分歧" ? "medium" : "low",
      scope: "主线",
      title: `${cleanText(forecast.name)}阶段推演需验证`,
      summary: `当前 ${forecast.currentStage}，下一阶段倾向 ${forecast.nextStage}。`,
      evidence: cleanList([forecast.triggerCondition, forecast.invalidCondition]).slice(0, 3),
      action: "把触发条件和失效条件加入盘中观察，未满足前不提前升级主线。"
    });
  }

  for (const candidate of report.ruleResult.candidates.slice(0, 12)) {
    const highRiskAction = candidate.action === "回避" || candidate.action === "数据不足";
    const noBuy = candidate.action === "不追" || candidate.positionLimitPct <= 0;
    if (!highRiskAction && !noBuy && candidate.riskFlags.length < 3) continue;
    alerts.push({
      id: `candidate-${candidate.code}`,
      level: highRiskAction ? "high" : noBuy ? "medium" : "low",
      scope: "个股",
      title: `${cleanText(candidate.name)}：${candidate.action}`,
      summary: `信号 ${candidate.signalLabel ?? candidate.buyPointEvaluation?.status ?? candidate.buyPointType}，仓位上限 ${candidate.positionLimitPct}% 。`,
      evidence: cleanList([candidate.invalidCondition, ...(candidate.riskFlags ?? [])]).slice(0, 5),
      action: candidate.buyPointEvaluation?.triggerCondition ?? candidate.tradability?.waitFor ?? "只保留观察，不把风险项未解除的个股转成买入动作。",
      code: candidate.code,
      name: candidate.name
    });
  }

  if (trackingError) {
    alerts.push({
      id: "tracking-error",
      level: "medium",
      scope: "追踪",
      title: "个股追踪列表读取失败",
      summary: trackingError,
      evidence: [trackingError],
      action: "先确认追踪接口和本地服务状态，否则无法监控加入后的涨跌与失效条件。"
    });
  }

  for (const item of trackingItems) {
    const state = item.derivedState?.state;
    const latestReturn = item.performance?.latestReturnPct;
    const danger = state === "invalidated" || state === "risk_deteriorating";
    const weakReturn = latestReturn !== undefined && latestReturn <= -5;
    const missing = state === "data_insufficient";
    if (!danger && !weakReturn && !missing) continue;
    alerts.push({
      id: `tracking-${item.id}`,
      level: danger || weakReturn ? "high" : "medium",
      scope: "追踪",
      title: `${cleanText(item.name)}追踪异常`,
      summary: `${item.derivedState?.label ?? "需要复核"}，加入以来 ${formatRiskPct(latestReturn)} 。`,
      evidence: cleanList([
        item.derivedState?.reason,
        item.invalidCondition,
        ...(item.riskNotes ?? []),
        ...(item.latestSnapshot?.recommendationReason ? [item.latestSnapshot.recommendationReason] : [])
      ]).slice(0, 5),
      action: item.derivedState?.nextAction ?? "复核最新快照和原始失效条件。",
      code: item.code,
      name: item.name
    });
  }

  return alerts;
}

export function buildRiskSummary(input: {
  alerts: RiskAlert[];
  report: AnalysisReport | null;
  trackingItems: StockTrackingItem[];
  freshnessStatus: string;
}): RiskAlertSummary {
  const { alerts, report, trackingItems, freshnessStatus } = input;
  return {
    high: alerts.filter((item) => item.level === "high").length,
    medium: alerts.filter((item) => item.level === "medium").length,
    low: alerts.filter((item) => item.level === "low").length,
    trackingActive: trackingItems.length,
    trackingRisk: trackingItems.filter((item) => item.derivedState?.severity === "danger" || item.derivedState?.severity === "warning").length,
    dataWarnings: report?.factPackage.dataSource.warnings.length ?? 0,
    stale: freshnessStatus === "stale"
  };
}

export function formatRiskWarningDetail(item: DataSourceWarningDetail) {
  return `${warningScopeLabel(item.scope)}：${cleanText(item.message) ?? item.message}。影响：${cleanText(item.impact) ?? item.impact}`;
}

export function formatRiskPct(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function cleanList(values: Array<string | undefined | null>) {
  return cleanDisplayList(values.filter(Boolean) as string[]);
}

function cleanText(value?: string | null) {
  return cleanDisplayText(value);
}

function warningScopeLabel(scope: DataSourceWarningDetail["scope"]) {
  const labels: Record<DataSourceWarningDetail["scope"], string> = {
    market: "大盘",
    sector: "板块",
    stock: "个股",
    company: "公司",
    calendar: "日历",
    model: "模型",
    system: "系统"
  };
  return labels[scope] ?? scope;
}
