import { callJsonModel } from "@/lib/llm/jsonModel";
import { getDefaultSettings, type RuntimeSettings } from "@/lib/config";
import { getRuntimeSettings } from "@/lib/db/settings";
import { buildSelectionAgentPrompt, SELECTION_AGENT_SYSTEM_PROMPT } from "@/lib/selection/agent-prompts";
import { disabledSelectionAgentResult, parseSelectionAgentOutput } from "@/lib/selection/agent-validator";
import type { SelectionRunResult, SelectionStrategyDefinition } from "@/lib/selection/types";

export async function runSelectionAgentReview(
  strategy: SelectionStrategyDefinition,
  ruleResult: SelectionRunResult
): Promise<Pick<SelectionRunResult, "agentReports" | "finalReview" | "llmStatus" | "llmErrors" | "llmMetrics">> {
  if (!ruleResult.picks.length) {
    const reason = "规则层没有产生精选候选，已跳过选股 Agent 复核，避免无效消耗模型 token。";
    return {
      agentReports: [],
      finalReview: {
        status: "skipped",
        summary: reason,
        strategySuitability: "当前批次不适合进入模型复核；应先补齐数据或等待规则层出现可跟踪候选。",
        finalPicks: [],
        portfolioRisk: "无精选候选，不形成组合建议。",
        noTradeConditions: [reason, ...ruleResult.warnings.slice(0, 4)],
        evidenceRefs: []
      },
      llmStatus: "skipped",
      llmErrors: [reason],
      llmMetrics: skippedMetrics(reason)
    };
  }
  if (ruleResult.freshnessStatus === "stale" && ruleResult.parameters.forceAgentOnStale !== true) {
    return skippedSelectionAgentResult(
      "选股来源报告已经过期，默认跳过选股 Agent 复核，避免用旧行情消耗模型 token 并生成伪实时结论。",
      ruleResult,
      "当前结果可用于复盘规则命中原因，但不适合让模型继续升级为当前行动建议；如需历史复盘，可在参数中开启强制复核历史快照。"
    );
  }
  const actionabilityGate = selectionAgentActionabilityGate(ruleResult);
  if (!actionabilityGate.allowed && ruleResult.parameters.forceAgentOnReferenceOnly !== true) {
    return skippedSelectionAgentResult(
      actionabilityGate.reason,
      ruleResult,
      "当前候选仍可进入研究队列或观察池，但快照不可作为盘中行动依据；如需历史复盘、提示词压测或人工确认需要模型总结，可在参数中开启复核仅研究快照。"
    );
  }
  const settings = getRuntimeSettings();
  if (!settings.enabled || !settings.apiKey) {
    const disabled = disabledSelectionAgentResult("模型未启用或 API Key 缺失，已跳过选股 Agent 复核。");
    return {
      agentReports: disabled.agentReports,
      finalReview: disabled.finalReview,
      llmStatus: "disabled",
      llmErrors: disabled.errors,
      llmMetrics: {
        provider: settings.providerName || settings.provider,
        model: settings.model,
        promptChars: 0,
        estimatedInputTokens: 0,
        elapsedMs: 0,
        status: "disabled",
        errorCount: disabled.errors.length,
        errors: disabled.errors,
        maxTokens: settings.maxTokens,
        temperature: settings.temperature,
        retryCount: 0
      }
    };
  }

  const prompt = buildSelectionAgentPrompt(strategy, ruleResult);
  const maxTokens = selectionAgentMaxTokens(settings.maxTokens);
  const response = await callJsonModel({
    systemPrompt: SELECTION_AGENT_SYSTEM_PROMPT,
    userPrompt: prompt,
    maxTokens,
    temperature: Math.min(settings.temperature, 0.25)
  });

  if (!response.ok || !response.text) {
    return {
      agentReports: [],
      finalReview: undefined,
      llmStatus: "failed",
      llmErrors: [response.error ?? "选股 Agent 调用失败"],
      llmMetrics: {
        ...response.metrics,
        status: "failed",
        retryCount: 0
      }
    };
  }

  const parsed = parseSelectionAgentOutput(response.text, ruleResult);
  if (!parsed.ok && shouldRetryWithCompactPrompt(parsed.errors)) {
    const retryPrompt = [
      "上一次输出不是合法 JSON，请只输出完整 JSON object，不要解释。",
      "请严格使用原 schema；每个 Agent 只写 summary、topPicks、avoidStocks、missingData、stockOpinions 和 evidenceRefs。",
      "每个 Agent 最多 3 条 stockOpinions；finalReview.finalPicks 最多 3 条。",
      "下面是更短的规则结果上下文：",
      JSON.stringify(buildRetryContext(strategy, ruleResult), null, 2)
    ].join("\n");
    const retry = await callJsonModel({
      systemPrompt: SELECTION_AGENT_SYSTEM_PROMPT,
      userPrompt: retryPrompt,
      maxTokens: Math.min(maxTokens, 2200),
      temperature: 0.15
    });
    if (retry.ok && retry.text) {
      const retryParsed = parseSelectionAgentOutput(retry.text, ruleResult);
      return {
        agentReports: retryParsed.agentReports,
        finalReview: retryParsed.finalReview ?? undefined,
        llmStatus: retryParsed.ok ? "success" : "rejected",
        llmErrors: retryParsed.errors,
        llmMetrics: {
          ...mergeRetryMetrics(response.metrics, retry.metrics),
          status: retryParsed.ok ? "success" : "rejected",
          errorCount: retryParsed.errors.length,
          errors: retryParsed.errors.slice(0, 6),
          retryCount: 1
        }
      };
    }
  }
  return {
    agentReports: parsed.agentReports,
    finalReview: parsed.finalReview ?? undefined,
    llmStatus: parsed.ok ? "success" : "rejected",
    llmErrors: parsed.errors,
    llmMetrics: {
      ...response.metrics,
      status: parsed.ok ? "success" : "rejected",
      errorCount: parsed.errors.length,
      errors: parsed.errors.slice(0, 6),
      retryCount: 0
    }
  };
}

function shouldRetryWithCompactPrompt(errors: string[]) {
  return errors.some((error) => /不是合法 JSON|Unexpected end|Unterminated|JSON/.test(error));
}

function selectionAgentMaxTokens(settingsMaxTokens: number) {
  return Math.min(Math.max(settingsMaxTokens, 1800), 2600);
}

function selectionAgentActionabilityGate(ruleResult: SelectionRunResult) {
  const picks = ruleResult.picks;
  if (!picks.length) {
    return {
      allowed: false,
      reason: "规则层没有产生精选候选，已跳过选股 Agent 复核，避免无效消耗模型 token。"
    };
  }
  const levels = picks.map((pick) => pick.runtimeSnapshot?.actionability?.level).filter(Boolean);
  if (!levels.length) return { allowed: true, reason: "" };

  const actionableCount = levels.filter((level) => level === "actionable").length;
  if (actionableCount > 0) return { allowed: true, reason: "" };

  const referenceOnlyCount = levels.filter((level) => level === "reference_only").length;
  const notActionableCount = levels.filter((level) => level === "not_actionable").length;
  const examples = picks
    .map((pick) => pick.runtimeSnapshot?.actionability?.reason)
    .filter(Boolean)
    .slice(0, 2)
    .join("；");

  return {
    allowed: false,
    reason:
      referenceOnlyCount > 0
        ? `规则候选的运行快照均为研究参考或不可行动（仅参考 ${referenceOnlyCount}，不可行动 ${notActionableCount}），默认跳过选股 Agent 复核以节省 token。${examples ? `主要原因：${examples}` : ""}`
        : `规则候选缺少可行动快照，默认跳过选股 Agent 复核以节省 token。${examples ? `主要原因：${examples}` : ""}`
  };
}

export function __testSelectionAgentActionabilityGate(ruleResult: SelectionRunResult) {
  return selectionAgentActionabilityGate(ruleResult);
}

function skippedSelectionAgentResult(
  reason: string,
  ruleResult: SelectionRunResult,
  strategySuitability: string
): Pick<SelectionRunResult, "agentReports" | "finalReview" | "llmStatus" | "llmErrors" | "llmMetrics"> {
  return {
    agentReports: [],
    finalReview: {
      status: "skipped",
      summary: reason,
      strategySuitability,
      finalPicks: [],
      portfolioRisk: "模型复核未运行，本次不形成模型组合建议。",
      noTradeConditions: [reason, ...ruleResult.warnings.slice(0, 4)],
      evidenceRefs: []
    },
    llmStatus: "skipped",
    llmErrors: [reason],
    llmMetrics: skippedMetrics(reason)
  };
}

function skippedMetrics(reason: string, settings: RuntimeSettings = getDefaultSettings()): NonNullable<SelectionRunResult["llmMetrics"]> {
  return {
    provider: settings.providerName || settings.provider,
    model: settings.model,
    promptChars: 0,
    estimatedInputTokens: 0,
    elapsedMs: 0,
    status: "skipped",
    errorCount: 0,
    errors: [],
    maxTokens: settings.maxTokens,
    temperature: settings.temperature,
    retryCount: 0,
    skipReason: reason
  };
}

function mergeRetryMetrics(
  first: Awaited<ReturnType<typeof callJsonModel>>["metrics"],
  retry: Awaited<ReturnType<typeof callJsonModel>>["metrics"]
) {
  return {
    ...retry,
    promptChars: first.promptChars + retry.promptChars,
    responseChars: (first.responseChars ?? 0) + (retry.responseChars ?? 0),
    estimatedInputTokens: first.estimatedInputTokens + retry.estimatedInputTokens,
    estimatedOutputTokens: (first.estimatedOutputTokens ?? 0) + (retry.estimatedOutputTokens ?? 0),
    promptTokens: sumOptional(first.promptTokens, retry.promptTokens),
    completionTokens: sumOptional(first.completionTokens, retry.completionTokens),
    totalTokens: sumOptional(first.totalTokens, retry.totalTokens),
    elapsedMs: first.elapsedMs + retry.elapsedMs,
    errors: [...(first.errors ?? []), ...(retry.errors ?? [])].slice(0, 5)
  };
}

function sumOptional(left?: number, right?: number) {
  if (left === undefined && right === undefined) return undefined;
  return (left ?? 0) + (right ?? 0);
}

function buildRetryContext(strategy: SelectionStrategyDefinition, ruleResult: SelectionRunResult) {
  const picks = ruleResult.picks.slice(0, 4).map(compactPick);
  const rejected = ruleResult.rejected.slice(0, 4).map(compactPick);
  return {
    strategy: {
      id: strategy.id,
      name: strategy.name,
      hardFilters: strategy.hardFilters.slice(0, 4)
    },
    run: {
      warnings: ruleResult.warnings.slice(0, 4),
      allowedFinalPickCodes: picks.map((pick) => pick.code),
      allowedCodes: [...picks, ...rejected].map((pick) => pick.code),
      allowedEvidenceRefs: Array.from(new Set([...picks, ...rejected].flatMap((pick) => pick.evidenceRefs))).slice(0, 80)
    },
    rulePicks: picks,
    ruleRejected: rejected
  };
}

function compactPick(pick: SelectionRunResult["picks"][number]) {
  return {
    code: pick.code,
    name: pick.name,
    sectorName: pick.sectorName,
    score: pick.score,
    tier: pick.tier,
    action: pick.action,
    reasons: pick.reasons.slice(0, 2),
    blockers: pick.blockers.slice(0, 3),
    evidenceRefs: pick.evidenceRefs.slice(0, 6)
  };
}
