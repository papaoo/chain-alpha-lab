"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, BarChart3, ChevronDown, GitCompareArrows, LineChart, ListChecks } from "lucide-react";
import { BasicStockNameHover } from "@/components/SelectionStockHover";
import type { RuleReplaySnapshot } from "@/lib/db/ruleReplay";

type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };

export function RuleReplayPanel() {
  const [snapshot, setSnapshot] = useState<RuleReplaySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch("/api/rule-replay?limit=60", { cache: "no-store" });
        const json = (await response.json()) as ApiResponse<RuleReplaySnapshot>;
        if (!response.ok || !json.success || !json.data) throw new Error(json.error?.message ?? "规则回放读取失败");
        if (!cancelled) {
          setSnapshot(json.data);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div className="rounded-lg border border-line/70 bg-bg/50 p-3 text-sm text-muted">正在回放最近 60 份规则快照...</div>;
  if (error) return <div className="rounded-lg border border-warn/35 bg-warn/10 p-3 text-sm text-warn">{error}</div>;
  if (!snapshot) return <div className="rounded-lg border border-line/70 bg-bg/50 p-3 text-sm text-muted">暂无规则回放数据。</div>;

  return (
    <div className="grid gap-3">
      <ReplaySummary snapshot={snapshot} />
      <div className="grid gap-3 xl:grid-cols-[0.9fr_1.1fr]">
        <MarketReplay snapshot={snapshot} />
        <SectorReplay snapshot={snapshot} />
      </div>
      <CandidateReplay snapshot={snapshot} />
      <div className="rounded-lg border border-info/25 bg-info/10 p-3 text-xs leading-5 text-muted">
        {snapshot.cautions.map((item) => <p key={item}>• {item}</p>)}
      </div>
    </div>
  );
}

function ReplaySummary({ snapshot }: { snapshot: RuleReplaySnapshot }) {
  const tone = reliabilityTone(snapshot.reliability);
  return (
    <div className={`rounded-lg border p-3 ${tone.panel}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${tone.icon}`}>
            <GitCompareArrows size={18} />
          </span>
          <div>
            <p className="text-sm font-medium">规则历史回放：{reliabilityLabel(snapshot.reliability)}</p>
            <p className="mt-1 text-xs leading-5 text-muted">{snapshot.reliabilityNote}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge label="报告" value={snapshot.reportCount} />
          <Badge label="有效点" value={snapshot.pointCount} />
          <Badge label="大盘切换" value={snapshot.market.transitionCount} warn={snapshot.market.whipsawCount > 0} />
          <Badge label="主线数" value={snapshot.sectors.length} />
        </div>
      </div>
    </div>
  );
}

function MarketReplay({ snapshot }: { snapshot: RuleReplaySnapshot }) {
  const total = Math.max(snapshot.pointCount, 1);
  const states = [
    { key: "tradable", label: "可交易", color: "bg-up" },
    { key: "cautious", label: "谨慎", color: "bg-info" },
    { key: "defensive", label: "防守", color: "bg-warn" }
  ];
  return (
    <div className="rounded-lg border border-line/70 bg-bg/50 p-3">
      <div className="flex items-center gap-2">
        <LineChart size={16} className="text-info" />
        <p className="text-sm font-medium">规则1 大盘状态稳定性</p>
      </div>
      <div className="mt-3 grid gap-2">
        {states.map((state) => {
          const count = snapshot.market.stateCounts[state.key] ?? 0;
          const pct = Math.round((count / total) * 100);
          return (
            <div key={state.key}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">{state.label}</span>
                <span>{count} 次 / {pct}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/8">
                <div className={`h-full rounded-full ${state.color}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
        <MiniMetric label="改善" value={snapshot.market.improvementCount} />
        <MiniMetric label="恶化" value={snapshot.market.deteriorationCount} />
        <MiniMetric label="来回切换" value={snapshot.market.whipsawCount} />
      </div>
      <ObservationList items={snapshot.market.observations} />
    </div>
  );
}

function SectorReplay({ snapshot }: { snapshot: RuleReplaySnapshot }) {
  const [open, setOpen] = useState(false);
  const top = snapshot.sectors.slice(0, open ? 8 : 3);
  return (
    <div className="rounded-lg border border-line/70 bg-bg/50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-info" />
          <p className="text-sm font-medium">规则2 主线阶段迁移</p>
        </div>
        {snapshot.sectors.length > 3 ? (
          <button className="flex items-center gap-1 text-xs text-muted hover:text-info" type="button" onClick={() => setOpen((value) => !value)}>
            {open ? "收起" : "展开"} <ChevronDown className={`transition-transform ${open ? "rotate-180" : ""}`} size={14} />
          </button>
        ) : null}
      </div>
      <div className="mt-3 grid gap-2">
        {top.map((sector) => (
          <div key={sector.name} className="rounded-lg border border-line/60 bg-panel/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{sector.name}</p>
                <p className="mt-1 text-xs text-muted">出现 {sector.appearances} 次 / 最新 {sector.latestStage} / {sector.latestScore.toFixed(0)} 分</p>
              </div>
              <span className="rounded border border-info/35 bg-info/10 px-2 py-0.5 text-[11px] text-info">
                升 {sector.upgrades} / 降 {sector.downgrades}
              </span>
            </div>
            <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/8">
              {sector.stagePath.slice(-10).map((point) => (
                <span key={`${sector.name}-${point.reportId}`} className={`h-full flex-1 ${stageColor(point.stage)}`} title={`${formatTime(point.createdAt)} ${point.stage} ${point.score.toFixed(0)}`} />
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">核心延续率：{sector.averageCoreRetentionPct === undefined ? "样本不足" : `${sector.averageCoreRetentionPct}%`}</p>
            <ObservationList items={sector.observations} compact />
          </div>
        ))}
      </div>
    </div>
  );
}

function CandidateReplay({ snapshot }: { snapshot: RuleReplaySnapshot }) {
  return (
    <div className="grid gap-3 xl:grid-cols-[0.8fr_1.2fr]">
      <div className="rounded-lg border border-line/70 bg-bg/50 p-3">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-info" />
          <p className="text-sm font-medium">规则3 候选动作分布</p>
        </div>
        <div className="mt-3 grid gap-2">
          {Object.entries(snapshot.candidates.actionCounts).map(([action, count]) => (
            <div key={action} className="flex items-center justify-between rounded border border-line/60 bg-panel/60 px-3 py-2 text-xs">
              <span className="text-muted">{action}</span>
              <span className="font-medium">{count}</span>
            </div>
          ))}
        </div>
        <ObservationList items={snapshot.candidates.observations} />
      </div>
      <div className="rounded-lg border border-line/70 bg-bg/50 p-3">
        <div className="flex items-center gap-2">
          <ListChecks size={16} className="text-info" />
          <p className="text-sm font-medium">连续阻断/待复核股票</p>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {snapshot.candidates.repeatedBlockedStocks.length ? snapshot.candidates.repeatedBlockedStocks.map((stock) => (
            <div key={stock.code} className="rounded-lg border border-warn/25 bg-warn/10 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">
                  <BasicStockNameHover
                    stock={{
                      name: stock.name,
                      code: stock.code,
                      note: stock.latestReason
                    }}
                  />
                </p>
                <span className="rounded border border-warn/40 px-2 py-0.5 text-[11px] text-warn">{stock.count} 次</span>
              </div>
              <p className="mt-1 text-xs text-muted">{stock.code}</p>
              <p className="mt-2 text-xs leading-5 text-muted">{stock.latestReason}</p>
            </div>
          )) : <p className="rounded border border-line/60 bg-panel/60 p-3 text-sm text-muted">暂无连续阻断股票。</p>}
        </div>
      </div>
    </div>
  );
}

function ObservationList({ items, compact = false }: { items: string[]; compact?: boolean }) {
  return (
    <div className={compact ? "mt-2 space-y-1" : "mt-3 space-y-1"}>
      {items.map((item) => (
        <p key={item} className="flex gap-2 text-xs leading-5 text-muted">
          <AlertTriangle size={13} className="mt-1 shrink-0 text-warn" />
          <span>{item}</span>
        </p>
      ))}
    </div>
  );
}

function Badge({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return <span className={`rounded border px-2 py-1 ${warn && value ? "border-warn/40 bg-warn/10 text-warn" : "border-line bg-bg/55 text-muted"}`}>{label} {value}</span>;
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-line/60 bg-panel/60 px-2 py-1">
      <p className="font-semibold text-slate-100">{value}</p>
      <p className="mt-0.5 text-muted">{label}</p>
    </div>
  );
}

function reliabilityLabel(value: RuleReplaySnapshot["reliability"]) {
  if (value === "high") return "样本较充分";
  if (value === "medium") return "可初步参考";
  return "样本偏少";
}

function reliabilityTone(value: RuleReplaySnapshot["reliability"]) {
  if (value === "high") return { panel: "border-up/30 bg-up/10", icon: "border-up/40 text-up" };
  if (value === "medium") return { panel: "border-info/30 bg-info/10", icon: "border-info/40 text-info" };
  return { panel: "border-warn/35 bg-warn/10", icon: "border-warn/45 text-warn" };
}

function stageColor(stage: string) {
  if (stage === "确认") return "bg-up";
  if (stage === "启动") return "bg-info";
  if (stage === "加速") return "bg-warn";
  if (stage === "分歧") return "bg-[#b779ff]";
  if (stage === "退潮") return "bg-down";
  return "bg-line";
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
