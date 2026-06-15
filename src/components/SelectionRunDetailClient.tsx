"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BellPlus, Filter, Search, X } from "lucide-react";
import { SelectionAgentReview } from "@/components/SelectionAgentReview";
import { SelectionRunInsightCards } from "@/components/SelectionRunInsightCards";
import { SelectionStockNameHover } from "@/components/SelectionStockHover";
import { buildSelectionPickDecisionPlan, isSelectionRejected, normalizeSelectionAction } from "@/lib/selection/insights";
import type { SelectionPick, SelectionRunRecord } from "@/lib/selection/types";

type PickTone = "cyan" | "amber" | "rose";
type TierFilter = "all" | SelectionPick["tier"];
type ActionFilter = "all" | SelectionPick["action"];

export function SelectionRunDetailClient({ run }: { run: SelectionRunRecord }) {
  const [keyword, setKeyword] = useState("");
  const [tier, setTier] = useState<TierFilter>("all");
  const [action, setAction] = useState<ActionFilter>("all");
  const [sector, setSector] = useState("all");

  const allPicks = useMemo(() => [...run.picks, ...run.rejected], [run.picks, run.rejected]);
  const sectors = useMemo(() => Array.from(new Set(allPicks.map((pick) => pick.sectorName).filter(Boolean))).sort(), [allPicks]);
  const filtered = useMemo(
    () => filterPicks(allPicks, { keyword, tier, action, sector }),
    [allPicks, keyword, tier, action, sector]
  );
  const picked = filtered.filter((pick) => run.picks.some((item) => item.code === pick.code));
  const waiting = filtered.filter((pick) => !run.picks.some((item) => item.code === pick.code) && !isSelectionRejected(pick.action));
  const removed = filtered.filter((pick) => isSelectionRejected(pick.action));
  const hasFilter = keyword || tier !== "all" || action !== "all" || sector !== "all";
  const headlineWarning = primarySelectionRunWarning(run.warnings);
  const poolMode = selectionPoolModeLabel(run.parameters.poolMode);

  return (
    <main className="min-h-[100dvh] bg-[#070b10] px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1500px] gap-4">
        <header className="rounded-lg border border-slate-800 bg-slate-950/62 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Link className="text-sm text-cyan-300 hover:text-cyan-200" href="/mainline?view=selection">
                返回策略选股
              </Link>
              <p className="mt-4 text-xs tracking-[0.18em] text-cyan-200">SELECTION RUN DETAIL</p>
              <h1 className="mt-2 text-3xl font-semibold">{run.strategyName} 运行详情</h1>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {formatDateTime(run.startedAt)} / {run.mode === "rule" ? "规则模式" : "Agent模式"} / 耗时 {formatDuration(run.startedAt, run.finishedAt)} / 来源报告 {run.sourceReportId ?? "无"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded border border-cyan-300/25 bg-cyan-300/10 px-2 py-1 text-cyan-100">
                  规则版本：{run.ruleVersionLabel ?? run.ruleVersion ?? "历史版本未记录"}
                </span>
                <span className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-slate-300">
                  运行口径：{run.mode === "rule" ? "纯规则筛选，不调用大模型" : "Agent 复核"}
                </span>
                <span className="rounded border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-emerald-100">
                  候选来源：{poolMode}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <MiniStat label="候选" value={`${run.candidateCount}`} />
              <MiniStat label="精选" value={`${run.pickCount}`} />
              <MiniStat label="未入选" value={`${run.rejected.length}`} />
            </div>
          </div>
        </header>

        <SelectionRunInsightCards run={run} />
        <SelectionAgentReview
          agentReports={run.agentReports}
          finalReview={run.finalReview}
          llmStatus={run.llmStatus}
          llmErrors={run.llmErrors}
          llmMetrics={run.llmMetrics}
        />

        <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] p-4">
            <p className="text-xs tracking-[0.16em] text-cyan-200">DATA BASIS</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{run.dataBasis}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/62 p-4">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <MiniStat label="状态" value={run.status === "success" ? "成功" : run.status} />
              <MiniStat label="候选来源" value={poolMode} />
              <MiniStat label="规则版本" value={shortRuleVersion(run.ruleVersion)} />
              <MiniStat label="调用模型" value={run.mode === "rule" ? "否" : "是"} />
            </div>
            {headlineWarning ? (
              <p className="mt-3 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-100">
                {headlineWarning}
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
          hasFilter={Boolean(hasFilter)}
        />

        <details className="rounded-lg border border-slate-800 bg-slate-950/56 p-4">
          <summary className="cursor-pointer text-sm font-medium text-cyan-200">运行参数与数据状态留痕</summary>
          <ParameterGrid parameters={run.parameters} warnings={run.warnings} />
        </details>

        <div className="grid items-start gap-4 xl:grid-cols-3">
          <PickColumn title="精选观察" subtitle="进入本次策略输出前排" picks={picked} tone="cyan" />
          <PickColumn title="条件等待" subtitle="有部分证据，但需要刷新或触发条件" picks={waiting} tone="amber" />
          <PickColumn title="剔除 / 回避" subtitle="阻断条件较多，不进入本次候选" picks={removed} tone="rose" />
        </div>
      </div>
    </main>
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
            <h2 className="font-semibold">复盘筛选</h2>
            <p className="mt-1 text-xs text-slate-500">当前显示 {resultCount}/{totalCount} 只</p>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-[1.4fr_0.8fr_0.8fr_1fr_auto]">
          <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm">
            <Search size={15} className="text-slate-500" />
            <input
              className="min-w-0 flex-1 bg-transparent text-slate-100 outline-none placeholder:text-slate-600"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜股票、代码、理由、阻断"
            />
          </label>
          <select className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none" value={tier} onChange={(event) => setTier(event.target.value as TierFilter)}>
            <option value="all">全部评级</option>
            {["S", "A", "B", "C", "D"].map((item) => <option key={item} value={item}>{item}级</option>)}
          </select>
          <select className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none" value={action} onChange={(event) => setAction(event.target.value as ActionFilter)}>
            <option value="all">全部动作</option>
            {["重点观察", "跟踪观察", "条件等待", "剔除"].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none" value={sector} onChange={(event) => setSector(event.target.value)}>
            <option value="all">全部板块</option>
            {sectors.map((item) => <option key={item} value={item}>{item}</option>)}
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
  tone
}: {
  title: string;
  subtitle: string;
  picks: SelectionPick[];
  tone: PickTone;
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
          <PickCard key={pick.code} pick={pick} tone={tone} />
        ))}
      </div>
      {picks.length > 30 ? <p className="mt-3 text-center text-xs text-slate-500">仅显示前 30 只，请用筛选缩小范围。</p> : null}
      {!picks.length ? <p className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-500">暂无</p> : null}
    </section>
  );
}

function PickCard({ pick, tone }: { pick: SelectionPick; tone: PickTone }) {
  const bar =
    tone === "cyan" ? "bg-cyan-300" : tone === "amber" ? "bg-amber-300" : "bg-rose-300";
  const decisionPlan = buildSelectionPickDecisionPlan(pick);
  return (
    <article className="rounded-lg border border-slate-800 bg-slate-950/66 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-medium">
            <SelectionStockNameHover pick={pick} />
          </h3>
          <p className="mt-1 font-mono text-xs text-slate-500">{pick.code} / {pick.sectorName}</p>
          <p className="mt-1 text-xs text-slate-500">
            {pick.price !== undefined ? `价格 ${pick.price.toFixed(2)}` : "价格缺失"}
            {pick.changePct !== undefined ? ` / 涨跌 ${pick.changePct.toFixed(2)}%` : ""}
          </p>
        </div>
        <span className="rounded border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 font-mono text-sm text-cyan-200">
          {pick.tier} {pick.score}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.max(4, Math.min(100, pick.score))}%` }} />
      </div>
      <EvidenceCoverageBar pick={pick} />
      <p className="mt-3 text-xs leading-5 text-slate-400">
        {pick.reasons[0] ?? "暂无加分理由"}{pick.blockers[0] ? `；限制：${pick.blockers[0]}` : ""}
      </p>
      <DecisionPlanCard plan={decisionPlan} />
      <button
        type="button"
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs text-slate-500 opacity-75"
        disabled
        title="个股追踪与模拟持仓模块开发后开放"
      >
        <BellPlus size={14} />
        加入追踪 / 模拟持仓（规划中）
      </button>
      <details className="mt-3 rounded-lg border border-slate-800 bg-slate-900/52 p-2">
        <summary className="cursor-pointer text-xs text-cyan-200">评分因子与证据</summary>
        <div className="mt-2 grid gap-2">
          {pick.scoreFactors.map((factor) => (
            <div key={factor.key} className="rounded border border-slate-800 bg-slate-950/50 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span>{factor.label}</span>
                <span className="font-mono text-cyan-200">{factor.score}/{factor.maxScore}</span>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                {factor.reasons[0] ?? "无加分说明"}{factor.blockers[0] ? `；扣分：${factor.blockers[0]}` : ""}
              </p>
            </div>
          ))}
        </div>
        {pick.evidenceRefs.length ? (
          <div className="mt-2 rounded border border-slate-800 bg-slate-950/50 px-2 py-1.5">
            <p className="text-[11px] text-slate-500">证据引用</p>
            <p className="mt-1 break-words text-[11px] leading-4 text-slate-400">{pick.evidenceRefs.slice(0, 12).join("、")}</p>
          </div>
        ) : null}
      </details>
    </article>
  );
}

function EvidenceCoverageBar({ pick }: { pick: SelectionPick }) {
  const coverage = buildEvidenceCoverage(pick);
  const covered = coverage.filter((item) => item.covered).length;
  const tone = covered >= 4 ? "text-emerald-100 border-emerald-300/25 bg-emerald-300/[0.06]" : covered >= 3 ? "text-cyan-100 border-cyan-300/25 bg-cyan-300/[0.06]" : "text-amber-100 border-amber-300/25 bg-amber-300/[0.06]";
  return (
    <div className={`mt-3 rounded-lg border px-2 py-2 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium">证据覆盖 {covered}/{coverage.length}</span>
        <span className="text-[10px] opacity-75">{pick.blockers.length ? `阻断 ${pick.blockers.length}` : "无硬阻断"}</span>
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1">
        {coverage.map((item) => (
          <span
            key={item.key}
            className={`rounded border px-1.5 py-1 text-center text-[10px] ${
              item.covered
                ? "border-current/25 bg-slate-950/20 opacity-100"
                : "border-slate-700/70 bg-slate-950/40 text-slate-500 opacity-80"
            }`}
            title={item.note}
          >
            {item.label}
          </span>
        ))}
      </div>
      <p className="mt-2 line-clamp-2 text-[11px] leading-4 opacity-85">
        {coverage.filter((item) => !item.covered).map((item) => `${item.label}缺证`).join("；") || "核心证据覆盖较完整"}
      </p>
    </div>
  );
}

function buildEvidenceCoverage(pick: SelectionPick) {
  const refs = pick.evidenceRefs.join(" ");
  const factorText = pick.scoreFactors.map((factor) => `${factor.key} ${factor.label}`).join(" ");
  const text = `${refs} ${factorText}`;
  return [
    {
      key: "quote",
      label: "盘口",
      covered: /quote|hot|zdf|activity/.test(text),
      note: "最新价、涨跌幅、成交额、换手或活跃度证据"
    },
    {
      key: "technical",
      label: "技术",
      covered: /technical|kline|ma20|MA20|trend|momentum/.test(text),
      note: "K线、均线、MACD/RSI 或趋势结构证据"
    },
    {
      key: "fund",
      label: "资金",
      covered: /fund|MainNetFlow|资金/.test(text),
      note: "主力资金、资金质量或资金流窗口证据"
    },
    {
      key: "sector",
      label: "主线",
      covered: /sector|mainline|attribution|sector_match|板块/.test(text),
      note: "主线阶段、板块资金、成分股或主线归属证据"
    },
    {
      key: "company",
      label: "公司",
      covered: /company|financial|shareholder|business|主营|财务/.test(text),
      note: "主营业务、财务摘要、股东结构或公司认知证据"
    }
  ];
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
        <span className="text-xs font-medium">{plan.label}</span>
        <span className="rounded border border-current/20 px-1.5 py-0.5 text-[10px] opacity-80">规则解释</span>
      </div>
      <p className="mt-1 text-[11px] leading-4 opacity-90">{plan.summary}</p>
      {plan.watchPoints.length ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] opacity-90">观察点 / 失效条件</summary>
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
  if (!items.length) return null;
  return (
    <div className="rounded border border-current/15 bg-slate-950/20 px-2 py-1.5">
      <p className="text-[10px] opacity-70">{title}</p>
      <div className="mt-1 grid gap-1">
        {items.slice(0, 4).map((item) => (
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
        <p className="text-xs font-medium text-slate-300">数据刷新与降级提示</p>
        <div className="mt-2 grid gap-2">
          {warnings.length ? warnings.map((warning, index) => (
            <p key={`${warning}-${index}`} className="rounded border border-amber-300/15 bg-amber-300/[0.06] px-2 py-1.5 text-[11px] leading-4 text-amber-100">
              {warning}
            </p>
          )) : <p className="text-xs text-slate-500">本次没有数据源警告。</p>}
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

function shortRuleVersion(value?: string) {
  if (!value) return "历史";
  const match = value.match(/(\d{4}-\d{2}-\d{2})-v(\d+)$/);
  return match ? `${match[1]} v${match[2]}` : value.replace(/^selection-rules-/, "");
}

function formatParameterValue(value: unknown) {
  if (Array.isArray(value)) return value.join(" - ");
  if (typeof value === "boolean") return value ? "开启" : "关闭";
  if (value === null || value === undefined || value === "") return "未设置";
  return String(value);
}
