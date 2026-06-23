"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Clock3, Filter, Loader2, Search, X } from "lucide-react";
import { SelectionAgentReview } from "@/components/SelectionAgentReview";
import { SelectionDataConsistencyCard } from "@/components/SelectionDataConsistencyCard";
import { SelectionFreshnessNotice, SelectionFreshnessPill } from "@/components/SelectionFreshnessPill";
import { SelectionLiveSnapshotPanel } from "@/components/SelectionLiveSnapshotPanel";
import {
  normalizeCode,
  SelectionRunLiveSnapshotSummaryPanel,
  useSelectionRunLiveSnapshots,
  useSelectionRunLiveSnapshotSummary,
  type SelectionLiveSnapshotMap
} from "@/components/SelectionRunLiveSnapshots";
import { SelectionRunInsightCards } from "@/components/SelectionRunInsightCards";
import { SelectionSnapshotHint } from "@/components/SelectionSnapshotHint";
import { SelectionStockNameHover } from "@/components/SelectionStockHover";
import { SelectionTrackButton } from "@/components/SelectionTrackButton";
import { fetchApiJson } from "@/lib/client/api";
import { buildSelectionPickDecisionPlan, isSelectionRejected, normalizeSelectionAction } from "@/lib/selection/insights";
import { buildSelectionWarningSummary, type SelectionWarningSummary } from "@/lib/selection/warning-severity";
import { cleanDisplayList, cleanDisplayText } from "@/lib/display/text";
import type { StockRealtimeSnapshot } from "@/lib/market/stockSnapshot";
import type { SelectionPick, SelectionRunRecord } from "@/lib/selection/types";

type PickTone = "cyan" | "amber" | "rose";
type TierFilter = "all" | SelectionPick["tier"];
type ActionFilter = "all" | SelectionPick["action"];
const RUNNING_DETAIL_POLL_MS = 3000;

export function SelectionRunDetailLoader({ id }: { id: string }) {
  const [run, setRun] = useState<SelectionRunRecord | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setRun(null);
    setError("");
    fetchApiJson<SelectionRunRecord>(`/api/selection/runs/${id}?_t=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal
    })
      .then((json) => {
        if (!json.data) throw new Error(json.error?.message ?? "选股运行详情读取失败");
        setRun(json.data);
      })
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      });
    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    if (run?.status !== "running") return;
    const timer = window.setInterval(() => {
      fetchApiJson<SelectionRunRecord>(`/api/selection/runs/${id}?_t=${Date.now()}`, { cache: "no-store" })
        .then((json) => {
          if (json.data) setRun(json.data);
        })
        .catch(() => undefined);
    }, RUNNING_DETAIL_POLL_MS);
    return () => window.clearInterval(timer);
  }, [id, run?.status]);

  if (run) return <SelectionRunDetailClient run={run} />;

  return (
    <main className="min-h-[100dvh] bg-[#070b10] px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1500px] gap-4">
        <header className="rounded-lg border border-slate-800 bg-slate-950/62 p-5">
          <Link className="text-sm text-cyan-300 hover:text-cyan-200" href="/selection/runs">
            返回选股运行
          </Link>
          <p className="mt-4 text-xs tracking-[0.18em] text-cyan-200">选股运行详情</p>
          <h1 className="mt-2 text-3xl font-semibold">正在读取选股运行详情</h1>
          <p className="mt-2 break-all text-sm leading-6 text-slate-400">{id}</p>
        </header>
        {error ? (
          <section className="rounded-lg border border-rose-300/25 bg-rose-300/[0.07] p-4 text-sm text-rose-100">
            读取失败：{cleanDisplayText(error) ?? error}
          </section>
        ) : (
          <section className="grid gap-3 lg:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-36 animate-pulse rounded-lg border border-slate-800 bg-slate-950/62" />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

export function SelectionRunDetailClient({ run }: { run: SelectionRunRecord }) {
  const [keyword, setKeyword] = useState("");
  const [tier, setTier] = useState<TierFilter>("all");
  const [action, setAction] = useState<ActionFilter>("all");
  const [sector, setSector] = useState("all");

  const allPicks = useMemo(() => [...run.picks, ...run.rejected], [run.picks, run.rejected]);
  const liveSnapshots = useSelectionRunLiveSnapshots(allPicks, run.status === "success");
  const sectors = useMemo(() => Array.from(new Set(allPicks.map((pick) => pick.sectorName).filter(Boolean))).sort(), [allPicks]);
  const filtered = useMemo(
    () => filterPicks(allPicks, { keyword, tier, action, sector }),
    [allPicks, keyword, tier, action, sector]
  );
  const pickCodes = useMemo(() => new Set(run.picks.map((pick) => pick.code)), [run.picks]);
  const picked = filtered.filter((pick) => pickCodes.has(pick.code));
  const waiting = filtered.filter((pick) => !pickCodes.has(pick.code) && !isSelectionRejected(pick.action));
  const removed = filtered.filter((pick) => isSelectionRejected(pick.action));
  const hasFilter = Boolean(keyword || tier !== "all" || action !== "all" || sector !== "all");
  const headlineWarning = primarySelectionRunWarning(run.warnings);
  const poolMode = selectionPoolModeLabel(run.parameters.poolMode);
  const liveSummary = useSelectionRunLiveSnapshotSummary(allPicks, liveSnapshots.snapshots, liveSnapshots.loading, liveSnapshots.error);
  const warningSummary = useMemo(
    () => buildSelectionWarningSummary(run.warnings, {
      freshnessStatus: run.freshnessStatus,
      topPickPreview: allPicks.slice(0, 3).map((pick) => ({
        code: pick.code,
        name: pick.name,
        score: pick.score,
        tier: pick.tier,
        action: pick.action,
        runtimeSnapshot: pick.runtimeSnapshot,
        dataFreshness: pick.dataFreshness
      }))
    }),
    [allPicks, run.freshnessStatus, run.warnings]
  );

  if (run.status === "running") {
    return <SelectionRunRunningDetail run={run} poolMode={poolMode} />;
  }

  return (
    <main className="min-h-[100dvh] bg-[#070b10] px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1500px] gap-4">
        <header className="rounded-lg border border-slate-800 bg-slate-950/62 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Link className="text-sm text-cyan-300 hover:text-cyan-200" href="/mainline?view=selection">
                返回策略选股
              </Link>
              <p className="mt-4 text-xs tracking-[0.18em] text-cyan-200">选股运行详情</p>
              <h1 className="mt-2 text-3xl font-semibold">{cleanDisplayText(run.strategyName) ?? run.strategyName} 运行详情</h1>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {formatDateTime(run.startedAt)} / {run.mode === "rule" ? "规则模式" : "Agent 模式"} / 耗时 {formatDuration(run.startedAt, run.finishedAt)} / 来源报告 {run.sourceReportId ?? "--"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded border border-cyan-300/25 bg-cyan-300/10 px-2 py-1 text-cyan-100">
                  规则版本：{cleanDisplayText(run.ruleVersionLabel ?? run.ruleVersion) ?? "历史版本"}
                </span>
                <span className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-slate-300">
                  运行路径：{run.mode === "rule" ? "仅规则，不调用模型" : "Agent 复核"}
                </span>
                <span className="rounded border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-emerald-100">
                  候选池：{poolMode}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <MiniStat label="候选池" value={`${run.candidateCount}`} />
              <MiniStat label="入选" value={`${run.pickCount}`} />
              <MiniStat label="未入选" value={`${run.rejected.length}`} />
            </div>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/56 px-4 py-3">
          <span className="text-xs text-slate-500">数据依据</span>
          <SelectionFreshnessPill run={run} />
        </div>
        <SelectionRunLiveSnapshotSummaryPanel summary={liveSummary} onRefresh={liveSnapshots.refresh} />
        <SelectionRunTrustSummary run={run} liveSummary={liveSummary} />
        <NoPickTopAlert run={run} />
        <SelectionRunInsightCards run={run} />
        <SelectionFreshnessNotice run={run} />
        <SelectionRunWarningSummaryCard summary={warningSummary} warnings={run.warnings} />
        <SelectionAgentReview
          agentReports={run.agentReports}
          finalReview={run.finalReview}
          llmStatus={run.llmStatus}
          llmErrors={run.llmErrors}
          llmMetrics={run.llmMetrics}
        />

        <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] p-4">
            <p className="text-xs tracking-[0.16em] text-cyan-200">数据依据</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{cleanDisplayText(run.dataBasis) ?? run.dataBasis}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/62 p-4">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <MiniStat label="状态" value={formatRunStatus(run.status)} />
              <MiniStat label="候选池模式" value={poolMode} />
              <MiniStat label="规则版本" value={shortRuleVersion(run.ruleVersion)} />
              <MiniStat label="模型" value={run.mode === "rule" ? "未调用" : "已复核"} />
            </div>
            {headlineWarning ? (
              <p className="mt-3 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-100">
                {cleanDisplayText(headlineWarning) ?? headlineWarning}
              </p>
            ) : null}
          </div>
        </section>

        <SelectionRunFilters
          keyword={keyword}
          setKeyword={setKeyword}
          tier={tier}
          setTier={setTier}
          action={action}
          setAction={setAction}
          sector={sector}
          setSector={setSector}
          sectors={sectors}
          resultCount={filtered.length}
          totalCount={allPicks.length}
          onReset={() => {
            setKeyword("");
            setTier("all");
            setAction("all");
            setSector("all");
          }}
          hasFilter={hasFilter}
        />

        <details className="rounded-lg border border-slate-800 bg-slate-950/56 p-4">
          <summary className="cursor-pointer text-sm font-medium text-cyan-200">运行参数与原始警告</summary>
          <ParameterGrid parameters={run.parameters} warnings={run.warnings} />
        </details>

        <div className="grid items-start gap-4 xl:grid-cols-3">
          <PickColumn title="已入选" subtitle="本次策略运行选出的股票" picks={picked} tone="cyan" run={run} liveSnapshots={liveSnapshots.snapshots} liveLoading={liveSnapshots.loading} liveError={liveSnapshots.error} />
          <PickColumn title="等待确认" subtitle="有证据但仍需要触发条件确认" picks={waiting} tone="amber" run={run} liveSnapshots={liveSnapshots.snapshots} liveLoading={liveSnapshots.loading} liveError={liveSnapshots.error} />
          <PickColumn title="剔除/回避" subtitle="被策略规则、数据缺口或弱证据阻断" picks={removed} tone="rose" run={run} liveSnapshots={liveSnapshots.snapshots} liveLoading={liveSnapshots.loading} liveError={liveSnapshots.error} />
        </div>
      </div>
    </main>
  );
}

function SelectionRunRunningDetail({ run, poolMode }: { run: SelectionRunRecord; poolMode: string }) {
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - new Date(run.startedAt).getTime()) / 1000));
  return (
    <main className="min-h-[100dvh] bg-[#070b10] px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1200px] gap-4">
        <header className="rounded-lg border border-slate-800 bg-slate-950/62 p-5">
          <Link className="text-sm text-cyan-300 hover:text-cyan-200" href="/selection/runs">
            返回选股运行
          </Link>
          <p className="mt-4 text-xs tracking-[0.18em] text-cyan-200">选股运行详情</p>
          <h1 className="mt-2 text-3xl font-semibold">{cleanDisplayText(run.strategyName) ?? run.strategyName} 正在运行</h1>
          <p className="mt-2 break-all text-sm leading-6 text-slate-400">
            {run.id} / {run.mode === "rule" ? "规则模式" : "Agent 模式"} / 已耗时 {elapsedSeconds}s
          </p>
        </header>
        <section className="overflow-hidden rounded-lg border border-cyan-300/25 bg-cyan-300/[0.07]">
          <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
                <Loader2 className="animate-spin" size={18} />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-cyan-100">结果尚未生成</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                  运行记录已创建，后台正在刷新候选池、报价、K 线、资金流和财务摘要。
                </p>
              </div>
            </div>
            <div className="grid min-w-[320px] grid-cols-3 gap-2 text-center text-xs">
              <MiniStat label="状态" value="运行中" />
              <MiniStat label="候选池" value={poolMode} />
              <MiniStat label="耗时" value={`${elapsedSeconds}s`} />
            </div>
          </div>
          <div className="h-1.5 bg-slate-900/70">
            <div className="h-full w-1/3 animate-pulse rounded-r-full bg-cyan-300" />
          </div>
        </section>
        <section className="rounded-lg border border-slate-800 bg-slate-950/62 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
            <Clock3 size={16} className="text-cyan-200" />
            当前提示
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            请等待任务完成后再使用结果。运行中的记录不是交易信号。
          </p>
          {run.warnings.length ? (
            <div className="mt-3 grid gap-2">
              {cleanDisplayList(run.warnings).map((warning, index) => (
                <p key={`${warning}-${index}`} className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-100">
                  {warning}
                </p>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function SelectionRunTrustSummary({
  run,
  liveSummary
}: {
  run: SelectionRunRecord;
  liveSummary: ReturnType<typeof useSelectionRunLiveSnapshotSummary>;
}) {
  const all = [...run.picks, ...run.rejected];
  const runtimeComplete = all.filter((pick) => pick.runtimeSnapshot?.quality === "complete").length;
  const runtimePartial = all.filter((pick) => pick.runtimeSnapshot?.quality === "partial" || pick.runtimeSnapshot?.quality === "quote_only").length;
  const runtimeMissing = Math.max(0, all.length - runtimeComplete - runtimePartial);
  const warningCount = run.warnings.length + liveSummary.warningCount;
  const staleRun = run.freshnessStatus === "stale";
  const liveMissing = liveSummary.missing > 0;
  const hasLiveError = Boolean(liveSummary.error);
  const liveComplete = liveSummary.loaded === liveSummary.total && liveSummary.complete + liveSummary.partial + liveSummary.quoteOnly === liveSummary.total;
  const liveHasOnlyWarnings = liveComplete && !staleRun && !hasLiveError && runtimeMissing === 0 && warningCount > 0;
  const tone: "up" | "warn" | "risk" | "info" =
    staleRun || hasLiveError || runtimeMissing > Math.ceil(Math.max(1, all.length) * 0.35)
      ? "risk"
      : liveMissing || warningCount > 0
        ? "warn"
        : liveComplete
          ? "up"
          : "info";
  const title =
    tone === "up"
      ? "本次结果可信度较高"
      : tone === "warn"
        ? "本次结果需要复核后使用"
        : tone === "risk"
          ? "本次结果不宜直接执行"
          : "本次结果仍在补充快照";
  const guidance =
    tone === "up"
      ? "运行快照和当前统一行情覆盖较好，可以结合个股详情继续看买点、阻断项和追踪验证。"
      : tone === "warn"
        ? liveHasOnlyWarnings
          ? "当前覆盖已经完整，但存在补源、降级或字段级警告；适合做研究和追踪验证，真正执行前仍要看单票数据健康与交易时段。"
          : liveMissing
            ? "当前统一行情仍有缺口，适合观察和复盘；执行前先刷新，并确认单票报价、K线、技术和资金字段齐全。"
            : "存在数据警告或来源报告边界，适合复核后使用；重点看单票数据健康、证据来源和当前交易时段。"
        : tone === "risk"
          ? "来源报告过期、快照缺失或刷新失败时，只能作为历史记录，不应直接转换成买入或卖出动作。"
          : "当前统一行情仍在加载或覆盖不足，等待刷新结果后再判断。";
  const checks = [
    staleRun ? "来源报告交易日与本次有效交易日不一致" : "来源报告交易日匹配",
    liveSummary.loaded === liveSummary.total ? "当前快照覆盖完整" : `当前快照缺 ${liveSummary.missing}/${liveSummary.total}`,
    runtimeMissing ? `运行快照缺失 ${runtimeMissing}/${all.length}` : "运行快照有记录",
    liveSummary.loading ? `当前快照仍有 ${liveSummary.pending}/${liveSummary.total} 等待返回` : "",
    liveHasOnlyWarnings ? "主要问题是补源/字段级警告，不是覆盖缺失" : "",
    run.mode === "agent" ? "已经过 Agent 复核" : "规则模式未调用模型",
    warningCount ? `共有 ${warningCount} 条数据/运行警告` : "暂无明显数据警告"
  ].filter(Boolean);

  return (
    <section className={`rounded-lg border p-4 ${trustToneClass(tone)}`}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs tracking-[0.16em] opacity-80">结果可信度</p>
          <h2 className="mt-1 text-base font-semibold">{title}</h2>
          <p className="mt-2 max-w-4xl text-xs leading-5 opacity-90">{guidance}</p>
        </div>
        <div className="grid min-w-[300px] grid-cols-3 gap-2 text-center text-xs">
          <MiniStat label="运行完整" value={`${runtimeComplete}/${all.length}`} />
          <MiniStat label="当前覆盖" value={`${liveSummary.loaded}/${liveSummary.total}`} />
          <MiniStat label="警告" value={`${warningCount}`} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        {checks.map((item) => (
          <span key={item} className="rounded border border-current/20 bg-slate-950/20 px-2 py-1">
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}

function SelectionRunFilters({
  keyword,
  setKeyword,
  tier,
  setTier,
  action,
  setAction,
  sector,
  setSector,
  sectors,
  resultCount,
  totalCount,
  onReset,
  hasFilter
}: {
  keyword: string;
  setKeyword: (value: string) => void;
  tier: TierFilter;
  setTier: (value: TierFilter) => void;
  action: ActionFilter;
  setAction: (value: ActionFilter) => void;
  sector: string;
  setSector: (value: string) => void;
  sectors: string[];
  resultCount: number;
  totalCount: number;
  onReset: () => void;
  hasFilter: boolean;
}) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/62 p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-cyan-200">
            <Filter size={17} />
          </span>
          <div>
            <h2 className="font-semibold">复核筛选</h2>
            <p className="mt-1 text-xs text-slate-500">显示 {resultCount}/{totalCount}</p>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-[1.4fr_0.8fr_0.8fr_1fr_auto]">
          <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm">
            <Search size={15} className="text-slate-500" />
            <input
              className="min-w-0 flex-1 bg-transparent text-slate-100 outline-none placeholder:text-slate-600"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索股票、代码、理由、阻断项"
            />
          </label>
          <select className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none" value={tier} onChange={(event) => setTier(event.target.value as TierFilter)}>
            <option value="all">全部等级</option>
            {["S", "A", "B", "C", "D"].map((item) => <option key={item} value={item}>{item} 级</option>)}
          </select>
          <select className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none" value={action} onChange={(event) => setAction(event.target.value as ActionFilter)}>
            <option value="all">全部动作</option>
            {(["重点观察", "跟踪观察", "条件等待", "剔除"] as SelectionPick["action"][]).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none" value={sector} onChange={(event) => setSector(event.target.value)}>
            <option value="all">全部板块</option>
            {sectors.map((item) => <option key={item} value={item}>{cleanDisplayText(item) ?? item}</option>)}
          </select>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300 disabled:opacity-40"
            onClick={onReset}
            disabled={!hasFilter}
          >
            <X size={15} />
            重置
          </button>
        </div>
      </div>
    </section>
  );
}

function PickColumn({
  title,
  subtitle,
  picks,
  tone,
  run,
  liveSnapshots,
  liveLoading,
  liveError
}: {
  title: string;
  subtitle: string;
  picks: SelectionPick[];
  tone: PickTone;
  run: SelectionRunRecord;
  liveSnapshots: SelectionLiveSnapshotMap;
  liveLoading: boolean;
  liveError: string;
}) {
  const cls =
    tone === "cyan"
      ? "border-cyan-400/25 bg-cyan-400/[0.05]"
      : tone === "amber"
        ? "border-amber-300/25 bg-amber-300/[0.05]"
        : "border-rose-400/25 bg-rose-400/[0.05]";
  return (
    <section className={`rounded-lg border p-4 ${cls}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
        </div>
        <span className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300">{picks.length}</span>
      </div>
      <div className="grid gap-3">
        {picks.slice(0, 30).map((pick) => (
          <PickCard key={pick.code} pick={pick} tone={tone} run={run} liveSnapshot={liveSnapshots[normalizeCode(pick.code)]} liveLoading={liveLoading} liveError={liveError} />
        ))}
      </div>
      {picks.length > 30 ? <p className="mt-3 text-center text-xs text-slate-500">仅展示前 30 条，可使用筛选缩小范围。</p> : null}
      {!picks.length ? <p className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-500">暂无数据</p> : null}
    </section>
  );
}

function PickCard({
  pick,
  tone,
  run,
  liveSnapshot,
  liveLoading,
  liveError
}: {
  pick: SelectionPick;
  tone: PickTone;
  run: SelectionRunRecord;
  liveSnapshot?: StockRealtimeSnapshot;
  liveLoading: boolean;
  liveError: string;
}) {
  const bar =
    tone === "cyan"
      ? "bg-cyan-300"
      : tone === "amber"
        ? "bg-amber-300"
        : "bg-rose-300";
  const plan = buildSelectionPickDecisionPlan(pick);
  const evidenceCoverage = buildEvidenceCoverage(pick);
  const dataFreshness = pick.dataFreshness;
  const runtimeSnapshot = pick.runtimeSnapshot;
  return (
    <article className="rounded-lg border border-slate-800 bg-slate-950/64 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-slate-100">
            <SelectionStockNameHover pick={pick} run={run} currentSnapshot={liveSnapshot} />
          </h3>
          <p className="mt-1 font-mono text-xs text-slate-500">{pick.code} / {cleanDisplayText(pick.sectorName) ?? pick.sectorName}</p>
        </div>
        <div className="text-right">
          <span className="rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100">{pick.tier}</span>
          <p className="mt-1 font-mono text-lg font-semibold text-slate-100">{pick.score}</p>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.max(5, Math.min(100, pick.score))}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded border border-slate-700 bg-slate-900/60 px-1.5 py-0.5 text-slate-300">{normalizeSelectionAction(pick.action)}</span>
        <span className={`rounded border px-1.5 py-0.5 ${freshnessBasisClass(dataFreshness?.basis)}`}>
          {dataFreshness?.label ? cleanDisplayText(dataFreshness.label) ?? dataFreshness.label : "快照依据未知"}
        </span>
        <span className={`rounded border px-1.5 py-0.5 ${snapshotQualityClass(runtimeSnapshot?.quality)}`}>
          {runtimeSnapshot?.qualityLabel ? cleanDisplayText(runtimeSnapshot.qualityLabel) ?? runtimeSnapshot.qualityLabel : "运行快照未知"}
        </span>
        {runtimeSnapshot?.actionability ? (
          <span className={`rounded border px-1.5 py-0.5 ${snapshotActionabilityClass(runtimeSnapshot.actionability.level)}`}>
            {cleanDisplayText(runtimeSnapshot.actionability.label) ?? runtimeSnapshot.actionability.label}
          </span>
        ) : null}
      </div>
      <SelectionSnapshotHint pick={pick} compact />
      <SelectionDataConsistencyCard pick={pick} compact />
      <SelectionLiveSnapshotPanel pick={pick} snapshot={liveSnapshot} loading={liveLoading} error={liveError} compact />
      <DecisionPlanCard plan={plan} />
      <SelectionTrackButton pick={pick} run={run} compact />

      <div className="mt-3 grid gap-2">
        <ReasonBlock title="正向理由" items={pick.reasons} empty="未记录正向理由。" tone="cyan" />
        <ReasonBlock title="阻断项" items={pick.blockers} empty="未记录阻断项。" tone="rose" />
      </div>

      <details className="mt-3 rounded border border-slate-800 bg-slate-900/40 p-2">
        <summary className="cursor-pointer text-xs text-cyan-200">评分因子与证据</summary>
        <div className="mt-2 grid gap-2">
          {pick.scoreFactors.map((factor) => (
            <div key={factor.key} className="rounded border border-slate-800 bg-slate-950/55 p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-200">{cleanDisplayText(factor.label) ?? factor.label}</span>
                <span className="font-mono text-cyan-200">{factor.score}/{factor.maxScore}</span>
              </div>
              <div className="mt-1 grid gap-1 text-[11px] leading-4 text-slate-400">
                {cleanDisplayList(factor.reasons).slice(0, 2).map((item) => <p key={item}>{item}</p>)}
                {cleanDisplayList(factor.blockers).slice(0, 2).map((item) => <p key={item} className="text-rose-100/80">{item}</p>)}
              </div>
            </div>
          ))}
        </div>
      </details>

      <details className="mt-3 rounded border border-slate-800 bg-slate-900/40 p-2">
        <summary className="cursor-pointer text-xs text-slate-300">数据覆盖</summary>
        <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] md:grid-cols-5">
          {evidenceCoverage.map((item) => (
            <span key={item.key} className={`rounded border px-1.5 py-1 ${item.covered ? "border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-100" : "border-slate-700 bg-slate-950/60 text-slate-500"}`} title={item.note}>
              {item.label}
            </span>
          ))}
        </div>
        {dataFreshness ? (
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] md:grid-cols-5">
            <FreshnessMini label="quote" state={dataFreshness.quote} />
            <FreshnessMini label="kline" state={dataFreshness.kline} />
            <FreshnessMini label="technical" state={dataFreshness.technical} />
            <FreshnessMini label="fund" state={dataFreshness.fundFlow} />
            <FreshnessMini label="company" state={dataFreshness.company} />
          </div>
        ) : null}
      </details>
    </article>
  );
}

function SelectionRunWarningSummaryCard({
  summary,
  warnings
}: {
  summary: SelectionWarningSummary;
  warnings: string[];
}) {
  const tone =
    summary.riskCount > 0
      ? "border-rose-300/25 bg-rose-300/[0.07] text-rose-100"
      : summary.warningCount > 0
        ? "border-amber-300/25 bg-amber-300/[0.07] text-amber-100"
        : summary.infoCount > 0
          ? "border-cyan-300/25 bg-cyan-300/[0.06] text-cyan-100"
          : "border-emerald-300/25 bg-emerald-300/[0.06] text-emerald-100";
  const categoryRows = Object.entries(summary.categories)
    .filter(([, count]) => count > 0)
    .map(([category, count]) => ({ category, count }));

  return (
    <section className={`rounded-lg border p-4 ${tone}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs tracking-[0.16em] opacity-80">警告分层</p>
          <h2 className="mt-1 text-base font-semibold">{summary.label}</h2>
          <p className="mt-2 max-w-4xl text-xs leading-5 opacity-90">{cleanDisplayText(summary.summary) ?? summary.summary}</p>
        </div>
        <div className="grid min-w-[260px] grid-cols-3 gap-2 text-center text-xs">
          <MiniStat label="需复核" value={`${summary.riskCount}`} />
          <MiniStat label="有降级" value={`${summary.warningCount}`} />
          <MiniStat label="提示" value={`${summary.infoCount}`} />
        </div>
      </div>
      {summary.total > 0 ? (
        <details className="mt-3 rounded-lg border border-current/15 bg-slate-950/25 p-3">
          <summary className="cursor-pointer text-xs opacity-90">查看分类与原始警告</summary>
          <div className="mt-3 grid gap-3 lg:grid-cols-[0.65fr_1.35fr]">
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {categoryRows.map((item) => (
                <span key={item.category} className="rounded border border-current/15 bg-slate-950/30 px-2 py-1">
                  {selectionWarningCategoryLabel(item.category)} {item.count}
                </span>
              ))}
            </div>
            <div className="grid gap-2">
              {cleanDisplayList(warnings).slice(0, 8).map((warning, index) => (
                <p key={`${warning}-${index}`} className="rounded border border-current/12 bg-slate-950/30 px-2 py-1.5 text-[11px] leading-4 opacity-90">
                  {warning}
                </p>
              ))}
              {warnings.length > 8 ? <p className="text-[11px] opacity-70">还有 {warnings.length - 8} 条已折叠，可在运行参数中查看完整原文。</p> : null}
            </div>
          </div>
        </details>
      ) : null}
    </section>
  );
}

function NoPickTopAlert({ run }: { run: SelectionRunRecord }) {
  if (run.status !== "success" || run.pickCount > 0 || !run.rejected.length) return null;
  const bestRejected = run.rejected.slice().sort((left, right) => right.score - left.score)[0];
  const topBlockers = aggregateTopBlockers(run.rejected, 3);
  const completeCount = run.rejected.filter((pick) => pick.runtimeSnapshot?.quality === "complete").length;
  const partialCount = run.rejected.filter((pick) => pick.runtimeSnapshot?.quality === "partial" || pick.runtimeSnapshot?.quality === "quote_only").length;
  const missingCount = Math.max(0, run.rejected.length - completeCount - partialCount);

  return (
    <section className="rounded-lg border border-amber-300/25 bg-amber-300/[0.07] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs tracking-[0.16em] text-amber-100">本次无入选</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">本次运行没有选出股票</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">
            最接近入选的是 {bestRejected ? `${bestRejected.name} ${bestRejected.score}/100（${bestRejected.action}）` : "暂无"}。建议检查阻断项到底来自数据缺口，还是策略门槛。
          </p>
        </div>
        <div className="grid min-w-[300px] grid-cols-3 gap-2 text-center text-xs">
          <MiniStat label="完整" value={`${completeCount}/${run.rejected.length}`} />
          <MiniStat label="部分" value={`${partialCount}/${run.rejected.length}`} />
          <MiniStat label="缺失" value={`${missingCount}/${run.rejected.length}`} />
        </div>
      </div>
      {topBlockers.length ? (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {topBlockers.map((item) => (
            <div key={item.label} className="rounded border border-slate-800 bg-slate-950/45 px-3 py-2 text-xs">
              <p className="line-clamp-2 text-slate-300">{cleanDisplayText(item.label) ?? item.label}</p>
              <p className="mt-1 font-mono text-amber-100">{item.count}x</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ReasonBlock({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone: "cyan" | "rose" }) {
  const cleanItems = cleanDisplayList(items).slice(0, 3);
  const color = tone === "cyan" ? "text-cyan-100" : "text-rose-100";
  return (
    <div className="rounded border border-slate-800 bg-slate-900/45 px-2 py-1.5">
      <p className={`text-[11px] font-medium ${color}`}>{title}</p>
      <div className="mt-1 grid gap-1 text-[11px] leading-4 text-slate-400">
        {cleanItems.length ? cleanItems.map((item) => <p key={item}>{item}</p>) : <p>{empty}</p>}
      </div>
    </div>
  );
}

function DecisionPlanCard({ plan }: { plan: ReturnType<typeof buildSelectionPickDecisionPlan> }) {
  const tone =
    plan.tone === "emerald"
      ? "border-emerald-300/25 bg-emerald-300/[0.06] text-emerald-100"
      : plan.tone === "cyan"
        ? "border-cyan-300/25 bg-cyan-300/[0.06] text-cyan-100"
        : plan.tone === "rose"
          ? "border-rose-300/25 bg-rose-300/[0.06] text-rose-100"
          : "border-amber-300/25 bg-amber-300/[0.06] text-amber-100";
  return (
    <div className={`mt-3 rounded-lg border px-3 py-2 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">{cleanDisplayText(plan.label) ?? plan.label}</span>
        <span className="rounded border border-current/20 px-1.5 py-0.5 text-[10px] opacity-80">规则解释</span>
      </div>
      <p className="mt-1 text-[11px] leading-4 opacity-90">{cleanDisplayText(plan.summary) ?? plan.summary}</p>
      {plan.watchPoints.length ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] opacity-90">观察 / 失效</summary>
          <div className="mt-2 grid gap-2">
            <PointList title="观察点" items={plan.watchPoints} />
            <PointList title="失效条件" items={plan.invalidPoints} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function PointList({ title, items }: { title: string; items: string[] }) {
  const cleanItems = cleanDisplayList(items).slice(0, 4);
  if (!cleanItems.length) return null;
  return (
    <div className="rounded border border-current/15 bg-slate-950/20 px-2 py-1.5">
      <p className="text-[10px] opacity-70">{title}</p>
      <div className="mt-1 grid gap-1">
        {cleanItems.map((item) => (
          <p key={item} className="text-[11px] leading-4 opacity-90">
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

function ParameterGrid({ parameters, warnings }: { parameters: Record<string, unknown>; warnings: string[] }) {
  return (
    <div className="mt-3 grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(parameters).map(([key, value]) => (
          <div key={key} className="rounded border border-slate-800 bg-slate-950/50 px-2 py-1.5">
            <p className="font-mono text-[11px] text-slate-500">{key}</p>
            <p className="mt-1 break-words text-xs text-slate-300">{formatParameterValue(value)}</p>
          </div>
        ))}
      </div>
      <div className="rounded border border-slate-800 bg-slate-950/50 p-3">
        <p className="text-xs font-medium text-slate-300">数据刷新与降级警告</p>
        <div className="mt-2 grid gap-2">
          {warnings.length ? cleanDisplayList(warnings).map((warning, index) => (
            <p key={`${warning}-${index}`} className="rounded border border-amber-300/15 bg-amber-300/[0.06] px-2 py-1.5 text-[11px] leading-4 text-amber-100">
              {warning}
            </p>
          )) : <p className="text-xs text-slate-500">本次运行没有数据源警告。</p>}
        </div>
      </div>
    </div>
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

function FreshnessMini({ label, state }: { label: string; state: "fresh" | "snapshot" | "missing" }) {
  return <span className={`rounded border px-1.5 py-1 ${freshnessStateClass(state)}`}>{label}: {formatFreshnessState(state)}</span>;
}

function filterPicks(
  picks: SelectionPick[],
  filters: { keyword: string; tier: TierFilter; action: ActionFilter; sector: string }
) {
  const keyword = filters.keyword.trim().toLowerCase();
  return picks.filter((pick) => {
    if (filters.tier !== "all" && pick.tier !== filters.tier) return false;
    if (filters.action !== "all" && normalizeSelectionAction(pick.action) !== filters.action) return false;
    if (filters.sector !== "all" && pick.sectorName !== filters.sector) return false;
    if (!keyword) return true;
    const haystack = [
      pick.name,
      pick.code,
      pick.sectorName,
      pick.action,
      pick.tier,
      ...pick.reasons,
      ...pick.blockers,
      ...pick.scoreFactors.flatMap((factor) => [factor.label, ...factor.reasons, ...factor.blockers])
    ].join(" ").toLowerCase();
    return haystack.includes(keyword);
  });
}

function primarySelectionRunWarning(warnings: string[]) {
  return cleanDisplayList(warnings).find((warning) => /全A|scan|latest|最新|partial|failed|missing|失败|缺失/i.test(warning)) ?? cleanDisplayList(warnings)[0] ?? "";
}

function selectionPoolModeLabel(value: unknown) {
  if (value === "full_a_scan") return "全 A 扫描";
  if (value === "hybrid_full_a") return "混合全 A 候选池";
  if (value === "strategy_adaptive") return "策略自适应候选池";
  if (value === "recent_signals") return "近期信号池";
  if (value === "latest_report") return "最新报告候选池";
  return "未知候选池";
}

function buildEvidenceCoverage(pick: SelectionPick) {
  const refs = pick.evidenceRefs.join(" ");
  const factorText = pick.scoreFactors.map((factor) => `${factor.key} ${factor.label}`).join(" ");
  const text = `${refs} ${factorText}`;
  return [
    { key: "quote", label: "行情", covered: /quote|hot|zdf|activity/i.test(text), note: "价格、涨跌、成交额、换手或活跃度证据" },
    { key: "technical", label: "技术", covered: /technical|kline|ma20|trend|momentum/i.test(text), note: "K 线、均线、MACD/RSI 或趋势证据" },
    { key: "fund", label: "资金", covered: /fund|MainNetFlow|资金/i.test(text), note: "主力资金或资金质量证据" },
    { key: "sector", label: "板块", covered: /sector|mainline|attribution|sector_match|板块/i.test(text), note: "板块阶段、主线或归属证据" },
    { key: "company", label: "公司", covered: /company|financial|shareholder|business|主营|财务/i.test(text), note: "主营、财务、股东或公司认知证据" }
  ];
}

function aggregateTopBlockers(picks: SelectionPick[], limit: number) {
  const bucket = new Map<string, number>();
  for (const pick of picks) {
    for (const blocker of cleanDisplayList(pick.blockers)) {
      bucket.set(blocker, (bucket.get(blocker) ?? 0) + 1);
    }
  }
  return Array.from(bucket.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, limit);
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

function formatFreshnessState(state?: "fresh" | "snapshot" | "missing") {
  if (state === "fresh") return "最新";
  if (state === "snapshot") return "快照";
  if (state === "missing") return "缺失";
  return "未知";
}

function freshnessBasisClass(basis?: NonNullable<SelectionPick["dataFreshness"]>["basis"]) {
  if (basis === "runtime_refresh") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (basis === "mixed") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  return "border-slate-700 bg-slate-900/60 text-slate-300";
}

function freshnessStateClass(state?: "fresh" | "snapshot" | "missing") {
  if (state === "fresh") return "border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-100";
  if (state === "snapshot") return "border-cyan-300/20 bg-cyan-300/[0.07] text-cyan-100";
  if (state === "missing") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-slate-700 bg-slate-900/60 text-slate-400";
}

function trustToneClass(tone: "up" | "warn" | "risk" | "info") {
  if (tone === "up") return "border-emerald-300/25 bg-emerald-300/[0.07] text-emerald-100";
  if (tone === "warn") return "border-amber-300/25 bg-amber-300/[0.08] text-amber-100";
  if (tone === "risk") return "border-rose-300/25 bg-rose-300/[0.07] text-rose-100";
  return "border-cyan-300/25 bg-cyan-300/[0.06] text-cyan-100";
}

function snapshotQualityClass(quality?: NonNullable<SelectionPick["runtimeSnapshot"]>["quality"]) {
  if (quality === "complete") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (quality === "partial") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  if (quality === "quote_only") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-rose-300/25 bg-rose-300/10 text-rose-100";
}

function snapshotActionabilityClass(level: NonNullable<NonNullable<SelectionPick["runtimeSnapshot"]>["actionability"]>["level"]) {
  if (level === "actionable") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (level === "reference_only") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-rose-300/25 bg-rose-300/10 text-rose-100";
}

function shortRuleVersion(value?: string) {
  if (!value) return "历史版本";
  const match = value.match(/(\d{4}-\d{2}-\d{2})-v(\d+)$/);
  return match ? `${match[1]} v${match[2]}` : value.replace(/^selection-rules-/, "");
}

function formatParameterValue(value: unknown) {
  if (Array.isArray(value)) return value.join(" - ");
  if (typeof value === "boolean") return value ? "开启" : "关闭";
  if (value === null || value === undefined || value === "") return "未设置";
  return String(value);
}

function formatRunStatus(status: SelectionRunRecord["status"]) {
  if (status === "success") return "成功";
  if (status === "running") return "运行中";
  if (status === "failed") return "失败";
  return status;
}

function selectionWarningCategoryLabel(category: string) {
  const labels: Record<string, string> = {
    freshness: "新鲜度",
    data_gap: "数据缺口",
    source_fallback: "数据源降级",
    legacy_compat: "历史兼容",
    model: "模型输出",
    system: "系统任务",
    other: "其他"
  };
  return labels[category] ?? category;
}
