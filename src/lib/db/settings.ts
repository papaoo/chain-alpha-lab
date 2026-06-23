import { defaultProviderName, getDefaultSettings, maskSecret, parseProvider, type RuntimeSettings } from "@/lib/config";
import { dbGet, dbRun } from "@/lib/db/client";
import { DATA_PROVIDER_REGISTRY } from "@/lib/data/providerRegistry";
import type { AppSettings, DataProviderId, DataProviderSettings, DataSourceSettings, SchedulerSettings } from "@/lib/types";

const MODEL_PROVIDER_KEY = "model_provider";
const SCHEDULER_SETTINGS_KEY = "scheduler_settings";
const DATA_SOURCE_SETTINGS_KEY = "data_source_settings";

export type SettingsInput = Partial<{
  provider: string;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  enabled: boolean;
  modelAuditEnabled: boolean;
}>;

export type DataSourceSettingsInput = Partial<{
  providers: Array<Partial<Pick<DataProviderSettings, "id" | "enabled" | "apiKey" | "priority" | "status">>>;
}>;

type StoredModelSettings = Partial<Omit<RuntimeSettings, "apiKeyMasked" | "westockPackageVersion">>;
type SettingsCacheEntry<T> = { expiresAt: number; value: T };

const SETTINGS_CACHE_TTL_MS = 5_000;
const globalSettingsCache = globalThis as typeof globalThis & {
  __chainAlphaSettingsCache?: {
    model?: SettingsCacheEntry<StoredModelSettings>;
    dataSource?: SettingsCacheEntry<Partial<DataSourceSettings>>;
    scheduler?: SettingsCacheEntry<SchedulerSettings>;
  };
};

function settingsCache() {
  const cache = globalSettingsCache.__chainAlphaSettingsCache ?? {};
  globalSettingsCache.__chainAlphaSettingsCache = cache;
  return cache;
}

export function getRuntimeSettings(): RuntimeSettings {
  const defaults = getDefaultSettings();
  const stored = readStoredModelSettings();
  const provider = parseProvider(stored.provider) ?? defaults.provider;
  const apiKey = stored.apiKey ?? defaults.apiKey;
  return {
    ...defaults,
    ...stored,
    provider,
    providerName: sanitizeString(stored.providerName) || defaults.providerName || defaultProviderName(provider),
    baseUrl: sanitizeString(stored.baseUrl) || defaults.baseUrl,
    apiKey,
    apiKeyMasked: maskSecret(apiKey),
    model: sanitizeString(stored.model) || defaults.model,
    temperature: sanitizeNumber(stored.temperature, defaults.temperature),
    maxTokens: sanitizeInteger(stored.maxTokens, defaults.maxTokens),
    timeoutMs: sanitizeInteger(stored.timeoutMs, defaults.timeoutMs),
    enabled: typeof stored.enabled === "boolean" ? stored.enabled : defaults.enabled,
    modelAuditEnabled: typeof stored.modelAuditEnabled === "boolean" ? stored.modelAuditEnabled : defaults.modelAuditEnabled,
    westockPackageVersion: defaults.westockPackageVersion
  };
}

export function getPublicSettings(): AppSettings {
  return getRuntimeSettings();
}

export function saveModelSettings(input: SettingsInput): AppSettings {
  const current = getRuntimeSettings();
  const provider = parseProvider(input.provider) ?? current.provider;
  const next: RuntimeSettings = {
    ...current,
    provider,
    providerName: sanitizeString(input.providerName) || defaultProviderName(provider),
    baseUrl: sanitizeString(input.baseUrl) || current.baseUrl,
    apiKey: typeof input.apiKey === "string" ? input.apiKey.trim() : current.apiKey,
    model: sanitizeString(input.model) || current.model,
    temperature: sanitizeNumber(input.temperature, current.temperature),
    maxTokens: sanitizeInteger(input.maxTokens, current.maxTokens),
    timeoutMs: sanitizeInteger(input.timeoutMs, current.timeoutMs),
    enabled: typeof input.enabled === "boolean" ? input.enabled : current.enabled,
    modelAuditEnabled: typeof input.modelAuditEnabled === "boolean" ? input.modelAuditEnabled : current.modelAuditEnabled
  };

  const stored: StoredModelSettings = {
    provider: next.provider,
    providerName: next.providerName,
    baseUrl: next.baseUrl,
    apiKey: next.apiKey,
    model: next.model,
    temperature: next.temperature,
    maxTokens: next.maxTokens,
    timeoutMs: next.timeoutMs,
    enabled: next.enabled,
    modelAuditEnabled: next.modelAuditEnabled
  };
  writeStoredModelSettings(stored);
  invalidateSettingsCache("model");
  const publicSettings = {
    ...next,
    apiKeyMasked: maskSecret(next.apiKey)
  };
  return publicSettings;
}

export function getDataSourceSettings(): DataSourceSettings {
  const stored = readStoredDataSourceSettings();
  const storedById = new Map(stored.providers?.map((provider) => [provider.id, provider]));
  const providers = Object.values(DATA_PROVIDER_REGISTRY).map((definition, index) => {
    const storedProvider = storedById.get(definition.id);
    const apiKey = sanitizeString(storedProvider?.apiKey) || dataSourceApiKeyFromEnv(definition.id);
    const status = storedProvider?.status ?? (definition.enabledByDefault ? "active" : "planned");
    return {
      id: definition.id,
      name: definition.name,
      accessPath: definition.accessPath,
      sourceLabel: definition.sourceLabel,
      reliabilityNote: definition.reliabilityNote,
      enabled: typeof storedProvider?.enabled === "boolean" ? storedProvider.enabled : definition.enabledByDefault,
      apiKey,
      apiKeyMasked: maskSecret(apiKey),
      priority: sanitizeInteger(storedProvider?.priority, index + 1),
      status,
      capabilities: Object.entries(definition.fields).map(([field, role]) => `${field}:${role}`)
    } satisfies DataProviderSettings;
  });
  return {
    providers: providers.sort((left, right) => left.priority - right.priority),
    updatedAt: stored.updatedAt ?? new Date(0).toISOString()
  };
}

export function saveDataSourceSettings(input: DataSourceSettingsInput): DataSourceSettings {
  const current = getDataSourceSettings();
  const inputById = new Map(input.providers?.map((provider) => [provider.id, provider]));
  const providers = current.providers.map((provider) => {
    const next = inputById.get(provider.id);
    return {
      ...provider,
      enabled: typeof next?.enabled === "boolean" ? next.enabled : provider.enabled,
      apiKey: typeof next?.apiKey === "string" ? next.apiKey.trim() : provider.apiKey,
      apiKeyMasked: maskSecret(typeof next?.apiKey === "string" ? next.apiKey.trim() : provider.apiKey),
      priority: sanitizeInteger(next?.priority, provider.priority),
      status: sanitizeProviderStatus(next?.status, provider.status)
    };
  });
  const stored = {
    providers: providers.map(({ id, enabled, apiKey, priority, status }) => ({ id, enabled, apiKey, priority, status })),
    updatedAt: new Date().toISOString()
  };
  dbRun(
    `insert into settings (key, value, encrypted, updatedAt)
       values (?, ?, 0, ?)
       on conflict(key) do update set value = excluded.value, updatedAt = excluded.updatedAt`,
    [DATA_SOURCE_SETTINGS_KEY, JSON.stringify(stored), stored.updatedAt],
    { label: "settings.data_source.upsert" }
  );
  invalidateSettingsCache("dataSource");
  return getDataSourceSettings();
}

export function getSchedulerSettings(): SchedulerSettings {
  const defaults = getDefaultSchedulerSettings();
  const cached = settingsCache().scheduler;
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  const row = dbGet<{ value: string }>(
    "select value from settings where key = ?",
    [SCHEDULER_SETTINGS_KEY],
    { label: "settings.scheduler.get" }
  );
  if (!row) {
    settingsCache().scheduler = { value: defaults, expiresAt: now + SETTINGS_CACHE_TTL_MS };
    return defaults;
  }
  try {
    const parsed = JSON.parse(row.value) as Partial<SchedulerSettings>;
    const value = sanitizeSchedulerSettings({ ...defaults, ...parsed });
    settingsCache().scheduler = { value, expiresAt: now + SETTINGS_CACHE_TTL_MS };
    return value;
  } catch {
    settingsCache().scheduler = { value: defaults, expiresAt: now + SETTINGS_CACHE_TTL_MS };
    return defaults;
  }
}

export function saveSchedulerSettings(input: Partial<SchedulerSettings>): SchedulerSettings {
  const next = sanitizeSchedulerSettings({ ...getSchedulerSettings(), ...input });
  dbRun(
    `insert into settings (key, value, encrypted, updatedAt)
       values (?, ?, 0, ?)
       on conflict(key) do update set value = excluded.value, updatedAt = excluded.updatedAt`,
    [SCHEDULER_SETTINGS_KEY, JSON.stringify(next), new Date().toISOString()],
    { label: "settings.scheduler.upsert" }
  );
  invalidateSettingsCache("scheduler");
  return next;
}

export function getDefaultSchedulerSettings(): SchedulerSettings {
  return {
    enabled: false,
    intradayScanEnabled: true,
    intradayIntervalMinutes: 10,
    keypointTimes: ["08:50", "09:26", "11:35", "14:50", "15:10"],
    deepResearchTimes: ["20:30"],
    llmOnEvent: true,
    pushNotification: false,
    auctionWatchlistPushEnabled: false,
    riskWarningPushEnabled: true
  };
}

function readStoredModelSettings(): StoredModelSettings {
  const cached = settingsCache().model;
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  const row = dbGet<{ value: string }>(
    "select value from settings where key = ?",
    [MODEL_PROVIDER_KEY],
    { label: "settings.model.get" }
  );
  if (!row) {
    settingsCache().model = { value: {}, expiresAt: now + SETTINGS_CACHE_TTL_MS };
    return {};
  }
  try {
    const parsed = JSON.parse(row.value);
    const value = parsed && typeof parsed === "object" ? parsed : {};
    settingsCache().model = { value, expiresAt: now + SETTINGS_CACHE_TTL_MS };
    return value;
  } catch {
    settingsCache().model = { value: {}, expiresAt: now + SETTINGS_CACHE_TTL_MS };
    return {};
  }
}

function readStoredDataSourceSettings(): Partial<DataSourceSettings> {
  const cached = settingsCache().dataSource;
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  const row = dbGet<{ value: string }>(
    "select value from settings where key = ?",
    [DATA_SOURCE_SETTINGS_KEY],
    { label: "settings.data_source.get" }
  );
  if (!row) {
    settingsCache().dataSource = { value: {}, expiresAt: now + SETTINGS_CACHE_TTL_MS };
    return {};
  }
  try {
    const parsed = JSON.parse(row.value);
    const value = parsed && typeof parsed === "object" ? parsed : {};
    settingsCache().dataSource = { value, expiresAt: now + SETTINGS_CACHE_TTL_MS };
    return value;
  } catch {
    settingsCache().dataSource = { value: {}, expiresAt: now + SETTINGS_CACHE_TTL_MS };
    return {};
  }
}

function writeStoredModelSettings(settings: StoredModelSettings) {
  dbRun(
    `insert into settings (key, value, encrypted, updatedAt)
       values (?, ?, 0, ?)
       on conflict(key) do update set value = excluded.value, updatedAt = excluded.updatedAt`,
    [MODEL_PROVIDER_KEY, JSON.stringify(settings), new Date().toISOString()],
    { label: "settings.model.upsert" }
  );
}

function invalidateSettingsCache(key?: keyof NonNullable<typeof globalSettingsCache.__chainAlphaSettingsCache>) {
  const cache = settingsCache();
  if (!key) {
    globalSettingsCache.__chainAlphaSettingsCache = {};
    return;
  }
  delete cache[key];
}

function sanitizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeNumber(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeInteger(value: unknown, fallback: number) {
  const parsed = Math.trunc(sanitizeNumber(value, fallback));
  return parsed > 0 ? parsed : fallback;
}

function sanitizeSchedulerSettings(input: Partial<SchedulerSettings>): SchedulerSettings {
  const defaults = getDefaultSchedulerSettings();
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : defaults.enabled,
    intradayScanEnabled: typeof input.intradayScanEnabled === "boolean" ? input.intradayScanEnabled : defaults.intradayScanEnabled,
    intradayIntervalMinutes: clampInteger(input.intradayIntervalMinutes, defaults.intradayIntervalMinutes, 5, 60),
    keypointTimes: sanitizeTimes(input.keypointTimes, defaults.keypointTimes),
    deepResearchTimes: sanitizeTimes(input.deepResearchTimes, defaults.deepResearchTimes),
    llmOnEvent: typeof input.llmOnEvent === "boolean" ? input.llmOnEvent : defaults.llmOnEvent,
    pushNotification: typeof input.pushNotification === "boolean" ? input.pushNotification : defaults.pushNotification,
    auctionWatchlistPushEnabled: typeof input.auctionWatchlistPushEnabled === "boolean"
      ? input.auctionWatchlistPushEnabled
      : defaults.auctionWatchlistPushEnabled,
    riskWarningPushEnabled: typeof input.riskWarningPushEnabled === "boolean"
      ? input.riskWarningPushEnabled
      : defaults.riskWarningPushEnabled
  };
}

function sanitizeTimes(value: unknown, fallback: string[]) {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n|,|，/)
      : fallback;
  const times = items
    .map((item) => String(item).trim())
    .filter((item) => /^([01]\d|2[0-3]):[0-5]\d$/.test(item));
  return Array.from(new Set(times)).sort();
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Math.trunc(sanitizeNumber(value, fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function dataSourceApiKeyFromEnv(provider: DataProviderId) {
  if (provider === "tushare") return process.env.TUSHARE_TOKEN || process.env.TUSHARE_API_KEY || "";
  return "";
}

function sanitizeProviderStatus(value: unknown, fallback: DataProviderSettings["status"]) {
  return value === "active" || value === "planned" || value === "disabled" ? value : fallback;
}
