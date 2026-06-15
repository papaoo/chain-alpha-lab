"use client";

import Link from "next/link";
import { BellPlus } from "lucide-react";
import { SelectionAgentReview } from "@/components/SelectionAgentReview";
import { SelectionRunCompactInsight } from "@/components/SelectionRunInsightCards";
import { SelectionStockNameHover } from "@/components/SelectionStockHover";
import type { SelectionRunRecord, SelectionRunSummary } from "@/lib/selection/types";

export function SelectionRunPanel({ run }: { run: SelectionRunRecord }) {
  const headlineWarning = primarySelectionRunWarning(run.warnings);
  const poolMode = selectionPoolModeLabel(run.parameters.poolMode);
  return (
    <div className="rounded-lg border border-line bg-panel/84 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs tracking-[0.16em] text-info">LATEST RUN</p>
          <h3 className="mt-2 text-lg font-semibold">{run.strategyName} / {run.mode === "rule" ? "规则模式" : "Agent模式"}</h3>
          <p className="mt-2 text-xs leading-5 text-muted">
            来源报告 {run.sourceReportId ?? "无"}；报告时间 {run.sourceReportCreatedAt ? formatDateTime(run.sourceReportCreatedAt) : "未记录"}；候选来源 {poolMode}；候选 {run.candidateCount} 只；精选 {run.pickCount} 只；运行 {formatDateTime(run.startedAt)}
          </p>
        </div>
        <div className="grid gap-2">
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <MiniStat label="状态" value={run.status === "success" ? "成功" : run.status} />
            <MiniStat label="精选" value={`${run.pickCount}`} />
            <MiniStat label="未入选" value={`${run.rejected.length}`} />
          </div>
          <Link
            className="rounded-lg border border-info/35 bg-info/10 px-3 py-2 text-center text-xs text-info transition hover:border-info/60 hover:bg-info/15"
            href={`/selection/runs/${run.id}`}
          >
            查看完整留痕详情
          </Link>
        </div>
      </div>
      {headlineWarning ? (
        <div className="mt-3 rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 text-xs leading-5 text-warn">
          {headlineWarning}
        </div>
      ) : null}
      <details className="mt-3 rounded-lg border border-info/20 bg-info/[0.06] px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-info">候选池来源质量</summary>
        <p className="mt-2 text-xs leading-5 text-muted">{run.dataBasis}</p>
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
          <div key={pick.code} className="rounded-lg border border-line bg-bg/50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  <SelectionStockNameHover pick={pick} />
                  <span className="ml-1 font-mono text-xs text-muted">{pick.code}</span>
                </p>
                <p className="mt-1 text-xs text-muted">{pick.sectorName} / {pick.action}</p>
              </div>
              <span className="rounded border border-info/35 bg-info/10 px-2 py-1 font-mono text-sm text-info">
                {pick.tier} {pick.score}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-info" style={{ width: `${Math.max(4, Math.min(100, pick.score))}%` }} />
            </div>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">
              {pick.reasons[0] ?? "暂无强理由"}{pick.blockers[0] ? `；限制：${pick.blockers[0]}` : ""}
            </p>
            <button
              type="button"
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-panel/50 px-3 py-2 text-xs text-muted opacity-70"
              disabled
              title="个股追踪与模拟持仓模块开发后开放"
            >
              <BellPlus size={14} />
              加入追踪 / 模拟持仓（规划中）
            </button>
            <details className="mt-3 rounded-lg border border-line bg-panel/55 p-2">
              <summary className="cursor-pointer text-xs text-info">评分因子与证据</summary>
              <div className="mt-2 grid gap-2">
                {pick.scoreFactors.map((factor) => (
                  <div key={factor.key} className="rounded border border-line/70 bg-bg/50 px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium">{factor.label}</span>
                      <span className="font-mono text-info">{factor.score}/{factor.maxScore}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-4 text-muted">
                      {factor.reasons[0] ?? "暂无加分说明"}{factor.blockers[0] ? `；扣分：${factor.blockers[0]}` : ""}
                    </p>
                  </div>
                ))}
              </div>
              {pick.evidenceRefs.length ? (
                <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-muted">
                  证据：{pick.evidenceRefs.slice(0, 6).join("、")}
                </p>
              ) : null}
            </details>
          </div>
        ))}
      </div>
      {!run.picks.length ? <p className="mt-4 text-sm text-muted">本次没有符合规则模式的精选股票。</p> : null}
    </div>
  );
}

export function EmptyStrategyRun({ strategyName }: { strategyName: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel/84 p-5">
      <p className="text-xs tracking-[0.16em] text-info">CURRENT STRATEGY RUN</p>
      <h3 className="mt-2 text-lg font-semibold">{strategyName} / 暂无运行记录</h3>
      <p className="mt-2 text-sm leading-6 text-muted">
        当前策略还没有可展示的规则运行结果。点击上方“运行规则选股”后，系统会保存本次参数、数据依据、精选名单和未入选原因。
      </p>
    </div>
  );
}

export function SelectionRunHistory({ runs }: { runs: SelectionRunSummary[] }) {
  return (
    <div className="rounded-lg border border-line bg-panel/84 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">最近运行记录</h3>
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
              <span className="font-medium">{run.strategyName}</span>
              <span className="ml-2 font-mono text-xs text-muted">{run.id.slice(0, 8)}</span>
            </span>
            <span className="text-xs text-muted">
              {formatDateTime(run.startedAt)} / 精选 {run.pickCount} / 候选 {run.candidateCount}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function primarySelectionRunWarning(warnings: string[]) {
  return warnings.find((warning) => /全 A 扫描|最新盘口|仅使用已刷新前排/.test(warning)) ?? warnings[0] ?? "";
}

function selectionPoolModeLabel(value: unknown) {
  if (value === "full_a_scan") return "全 A 扫描池";
  if (value === "hybrid_full_a") return "混合全 A 池";
  if (value === "strategy_adaptive") return "策略自适应沉淀池";
  if (value === "recent_signals") return "最近信号沉淀池";
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

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
