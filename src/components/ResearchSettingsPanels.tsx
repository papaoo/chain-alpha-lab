"use client";

import type { Dispatch, SetStateAction } from "react";
import { CheckCircle2, Database, Loader2, Network, Save, ServerCog, Settings } from "lucide-react";
import {
  SettingsPanel as Panel,
  SettingsReadOnlyField as Setting,
  SettingsSecretInput as SecretInput,
  SettingsSectionTitle as SectionTitle,
  SettingsTextInput as TextInput
} from "@/components/ResearchSettingsControls";
import type { DataSourceSettingsForm, SettingsForm } from "@/components/ResearchSettingsTypes";
import type { AppSettings, DataSourceSettings } from "@/lib/types";
import type { ProviderCapabilityAudit } from "@/lib/data/providerCapabilityAudit";

type DataProvider = DataSourceSettings["providers"][number];

export function ModelServiceSettingsPanel({
  form,
  setForm,
  settings,
  modelKeyVisible,
  setModelKeyVisible,
  saving,
  status,
  modelTestStatus,
  saveSettings,
  testModelConnection,
  formatProvider
}: {
  form: SettingsForm;
  setForm: Dispatch<SetStateAction<SettingsForm>>;
  settings: AppSettings | null;
  modelKeyVisible: boolean;
  setModelKeyVisible: Dispatch<SetStateAction<boolean>>;
  saving: boolean;
  status: string;
  modelTestStatus: string;
  saveSettings: () => void;
  testModelConnection: () => void;
  formatProvider: (provider?: AppSettings["provider"]) => string | null;
}) {
  return (
    <Panel>
      <SectionTitle icon={Settings} title="模型服务配置" meta="通过后端 /api/settings 读取和保存" />
      <div className="mt-5 grid gap-3">
        <label className="grid gap-2 text-sm">
          <span className="text-xs text-muted">服务商</span>
          <select
            className="rounded-lg border border-line bg-bg/60 px-3 py-2 text-sm outline-none"
            value={form.provider}
            onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value as AppSettings["provider"] }))}
          >
            <option value="deepseek">DeepSeek</option>
            <option value="openai_compatible">OpenAI 兼容接口</option>
          </select>
        </label>
        <TextInput label="服务商名称" value={form.providerName} onChange={(providerName) => setForm((current) => ({ ...current, providerName }))} />
        <TextInput label="接口地址 Base URL" value={form.baseUrl} onChange={(baseUrl) => setForm((current) => ({ ...current, baseUrl }))} />
        <TextInput label="模型名称" value={form.model} onChange={(model) => setForm((current) => ({ ...current, model }))} />
        <SecretInput
          label="API 密钥"
          value={form.apiKey}
          visible={modelKeyVisible}
          onToggleVisible={() => setModelKeyVisible((visible) => !visible)}
          onChange={(apiKey) => setForm((current) => ({ ...current, apiKey }))}
        />
        <div className="grid gap-3 md:grid-cols-3">
          <TextInput label="温度" value={form.temperature} onChange={(temperature) => setForm((current) => ({ ...current, temperature }))} />
          <TextInput label="最大输出 Token" value={form.maxTokens} onChange={(maxTokens) => setForm((current) => ({ ...current, maxTokens }))} />
          <TextInput label="超时毫秒" value={form.timeoutMs} onChange={(timeoutMs) => setForm((current) => ({ ...current, timeoutMs }))} />
        </div>
        <label className="flex items-center justify-between rounded-lg border border-line bg-bg/60 p-3 text-sm">
          <span>启用模型增强报告</span>
          <input
            className="h-4 w-4 accent-info"
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
          />
        </label>
        <label className="flex items-center justify-between rounded-lg border border-line bg-bg/60 p-3 text-sm">
          <span>
            <span className="block">生成系统反馈</span>
            <span className="mt-1 block text-xs text-muted">开启后每次分析会额外调用模型审计系统问题，关闭可节省 Token。</span>
          </span>
          <input
            className="h-4 w-4 accent-info"
            type="checkbox"
            checked={form.modelAuditEnabled}
            onChange={(event) => setForm((current) => ({ ...current, modelAuditEnabled: event.target.checked }))}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            className="flex w-fit items-center gap-2 rounded-lg border border-info/40 bg-info/10 px-4 py-2 text-sm text-info disabled:opacity-60"
            type="button"
            onClick={saveSettings}
            disabled={saving}
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            保存配置
          </button>
          <button
            className="flex w-fit items-center gap-2 rounded-lg border border-line bg-bg/60 px-4 py-2 text-sm text-muted hover:border-info/50 hover:text-info"
            type="button"
            onClick={testModelConnection}
            disabled={!form.apiKey || !form.baseUrl || !form.model}
          >
            <Network size={16} />
            测试模型连接
          </button>
        </div>
        {status ? <p className="text-sm text-muted">{status}</p> : null}
        {modelTestStatus ? <p className="text-sm text-muted">{modelTestStatus}</p> : null}
      </div>

      <div className="mt-6 border-t border-line pt-6">
        <SectionTitle icon={ServerCog} title="运行配置快照" meta="敏感字段仅保存在服务端" />
        <div className="mt-5 grid gap-3">
          <Setting label="服务商" value={formatProvider(settings?.provider) ?? "加载中"} />
          <Setting label="服务商名称" value={settings?.providerName ?? ""} />
          <Setting label="接口地址" value={settings?.baseUrl ?? ""} />
          <Setting label="模型名称" value={settings?.model ?? ""} />
          <Setting label="API 密钥" value={settings?.apiKeyMasked ?? ""} />
          <Setting label="是否启用" value={settings ? (settings.enabled ? "已启用" : "已关闭") : ""} />
          <Setting label="系统反馈" value={settings ? (settings.modelAuditEnabled ? "每次生成" : "关闭") : ""} />
          <Setting label="westock 版本" value={settings?.westockPackageVersion ?? ""} />
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-up/30 bg-up/10 p-3 text-sm text-up">
          <CheckCircle2 className="mt-0.5 shrink-0" size={16} />
          <p>报告和模型配置均来自后端存储。仪表盘读取 SQLite 中的最新报告，不使用静态模拟数据。</p>
        </div>
      </div>
    </Panel>
  );
}

export function DataSourceSettingsPanel({
  dataForm,
  setDataForm,
  dataStatus,
  dataTestStatus,
  dataCapabilityAudit,
  visibleDataKeys,
  setVisibleDataKeys,
  saveDataSourceSettings,
  testDataProviderConnection
}: {
  dataForm: DataSourceSettingsForm;
  setDataForm: Dispatch<SetStateAction<DataSourceSettingsForm>>;
  dataStatus: string;
  dataTestStatus: Record<string, string>;
  dataCapabilityAudit: Record<string, ProviderCapabilityAudit["providers"][number]>;
  visibleDataKeys: Record<string, boolean>;
  setVisibleDataKeys: Dispatch<SetStateAction<Record<string, boolean>>>;
  saveDataSourceSettings: () => void;
  testDataProviderConnection: (provider: DataProvider) => void;
}) {
  function updateDataProvider(id: string, patch: Partial<DataProvider>) {
    setDataForm((current) => ({
      providers: current.providers.map((provider) => provider.id === id ? { ...provider, ...patch } : provider)
    }));
  }

  return (
    <Panel>
      <SectionTitle icon={Database} title="数据源配置" meta="Provider + Fusion，按字段留痕" />
      <div className="mt-5 grid gap-3">
        {dataForm.providers.map((provider) => (
          <div key={provider.id} className="rounded-lg border border-line bg-bg/45 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-text">{provider.name}</p>
                <p className="mt-1 text-xs leading-5 text-muted">{provider.sourceLabel}</p>
                <p className="mt-1 text-xs leading-5 text-muted">{provider.reliabilityNote}</p>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted">
                <span>{provider.enabled ? "启用" : "关闭"}</span>
                <input
                  className="h-4 w-4 accent-info"
                  type="checkbox"
                  checked={provider.enabled}
                  onChange={(event) => updateDataProvider(provider.id, { enabled: event.target.checked })}
                />
              </label>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_120px_120px]">
              <SecretInput
                label={provider.id === "tushare" ? "Tushare Token" : "API 密钥"}
                value={provider.apiKey ?? ""}
                visible={Boolean(visibleDataKeys[provider.id])}
                onToggleVisible={() => setVisibleDataKeys((current) => ({ ...current, [provider.id]: !current[provider.id] }))}
                onChange={(apiKey) => updateDataProvider(provider.id, { apiKey })}
                disabled={provider.id !== "tushare"}
                placeholder={provider.id === "tushare" ? "" : "该来源当前无需密钥"}
              />
              <TextInput
                label="优先级"
                value={String(provider.priority)}
                onChange={(priority) => updateDataProvider(provider.id, { priority: Number(priority) })}
              />
              <label className="grid gap-2 text-sm">
                <span className="text-xs text-muted">状态</span>
                <select
                  className="rounded-lg border border-line bg-bg/60 px-3 py-2 text-sm outline-none"
                  value={provider.status}
                  onChange={(event) => updateDataProvider(provider.id, { status: event.target.value as DataProvider["status"] })}
                >
                  <option value="active">已接入</option>
                  <option value="planned">待接入</option>
                  <option value="disabled">已关闭</option>
                </select>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {provider.capabilities.slice(0, 6).map((capability) => (
                <span key={capability} className="rounded-full border border-line bg-panel/60 px-2 py-1 text-[11px] text-muted">
                  {capability}
                </span>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                className="flex w-fit items-center gap-2 rounded-lg border border-line bg-bg/60 px-3 py-2 text-xs text-muted hover:border-info/50 hover:text-info"
                type="button"
                onClick={() => testDataProviderConnection(provider)}
              >
                <Network size={14} />
                测试连接
              </button>
              {dataTestStatus[provider.id] ? <p className="text-xs text-muted">{dataTestStatus[provider.id]}</p> : null}
            </div>
            {dataCapabilityAudit[provider.id] ? (
              <ProviderCapabilityCheckList audit={dataCapabilityAudit[provider.id]} />
            ) : null}
          </div>
        ))}
        <button
          className="flex w-fit items-center gap-2 rounded-lg border border-info/40 bg-info/10 px-4 py-2 text-sm text-info disabled:opacity-60"
          type="button"
          onClick={saveDataSourceSettings}
          disabled={!dataForm.providers.length}
        >
          <Save size={16} />
          保存数据源配置
        </button>
        {dataStatus ? <p className="text-sm text-muted">{dataStatus}</p> : null}
      </div>
    </Panel>
  );
}

function ProviderCapabilityCheckList({ audit }: { audit: ProviderCapabilityAudit["providers"][number] }) {
  return (
    <div className="mt-3 rounded-lg border border-line/60 bg-panel/45 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-text">能力测试明细</p>
        <span className={`rounded border px-2 py-0.5 text-[11px] ${audit.connected ? "border-up/35 bg-up/10 text-up" : "border-warn/35 bg-warn/10 text-warn"}`}>
          {audit.connected ? "基础连接可用" : "基础连接异常"}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-5 text-muted">{audit.summary}</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {audit.checks.map((check) => (
          <div key={check.key} className={`rounded border px-2 py-2 text-[11px] leading-4 ${capabilityStatusClass(check.status)}`}>
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium">{check.label}</span>
              <span className="shrink-0 rounded border border-current/20 bg-bg/25 px-1.5 py-0.5">{capabilityStatusLabel(check.status)}</span>
            </div>
            <p className="mt-1 opacity-85">{check.requiredFor}</p>
            <p className="mt-1 opacity-75">{check.message}</p>
            <p className="mt-1 font-mono opacity-60">
              {check.apiName ?? check.key}
              {typeof check.recordCount === "number" ? ` / ${check.recordCount} 条` : ""}
              {typeof check.elapsedMs === "number" ? ` / ${check.elapsedMs}ms` : ""}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function capabilityStatusLabel(status: string) {
  if (status === "available") return "可用";
  if (status === "available_empty") return "可调用";
  if (status === "permission_denied") return "权限不足";
  if (status === "unconfigured") return "未配置";
  if (status === "failed") return "失败";
  return "运行时留痕";
}

function capabilityStatusClass(status: string) {
  if (status === "available" || status === "available_empty") return "border-up/25 bg-up/10 text-up";
  if (status === "permission_denied") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (status === "failed" || status === "unconfigured") return "border-warn/30 bg-warn/10 text-warn";
  return "border-line bg-bg/45 text-muted";
}
