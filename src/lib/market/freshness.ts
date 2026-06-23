import type { AnalysisReport } from "@/lib/types";

export type FreshnessStatus = "current" | "stale" | "unknown";

export interface ReportFreshness {
  status: FreshnessStatus;
  reportTradeDate?: string;
  currentTradeDate?: string;
  reportCreatedAt?: string;
  checkedAt?: string;
  isStale: boolean;
  title: string;
  message: string;
  actionHint: string;
}

export interface EffectiveSessionLike {
  timestamp?: string;
  effectiveTradeDate?: string;
  expectedDataBasis?: string;
  phaseLabel?: string;
  phase?: string;
  isTradingDay?: boolean;
  isTradingSession?: boolean;
}

export function getReportTradeDate(report: Pick<AnalysisReport, "createdAt" | "factPackage"> | null | undefined) {
  if (!report) return undefined;
  const explicit = normalizeTradeDate((report.factPackage as { tradeDate?: unknown }).tradeDate);
  if (explicit) return explicit;
  return chinaTradeDateFromIso(report.factPackage?.timestamp ?? report.createdAt);
}

export function buildReportFreshness(
  report: Pick<AnalysisReport, "createdAt" | "factPackage"> | null | undefined,
  session: EffectiveSessionLike | null | undefined
): ReportFreshness {
  if (!report) {
    return {
      status: "unknown",
      currentTradeDate: normalizeTradeDate(session?.effectiveTradeDate),
      checkedAt: session?.timestamp,
      isStale: false,
      title: "等待分析报告",
      message: "当前还没有可展示的分析报告，页面不会给出候选股动作判断。",
      actionHint: "先运行一次分析，生成带交易日基准的报告。"
    };
  }

  const reportTradeDate = getReportTradeDate(report);
  const currentTradeDate = normalizeTradeDate(session?.effectiveTradeDate);
  const checkedAt = session?.timestamp;
  if (!reportTradeDate || !currentTradeDate) {
    return {
      status: "unknown",
      reportTradeDate,
      currentTradeDate,
      reportCreatedAt: report.createdAt,
      checkedAt,
      isStale: false,
      title: "数据基准待确认",
      message: "当前缺少报告交易日或市场有效交易日，不能确认这份报告是否仍然对应当前行情。",
      actionHint: "建议刷新交易时段识别，或重新运行分析补齐交易日基准。"
    };
  }

  return buildSourceFreshness({
    sourceCreatedAt: report.createdAt,
    sourceTradeDate: reportTradeDate,
    currentTradeDate,
    checkedAt,
    sourcePhase: typeof (report.factPackage as { session?: { phase?: unknown } }).session?.phase === "string"
      ? (report.factPackage as { session?: { phase?: string } }).session?.phase
      : undefined,
    currentPhase: session?.phase,
    currentIsTradingSession: session?.isTradingSession,
    currentLabel: "当前行情基准",
    staleTitle: "报告已是历史快照",
    currentTitle: "报告基准匹配当前行情",
    unknownTitle: "报告基准晚于当前时段",
    staleActionHint: "请重新运行今日分析后再把候选股动作当作当前信号。",
    currentActionHint: "仍需结合个股悬浮卡片的最新 K 线时间校验短线动作。"
  });
}

export function buildSourceFreshness(input: {
  sourceCreatedAt?: string;
  sourceTradeDate?: string;
  currentTradeDate?: string;
  checkedAt?: string;
  sourceLabel?: string;
  currentLabel?: string;
  sourcePhase?: string;
  currentPhase?: string;
  currentIsTradingSession?: boolean;
  staleTitle?: string;
  currentTitle?: string;
  unknownTitle?: string;
  staleActionHint?: string;
  currentActionHint?: string;
}): ReportFreshness {
  const reportTradeDate = normalizeTradeDate(input.sourceTradeDate);
  const currentTradeDate = normalizeTradeDate(input.currentTradeDate);
  const sourceLabel = input.sourceLabel ?? "当前报告";
  const currentLabel = input.currentLabel ?? "当前行情基准";

  if (!reportTradeDate || !currentTradeDate) {
    return {
      status: "unknown",
      reportTradeDate,
      currentTradeDate,
      reportCreatedAt: input.sourceCreatedAt,
      checkedAt: input.checkedAt,
      isStale: false,
      title: input.unknownTitle ?? "数据基准待确认",
      message: `缺少${sourceLabel}交易日或${currentLabel}，不能确认数据是否仍然对应当前行情。`,
      actionHint: "建议刷新交易时段识别，或重新运行分析补齐交易日基准。"
    };
  }

  if (reportTradeDate < currentTradeDate) {
    return {
      status: "stale",
      reportTradeDate,
      currentTradeDate,
      reportCreatedAt: input.sourceCreatedAt,
      checkedAt: input.checkedAt,
      isStale: true,
      title: input.staleTitle ?? "数据已是历史快照",
      message: `${sourceLabel}基于 ${formatTradeDate(reportTradeDate)}，${currentLabel}为 ${formatTradeDate(currentTradeDate)}。候选股动作、主线阶段、买点状态均应视为历史快照。`,
      actionHint: input.staleActionHint ?? "请重新运行分析后再把动作当作当前信号。"
    };
  }

  const intradayFreshness = buildSameTradeDateIntradayFreshness({
    sourceCreatedAt: input.sourceCreatedAt,
    checkedAt: input.checkedAt,
    sourcePhase: input.sourcePhase,
    currentPhase: input.currentPhase,
    currentIsTradingSession: input.currentIsTradingSession,
    sourceLabel,
    currentLabel,
    tradeDate: reportTradeDate,
    staleTitle: input.staleTitle,
    staleActionHint: input.staleActionHint
  });
  if (intradayFreshness) return intradayFreshness;

  if (reportTradeDate > currentTradeDate) {
    return {
      status: "unknown",
      reportTradeDate,
      currentTradeDate,
      reportCreatedAt: input.sourceCreatedAt,
      checkedAt: input.checkedAt,
      isStale: false,
      title: input.unknownTitle ?? "数据基准晚于当前时段",
      message: `${sourceLabel}交易日 ${formatTradeDate(reportTradeDate)} 晚于${currentLabel} ${formatTradeDate(currentTradeDate)}，可能是盘前/闭市时段或交易日历校准差异。`,
      actionHint: "请以报告内数据源留痕和交易时段面板为准。"
    };
  }

  return {
    status: "current",
    reportTradeDate,
    currentTradeDate,
    reportCreatedAt: input.sourceCreatedAt,
    checkedAt: input.checkedAt,
    isStale: false,
    title: input.currentTitle ?? "数据基准匹配当前行情",
    message: `${sourceLabel}交易日与${currentLabel}均为 ${formatTradeDate(reportTradeDate)}。`,
    actionHint: input.currentActionHint ?? "仍需结合最新行情时间校验短线动作。"
  };
}

function buildSameTradeDateIntradayFreshness(input: {
  sourceCreatedAt?: string;
  checkedAt?: string;
  sourcePhase?: string;
  currentPhase?: string;
  currentIsTradingSession?: boolean;
  sourceLabel: string;
  currentLabel: string;
  tradeDate: string;
  staleTitle?: string;
  staleActionHint?: string;
}): ReportFreshness | null {
  const sourceAgeMinutes = ageMinutesBetween(input.sourceCreatedAt, input.checkedAt);
  const sourcePhaseRank = phaseRank(input.sourcePhase);
  const currentPhaseRank = phaseRank(input.currentPhase);
  const crossedIntoPostmarket = input.currentPhase === "postmarket" && Boolean(input.sourcePhase && input.sourcePhase !== "postmarket");
  const phaseMovedForward = sourcePhaseRank !== undefined && currentPhaseRank !== undefined && currentPhaseRank > sourcePhaseRank;
  const staleIntraday = Boolean(input.currentIsTradingSession && sourceAgeMinutes !== undefined && sourceAgeMinutes > 30);

  if (!crossedIntoPostmarket && !staleIntraday) return null;

  const phaseText = input.sourcePhase && input.currentPhase
    ? `报告时段为${phaseLabel(input.sourcePhase)}，当前时段为${phaseLabel(input.currentPhase)}`
    : "报告与当前处于同一交易日，但时效已经发生变化";
  const ageText = sourceAgeMinutes !== undefined ? `，生成距今约 ${formatAgeMinutes(sourceAgeMinutes)}` : "";
  const reason = crossedIntoPostmarket
    ? `${phaseText}${ageText}。收盘后应以最新收盘复盘为准，早盘/午后快照里的数据不足、买点和动作只能作为历史过程证据。`
    : `${input.sourceLabel}与${input.currentLabel}同为 ${formatTradeDate(input.tradeDate)}，但${ageText.replace(/^，/, "") || "报告生成时间较早"}，盘中短线信号需要刷新后再使用。`;

  return {
    status: "stale",
    reportTradeDate: input.tradeDate,
    currentTradeDate: input.tradeDate,
    reportCreatedAt: input.sourceCreatedAt,
    checkedAt: input.checkedAt,
    isStale: true,
    title: crossedIntoPostmarket || phaseMovedForward ? "正在查看同日历史快照" : input.staleTitle ?? "报告已是历史快照",
    message: reason,
    actionHint: input.staleActionHint ?? "如果要看当前盘面，请打开最新报告或重新运行分析；不要把旧快照里的“数据不足”理解成当前仍缺数。"
  };
}

function phaseRank(phase?: string) {
  const ranks: Record<string, number> = {
    night_research: 0,
    premarket: 1,
    call_auction: 2,
    morning: 3,
    midday_break: 4,
    afternoon: 5,
    closing_auction: 6,
    postmarket: 7,
    non_trading_day: 0
  };
  return phase ? ranks[phase] : undefined;
}

function phaseLabel(phase: string) {
  const labels: Record<string, string> = {
    night_research: "夜间研究",
    premarket: "盘前计划",
    call_auction: "集合竞价",
    morning: "早盘盯盘",
    midday_break: "午间复盘",
    afternoon: "午后确认",
    closing_auction: "尾盘确认",
    postmarket: "收盘复盘",
    non_trading_day: "非交易日研究"
  };
  return labels[phase] ?? phase;
}

function ageMinutesBetween(source?: string, checkedAt?: string) {
  if (!source || !checkedAt) return undefined;
  const sourceTime = new Date(source).getTime();
  const checkedTime = new Date(checkedAt).getTime();
  if (!Number.isFinite(sourceTime) || !Number.isFinite(checkedTime)) return undefined;
  return Math.max(0, Math.round((checkedTime - sourceTime) / 60_000));
}

function formatAgeMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

export function normalizeTradeDate(value: unknown) {
  if (value === null || value === undefined) return undefined;
  const raw = String(value).trim();
  const compact = raw.replace(/[./-]/g, "");
  return /^\d{8}$/.test(compact) ? compact : undefined;
}

export function formatTradeDate(value?: string) {
  const date = normalizeTradeDate(value);
  if (!date) return "--";
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

export function chinaTradeDateFromIso(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (!map.year || !map.month || !map.day) return undefined;
  return `${map.year}${map.month}${map.day}`;
}
