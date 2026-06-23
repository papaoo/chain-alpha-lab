import type { DeepSeekReport, FactPackage } from "../types";
import { compactFactPackageForLlm } from "./deepseek";
import { buildRepairPrompt, buildReportPrompt, SYSTEM_PROMPT } from "./prompts";
import { parseAndValidateDeepSeekOutput } from "./validator";

export interface ModelProviderClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  timeoutMs?: number;
  maxTokens?: number;
}

export interface ModelProviderClientResult {
  status: "success" | "rejected" | "failed";
  report: DeepSeekReport | null;
  validationErrors: string[];
  repaired: boolean;
  rawOutput: string | null;
  skippedRepairReason?: string;
}

const DEFAULT_MAX_REPAIR_PROMPT_CHARS = 40_000;

export type DeepSeekClientConfig = ModelProviderClientConfig;
export type DeepSeekClientResult = ModelProviderClientResult;

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
}

export class ModelProviderClient {
  private readonly config: ModelProviderClientConfig;

  constructor(config: ModelProviderClientConfig) {
    if (!config.apiKey) throw new Error("Model provider API key is required");
    this.config = config;
  }

  async generateReport(factPackage: FactPackage): Promise<ModelProviderClientResult> {
    const compactPackage = compactFactPackageForLlm(factPackage);
    const firstOutput = await this.createJsonOnlyCompletion(buildReportPrompt(compactPackage));
    const firstValidation = parseAndValidateDeepSeekOutput(firstOutput, compactPackage);
    if (firstValidation.ok) {
      return {
        status: "success",
        report: firstValidation.report,
        validationErrors: [],
        repaired: false,
        rawOutput: firstOutput,
      };
    }

    const repairPrompt = buildRepairPrompt(compactPackage, firstValidation.errors);
    const maxRepairPromptChars = repairPromptBudgetChars();
    if (repairPrompt.length > maxRepairPromptChars) {
      const skippedRepairReason = `修复上下文 ${repairPrompt.length} 字符超过 ${maxRepairPromptChars} 字符预算，已跳过二次模型调用。`;
      return {
        status: "rejected",
        report: null,
        validationErrors: [...firstValidation.errors, skippedRepairReason],
        repaired: false,
        rawOutput: firstOutput,
        skippedRepairReason
      };
    }

    const repairOutput = await this.createJsonOnlyCompletion(repairPrompt);
    const repairValidation = parseAndValidateDeepSeekOutput(repairOutput, compactPackage);
    if (repairValidation.ok) {
      return {
        status: "success",
        report: repairValidation.report,
        validationErrors: [],
        repaired: true,
        rawOutput: repairOutput,
      };
    }

    return {
      status: "rejected",
      report: null,
      validationErrors: repairValidation.errors,
      repaired: true,
      rawOutput: repairOutput,
    };
  }

  private async createJsonOnlyCompletion(userPrompt: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 30_000);

    try {
      const response = await fetch(buildChatCompletionsUrl(this.config.baseUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: this.config.temperature ?? 0.2,
          max_tokens: this.config.maxTokens ?? 4000,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });

      const payload = (await response.json()) as ChatCompletionResponse;
      if (!response.ok) {
        throw new Error(payload.error?.message ?? `Model provider request failed with status ${response.status}`);
      }

      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error("Model provider response did not include message content");
      return content;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class DeepSeekClient extends ModelProviderClient {}

function repairPromptBudgetChars() {
  const raw = process.env.LLM_REPAIR_PROMPT_MAX_CHARS;
  const parsed = raw ? Number(raw) : DEFAULT_MAX_REPAIR_PROMPT_CHARS;
  return Number.isFinite(parsed) && parsed >= 10_000 ? Math.trunc(parsed) : DEFAULT_MAX_REPAIR_PROMPT_CHARS;
}

function buildChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}
