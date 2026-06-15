import type { AppSettings, ModelProvider } from "@/lib/types";

const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-pro";
const DEFAULT_WESTOCK_VERSION = "1.0.3";

export function getDatabasePath() {
  return process.env.DATABASE_PATH || "./data/app.db";
}

export type RuntimeSettings = AppSettings & { apiKey?: string };

export function getDefaultSettings(): RuntimeSettings {
  const provider = parseProvider(process.env.MODEL_PROVIDER) ?? "deepseek";
  const apiKey = process.env.MODEL_API_KEY || process.env.DEEPSEEK_API_KEY;
  return {
    provider,
    providerName: process.env.MODEL_PROVIDER_NAME || defaultProviderName(provider),
    baseUrl: process.env.MODEL_BASE_URL || process.env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL,
    apiKey,
    apiKeyMasked: maskSecret(apiKey),
    model: process.env.MODEL_NAME || process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL,
    temperature: numberFromEnv("MODEL_TEMPERATURE", numberFromEnv("DEEPSEEK_TEMPERATURE", 0.2)),
    maxTokens: numberFromEnv("MODEL_MAX_TOKENS", numberFromEnv("DEEPSEEK_MAX_TOKENS", 4000)),
    timeoutMs: numberFromEnv("MODEL_TIMEOUT_MS", numberFromEnv("DEEPSEEK_TIMEOUT_MS", 120000)),
    enabled: process.env.MODEL_ENABLED
      ? process.env.MODEL_ENABLED !== "false"
      : process.env.ENABLE_LLM_SUMMARY !== "false",
    modelAuditEnabled: process.env.MODEL_AUDIT_ENABLED === "true",
    westockPackageVersion: process.env.WESTOCK_PACKAGE_VERSION || DEFAULT_WESTOCK_VERSION
  };
}

export function getEnvSettings(): RuntimeSettings {
  return getDefaultSettings();
}

export function maskSecret(value?: string | null) {
  if (!value) return "";
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

export function parseProvider(value?: string | null): ModelProvider | null {
  if (value === "openai_compatible" || value === "deepseek" || value === "anthropic_compatible") return value;
  return null;
}

export function defaultProviderName(provider: ModelProvider) {
  if (provider === "deepseek") return "DeepSeek";
  if (provider === "anthropic_compatible") return "Anthropic Compatible";
  return "OpenAI Compatible";
}

function numberFromEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const DISCLAIMER =
  "本系统仅用于投资研究和交易计划辅助，不构成投资建议或收益承诺。市场有风险，交易需谨慎，最终决策由用户自行承担。";
