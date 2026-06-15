import { callJsonModel } from "@/lib/llm/jsonModel";
import { getRuntimeSettings } from "@/lib/db/settings";
import { buildSelectionAgentPrompt, SELECTION_AGENT_SYSTEM_PROMPT } from "@/lib/selection/agent-prompts";
import { disabledSelectionAgentResult, parseSelectionAgentOutput } from "@/lib/selection/agent-validator";
import type { SelectionRunResult, SelectionStrategyDefinition } from "@/lib/selection/types";

export async function runSelectionAgentReview(
  strategy: SelectionStrategyDefinition,
  ruleResult: SelectionRunResult
): Promise<Pick<SelectionRunResult, "agentReports" | "finalReview" | "llmStatus" | "llmErrors" | "llmMetrics">> {
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
        temperature: settings.temperature
      }
    };
  }

  const prompt = buildSelectionAgentPrompt(strategy, ruleResult);
  const response = await callJsonModel({
    systemPrompt: SELECTION_AGENT_SYSTEM_PROMPT,
    userPrompt: prompt,
    maxTokens: Math.max(settings.maxTokens, 5000),
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
        status: "failed"
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
      maxTokens: Math.max(settings.maxTokens, 5000),
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
          ...retry.metrics,
          status: retryParsed.ok ? "success" : "rejected",
          errorCount: retryParsed.errors.length,
          errors: retryParsed.errors.slice(0, 6)
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
      errors: parsed.errors.slice(0, 6)
    }
  };
}

function shouldRetryWithCompactPrompt(errors: string[]) {
  return errors.some((error) => /不是合法 JSON|Unexpected end|Unterminated|JSON/.test(error));
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
