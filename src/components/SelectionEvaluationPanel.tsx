"use client";

import { useEffect, useState } from "react";
import { Activity, Info, RefreshCw } from "lucide-react";
import { BasicStockNameHover } from "@/components/SelectionStockHover";
import { fetchApiJson } from "@/lib/client/api";
import { cleanDisplayText } from "@/lib/display/text";
import type { SelectionEvaluationSnapshot, SelectionPickEvaluation, SelectionStrategyEvaluation } from "@/lib/selection/evaluation";

type Tone = SelectionEvaluationSnapshot["summary"]["tone"];

export function SelectionEvaluationPanel() {
  const [data, setData] = useState<SelectionEvaluationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadEvaluation();
  }, []);

  async function loadEvaluation() {
    setLoading(true);
    setError("");
    try {
      const json = await fetchApiJson<SelectionEvaluationSnapshot>(`/api/selection/evaluation?limit=6&maxPicksPerRun=3&_t=${Date.now()}`, {
        cache: "no-store"
      });
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const summary = data?.summary;
  const topPicks = data?.runs.flatMap((run) => run.picks).slice(0, 8) ?? [];
  const untrackedCount = Math.max(0, (data?.evaluatedPickCount ?? 0) - (summary?.trackedPickCount ?? 0));

  return (
    <section className={`rounded-lg border p-4 ${toneClass(summary?.tone ?? "muted")}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity size={16} />
            <p className="text-xs tracking-[0.16em] opacity-80">策略后验评估</p>
          </div>
          <h3 className="mt-2 text-lg font-semibold">{summary?.label ?? (loading ? "正在读取后验样本" : "暂无后验样本")}</h3>
          <p className="mt-2 max-w-4xl text-sm leading-6 opacity-85">
            {summary?.summary ?? "系统会用最近选股运行、当前统一行情快照和追踪池，评估候选后续表现；这个模块不调用大模型，也不生成买卖建议。"}
          </p>
          {summary?.nextAction ? <p className="mt-2 text-xs leading-5 opacity-80">下一步：{summary.nextAction}</p> : null}
          {error ? <p className="mt-2 rounded border border-rose-300/25 bg-rose-300/10 px-2 py-1.5 text-xs text-rose-100">{cleanDisplayText(error) ?? error}</p> : null}
        </div>
        <button
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-current/25 bg-slate-950/20 px-3 py-2 text-xs transition hover:bg-slate-950/35 disabled:opacity-60"
          type="button"
          onClick={loadEvaluation}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          刷新评估
        </button>
      </div>

      <div className="mt-4 grid gap-2 text-center text-xs sm:grid-cols-2 xl:grid-cols-6">
        <MiniStat label="样本" value={`${data?.evaluatedPickCount ?? 0}`} />
        <MiniStat label="平均变化" value={formatSignedPct(summary?.avgReturnPct)} />
        <MiniStat label="上涨/下跌" value={`${summary?.positiveCount ?? 0}/${summary?.negativeCount ?? 0}`} />
        <MiniStat label="追踪覆盖" value={`${formatPct(summary?.trackingCoveragePct)} / 精确 ${summary?.exactTrackedPickCount ?? 0}`} />
        <MiniStat label="研究参考" value={`${summary?.referenceOnlyCount ?? 0}`} />
        <MiniStat label="报价时间" value={formatShortTime(summary?.latestQuoteUpdatedAt)} />
      </div>

      {summary ? (
        <div className="mt-3 grid gap-2 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-lg border border-current/12 bg-slate-950/22 p-3 text-xs leading-5">
            <div className="mb-2 flex items-center gap-2 font-medium opacity-90">
              <Info size={14} />
              追踪口径说明
            </div>
            <p className="opacity-78">
              精确追踪表示这只股票是从对应选股运行加入观察池；同股追踪表示追踪池里已有同代码股票，但无法确认来自这次运行。旧记录没有运行来源时会归为同股追踪，不会被强行回填成精确样本。
            </p>
          </div>
          <div className="rounded-lg border border-current/12 bg-slate-950/22 p-3 text-xs leading-5">
            <p className="font-medium opacity-90">样本覆盖</p>
            <p className="mt-1 opacity-78">
              精确 {summary.exactTrackedPickCount} 个，同股 {summary.sameStockTrackedPickCount} 个，未追踪 {untrackedCount} 个。
              {untrackedCount > 0 ? " 高分且证据完整的未追踪样本，适合手动加入观察池形成后验闭环。" : " 当前样本已全部进入追踪视野。"}
            </p>
          </div>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="mt-3 h-20 animate-pulse rounded-lg border border-current/10 bg-slate-950/20" />
      ) : null}

      {data?.strategies.length ? (
        <details className="mt-3 rounded-lg border border-current/15 bg-slate-950/20 p-3" open>
          <summary className="cursor-pointer text-sm font-medium opacity-90">按策略拆分后验</summary>
          <div className="mt-3 grid gap-2 xl:grid-cols-3">
            {data.strategies.map((strategy) => (
              <StrategyEvaluationCard key={strategy.strategyId} strategy={strategy} />
            ))}
          </div>
        </details>
      ) : null}

      {topPicks.length ? (
        <details className="mt-3 rounded-lg border border-current/15 bg-slate-950/20 p-3">
          <summary className="cursor-pointer text-sm font-medium opacity-90">查看样本明细</summary>
          <div className="mt-3 grid gap-2 xl:grid-cols-2">
            {topPicks.map((pick) => (
              <PickEvaluationRow key={`${pick.runId}-${pick.code}`} pick={pick} />
            ))}
          </div>
        </details>
      ) : null}

      {data?.warnings.length ? (
        <div className="mt-3 grid gap-1.5">
          {data.warnings.slice(0, 3).map((warning, index) => (
            <p key={`${warning}-${index}`} className="rounded border border-amber-300/20 bg-amber-300/10 px-2 py-1.5 text-xs text-amber-100">
              {warning}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function StrategyEvaluationCard({ strategy }: { strategy: SelectionStrategyEvaluation }) {
  return (
    <article className={`rounded-lg border p-3 text-xs ${compactToneClass(strategy.tone)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{cleanDisplayText(strategy.strategyName) ?? strategy.strategyName}</p>
          <p className="mt-1 opacity-75">{strategy.label} / {strategy.trendLabel} / 最近 {strategy.runCount} 次</p>
        </div>
        <span className="rounded border border-current/20 px-2 py-1 font-mono">{formatSignedPct(strategy.avgReturnPct)}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        <MiniStat label="样本" value={`${strategy.evaluatedPickCount}`} />
        <MiniStat label="命中" value={formatPct(strategy.hitRatePct)} />
        <MiniStat label="追踪" value={`${strategy.exactTrackedPickCount}/${strategy.sameStockTrackedPickCount}`} />
      </div>
      {strategy.recentRuns.length ? (
        <div className="mt-3 flex items-end gap-1" title="最近运行后验变化">
          {strategy.recentRuns.slice().reverse().map((run) => (
            <span
              key={run.runId}
              className={`h-5 flex-1 rounded-sm ${runBarClass(run.tone)}`}
              style={{ opacity: run.avgReturnPct === undefined ? 0.35 : Math.min(1, Math.max(0.45, Math.abs(run.avgReturnPct) / 12 + 0.45)) }}
              aria-label={`${run.label} ${formatSignedPct(run.avgReturnPct)}`}
            />
          ))}
        </div>
      ) : null}
      <p className="mt-2 leading-5 opacity-80">{strategy.summary}</p>
    </article>
  );
}

function PickEvaluationRow({ pick }: { pick: SelectionPickEvaluation }) {
  return (
    <article className="rounded-lg border border-current/15 bg-slate-950/22 p-3 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-slate-100">
            <BasicStockNameHover
              className="hover:text-cyan-200"
              stock={{
                code: pick.code,
                name: pick.name,
                latest: pick.currentPrice,
                changePct: pick.returnPct,
                score: pick.score,
                note: `${pick.strategyName} / ${pick.tier} / 后验 ${formatSignedPct(pick.returnPct)}`
              }}
            />
            <span className="ml-1 font-mono text-[11px] text-slate-500">{pick.code}</span>
          </p>
          <p className="mt-1 text-slate-400">{pick.strategyName} / {pick.tier}{pick.score} / {pick.action}</p>
        </div>
        <span className={`rounded border px-2 py-1 font-mono ${pickToneClass(pick.tone)}`}>{formatSignedPct(pick.returnPct)}</span>
      </div>
      <p className="mt-2 leading-5 text-slate-300">{pick.summary}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Tag>{verdictLabel(pick.verdict)}</Tag>
        <Tag>{trackingMatchLabel(pick)}</Tag>
        <Tag>{actionabilityLabel(pick.currentActionabilityLevel ?? pick.runActionabilityLevel)}</Tag>
        <Tag>{formatShortTime(pick.quoteUpdatedAt)}</Tag>
      </div>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-current/12 bg-slate-950/22 px-3 py-2">
      <p className="text-[11px] opacity-65">{label}</p>
      <p className="mt-1 font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded border border-slate-700 bg-slate-950/40 px-1.5 py-0.5 text-[11px] text-slate-300">{children}</span>;
}

function toneClass(tone: Tone) {
  if (tone === "positive") return "border-emerald-300/25 bg-emerald-300/[0.07] text-emerald-100";
  if (tone === "warning") return "border-amber-300/25 bg-amber-300/[0.08] text-amber-100";
  if (tone === "risk") return "border-rose-300/25 bg-rose-300/[0.07] text-rose-100";
  if (tone === "neutral") return "border-cyan-300/25 bg-cyan-300/[0.06] text-cyan-100";
  return "border-slate-800 bg-slate-950/62 text-slate-300";
}

function pickToneClass(tone: SelectionPickEvaluation["tone"]) {
  if (tone === "positive") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (tone === "warning") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (tone === "risk") return "border-rose-300/25 bg-rose-300/10 text-rose-100";
  return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
}

function compactToneClass(tone: Tone) {
  if (tone === "positive") return "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100";
  if (tone === "warning") return "border-amber-300/20 bg-amber-300/[0.07] text-amber-100";
  if (tone === "risk") return "border-rose-300/20 bg-rose-300/[0.06] text-rose-100";
  if (tone === "neutral") return "border-cyan-300/20 bg-cyan-300/[0.05] text-cyan-100";
  return "border-slate-800 bg-slate-950/40 text-slate-300";
}

function runBarClass(tone: Tone) {
  if (tone === "positive") return "bg-emerald-300";
  if (tone === "warning") return "bg-amber-300";
  if (tone === "risk") return "bg-rose-300";
  if (tone === "neutral") return "bg-cyan-300";
  return "bg-slate-600";
}

function verdictLabel(value: SelectionPickEvaluation["verdict"]) {
  if (value === "validated") return "后验较强";
  if (value === "weakened") return "后验转弱";
  if (value === "research_only") return "研究参考";
  if (value === "data_insufficient") return "数据不足";
  return "继续观察";
}

function trackingMatchLabel(pick: SelectionPickEvaluation) {
  if (pick.trackingMatchType === "exact_run") return "精确追踪";
  if (pick.trackingMatchType === "same_stock") return "同股追踪";
  return "未追踪";
}

function actionabilityLabel(value?: SelectionPickEvaluation["currentActionabilityLevel"] | SelectionPickEvaluation["runActionabilityLevel"]) {
  if (value === "actionable") return "可行动";
  if (value === "reference_only") return "仅参考";
  if (value === "not_actionable") return "不可行动";
  return "待确认";
}

function formatSignedPct(value?: number) {
  if (value === undefined) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatPct(value?: number) {
  if (value === undefined) return "--";
  return `${value.toFixed(0)}%`;
}

function formatShortTime(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}
