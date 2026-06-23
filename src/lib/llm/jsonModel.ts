import { getRuntimeSettings } from "@/lib/db/settings";

export interface JsonModelCallResult {
  ok: boolean;
  text?: string;
  error?: string;
  metrics: {
    provider: string;
    model: string;
    promptChars: number;
    responseChars?: number;
    estimatedInputTokens: number;
    estimatedOutputTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    elapsedMs: number;
    status: "success" | "failed";
    errorCount: number;
    errors?: string[];
    maxTokens: number;
    temperature: number;
  };
}

const APPROX_CHARS_PER_TOKEN = 2.2;

export async function callJsonModel(input: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<JsonModelCallResult> {
  const settings = getRuntimeSettings();
  const startedAt = Date.now();
  const promptChars = input.systemPrompt.length + input.userPrompt.length;
  if (!settings.enabled || !settings.apiKey) {
    return {
      ok: false,
      error: "模型未启用或 API Key 缺失",
      metrics: buildMetrics("failed", startedAt, promptChars, ["模型未启用或 API Key 缺失"])
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  try {
    const requestBody: Record<string, unknown> = {
      model: settings.model,
      temperature: input.temperature ?? settings.temperature,
      max_tokens: Math.max(1200, input.maxTokens ?? settings.maxTokens),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userPrompt }
      ]
    };
    if (settings.provider === "deepseek") {
      requestBody.thinking = { type: "disabled" };
    }
    const response = await fetch(buildChatCompletionsUrl(settings.baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    const responseText = await response.text();
    let json: any = null;
    try {
      json = responseText ? JSON.parse(responseText) : null;
    } catch {
      json = null;
    }
    if (!response.ok) {
      const error = json?.error?.message || `Model provider HTTP ${response.status}: ${responseText.slice(0, 800)}`;
      return { ok: false, error, metrics: buildMetrics("failed", startedAt, promptChars, [error]) };
    }
    const text = json?.choices?.[0]?.message?.content;
    if (!text) {
      const error = `模型响应缺少 content：${responseText.slice(0, 800)}`;
      return { ok: false, error, metrics: buildMetrics("failed", startedAt, promptChars, [error]) };
    }
    return {
      ok: true,
      text,
      metrics: buildMetrics("success", startedAt, promptChars, [], {
        responseChars: text.length,
        promptTokens: numberValue(json?.usage?.prompt_tokens),
        completionTokens: numberValue(json?.usage?.completion_tokens),
        totalTokens: numberValue(json?.usage?.total_tokens)
      })
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message, metrics: buildMetrics("failed", startedAt, promptChars, [message]) };
  } finally {
    clearTimeout(timer);
  }
}

function buildMetrics(
  status: "success" | "failed",
  startedAt: number,
  promptChars: number,
  errors: string[] = [],
  usage: {
    responseChars?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  } = {}
) {
  const settings = getRuntimeSettings();
  const estimatedInputTokens = Math.ceil(promptChars / APPROX_CHARS_PER_TOKEN);
  const estimatedOutputTokens = usage.responseChars !== undefined
    ? Math.ceil(usage.responseChars / APPROX_CHARS_PER_TOKEN)
    : undefined;
  return {
    provider: settings.providerName || settings.provider,
    model: settings.model,
    promptChars,
    responseChars: usage.responseChars,
    estimatedInputTokens,
    estimatedOutputTokens,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    elapsedMs: Date.now() - startedAt,
    status,
    errorCount: errors.length,
    errors: errors.slice(0, 5),
    maxTokens: settings.maxTokens,
    temperature: settings.temperature
  };
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}
