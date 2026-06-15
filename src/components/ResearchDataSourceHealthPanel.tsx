"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Database, History, ShieldAlert } from "lucide-react";
import type { DataSourceHealthSnapshot } from "@/lib/db/dataSourceHealth";

type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };

export function DataSourceHealthPanel() {
  const [snapshot, setSnapshot] = useState<DataSourceHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch("/api/data-source-health?limit=20", { cache: "no-store" });
        const json = (await response.json()) as ApiResponse<DataSourceHealthSnapshot>;
        if (!response.ok || !json.success || !json.data) throw new Error(json.error?.message ?? "数据源健康状态读取失败");
        if (!cancelled) {
          setSnapshot(json.data);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="rounded-lg border border-line/70 bg-bg/50 p-3 text-sm text-muted">正在读取最近 20 份报告的数据源留痕...</div>;
  }
  if (error) {
    return <div className="rounded-lg border border-warn/35 bg-warn/10 p-3 text-sm text-warn">{error}</div>;
  }
  if (!snapshot || snapshot.overallStatus === "empty") {
    return <div className="rounded-lg border border-line/70 bg-bg/50 p-3 text-sm text-muted">还没有可用于统计的数据源历史报告。</div>;
  }

  return (
    <div className="grid gap-3">
      <HealthSummary snapshot={snapshot} />
      <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
        <ProviderGrid snapshot={snapshot} />
        <RuleImpactList snapshot={snapshot} />
      </div>
      <WarningGroups snapshot={snapshot} />
    </div>
  );
}

function HealthSummary({ snapshot }: { snapshot: DataSourceHealthSnapshot }) {
  const tone = healthTone(snapshot.overallStatus);
  const Icon = snapshot.overallStatus === "healthy" ? CheckCircle2 : snapshot.overallStatus === "risk" ? ShieldAlert : AlertTriangle;
  return (
    <div className={`rounded-lg border p-3 ${tone.panel}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${tone.icon}`}>
            <Icon size={18} />
          </div>
          <div>
            <p className="text-sm font-medium">历史数据源健康：{healthLabel(snapshot.overallStatus)}</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              统计最近 {snapshot.reportCount} 份正式分析报告。最新报告：{snapshot.latestReportAt ? formatTime(snapshot.latestReportAt) : "暂无"}。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge label="来源" value={snapshot.providers.length} />
          <Badge label="警告组" value={snapshot.warningGroups.length} />
          <Badge label="规则影响" value={snapshot.ruleImpacts.filter((item) => item.status !== "ok").length} warn />
        </div>
      </div>
    </div>
  );
}

function ProviderGrid({ snapshot }: { snapshot: DataSourceHealthSnapshot }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {snapshot.providers.map((provider) => {
        const tone = healthTone(provider.status);
        const degraded = provider.fallbackCount + provider.approximateCount + provider.missingCount;
        return (
          <div key={provider.provider} className={`rounded-lg border p-3 ${tone.panel}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{provider.providerName}</p>
                <p className="mt-1 text-xs text-muted">{provider.provider}</p>
              </div>
              <span className={`rounded border px-2 py-0.5 text-[11px] ${tone.badge}`}>{healthLabel(provider.status)}</span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[11px]">
              <MiniMetric label="总留痕" value={provider.traceCount} />
              <MiniMetric label="主源" value={provider.primaryCount} />
              <MiniMetric label="降级" value={degraded} />
              <MiniMetric label="缺失" value={provider.missingCount} />
            </div>
            <p className="mt-3 text-xs leading-5 text-muted">{provider.impact}</p>
          </div>
        );
      })}
    </div>
  );
}

function RuleImpactList({ snapshot }: { snapshot: DataSourceHealthSnapshot }) {
  return (
    <div className="rounded-lg border border-line/70 bg-bg/50 p-3">
      <div className="flex items-center gap-2">
        <History size={16} className="text-info" />
        <p className="text-sm font-medium">规则影响说明</p>
      </div>
      <div className="mt-3 grid gap-2">
        {snapshot.ruleImpacts.map((item) => {
          const tone = impactTone(item.status);
          return (
            <div key={item.rule} className={`rounded-lg border p-3 ${tone.panel}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{item.rule}</p>
                <span className={`rounded border px-2 py-0.5 text-[11px] ${tone.badge}`}>{impactLabel(item.status)}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">{item.reason}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WarningGroups({ snapshot }: { snapshot: DataSourceHealthSnapshot }) {
  const [open, setOpen] = useState(false);
  const riskCount = useMemo(() => snapshot.warningGroups.filter((item) => item.severity === "risk").length, [snapshot.warningGroups]);
  if (!snapshot.warningGroups.length) {
    return <div className="rounded-lg border border-up/30 bg-up/10 p-3 text-sm text-up">最近报告没有数据源警告组。</div>;
  }
  return (
    <div className="rounded-lg border border-line/70 bg-bg/50">
      <button className="flex w-full items-center justify-between gap-3 p-3 text-left" type="button" onClick={() => setOpen((value) => !value)}>
        <span>
          <span className="block text-sm font-medium">历史警告聚合</span>
          <span className="mt-1 block text-xs text-muted">按影响范围和严重度合并，避免每份报告重复刷屏。风险组 {riskCount} 个。</span>
        </span>
        <ChevronDown className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} size={18} />
      </button>
      {open ? (
        <div className="grid gap-2 border-t border-line/70 p-3 md:grid-cols-2">
          {snapshot.warningGroups.map((group) => {
            const tone = impactTone(group.severity === "risk" ? "risk" : group.severity === "warning" ? "degraded" : "ok");
            return (
              <div key={`${group.scope}-${group.severity}`} className={`rounded-lg border p-3 ${tone.panel}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{scopeLabel(group.scope)} / {severityLabel(group.severity)}</p>
                  <span className={`rounded border px-2 py-0.5 text-[11px] ${tone.badge}`}>{group.count} 次</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted">{group.impact}</p>
                <div className="mt-2 space-y-1">
                  {group.examples.map((example) => (
                    <p key={example} className="rounded border border-line/60 bg-bg/45 p-2 text-[11px] leading-4 text-muted">{example}</p>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Badge({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return <span className={`rounded border px-2 py-1 ${warn && value ? "border-warn/40 bg-warn/10 text-warn" : "border-line bg-bg/55 text-muted"}`}>{label} {value}</span>;
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-line/60 bg-bg/45 px-2 py-1">
      <p className="font-semibold text-slate-100">{value}</p>
      <p className="mt-0.5 text-muted">{label}</p>
    </div>
  );
}

function healthLabel(status: DataSourceHealthSnapshot["overallStatus"] | DataSourceHealthSnapshot["providers"][number]["status"]) {
  if (status === "healthy") return "健康";
  if (status === "degraded") return "降级";
  if (status === "risk") return "风险";
  if (status === "idle") return "未触发";
  return "暂无数据";
}

function impactLabel(status: "ok" | "degraded" | "risk") {
  if (status === "ok") return "可用";
  if (status === "degraded") return "降级解读";
  return "需要处理";
}

function severityLabel(severity: "risk" | "warning" | "info") {
  if (severity === "risk") return "风险";
  if (severity === "warning") return "警告";
  return "提示";
}

function scopeLabel(scope: string) {
  const labels: Record<string, string> = {
    market: "大盘",
    sector: "板块",
    stock: "个股",
    company: "公司",
    calendar: "日历",
    model: "模型",
    system: "系统"
  };
  return labels[scope] ?? scope;
}

function healthTone(status: DataSourceHealthSnapshot["overallStatus"] | DataSourceHealthSnapshot["providers"][number]["status"]) {
  if (status === "healthy") return { panel: "border-up/30 bg-up/10", icon: "border-up/40 text-up", badge: "border-up/40 bg-up/10 text-up" };
  if (status === "risk") return { panel: "border-warn/35 bg-warn/10", icon: "border-warn/45 text-warn", badge: "border-warn/45 bg-warn/10 text-warn" };
  return { panel: "border-info/30 bg-info/10", icon: "border-info/40 text-info", badge: "border-info/40 bg-info/10 text-info" };
}

function impactTone(status: "ok" | "degraded" | "risk") {
  if (status === "ok") return { panel: "border-up/30 bg-up/10", badge: "border-up/40 bg-up/10 text-up" };
  if (status === "risk") return { panel: "border-warn/35 bg-warn/10", badge: "border-warn/45 bg-warn/10 text-warn" };
  return { panel: "border-info/30 bg-info/10", badge: "border-info/40 bg-info/10 text-info" };
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}
