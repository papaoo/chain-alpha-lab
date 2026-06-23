"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, Layers3, Loader2, Play, SlidersHorizontal } from "lucide-react";
import { SelectionEvaluationPanel } from "@/components/SelectionEvaluationPanel";
import { StrategyParameterGrid } from "@/components/SelectionParameterControls";
import { EmptyStrategyRun, SelectionRunHistory, SelectionRunPanel } from "@/components/SelectionRunPanels";
import { CollapsibleSection, StrategyRuleExplainer } from "@/components/SelectionStrategyRuleCards";
import { fetchApiJson } from "@/lib/client/api";
import { cleanDisplayList, cleanDisplayText } from "@/lib/display/text";
import { buildSelectionSummaryInsight } from "@/lib/selection/insights";
import { listSelectionStrategies } from "@/lib/selection/strategies";
import type { SelectionRunRecord, SelectionRunSummary, SelectionStrategyDefinition, SelectionStrategyId } from "@/lib/selection/types";

type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };

const INITIAL_STRATEGIES = listSelectionStrategies();
const SELECTION_RUN_POLL_MS = 3000;
const SELECTION_RUN_MAX_POLLS = 80;

const riskLabels: Record<SelectionStrategyDefinition["riskLevel"], string> = {
  low: "低风险",
  medium: "中风险",
  medium_high: "中高风险"
};

const cycleLabels: Record<SelectionStrategyDefinition["cycle"], string> = {
  short: "短周期",
  mid: "中周期",
  long: "长周期"
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
  const [runningRun, setRunningRun] = useState<SelectionRunRecord | null>(null);
  const [pollAttempt, setPollAttempt] = useState(0);
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
          if (mounted) setRunsError(errorText(err));
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
        if (mounted) setError(errorText(err));
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const active = useMemo(() => strategies.find((item) => item.id === activeId) ?? strategies[0], [activeId, strategies]);
  const activeRun = active ? runs.find((run) => run.strategyId === active.id) : undefined;
  const strategyMetrics = useMemo(() => buildStrategyMetrics(strategies, runs), [strategies, runs]);
  const agentGate = useMemo(() => buildAgentGateStatus(activeRunDetail, activeRun), [activeRunDetail, activeRun]);

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
    setRunningRun(null);
    setPollAttempt(0);
    setRunMessage(mode === "agent" ? "已提交 Agent 复核：先运行规则筛选，再根据候选结果与数据新鲜度决定是否调用模型。" : "已提交规则选股：后端正在刷新数据、过滤候选并评分。");
    try {
      const json = await fetchApiJson<SelectionRunRecord>("/api/selection/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ strategyId: active.id, mode, parameters: parameterValues })
      });
      if (!json.data) throw new Error(cleanDisplayText(json.error?.message) ?? "选股任务启动失败。");
      const startedRun = json.data;
      setRunningRun(startedRun.status === "running" ? startedRun : null);
      setRuns((current) => [runToSummary(startedRun), ...current.filter((run) => run.id !== startedRun.id)].slice(0, 30));
      setActiveRunDetail(startedRun);
      const finalRun = startedRun.status === "running" ? await pollSelectionRun(startedRun.id, setPollAttempt) : startedRun;
      setRunningRun(null);
      setActiveRunDetail(finalRun);
      const listJson = await fetchApiJson<SelectionRunSummary[]>(`/api/selection/runs?limit=30&_t=${Date.now()}`, { cache: "no-store" });
      setRuns(listJson.data ?? [runToSummary(finalRun)]);
      if (finalRun.status === "failed") {
        setRunMessage(`运行失败：${cleanDisplayText(finalRun.errorMessage) ?? "未知错误"}`);
      } else {
        setRunMessage(`${mode === "agent" ? "Agent 复核" : "规则选股"}完成：入选 ${finalRun.pickCount} 只，未入选 ${finalRun.rejected.length} 只。`);
      }
    } catch (err) {
      setRunMessage(errorText(err));
    } finally {
      setRunning(false);
      setRunningRun(null);
    }
  }

  return (
    <section className="grid gap-4">
      <header className="rounded-lg border border-info/20 bg-[linear-gradient(135deg,rgba(56,189,248,0.12),rgba(15,23,42,0.76)_48%,rgba(34,197,94,0.08))] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs tracking-[0.18em] text-info">多策略选股</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight">策略选股工作台</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
              基于刷新后的证据池运行六类选股策略。规则模式不调用大模型；Agent 模式只在规则候选、数据新鲜度和调用预算通过后进行复核。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <MiniStat label="策略数" value={`${strategies.length}`} />
            <MiniStat label="已启用" value={`${strategies.filter((item) => item.enabledInMvp).length}`} />
            <MiniStat label="输出" value="证据池" />
          </div>
        </div>
      </header>

      {error ? <WarningBox title="策略定义刷新失败" text={error} /> : null}

      {strategyMetrics.length ? <StrategyMetricsPanel metrics={strategyMetrics} activeId={activeId} onSelect={setActiveId} /> : null}

      <SelectionEvaluationPanel />

      <div className="grid gap-4 xl:grid-cols-[440px_1fr]">
        <StrategyChooser strategies={strategies} activeId={activeId} onSelect={setActiveId} />

        {active ? (
          <div className="grid gap-4">
            <section className="rounded-lg border border-line bg-panel/84 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded border border-info/35 bg-info/10 px-2 py-1 text-xs text-info">{riskLabels[active.riskLevel]}</span>
                    <span className="rounded border border-line bg-bg/60 px-2 py-1 text-xs text-muted">{cycleLabels[active.cycle]}</span>
                    <span className="rounded border border-line bg-bg/60 px-2 py-1 text-xs text-muted">默认 {active.defaultTimeRange}</span>
                  </div>
                  <h3 className="mt-3 text-2xl font-semibold">{safeText(active.name)}</h3>
                  <p className="mt-3 max-w-4xl text-sm leading-6 text-muted">{safeText(active.description)}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <MiniStat label="入选上限" value={`${active.recommendedPickCount}`} />
                  <MiniStat label="候选上限" value={`${active.candidatePoolLimit}`} />
                  <MiniStat label="最近入选" value={activeRun ? `${activeRun.pickCount}` : "--"} />
                  <MiniStat label="因子数" value={`${active.scoreFactors.length}`} />
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 rounded-lg border border-line bg-bg/50 p-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium">运行模式</p>
                  <p className="mt-1 text-xs text-muted">规则会刷新数据、过滤候选并评分；Agent 只在有规则候选且数据时效通过时调用模型复核。</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <RunButton disabled={running || !active.enabledInMvp} running={running} label="运行规则" tone="info" onClick={() => runSelection("rule")} />
                  <RunButton disabled={running || !active.enabledInMvp} running={running} label="运行 Agent 复核" tone="violet" onClick={() => runSelection("agent")} />
                </div>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <MiniStat label="规则成本" value="不调用模型" />
                <MiniStat label="Agent 门槛" value="有候选才调用" />
                <MiniStat label="修复策略" value="一次精简修复" />
              </div>
              <AgentGatePanel gate={agentGate} />
              {runMessage ? <p className="mt-3 rounded-lg border border-info/25 bg-info/10 px-3 py-2 text-sm text-info">{runMessage}</p> : null}
              {runningRun ? <RunningRunNotice run={runningRun} pollAttempt={pollAttempt} maxPolls={SELECTION_RUN_MAX_POLLS} /> : null}
            </section>

            {activeRunDetail ? (
              <SelectionRunPanel run={activeRunDetail} />
            ) : activeRunDetailLoading ? (
              <LoadingPanel text="正在读取该策略最近一次完整运行详情。" />
            ) : (
              <EmptyStrategyRun strategyName={safeText(active.name)} />
            )}

            {runsLoading ? <LoadingPanel text="正在读取选股运行历史，策略定义和参数仍可正常查看。" /> : null}
            {runsError ? <WarningBox title="运行历史暂不可用" text={runsError} /> : null}
            {runs.length > 1 ? <SelectionRunHistory runs={runs.slice(0, 5)} /> : null}

            <StrategyRuleExplainer active={active} strategies={strategies} />

            <CollapsibleSection
              icon={SlidersHorizontal}
              title="运行参数"
              meta={`${active.parameters.length} 个参数会写入每次运行记录`}
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

function StrategyMetricsPanel({
  metrics,
  activeId,
  onSelect
}: {
  metrics: ReturnType<typeof buildStrategyMetrics>;
  activeId: SelectionStrategyId;
  onSelect: (id: SelectionStrategyId) => void;
}) {
  return (
    <section className="rounded-lg border border-line bg-panel/84 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs tracking-[0.16em] text-info">运行质量概览</p>
          <h3 className="mt-2 text-lg font-semibold">六策略运行状态</h3>
          <p className="mt-1 text-xs text-muted">基于最近运行记录统计；该面板只读取结果，不调用模型。</p>
        </div>
        <Link className="text-xs text-info hover:text-cyan-200" href="/selection/runs">查看全部运行</Link>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <article
            key={metric.strategyId}
            className={`rounded-lg border p-3 text-left transition ${activeId === metric.strategyId ? "border-info/55 bg-info/10" : "border-line bg-bg/50 hover:border-info/30 hover:bg-bg/70"}`}
          >
            <button className="block w-full text-left" type="button" onClick={() => onSelect(metric.strategyId)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-100">{metric.name}</p>
                  <p className="mt-1 text-xs text-muted">{metric.latestAt ? formatDateTime(metric.latestAt) : "尚未运行"}</p>
                </div>
                <span className={`rounded border px-2 py-1 text-xs ${metric.warningCount ? "border-warn/30 bg-warn/10 text-warn" : "border-up/30 bg-up/10 text-up"}`}>
                  {metric.warningCount ? `${metric.warningCount} 条警告` : "稳定"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                <MiniStat label="运行" value={`${metric.runCount}`} />
                <MiniStat label="入选" value={`${metric.latestPickCount}`} />
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
  );
}

function StrategyChooser({
  strategies,
  activeId,
  onSelect
}: {
  strategies: SelectionStrategyDefinition[];
  activeId: SelectionStrategyId;
  onSelect: (id: SelectionStrategyId) => void;
}) {
  return (
    <aside className="rounded-lg border border-line bg-panel/84 p-4">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-bg/70 text-info">
          <Layers3 size={18} />
        </span>
        <div>
          <h3 className="font-semibold">选择策略</h3>
          <p className="text-xs text-muted">切换策略会同步默认周期、因子和参数。</p>
        </div>
      </div>
      <div className="grid gap-2">
        {strategies.map((strategy) => (
          <button
            key={strategy.id}
            type="button"
            className={`rounded-lg border p-3 text-left transition ${activeId === strategy.id ? "border-info/55 bg-info/10 text-slate-100" : "border-line bg-bg/45 text-muted hover:border-info/30 hover:bg-bg/70 hover:text-slate-100"}`}
            onClick={() => onSelect(strategy.id)}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{strategy.order.toString().padStart(2, "0")} / {safeText(strategy.name)}</p>
                <p className="mt-1 text-xs leading-5">{safeText(strategy.subtitle)}</p>
              </div>
              <span className="rounded border border-line px-1.5 py-0.5 text-[10px]">{strategy.enabledInMvp ? "已启用" : "规划中"}</span>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}

function RunButton({
  label,
  tone,
  running,
  disabled,
  onClick
}: {
  label: string;
  tone: "info" | "violet";
  running: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const cls = tone === "violet"
    ? "border-violet-300/40 bg-violet-300/10 text-violet-100"
    : "border-info/40 bg-info/10 text-info";
  return (
    <button type="button" className={`flex w-fit items-center gap-2 rounded-lg border px-4 py-2 text-sm disabled:opacity-60 ${cls}`} onClick={onClick} disabled={disabled}>
      {running ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
      {label}
    </button>
  );
}

function RunningRunNotice({
  run,
  pollAttempt,
  maxPolls
}: {
  run: SelectionRunRecord;
  pollAttempt: number;
  maxPolls: number;
}) {
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - new Date(run.startedAt).getTime()) / 1000));
  const progress = Math.min(100, Math.max(4, (pollAttempt / maxPolls) * 100));
  return (
    <section className="mt-3 overflow-hidden rounded-lg border border-cyan-300/25 bg-cyan-300/[0.07]">
      <div className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
            <Loader2 className="animate-spin" size={17} />
          </span>
          <div>
            <p className="text-sm font-medium text-cyan-100">选股任务仍在处理中</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              {safeText(run.strategyName)} / {run.mode === "agent" ? "Agent 复核" : "规则模式"} 已记录，系统正在轮询结果。你可以离开页面，稍后在运行历史中查看。
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs md:min-w-[300px]">
          <MiniStat label="耗时" value={`${elapsedSeconds}s`} />
          <MiniStat label="轮询" value={`${pollAttempt}/${maxPolls}`} />
          <MiniStat label="状态" value="运行中" />
        </div>
      </div>
      <div className="h-1.5 bg-slate-900/70">
        <div className="h-full rounded-r-full bg-cyan-300 transition-all" style={{ width: `${progress}%` }} />
      </div>
      <div className="flex items-center gap-2 border-t border-cyan-300/10 px-3 py-2 text-[11px] leading-4 text-slate-500">
        <Clock3 size={13} className="text-cyan-200" />
        长时间运行通常来自全 A 刷新、财务补数或 Agent 复核。过期的运行中记录会被自动标记，避免形成假的进行中历史。
      </div>
    </section>
  );
}

type AgentGateStatus = {
  tone: "info" | "ok" | "warn" | "risk" | "muted";
  title: string;
  description: string;
  stats: Array<{ label: string; value: string }>;
};

function AgentGatePanel({ gate }: { gate: AgentGateStatus }) {
  return (
    <section className={`mt-3 rounded-lg border px-3 py-3 ${agentGateToneClass(gate.tone)}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-medium">{gate.title}</p>
          <p className="mt-1 text-xs leading-5 opacity-85">{gate.description}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4 lg:min-w-[420px]">
          {gate.stats.map((stat) => (
            <MiniStat key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </div>
      </div>
    </section>
  );
}

function LoadingPanel({ text }: { text: string }) {
  return (
    <section className="rounded-lg border border-line bg-panel/70 p-4">
      <div className="flex items-center gap-3 text-sm text-muted">
        <Loader2 className="animate-spin text-info" size={16} />
        {text}
      </div>
    </section>
  );
}

function WarningBox({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-lg border border-warn/25 bg-warn/10 px-4 py-3 text-sm text-warn">
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle size={16} />
        {title}
      </div>
      <p className="mt-1 text-xs leading-5">{text}</p>
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

async function fetchSelectionStrategies() {
  const json = await fetchApiJson<SelectionStrategyDefinition[]>(`/api/selection/strategies?_t=${Date.now()}`, { cache: "no-store" });
  if (!json.data) throw new Error(cleanDisplayText(json.error?.message) ?? "策略定义读取失败。");
  return json.data;
}

async function fetchSelectionRuns() {
  const json = await fetchApiJson<SelectionRunSummary[]>(`/api/selection/runs?limit=30&_t=${Date.now()}`, { cache: "no-store" });
  if (!json.data) throw new Error(cleanDisplayText(json.error?.message) ?? "选股运行历史读取失败。");
  return json.data;
}

async function fetchSelectionRunDetail(id: string) {
  const json = await fetchApiJson<SelectionRunRecord>(`/api/selection/runs/${id}?_t=${Date.now()}`, { cache: "no-store" });
  if (!json.data) throw new Error(cleanDisplayText(json.error?.message) ?? "选股运行详情读取失败。");
  return json.data;
}

async function pollSelectionRun(id: string, onAttempt?: (attempt: number) => void) {
  for (let attempt = 0; attempt < SELECTION_RUN_MAX_POLLS; attempt++) {
    await delay(SELECTION_RUN_POLL_MS);
    onAttempt?.(attempt + 1);
    const run = await fetchSelectionRunDetail(id);
    if (run.status !== "running") return run;
  }
  throw new Error("选股任务仍在后台处理中，请稍后到运行历史查看。");
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function buildStrategyMetrics(strategies: SelectionStrategyDefinition[], runs: SelectionRunSummary[]) {
  return strategies.map((strategy) => {
    const strategyRuns = runs.filter((run) => run.strategyId === strategy.id);
    const latest = strategyRuns[0];
    const insight = latest ? buildSelectionSummaryInsight(latest) : null;
    const warnings = cleanDisplayList(latest?.warnings ?? []);
    return {
      strategyId: strategy.id,
      name: safeText(strategy.name),
      runCount: strategyRuns.length,
      latestAt: latest?.startedAt ?? "",
      latestPickCount: latest?.pickCount ?? 0,
      warningCount: latest?.warningCount ?? 0,
      warnings,
      qualityLabel: insight?.qualityLabel ?? "尚未运行",
      qualityTone: insight?.qualityTone ?? "slate",
      selectionRate: insight?.selectionRate ?? 0,
      avgPickScore: insight?.avgPreviewScore ?? 0,
      bestScore: latest?.topPickPreview.length ? Math.max(...latest.topPickPreview.map((pick) => pick.score)) : 0
    };
  });
}

function buildAgentGateStatus(run?: SelectionRunRecord | null, summary?: SelectionRunSummary): AgentGateStatus {
  if (!run && !summary) {
    return {
      tone: "muted",
      title: "Agent 状态：等待首次运行",
      description: "先运行一次规则选股建立候选池。Agent 复核不会凭空选股，只会在规则候选和数据时效通过后做结构化复核。",
      stats: [
        { label: "最近模式", value: "--" },
        { label: "规则候选", value: "--" },
        { label: "数据基准", value: "--" },
        { label: "Token", value: "0" }
      ]
    };
  }

  const mode = run?.mode ?? summary?.mode ?? "rule";
  const pickCount = run?.pickCount ?? summary?.pickCount ?? 0;
  const freshnessStatus = run?.freshnessStatus ?? summary?.freshnessStatus ?? "unknown";
  const llmStatus = run?.llmStatus;
  const tokenValue = run?.llmMetrics?.totalTokens ?? run?.llmMetrics?.estimatedInputTokens ?? 0;
  const skipReason = cleanDisplayText(run?.llmMetrics?.skipReason ?? run?.llmErrors?.[0]);
  const stats = [
    { label: "最近模式", value: mode === "agent" ? "Agent" : "规则" },
    { label: "规则候选", value: `${pickCount}` },
    { label: "数据基准", value: freshnessStatusLabel(freshnessStatus) },
    { label: "Token", value: tokenValue ? `${Math.round(tokenValue)}` : "0" }
  ];

  if (mode !== "agent") {
    return {
      tone: "info",
      title: "Agent 状态：最近一次是规则模式",
      description: "规则模式只做数据刷新、硬过滤和评分，不调用 DeepSeek。需要模型复核时请点击“运行 Agent 复核”。",
      stats
    };
  }

  if (llmStatus === "success") {
    return {
      tone: "ok",
      title: "Agent 状态：已完成模型复核",
      description: "DeepSeek 已在规则候选池内完成复核；它不会新增股票，也不会覆盖硬风控，详情见最近运行里的大模型复核卡片。",
      stats
    };
  }

  if (llmStatus === "disabled") {
    return {
      tone: "warn",
      title: "Agent 状态：模型配置未启用",
      description: skipReason ?? "模型开关或 API Key 不可用，本次只保留规则结果，没有产生额外 token 消耗。",
      stats
    };
  }

  if (llmStatus === "skipped") {
    return {
      tone: freshnessStatus === "stale" ? "warn" : "info",
      title: "Agent 状态：已跳过模型调用",
      description: skipReason ?? "规则候选为空、数据基准过期或门控条件未通过，因此没有调用模型，避免把参考快照包装成当前结论。",
      stats
    };
  }

  if (llmStatus === "failed" || llmStatus === "rejected") {
    return {
      tone: "risk",
      title: "Agent 状态：复核失败或被校验拒绝",
      description: skipReason ?? "模型输出未通过校验，本次不要使用模型结论；规则候选仍可作为研究线索复盘。",
      stats
    };
  }

  return {
    tone: "muted",
    title: "Agent 状态：等待完整运行详情",
    description: "列表摘要已加载，完整 Agent 复核状态正在随最近运行详情读取。",
    stats
  };
}

function freshnessStatusLabel(value?: SelectionRunRecord["freshnessStatus"]) {
  if (value === "current") return "匹配";
  if (value === "stale") return "过期";
  return "待确认";
}

function agentGateToneClass(tone: AgentGateStatus["tone"]) {
  if (tone === "ok") return "border-emerald-300/25 bg-emerald-300/[0.07] text-emerald-100";
  if (tone === "warn") return "border-amber-300/25 bg-amber-300/[0.08] text-amber-100";
  if (tone === "risk") return "border-rose-300/25 bg-rose-300/[0.08] text-rose-100";
  if (tone === "info") return "border-cyan-300/25 bg-cyan-300/[0.06] text-cyan-100";
  return "border-line bg-bg/50 text-slate-300";
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
    sourceReportTradeDate: run.sourceReportTradeDate,
    runEffectiveTradeDate: run.runEffectiveTradeDate,
    freshnessStatus: run.freshnessStatus,
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

function safeText(value?: string | null) {
  return cleanDisplayText(value) ?? value ?? "";
}

function errorText(error: unknown) {
  return cleanDisplayText(error instanceof Error ? error.message : String(error)) ?? "未知错误";
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
