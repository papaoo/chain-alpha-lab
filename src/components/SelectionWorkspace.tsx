"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Layers3, Loader2, Play, SlidersHorizontal } from "lucide-react";
import { StrategyParameterGrid } from "@/components/SelectionParameterControls";
import { EmptyStrategyRun, SelectionRunHistory, SelectionRunPanel } from "@/components/SelectionRunPanels";
import { CollapsibleSection, StrategyRuleExplainer } from "@/components/SelectionStrategyRuleCards";
import { buildSelectionSummaryInsight } from "@/lib/selection/insights";
import { listSelectionStrategies } from "@/lib/selection/strategies";
import type { SelectionRunRecord, SelectionRunSummary, SelectionStrategyDefinition, SelectionStrategyId } from "@/lib/selection/types";

type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };
const INITIAL_STRATEGIES = listSelectionStrategies();

const riskLabels: Record<SelectionStrategyDefinition["riskLevel"], string> = {
  low: "低风险",
  medium: "中风险",
  medium_high: "中高风险"
};

const cycleLabels: Record<SelectionStrategyDefinition["cycle"], string> = {
  short: "短期",
  mid: "中期",
  long: "中长期"
};

export function SelectionWorkspace() {
  const [strategies, setStrategies] = useState<SelectionStrategyDefinition[]>(INITIAL_STRATEGIES);
  const [activeId, setActiveId] = useState<SelectionStrategyId>(
    INITIAL_STRATEGIES.find((item) => item.enabledInMvp)?.id ?? INITIAL_STRATEGIES[0]?.id ?? "main_force_accumulation"
  );
  const [runs, setRuns] = useState<SelectionRunSummary[]>([]);
  const [activeRunDetail, setActiveRunDetail] = useState<SelectionRunRecord | null>(null);
  const [activeRunDetailLoading, setActiveRunDetailLoading] = useState(false);
  const [runsLoading, setRunsLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [runsError, setRunsError] = useState("");
  const [runMessage, setRunMessage] = useState("");
  const [parameterValues, setParameterValues] = useState<Record<string, unknown>>({});

  useEffect(() => {
    let mounted = true;
    async function load() {
      setRunsLoading(true);
      setError("");
      setRunsError("");
      void fetchSelectionRuns()
        .then((data) => {
          if (mounted) setRuns(data);
        })
        .catch((err) => {
          if (mounted) setRunsError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (mounted) setRunsLoading(false);
        });

      try {
        const strategyData = await fetchSelectionStrategies();
        if (!mounted) return;
        setStrategies(strategyData);
        setActiveId(strategyData.find((item) => item.enabledInMvp)?.id ?? strategyData[0]?.id ?? "main_force_accumulation");
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : String(err));
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const active = useMemo(() => strategies.find((item) => item.id === activeId) ?? strategies[0], [activeId, strategies]);
  const activeRun = active ? runs.find((run) => run.strategyId === active.id) : undefined;
  const strategyMetrics = useMemo(() => buildStrategyMetrics(strategies, runs), [strategies, runs]);

  useEffect(() => {
    let mounted = true;
    setActiveRunDetail(null);
    if (!activeRun?.id) return;
    setActiveRunDetailLoading(true);
    fetchSelectionRunDetail(activeRun.id)
      .then((run) => {
        if (mounted) setActiveRunDetail(run);
      })
      .catch(() => {
        if (mounted) setActiveRunDetail(null);
      })
      .finally(() => {
        if (mounted) setActiveRunDetailLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [activeRun?.id]);

  useEffect(() => {
    if (!active) return;
    setParameterValues(Object.fromEntries(active.parameters.map((param) => [param.key, param.defaultValue])));
  }, [active]);

  async function runSelection(mode: "rule" | "agent") {
    if (!active) return;
    setRunning(true);
    setRunMessage(mode === "agent" ? "正在运行规则筛选，并调用 Agent 团队复核..." : "正在运行规则选股...");
    try {
      const response = await fetch("/api/selection/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ strategyId: active.id, mode, parameters: parameterValues })
      });
      const json = (await response.json()) as ApiResponse<SelectionRunRecord>;
      if (!response.ok || !json.success || !json.data) throw new Error(json.error?.message ?? "策略选股运行失败");
      const listResponse = await fetch(`/api/selection/runs?limit=30&_t=${Date.now()}`, { cache: "no-store" });
      const listJson = (await listResponse.json()) as ApiResponse<SelectionRunSummary[]>;
      setRuns(listJson.data ?? [runToSummary(json.data)]);
      setActiveRunDetail(json.data);
      setRunMessage(`${mode === "agent" ? "Agent复核" : "规则选股"}完成：精选 ${json.data.pickCount} 只，未入选 ${json.data.rejected.length} 只。`);
    } catch (err) {
      setRunMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="grid gap-4">
      <div className="rounded-lg border border-info/20 bg-[linear-gradient(135deg,rgba(56,189,248,0.12),rgba(15,23,42,0.76)_48%,rgba(34,197,94,0.08))] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs tracking-[0.18em] text-info">MULTI STRATEGY SELECTION</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight">策略选股工作台</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
              这里会承接主线驾驶舱和未来个股追踪模块：规则先生成候选池，模型只在证据链内审查，最终精选可以一键加入追踪或模拟持仓。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <MiniStat label="策略数量" value={`${strategies.length}`} />
            <MiniStat label="MVP 策略" value={`${strategies.filter((item) => item.enabledInMvp).length}`} />
            <MiniStat label="输出边界" value="候选池内" />
          </div>
        </div>
      </div>

      {error ? (
        <section className="rounded-lg border border-warn/25 bg-warn/10 px-4 py-3 text-sm text-warn">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle size={16} />
            策略定义接口刷新失败，已使用前端内置策略定义继续展示。
          </div>
          <p className="mt-1 text-xs leading-5">{error}</p>
        </section>
      ) : null}

      {strategyMetrics.length ? (
        <section className="rounded-lg border border-line bg-panel/84 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs tracking-[0.16em] text-info">RUN QUALITY OVERVIEW</p>
              <h3 className="mt-2 text-lg font-semibold">六策略运行表现</h3>
              <p className="mt-1 text-xs text-muted">基于最近运行记录统计，不调用模型，用来观察策略活跃度、精选强度和数据警告。</p>
            </div>
            <Link className="text-xs text-info hover:text-cyan-200" href="/selection/runs">
              查看全部运行记录
            </Link>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {strategyMetrics.map((metric) => (
              <article
                key={metric.strategyId}
                className={`rounded-lg border p-3 text-left transition ${
                  activeId === metric.strategyId
                    ? "border-info/55 bg-info/10"
                    : "border-line bg-bg/50 hover:border-info/30 hover:bg-bg/70"
                }`}
              >
                <button className="block w-full text-left" type="button" onClick={() => setActiveId(metric.strategyId)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-100">{metric.name}</p>
                      <p className="mt-1 text-xs text-muted">{metric.latestAt ? formatDateTime(metric.latestAt) : "暂无运行"}</p>
                    </div>
                    <span className={`rounded border px-2 py-1 text-xs ${metric.warningCount ? "border-warn/30 bg-warn/10 text-warn" : "border-up/30 bg-up/10 text-up"}`}>
                      {metric.warningCount ? `${metric.warningCount} 警告` : "稳定"}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                    <MiniStat label="运行" value={`${metric.runCount}`} />
                    <MiniStat label="精选" value={`${metric.latestPickCount}`} />
                    <MiniStat label="均分" value={metric.avgPickScore ? metric.avgPickScore.toFixed(0) : "--"} />
                    <MiniStat label="最高" value={metric.bestScore ? metric.bestScore.toFixed(0) : "--"} />
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-info" style={{ width: `${Math.max(4, Math.min(100, metric.avgPickScore || metric.latestPickCount * 12))}%` }} />
                  </div>
                </button>
                {metric.warnings.length ? (
                  <details className="mt-3 rounded-lg border border-warn/20 bg-warn/10 px-2 py-1.5">
                    <summary className="cursor-pointer text-xs text-warn">查看数据警告</summary>
                    <div className="mt-2 grid gap-1.5">
                      {metric.warnings.slice(0, 3).map((warning, index) => (
                        <p key={`${warning}-${index}`} className="text-[11px] leading-4 text-warn/90">{warning}</p>
                      ))}
                    </div>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[440px_1fr]">
        <div className="rounded-lg border border-line bg-panel/84 p-4">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-bg/70 text-info">
              <Layers3 size={18} />
            </span>
            <div>
              <h3 className="font-semibold">选择策略</h3>
              <p className="text-xs text-muted">切换后同步默认周期、参数和评分因子</p>
            </div>
          </div>
          <div className="grid gap-2">
            {strategies.map((strategy) => (
              <button
                key={strategy.id}
                type="button"
                className={`rounded-lg border p-3 text-left transition ${
                  activeId === strategy.id
                    ? "border-info/55 bg-info/10 text-slate-100"
                    : "border-line bg-bg/45 text-muted hover:border-info/30 hover:bg-bg/70 hover:text-slate-100"
                }`}
                onClick={() => setActiveId(strategy.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{strategy.order.toString().padStart(2, "0")} · {strategy.name}</p>
                    <p className="mt-1 text-xs leading-5">{strategy.subtitle}</p>
                  </div>
                  <span className="rounded border border-line px-1.5 py-0.5 text-[10px]">{strategy.enabledInMvp ? "MVP" : "规划"}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {active ? (
          <div className="grid gap-4">
            <div className="rounded-lg border border-line bg-panel/84 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded border border-info/35 bg-info/10 px-2 py-1 text-xs text-info">{riskLabels[active.riskLevel]}</span>
                    <span className="rounded border border-line bg-bg/60 px-2 py-1 text-xs text-muted">{cycleLabels[active.cycle]}</span>
                    <span className="rounded border border-line bg-bg/60 px-2 py-1 text-xs text-muted">默认 {active.defaultTimeRange}</span>
                  </div>
                  <h3 className="mt-3 text-2xl font-semibold">{active.name}</h3>
                  <p className="mt-3 max-w-4xl text-sm leading-6 text-muted">{active.description}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <MiniStat label="精选上限" value={`${active.recommendedPickCount} 只`} />
                  <MiniStat label="候选池" value={`${active.candidatePoolLimit} 只`} />
                  <MiniStat label="最近精选" value={activeRun ? `${activeRun.pickCount} 只` : "未运行"} />
                  <MiniStat label="规则因子" value={`${active.scoreFactors.length} 项`} />
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-3 rounded-lg border border-line bg-bg/50 p-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium">运行方式</p>
                  <p className="mt-1 text-xs text-muted">规则模式只执行硬过滤和评分；Agent复核会先跑规则，再调用五位分析师在候选池内做结构化审查。</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="flex w-fit items-center gap-2 rounded-lg border border-info/40 bg-info/10 px-4 py-2 text-sm text-info disabled:opacity-60"
                    onClick={() => runSelection("rule")}
                    disabled={running || !active.enabledInMvp}
                  >
                    {running ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
                    运行规则选股
                  </button>
                  <button
                    type="button"
                    className="flex w-fit items-center gap-2 rounded-lg border border-violet-300/40 bg-violet-300/10 px-4 py-2 text-sm text-violet-100 disabled:opacity-60"
                    onClick={() => runSelection("agent")}
                    disabled={running || !active.enabledInMvp}
                  >
                    {running ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
                    运行 Agent 复核
                  </button>
                </div>
              </div>
              {runMessage ? <p className="mt-3 rounded-lg border border-info/25 bg-info/10 px-3 py-2 text-sm text-info">{runMessage}</p> : null}
            </div>

            {activeRunDetail ? (
              <SelectionRunPanel run={activeRunDetail} />
            ) : activeRunDetailLoading ? (
              <section className="rounded-lg border border-line bg-panel/70 p-4">
                <div className="flex items-center gap-3 text-sm text-muted">
                  <Loader2 className="animate-spin text-info" size={16} />
                  正在读取当前策略最近一次完整运行详情。
                </div>
              </section>
            ) : (
              <EmptyStrategyRun strategyName={active.name} />
            )}
            {runsLoading ? (
              <section className="rounded-lg border border-line bg-panel/70 p-4">
                <div className="flex items-center gap-3 text-sm text-muted">
                  <Loader2 className="animate-spin text-info" size={16} />
                  正在补全历史运行记录，策略定义和参数已可先查看。
                </div>
              </section>
            ) : null}
            {runsError ? (
              <section className="rounded-lg border border-warn/25 bg-warn/10 px-4 py-3 text-sm text-warn">
                历史运行记录暂时不可用：{runsError}
              </section>
            ) : null}
            {runs.length > 1 ? <SelectionRunHistory runs={runs.slice(0, 5)} /> : null}

            <StrategyRuleExplainer active={active} strategies={strategies} />

            <CollapsibleSection
              icon={SlidersHorizontal}
              title="运行参数"
              meta={`${active.parameters.length} 个参数，随运行记录留痕`}
            >
              <StrategyParameterGrid
                parameters={active.parameters}
                values={parameterValues}
                onChange={(key, value) => setParameterValues((prev) => ({ ...prev, [key]: value }))}
              />
            </CollapsibleSection>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg/60 px-3 py-2">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

async function fetchSelectionStrategies() {
  const response = await fetch(`/api/selection/strategies?_t=${Date.now()}`, { cache: "no-store" });
  const json = (await response.json()) as ApiResponse<SelectionStrategyDefinition[]>;
  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error?.message ?? "策略定义加载失败");
  }
  return json.data;
}

async function fetchSelectionRuns() {
  const response = await fetch(`/api/selection/runs?limit=30&_t=${Date.now()}`, { cache: "no-store" });
  const json = (await response.json()) as ApiResponse<SelectionRunSummary[]>;
  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error?.message ?? "历史运行记录加载失败");
  }
  return json.data;
}

async function fetchSelectionRunDetail(id: string) {
  const response = await fetch(`/api/selection/runs/${id}?_t=${Date.now()}`, { cache: "no-store" });
  const json = (await response.json()) as ApiResponse<SelectionRunRecord>;
  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error?.message ?? "运行详情加载失败");
  }
  return json.data;
}

function buildStrategyMetrics(strategies: SelectionStrategyDefinition[], runs: SelectionRunSummary[]) {
  return strategies.map((strategy) => {
    const strategyRuns = runs.filter((run) => run.strategyId === strategy.id);
    const latest = strategyRuns[0];
    const insight = latest ? buildSelectionSummaryInsight(latest) : null;
    return {
      strategyId: strategy.id,
      name: strategy.name,
      runCount: strategyRuns.length,
      latestAt: latest?.startedAt ?? "",
      latestPickCount: latest?.pickCount ?? 0,
      warningCount: latest?.warningCount ?? 0,
      warnings: latest?.warnings ?? [],
      qualityLabel: insight?.qualityLabel ?? "暂无运行",
      qualityTone: insight?.qualityTone ?? "slate",
      selectionRate: insight?.selectionRate ?? 0,
      avgPickScore: insight?.avgPreviewScore ?? 0,
      bestScore: latest?.topPickPreview.length ? Math.max(...latest.topPickPreview.map((pick) => pick.score)) : 0
    };
  });
}

function runToSummary(run: SelectionRunRecord): SelectionRunSummary {
  return {
    id: run.id,
    strategyId: run.strategyId,
    strategyName: run.strategyName,
    mode: run.mode,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    ruleVersion: run.ruleVersion,
    ruleVersionLabel: run.ruleVersionLabel,
    sourceReportId: run.sourceReportId,
    sourceReportCreatedAt: run.sourceReportCreatedAt,
    candidateCount: run.candidateCount,
    pickCount: run.pickCount,
    rejectedCount: run.rejected.length,
    warningCount: run.warnings.length,
    warnings: run.warnings,
    topPickPreview: run.picks.slice(0, 3).map((pick) => ({
      code: pick.code,
      name: pick.name,
      score: pick.score,
      tier: pick.tier,
      action: pick.action
    })),
    errorMessage: run.errorMessage
  };
}
