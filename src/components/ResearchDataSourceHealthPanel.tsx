"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Database, GitBranch, History, Layers3, ShieldAlert } from "lucide-react";
import { fetchApiJson } from "@/lib/client/api";
import type { DataSourceHealthSnapshot } from "@/lib/db/dataSourceHealth";
import type { ProviderAuditSnapshot } from "@/lib/data/providerDecouplingAudit";

type Tone = "up" | "info" | "warn" | "muted";

export function DataSourceHealthPanel() {
  const [snapshot, setSnapshot] = useState<DataSourceHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const json = await fetchApiJson<DataSourceHealthSnapshot>("/api/data-source-health?limit=20", { cache: "no-store" });
        if (!json.data) throw new Error(json.error?.message ?? "数据源健康状态读取失败");
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
      <HealthCacheMeta snapshot={snapshot} />
      <ProviderDecouplingAuditCard />
      <ActionabilityCard snapshot={snapshot} />
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
            <p className="text-sm font-medium">历史数据源健康度：{healthLabel(snapshot.overallStatus)}</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              统计最近 {snapshot.reportCount} 份正式分析报告。最新报告：{snapshot.latestReportAt ? formatTime(snapshot.latestReportAt) : "暂无"}，
              距今 {formatAge(snapshot.latestReportAgeMinutes)}。
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

function HealthCacheMeta({ snapshot }: { snapshot: DataSourceHealthSnapshot }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line/60 bg-bg/45 px-3 py-2 text-[11px] text-muted">
      <span>快照生成 {snapshot.generatedAt ? formatTime(snapshot.generatedAt) : "--"}</span>
      <span>本次读取 {snapshot.servedAt ? formatTime(snapshot.servedAt) : "--"}</span>
      {snapshot.cacheStatus ? (
        <span className="rounded border border-info/30 bg-info/10 px-2 py-0.5 text-info">
          {snapshot.cacheStatus === "hit" ? "短缓存命中" : "重新聚合"} / {snapshot.cacheTtlSeconds ?? 0}s
        </span>
      ) : null}
    </div>
  );
}

function ActionabilityCard({ snapshot }: { snapshot: DataSourceHealthSnapshot }) {
  const actionability = snapshot.actionability;
  const tone = actionabilityTone(actionability.level);
  return (
    <div className={`rounded-lg border p-3 ${tone.panel}`}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${tone.icon}`}>
            <Database size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">数据源结论可行动等级：{actionability.label}</p>
              <span className={`rounded border px-2 py-0.5 text-[11px] ${tone.badge}`}>{actionabilityLevelLabel(actionability.level)}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted">{actionability.summary}</p>
          </div>
        </div>
        <div className="grid min-w-0 gap-2 text-xs md:grid-cols-2 xl:w-[520px]">
          <ActionList title="允许用途" items={actionability.allowedUses} tone="up" />
          <ActionList title="禁止用途" items={actionability.blockedUses} tone={actionability.level === "usable" ? "info" : "warn"} />
        </div>
      </div>
      {actionability.impactRules.length || actionability.staleProviders.length || actionability.missingScopes.length ? (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <TagGroup title="影响规则" items={actionability.impactRules} />
          <TagGroup title="过期来源" items={actionability.staleProviders} />
          <TagGroup title="缺口范围" items={actionability.missingScopes} />
        </div>
      ) : null}
      {actionability.blockingReasons.length || actionability.downgradeReasons.length || actionability.limitedImpactWarnings.length ? (
        <details className="group mt-3 rounded-lg border border-line/60 bg-bg/35">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs text-muted">
            <span>查看可行动性判定证据</span>
            <ChevronDown className="transition-transform group-open:rotate-180" size={16} />
          </summary>
          <div className="grid gap-2 border-t border-line/60 p-3 md:grid-cols-3">
            <ReasonList title="硬阻断" items={actionability.blockingReasons} tone="warn" emptyText="暂无硬阻断" />
            <ReasonList title="降级原因" items={actionability.downgradeReasons} tone="info" emptyText="暂无降级原因" />
            <ReasonList title="影响有限" items={actionability.limitedImpactWarnings} tone="muted" emptyText="暂无有限影响告警" />
          </div>
        </details>
      ) : null}
      {actionability.repeatedWarnings.length ? (
        <details className="group mt-3 rounded-lg border border-line/60 bg-bg/35">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs text-muted">
            <span>重复出现的数据源问题</span>
            <ChevronDown className="transition-transform group-open:rotate-180" size={16} />
          </summary>
          <div className="grid gap-2 border-t border-line/60 p-3 md:grid-cols-2">
            {actionability.repeatedWarnings.map((item) => (
              <p key={item} className="rounded border border-line/60 bg-bg/45 p-2 text-[11px] leading-4 text-muted">{item}</p>
            ))}
          </div>
        </details>
      ) : null}
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
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
              <MiniTextMetric label="最近抓取" value={provider.latestFetchedAt ? formatTime(provider.latestFetchedAt) : "--"} />
              <MiniTextMetric label="时效" value={`${freshnessLabel(provider.freshnessStatus)} / ${formatAge(provider.ageMinutes)}`} />
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

function ProviderDecouplingAuditCard() {
  const [audit, setAudit] = useState<ProviderAuditSnapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const json = await fetchApiJson<ProviderAuditSnapshot>("/api/data-provider-audit", { cache: "no-store" });
        if (!json.data) throw new Error(json.error?.message ?? "数据源解耦审计读取失败");
        if (!cancelled) {
          setAudit(json.data);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-lg border border-info/25 bg-info/10 p-3 text-xs leading-5 text-info">
        数据源解耦审计暂不可用：{error}
      </div>
    );
  }
  if (!audit) {
    return (
      <div className="rounded-lg border border-line/70 bg-bg/45 p-3 text-xs leading-5 text-muted">
        正在读取数据源解耦迁移清单...
      </div>
    );
  }

  const p0Count = audit.priorityCounts.p0 ?? 0;
  const p1Count = audit.priorityCounts.p1 ?? 0;
  const p2Count = audit.priorityCounts.p2 ?? 0;
  const gatewayReadyCount = audit.statusCounts.gateway_ready ?? 0;
  const inProgressCount = audit.statusCounts.in_progress ?? 0;
  const todoCount = audit.statusCounts.todo ?? 0;
  const p0Dependencies = audit.dependencies.filter((item) => item.priority === "p0");
  const grouped = [
    { priority: "p0" as const, title: "P0 先拆", items: p0Dependencies },
    { priority: "p1" as const, title: "P1 跟进", items: audit.dependencies.filter((item) => item.priority === "p1") },
    { priority: "p2" as const, title: "P2 展示层", items: audit.dependencies.filter((item) => item.priority === "p2") }
  ];

  return (
    <div className="rounded-lg border border-cyan-300/25 bg-cyan-300/[0.055] p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-300/35 bg-cyan-300/10 text-cyan-100">
            <GitBranch size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-cyan-50">数据层解耦迁移清单</p>
              <span className="rounded border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11px] text-warn">P0 {p0Count}</span>
              <span className="rounded border border-info/35 bg-info/10 px-2 py-0.5 text-[11px] text-info">P1 {p1Count}</span>
              <span className="rounded border border-line bg-bg/45 px-2 py-0.5 text-[11px] text-muted">P2 {p2Count}</span>
              <span className="rounded border border-up/35 bg-up/10 px-2 py-0.5 text-[11px] text-up">已建网关 {gatewayReadyCount}</span>
              <span className="rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[11px] text-cyan-100">进行中 {inProgressCount}</span>
              <span className="rounded border border-warn/35 bg-warn/10 px-2 py-0.5 text-[11px] text-warn">待拆 {todoCount}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted">
              当前仍有 {audit.total} 处模块直接依赖具体数据适配器，其中 {todoCount} 处尚未拆分。这里不代表功能错误，而是标记后续替换 Tushare、东方财富、腾讯等来源时的重构边界。
            </p>
          </div>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2 text-[11px] md:grid-cols-4 xl:w-[520px]">
          <MiniMetric label="直接依赖" value={audit.total} />
          <MiniMetric label="已建网关" value={gatewayReadyCount} />
          <MiniMetric label="涉及层级" value={Object.keys(audit.layerCounts).length} />
          <MiniMetric label="涉及来源" value={Object.keys(audit.providerCounts).length} />
        </div>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-[0.9fr_1.1fr]">
        {audit.capabilities ? (
          <ProviderCapabilityAuditSummary audit={audit.capabilities} />
        ) : null}
        <div className="rounded-lg border border-cyan-300/15 bg-bg/35 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-cyan-50">
            <Layers3 size={15} />
            <span>建议迁移顺序</span>
          </div>
          <div className="mt-3 grid gap-2">
            {audit.migrationOrder.map((step, index) => (
              <div key={step} className="flex gap-2 rounded border border-line/55 bg-bg/45 p-2 text-xs leading-5 text-muted">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-cyan-300/30 bg-cyan-300/10 text-[10px] text-cyan-100">
                  {index + 1}
                </span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>

        <details className="group rounded-lg border border-line/70 bg-bg/45">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 text-left">
            <span>
              <span className="block text-sm font-medium text-slate-100">查看直接依赖明细</span>
              <span className="mt-1 block text-xs text-muted">
                优先处理 {audit.p0Modules.slice(0, 2).join("、")}{audit.p0Modules.length > 2 ? ` 等 ${audit.p0Modules.length} 个 P0 模块` : ""}
              </span>
            </span>
            <ChevronDown className="shrink-0 text-muted transition-transform group-open:rotate-180" size={18} />
          </summary>
          <div className="grid gap-2 border-t border-line/70 p-3">
            {grouped.map((group) => (
              <div key={group.priority} className="grid gap-2">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className={`rounded border px-2 py-0.5 ${priorityTone(group.priority)}`}>{group.title}</span>
                  <span className="text-muted">{group.items.length} 处</span>
                </div>
                {group.items.map((item) => (
                  <div key={item.module} className="rounded-lg border border-line/60 bg-bg/35 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-slate-100">{item.module}</span>
                      <span className={`rounded border px-2 py-0.5 text-[11px] ${migrationStatusTone(item.status)}`}>{migrationStatusLabel(item.status)}</span>
                      <span className="rounded border border-line/60 bg-bg/50 px-2 py-0.5 text-[11px] text-muted">{layerLabel(item.layer)}</span>
                      {item.providers.map((provider) => (
                        <span key={provider} className="rounded border border-cyan-300/20 bg-cyan-300/[0.06] px-2 py-0.5 text-[11px] text-cyan-100">
                          {providerLabel(provider)}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 rounded border border-line/55 bg-bg/45 p-2 text-xs leading-5 text-slate-200">进展：{item.progress}</p>
                    <p className="mt-2 text-xs leading-5 text-muted">问题：{item.reason}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-300">目标：{item.target}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}

function ProviderCapabilityAuditSummary({ audit }: { audit: NonNullable<ProviderAuditSnapshot["capabilities"]> }) {
  const checks = audit.providers.flatMap((provider) => provider.checks.map((check) => ({ ...check, providerName: provider.providerName })));
  const available = checks.filter((check) => check.status === "available" || check.status === "available_empty").length;
  const denied = checks.filter((check) => check.status === "permission_denied");
  const failed = checks.filter((check) => check.status === "failed");
  return (
    <div className="rounded-lg border border-cyan-300/15 bg-bg/35 p-3 lg:col-span-2">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-cyan-50">数据源能力与权限审计</p>
            <span className="rounded border border-up/35 bg-up/10 px-2 py-0.5 text-[11px] text-up">可用 {available}</span>
            <span className="rounded border border-amber-300/35 bg-amber-300/10 px-2 py-0.5 text-[11px] text-amber-100">权限不足 {denied.length}</span>
            <span className="rounded border border-warn/35 bg-warn/10 px-2 py-0.5 text-[11px] text-warn">失败 {failed.length}</span>
            <span className="rounded border border-line bg-bg/45 px-2 py-0.5 text-[11px] text-muted">{audit.cacheStatus === "hit" ? "缓存命中" : "刚刚测试"}</span>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted">
            这里回答“到底能不能补数据”：基础行情、K线、资金、财务、股东户数若可用，可以自动补；概念成分若显示权限不足，就不能用当前 Tushare 权限硬补。
          </p>
        </div>
        <div className="grid gap-2 text-[11px] xl:w-[520px]">
          {audit.criticalGaps.length ? audit.criticalGaps.map((gap) => (
            <p key={gap} className="rounded border border-amber-300/25 bg-amber-300/10 px-2 py-1.5 text-amber-100">{gap}</p>
          )) : (
            <p className="rounded border border-up/25 bg-up/10 px-2 py-1.5 text-up">当前未发现关键权限缺口。</p>
          )}
        </div>
      </div>
      <details className="group mt-3 rounded-lg border border-line/60 bg-bg/35">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs text-muted">
          <span>展开接口能力明细</span>
          <ChevronDown className="transition-transform group-open:rotate-180" size={16} />
        </summary>
        <div className="grid gap-2 border-t border-line/60 p-3 md:grid-cols-2 xl:grid-cols-3">
          {checks.map((check) => (
            <div key={`${check.providerId}-${check.key}`} className={`rounded border px-2 py-2 text-[11px] leading-4 ${capabilityStatusClass(check.status)}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{check.providerName}｜{check.label}</span>
                <span className="shrink-0 rounded border border-current/20 bg-bg/25 px-1.5 py-0.5">{capabilityStatusLabel(check.status)}</span>
              </div>
              <p className="mt-1 opacity-80">{check.requiredFor}</p>
              <p className="mt-1 opacity-70">{check.message}</p>
            </div>
          ))}
        </div>
      </details>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {audit.supplementAdvice.map((advice) => (
          <p key={advice} className="rounded border border-line/60 bg-bg/40 px-2 py-1.5 text-xs leading-5 text-muted">{advice}</p>
        ))}
      </div>
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

function MiniTextMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-line/60 bg-bg/45 px-2 py-1">
      <p className="text-muted">{label}</p>
      <p className="mt-0.5 truncate font-mono text-[11px] text-slate-100" title={value}>{value}</p>
    </div>
  );
}

function ActionList({ title, items, tone }: { title: string; items: string[]; tone: Tone }) {
  return (
    <div className={`rounded-lg border p-2 ${miniTone(tone)}`}>
      <p className="text-[11px] font-medium">{title}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {items.map((item) => (
          <span key={item} className="rounded border border-current/20 bg-bg/25 px-2 py-0.5 text-[11px]">{item}</span>
        ))}
      </div>
    </div>
  );
}

function TagGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-line/60 bg-bg/35 p-2">
      <p className="text-xs font-medium text-slate-200">{title}</p>
      {items.length ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {items.slice(0, 5).map((item) => (
            <span key={item} className="rounded border border-line/60 bg-bg/50 px-2 py-0.5 text-[11px] text-muted">{item}</span>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-muted">暂无</p>
      )}
    </div>
  );
}

function ReasonList({ title, items, tone, emptyText }: { title: string; items: string[]; tone: Tone; emptyText: string }) {
  return (
    <div className={`rounded-lg border p-2 ${miniTone(tone)}`}>
      <p className="text-xs font-medium">{title}</p>
      {items.length ? (
        <div className="mt-2 grid gap-1">
          {items.slice(0, 6).map((item) => (
            <p key={item} className="rounded border border-current/15 bg-bg/25 p-2 text-[11px] leading-4">{item}</p>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[11px] opacity-80">{emptyText}</p>
      )}
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

function actionabilityLevelLabel(level: DataSourceHealthSnapshot["actionability"]["level"]) {
  if (level === "usable") return "可用";
  if (level === "degraded_reference") return "降级参考";
  return "不可行动";
}

function freshnessLabel(status: DataSourceHealthSnapshot["providers"][number]["freshnessStatus"]) {
  if (status === "current") return "新鲜";
  if (status === "stale") return "过期";
  return "未知";
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

function layerLabel(layer: ProviderAuditSnapshot["dependencies"][number]["layer"]) {
  const labels: Record<ProviderAuditSnapshot["dependencies"][number]["layer"], string> = {
    analysis: "主线分析",
    selection: "策略选股",
    tracking: "个股追踪",
    serenity: "产业链研究",
    premarket: "盘前侦察",
    api: "展示接口",
    script: "脚本任务",
    other: "其他"
  };
  return labels[layer] ?? layer;
}

function providerLabel(provider: ProviderAuditSnapshot["dependencies"][number]["providers"][number]) {
  const labels: Record<string, string> = {
    tencent_zixuangu: "腾讯自选股",
    eastmoney_public: "东方财富",
    tushare: "Tushare"
  };
  return labels[provider] ?? provider;
}

function priorityTone(priority: ProviderAuditSnapshot["dependencies"][number]["priority"]) {
  if (priority === "p0") return "border-warn/40 bg-warn/10 text-warn";
  if (priority === "p1") return "border-info/35 bg-info/10 text-info";
  return "border-line bg-bg/55 text-muted";
}

function migrationStatusLabel(status: ProviderAuditSnapshot["dependencies"][number]["status"]) {
  if (status === "gateway_ready") return "已建网关";
  if (status === "in_progress") return "进行中";
  return "待拆";
}

function migrationStatusTone(status: ProviderAuditSnapshot["dependencies"][number]["status"]) {
  if (status === "gateway_ready") return "border-up/35 bg-up/10 text-up";
  if (status === "in_progress") return "border-cyan-300/35 bg-cyan-300/10 text-cyan-100";
  return "border-warn/40 bg-warn/10 text-warn";
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

function actionabilityTone(level: DataSourceHealthSnapshot["actionability"]["level"]) {
  if (level === "usable") return { panel: "border-up/30 bg-up/10", icon: "border-up/40 text-up", badge: "border-up/40 bg-up/10 text-up" };
  if (level === "not_actionable") return { panel: "border-warn/35 bg-warn/10", icon: "border-warn/45 text-warn", badge: "border-warn/45 bg-warn/10 text-warn" };
  return { panel: "border-info/30 bg-info/10", icon: "border-info/40 text-info", badge: "border-info/40 bg-info/10 text-info" };
}

function impactTone(status: "ok" | "degraded" | "risk") {
  if (status === "ok") return { panel: "border-up/30 bg-up/10", badge: "border-up/40 bg-up/10 text-up" };
  if (status === "risk") return { panel: "border-warn/35 bg-warn/10", badge: "border-warn/45 bg-warn/10 text-warn" };
  return { panel: "border-info/30 bg-info/10", badge: "border-info/40 bg-info/10 text-info" };
}

function miniTone(tone: Tone) {
  if (tone === "up") return "border-up/25 bg-up/10 text-up";
  if (tone === "warn") return "border-warn/30 bg-warn/10 text-warn";
  if (tone === "info") return "border-info/25 bg-info/10 text-info";
  return "border-line bg-bg/55 text-muted";
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

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatAge(minutes?: number) {
  if (minutes === undefined) return "未知";
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 48) return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
  const days = Math.floor(hours / 24);
  const dayRest = hours % 24;
  return dayRest ? `${days} 天 ${dayRest} 小时` : `${days} 天`;
}
