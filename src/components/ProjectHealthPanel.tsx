"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, RefreshCw, ShieldAlert } from "lucide-react";
import { fetchApiJson } from "@/lib/client/api";
import {
  SettingsMiniStat as MiniStat,
  SettingsPanel as Panel,
  SettingsSectionTitle as SectionTitle
} from "@/components/ResearchSettingsControls";
import type { ProjectHealthLevel, ProjectHealthSnapshot } from "@/lib/project/health";

export function ProjectHealthPanel() {
  const [snapshot, setSnapshot] = useState<ProjectHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const json = await fetchApiJson<ProjectHealthSnapshot>("/api/project-health", { cache: "no-store" });
      if (!json.data) throw new Error(json.error?.message ?? "系统健康状态读取失败");
      setSnapshot(json.data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <Panel className="xl:col-span-2">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <SectionTitle icon={Activity} title="系统健康总览" meta="报告新鲜度 / 数据源 / 模型成本 / 调度 / 追踪闭环" />
        <button
          className="flex w-fit items-center gap-2 rounded-lg border border-line bg-bg/60 px-3 py-2 text-xs text-muted transition hover:border-info/50 hover:text-info disabled:opacity-60"
          type="button"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={loading ? "animate-spin" : ""} size={15} />
          刷新体检
        </button>
      </div>

      {loading && !snapshot ? (
        <div className="mt-4 rounded-lg border border-line bg-bg/55 p-3 text-sm text-muted">正在读取系统健康状态...</div>
      ) : null}
      {error ? (
        <div className="mt-4 rounded-lg border border-warn/35 bg-warn/10 p-3 text-sm text-warn">{error}</div>
      ) : null}
      {snapshot ? <ProjectHealthBody snapshot={snapshot} /> : null}
    </Panel>
  );
}

function ProjectHealthBody({ snapshot }: { snapshot: ProjectHealthSnapshot }) {
  const tone = levelTone(snapshot.overallLevel);
  const Icon = snapshot.overallLevel === "healthy" ? CheckCircle2 : snapshot.overallLevel === "risk" ? ShieldAlert : AlertTriangle;
  return (
    <div className="mt-4 grid gap-4">
      <div className={`rounded-lg border p-4 ${tone.panel}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border ${tone.icon}`}>
              <Icon size={20} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-semibold">当前状态：{snapshot.overallLabel}</p>
                <span className={`rounded border px-2 py-0.5 text-[11px] ${tone.badge}`}>{levelLabel(snapshot.overallLevel)}</span>
              </div>
              <p className="mt-1 text-sm leading-6 text-muted">{snapshot.summary}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-bg/45 px-3 py-2 text-xs text-muted">
            <Clock3 size={14} />
            {formatDateTime(snapshot.generatedAt)}
          </div>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <MiniStat label="数据库" value={`${snapshot.metrics.databaseSizeMB} MB`} />
        <MiniStat label="摘要覆盖" value={`${snapshot.metrics.reportSummaryCoveragePct}%`} />
        <MiniStat label="模型调用 7日" value={`${snapshot.metrics.modelCallCount7d} 次`} />
        <MiniStat label="活跃追踪" value={`${snapshot.metrics.activeTrackingCount} 只`} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {snapshot.checks.map((check) => {
          const checkTone = levelTone(check.level);
          return (
            <div key={check.key} className={`rounded-lg border p-3 ${checkTone.panel}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{check.label}</p>
                  <p className="mt-1 text-xs text-muted">{check.value}</p>
                </div>
                <span className={`rounded border px-2 py-0.5 text-[11px] ${checkTone.badge}`}>{levelLabel(check.level)}</span>
              </div>
              <p className="mt-3 text-xs leading-5 text-muted">{check.detail}</p>
              {check.nextAction ? (
                <p className="mt-2 rounded border border-info/25 bg-info/10 px-2 py-1.5 text-xs leading-5 text-info">{check.nextAction}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      {snapshot.nextActions.length ? (
        <details className="rounded-lg border border-line bg-bg/45 p-3" open>
          <summary className="cursor-pointer text-sm font-medium text-info">优先处理建议</summary>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {snapshot.nextActions.map((action) => (
              <p key={action} className="rounded border border-line bg-panel/55 px-3 py-2 text-xs leading-5 text-muted">
                {action}
              </p>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function levelTone(level: ProjectHealthLevel) {
  if (level === "healthy") {
    return {
      panel: "border-up/30 bg-up/10",
      icon: "border-up/35 bg-up/10 text-up",
      badge: "border-up/35 bg-up/10 text-up"
    };
  }
  if (level === "risk") {
    return {
      panel: "border-warn/35 bg-warn/10",
      icon: "border-warn/35 bg-warn/10 text-warn",
      badge: "border-warn/35 bg-warn/10 text-warn"
    };
  }
  if (level === "degraded") {
    return {
      panel: "border-info/30 bg-info/10",
      icon: "border-info/35 bg-info/10 text-info",
      badge: "border-info/35 bg-info/10 text-info"
    };
  }
  return {
    panel: "border-line bg-bg/40",
    icon: "border-line bg-bg/55 text-muted",
    badge: "border-line bg-bg/55 text-muted"
  };
}

function levelLabel(level: ProjectHealthLevel) {
  if (level === "healthy") return "健康";
  if (level === "degraded") return "降级";
  if (level === "risk") return "风险";
  return "待运行";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}
