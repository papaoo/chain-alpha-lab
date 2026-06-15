import { dbAll } from "@/lib/db/client";
import type { AnalysisReport, DataSourceTrace } from "@/lib/types";

export type DataSourceHealthProvider = {
  provider: string;
  providerName: string;
  traceCount: number;
  primaryCount: number;
  fallbackCount: number;
  approximateCount: number;
  missingCount: number;
  latestFetchedAt?: string;
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

export type DataSourceHealthSnapshot = {
  generatedAt: string;
  reportCount: number;
  latestReportId?: string;
  latestReportAt?: string;
  overallStatus: "healthy" | "degraded" | "risk" | "empty";
  providers: DataSourceHealthProvider[];
  warningGroups: DataSourceHealthWarningGroup[];
  ruleImpacts: DataSourceRuleImpact[];
};

type ReportRow = {
  id: string;
  createdAt: string;
  factPackageJson: string;
};

type ProviderAccumulator = Omit<DataSourceHealthProvider, "status" | "impact">;
type WarningDetail = NonNullable<AnalysisReport["factPackage"]["dataSource"]["warningDetails"]>[number];

export function buildDataSourceHealth(limit = 20): DataSourceHealthSnapshot {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const rows = dbAll<ReportRow>(
    `select id, createdAt, factPackageJson
       from analysis_reports
       where reportType = 'full'
       order by createdAt desc
       limit ?`,
    [safeLimit],
    { label: "analysis_reports.data_source_health", slowMs: 300 }
  );

  const providerMap = new Map<string, ProviderAccumulator>();
  const warnings: WarningDetail[] = [];
  let parsedCount = 0;

  for (const row of rows) {
    const factPackage = safeJson<AnalysisReport["factPackage"]>(row.factPackageJson);
    if (!factPackage) continue;
    parsedCount += 1;
    for (const trace of factPackage.dataSource.traces ?? []) accumulateTrace(providerMap, trace);
    warnings.push(...(factPackage.dataSource.warningDetails ?? []));
  }

  const providers = Array.from(providerMap.values())
    .map(finalizeProvider)
    .sort((left, right) => statusRank(right.status) - statusRank(left.status) || right.traceCount - left.traceCount);
  const warningGroups = groupWarnings(warnings);
  const ruleImpacts = buildRuleImpacts(providers, warningGroups);
  const overallStatus = inferOverallStatus(parsedCount, providers, warningGroups);

  return {
    generatedAt: new Date().toISOString(),
    reportCount: parsedCount,
    latestReportId: rows[0]?.id,
    latestReportAt: rows[0]?.createdAt,
    overallStatus,
    providers,
    warningGroups,
    ruleImpacts
  };
}

function accumulateTrace(map: Map<string, ProviderAccumulator>, trace: DataSourceTrace) {
  const key = trace.provider;
  const current = map.get(key) ?? {
    provider: trace.provider,
    providerName: trace.providerName,
    traceCount: 0,
    primaryCount: 0,
    fallbackCount: 0,
    approximateCount: 0,
    missingCount: 0,
    latestFetchedAt: undefined,
    scopes: {},
    fields: {}
  };
  current.traceCount += 1;
  if (trace.quality === "primary" || trace.quality === "derived") current.primaryCount += 1;
  if (trace.quality === "fallback") current.fallbackCount += 1;
  if (trace.quality === "approximate") current.approximateCount += 1;
  if (trace.quality === "missing") current.missingCount += 1;
  current.latestFetchedAt = maxIso(current.latestFetchedAt, trace.fetchedAt);
  current.scopes[trace.scope] = (current.scopes[trace.scope] ?? 0) + 1;
  current.fields[trace.field] = (current.fields[trace.field] ?? 0) + 1;
  map.set(key, current);
}

function finalizeProvider(input: ProviderAccumulator): DataSourceHealthProvider {
  const missingRatio = input.traceCount ? input.missingCount / input.traceCount : 0;
  const degradedRatio = input.traceCount ? (input.fallbackCount + input.approximateCount + input.missingCount) / input.traceCount : 0;
  const status: DataSourceHealthProvider["status"] =
    input.traceCount === 0
      ? "idle"
      : missingRatio >= 0.25
        ? "risk"
        : degradedRatio >= 0.25 || input.missingCount > 0
          ? "degraded"
          : "healthy";
  return {
    ...input,
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

function buildRuleImpacts(providers: DataSourceHealthProvider[], warningGroups: DataSourceHealthWarningGroup[]): DataSourceRuleImpact[] {
  const marketRisk = warningGroups.some((group) => group.scope === "market" && group.severity === "risk");
  const sectorRisk = warningGroups.some((group) => group.scope === "sector" && group.severity === "risk");
  const stockRisk = warningGroups.some((group) => group.scope === "stock" && group.severity === "risk");
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
      status: sectorRisk ? "risk" : !hasEastmoney ? "degraded" : "ok",
      reason: sectorRisk ? "板块映射、成分股或板块资金存在风险警告。" : "板块行情、成分和资金数据最近有可用留痕。"
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

function inferOverallStatus(reportCount: number, providers: DataSourceHealthProvider[], warningGroups: DataSourceHealthWarningGroup[]): DataSourceHealthSnapshot["overallStatus"] {
  if (!reportCount) return "empty";
  if (warningGroups.some((group) => group.severity === "risk" && group.count >= 3) || providers.some((provider) => provider.status === "risk")) return "risk";
  if (warningGroups.length || providers.some((provider) => provider.status === "degraded")) return "degraded";
  return "healthy";
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
