"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Database, Gauge, Globe2, Loader2, Radar, RefreshCw, ShieldAlert } from "lucide-react";
import type { PremarketSnapshot } from "@/lib/premarket/types";

type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };

const levelClass: Record<PremarketSnapshot["riskLevel"], string> = {
  friendly: "border-up/35 bg-up/10 text-up",
  neutral: "border-info/35 bg-info/10 text-info",
  watch: "border-warn/35 bg-warn/10 text-warn",
  risk: "border-rose-400/35 bg-rose-400/10 text-rose-200",
  risk_off: "border-red-500/45 bg-red-500/15 text-red-200"
};

const groupLabels: Record<string, string> = {
  us: "美股",
  asia: "亚太",
  hk_cn: "港股/A50期指",
  fx: "汇率",
  other: "其他"
};

export function PremarketScoutWorkspace() {
  const [snapshot, setSnapshot] = useState<PremarketSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void load(true);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  async function load(refresh = false) {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/premarket/snapshot", { cache: "no-store" });
      const json = (await response.json()) as ApiResponse<PremarketSnapshot>;
      if (!response.ok || !json.success || !json.data) throw new Error(json.error?.message ?? "盘前侦察数据加载失败");
      setSnapshot(json.data);
    } catch (err) {
      setSnapshot(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const groupedMarkets = useMemo(() => {
    const groups = new Map<string, NonNullable<PremarketSnapshot["markets"]>>();
    for (const item of snapshot?.markets ?? []) {
      groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
    }
    return Array.from(groups.entries());
  }, [snapshot]);

  if (loading) {
    return (
      <section className="rounded-lg border border-line bg-panel/80 p-8 text-center">
        <Loader2 className="mx-auto animate-spin text-info" size={28} />
        <p className="mt-3 text-sm text-muted">正在侦察外围市场...</p>
      </section>
    );
  }

  if (error || !snapshot) {
    return (
      <section className="rounded-lg border border-warn/30 bg-warn/10 p-5 text-warn">
        <div className="flex items-center gap-2 font-medium">
          <AlertTriangle size={18} />
          盘前侦察不可用
        </div>
        <p className="mt-2 text-sm">{error || "未知错误"}</p>
      </section>
    );
  }

  return (
    <section className="grid gap-4">
      <div className="rounded-lg border border-info/20 bg-[linear-gradient(135deg,rgba(56,189,248,0.12),rgba(15,23,42,0.78)_45%,rgba(248,113,113,0.12))] p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs tracking-[0.18em] text-info">PREMARKET SCOUT</p>
            <h2 className="mt-3 text-3xl font-semibold">盘前外围侦察</h2>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-muted">{snapshot.summary}</p>
            <p className="mt-2 text-xs text-muted">数据基准：{snapshot.dataBasis} · {formatDateTime(snapshot.fetchedAt)} · 自动刷新 60s</p>
          </div>
          <button
            className="flex w-fit items-center gap-2 rounded-lg border border-info/40 bg-info/10 px-4 py-2 text-sm text-info disabled:opacity-60"
            type="button"
            onClick={() => load(true)}
            disabled={refreshing}
          >
            {refreshing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
            刷新侦察
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <div className="rounded-lg border border-line bg-panel/86 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-bg/70 text-info">
              <Gauge size={20} />
            </span>
            <div>
              <h3 className="font-semibold">外围温度计</h3>
              <p className="text-xs text-muted">越低代表开盘前风险越高</p>
            </div>
          </div>

          <div className="mt-6 flex items-end gap-5">
            <div className="relative h-64 w-16 overflow-hidden rounded-full border border-line bg-bg/70 p-1">
              <div
                className={`absolute bottom-1 left-1 right-1 rounded-full transition-all ${
                  snapshot.temperature >= 60 ? "bg-up" : snapshot.temperature >= 40 ? "bg-warn" : "bg-red-400"
                }`}
                style={{ height: `${Math.max(8, snapshot.temperature)}%` }}
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),transparent_25%,transparent_75%,rgba(0,0,0,0.22))]" />
            </div>
            <div>
              <p className="font-mono text-5xl font-semibold tabular-nums">{snapshot.temperature}</p>
              <p className="mt-1 text-sm text-muted">/ 100</p>
              <span className={`mt-4 inline-flex rounded-lg border px-3 py-1.5 text-sm ${levelClass[snapshot.riskLevel]}`}>
                {snapshot.emotionLabel}
              </span>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-line bg-bg/55 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldAlert size={16} className="text-warn" />
              开盘处理原则
            </div>
            <p className="mt-2 text-xs leading-5 text-muted">
              外围温度偏低时，系统应先观察开盘承接和全 A 宽度，不输出盘前立即买入；若主线逆势走强，只标记弱市穿越观察。
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-lg border border-line bg-panel/86 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-bg/70 text-info">
                <Radar size={18} />
              </span>
              <div>
                <h3 className="font-semibold">风险雷达</h3>
                <p className="text-xs text-muted">规则分桶，暂不由模型主观打分</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {snapshot.buckets.map((bucket) => (
                <div key={bucket.key} className="rounded-lg border border-line bg-bg/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{bucket.label}</p>
                    <span className="font-mono text-sm text-info">{bucket.score}/{bucket.maxScore}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className={bucket.state === "risk" ? "h-full bg-red-400" : bucket.state === "watch" ? "h-full bg-warn" : "h-full bg-info"} style={{ width: `${(bucket.score / bucket.maxScore) * 100}%` }} />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted">{bucket.note}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
            <div className="rounded-lg border border-line bg-panel/86 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-bg/70 text-info">
                  <Globe2 size={18} />
                </span>
                <h3 className="font-semibold">外围市场</h3>
              </div>
              <div className="mt-4 grid gap-4">
                {groupedMarkets.map(([group, items]) => (
                  <div key={group}>
                    <p className="mb-2 text-xs tracking-[0.16em] text-muted">{groupLabels[group] ?? group}</p>
                    <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                      {items.map((item) => (
                        <div key={item.code} className="rounded-lg border border-line bg-bg/50 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-sm font-medium">{item.name}</p>
                            <span className={`font-mono text-sm ${toneClass(item.changePct)}`}>{formatPct(item.changePct)}</span>
                          </div>
                          <p className="mt-1 font-mono text-xs text-muted">{item.latest ?? "--"}</p>
                          <p className="mt-1 text-[11px] text-muted">{formatDataType(item.dataType)} · {item.code}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-line bg-panel/86 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-bg/70 text-info">
                  <CalendarClock size={18} />
                </span>
                <div>
                  <h3 className="font-semibold">宏观日历</h3>
                  <p className="text-xs text-muted">经济数据 / 中央银行 / 高频宏观事件</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                {snapshot.calendarEvents.slice(0, 8).map((event) => (
                  <div key={`${event.date}-${event.time}-${event.content}`} className="rounded-lg border border-line bg-bg/50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-muted">{event.date} {event.time} · {event.country}</p>
                      <span className="rounded border border-warn/30 bg-warn/10 px-1.5 py-0.5 text-[10px] text-warn">权重 {event.weight}</span>
                    </div>
                    <p className="mt-2 text-sm leading-5">{event.content}</p>
                    {(event.previous || event.forecast || event.actual) ? (
                      <p className="mt-2 text-[11px] text-muted">
                        前值 {event.previous ?? "--"} / 预期 {event.forecast ?? "--"} / 实际 {event.actual ?? "--"}
                      </p>
                    ) : null}
                  </div>
                ))}
                {!snapshot.calendarEvents.length ? (
                  <p className="rounded-lg border border-line bg-bg/50 p-3 text-sm text-muted">当前宏观日历没有返回中高权重事件。</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-panel/86 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-bg/70 text-info">
            <CalendarClock size={18} />
          </span>
          <div>
            <h3 className="font-semibold">重大催化</h3>
            <p className="text-xs text-muted">IPO / 监管 / 产业事件，必须有可追溯来源；传闻不参与打分</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {(snapshot.catalystEvents ?? []).map((event) => (
            <a
              key={event.id}
              href={event.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-info/20 bg-info/[0.055] p-3 transition hover:border-info/45"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted">{event.date} / {event.market} / {event.category}</p>
                <span className="rounded border border-info/30 bg-info/10 px-1.5 py-0.5 text-[10px] text-info">权重 {event.weight}</span>
              </div>
              <p className="mt-2 text-sm font-medium leading-5">{event.title}</p>
              <p className="mt-2 text-xs leading-5 text-muted">{event.relevance}</p>
            </a>
          ))}
          {!(snapshot.catalystEvents ?? []).length ? (
            <p className="rounded-lg border border-line bg-bg/50 p-3 text-sm leading-6 text-muted md:col-span-2">
              暂无已确认的重大公司/产业催化。盘前催化只接受可追溯来源；若需要盯特定公司或主题，可配置 PREMARKET_CATALYST_KEYWORDS，未配置时系统不会把传闻或示例事件纳入风险温度。
              <span className="mt-2 block text-muted">当前配置：{snapshot.catalystWatchConfig.note}</span>
              {snapshot.sourceTraces.find((source) => source.key === "sec_company_filings")?.warnings[0] ? (
                <span className="mt-2 block text-warn">
                  校验提示：{snapshot.sourceTraces.find((source) => source.key === "sec_company_filings")?.warnings[0]}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <InfoList title="风险提示" items={snapshot.riskFlags} tone="risk" />
        <InfoList title="开盘观察清单" items={snapshot.watchItems} tone="info" />
      </div>

      <div className="rounded-lg border border-line bg-panel/86 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-bg/70 text-info">
            <Database size={18} />
          </span>
          <div>
            <h3 className="font-semibold">数据来源留痕</h3>
            <p className="text-xs text-muted">只把可追溯数据纳入盘前风险温度，资讯情绪未接入授权源前不参与扣分。</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {snapshot.sourceTraces.map((source) => (
            <div key={source.key} className="rounded-lg border border-line bg-bg/50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{source.label}</p>
                  <p className="mt-1 text-xs text-muted">{source.source}</p>
                </div>
                <span className={`rounded border px-2 py-1 text-[11px] ${sourceStatusClass(source.status)}`}>
                  {formatSourceStatus(source.status)}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <span className="rounded border border-line bg-panel/60 px-2 py-1 text-muted">记录 {source.records}</span>
                <span className="rounded border border-line bg-panel/60 px-2 py-1 text-muted">{formatDateTime(source.fetchedAt)}</span>
              </div>
              {source.warnings.length ? (
                <p className="mt-3 text-xs leading-5 text-warn">{source.warnings[0]}</p>
              ) : (
                <p className="mt-3 text-xs leading-5 text-muted">{source.command ?? source.sourceUrl ?? "来源已记录"}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function InfoList({ title, items, tone }: { title: string; items: string[]; tone: "risk" | "info" }) {
  return (
    <div className="rounded-lg border border-line bg-panel/86 p-4">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-4 grid gap-2">
        {items.map((item) => (
          <div key={item} className={`rounded-lg border px-3 py-2 text-sm leading-5 ${tone === "risk" ? "border-warn/25 bg-warn/10 text-warn" : "border-info/20 bg-info/10 text-info"}`}>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function toneClass(value: number | null) {
  if (value === null) return "text-muted";
  if (value > 0) return "text-up";
  if (value < 0) return "text-down";
  return "text-muted";
}

function formatPct(value: number | null) {
  if (value === null) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatDataType(value?: PremarketSnapshot["markets"][number]["dataType"]) {
  if (value === "futures") return "期指";
  if (value === "fx") return "汇率";
  if (value === "commodity") return "商品";
  return "指数";
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function sourceStatusClass(status: "ok" | "partial" | "failed" | "unavailable") {
  if (status === "ok") return "border-up/30 bg-up/10 text-up";
  if (status === "partial") return "border-warn/30 bg-warn/10 text-warn";
  if (status === "unavailable") return "border-line bg-bg/70 text-muted";
  return "border-down/30 bg-down/10 text-down";
}

function formatSourceStatus(status: "ok" | "partial" | "failed" | "unavailable") {
  if (status === "ok") return "可用";
  if (status === "partial") return "部分可用";
  if (status === "unavailable") return "未接入";
  return "失败";
}
