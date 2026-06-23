"use client";

import { BarChart3, CheckCircle2, GitBranch, ShieldAlert, Sparkles } from "lucide-react";
import { BasicStockNameHover, SelectionStockNameHover } from "@/components/SelectionStockHover";
import {
  buildSelectionRunInsight,
  formatSelectionRate,
  formatSelectionScore,
  SELECTION_ACTION_ORDER,
  SELECTION_TIER_ORDER,
  type SelectionAggregateItem,
  type SelectionRunInsight,
  type SelectionSerenityStockItem
} from "@/lib/selection/insights";
import { cleanDisplayText } from "@/lib/display/text";
import type { SelectionPick, SelectionRunRecord } from "@/lib/selection/types";

export function SelectionRunInsightCards({ run }: { run: SelectionRunRecord }) {
  const insight = buildSelectionRunInsight(run);
  const stockMap = buildStockMap(run);
  return (
    <section className="grid gap-4">
      <div className="rounded-lg border border-slate-800 bg-slate-950/62 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs tracking-[0.16em] text-cyan-200">规则洞察</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-slate-100">策略结果总览</h2>
              <span className={`rounded border px-2 py-1 text-xs ${toneClass(insight.qualityTone)}`}>
                {cleanDisplayText(insight.qualityLabel) ?? insight.qualityLabel}
              </span>
            </div>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">{cleanDisplayText(insight.quickRead) ?? insight.quickRead}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
            <MiniStat label="入选率" value={formatSelectionRate(insight.selectionRate)} />
            <MiniStat label="入选均分" value={formatSelectionScore(insight.avgPickScore)} />
            <MiniStat label="候选均分" value={formatSelectionScore(insight.avgAllScore)} />
            <MiniStat label="盘中可行动" value={`${insight.actionabilityStats.actionable}/${insight.actionabilityStats.total}`} />
          </div>
        </div>
        <div className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-5 ${toneClass(insight.actionabilityStats.tone)}`}>
          <span className="font-medium">运行快照行动边界 / {cleanDisplayText(insight.actionabilityStats.label) ?? insight.actionabilityStats.label}</span>
          <span className="ml-2 text-slate-300">
            {cleanDisplayText(insight.actionabilityStats.summary) ?? insight.actionabilityStats.summary} 当前统一行情覆盖情况见上方快照校验面板。
          </span>
        </div>
        {insight.bestPick ? (
          <div className="mt-4 rounded-lg border border-cyan-300/20 bg-cyan-300/[0.05] p-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs text-slate-500">本次最高评分</p>
                <p className="mt-1 font-medium text-slate-100">
                  <SelectionStockNameHover pick={bestPickToSelectionPick(insight.bestPick, run)} run={run} />
                  <span className="ml-2 font-mono text-xs text-slate-500">{insight.bestPick.code}</span>
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-cyan-100">
                  {insight.bestPick.tier} {insight.bestPick.score}
                </span>
                <span className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-slate-300">
                  {cleanDisplayText(insight.bestPick.action) ?? insight.bestPick.action}
                </span>
              </div>
            </div>
          </div>
        ) : null}
        {insight.noPickDiagnosis ? (
          <NoPickDiagnosisCard insight={insight} run={run} stockMap={stockMap} />
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <DistributionPanel insight={insight} stockMap={stockMap} />
        <EvidencePanel insight={insight} stockMap={stockMap} />
      </div>
      {insight.serenityInsight ? <SerenityInsightPanel insight={insight} stockMap={stockMap} run={run} /> : null}
    </section>
  );
}

export function SelectionRunCompactInsight({ run }: { run: SelectionRunRecord }) {
  const insight = buildSelectionRunInsight(run);
  return (
    <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/42 p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded border px-2 py-1 text-xs ${toneClass(insight.qualityTone)}`}>
              {cleanDisplayText(insight.qualityLabel) ?? insight.qualityLabel}
            </span>
            <span className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-xs text-slate-400">
              入选率 {formatSelectionRate(insight.selectionRate)}
            </span>
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{cleanDisplayText(insight.quickRead) ?? insight.quickRead}</p>
          {insight.serenityInsight ? (
            <p className="mt-2 rounded border border-lime-300/20 bg-lime-300/[0.06] px-2 py-1.5 text-xs leading-5 text-lime-100">
              Serenity 叠加：{insight.serenityInsight.taggedCount} 只带标签，{insight.serenityInsight.topPriorityCount} 只高优先级。该信息只提高研究优先级。
            </p>
          ) : null}
        </div>
        <div className="grid min-w-[260px] grid-cols-3 gap-2 text-center text-xs">
          <MiniStat label="入选均分" value={formatSelectionScore(insight.avgPickScore)} />
          <MiniStat label="盘中可行动" value={`${insight.actionabilityStats.actionable}/${insight.actionabilityStats.total}`} />
          <MiniStat label="板块数" value={`${insight.sectorDistribution.length}`} />
        </div>
      </div>
    </div>
  );
}

function NoPickDiagnosisCard({
  insight,
  run,
  stockMap
}: {
  insight: SelectionRunInsight;
  run: SelectionRunRecord;
  stockMap: Map<string, SelectionPick>;
}) {
  const diagnosis = insight.noPickDiagnosis;
  if (!diagnosis) return null;
  const bestPick = diagnosis.bestRejected ? bestPickToSelectionPick(diagnosis.bestRejected, run) : null;
  return (
    <div className={`mt-4 rounded-lg border p-3 ${diagnosisToneClass(diagnosis.tone)}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs tracking-[0.14em] text-slate-400">无入选诊断</p>
          <h3 className="mt-1 font-semibold text-slate-100">{cleanDisplayText(diagnosis.title) ?? diagnosis.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">{cleanDisplayText(diagnosis.summary) ?? diagnosis.summary}</p>
        </div>
        <div className="grid min-w-[260px] grid-cols-3 gap-2 text-center text-xs">
          <MiniStat label="完整" value={`${diagnosis.completeSnapshotCount}/${insight.candidateCount}`} />
          <MiniStat label="部分" value={`${diagnosis.partialSnapshotCount}/${insight.candidateCount}`} />
          <MiniStat label="缺失" value={`${diagnosis.missingSnapshotCount}/${insight.candidateCount}`} />
        </div>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded border border-slate-800 bg-slate-950/45 p-3">
          <p className="text-xs text-slate-500">最接近入选样本</p>
          {bestPick ? (
            <div className="mt-2 flex items-center justify-between gap-3">
              <div>
                <SelectionStockNameHover pick={bestPick} run={run} />
                <span className="ml-2 font-mono text-xs text-slate-500">{bestPick.code}</span>
              </div>
              <span className="rounded border border-slate-700 bg-slate-900/80 px-2 py-1 text-xs text-slate-200">
                {bestPick.tier} {bestPick.score} / {cleanDisplayText(bestPick.action) ?? bestPick.action}
              </span>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">暂无样本。</p>
          )}
        </div>
        <details className="rounded border border-slate-800 bg-slate-950/45 p-3" open>
          <summary className="cursor-pointer text-sm font-medium text-cyan-100">下一步检查</summary>
          <ul className="mt-2 grid gap-1.5 text-xs leading-5 text-slate-300">
            {diagnosis.nextChecks.map((item) => (
              <li key={item}>{cleanDisplayText(item) ?? item}</li>
            ))}
          </ul>
        </details>
      </div>
      {diagnosis.topBlockers.length ? (
        <details className="mt-3 rounded border border-slate-800 bg-slate-950/45 p-3">
          <summary className="cursor-pointer text-sm font-medium text-rose-100">阻断样本</summary>
          <AggregateList className="mt-3" items={diagnosis.topBlockers} stockMap={stockMap} emptyText="暂无集中阻断项。" />
        </details>
      ) : null}
    </div>
  );
}

function DistributionPanel({ insight, stockMap }: { insight: SelectionRunInsight; stockMap: Map<string, SelectionPick> }) {
  const maxAction = Math.max(1, ...SELECTION_ACTION_ORDER.map((action) => insight.actionCounts[action]));
  const maxTier = Math.max(1, ...SELECTION_TIER_ORDER.map((tier) => insight.tierCounts[tier]));
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/56 p-4">
      <div className="flex items-center gap-2">
        <BarChart3 size={17} className="text-cyan-200" />
        <h3 className="font-semibold text-slate-100">分层与动作分布</h3>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="grid gap-2">
          {SELECTION_ACTION_ORDER.map((action) => (
            <BarRow
              key={action}
              label={cleanDisplayText(action) ?? action}
              value={insight.actionCounts[action]}
              max={maxAction}
              tone={action === "剔除" ? "rose" : action === "条件等待" ? "amber" : action === "重点观察" ? "emerald" : "cyan"}
            />
          ))}
        </div>
        <div className="grid gap-2">
          {SELECTION_TIER_ORDER.map((tier) => (
            <BarRow key={tier} label={`${tier} 档`} value={insight.tierCounts[tier]} max={maxTier} tone={tier === "D" ? "rose" : tier === "C" ? "amber" : "cyan"} />
          ))}
        </div>
      </div>
      <details className="mt-4 rounded-lg border border-slate-800 bg-slate-900/44 p-3">
        <summary className="cursor-pointer text-sm font-medium text-cyan-200">查看板块分布</summary>
        <AggregateList className="mt-3" items={insight.sectorDistribution} stockMap={stockMap} emptyText="暂无板块分布。" />
      </details>
    </section>
  );
}

function EvidencePanel({ insight, stockMap }: { insight: SelectionRunInsight; stockMap: Map<string, SelectionPick> }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/56 p-4">
      <div className="flex items-center gap-2">
        <Sparkles size={17} className="text-cyan-200" />
        <h3 className="font-semibold text-slate-100">入选与剔除证据</h3>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <EvidenceCard
          icon={<CheckCircle2 size={16} />}
          title="主要正向因素"
          tone="emerald"
          items={insight.topPositiveFactors}
          stockMap={stockMap}
          emptyText="暂无集中正向因素。"
        />
        <EvidenceCard
          icon={<ShieldAlert size={16} />}
          title="主要阻断项"
          tone="rose"
          items={insight.topBlockers}
          stockMap={stockMap}
          emptyText="暂无集中阻断项。"
        />
      </div>
      {insight.topWarnings.length ? (
        <details className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.06] p-3">
          <summary className="cursor-pointer text-sm font-medium text-amber-100">
            数据警告 {insight.topWarnings.length}
          </summary>
          <AggregateList className="mt-3" items={insight.topWarnings} stockMap={stockMap} emptyText="暂无数据警告。" />
        </details>
      ) : null}
    </section>
  );
}

function SerenityInsightPanel({
  insight,
  stockMap,
  run
}: {
  insight: SelectionRunInsight;
  stockMap: Map<string, SelectionPick>;
  run: SelectionRunRecord;
}) {
  const serenity = insight.serenityInsight;
  if (!serenity) return null;
  return (
    <section className="rounded-lg border border-lime-300/20 bg-lime-300/[0.045] p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <GitBranch size={17} className="text-lime-200" />
            <h3 className="font-semibold text-slate-100">瓶颈研究叠加</h3>
            <span className="rounded border border-lime-300/25 bg-lime-300/10 px-2 py-1 text-[11px] text-lime-100">
              仅提高研究优先级
            </span>
          </div>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">{cleanDisplayText(serenity.quickRead) ?? serenity.quickRead}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
          <MiniStat label="带标签" value={`${serenity.taggedCount}/${insight.candidateCount}`} />
          <MiniStat label="入选标签" value={`${serenity.taggedPickCount}`} />
          <MiniStat label="高优先级" value={`${serenity.topPriorityCount}`} />
          <MiniStat label="强/中证据" value={`${serenity.strongOrMediumEvidenceCount}`} />
        </div>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-lime-100">优先研究样本</p>
            <span className="text-[11px] text-slate-500">不直接改变交易动作</span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {serenity.topTaggedStocks.map((item) => (
              <SerenityStockChip key={`${item.code}-${item.theme}`} item={item} stock={stockMap.get(item.code)} run={run} />
            ))}
          </div>
        </div>
        <details className="rounded-lg border border-slate-800 bg-slate-950/45 p-3">
          <summary className="cursor-pointer text-sm font-medium text-lime-100">主题与产业链分布</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-2 text-xs text-slate-500">主题</p>
              <AggregateList items={serenity.themeDistribution} stockMap={stockMap} emptyText="暂无主题分布。" />
            </div>
            <div>
              <p className="mb-2 text-xs text-slate-500">产业链</p>
              <AggregateList items={serenity.chainDistribution} stockMap={stockMap} emptyText="暂无产业链分布。" />
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}

function SerenityStockChip({ item, stock, run }: { item: SelectionSerenityStockItem; stock?: SelectionPick; run: SelectionRunRecord }) {
  const hoverStock = stock ?? {
    code: item.code,
    name: item.name,
    sectorName: item.theme,
    score: item.score,
    tier: item.tier,
    action: item.action,
    reasons: [],
    blockers: [],
    evidenceRefs: [],
    scoreFactors: []
  };
  return (
    <div className="rounded border border-lime-300/15 bg-slate-950/55 p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <SelectionStockNameHover pick={hoverStock} run={run} />
          <p className="mt-1 font-mono text-[11px] text-slate-500">{item.code}</p>
        </div>
        <span className="shrink-0 rounded border border-lime-300/25 px-1.5 py-0.5 text-[10px] text-lime-100">
          {serenityPriorityLabel(item.priority)}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-300">
        {cleanDisplayText(item.theme) ?? item.theme} / {cleanDisplayText(item.chainPosition) ?? item.chainPosition}
      </p>
      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{cleanDisplayText(item.verdict) ?? item.verdict}</p>
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
        <span>{serenityEvidenceLabel(item.evidenceStrength)}</span>
        <span className="font-mono text-lime-200">{item.serenityScore.toFixed(0)}</span>
      </div>
    </div>
  );
}

function EvidenceCard({
  icon,
  title,
  tone,
  items,
  stockMap,
  emptyText
}: {
  icon: React.ReactNode;
  title: string;
  tone: "emerald" | "rose";
  items: SelectionAggregateItem[];
  stockMap: Map<string, SelectionPick>;
  emptyText: string;
}) {
  return (
    <div className={`rounded-lg border p-3 ${tone === "emerald" ? "border-emerald-300/20 bg-emerald-300/[0.05]" : "border-rose-300/20 bg-rose-300/[0.05]"}`}>
      <div className={`flex items-center gap-2 text-sm font-medium ${tone === "emerald" ? "text-emerald-100" : "text-rose-100"}`}>
        {icon}
        {title}
      </div>
      <AggregateList className="mt-3" items={items} stockMap={stockMap} emptyText={emptyText} />
    </div>
  );
}

function AggregateList({
  items,
  stockMap,
  emptyText,
  className = ""
}: {
  items: SelectionAggregateItem[];
  stockMap: Map<string, SelectionPick>;
  emptyText: string;
  className?: string;
}) {
  if (!items.length) return <p className={`${className} text-xs leading-5 text-slate-500`}>{emptyText}</p>;
  const max = Math.max(1, ...items.map((item) => item.score ?? item.count));
  return (
    <div className={`grid gap-2 ${className}`}>
      {items.slice(0, 6).map((item) => {
        const value = item.score ?? item.count;
        return (
          <div key={item.key} className="rounded border border-slate-800 bg-slate-950/50 p-2">
            <div className="flex items-start justify-between gap-3 text-xs">
              <span className="line-clamp-2 leading-5 text-slate-300">{cleanDisplayText(item.label) ?? item.label}</span>
              <span className="shrink-0 font-mono text-cyan-200">{item.score !== undefined ? item.score : `${item.count}x`}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-cyan-300" style={{ width: `${Math.max(5, Math.min(100, (value / max) * 100))}%` }} />
            </div>
            {item.sampleCodes.length ? (
              <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
                {item.sampleCodes.map((code) => (
                  <SampleStock key={`${item.key}-${code}`} code={code} stock={stockMap.get(code)} />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function SampleStock({ code, stock }: { code: string; stock?: SelectionPick }) {
  if (!stock) return <span className="font-mono">{code}</span>;
  return (
    <span className="rounded border border-slate-800 bg-slate-900/70 px-1.5 py-0.5">
      <BasicStockNameHover
        className="font-medium text-slate-300"
        stock={{
          name: cleanDisplayText(stock.name) ?? stock.name,
          code: stock.code,
          latest: stock.price,
          changePct: stock.changePct,
          score: stock.score,
          note: `${cleanDisplayText(stock.sectorName) ?? stock.sectorName} / ${stock.tier}${stock.score} / ${cleanDisplayText(stock.action) ?? stock.action}`
        }}
      />
    </span>
  );
}

function BarRow({
  label,
  value,
  max,
  tone
}: {
  label: string;
  value: number;
  max: number;
  tone: "emerald" | "cyan" | "amber" | "rose";
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono text-slate-200">{value}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${barToneClass(tone)}`} style={{ width: `${Math.max(value ? 6 : 0, Math.min(100, (value / max) * 100))}%` }} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function toneClass(tone: SelectionRunInsight["qualityTone"]) {
  if (tone === "emerald") return "border-emerald-300/30 bg-emerald-300/10 text-emerald-100";
  if (tone === "cyan") return "border-cyan-300/30 bg-cyan-300/10 text-cyan-100";
  if (tone === "amber") return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  if (tone === "rose") return "border-rose-300/30 bg-rose-300/10 text-rose-100";
  return "border-slate-700 bg-slate-900/60 text-slate-300";
}

function diagnosisToneClass(tone: NonNullable<SelectionRunInsight["noPickDiagnosis"]>["tone"]) {
  if (tone === "rose") return "border-rose-300/25 bg-rose-300/[0.06]";
  if (tone === "amber") return "border-amber-300/25 bg-amber-300/[0.06]";
  return "border-slate-700 bg-slate-900/45";
}

function barToneClass(tone: "emerald" | "cyan" | "amber" | "rose") {
  if (tone === "emerald") return "bg-emerald-300";
  if (tone === "amber") return "bg-amber-300";
  if (tone === "rose") return "bg-rose-300";
  return "bg-cyan-300";
}

function serenityPriorityLabel(value: NonNullable<SelectionPick["serenityTag"]>["priority"]) {
  if (value === "top") return "核心瓶颈";
  if (value === "high") return "高优先级";
  if (value === "watch") return "待验证";
  return "低优先级";
}

function serenityEvidenceLabel(value: NonNullable<SelectionPick["serenityTag"]>["evidenceStrength"]) {
  if (value === "strong") return "强证据";
  if (value === "medium") return "中等证据";
  if (value === "weak") return "弱证据";
  return "待核验";
}

function bestPickToSelectionPick(
  bestPick: Pick<SelectionPick, "code" | "name" | "score" | "tier" | "action">,
  run: SelectionRunRecord
): SelectionPick {
  return (
    [...run.picks, ...run.rejected].find((pick) => pick.code === bestPick.code) ?? {
      ...bestPick,
      sectorName: "板块待确认",
      reasons: [],
      blockers: [],
      evidenceRefs: [],
      scoreFactors: []
    }
  );
}

function buildStockMap(run: SelectionRunRecord) {
  const map = new Map<string, SelectionPick>();
  for (const pick of [...run.picks, ...run.rejected]) map.set(pick.code, pick);
  return map;
}
