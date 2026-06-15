"use client";

import { BarChart3, CheckCircle2, ShieldAlert, Sparkles } from "lucide-react";
import { BasicStockNameHover, SelectionStockNameHover } from "@/components/SelectionStockHover";
import {
  buildSelectionRunInsight,
  formatSelectionRate,
  formatSelectionScore,
  SELECTION_ACTION_ORDER,
  SELECTION_TIER_ORDER,
  type SelectionAggregateItem,
  type SelectionRunInsight
} from "@/lib/selection/insights";
import type { SelectionPick, SelectionRunRecord } from "@/lib/selection/types";

export function SelectionRunInsightCards({ run }: { run: SelectionRunRecord }) {
  const insight = buildSelectionRunInsight(run);
  const stockMap = buildStockMap(run);
  return (
    <section className="grid gap-4">
      <div className="rounded-lg border border-slate-800 bg-slate-950/62 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs tracking-[0.16em] text-cyan-200">RULE INSIGHT</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-slate-100">策略结果总览</h2>
              <span className={`rounded border px-2 py-1 text-xs ${toneClass(insight.qualityTone)}`}>
                {insight.qualityLabel}
              </span>
            </div>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">{insight.quickRead}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
            <MiniStat label="精选率" value={formatSelectionRate(insight.selectionRate)} />
            <MiniStat label="精选均分" value={formatSelectionScore(insight.avgPickScore)} />
            <MiniStat label="全池均分" value={formatSelectionScore(insight.avgAllScore)} />
            <MiniStat label="阻断项" value={`${insight.topBlockers.length}`} />
          </div>
        </div>
        {insight.bestPick ? (
          <div className="mt-4 rounded-lg border border-cyan-300/20 bg-cyan-300/[0.05] p-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs text-slate-500">批次最高分</p>
                <p className="mt-1 font-medium text-slate-100">
                  <SelectionStockNameHover pick={bestPickToSelectionPick(insight.bestPick, run)} />
                  <span className="ml-2 font-mono text-xs text-slate-500">{insight.bestPick.code}</span>
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-cyan-100">
                  {insight.bestPick.tier} {insight.bestPick.score}
                </span>
                <span className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-slate-300">
                  {insight.bestPick.action}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <DistributionPanel insight={insight} stockMap={stockMap} />
        <EvidencePanel insight={insight} stockMap={stockMap} />
      </div>
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
            <span className={`rounded border px-2 py-1 text-xs ${toneClass(insight.qualityTone)}`}>{insight.qualityLabel}</span>
            <span className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-xs text-slate-400">
              精选率 {formatSelectionRate(insight.selectionRate)}
            </span>
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{insight.quickRead}</p>
        </div>
        <div className="grid min-w-[260px] grid-cols-3 gap-2 text-center text-xs">
          <MiniStat label="精选均分" value={formatSelectionScore(insight.avgPickScore)} />
          <MiniStat label="阻断" value={`${insight.topBlockers.length}`} />
          <MiniStat label="板块" value={`${insight.sectorDistribution.length}`} />
        </div>
      </div>
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
              label={action}
              value={insight.actionCounts[action]}
              max={maxAction}
              tone={action === "剔除" ? "rose" : action === "条件等待" ? "amber" : action === "重点观察" ? "emerald" : "cyan"}
            />
          ))}
        </div>
        <div className="grid gap-2">
          {SELECTION_TIER_ORDER.map((tier) => (
            <BarRow key={tier} label={`${tier} 级`} value={insight.tierCounts[tier]} max={maxTier} tone={tier === "D" ? "rose" : tier === "C" ? "amber" : "cyan"} />
          ))}
        </div>
      </div>
      <details className="mt-4 rounded-lg border border-slate-800 bg-slate-900/44 p-3">
        <summary className="cursor-pointer text-sm font-medium text-cyan-200">查看板块分布</summary>
        <AggregateList className="mt-3" items={insight.sectorDistribution} stockMap={stockMap} emptyText="没有可用板块分布。" />
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
          title="主要加分因子"
          tone="emerald"
          items={insight.topPositiveFactors}
          stockMap={stockMap}
          emptyText="本次没有形成集中的加分因子。"
        />
        <EvidenceCard
          icon={<ShieldAlert size={16} />}
          title="主要阻断原因"
          tone="rose"
          items={insight.topBlockers}
          stockMap={stockMap}
          emptyText="没有集中阻断项。"
        />
      </div>
      {insight.topWarnings.length ? (
        <details className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.06] p-3">
          <summary className="cursor-pointer text-sm font-medium text-amber-100">
            数据提示 {insight.topWarnings.length} 项
          </summary>
          <AggregateList className="mt-3" items={insight.topWarnings} stockMap={stockMap} emptyText="无数据提示。" />
        </details>
      ) : null}
    </section>
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
              <span className="line-clamp-2 leading-5 text-slate-300">{item.label}</span>
              <span className="shrink-0 font-mono text-cyan-200">{item.score !== undefined ? item.score : `${item.count}次`}</span>
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
          name: stock.name,
          code: stock.code,
          latest: stock.price,
          changePct: stock.changePct,
          score: stock.score,
          note: `${stock.sectorName} / ${stock.tier}${stock.score} / ${stock.action}`
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

function barToneClass(tone: "emerald" | "cyan" | "amber" | "rose") {
  if (tone === "emerald") return "bg-emerald-300";
  if (tone === "amber") return "bg-amber-300";
  if (tone === "rose") return "bg-rose-300";
  return "bg-cyan-300";
}

function bestPickToSelectionPick(
  bestPick: Pick<SelectionPick, "code" | "name" | "score" | "tier" | "action">,
  run: SelectionRunRecord
): SelectionPick {
  return (
    [...run.picks, ...run.rejected].find((pick) => pick.code === bestPick.code) ?? {
      ...bestPick,
      sectorName: "未识别板块",
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
