"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BarChart3, BellPlus, CheckCircle2, CircleGauge, ListChecks, Loader2, Route, ShieldAlert } from "lucide-react";
import { BasicStockNameHover } from "@/components/SelectionStockHover";
import type { RuleBottleneckSnapshot, RuleBottleneckSeverity } from "@/lib/db/ruleBottleneck";

type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };

export function RuleBottleneckPanel() {
  const [snapshot, setSnapshot] = useState<RuleBottleneckSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notifyMessage, setNotifyMessage] = useState("");
  const [notifying, setNotifying] = useState(false);

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

  async function notifyAuctionWatchlist() {
    setNotifying(true);
    setNotifyMessage("");
    try {
      const response = await fetch("/api/auction-watchlist/notify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 80, itemLimit: 8 })
      });
      const json = (await response.json()) as ApiResponse<{ sent: number; failed: number }>;
      if (!response.ok || !json.success || !json.data) throw new Error(json.error?.message ?? "推送失败");
      setNotifyMessage(`观察池推送完成：成功 ${json.data.sent}，失败 ${json.data.failed}。`);
    } catch (err) {
      setNotifyMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setNotifying(false);
    }
  }

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
        <RuleBottleneckCacheMeta snapshot={snapshot} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3">
          <p className="text-xs leading-5 text-muted">次日竞价观察池可手动推送到已启用通知通道；不调用大模型，不自动下单。</p>
          <button
            className="rounded-lg border border-info/35 bg-info/10 px-3 py-2 text-xs font-medium text-info transition hover:bg-info/15 disabled:opacity-60"
            type="button"
            disabled={notifying || !snapshot.auctionWatchlist.length}
            onClick={notifyAuctionWatchlist}
          >
            {notifying ? "推送中..." : "推送观察池"}
          </button>
        </div>
        {notifyMessage ? <p className="mt-2 rounded border border-line/60 bg-bg/45 p-2 text-xs text-muted">{notifyMessage}</p> : null}
      </div>

      <CalibrationCard snapshot={snapshot} />
      <CandidatePressureCalibrationCard snapshot={snapshot} />
      <TriggerGuideCard snapshot={snapshot} />

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

        <div className="rounded-lg border border-line/70 bg-bg/50 p-3">
          <div className="flex items-center gap-2">
            <Route size={16} className="text-info" />
            <p className="text-sm font-medium">次日竞价观察池</p>
            <span className="rounded border border-line bg-bg/60 px-2 py-0.5 text-[11px] text-muted">{snapshot.auctionWatchlist.length} 只</span>
          </div>
          <div className="mt-3 grid gap-2">
            {snapshot.auctionWatchlist.length ? snapshot.auctionWatchlist.slice(0, 6).map((item) => (
              <details key={`${item.code}-${item.reportAt}`} className="rounded-lg border border-info/25 bg-info/10">
                <summary className="cursor-pointer list-none p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        <BasicStockNameHover
                          stock={{
                            name: item.name,
                            code: item.code,
                            latest: item.price,
                            changePct: item.changePct,
                            amount: item.amount,
                            turnoverRate: item.turnoverRate,
                            mainNetFlow: item.mainNetInflow,
                            note: item.reason
                          }}
                        />
                      </p>
                      <p className="mt-1 text-[11px] text-muted">{item.sectorName} / {item.sectorStage ?? "阶段未知"} / {item.role ?? "角色未知"}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-xs text-info">{item.score ?? "-"} 分</p>
                      <p className="mt-1 text-[11px] text-muted">{item.signalTier ?? "未分层"}</p>
                    </div>
                  </div>
                </summary>
                <div className="grid gap-2 border-t border-line/60 p-3 text-[11px] leading-4 text-muted">
                  <p className="rounded border border-line/60 bg-bg/45 p-2">原因：{item.reason}</p>
                  <ConditionList title="触发前提" items={item.preconditions} />
                  <ConditionList title="不能追" items={item.doNotChase} />
                  <ConditionList title="失效条件" items={item.invalidConditions} />
                  <AuctionTrackButton item={item} />
                </div>
              </details>
            )) : <p className="rounded border border-line/60 bg-panel/55 p-3 text-sm text-muted">暂无次日竞价观察样本。</p>}
          </div>
        </div>

        <div className="grid gap-3">
          <div className="rounded-lg border border-line/70 bg-bg/50 p-3">
            <div className="flex items-center gap-2">
              <Route size={16} className="text-info" />
              <p className="text-sm font-medium">机会漏斗</p>
            </div>
            <div className="mt-3 grid gap-2">
              {snapshot.funnel.map((item) => {
                const itemTone = severityTone(item.severity);
                return (
                  <div key={item.key} className={`rounded-lg border p-2 ${itemTone.panel}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium">{item.label}</p>
                        <p className="mt-1 text-[11px] leading-4 text-muted">{item.description}</p>
                      </div>
                      <span className={`shrink-0 rounded border px-2 py-0.5 text-[11px] ${itemTone.badge}`}>{item.count} / {item.pct}%</span>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/8">
                      <div className={barClass(item.severity)} style={{ width: `${Math.min(100, item.pct)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-line/70 bg-bg/50 p-3">
            <div className="flex items-center gap-2">
              <ListChecks size={16} className="text-info" />
              <p className="text-sm font-medium">可转化路径</p>
            </div>
            <div className="mt-3 grid gap-2">
              {snapshot.conversionPaths.length ? snapshot.conversionPaths.map((path) => {
                const pathTone = severityTone(path.severity);
                return (
                  <details key={path.key} className={`rounded-lg border ${pathTone.panel}`}>
                    <summary className="cursor-pointer list-none p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium">{path.label}</p>
                          <p className="mt-1 text-[11px] leading-4 text-muted">{path.summary}</p>
                        </div>
                        <span className={`shrink-0 rounded border px-2 py-0.5 text-[11px] ${pathTone.badge}`}>{path.count} / {path.pct}%</span>
                      </div>
                    </summary>
                    <div className="border-t border-line/60 p-3">
                      <div className="grid gap-1">
                        {path.nextChecks.map((check) => (
                          <p key={check} className="rounded border border-line/60 bg-bg/45 p-2 text-[11px] leading-4 text-muted">{check}</p>
                        ))}
                      </div>
                      {path.examples.length ? (
                        <div className="mt-2 grid gap-1">
                          {path.examples.map((example) => (
                            <p key={`${path.key}-${example.code}-${example.reportAt}`} className="rounded border border-line/60 bg-panel/50 p-2 text-[11px] leading-4 text-muted">
                              <BasicStockNameHover
                                stock={{
                                  name: example.name,
                                  code: example.code,
                                  note: `${example.action} / ${example.reason}`
                                }}
                              />
                              <span className="ml-1">：{example.action} / {example.reason}</span>
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </details>
                );
              }) : <p className="rounded border border-line/60 bg-panel/55 p-3 text-sm text-muted">暂无待激活或次日竞价样本。</p>}
            </div>
          </div>

          <div className="rounded-lg border border-line/70 bg-bg/50 p-3">
            <div className="flex items-center gap-2">
              <ListChecks size={16} className="text-info" />
              <p className="text-sm font-medium">连续阻断股票</p>
            </div>
            <div className="mt-3 grid gap-2">
              {snapshot.topBlockedStocks.length ? snapshot.topBlockedStocks.map((stock) => (
                <div key={stock.code} className="rounded-lg border border-warn/25 bg-warn/10 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">
                      <BasicStockNameHover
                        stock={{
                          name: stock.name,
                          code: stock.code,
                          note: `${stock.latestAction} / ${stock.latestReason}`
                        }}
                      />
                    </p>
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

function CandidatePressureCalibrationCard({ snapshot }: { snapshot: RuleBottleneckSnapshot }) {
  const calibration = snapshot.candidatePressureCalibration;
  if (!calibration) return null;
  const hints = calibration.calibrationHints.slice(0, 4);
  const buckets = calibration.topBuckets.slice(0, 4);
  return (
    <details className="rounded-lg border border-line/70 bg-bg/50 p-3">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CircleGauge size={16} className="text-info" />
            <div>
              <p className="text-sm font-medium">候选压制历史校准</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                最近 {calibration.reportCount} 份报告 / {calibration.candidateObservationCount} 个候选观察样本，辅助判断规则是否过严。
              </p>
            </div>
          </div>
          {hints[0] ? <span className={`rounded border px-2 py-1 text-xs ${hintBadgeClass(hints[0].severity)}`}>{hints[0].title}</span> : null}
        </div>
      </summary>
      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_0.8fr]">
        <div className="grid gap-2">
          {hints.length ? hints.map((hint) => (
            <div key={hint.key} className={`rounded-lg border p-2 ${hintPanelClass(hint.severity)}`}>
              <p className="text-xs font-medium">{hint.title}</p>
              <p className="mt-1 text-[11px] leading-4 text-muted">{hint.message}</p>
              <p className="mt-2 rounded border border-line/60 bg-bg/45 p-2 text-[11px] leading-4 text-muted">建议：{hint.suggestedAction}</p>
            </div>
          )) : <p className="rounded border border-line/60 bg-panel/55 p-3 text-sm text-muted">暂无候选压制校准提示。</p>}
        </div>
        <div className="grid gap-2">
          {buckets.map((bucket) => (
            <div key={bucket.key} className={`rounded-lg border p-2 ${pressureTonePanelClass(bucket.tone)}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium">{bucket.title}</p>
                  <p className="mt-1 text-[11px] leading-4 text-muted">累计 {bucket.totalCount} 次 / 频率 {bucket.frequencyPct}% / {bucket.trend}</p>
                </div>
                <span className="font-mono text-xs">{bucket.latestValue}</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/8">
                <div className="h-full rounded-full bg-current" style={{ width: `${Math.min(100, bucket.frequencyPct)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

function CalibrationCard({ snapshot }: { snapshot: RuleBottleneckSnapshot }) {
  const tone = severityTone(snapshot.calibration.severity);
  return (
    <div className={`rounded-lg border p-3 ${tone.panel}`}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-info" />
            <p className="text-sm font-medium">规则校准判断：{snapshot.calibration.stance}</p>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted">{snapshot.calibration.summary}</p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 text-xs xl:min-w-[460px]">
          {snapshot.calibration.metrics.map((metric) => {
            const metricTone = severityTone(metric.severity);
            return (
              <div key={metric.label} className={`rounded-lg border px-3 py-2 ${metricTone.panel}`} title={metric.note}>
                <p className="text-[11px] text-muted">{metric.label}</p>
                <p className="mt-1 font-mono text-sm font-semibold">{metric.value}</p>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {snapshot.calibration.recommendations.map((item) => (
          <p key={item} className="rounded border border-line/60 bg-bg/45 p-2 text-[11px] leading-4 text-muted">{item}</p>
        ))}
      </div>
    </div>
  );
}

type CandidatePressureCalibration = NonNullable<RuleBottleneckSnapshot["candidatePressureCalibration"]>;

function hintBadgeClass(severity: CandidatePressureCalibration["calibrationHints"][number]["severity"]) {
  if (severity === "risk") return "border-warn/45 bg-warn/10 text-warn";
  if (severity === "warning") return "border-info/40 bg-info/10 text-info";
  return "border-line bg-panel/60 text-muted";
}

function hintPanelClass(severity: CandidatePressureCalibration["calibrationHints"][number]["severity"]) {
  if (severity === "risk") return "border-warn/35 bg-warn/10";
  if (severity === "warning") return "border-info/30 bg-info/10";
  return "border-line/70 bg-panel/55";
}

function pressureTonePanelClass(tone: CandidatePressureCalibration["topBuckets"][number]["tone"]) {
  if (tone === "risk") return "border-warn/35 bg-warn/10 text-warn";
  if (tone === "wait") return "border-info/30 bg-info/10 text-info";
  return "border-up/30 bg-up/10 text-up";
}

function Mini({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-line/70 bg-bg/55 p-2 text-center">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 font-mono text-sm font-semibold text-text">{value}</p>
    </div>
  );
}

function RuleBottleneckCacheMeta({ snapshot }: { snapshot: RuleBottleneckSnapshot }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
      <span className="rounded border border-line/60 bg-bg/45 px-2 py-1">快照生成 {snapshot.generatedAt ? formatTime(snapshot.generatedAt) : "--"}</span>
      <span className="rounded border border-line/60 bg-bg/45 px-2 py-1">本次读取 {snapshot.servedAt ? formatTime(snapshot.servedAt) : "--"}</span>
      {snapshot.cacheStatus ? (
        <span className="rounded border border-info/30 bg-info/10 px-2 py-1 text-info">
          {snapshot.cacheStatus === "hit" ? "短缓存命中" : "重新聚合"} / {snapshot.cacheTtlSeconds ?? 0}s
        </span>
      ) : null}
    </div>
  );
}

function TriggerGuideCard({ snapshot }: { snapshot: RuleBottleneckSnapshot }) {
  const guide = snapshot.triggerGuide;
  return (
    <section className="rounded-lg border border-info/25 bg-info/[0.06] p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-info" />
            <p className="text-sm font-medium">买入触发说明：{guide.title}</p>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted">{guide.summary}</p>
        </div>
        <div className="grid min-w-[320px] grid-cols-3 gap-2 text-center text-xs">
          <Mini label="正式触发" value={snapshot.executableCount} />
          <Mini label="待激活" value={snapshot.pendingActivationCount} />
          <Mini label="竞价观察" value={snapshot.nextDayAuctionCount} />
        </div>
      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_1fr]">
        <details className="rounded-lg border border-line/70 bg-bg/45 p-3" open>
          <summary className="cursor-pointer text-xs font-medium text-info">正式买入需要同时满足什么</summary>
          <div className="mt-2 grid gap-1.5">
            {guide.requiredConditions.map((item) => (
              <p key={item} className="rounded border border-line/60 bg-panel/45 p-2 text-[11px] leading-4 text-muted">{item}</p>
            ))}
          </div>
        </details>
        <details className="rounded-lg border border-line/70 bg-bg/45 p-3">
          <summary className="cursor-pointer text-xs font-medium text-warn">不能越界的硬边界</summary>
          <div className="mt-2 grid gap-1.5">
            {guide.hardBoundaries.map((item) => (
              <p key={item} className="rounded border border-line/60 bg-panel/45 p-2 text-[11px] leading-4 text-muted">{item}</p>
            ))}
          </div>
        </details>
      </div>
      {guide.nearestOpportunities.length ? (
        <details className="mt-3 rounded-lg border border-line/70 bg-bg/45 p-3">
          <summary className="cursor-pointer text-xs font-medium text-info">最接近触发的观察样本 {guide.nearestOpportunities.length} 只</summary>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {guide.nearestOpportunities.map((item, index) => (
              <div key={`${item.code}-${item.opportunityState ?? item.action}-${index}`} className="rounded-lg border border-line/60 bg-panel/50 p-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <BasicStockNameHover stock={{ code: item.code, name: item.name, note: item.reason }} />
                    <p className="mt-1 font-mono text-[11px] text-muted">{item.code}</p>
                  </div>
                  <span className="rounded border border-info/30 bg-info/10 px-1.5 py-0.5 text-[10px] text-info">{item.action}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-muted">{item.reason}</p>
                <div className="mt-2 grid gap-1">
                  {item.missingChecks.slice(0, 3).map((check) => (
                    <p key={check} className="rounded border border-line/50 bg-bg/45 px-2 py-1 text-[10px] leading-4 text-muted">{check}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function ConditionList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded border border-line/60 bg-bg/45 p-2">
      <p className="font-medium text-text">{title}</p>
      {items.length ? (
        <div className="mt-1 grid gap-1">
          {items.map((item) => (
            <p key={item} className="text-muted">{item}</p>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-muted">未记录明确条件</p>
      )}
    </div>
  );
}

function AuctionTrackButton({ item }: { item: RuleBottleneckSnapshot["auctionWatchlist"][number] }) {
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);
  const [trackingId, setTrackingId] = useState("");
  const [message, setMessage] = useState("");

  async function addToTracking() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/tracking/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: item.code,
          name: item.name,
          source: "mainline",
          entryMode: "watch",
          simulatedPrice: item.price,
          simulatedPositionPct: 0,
          sectorName: item.sectorName,
          thesis: `次日竞价观察池：${item.sectorName}/${item.sectorStage ?? "阶段未知"}，${item.signalTier ?? "未分层"}，机会分 ${item.score ?? "-"}。${item.reason}`,
          invalidCondition: item.invalidConditions[0] ?? "竞价弱于板块、开盘承接失败、主线退潮或资金明显流出时取消观察。",
          watchConditions: item.preconditions.slice(0, 5),
          riskNotes: [...item.doNotChase, ...item.invalidConditions].slice(0, 6),
          baselineMeta: {
            price: item.price,
            source: "auction-watchlist",
            fetchedAt: item.reportAt,
            warnings: ["基准价来自历史分析报告快照，加入追踪时后端会尝试刷新最新价。"]
          }
        })
      });
      const json = (await response.json()) as ApiResponse<{ id: string; created: boolean; baselinePrice?: number }>;
      if (!response.ok || !json.success || !json.data) throw new Error(json.error?.message ?? "加入追踪失败");
      setAdded(true);
      setTrackingId(json.data.id);
      setMessage(json.data.created ? `已加入观察，基准价 ${json.data.baselinePrice?.toFixed(2) ?? "待刷新"}` : "已在追踪中，复用原记录");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-line/60 bg-bg/45 p-2">
      <button
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition disabled:opacity-60 ${
          added ? "border-up/35 bg-up/10 text-up" : "border-info/35 bg-info/10 text-info hover:bg-info/15"
        }`}
        type="button"
        disabled={loading || added}
        onClick={addToTracking}
      >
        {loading ? <Loader2 className="animate-spin" size={13} /> : added ? <CheckCircle2 size={13} /> : <BellPlus size={13} />}
        {added ? "已观察" : "加入追踪观察"}
      </button>
      {message ? <span className="text-[11px] text-muted">{message}</span> : null}
      {trackingId ? (
        <Link className="text-[11px] text-info underline decoration-dotted underline-offset-2" href="/mainline?view=tracking">
          去追踪页
        </Link>
      ) : null}
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

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}
