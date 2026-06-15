"use client";

import { useEffect, useState } from "react";
import type { AppSettings, ModelAuditStatus } from "@/lib/types";
import { AuditFeedbackHeader, buildAuditCopyText, Panel, type AuditDetail, type AuditSummary } from "@/components/ResearchModelAuditCommon";
import { ModelAuditDetail } from "@/components/ResearchModelAuditDetail";
import { ModelAuditList } from "@/components/ResearchModelAuditList";

type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };

export function ModelAuditView({
  feedback,
  settings,
  onSettingsSaved,
  onReload
}: {
  feedback: AuditSummary[];
  settings: AppSettings | null;
  onSettingsSaved: (settings: AppSettings) => void;
  onReload: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [selectedDetail, setSelectedDetail] = useState<AuditDetail | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [savingAuditSwitch, setSavingAuditSwitch] = useState(false);
  const selectedSummary = feedback.find((item) => item.id === selectedId) ?? feedback[0] ?? null;

  useEffect(() => {
    if (!selectedId && feedback[0]) setSelectedId(feedback[0].id);
  }, [feedback, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetail(null);
      return;
    }
    void loadAuditDetail(selectedId);
  }, [selectedId]);

  async function loadAuditDetail(id: string) {
    try {
      const json = await fetchJson<AuditDetail>(`/api/model-audit/${id}`);
      setSelectedDetail(json.data ?? null);
    } catch (error) {
      setSelectedDetail(null);
      setStatusMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function updateStatus(status: ModelAuditStatus) {
    if (!selectedSummary) return;
    setStatusMessage("正在更新状态...");
    try {
      const response = await fetch(`/api/model-audit/${selectedSummary.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status })
      });
      const json = (await response.json()) as ApiResponse<AuditDetail>;
      if (!json.success) throw new Error(json.error?.message ?? "状态更新失败");
      setSelectedDetail(json.data ?? null);
      await onReload();
      setStatusMessage(`已标记为${status}`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function copyForCodex() {
    if (!selectedDetail) return;
    const text = buildAuditCopyText(selectedDetail);
    try {
      await navigator.clipboard.writeText(text);
      setStatusMessage("已复制，可直接发给 Codex 判断是否采纳。");
    } catch {
      setStatusMessage(text);
    }
  }

  async function updateAuditSwitch(enabled: boolean) {
    if (!settings) return;
    setSavingAuditSwitch(true);
    setStatusMessage(enabled ? "正在开启系统反馈..." : "正在关闭系统反馈...");
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: settings.provider,
          providerName: settings.providerName,
          baseUrl: settings.baseUrl,
          apiKey: "",
          model: settings.model,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          timeoutMs: settings.timeoutMs,
          enabled: settings.enabled,
          modelAuditEnabled: enabled
        })
      });
      const json = (await response.json()) as ApiResponse<AppSettings>;
      if (!json.success || !json.data) throw new Error(json.error?.message ?? "系统反馈开关保存失败");
      onSettingsSaved(json.data);
      setStatusMessage(enabled ? "已开启。下一次运行今日分析会生成系统反馈。" : "已关闭。后续分析不会额外生成系统反馈。");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingAuditSwitch(false);
    }
  }

  if (!feedback.length) {
    return (
      <Panel>
        <AuditFeedbackHeader
          feedbackCount={feedback.length}
          settings={settings}
          saving={savingAuditSwitch}
          onToggle={(enabled) => void updateAuditSwitch(enabled)}
        />
        <p className="mt-4 text-sm leading-6 text-muted">暂无反馈记录。下一次运行今日分析后，DeepSeek 会基于事实包、规则、记忆和研报生成系统改进建议。</p>
        {statusMessage ? <p className="mt-3 rounded-lg border border-info/30 bg-info/10 p-3 text-sm text-info">{statusMessage}</p> : null}
      </Panel>
    );
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <Panel>
        <AuditFeedbackHeader
          feedbackCount={feedback.length}
          settings={settings}
          saving={savingAuditSwitch}
          onToggle={(enabled) => void updateAuditSwitch(enabled)}
        />
        <ModelAuditList feedback={feedback} selectedId={selectedSummary?.id ?? null} onSelect={setSelectedId} />
      </Panel>
      <Panel>
        <ModelAuditDetail
          selected={selectedDetail}
          statusMessage={statusMessage}
          onUpdateStatus={(status) => void updateStatus(status)}
          onCopy={() => void copyForCodex()}
        />
      </Panel>
    </section>
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const response = await fetch(url, init);
  const json = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!response.ok || !json?.success) {
    throw new Error(json?.error?.message ?? `请求失败：${url}`);
  }
  return json;
}
