"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, ClipboardList, Loader2, RefreshCcw, Route, UserRoundSearch } from "lucide-react";
import { BasicStockNameHover } from "@/components/SelectionStockHover";
import { fetchApiJson } from "@/lib/client/api";
import { cleanDisplayList, cleanDisplayText } from "@/lib/display/text";
import type { SerenityEvidenceTask, SerenityEvidenceTaskList } from "@/lib/serenity/evidenceTasks";
import type { SerenityEvidenceExecutionGroup, SerenityEvidenceExecutionPlan, SerenityEvidenceExecutionSupport } from "@/lib/serenity/evidencePlan";

type Props = {
  runId?: string;
};

export function SerenityEvidenceTaskPanel({ runId }: Props) {
  const [data, setData] = useState<SerenityEvidenceTaskList | null>(null);
  const [plan, setPlan] = useState<SerenityEvidenceExecutionPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const urls = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", runId ? "1" : "3");
    if (runId) params.set("runId", runId);
    const query = params.toString();
    return {
      tasks: `/api/serenity/evidence-tasks?${query}`,
      plan: `/api/serenity/evidence-plan?${query}`
    };
  }, [runId]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [taskJson, planJson] = await Promise.all([
        fetchApiJson<SerenityEvidenceTaskList>(urls.tasks, { cache: "no-store" }),
        fetchApiJson<SerenityEvidenceExecutionPlan>(urls.plan, { cache: "no-store" })
      ]);
      setData(taskJson.data);
      setPlan(planJson.data);
    } catch (err) {
      setError(cleanDisplayText(err instanceof Error ? err.message : String(err)) ?? "证据任务读取失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [urls]);

  const tasks = data?.tasks.slice(0, 8) ?? [];
  const summary = data?.summary;
  const planSummary = plan?.summary;
  const groups = plan?.groups.slice(0, 4) ?? [];

  return (
    <div className="rounded-2xl border border-amber-300/20 bg-slate-950/72 p-4">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/25 bg-amber-300/10 text-amber-100">
            <ClipboardList size={18} />
          </div>
          <div>
            <p className="font-medium text-slate-100">证据补强队列</p>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
              这里不是买卖建议，而是 Serenity 瓶颈研究的下一步核验清单。优先补公告、财报、客户、订单、产能、认证这些硬证据，行情和资金只当弱线索。
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-amber-300/40 hover:text-amber-100 disabled:opacity-60"
        >
          {loading ? <Loader2 className="animate-spin" size={14} /> : <RefreshCcw size={14} />}
          刷新任务
        </button>
      </div>

      {summary ? (
        <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="待补任务" value={summary.taskCount} tone="amber" />
          <Metric label="高优先级" value={summary.highPriorityCount} tone="rose" />
          <Metric label="可自动补" value={summary.automatableCount} tone="cyan" />
          <Metric label="需人工/Agent" value={summary.manualCount} tone="violet" />
          <Metric label="先补硬证据" value={summary.needsHardEvidenceCount} tone="amber" />
        </div>
      ) : null}

      {planSummary ? (
        <div className="mb-4 rounded-xl border border-cyan-300/18 bg-cyan-300/[0.055] p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Route size={15} className="text-cyan-100" />
                <p className="text-sm font-medium text-slate-100">自动补证能力预览</p>
              </div>
              <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-400">{cleanDisplayText(planSummary.text) ?? planSummary.text}</p>
            </div>
            <span className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs ${supportTone(planSummary.readyCount + planSummary.partialCount ? "partial" : "manual")}`}>
              {cleanDisplayText(planSummary.label) ?? planSummary.label}
            </span>
          </div>
          {groups.length ? (
            <div className="mt-3 grid gap-2 xl:grid-cols-2">
              {groups.map((group) => <ExecutionGroupCard key={group.id} group={group} />)}
            </div>
          ) : null}
          {plan.warnings.length ? (
            <div className="mt-3 grid gap-1.5">
              {plan.warnings.slice(0, 3).map((warning) => (
                <p key={warning} className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-2 py-1.5 text-[11px] leading-5 text-amber-100">
                  {warning}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="mb-3 rounded-xl border border-rose-300/25 bg-rose-300/10 px-3 py-2 text-xs leading-5 text-rose-100">
          {error}
        </div>
      ) : null}

      {tasks.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {tasks.map((task) => (
            <EvidenceTaskCard key={task.id} task={task} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/55 px-3 py-4 text-sm text-slate-400">
          {loading ? "正在读取证据任务..." : "暂无待补证据任务。"}
        </div>
      )}
    </div>
  );
}

function ExecutionGroupCard({ group }: { group: SerenityEvidenceExecutionGroup }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/42 p-3 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-slate-100">{group.label}</p>
          <p className="mt-1 text-slate-500">{group.sourceLabel} / {group.expectedHardnessLabel}</p>
        </div>
        <span className={`shrink-0 rounded border px-2 py-1 text-[11px] ${supportTone(group.support)}`}>{group.supportLabel}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <Mini label="任务" value={`${group.taskCount}`} />
        <Mini label="高优先" value={`${group.highPriorityCount}`} />
        <Mini label="候选" value={`${group.candidateCount}`} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {group.scopeLabels.slice(0, 4).map((label) => (
          <span key={label} className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-[11px] text-slate-300">
            {label}
          </span>
        ))}
      </div>
      <p className="mt-3 line-clamp-2 text-[11px] leading-5 text-slate-400">{group.nextAction}</p>
      {group.limitations.length ? (
        <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-amber-100/90">边界：{group.limitations[0]}</p>
      ) : null}
    </div>
  );
}

function EvidenceTaskCard({ task }: { task: SerenityEvidenceTask }) {
  const paths = cleanDisplayList(task.sourcePaths);
  const missing = cleanDisplayList(task.missingProof);
  const checks = cleanDisplayList(task.nextResearchChecks);

  return (
    <div className={`rounded-xl border p-3 ${taskTone(task)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <BasicStockNameHover
              className="font-medium text-slate-100"
              stock={{
                code: task.code,
                name: cleanDisplayText(task.name) ?? task.name,
                score: task.score,
                note: `${cleanDisplayText(task.needLabel) ?? task.needLabel}：${cleanDisplayText(task.actionLabel) ?? task.actionLabel}`
              }}
            />
            <span className={`rounded border px-1.5 py-0.5 text-[10px] ${priorityTone(task.taskPriority)}`}>
              {priorityLabel(task.taskPriority)}
            </span>
            <span className="rounded border border-slate-700 bg-slate-950/35 px-1.5 py-0.5 text-[10px] text-slate-400">
              {cleanDisplayText(task.theme) ?? task.theme}
            </span>
          </div>
          <p className="mt-2 text-sm font-medium text-slate-100">{cleanDisplayText(task.actionLabel) ?? task.actionLabel}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{cleanDisplayText(task.reason) ?? task.reason}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] ${task.canAutomate ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100" : "border-violet-300/25 bg-violet-300/10 text-violet-100"}`}>
            {task.canAutomate ? <Bot size={12} /> : <UserRoundSearch size={12} />}
            {recommendedToolLabel(task.recommendedTool)}
          </span>
          <span className="font-mono text-[11px] text-slate-500">可信度 {task.confidencePct}%</span>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Mini label="硬证据" value={`${task.hardEvidenceCount}`} />
        <Mini label="已验证" value={`${task.verifiedHardEvidenceCount}`} />
        <Mini label="研究边界" value={cleanDisplayText(task.boundaryLabel) ?? task.boundaryLabel} />
      </div>

      {paths.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {paths.slice(0, 4).map((path) => (
            <span key={path} className="rounded-md border border-slate-700 bg-slate-950/35 px-2 py-1 text-[11px] text-slate-300">
              {path}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/35 px-2 py-2 text-[11px] leading-5 text-slate-300">
        <span className="font-medium text-slate-100">补证方式：</span>
        {cleanDisplayText(task.verificationMethod) ?? task.verificationMethod}
      </div>

      {missing.length || checks.length ? (
        <details className="mt-3 rounded-lg border border-slate-800 bg-slate-950/35 p-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-200">展开缺口与核验动作</summary>
          <div className="mt-2 grid gap-2 text-xs leading-5 text-slate-300">
            {missing.slice(0, 4).map((item) => <p key={`m-${item}`}>缺口：{item}</p>)}
            {checks.slice(0, 4).map((item) => <p key={`c-${item}`}>核验：{item}</p>)}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "amber" | "rose" | "cyan" | "violet" }) {
  return (
    <div className={`rounded-xl border bg-slate-900/55 px-3 py-2 ${metricTone(tone)}`}>
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold text-slate-50">{value}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/35 px-2 py-1.5">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="mt-1 line-clamp-1 text-xs text-slate-200">{value}</p>
    </div>
  );
}

function taskTone(task: SerenityEvidenceTask) {
  if (task.taskPriority === "high" && task.boundaryLevel === "needs_hard_evidence") return "border-amber-300/25 bg-amber-300/[0.07]";
  if (task.taskPriority === "high") return "border-rose-300/25 bg-rose-300/[0.07]";
  if (task.taskPriority === "medium") return "border-cyan-300/20 bg-cyan-300/[0.06]";
  return "border-slate-800 bg-slate-900/55";
}

function priorityTone(priority: SerenityEvidenceTask["taskPriority"]) {
  if (priority === "high") return "border-rose-300/25 bg-rose-300/10 text-rose-100";
  if (priority === "medium") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  return "border-slate-700 bg-slate-950/35 text-slate-300";
}

function priorityLabel(priority: SerenityEvidenceTask["taskPriority"]) {
  if (priority === "high") return "高优先级";
  if (priority === "medium") return "中优先级";
  return "低优先级";
}

function recommendedToolLabel(tool: SerenityEvidenceTask["recommendedTool"]) {
  if (tool === "tushare") return "Tushare/公告";
  if (tool === "eastmoney") return "东方财富行情";
  if (tool === "web") return "公开网页";
  if (tool === "mixed") return "混合补证";
  return "人工核验";
}

function metricTone(tone: "amber" | "rose" | "cyan" | "violet") {
  if (tone === "rose") return "border-rose-300/20";
  if (tone === "cyan") return "border-cyan-300/20";
  if (tone === "violet") return "border-violet-300/20";
  return "border-amber-300/20";
}

function supportTone(support: SerenityEvidenceExecutionSupport) {
  if (support === "ready") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (support === "partial") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  if (support === "planned") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-violet-300/25 bg-violet-300/10 text-violet-100";
}
