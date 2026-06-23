import type { AnalysisReport, DataSourceTrace, DataSourceWarningDetail, StockCandidate } from "@/lib/types";
import { normalizeDataSourceWarningDetails } from "@/lib/dataQuality/warningSeverity";
import { buildProviderCapabilityAudit, type ProviderCapabilityAudit } from "@/lib/data/providerCapabilityAudit";

export type ReportDataGapAudit = {
  reportId: string;
  reportTitle: string;
  reportCreatedAt: string;
  reportTradeDate?: string;
  latestReportId?: string;
  latestReportCreatedAt?: string;
  isLatestReport?: boolean;
  generatedAt: string;
  conclusion: "核心数据完整" | "存在软补充项" | "存在关键缺口";
  summary: string;
  candidateSummary: {
    total: number;
    coreComplete: number;
    hardGapCount: number;
    companySupplementCount: number;
  };
  hardCandidateGaps: CandidateGapItem[];
  companySupplementGaps: CandidateGapItem[];
  approximateSectorMappings: SourceTraceItem[];
  fallbackSources: SourceTraceItem[];
  providerCapabilities?: Pick<ProviderCapabilityAudit, "criticalGaps" | "supplementAdvice">;
  warningSummary: {
    risk: DataSourceWarningDetail[];
    warning: DataSourceWarningDetail[];
    info: DataSourceWarningDetail[];
  };
  canSupplement: SupplementPlanItem[];
};

export type CandidateGapItem = {
  code: string;
  name: string;
  sectorName: string;
  action: StockCandidate["action"];
  missingFields: string[];
  blockingReasons: string[];
  companyMissingFields?: string[];
  sourceTraces: SourceTraceItem[];
};

export type SourceTraceItem = {
  scope: DataSourceTrace["scope"];
  field: string;
  subjectCode?: string;
  subjectName?: string;
  providerName: string;
  quality: DataSourceTrace["quality"];
  freshness: DataSourceTrace["freshness"];
  warning?: string;
  fetchedAt?: string;
};

export type SupplementPlanItem = {
  target: string;
  status: "已补齐" | "需要补源" | "需要人工复核";
  reason: string;
  suggestedSource: string;
};

export async function buildReportDataGapAudit(
  report: AnalysisReport,
  options: { latestReportId?: string; latestReportCreatedAt?: string; includeProviderCapabilities?: boolean } = {}
): Promise<ReportDataGapAudit> {
  const hardCandidateGaps = report.factPackage.candidates
    .filter((candidate) => hasHardCandidateGap(candidate))
    .map((candidate) => toCandidateGapItem(candidate, "hard"));
  const companySupplementGaps = report.factPackage.candidates
    .filter((candidate) => !hasHardCandidateGap(candidate) && hasCompanySupplementGap(candidate))
    .map((candidate) => toCandidateGapItem(candidate, "company"));
  const traces = report.factPackage.dataSource.traces ?? [];
  const approximateSectorMappings = traces
    .filter((trace) => trace.scope === "sector" && trace.quality === "approximate")
    .map(toTraceItem);
  const fallbackSources = traces
    .filter((trace) => trace.quality === "fallback")
    .map(toTraceItem);
  const warningSummary = groupWarnings(normalizeDataSourceWarningDetails(report.factPackage.dataSource.warningDetails ?? []));
  const coreComplete = report.factPackage.candidates.filter((candidate) => !hasHardCandidateGap(candidate)).length;
  const providerCapabilities = options.includeProviderCapabilities === false
    ? null
    : await buildProviderCapabilityAudit().catch(() => null);
  const conclusion = hardCandidateGaps.length
    ? "存在关键缺口"
    : companySupplementGaps.length || approximateSectorMappings.length || fallbackSources.length
      ? "存在软补充项"
      : "核心数据完整";

  return {
    reportId: report.id,
    reportTitle: report.title,
    reportCreatedAt: report.createdAt,
    reportTradeDate: report.factPackage.tradeDate,
    latestReportId: options.latestReportId,
    latestReportCreatedAt: options.latestReportCreatedAt,
    isLatestReport: options.latestReportId ? report.id === options.latestReportId : undefined,
    generatedAt: new Date().toISOString(),
    conclusion,
    summary: buildSummary({
      total: report.factPackage.candidates.length,
      coreComplete,
      hardGapCount: hardCandidateGaps.length,
      companySupplementCount: companySupplementGaps.length,
      approximateCount: approximateSectorMappings.length,
      fallbackCount: fallbackSources.length,
      riskWarningCount: warningSummary.risk.length
    }),
    candidateSummary: {
      total: report.factPackage.candidates.length,
      coreComplete,
      hardGapCount: hardCandidateGaps.length,
      companySupplementCount: companySupplementGaps.length
    },
    hardCandidateGaps,
    companySupplementGaps,
    approximateSectorMappings,
    fallbackSources,
    providerCapabilities: providerCapabilities
      ? {
          criticalGaps: providerCapabilities.criticalGaps,
          supplementAdvice: providerCapabilities.supplementAdvice
        }
      : undefined,
    warningSummary,
    canSupplement: buildSupplementPlan({
      hardCandidateGaps,
      companySupplementGaps,
      approximateSectorMappings,
      fallbackSources,
      warnings: warningSummary,
      providerCapabilities
    })
  };
}

function hasHardCandidateGap(candidate: StockCandidate) {
  const data = candidate.dataCompleteness;
  return (data.coreMarketLevel ?? data.level) === "insufficient"
    || !data.hasKlineData
    || !data.hasTechnicalData
    || !data.hasFundFlowData
    || !data.hasSectorData;
}

function hasCompanySupplementGap(candidate: StockCandidate) {
  return candidate.dataCompleteness.companyKnowledgeLevel !== undefined
    && candidate.dataCompleteness.companyKnowledgeLevel !== "sufficient";
}

function toCandidateGapItem(candidate: StockCandidate, mode: "hard" | "company"): CandidateGapItem {
  const missingFields = mode === "hard"
    ? candidate.dataCompleteness.missingFields.filter((field) => field !== "公司认知补充字段")
    : candidate.dataCompleteness.missingFields.filter((field) => field === "公司认知补充字段");
  return {
    code: candidate.code,
    name: candidate.name,
    sectorName: candidate.sectorName,
    action: candidate.action,
    missingFields,
    blockingReasons: candidate.dataCompleteness.blockingReasons,
    companyMissingFields: candidate.companyKnowledge?.missingFields ?? [],
    sourceTraces: (candidate.sourceTraces ?? [])
      .filter((trace) => trace.quality === "missing" || trace.quality === "fallback" || trace.quality === "approximate")
      .map(toTraceItem)
  };
}

function toTraceItem(trace: DataSourceTrace): SourceTraceItem {
  return {
    scope: trace.scope,
    field: trace.field,
    subjectCode: trace.subjectCode,
    subjectName: trace.subjectName,
    providerName: trace.providerName,
    quality: trace.quality,
    freshness: trace.freshness,
    warning: trace.warning,
    fetchedAt: trace.fetchedAt
  };
}

function groupWarnings(warnings: DataSourceWarningDetail[]) {
  return {
    risk: warnings.filter((item) => item.severity === "risk"),
    warning: warnings.filter((item) => item.severity === "warning"),
    info: warnings.filter((item) => item.severity === "info")
  };
}

function buildSummary(input: {
  total: number;
  coreComplete: number;
  hardGapCount: number;
  companySupplementCount: number;
  approximateCount: number;
  fallbackCount: number;
  riskWarningCount: number;
}) {
  if (!input.total) return "本期没有候选股，无法判断候选数据完整性。";
  if (input.hardGapCount) {
    return `本期 ${input.total} 只候选中，${input.hardGapCount} 只存在 K线、技术、资金或主线归属等关键缺口，不能生成可执行买入建议。`;
  }
  const softParts = [
    input.companySupplementCount ? `${input.companySupplementCount} 只公司认知待补` : "",
    input.approximateCount ? `${input.approximateCount} 个板块成分为近似映射` : "",
    input.fallbackCount ? `${input.fallbackCount} 项字段使用备用来源补齐` : "",
    input.riskWarningCount ? `${input.riskWarningCount} 条风险警告需复核` : ""
  ].filter(Boolean);
  if (softParts.length) {
    return `候选核心交易数据 ${input.coreComplete}/${input.total} 已齐；仍有${softParts.join("、")}，这些会降低解释置信度，但不等于个股行情缺失。`;
  }
  return `候选核心交易数据 ${input.coreComplete}/${input.total} 已齐，当前没有硬性数据缺口。`;
}

function buildSupplementPlan(input: {
  hardCandidateGaps: CandidateGapItem[];
  companySupplementGaps: CandidateGapItem[];
  approximateSectorMappings: SourceTraceItem[];
  fallbackSources: SourceTraceItem[];
  warnings: ReturnType<typeof groupWarnings>;
  providerCapabilities: ProviderCapabilityAudit | null;
}): SupplementPlanItem[] {
  const plans: SupplementPlanItem[] = [];
  if (input.hardCandidateGaps.length) {
    plans.push({
      target: "候选股核心行情",
      status: "需要补源",
      reason: `仍有 ${input.hardCandidateGaps.length} 只候选缺 K线、技术、资金或主线归属。`,
      suggestedSource: "东方财富个股报价/日K/资金流、westock-data、Tushare daily/moneyflow"
    });
  } else {
    plans.push({
      target: "候选股核心行情",
      status: "已补齐",
      reason: "本期候选股 K线、技术、资金和主线归属均未发现硬缺口。",
      suggestedSource: "保持现有 东方财富 + westock-data + Tushare 兜底链路"
    });
  }

  if (input.companySupplementGaps.length) {
    plans.push({
      target: "公司认知补充字段",
      status: "需要补源",
      reason: `仍有 ${input.companySupplementGaps.length} 只候选缺少部分公司认知字段，影响长期逻辑和产业链解释。`,
      suggestedSource: "东方财富F10、Tushare fina_indicator/disclosure_date、公告/年报原文"
    });
  }

  if (input.approximateSectorMappings.length) {
    plans.push({
      target: "板块成分精确映射",
      status: "需要人工复核",
      reason: `有 ${input.approximateSectorMappings.length} 个板块使用近似成分来源，需要确认是否会影响主线归属。`,
      suggestedSource: buildSectorConstituentSourceAdvice(input.providerCapabilities)
    });
  }

  if (input.fallbackSources.length) {
    plans.push({
      target: "备用来源留痕",
      status: "已补齐",
      reason: `${input.fallbackSources.length} 项字段已用备用来源补齐，应在页面继续显示来源和时效。`,
      suggestedSource: "字段级来源留痕已记录，后续可做数据源一致性抽检"
    });
  }

  if (input.warnings.risk.length) {
    plans.push({
      target: "风险级数据警告",
      status: "需要人工复核",
      reason: `仍有 ${input.warnings.risk.length} 条风险级数据警告。`,
      suggestedSource: "查看数据源健康面板和接口日志，确认是否影响大盘/候选核心判断"
    });
  }
  return plans;
}

function buildSectorConstituentSourceAdvice(providerCapabilities: ProviderCapabilityAudit | null) {
  const conceptPermissionDenied = providerCapabilities?.criticalGaps.some((gap) => /dc_concept_cons|ths_member|概念成分/.test(gap));
  if (conceptPermissionDenied) {
    return "当前 Tushare 概念成分接口权限不足；可升级 Tushare 权限、接入同花顺/问财成分来源，或维护人工审核主题成分表。";
  }
  return "东方财富板块代码映射、同花顺/问财概念成分、人工别名表";
}
