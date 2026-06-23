"use client";

import Link from "next/link";
import { SelectionAgentReview } from "@/components/SelectionAgentReview";
import { SelectionFreshnessNotice, SelectionFreshnessPill } from "@/components/SelectionFreshnessPill";
import { SelectionRunCompactInsight } from "@/components/SelectionRunInsightCards";
import { SelectionSnapshotHint } from "@/components/SelectionSnapshotHint";
import { SelectionStockNameHover } from "@/components/SelectionStockHover";
import { SelectionTrackButton } from "@/components/SelectionTrackButton";
import { cleanDisplayList, cleanDisplayText } from "@/lib/display/text";
import type { SelectionRunRecord, SelectionRunSummary } from "@/lib/selection/types";

export function SelectionRunPanel({ run }: { run: SelectionRunRecord }) {
  const headlineWarning = primarySelectionRunWarning(run.warnings);
  const poolMode = selectionPoolModeLabel(run.parameters.poolMode);
  return (
    <section className="rounded-lg border border-line bg-panel/84 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs tracking-[0.16em] text-info">最近运行</p>
          <h3 className="mt-2 text-lg font-semibold">{safeText(run.strategyName)} / {run.mode === "rule" ? "规则模式" : "Agent 模式"}</h3>
          <p className="mt-2 text-xs leading-5 text-muted">
            来源报告 {run.sourceReportId ?? "--"} / 报告时间 {run.sourceReportCreatedAt ? formatDateTime(run.sourceReportCreatedAt) : "--"} / 候选池 {poolMode} / 候选 {run.candidateCount} / 入选 {run.pickCount} / 开始 {formatDateTime(run.startedAt)}
          </p>
          <div className="mt-2">
            <SelectionFreshnessPill run={run} />
          </div>
        </div>
        <div className="grid gap-2">
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <MiniStat label="状态" value={formatRunStatus(run.status)} />
            <MiniStat label="入选" value={`${run.pickCount}`} />
            <MiniStat label="未入选" value={`${run.rejected.length}`} />
          </div>
          <Link
            className="rounded-lg border border-info/35 bg-info/10 px-3 py-2 text-center text-xs text-info transition hover:border-info/60 hover:bg-info/15"
            href={`/selection/runs/${run.id}`}
          >
            打开完整运行详情
          </Link>
        </div>
      </div>

      {headlineWarning ? (
        <div className="mt-3 rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 text-xs leading-5 text-warn">
          {headlineWarning}
        </div>
      ) : null}

      <SelectionFreshnessNotice run={run} />

      <details className="mt-3 rounded-lg border border-info/20 bg-info/[0.06] px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-info">候选池数据依据</summary>
        <p className="mt-2 text-xs leading-5 text-muted">{safeText(run.dataBasis)}</p>
      </details>

      <SelectionRunCompactInsight run={run} />

      <SelectionAgentReview
        agentReports={run.agentReports}
        finalReview={run.finalReview}
        llmStatus={run.llmStatus}
        llmErrors={run.llmErrors}
        llmMetrics={run.llmMetrics}
      />

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {run.picks.slice(0, 6).map((pick) => (
          <SelectionPickCard key={pick.code} pick={pick} run={run} />
        ))}
      </div>

      {!run.picks.length ? <p className="mt-4 text-sm text-muted">本次运行没有产生符合规则的入选股票。</p> : null}
    </section>
  );
}

export function EmptyStrategyRun({ strategyName }: { strategyName: string }) {
  return (
    <section className="rounded-lg border border-line bg-panel/84 p-5">
      <p className="text-xs tracking-[0.16em] text-info">当前策略运行</p>
      <h3 className="mt-2 text-lg font-semibold">{safeText(strategyName)} / 暂无运行记录</h3>
      <p className="mt-2 text-sm leading-6 text-muted">
        运行该策略后，会持久化参数、来源证据、入选股票、未入选股票和评分解释。
      </p>
    </section>
  );
}

export function SelectionRunHistory({ runs }: { runs: SelectionRunSummary[] }) {
  return (
    <section className="rounded-lg border border-line bg-panel/84 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">最近运行</h3>
        <Link className="text-xs text-info hover:text-cyan-200" href="/selection/runs">
          查看全部
        </Link>
      </div>
      <div className="mt-3 grid gap-2">
        {runs.map((run) => (
          <Link
            key={run.id}
            className="flex flex-col gap-2 rounded-lg border border-line bg-bg/50 px-3 py-2 text-sm transition hover:border-info/35 hover:bg-bg/70 md:flex-row md:items-center md:justify-between"
            href={`/selection/runs/${run.id}`}
          >
            <span className="min-w-0">
              <span className="font-medium">{safeText(run.strategyName)}</span>
              <span className="ml-2 font-mono text-xs text-muted">{run.id.slice(0, 8)}</span>
            </span>
            <span className="text-xs text-muted">
              {formatDateTime(run.startedAt)} / 入选 {run.pickCount} / 候选 {run.candidateCount}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function SelectionPickCard({ pick, run }: { pick: SelectionRunRecord["picks"][number]; run: SelectionRunRecord }) {
  const reasons = cleanDisplayList(pick.reasons);
  const blockers = cleanDisplayList(pick.blockers);
  const evidenceRefs = cleanDisplayList(pick.evidenceRefs);
  return (
    <article className="rounded-lg border border-line bg-bg/50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            <SelectionStockNameHover pick={pick} run={run} />
            <span className="ml-1 font-mono text-xs text-muted">{pick.code}</span>
          </p>
          <p className="mt-1 text-xs text-muted">{safeText(pick.sectorName)} / {safeText(pick.action)}</p>
          <SelectionSnapshotHint pick={pick} compact />
        </div>
        <span className="rounded border border-info/35 bg-info/10 px-2 py-1 font-mono text-sm text-info">
          {pick.tier} {pick.score}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-info" style={{ width: `${Math.max(4, Math.min(100, pick.score))}%` }} />
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">
        {reasons[0] ?? "未记录强理由。"}{blockers[0] ? ` / 阻断：${blockers[0]}` : ""}
      </p>
      <SerenityTagStrip pick={pick} />
      <SelectionTrackButton pick={pick} run={run} compact />
      <details className="mt-3 rounded-lg border border-line bg-panel/55 p-2">
        <summary className="cursor-pointer text-xs text-info">评分因子与证据</summary>
        <div className="mt-2 grid gap-2">
          {pick.scoreFactors.map((factor) => (
            <div key={factor.key} className="rounded border border-line/70 bg-bg/50 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium">{safeText(factor.label)}</span>
                <span className="font-mono text-info">{factor.score}/{factor.maxScore}</span>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-muted">
                {cleanDisplayList(factor.reasons)[0] ?? "未记录评分理由。"}{cleanDisplayList(factor.blockers)[0] ? ` / 扣分：${cleanDisplayList(factor.blockers)[0]}` : ""}
              </p>
            </div>
          ))}
        </div>
        {evidenceRefs.length ? (
          <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-muted">
            证据：{evidenceRefs.slice(0, 6).join(" / ")}
          </p>
        ) : null}
      </details>
    </article>
  );
}

function primarySelectionRunWarning(warnings: string[]) {
  const cleaned = cleanDisplayList(warnings);
  return cleaned.find((warning) => /full.?A|runtime|refresh|candidate pool|source|stale|全.?A|刷新|过期|候选/i.test(warning)) ?? cleaned[0] ?? "";
}

function selectionPoolModeLabel(value: unknown) {
  if (value === "full_a_scan") return "全 A 扫描候选池";
  if (value === "hybrid_full_a") return "混合全 A 候选池";
  if (value === "strategy_adaptive") return "策略自适应候选池";
  if (value === "recent_signals") return "近期信号池";
  if (value === "latest_report") return "最新报告候选池";
  return "未记录";
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg/60 px-3 py-2">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function SerenityTagStrip({ pick }: { pick: SelectionRunRecord["picks"][number] }) {
  const tag = pick.serenityTag;
  if (!tag) return null;
  return (
    <div className="mt-3 rounded-lg border border-lime-300/25 bg-lime-300/[0.07] px-3 py-2 text-xs text-lime-100">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">瓶颈研究</span>
        <span className="rounded border border-lime-300/30 px-1.5 py-0.5 text-[10px]">{safeText(tag.theme)}</span>
        <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">{serenityPriorityLabel(tag.priority)}</span>
        <span className="font-mono text-[11px] text-lime-200">{tag.score.toFixed(0)}</span>
      </div>
      <p className="mt-1 line-clamp-2 leading-5 text-slate-300">
        {safeText(tag.chainPosition)} / {serenityEvidenceLabel(tag.evidenceStrength)}: {safeText(tag.verdict)}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-lime-100/75">
        该标签用于提高产业链理解优先级，不会覆盖选股买入规则。
      </p>
    </div>
  );
}

function serenityPriorityLabel(value: NonNullable<SelectionRunRecord["picks"][number]["serenityTag"]>["priority"]) {
  if (value === "top") return "核心瓶颈";
  if (value === "high") return "高优先级";
  if (value === "watch") return "观察";
  return "低优先级";
}

function serenityEvidenceLabel(value: NonNullable<SelectionRunRecord["picks"][number]["serenityTag"]>["evidenceStrength"]) {
  if (value === "strong") return "强证据";
  if (value === "medium") return "中等证据";
  if (value === "weak") return "弱证据";
  return "待核验";
}

function formatRunStatus(status: SelectionRunRecord["status"]) {
  if (status === "success") return "成功";
  if (status === "running") return "运行中";
  if (status === "failed") return "失败";
  return status;
}

function safeText(value?: string | null) {
  return cleanDisplayText(value) ?? value ?? "";
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
