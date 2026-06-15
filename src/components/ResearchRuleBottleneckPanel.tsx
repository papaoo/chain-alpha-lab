"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, BarChart3, CircleGauge, ListChecks, ShieldAlert } from "lucide-react";
import type { RuleBottleneckSnapshot, RuleBottleneckSeverity } from "@/lib/db/ruleBottleneck";

type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };

export function RuleBottleneckPanel() {
  const [snapshot, setSnapshot] = useState<RuleBottleneckSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch("/api/rule-bottlenecks?limit=80", { cache: "no-store" });
        const json = (await response.json()) as ApiResponse<RuleBottleneckSnapshot>;
        if (!response.ok || !json.success || !json.data) throw new Error(json.error?.message ?? "规则瓶颈分析读取失败");
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

  if (loading) return <div className="rounded-lg border border-line/70 bg-bg/50 p-3 text-sm text-muted">正在分析最近规则瓶颈...</div>;
  if (error) return <div className="rounded-lg border border-warn/35 bg-warn/10 p-3 text-sm text-warn">{error}</div>;
  if (!snapshot) return <div className="rounded-lg border border-line/70 bg-bg/50 p-3 text-sm text-muted">暂无规则瓶颈数据。</div>;

  const tone = severityTone(snapshot.conclusion.level);
  const topGate = snapshot.gates[0];
  return (
    <div className="grid gap-3">
      <div className={`rounded-lg border p-3 ${tone.panel}`}>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${tone.icon}`}>
              <CircleGauge size={18} />
            </span>
            <div>
              <p className="text-sm font-medium">买入触发瓶颈：{snapshot.conclusion.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted">{snapshot.conclusion.summary}</p>
              {topGate ? <p className="mt-2 text-xs text-muted">最大阻断：{topGate.label} / {topGate.pct}%</p> : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-5 xl:min-w-[520px]">
            <Mini label="候选样本" value={snapshot.candidateCount} />
            <Mini label="正式触发" value={snapshot.executableCount} />
            <Mini label="待激活" value={snapshot.pendingActivationCount} />
            <Mini label="次日竞价" value={snapshot.nextDayAuctionCount} />
            <Mini label="触发率" value={`${snapshot.buySignalRatePct}%`} />
          </div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-lg border border-line/70 bg-bg/50 p-3">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-info" />
            <p className="text-sm font-medium">规则闸门分布</p>
          </div>
          <div className="mt-3 grid gap-2">
            {snapshot.gates.map((gate) => {
              const gateTone = severityTone(gate.severity);
              return (
                <details key={gate.key} className={`rounded-lg border ${gateTone.panel}`}>
                  <summary className="cursor-pointer list-none p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{gate.label}</p>
                        <p className="mt-1 text-xs text-muted">{gate.description}</p>
                      </div>
                      <span className={`rounded border px-2 py-1 text-xs ${gateTone.badge}`}>{gate.count} / {gate.pct}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
                      <div className={barClass(gate.severity)} style={{ width: `${Math.min(100, gate.pct)}%` }} />
                    </div>
                  </summary>
                  <div className="border-t border-line/60 p-3">
                    <p className="text-xs leading-5 text-muted">{gate.suggestion}</p>
                    <div className="mt-2 grid gap-1">
                      {gate.evidence.map((item) => (
                        <p key={item} className="rounded border border-line/60 bg-bg/45 p-2 text-[11px] leading-4 text-muted">{item}</p>
                      ))}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3">
          <div className="rounded-lg border border-line/70 bg-bg/50 p-3">
            <div className="flex items-center gap-2">
              <ListChecks size={16} className="text-info" />
              <p className="text-sm font-medium">连续阻断股票</p>
            </div>
            <div className="mt-3 grid gap-2">
              {snapshot.topBlockedStocks.length ? snapshot.topBlockedStocks.map((stock) => (
                <div key={stock.code} className="rounded-lg border border-warn/25 bg-warn/10 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{stock.name}</p>
                    <span className="rounded border border-warn/35 px-2 py-0.5 text-[11px] text-warn">{stock.count} 次</span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-muted">{stock.code}</p>
                  <p className="mt-2 text-xs leading-5 text-muted">{stock.latestAction} / {stock.latestReason}</p>
                </div>
              )) : <p className="rounded border border-line/60 bg-panel/55 p-3 text-sm text-muted">暂无连续阻断股票。</p>}
            </div>
          </div>

          <div className="rounded-lg border border-line/70 bg-bg/50 p-3">
            <div className="flex items-center gap-2">
              <ShieldAlert size={16} className="text-warn" />
              <p className="text-sm font-medium">高频阻断原因</p>
            </div>
            <div className="mt-3 grid gap-2">
              {snapshot.topBlockReasons.length ? snapshot.topBlockReasons.map((item) => (
                <div key={item.reason} className="rounded border border-line/60 bg-panel/55 p-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs leading-5 text-muted">{item.reason}</p>
                    <span className="shrink-0 rounded border border-line bg-bg/60 px-2 py-0.5 text-[11px] text-muted">{item.count}</span>
                  </div>
                </div>
              )) : <p className="rounded border border-line/60 bg-panel/55 p-3 text-sm text-muted">暂无高频阻断原因。</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-info/25 bg-info/10 p-3 text-xs leading-5 text-muted">
        {snapshot.cautions.map((item) => (
          <p key={item} className="flex gap-2">
            <AlertTriangle size={13} className="mt-1 shrink-0 text-warn" />
            <span>{item}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-line/70 bg-bg/55 p-2 text-center">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 font-mono text-sm font-semibold text-text">{value}</p>
    </div>
  );
}

function severityTone(value: RuleBottleneckSeverity) {
  if (value === "ok") return { panel: "border-up/30 bg-up/10", icon: "border-up/40 text-up", badge: "border-up/40 bg-up/10 text-up" };
  if (value === "risk") return { panel: "border-warn/35 bg-warn/10", icon: "border-warn/45 text-warn", badge: "border-warn/45 bg-warn/10 text-warn" };
  return { panel: "border-info/30 bg-info/10", icon: "border-info/40 text-info", badge: "border-info/40 bg-info/10 text-info" };
}

function barClass(value: RuleBottleneckSeverity) {
  if (value === "ok") return "h-full rounded-full bg-up";
  if (value === "risk") return "h-full rounded-full bg-warn";
  return "h-full rounded-full bg-info";
}
