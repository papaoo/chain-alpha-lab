import { listAnalysisReportSummaries, type ReportProviderSummary } from "@/lib/db/reportSummaries";
import type { AnalysisReport } from "@/lib/types";

export type DataSourceHealthProvider = {
  provider: string;
  providerName: string;
  traceCount: number;
  primaryCount: number;
  fallbackCount: number;
  approximateCount: number;
  missingCount: number;
  latestFetchedAt?: string;
  ageMinutes?: number;
  staleAfterMinutes: number;
  freshnessStatus: "current" | "stale" | "unknown";
  freshnesses: Record<string, number>;
  scopes: Record<string, number>;
  fields: Record<string, number>;
  status: "healthy" | "degraded" | "risk" | "idle";
  impact: string;
};

export type DataSourceHealthWarningGroup = {
  scope: string;
  count: number;
  severity: "risk" | "warning" | "info";
  examples: string[];
  impact: string;
};

export type DataSourceRuleImpact = {
  rule: string;
  status: "ok" | "degraded" | "risk";
  reason: string;
};

export type DataSourceActionability = {
  level: "usable" | "degraded_reference" | "not_actionable";
  label: string;
  summary: string;
  allowedUses: string[];
  blockedUses: string[];
  impactRules: string[];
  staleProviders: string[];
  missingScopes: string[];
  repeatedWarnings: string[];
  blockingReasons: string[];
  downgradeReasons: string[];
  limitedImpactWarnings: string[];
};

export type DataSourceHealthSnapshot = {
  generatedAt: string;
  servedAt?: string;
  cacheStatus?: "hit" | "miss";
  cacheTtlSeconds?: number;
  reportCount: number;
  latestReportId?: string;
  latestReportAt?: string;
  latestReportAgeMinutes?: number;
  overallStatus: "healthy" | "degraded" | "risk" | "empty";
  actionability: DataSourceActionability;
  providers: DataSourceHealthProvider[];
  latestWarningGroups: DataSourceHealthWarningGroup[];
  warningGroups: DataSourceHealthWarningGroup[];
  ruleImpacts: DataSourceRuleImpact[];
};

type ProviderAccumulator = Omit<DataSourceHealthProvider, "status" | "impact">;
type WarningDetail = NonNullable<AnalysisReport["factPackage"]["dataSource"]["warningDetails"]>[number];

const HEALTH_CACHE_TTL_MS = 30_000;
const INTRADAY_STALE_AFTER_MINUTES = 360;
const EOD_STALE_AFTER_MINUTES = 72 * 60;
const REPORT_CURRENT_AFTER_MINUTES = 180;
const REPORT_REFERENCE_AFTER_MINUTES = 36 * 60;
type DataSourceHealthCacheEntry = {
  limit: number;
  expiresAt: number;
  snapshot: DataSourceHealthSnapshot;
};

const globalHealthCache = globalThis as typeof globalThis & {
  __chainAlphaDataSourceHealthCache?: DataSourceHealthCacheEntry | null;
};

export function buildDataSourceHealth(limit = 20): DataSourceHealthSnapshot {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const now = Date.now();
  const healthCache = globalHealthCache.__chainAlphaDataSourceHealthCache ?? null;
  if (healthCache && healthCache.limit === safeLimit && healthCache.expiresAt > now) {
    return {
      ...healthCache.snapshot,
      servedAt: new Date(now).toISOString(),
      cacheStatus: "hit",
      cacheTtlSeconds: Math.ceil((healthCache.expiresAt - now) / 1000)
    };
  }
  const rows = listAnalysisReportSummaries(safeLimit);

  const providerMap = new Map<string, ProviderAccumulator>();
  const warnings: WarningDetail[] = [];
  const latestWarnings = rows[0]?.warningSummaries ?? [];
  let parsedCount = 0;

  for (const row of rows) {
    parsedCount += 1;
    for (const provider of row.providerSummaries) accumulateProviderSummary(providerMap, provider);
    warnings.push(...row.warningSummaries);
  }

  const generatedAt = new Date().toISOString();
  const providers = Array.from(providerMap.values())
    .map((provider) => finalizeProvider(provider, generatedAt))
    .sort((left, right) => statusRank(right.status) - statusRank(left.status) || right.traceCount - left.traceCount);
  const warningGroups = groupWarnings(warnings);
  const latestWarningGroups = groupWarnings(latestWarnings);
  const warningImpact = classifyLatestWarnings(latestWarnings, rows[0]);
  const ruleImpacts = buildRuleImpacts(providers, latestWarningGroups, warningImpact);
  const overallStatus = inferOverallStatus(parsedCount, providers, latestWarningGroups, warningGroups, warningImpact);
  const latestReportAgeMinutes = rows[0]?.createdAt ? minutesBetween(rows[0].createdAt, generatedAt) : undefined;
  const actionability = buildActionability({
    reportCount: parsedCount,
    latestReportAgeMinutes,
    overallStatus,
    providers,
    latestWarningGroups,
    historicalWarningGroups: warningGroups,
    ruleImpacts,
    warningImpact
  });

  const snapshot = {
    generatedAt,
    servedAt: generatedAt,
    cacheStatus: "miss" as const,
    cacheTtlSeconds: Math.ceil(HEALTH_CACHE_TTL_MS / 1000),
    reportCount: parsedCount,
    latestReportId: rows[0]?.reportId,
    latestReportAt: rows[0]?.createdAt,
    latestReportAgeMinutes,
    overallStatus,
    actionability,
    providers,
    latestWarningGroups,
    warningGroups,
    ruleImpacts
  };
  globalHealthCache.__chainAlphaDataSourceHealthCache = {
    limit: safeLimit,
    expiresAt: now + HEALTH_CACHE_TTL_MS,
    snapshot
  };
  return snapshot;
}

function accumulateProviderSummary(map: Map<string, ProviderAccumulator>, provider: ReportProviderSummary) {
  const current = map.get(provider.provider) ?? {
    provider: provider.provider,
    providerName: provider.providerName,
    traceCount: 0,
    primaryCount: 0,
    fallbackCount: 0,
    approximateCount: 0,
    missingCount: 0,
    latestFetchedAt: undefined,
    ageMinutes: undefined,
    staleAfterMinutes: EOD_STALE_AFTER_MINUTES,
    freshnessStatus: "unknown",
    freshnesses: {},
    scopes: {},
    fields: {}
  };
  current.traceCount += provider.traceCount;
  current.primaryCount += provider.primaryCount;
  current.fallbackCount += provider.fallbackCount;
  current.approximateCount += provider.approximateCount;
  current.missingCount += provider.missingCount;
  current.latestFetchedAt = maxIso(current.latestFetchedAt, provider.latestFetchedAt);
  mergeCountMap(current.freshnesses, provider.freshnesses);
  mergeCountMap(current.scopes, provider.scopes);
  mergeCountMap(current.fields, provider.fields);
  map.set(provider.provider, current);
}

function mergeCountMap(target: Record<string, number>, source: Record<string, number>) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

/*
 * Legacy helper kept for older tests/imports. The live health path reads
 * analysis_report_summaries instead of full factPackageJson payloads.
 */
function accumulateTrace(_map: Map<string, ProviderAccumulator>, _trace: never) {
  return;
}

function finalizeProvider(input: ProviderAccumulator, generatedAt: string): DataSourceHealthProvider {
  const missingRatio = input.traceCount ? input.missingCount / input.traceCount : 0;
  const degradedRatio = input.traceCount ? (input.fallbackCount + input.approximateCount + input.missingCount) / input.traceCount : 0;
  const staleAfterMinutes = inferProviderStaleAfterMinutes(input);
  const ageMinutes = input.latestFetchedAt ? minutesBetween(input.latestFetchedAt, generatedAt) : undefined;
  const freshnessStatus: DataSourceHealthProvider["freshnessStatus"] =
    !input.latestFetchedAt || ageMinutes === undefined
      ? "unknown"
      : ageMinutes > staleAfterMinutes
        ? "stale"
        : "current";
  const status: DataSourceHealthProvider["status"] =
    input.traceCount === 0
      ? "idle"
      : missingRatio >= 0.25 || freshnessStatus === "stale"
        ? "risk"
        : degradedRatio >= 0.25 || input.missingCount > 0
          ? "degraded"
          : "healthy";
  return {
    ...input,
    ageMinutes,
    staleAfterMinutes,
    freshnessStatus,
    status,
    impact: providerImpact(input, status)
  };
}

function providerImpact(input: ProviderAccumulator, status: DataSourceHealthProvider["status"]) {
  const scopes = Object.keys(input.scopes).join("、") || "未知范围";
  if (status === "risk") return `${input.providerName} 存在较多缺失字段，会影响 ${scopes} 相关规则的可信度。`;
  if (status === "degraded") return `${input.providerName} 最近启用了 fallback、近似或缺失留痕，${scopes} 需要降级解读。`;
  if (status === "idle") return `${input.providerName} 最近没有被分析链路触发。`;
  return `${input.providerName} 最近留痕正常，覆盖 ${scopes}。`;
}

function groupWarnings(warnings: WarningDetail[]): DataSourceHealthWarningGroup[] {
  const map = new Map<string, DataSourceHealthWarningGroup>();
  for (const warning of warnings) {
    const key = `${warning.scope}-${warning.severity}`;
    const current = map.get(key) ?? {
      scope: warning.scope,
      count: 0,
      severity: warning.severity,
      examples: [],
      impact: warning.impact
    };
    current.count += 1;
    if (current.examples.length < 3 && !current.examples.includes(warning.message)) current.examples.push(warning.message);
    map.set(key, current);
  }
  return Array.from(map.values()).sort((left, right) => severityRank(right.severity) - severityRank(left.severity) || right.count - left.count);
}

type LatestWarningImpact = {
  blockingWarnings: WarningDetail[];
  downgradeWarnings: WarningDetail[];
  limitedImpactWarnings: WarningDetail[];
};

function classifyLatestWarnings(warnings: WarningDetail[], latestSummary: ReturnType<typeof listAnalysisReportSummaries>[number] | undefined): LatestWarningImpact {
  const candidateSectorNames = new Set((latestSummary?.candidateSummaries ?? []).map((candidate) => candidate.sectorName).filter(Boolean));
  const blockingWarnings: WarningDetail[] = [];
  const downgradeWarnings: WarningDetail[] = [];
  const limitedImpactWarnings: WarningDetail[] = [];

  for (const warning of warnings) {
    if (warning.severity === "info") {
      limitedImpactWarnings.push(warning);
      continue;
    }
    if (isBlockingWarning(warning, candidateSectorNames)) {
      blockingWarnings.push(warning);
      continue;
    }
    if (warning.severity === "risk" && warning.scope === "sector") limitedImpactWarnings.push(warning);
    else downgradeWarnings.push(warning);
  }

  return { blockingWarnings, downgradeWarnings, limitedImpactWarnings };
}

function isBlockingWarning(warning: WarningDetail, candidateSectorNames: Set<string>) {
  if (warning.severity !== "risk") return false;
  if (warning.scope === "market" || warning.scope === "stock") return true;
  if (warning.scope === "sector") return warningMentionsCurrentSector(warning.message, candidateSectorNames);
  if (warning.scope === "system") return /全A|宽度|涨跌停|涨停|跌停|指数|候选|个股|K线|资金流|行情/.test(warning.message);
  return false;
}

function warningMentionsCurrentSector(message: string, candidateSectorNames: Set<string>) {
  for (const sectorName of candidateSectorNames) {
    if (sectorName && message.includes(sectorName)) return true;
  }
  return false;
}

function buildRuleImpacts(
  providers: DataSourceHealthProvider[],
  warningGroups: DataSourceHealthWarningGroup[],
  warningImpact: LatestWarningImpact
): DataSourceRuleImpact[] {
  const marketRisk = warningImpact.blockingWarnings.some((warning) => warning.scope === "market");
  const sectorBlockingRisk = warningImpact.blockingWarnings.some((warning) => warning.scope === "sector");
  const sectorLimitedRisk = warningImpact.limitedImpactWarnings.some((warning) => warning.scope === "sector" && warning.severity === "risk");
  const stockRisk = warningImpact.blockingWarnings.some((warning) => warning.scope === "stock");
  const companyRisk = warningGroups.some((group) => group.scope === "company" && group.severity === "risk");
  const hasTushare = providers.some((provider) => provider.provider === "tushare" && provider.traceCount > 0);
  const hasEastmoney = providers.some((provider) => provider.provider === "eastmoney_public" && provider.traceCount > 0);
  const hasWestock = providers.some((provider) => provider.provider === "tencent_zixuangu" && provider.traceCount > 0);

  return [
    {
      rule: "规则1 大盘状态",
      status: marketRisk ? "risk" : !hasEastmoney || !hasWestock ? "degraded" : "ok",
      reason: marketRisk ? "市场宽度、涨跌停池或指数数据存在风险警告。" : "指数、宽度和情绪数据源最近有可用留痕。"
    },
    {
      rule: "规则2 主线阶段",
      status: sectorBlockingRisk ? "risk" : sectorLimitedRisk || !hasEastmoney ? "degraded" : "ok",
      reason: sectorBlockingRisk
        ? "当前候选池或主线依赖的板块映射、成分股或板块资金存在风险警告。"
        : sectorLimitedRisk
          ? "存在未命中当前候选池的板块映射风险，主线阶段可以使用但需要降级复核。"
          : "板块行情、成分和资金数据最近有可用留痕。"
    },
    {
      rule: "规则3 候选强股",
      status: stockRisk ? "risk" : !hasWestock ? "degraded" : "ok",
      reason: stockRisk ? "候选股 K 线、技术指标、资金流或归属数据存在风险警告。" : "候选股行情、资金和技术数据最近有可用留痕。"
    },
    {
      rule: "公司认知/财务层",
      status: companyRisk ? "risk" : hasTushare || hasEastmoney ? "ok" : "degraded",
      reason: companyRisk ? "公司资料、财务或股东数据存在风险警告。" : "F10、财务或 Tushare 补源最近有可用留痕。"
    }
  ];
}

function inferOverallStatus(
  reportCount: number,
  providers: DataSourceHealthProvider[],
  latestWarningGroups: DataSourceHealthWarningGroup[],
  historicalWarningGroups: DataSourceHealthWarningGroup[],
  warningImpact: LatestWarningImpact
): DataSourceHealthSnapshot["overallStatus"] {
  if (!reportCount) return "empty";
  if (warningImpact.blockingWarnings.length || providers.some((provider) => provider.status === "risk")) return "risk";
  if (latestWarningGroups.length || historicalWarningGroups.length || providers.some((provider) => provider.status === "degraded")) return "degraded";
  return "healthy";
}

function buildActionability(input: {
  reportCount: number;
  latestReportAgeMinutes?: number;
  overallStatus: DataSourceHealthSnapshot["overallStatus"];
  providers: DataSourceHealthProvider[];
  latestWarningGroups: DataSourceHealthWarningGroup[];
  historicalWarningGroups: DataSourceHealthWarningGroup[];
  ruleImpacts: DataSourceRuleImpact[];
  warningImpact: LatestWarningImpact;
}): DataSourceActionability {
  const staleProviders = input.providers.filter((provider) => provider.freshnessStatus === "stale").map((provider) => provider.providerName);
  const riskyRules = input.ruleImpacts.filter((rule) => rule.status === "risk").map((rule) => rule.rule);
  const degradedRules = input.ruleImpacts.filter((rule) => rule.status !== "ok").map((rule) => rule.rule);
  const missingScopes = Array.from(new Set(input.latestWarningGroups.filter((group) => group.severity !== "info").map((group) => scopeName(group.scope))));
  const repeatedWarnings = input.historicalWarningGroups
    .filter((group) => group.count >= 2)
    .slice(0, 5)
    .map((group) => `${scopeName(group.scope)}：${group.examples[0] ?? group.impact}`);
  const latestAge = input.latestReportAgeMinutes;
  const reportIsCurrent = latestAge !== undefined && latestAge <= REPORT_CURRENT_AFTER_MINUTES;
  const reportIsReference = latestAge === undefined || latestAge <= REPORT_REFERENCE_AFTER_MINUTES;
  const blockingReasons = input.warningImpact.blockingWarnings.map(formatWarningReason);
  const downgradeReasons = [
    ...input.warningImpact.downgradeWarnings.map(formatWarningReason),
    ...input.warningImpact.limitedImpactWarnings.map((warning) => `影响范围有限：${formatWarningReason(warning)}`)
  ];
  const limitedImpactWarnings = input.warningImpact.limitedImpactWarnings.map(formatWarningReason);
  const hasHardRisk = input.overallStatus === "empty" || blockingReasons.length > 0 || riskyRules.length > 0 || !reportIsReference;

  if (!input.reportCount || hasHardRisk) {
    return {
      level: "not_actionable",
      label: "不可直接行动",
      summary: !input.reportCount
        ? "还没有可用于审计的数据源历史，系统不能把当前结论当作交易依据。"
        : !reportIsReference
          ? "最新正式报告已经明显过期，只能用于复盘和排查数据链路，不能作为当前买卖信号。"
          : "关键规则存在高风险数据缺口，必须先刷新或补齐来源后再生成行动建议。",
      allowedUses: ["复盘历史报告", "定位缺失字段", "检查数据源稳定性"],
      blockedUses: ["直接触发买入/卖出", "放宽仓位约束", "把旧候选池当作当前盘口"],
      impactRules: riskyRules.length ? riskyRules : degradedRules,
      staleProviders,
      missingScopes,
      repeatedWarnings,
      blockingReasons,
      downgradeReasons,
      limitedImpactWarnings
    };
  }

  if (input.overallStatus !== "healthy" || staleProviders.length > 0 || !reportIsCurrent || degradedRules.length > 0) {
    return {
      level: "degraded_reference",
      label: "降级参考",
      summary: "数据链路存在降级、警告或时效不够新，可以用于结构判断和复盘，但交易动作需要重新刷新快照确认。",
      allowedUses: ["判断主线结构", "比较数据源稳定性", "生成观察清单", "复盘候选池变化"],
      blockedUses: ["直接新开仓", "把潜在买点升级为正式买点", "忽略缺失字段给出强结论"],
      impactRules: degradedRules,
      staleProviders,
      missingScopes,
      repeatedWarnings,
      blockingReasons,
      downgradeReasons,
      limitedImpactWarnings
    };
  }

  return {
    level: "usable",
    label: "可支撑当前分析",
    summary: "最近正式报告的数据源覆盖和时效满足当前规则分析，可以作为规则结论的证据基础。",
    allowedUses: ["生成大盘状态", "判断主线阶段", "筛选候选强股", "形成观察/试错条件"],
    blockedUses: ["突破硬风控上限", "绕过个股买点确认", "忽略盘口实时变化"],
    impactRules: [],
    staleProviders: [],
    missingScopes: [],
    repeatedWarnings: [],
    blockingReasons: [],
    downgradeReasons: [],
    limitedImpactWarnings: []
  };
}

function formatWarningReason(warning: WarningDetail) {
  return `${scopeName(warning.scope)}：${warning.message}`;
}

function inferProviderStaleAfterMinutes(input: Pick<DataSourceHealthProvider, "freshnesses">) {
  const hasIntraday = Boolean(input.freshnesses.realtime || input.freshnesses.delayed);
  return hasIntraday ? INTRADAY_STALE_AFTER_MINUTES : EOD_STALE_AFTER_MINUTES;
}

function minutesBetween(left: string, right: string) {
  const start = new Date(left).getTime();
  const end = new Date(right).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;
  return Math.max(0, Math.round((end - start) / 60_000));
}

function scopeName(scope: string) {
  const labels: Record<string, string> = {
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

function maxIso(left: string | undefined, right: string | undefined) {
  if (!right) return left;
  if (!left) return right;
  return right > left ? right : left;
}

function safeJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function statusRank(status: DataSourceHealthProvider["status"]) {
  if (status === "risk") return 3;
  if (status === "degraded") return 2;
  if (status === "healthy") return 1;
  return 0;
}

function severityRank(severity: DataSourceHealthWarningGroup["severity"]) {
  if (severity === "risk") return 3;
  if (severity === "warning") return 2;
  return 1;
}
