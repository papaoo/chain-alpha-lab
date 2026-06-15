"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Filter, Search, X } from "lucide-react";
import { BasicStockNameHover } from "@/components/SelectionStockHover";
import { buildSelectionSummaryInsight, formatSelectionRate, formatSelectionScore } from "@/lib/selection/insights";
import type { SelectionRunMode, SelectionRunStatus, SelectionRunSummary } from "@/lib/selection/types";

type StatusFilter = "all" | SelectionRunStatus;
type ModeFilter = "all" | SelectionRunMode;
type WarningFilter = "all" | "warning" | "clean";

export function SelectionRunsClient({ runs }: { runs: SelectionRunSummary[] }) {
  const [keyword, setKeyword] = useState("");
  const [strategy, setStrategy] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [mode, setMode] = useState<ModeFilter>("all");
  const [warning, setWarning] = useState<WarningFilter>("all");

  const strategies = useMemo(() => Array.from(new Set(runs.map((run) => run.strategyName))).sort(), [runs]);
  const filteredRuns = useMemo(
    () => filterRuns(runs, { keyword, strategy, status, mode, warning }),
    [runs, keyword, strategy, status, mode, warning]
  );
  const hasFilter = keyword || strategy !== "all" || status !== "all" || mode !== "all" || warning !== "all";

  const successCount = runs.filter((run) => run.status === "success").length;
  const failedCount = runs.filter((run) => run.status === "failed").length;
  const warningCount = runs.filter((run) => run.warnings.length > 0).length;

  return (
    <main className="min-h-[100dvh] bg-[#070b10] px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1480px] gap-4">
        <header className="rounded-lg border border-slate-800 bg-slate-950/62 p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <Link className="text-sm text-cyan-300 hover:text-cyan-200" href="/mainline?view=selection">
                返回策略选股
              </Link>
              <p className="mt-4 text-xs tracking-[0.18em] text-cyan-200">SELECTION RUNS</p>
              <h1 className="mt-2 text-3xl font-semibold">策略选股运行记录</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                每一次规则选股都会保存参数、数据依据、精选名单、未入选原因和数据源警告。这里用于复盘策略稳定性，不作为实时买卖指令。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
              <MiniStat label="记录数" value={`${runs.length}`} />
              <MiniStat label="成功" value={`${successCount}`} />
              <MiniStat label="失败" value={`${failedCount}`} />
              <MiniStat label="有警告" value={`${warningCount}`} />
            </div>
          </div>
        </header>

        <section className="rounded-lg border border-slate-800 bg-slate-950/62 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-cyan-200">
                <Filter size={17} />
              </span>
              <div>
                <h2 className="font-semibold">运行筛选</h2>
                <p className="mt-1 text-xs text-slate-500">
                  当前显示 {filteredRuns.length}/{runs.length} 次运行
                </p>
              </div>
            </div>
            {hasFilter ? (
              <button
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 transition hover:border-cyan-300/40 hover:text-cyan-100"
                type="button"
                onClick={() => {
                  setKeyword("");
                  setStrategy("all");
                  setStatus("all");
                  setMode("all");
                  setWarning("all");
                }}
              >
                <X size={14} />
                重置筛选
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr_0.7fr_0.7fr_0.8fr]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                className="h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-9 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索策略、运行ID、报告ID、警告"
              />
            </label>
            <Select value={strategy} onChange={setStrategy}>
              <option value="all">全部策略</option>
              {strategies.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
            <Select value={status} onChange={(value) => setStatus(value as StatusFilter)}>
              <option value="all">全部状态</option>
              <option value="success">成功</option>
              <option value="failed">失败</option>
              <option value="running">运行中</option>
            </Select>
            <Select value={mode} onChange={(value) => setMode(value as ModeFilter)}>
              <option value="all">全部模式</option>
              <option value="rule">规则</option>
              <option value="agent">Agent</option>
            </Select>
            <Select value={warning} onChange={(value) => setWarning(value as WarningFilter)}>
              <option value="all">全部数据状态</option>
              <option value="warning">有数据警告</option>
              <option value="clean">无数据警告</option>
            </Select>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/56">
          <div className="grid grid-cols-[1.1fr_0.8fr_0.8fr_0.7fr] gap-3 border-b border-slate-800 px-4 py-3 text-xs text-slate-500 max-lg:hidden">
            <span>策略 / 运行ID</span>
            <span>运行时间</span>
            <span>数据依据</span>
            <span className="text-right">结果</span>
          </div>
          <div className="divide-y divide-slate-800">
            {filteredRuns.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </div>
          {!filteredRuns.length ? (
            <div className="p-8 text-center text-sm text-slate-500">
              {runs.length ? "没有符合筛选条件的运行记录。" : "暂无策略选股运行记录。"}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function RunRow({ run }: { run: SelectionRunSummary }) {
  const insight = buildSelectionSummaryInsight(run);
  return (
    <article
      className="grid gap-3 px-4 py-3 text-sm transition hover:bg-cyan-400/[0.04] lg:grid-cols-[1.1fr_0.8fr_0.8fr_0.7fr] lg:items-center"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link className="font-medium text-slate-100 transition hover:text-cyan-200" href={`/selection/runs/${run.id}`}>
            {run.strategyName}
          </Link>
          <span className="rounded border border-slate-800 px-1.5 py-0.5 text-[11px] text-slate-400">{run.mode === "rule" ? "规则" : "Agent"}</span>
          <span className={`rounded border px-1.5 py-0.5 text-[11px] ${statusClass(run.status)}`}>
            {formatStatus(run.status)}
          </span>
          <span className={`rounded border px-1.5 py-0.5 text-[11px] ${qualityClass(insight.qualityTone)}`}>
            {insight.qualityLabel}
          </span>
          <span
            className="rounded border border-slate-700 bg-slate-900/60 px-1.5 py-0.5 text-[11px] text-slate-400"
            title={run.ruleVersionLabel ?? run.ruleVersion ?? "历史版本未记录"}
          >
            规则 {shortRuleVersion(run.ruleVersion)}
          </span>
          {run.warnings.length ? (
            <span className="rounded border border-amber-300/25 bg-amber-300/10 px-1.5 py-0.5 text-[11px] text-amber-100">
              {run.warnings.length} 条警告
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate font-mono text-xs text-slate-500">{run.id}</p>
      </div>
      <div className="text-xs leading-5 text-slate-400">
        <p>{formatDateTime(run.startedAt)}</p>
        <p>耗时 {formatDuration(run.startedAt, run.finishedAt)}</p>
      </div>
      <div className="min-w-0 text-xs leading-5 text-slate-400">
        <p className="truncate">报告 {run.sourceReportId ?? "无"}</p>
        <p className="truncate">
          {insight.bestPick ? (
            <>
              最高分{" "}
              <BasicStockNameHover
                className="font-medium text-slate-200"
                stock={{
                  name: insight.bestPick.name,
                  code: insight.bestPick.code,
                  score: insight.bestPick.score,
                  note: `${run.strategyName} / ${insight.bestPick.tier}级 / ${insight.bestPick.action}`
                }}
              />{" "}
              {insight.bestPick.tier}{insight.bestPick.score}
            </>
          ) : (run.warnings[0] ?? "无数据源警告")}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-xs lg:text-right">
        <MiniStat label="精选率" value={formatSelectionRate(insight.selectionRate)} />
        <MiniStat label="均分" value={formatSelectionScore(insight.avgPreviewScore)} />
        <MiniStat label="未入选" value={`${run.rejectedCount}`} />
      </div>
    </article>
  );
}

function Select({
  value,
  onChange,
  children
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      className="h-10 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/50"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {children}
    </select>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function filterRuns(
  runs: SelectionRunSummary[],
  filters: { keyword: string; strategy: string; status: StatusFilter; mode: ModeFilter; warning: WarningFilter }
) {
  const keyword = filters.keyword.trim().toLowerCase();
  return runs.filter((run) => {
    if (filters.strategy !== "all" && run.strategyName !== filters.strategy) return false;
    if (filters.status !== "all" && run.status !== filters.status) return false;
    if (filters.mode !== "all" && run.mode !== filters.mode) return false;
    if (filters.warning === "warning" && !run.warnings.length) return false;
    if (filters.warning === "clean" && run.warnings.length) return false;
    if (!keyword) return true;
    const haystack = [
      run.id,
      run.strategyId,
      run.strategyName,
      run.ruleVersion ?? "",
      run.ruleVersionLabel ?? "",
      run.sourceReportId ?? "",
      run.errorMessage ?? "",
      ...run.warnings
    ].join(" ").toLowerCase();
    return haystack.includes(keyword);
  });
}

function statusClass(status: SelectionRunStatus) {
  if (status === "success") return "border-emerald-300/30 bg-emerald-300/10 text-emerald-200";
  if (status === "running") return "border-cyan-300/30 bg-cyan-300/10 text-cyan-200";
  return "border-rose-300/30 bg-rose-300/10 text-rose-200";
}

function qualityClass(tone: "emerald" | "cyan" | "amber" | "rose" | "slate") {
  if (tone === "emerald") return "border-emerald-300/30 bg-emerald-300/10 text-emerald-200";
  if (tone === "cyan") return "border-cyan-300/30 bg-cyan-300/10 text-cyan-200";
  if (tone === "amber") return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  if (tone === "rose") return "border-rose-300/30 bg-rose-300/10 text-rose-200";
  return "border-slate-700 bg-slate-900/60 text-slate-300";
}

function formatStatus(status: SelectionRunStatus) {
  if (status === "success") return "成功";
  if (status === "running") return "运行中";
  return "失败";
}

function shortRuleVersion(value?: string) {
  if (!value) return "历史";
  const match = value.match(/(\d{4}-\d{2}-\d{2})-v(\d+)$/);
  return match ? `${match[1]} v${match[2]}` : value.replace(/^selection-rules-/, "");
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatDuration(startedAt: string, finishedAt?: string) {
  if (!finishedAt) return "未完成";
  const diff = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "未知";
  if (diff < 1000) return `${diff}ms`;
  return `${(diff / 1000).toFixed(1)}s`;
}
