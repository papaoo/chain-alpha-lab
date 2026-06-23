"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Filter, Search, X } from "lucide-react";
import { BasicStockNameHover } from "@/components/SelectionStockHover";
import { SelectionFreshnessPill } from "@/components/SelectionFreshnessPill";
import { fetchApiJson } from "@/lib/client/api";
import { cleanDisplayText } from "@/lib/display/text";
import { buildSelectionSummaryInsight, formatSelectionRate, formatSelectionScore } from "@/lib/selection/insights";
import type { SelectionRunMode, SelectionRunStatus, SelectionRunSummary } from "@/lib/selection/types";

type StatusFilter = "all" | SelectionRunStatus;
type ModeFilter = "all" | SelectionRunMode;
type WarningFilter = "all" | "warning" | "clean";
type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };

const LOAD_MORE_STEP = 40;
const MAX_CLIENT_RUN_LIMIT = 100;
const RUNNING_LIST_REFRESH_MS = 5000;

export function SelectionRunsLoader() {
  const [runs, setRuns] = useState<SelectionRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchApiJson<SelectionRunSummary[]>(`/api/selection/runs?limit=${LOAD_MORE_STEP + 1}&_t=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal
    })
      .then((json) => {
        if (!json.data) {
          throw new Error(json.error?.message ?? "选股运行记录读取失败");
        }
        setRuns(json.data.slice(0, LOAD_MORE_STEP));
        setHasMore(json.data.length > LOAD_MORE_STEP);
      })
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  if (!loading && !error) return <SelectionRunsClient runs={runs} initialHasMore={hasMore} />;

  return (
    <main className="min-h-[100dvh] bg-[#070b10] px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1480px] gap-4">
        <header className="rounded-lg border border-slate-800 bg-slate-950/62 p-5">
          <Link className="text-sm text-cyan-300 hover:text-cyan-200" href="/mainline?view=selection">
            返回策略选股
          </Link>
          <p className="mt-4 text-xs tracking-[0.18em] text-cyan-200">选股运行记录</p>
          <h1 className="mt-2 text-3xl font-semibold">正在读取策略选股运行记录</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            运行历史采用客户端按需加载，避免大批量历史记录拖慢首屏。
          </p>
        </header>
        {error ? (
          <section className="rounded-lg border border-rose-300/25 bg-rose-300/[0.07] p-4 text-sm text-rose-100">
            读取失败：{error}
          </section>
        ) : (
          <section className="grid gap-3">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-20 animate-pulse rounded-lg border border-slate-800 bg-slate-950/62" />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

export function SelectionRunsClient({ runs, initialHasMore = runs.length >= LOAD_MORE_STEP }: { runs: SelectionRunSummary[]; initialHasMore?: boolean }) {
  const [loadedRuns, setLoadedRuns] = useState(runs);
  const [keyword, setKeyword] = useState("");
  const [strategy, setStrategy] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [mode, setMode] = useState<ModeFilter>("all");
  const [warning, setWarning] = useState<WarningFilter>("all");
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreRuns, setHasMoreRuns] = useState(initialHasMore);
  const [loadMoreError, setLoadMoreError] = useState("");

  const strategies = useMemo(() => Array.from(new Set(loadedRuns.map((run) => run.strategyName))).sort(), [loadedRuns]);
  const filteredRuns = useMemo(
    () => filterRuns(loadedRuns, { keyword, strategy, status, mode, warning }),
    [loadedRuns, keyword, strategy, status, mode, warning]
  );
  const hasFilter = keyword || strategy !== "all" || status !== "all" || mode !== "all" || warning !== "all";

  const successCount = loadedRuns.filter((run) => run.status === "success").length;
  const failedCount = loadedRuns.filter((run) => run.status === "failed").length;
  const warningCount = loadedRuns.filter((run) => run.warnings.length > 0).length;
  const riskWarningCount = loadedRuns.filter((run) => (run.warningSummary?.riskCount ?? 0) > 0).length;
  const canLoadMore = hasMoreRuns && loadedRuns.length < MAX_CLIENT_RUN_LIMIT;
  const actionabilitySummary = useMemo(() => summarizeRunActionability(loadedRuns), [loadedRuns]);

  useEffect(() => {
    if (!loadedRuns.some((run) => run.status === "running")) return;
    const timer = window.setInterval(() => {
      fetchApiJson<SelectionRunSummary[]>(`/api/selection/runs?limit=${Math.max(LOAD_MORE_STEP, loadedRuns.length)}&_t=${Date.now()}`, { cache: "no-store" })
        .then((json) => {
          if (json.data) setLoadedRuns(json.data);
        })
        .catch(() => undefined);
    }, RUNNING_LIST_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadedRuns]);

  async function loadMoreRuns() {
    setLoadingMore(true);
    setLoadMoreError("");
    try {
      const nextLimit = Math.min(MAX_CLIENT_RUN_LIMIT, loadedRuns.length + LOAD_MORE_STEP);
      const json = await fetchApiJson<SelectionRunSummary[]>(`/api/selection/runs?limit=${nextLimit}`, { cache: "no-store" });
      if (!json.data) {
        throw new Error(json.error?.message ?? "加载更多运行记录失败");
      }
      setLoadedRuns(json.data);
      setHasMoreRuns(json.data.length > loadedRuns.length && json.data.length < MAX_CLIENT_RUN_LIMIT);
    } catch (error) {
      setLoadMoreError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[#070b10] px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1480px] gap-4">
        <header className="rounded-lg border border-slate-800 bg-slate-950/62 p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <Link className="text-sm text-cyan-300 hover:text-cyan-200" href="/mainline?view=selection">
                返回策略选股
              </Link>
              <p className="mt-4 text-xs tracking-[0.18em] text-cyan-200">选股运行记录</p>
              <h1 className="mt-2 text-3xl font-semibold">策略选股运行记录</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                每一次规则选股都会保存参数、数据依据、精选名单、未入选原因和数据源警告。这里用于复盘策略稳定性，不作为实时买卖指令。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
              <MiniStat label="记录数" value={`${loadedRuns.length}`} />
              <MiniStat label="成功" value={`${successCount}`} />
              <MiniStat label="失败" value={`${failedCount}`} />
              <MiniStat label="需复核" value={`${riskWarningCount}/${warningCount}`} />
            </div>
          </div>
        </header>

        <section className={`rounded-lg border p-4 ${qualityClass(actionabilitySummary.tone)}`}>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs tracking-[0.16em] opacity-80">快照可行动性</p>
              <h2 className="mt-1 font-semibold">{actionabilitySummary.label}</h2>
              <p className="mt-1 text-xs leading-5 opacity-85">{actionabilitySummary.summary}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
              <MiniStat label="可判断" value={`${actionabilitySummary.actionable}`} />
              <MiniStat label="仅参考" value={`${actionabilitySummary.referenceOnly}`} />
              <MiniStat label="不可行动" value={`${actionabilitySummary.notActionable}`} />
              <MiniStat label="未分级" value={`${actionabilitySummary.unknown}`} />
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-950/62 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-cyan-200">
                <Filter size={17} />
              </span>
              <div>
                <h2 className="font-semibold">运行筛选</h2>
                <p className="mt-1 text-xs text-slate-500">
                  当前显示 {filteredRuns.length}/{loadedRuns.length} 次运行
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
              {loadedRuns.length ? "没有符合筛选条件的运行记录。" : "暂无策略选股运行记录。"}
            </div>
          ) : null}
          {canLoadMore || loadMoreError ? (
            <div className="border-t border-slate-800 px-4 py-4 text-center">
              {loadMoreError ? <p className="mb-2 text-xs text-rose-200">{loadMoreError}</p> : null}
              {canLoadMore ? (
                <button
                  className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs text-cyan-100 transition hover:border-cyan-200/60 hover:bg-cyan-300/15 disabled:opacity-60"
                  type="button"
                  onClick={loadMoreRuns}
                  disabled={loadingMore}
                >
                  {loadingMore ? "加载中..." : `加载更多，最多展示 ${MAX_CLIENT_RUN_LIMIT} 条`}
                </button>
              ) : null}
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
            className={`rounded border px-1.5 py-0.5 text-[11px] ${qualityClass(insight.actionabilityStats.tone)}`}
            title={insight.actionabilityStats.summary}
          >
            {insight.actionabilityStats.label}
          </span>
          <span
            className="rounded border border-slate-700 bg-slate-900/60 px-1.5 py-0.5 text-[11px] text-slate-400"
            title={run.ruleVersionLabel ?? run.ruleVersion ?? "历史版本未记录"}
          >
            规则 {shortRuleVersion(run.ruleVersion)}
          </span>
          <SelectionFreshnessPill run={run} compact />
          {run.warnings.length ? (
            <span
              className={`rounded border px-1.5 py-0.5 text-[11px] ${warningSummaryClass(run.warningSummary?.primarySeverity)}`}
              title={selectionWarningSummaryTitle(run)}
            >
              {run.warningSummary?.label ?? `${run.warnings.length} 条警告`}
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate font-mono text-xs text-slate-500">{run.id}</p>
      </div>
      <div className="text-xs leading-5 text-slate-400">
        <p>{formatDateTime(run.startedAt)}</p>
        <p>{run.status === "running" ? "已运行" : "耗时"} {formatDuration(run.startedAt, run.finishedAt, run.status)}</p>
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
                  latest: insight.bestPick.runtimeSnapshot?.latestPrice ?? insight.bestPick.price,
                  changePct: insight.bestPick.runtimeSnapshot?.changePct ?? insight.bestPick.changePct,
                  turnoverRate: insight.bestPick.runtimeSnapshot?.turnoverRate,
                  amount: insight.bestPick.runtimeSnapshot?.amount,
                  mainNetFlow: insight.bestPick.runtimeSnapshot?.mainNetInflow,
                  score: insight.bestPick.score,
                  note: `${run.strategyName} / ${insight.bestPick.tier}级 / ${insight.bestPick.action}${selectionSnapshotTimeNote(insight.bestPick.runtimeSnapshot)}`
                }}
              />{" "}
              {insight.bestPick.tier}{insight.bestPick.score}
            </>
          ) : run.status === "running" ? (
            <span className="text-cyan-200">正在生成候选池与评分结果</span>
          ) : (cleanDisplayText(run.warningPreview?.[0] ?? run.warnings[0]) ?? "无数据源警告")}
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
    if (filters.warning === "warning" && !run.warningCount) return false;
    if (filters.warning === "clean" && run.warningCount) return false;
    if (!keyword) return true;
    const haystack = [
      run.id,
      run.strategyId,
      run.strategyName,
      run.ruleVersion ?? "",
      run.ruleVersionLabel ?? "",
      run.sourceReportId ?? "",
      run.errorMessage ?? "",
      ...(run.warningPreview ?? run.warnings)
    ].join(" ").toLowerCase();
    return haystack.includes(keyword);
  });
}

function summarizeRunActionability(runs: SelectionRunSummary[]) {
  let actionable = 0;
  let referenceOnly = 0;
  let notActionable = 0;
  let unknown = 0;
  for (const run of runs) {
    const insight = buildSelectionSummaryInsight(run);
    actionable += insight.actionabilityStats.actionable;
    referenceOnly += insight.actionabilityStats.referenceOnly;
    notActionable += insight.actionabilityStats.notActionable;
    unknown += insight.actionabilityStats.unknown;
  }
  const total = actionable + referenceOnly + notActionable + unknown;
  const known = total - unknown;
  const tone: "emerald" | "cyan" | "amber" | "rose" | "slate" =
    !total || unknown === total
      ? "slate"
      : notActionable > 0
        ? "rose"
        : referenceOnly >= Math.max(1, Math.ceil(known * 0.5))
          ? "amber"
          : actionable >= Math.max(1, Math.ceil(known * 0.6))
            ? "emerald"
            : "cyan";
  const label =
    tone === "emerald"
      ? "已加载记录以可判断快照为主"
      : tone === "amber"
        ? "已加载记录中参考快照偏多"
        : tone === "rose"
          ? "已加载记录含不可行动快照"
          : tone === "cyan"
            ? "已加载记录部分快照可判断"
            : "已加载记录多为历史未分级快照";
  const summary = total
    ? unknown === total
      ? `已加载运行记录的精选预览快照 ${unknown}/${total} 条缺少行动分级字段；这通常是旧版本运行记录，不等于当前行情缺失。打开详情页后以上方“当前统一行情快照”为准。`
      : `统计已加载运行记录的精选预览快照：可判断 ${actionable}/${total}，仅参考 ${referenceOnly}/${total}，不可行动 ${notActionable}/${total}${unknown ? `，旧版待分级 ${unknown}/${total}` : ""}。`
    : "暂无可统计的精选预览快照。";
  return { actionable, referenceOnly, notActionable, unknown, tone, label, summary };
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

function warningSummaryClass(severity?: "info" | "warning" | "risk") {
  if (severity === "risk") return "border-rose-300/30 bg-rose-300/10 text-rose-100";
  if (severity === "warning") return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  return "border-slate-700 bg-slate-900/60 text-slate-300";
}

function selectionWarningSummaryTitle(run: SelectionRunSummary) {
  const summary = cleanDisplayText(run.warningSummary?.summary);
  const primary = cleanDisplayText(run.warningSummary?.primaryWarning);
  const preview = (run.warningPreview ?? run.warnings).map((item) => cleanDisplayText(item)).filter(Boolean).join("\n");
  if (summary && primary && !summary.includes(primary)) return `${summary}\n主触发：${primary}${preview ? `\n预览：\n${preview}` : ""}`;
  return summary ? `${summary}${preview ? `\n预览：\n${preview}` : ""}` : cleanDisplayText(run.warnings.join("；")) ?? "";
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

function selectionSnapshotTimeNote(snapshot?: SelectionRunSummary["topPickPreview"][number]["runtimeSnapshot"]) {
  if (!snapshot?.fetchedAt && !snapshot?.quoteUpdatedAt) return "";
  const parts = [
    snapshot.fetchedAt ? `运行抓取 ${formatDateTime(snapshot.fetchedAt)}` : "",
    snapshot.quoteUpdatedAt ? `报价 ${formatDateTime(snapshot.quoteUpdatedAt)}` : ""
  ].filter(Boolean);
  return parts.length ? ` / ${parts.join(" / ")}` : "";
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatDuration(startedAt: string, finishedAt?: string, status?: SelectionRunStatus) {
  const endTime = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  if (!finishedAt && status !== "running") return "未完成";
  const diff = endTime - new Date(startedAt).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "未知";
  if (diff < 1000) return `${diff}ms`;
  return `${(diff / 1000).toFixed(1)}s`;
}
