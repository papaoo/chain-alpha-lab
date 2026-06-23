import { dbAll } from "@/lib/db/client";
import { localizeModelError } from "@/lib/display/modelErrorText";
import type { SelectionLlmMetrics } from "@/lib/selection/types";
import type { LlmCallMetrics } from "@/lib/types";

type AnalysisMetricRow = {
  id: string;
  createdAt: string;
  llmStatus: string;
  llmMetricsJson: string | null;
};

type SelectionMetricRow = {
  id: string;
  strategyName: string;
  mode: string;
  status: string;
  startedAt: string;
  resultJson: string | null;
};

export interface ModelUsageCall {
  id: string;
  source: "analysis_report" | "selection_agent";
  label: string;
  createdAt: string;
  status: string;
  provider?: string;
  model?: string;
  elapsedMs?: number;
  requestCount?: number;
  retryCount?: number;
  errorCount?: number;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  totalTokens?: number;
  promptChars?: number;
  responseChars?: number;
  skippedOrDisabledReason?: string;
  errors: string[];
}

export interface ModelUsageErrorCategory {
  key: string;
  label: string;
  count: number;
  sampleMessages: string[];
  mitigation: string;
}

export interface ModelUsageSummary {
  generatedAt: string;
  windowDays: number;
  callCount: number;
  analysisCallCount: number;
  selectionAgentCallCount: number;
  successCount: number;
  failedOrRejectedCount: number;
  disabledOrSkippedCount: number;
  totalEstimatedInputTokens: number | null;
  totalEstimatedOutputTokens: number | null;
  totalReportedTokens: number | null;
  avgElapsedMs: number | null;
  maxElapsedMs: number | null;
  repairOrRetryCount: number;
  errorCount: number;
  providerDistribution: Array<{ key: string; count: number }>;
  modelDistribution: Array<{ key: string; count: number }>;
  errorCategories: ModelUsageErrorCategory[];
  recentCalls: ModelUsageCall[];
  notes: string[];
}

export function buildModelUsageSummary(options?: { limit?: number; windowDays?: number }): ModelUsageSummary {
  const limit = Math.min(Math.max(options?.limit ?? 80, 1), 300);
  const windowDays = Math.min(Math.max(options?.windowDays ?? 30, 1), 365);
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const calls = [
    ...readAnalysisCalls(since, limit),
    ...readSelectionAgentCalls(since, limit)
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const visibleCalls = calls.slice(0, limit);
  const elapsedValues = visibleCalls.map((call) => call.elapsedMs).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const inputTokens = sumNullable(visibleCalls.map((call) => call.estimatedInputTokens));
  const outputTokens = sumNullable(visibleCalls.map((call) => call.estimatedOutputTokens));
  const reportedTokens = sumNullable(visibleCalls.map((call) => call.totalTokens));

  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    callCount: visibleCalls.length,
    analysisCallCount: visibleCalls.filter((call) => call.source === "analysis_report").length,
    selectionAgentCallCount: visibleCalls.filter((call) => call.source === "selection_agent").length,
    successCount: visibleCalls.filter((call) => isSuccessStatus(call.status)).length,
    failedOrRejectedCount: visibleCalls.filter((call) => isFailedStatus(call.status)).length,
    disabledOrSkippedCount: visibleCalls.filter((call) => isDisabledStatus(call.status)).length,
    totalEstimatedInputTokens: inputTokens,
    totalEstimatedOutputTokens: outputTokens,
    totalReportedTokens: reportedTokens,
    avgElapsedMs: elapsedValues.length ? Math.round(elapsedValues.reduce((sum, value) => sum + value, 0) / elapsedValues.length) : null,
    maxElapsedMs: elapsedValues.length ? Math.max(...elapsedValues) : null,
    repairOrRetryCount: visibleCalls.filter((call) => (call.requestCount ?? 1) > 1 || (call.retryCount ?? 0) > 0).length,
    errorCount: visibleCalls.reduce((sum, call) => sum + (call.errorCount ?? 0), 0),
    providerDistribution: countDistribution(visibleCalls.map((call) => call.provider ?? "未记录")),
    modelDistribution: countDistribution(visibleCalls.map((call) => call.model ?? "未记录")),
    errorCategories: buildErrorCategories(visibleCalls),
    recentCalls: visibleCalls.slice(0, 12).map(localizeCallForDisplay),
    notes: buildUsageNotes(visibleCalls, inputTokens, outputTokens, reportedTokens)
  };
}

function readAnalysisCalls(since: string, limit: number): ModelUsageCall[] {
  const rows = dbAll<AnalysisMetricRow>(
    `select id, createdAt, llmStatus, llmMetricsJson
       from analysis_reports
      where createdAt >= ?
        and llmMetricsJson is not null
      order by createdAt desc
      limit ?`,
    [since, limit],
    { label: "model_usage.analysis" }
  );
  return rows.flatMap((row) => {
    const metrics = safeJson<LlmCallMetrics>(row.llmMetricsJson);
    if (!metrics) return [];
    return [{
      id: row.id,
      source: "analysis_report" as const,
      label: "主线分析报告",
      createdAt: row.createdAt,
      status: metrics.status ?? row.llmStatus,
      provider: metrics.provider,
      model: metrics.model,
      elapsedMs: metrics.elapsedMs,
      requestCount: metrics.requestCount,
      retryCount: metrics.repairAttempted ? 1 : 0,
      errorCount: metrics.errorCount,
      estimatedInputTokens: metrics.estimatedInputTokens,
      promptChars: metrics.reportPromptChars + (metrics.repairPromptChars ?? 0),
      skippedOrDisabledReason: metrics.skippedRepairReason,
      errors: metrics.errors ?? []
    }];
  });
}

function readSelectionAgentCalls(since: string, limit: number): ModelUsageCall[] {
  const rows = dbAll<SelectionMetricRow>(
    `select id, strategyName, mode, status, startedAt, resultJson
       from selection_runs
      where startedAt >= ?
        and resultJson is not null
      order by startedAt desc
      limit ?`,
    [since, limit],
    { label: "model_usage.selection" }
  );
  return rows.flatMap((row) => {
    const result = safeJson<{ llmMetrics?: SelectionLlmMetrics; llmStatus?: string; llmErrors?: string[] }>(row.resultJson);
    const metrics = result?.llmMetrics;
    if (!metrics) return [];
    return [{
      id: row.id,
      source: "selection_agent" as const,
      label: `${row.strategyName} Agent 复核`,
      createdAt: row.startedAt,
      status: metrics.status ?? result?.llmStatus ?? row.status,
      provider: metrics.provider,
      model: metrics.model,
      elapsedMs: metrics.elapsedMs,
      requestCount: metrics.retryCount ? metrics.retryCount + 1 : 1,
      retryCount: metrics.retryCount ?? 0,
      errorCount: metrics.errorCount,
      estimatedInputTokens: metrics.estimatedInputTokens,
      estimatedOutputTokens: metrics.estimatedOutputTokens,
      totalTokens: metrics.totalTokens,
      promptChars: metrics.promptChars,
      responseChars: metrics.responseChars,
      skippedOrDisabledReason: metrics.skipReason,
      errors: metrics.errors ?? result?.llmErrors ?? []
    }];
  });
}

function safeJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function sumNullable(values: Array<number | undefined>) {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0);
}

function countDistribution(values: string[]) {
  const map = new Map<string, number>();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count);
}

function buildErrorCategories(calls: ModelUsageCall[]): ModelUsageErrorCategory[] {
  const buckets = new Map<string, { count: number; samples: Set<string> }>();
  for (const call of calls) {
    for (const error of call.errors) {
      const category = classifyModelError(error);
      const bucket = buckets.get(category.key) ?? { count: 0, samples: new Set<string>() };
      bucket.count += 1;
      if (bucket.samples.size < 3) bucket.samples.add(localizeModelError(error));
      buckets.set(category.key, bucket);
    }
  }
  return Array.from(buckets.entries())
    .map(([key, bucket]) => {
      const definition = ERROR_CATEGORY_DEFINITIONS[key] ?? ERROR_CATEGORY_DEFINITIONS.other;
      return {
        key,
        label: definition.label,
        count: bucket.count,
        sampleMessages: Array.from(bucket.samples),
        mitigation: definition.mitigation
      };
    })
    .sort((left, right) => right.count - left.count);
}

const ERROR_CATEGORY_DEFINITIONS: Record<string, { label: string; mitigation: string }> = {
  evidence_ref: {
    label: "证据引用不匹配",
    mitigation: "让模型只引用事实包提供的 evidenceRefs；非关键引用可以在入库前过滤，关键结论必须保留可追溯证据。"
  },
  schema_json: {
    label: "JSON 或结构格式错误",
    mitigation: "继续压缩输出 schema，减少长文本字段；修复时只发送错误、结构要求和输出片段，避免整包重发。"
  },
  candidate_boundary: {
    label: "候选池越界",
    mitigation: "Agent 只能在规则候选池内做复核，不能新增规则未选入的股票。"
  },
  false_missing: {
    label: "数据不足误判",
    mitigation: "区分数据缺失、证据不足和风险保守；核心行情完整时不应简单写成数据不足。"
  },
  position_limit: {
    label: "仓位越界",
    mitigation: "模型建议必须服从总仓、单票上限和市场状态硬约束。"
  },
  company_boundary: {
    label: "公司认知越界",
    mitigation: "财报、公告、主营匹配不足时，只允许写短线观察，不允许生成长期逻辑或确定受益叙事。"
  },
  unsupported_fund_window: {
    label: "资金窗口无依据",
    mitigation: "只能使用已采集的 1 日、5 日、20 日等真实资金字段，不能编造连续流入天数。"
  },
  external_tool_claim: {
    label: "虚构外部调用",
    mitigation: "模型只能解释事实包，不能声称自己联网、调用接口或读取了额外工具。"
  },
  forbidden_term: {
    label: "收益承诺或禁词",
    mitigation: "保留禁词校验；报告只能表达条件、风险、观察点，不能出现确定收益或无风险承诺。"
  },
  missing_agent: {
    label: "Agent 节点缺失",
    mitigation: "五位 Agent 复核节点必须完整输出；没有观点也要给出空观点和原因。"
  },
  request_aborted: {
    label: "请求被中止",
    mitigation: "这通常来自页面刷新、切换或超时取消。若频繁出现，再检查超时配置和前端请求生命周期。"
  },
  other: {
    label: "其他校验错误",
    mitigation: "查看中文样本，判断是规则过严、事实包缺字段，还是模型输出仍需要约束。"
  }
};

function classifyModelError(error: string) {
  const text = error.toLowerCase();
  if (/evidencerefs|factid|contains unknown factid|证据引用|有效 evidencerefs/i.test(error)) return { key: "evidence_ref" };
  if (/json|schema|required|invalid_type|invalid enum|unterminated|string|output/.test(text)) return { key: "schema_json" };
  if (/outside allowedcodes|not in factpackage candidates|候选池/.test(text) || /不能把规则未精选股票/.test(error)) return { key: "candidate_boundary" };
  if (/falsely claims missing|cannot be 数据不足|missing core data|数据不足/.test(error)) return { key: "false_missing" };
  if (/position|仓位|maxsinglestockpositionpct|positionlimitpct|exceeds/.test(text)) return { key: "position_limit" };
  if (/company|long-term|financialtrend|themematch|主营|长期|财务|公司/.test(text) || /长期|财务|主营/.test(error)) return { key: "company_boundary" };
  if (/unsupported fund-flow window|连续[234]|连续两日|连续三日|连续四日/.test(error)) return { key: "unsupported_fund_window" };
  if (/tool or external data access|我调用了|已调用|联网|实时数据接口|westock-data|cli/i.test(error)) return { key: "external_tool_claim" };
  if (/forbidden term|必涨|稳赚|保证收益|无风险|保本/.test(error)) return { key: "forbidden_term" };
  if (/this operation was aborted|aborterror|operation aborted/i.test(error)) return { key: "request_aborted" };
  if (/缺少 .*输出|缺少 .*分析师/.test(error)) return { key: "missing_agent" };
  return { key: "other" };
}

function localizeCallForDisplay(call: ModelUsageCall): ModelUsageCall {
  return {
    ...call,
    skippedOrDisabledReason: call.skippedOrDisabledReason ? localizeModelError(call.skippedOrDisabledReason) : undefined,
    errors: call.errors.map(localizeModelError)
  };
}

function isSuccessStatus(status: string) {
  return status === "success";
}

function isFailedStatus(status: string) {
  return status === "failed" || status === "rejected";
}

function isDisabledStatus(status: string) {
  return status === "disabled" || status === "skipped";
}

function buildUsageNotes(
  calls: ModelUsageCall[],
  inputTokens: number | null,
  outputTokens: number | null,
  reportedTokens: number | null
) {
  const notes: string[] = [];
  if (!calls.length) {
    notes.push("最近窗口内没有可统计的模型调用记录。");
    return notes;
  }
  if (reportedTokens === null) notes.push("部分接口没有返回官方 total_tokens，系统使用估算输入/输出 tokens 辅助观察。");
  if (inputTokens !== null && inputTokens > 200_000) notes.push("最近窗口估算输入 tokens 偏高，建议优先复用摘要记忆、减少修复重试上下文。");
  if (outputTokens !== null && outputTokens > 80_000) notes.push("最近窗口估算输出 tokens 偏高，建议缩短 Agent 输出字段或改为分层摘要。");
  if (calls.some((call) => (call.requestCount ?? 1) > 1 || (call.retryCount ?? 0) > 0)) notes.push("存在修复或重试调用，失败原因应优先通过 schema 收敛和 prompt 精简解决。");
  if (calls.some((call) => isFailedStatus(call.status))) notes.push("存在 failed/rejected 调用，前端不应把失败模型输出当作有效建议。");
  return notes;
}
