"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, Pause, Play, Plus, Radar, RefreshCw, ShieldAlert } from "lucide-react";
import { BasicStockNameHover } from "@/components/SelectionStockHover";
import { StockDataHealthBadge } from "@/components/StockDataHealthBadge";
import { fetchApiJson } from "@/lib/client/api";
import { cleanDisplayText as cleanText } from "@/lib/display/text";
import { buildStockDataConsistency, type StockDataConsistencyResult, type StockDataConsistencyTone } from "@/lib/market/stockDataConsistency";
import type { MarketSessionSnapshot } from "@/components/StrategyCockpitTypes";
import type { StockTrackingEvent, StockTrackingItem, StockTrackingSnapshot } from "@/lib/db/stockTracking";

type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };

type TrackingRefreshResult = {
  reportId: string | null;
  updated: number;
  supplemented?: number;
  realtimeUpdated?: number;
  reportFallback?: number;
  unchanged?: number;
  message: string;
  items?: TrackingRefreshItemResult[];
};

type TrackingRefreshItemResult = {
  trackingId: string;
  code: string;
  name: string;
  source: "realtime" | "report";
  previousPrice?: number;
  latestPrice?: number;
  changePct?: number;
  unchanged: boolean;
  createdAt: string;
  fetchedAt?: string;
  quoteUpdatedAt?: string;
  latestKlineDate?: string;
  expectedKlineDate?: string;
  klineFreshnessStatus?: "current" | "stale" | "unknown";
  quality?: string;
  actionabilityLevel?: string;
  sourceLabel?: string;
  baselinePrice?: number;
  latestReturnPct?: number;
  warningCount: number;
  warnings: string[];
};

type TrackingCreateResult = {
  id: string;
  created: boolean;
  baselinePrice?: number;
  baselineSource?: string;
  baselineFetchedAt?: string;
  baselineQuoteUpdatedAt?: string;
  initialSnapshot?: {
    updated?: boolean;
    snapshot?: StockTrackingSnapshot;
    message?: string;
  };
  warnings?: string[];
};

type TrackingSnapshotRaw = {
  supplement?: boolean;
  source?: string;
  fetchedAt?: string;
  quoteUpdatedAt?: string;
  latestKlineDate?: string;
  expectedKlineDate?: string;
  klineFreshnessStatus?: "current" | "stale" | "unknown";
  quality?: string;
  qualityLabel?: string;
  actionability?: {
    level: "actionable" | "reference_only" | "not_actionable" | string;
    label: string;
    reason: string;
    ageMinutes?: number;
    staleAfterMinutes?: number;
    sessionPhase?: string;
  };
  coverage?: {
    quote?: boolean;
    kline?: boolean;
    technical?: boolean;
    fundFlow?: boolean;
  };
  technical?: {
    closePrice?: number;
    ma5?: number;
    ma10?: number;
    ma20?: number;
    ma60?: number;
  };
  klineSummary?: {
    latestClose?: number;
  };
  warnings?: string[];
  missingCandidate?: boolean;
};

export function TrackingWorkspace() {
  const [items, setItems] = useState<StockTrackingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ code: "", name: "", price: "", position: "0", thesis: "" });
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StockTrackingItem["status"]>("active");
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [lastRefreshResult, setLastRefreshResult] = useState<TrackingRefreshResult | null>(null);
  const [session, setSession] = useState<MarketSessionSnapshot | null>(null);
  const autoRefreshStarted = useRef(false);
  const refreshingRef = useRef(false);

  const refreshIntervalMs = session?.isTradingSession ? 60_000 : session?.isTradingDay ? 5 * 60_000 : 30 * 60_000;
  const refreshModeText = session?.isTradingSession
    ? "交易时段：每 60 秒刷新"
    : session?.isTradingDay
      ? "交易日非盘中：每 5 分钟刷新"
      : "非交易日研究模式：每 30 分钟刷新";
  const latestKnownSnapshotAt = useMemo(() => newestTrackingTime(items.map((item) => item.latestSnapshot?.createdAt)), [items]);
  const displayRefreshAt = lastRefreshAt ?? latestKnownSnapshotAt;

  useEffect(() => {
    void loadSession();
    void loadItems().then(() => {
      if (autoRefreshStarted.current) return;
      autoRefreshStarted.current = true;
      if (statusFilter === "active") void refreshSnapshots({ silent: true });
    });
  }, []);

  useEffect(() => {
    void loadItems();
  }, [statusFilter]);

  useEffect(() => {
    if (!autoRefreshEnabled || statusFilter !== "active") return;
    const timer = window.setInterval(() => {
      void refreshSnapshots({ silent: true });
    }, refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, [autoRefreshEnabled, statusFilter, refreshIntervalMs]);

  async function loadSession() {
    try {
      const json = await fetchJson<MarketSessionSnapshot>("/api/market-session", { cache: "no-store" });
      setSession(json.data);
    } catch {
      setSession(null);
    }
  }

  async function loadItems() {
    setLoading(true);
    try {
      const json = await fetchJson<StockTrackingItem[]>(`/api/tracking/items?status=${statusFilter}&t=${Date.now()}`, { cache: "no-store" });
      setItems(json.data ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function createItem() {
    if (!form.code.trim() || !form.name.trim()) {
      setMessage("请先填写股票代码和名称。");
      return;
    }
    setLoading(true);
    try {
      const created = await fetchJson<TrackingCreateResult>("/api/tracking/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim(),
          name: form.name.trim(),
          entryMode: Number(form.position) > 0 ? "simulated_buy" : "watch",
          simulatedPrice: Number(form.price) || undefined,
          simulatedPositionPct: Number(form.position) || 0,
          thesis: form.thesis.trim() || undefined
        })
      });
      setForm({ code: "", name: "", price: "", position: "0", thesis: "" });
      setStatusFilter("active");
      setMessage(buildCreateTrackingMessage(created.data));
      await refreshSnapshots({ silent: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function refreshSnapshots(options: { silent?: boolean } = {}) {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setLoading(true);
    try {
      if (!options.silent) setMessage("正在刷新追踪快照...");
      const json = await fetchJson<TrackingRefreshResult>("/api/tracking/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preferRealtime: true })
      });
      setLastRefreshResult(json.data ?? null);
      setLastRefreshAt(new Date().toISOString());
      if (!options.silent) setMessage(cleanText(json.data?.message) ?? "追踪快照已刷新。");
      void loadSession();
      await loadItems();
    } catch (error) {
      if (!options.silent) setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      refreshingRef.current = false;
      setLoading(false);
    }
  }

  return (
    <section className="grid gap-4">
      <div className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-950/78 shadow-[0_24px_90px_rgba(2,6,23,0.34)]">
        <div className="relative p-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(34,211,238,0.18),transparent_36%),radial-gradient(circle_at_80%_0%,rgba(244,114,182,0.12),transparent_32%)]" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs tracking-[0.18em] text-cyan-200">个股追踪</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-50">个股追踪闭环</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                记录股票加入时的基准价，并持续刷新统一行情快照，用来验证涨跌、风险漂移和数据新鲜度。
              </p>
            </div>
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-4 py-3 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/16 disabled:opacity-60"
                  type="button"
                  disabled={loading}
                  onClick={() => refreshSnapshots()}
                >
                  <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                  刷新快照
                </button>
                <button
                  className={`inline-flex items-center justify-center rounded-xl border px-3 py-3 text-xs transition ${
                    autoRefreshEnabled
                      ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
                      : "border-slate-700 bg-slate-900/70 text-slate-400"
                  }`}
                  type="button"
                  onClick={() => setAutoRefreshEnabled((value) => !value)}
                  title="只刷新追踪快照，不调用大模型。"
                >
                  自动{autoRefreshEnabled ? "开启" : "关闭"}
                </button>
              </div>
              <p className="text-right text-[11px] text-slate-500">
                {autoRefreshEnabled ? refreshModeText : "自动刷新已关闭"}
                {displayRefreshAt ? ` / ${lastRefreshAt ? "上次刷新" : "最近快照"} ${formatShortTime(displayRefreshAt)}` : ""}
              </p>
            </div>
          </div>
        </div>
      </div>

      {message ? <div className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">{message}</div> : null}
      <TrackingRefreshContextPanel session={session} result={lastRefreshResult} lastRefreshAt={lastRefreshAt} latestKnownSnapshotAt={latestKnownSnapshotAt} />
      <TrackingQualityOverview items={items} statusFilter={statusFilter} session={session} />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950/72 p-2">
        {(["active", "paused", "closed"] as const).map((status) => (
          <button
            key={status}
            type="button"
            className={`rounded-xl px-3 py-2 text-sm transition ${statusFilter === status ? "bg-cyan-300/15 text-cyan-100 ring-1 ring-cyan-300/30" : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"}`}
            onClick={() => setStatusFilter(status)}
          >
            {trackingStatusLabel(status)}
          </button>
        ))}
      </div>

      <details className="rounded-2xl border border-slate-800 bg-slate-950/72 p-4" open={createOpen} onToggle={(event) => setCreateOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer list-none">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Plus size={17} className="text-cyan-200" />
              <p className="font-medium text-slate-100">新增追踪标的</p>
            </div>
            <span className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-400">{createOpen ? "收起" : "展开"}</span>
          </div>
          {!createOpen ? <p className="mt-2 text-sm text-slate-500">添加观察股票或模拟仓位。服务端会尝试拉取最新价格作为基准。</p> : null}
        </summary>
        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          <Input label="股票代码" value={form.code} onChange={(value) => setForm((old) => ({ ...old, code: value }))} placeholder="sh600000" />
          <Input label="股票名称" value={form.name} onChange={(value) => setForm((old) => ({ ...old, name: value }))} placeholder="浦发银行" />
          <Input label="兜底价格" value={form.price} onChange={(value) => setForm((old) => ({ ...old, price: value }))} placeholder="行情失败时使用" />
          <Input label="仓位 %" value={form.position} onChange={(value) => setForm((old) => ({ ...old, position: value }))} placeholder="0" />
          <label className="grid gap-1.5 text-sm lg:col-span-3">
            <span className="text-slate-400">追踪逻辑</span>
            <textarea
              className="min-h-20 rounded-xl border border-slate-800 bg-slate-900/72 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-300/60"
              value={form.thesis}
              onChange={(event) => setForm((old) => ({ ...old, thesis: event.target.value }))}
              placeholder="为什么追踪它？什么条件出现后证明判断有效？"
            />
          </label>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-4 py-3 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/16 disabled:opacity-60 lg:self-end"
            type="button"
            disabled={loading}
            onClick={createItem}
          >
            <Plus size={16} />
            加入追踪
          </button>
        </div>
      </details>

      <div className="grid gap-3">
        {loading && !items.length ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/72 p-8 text-center text-slate-400">
            <RefreshCw className="mx-auto animate-spin text-cyan-200" size={28} />
            <p className="mt-3 text-sm">正在读取追踪股票...</p>
          </div>
        ) : items.length ? (
          items.map((item) => <TrackingCard key={item.id} item={item} onChanged={loadItems} />)
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/72 p-8 text-center text-slate-400">
            <Radar className="mx-auto text-cyan-200" size={28} />
            <p className="mt-3 text-sm">暂无{trackingStatusLabel(statusFilter)}追踪股票。</p>
          </div>
        )}
      </div>
    </section>
  );
}

function TrackingCard({ item, onChanged }: { item: StockTrackingItem; onChanged: () => Promise<void> }) {
  const snapshot = item.latestSnapshot;
  const sourceMeta = trackingSnapshotSourceMeta(snapshot?.raw);
  const baselinePrice = resolvedTrackingBaselinePrice(item);
  const followReturnPct = item.performance?.latestReturnPct ?? calcReturnPct(baselinePrice, snapshot?.latestPrice);
  const consistency = buildTrackingDataConsistency(item, snapshot, sourceMeta, baselinePrice);
  const [updating, setUpdating] = useState(false);
  const [localMessage, setLocalMessage] = useState("");

  async function updateStatus(status: StockTrackingItem["status"]) {
    setUpdating(true);
    setLocalMessage("");
    try {
      const json = await fetchJson<{ updated: boolean; message: string }>(`/api/tracking/items/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, note: `manual ${status}` })
      });
      setLocalMessage(cleanText(json.data?.message) ?? "追踪状态已更新。");
      await onChanged();
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/72 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-50">
              <BasicStockNameHover
                stock={{
                  name: cleanText(item.name) ?? item.name,
                  code: item.code,
                  latest: snapshot?.latestPrice,
                  changePct: snapshot?.changePct,
                  note: snapshot ? `${formatRecommendation(snapshot.recommendation)}: ${cleanText(snapshot.recommendationReason)}` : cleanText(item.thesis)
                }}
              />
            </h3>
            <span className="font-mono text-xs text-slate-500">{item.code}</span>
            <Badge>{item.entryMode === "simulated_buy" ? "模拟买入" : "观察"}</Badge>
            <Badge muted>{trackingStatusLabel(item.status)}</Badge>
            {item.derivedState ? <Badge tone={stateTone(item.derivedState.severity)}>{cleanText(item.derivedState.label)}</Badge> : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-400">{cleanText(item.thesis)}</p>
          <BaselineTrace item={item} baselinePrice={baselinePrice} />
          <SnapshotSourceTrace snapshot={snapshot} />
          <TrackingReturnTrace baselinePrice={baselinePrice} snapshot={snapshot} followReturnPct={followReturnPct} />
          <TrackingDataConsistencyCard consistency={consistency} />
          <SnapshotFreshnessBadge snapshot={snapshot} />
        </div>
        <div className="grid gap-2">
          <div className="grid min-w-52 grid-cols-2 gap-2 text-xs">
            <Mini label="基准价" value={formatPrice(baselinePrice)} />
            <Mini label="仓位" value={`${item.simulatedPositionPct}%`} />
            <Mini label="加入以来" value={formatSignedPct(followReturnPct)} tone={returnTone(followReturnPct)} />
            <Mini label="快照" value={snapshot?.createdAt ? formatShortTime(snapshot.createdAt) : "--"} />
          </div>
          <TrackingStatusActions item={item} loading={updating} onUpdate={updateStatus} />
        </div>
      </div>

      {localMessage ? <p className="mt-3 rounded-lg border border-slate-700 bg-slate-900/65 px-3 py-2 text-xs text-slate-300">{localMessage}</p> : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-xl border border-slate-800 bg-slate-900/58 p-3">
          <p className="text-xs text-slate-500">最新追踪视角</p>
          <p className="mt-2 text-xl font-semibold text-cyan-100">{snapshot ? formatRecommendation(snapshot.recommendation) : "等待刷新"}</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">{cleanText(snapshot?.recommendationReason) ?? "刷新快照后生成追踪视角。"}</p>
          {item.derivedState ? (
            <div className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-5 ${statePanelClass(item.derivedState.severity)}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{cleanText(item.derivedState.label)}</span>
                <span className="text-[11px] opacity-80">{stateName(item.derivedState.state)}</span>
              </div>
              <p className="mt-1 opacity-90">{cleanText(item.derivedState.nextAction)}</p>
            </div>
          ) : null}
          {sourceMeta.warnings.length ? (
            <details className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/10 px-2 py-1.5 text-[11px] leading-4 text-amber-100">
              <summary className="cursor-pointer">数据警告 {sourceMeta.warnings.length}</summary>
              <div className="mt-1 grid gap-1">
                {sourceMeta.warnings.slice(0, 4).map((warning, index) => <p key={`${warning}-${index}`}>{cleanText(warning)}</p>)}
              </div>
            </details>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Mini label="最新价" value={formatPrice(snapshot?.latestPrice)} />
          <Mini label="涨跌" value={formatSignedPct(snapshot?.changePct)} tone={returnTone(snapshot?.changePct)} />
          <Mini label="加入以来" value={formatSignedPct(followReturnPct)} tone={returnTone(followReturnPct)} />
          <Mini label="趋势" value={trendStateLabel(snapshot?.trendState)} />
          <Mini label="资金流" value={fundFlowStateLabel(snapshot?.fundFlowState)} />
          <Mini label="天数" value={formatTrackingDays(item.createdAt)} />
          <Mini label="最佳" value={formatSignedPct(item.performance?.bestReturnPct)} tone={returnTone(item.performance?.bestReturnPct)} />
          <Mini label="回撤" value={formatSignedPct(item.performance?.maxDrawdownPct)} tone={returnTone(item.performance?.maxDrawdownPct)} />
        </div>
      </div>

      <TrackingPerformanceStrip item={item} baselinePrice={baselinePrice} />
      <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/8 p-3 text-xs leading-5 text-amber-100/85">
        <div className="flex items-start gap-2">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" />
          <p>失效条件：{cleanText(item.invalidCondition)}</p>
        </div>
      </div>
      <TrackingSnapshotTimeline trackingId={item.id} baselinePrice={baselinePrice} refreshKey={item.latestSnapshot?.id} />
      <TrackingEventTimeline trackingId={item.id} refreshKey={item.latestSnapshot?.id} />
    </div>
  );
}

function TrackingRefreshContextPanel({
  session,
  result,
  lastRefreshAt,
  latestKnownSnapshotAt
}: {
  session: MarketSessionSnapshot | null;
  result: TrackingRefreshResult | null;
  lastRefreshAt: string | null;
  latestKnownSnapshotAt: string | null;
}) {
  const displayRefreshAt = lastRefreshAt ?? latestKnownSnapshotAt;
  return (
    <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/72 p-3">
      <div className="grid gap-3 md:grid-cols-[1.1fr_1.4fr]">
        <div>
          <p className="text-sm font-medium text-slate-100">{cleanText(session?.phaseLabel) ?? "正在读取市场时段"}</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            {session?.canUseRealtimeQuotes
              ? "当前可使用实时/延迟行情，刷新时优先采用当前报价。"
              : session
                ? `${cleanText(session.expectedDataBasis) ?? session.expectedDataBasis}：价格可能停留在最近一个有效交易快照。`
                : "市场时段读取中。快照刷新仍会记录来源和时间戳。"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs lg:grid-cols-6">
          <Tiny label={lastRefreshAt ? "上次刷新" : "最近快照"} value={displayRefreshAt ? formatShortTime(displayRefreshAt) : "--"} />
          <Tiny label="交易日" value={formatTradeDate(session?.effectiveTradeDate)} />
          <Tiny label="更新" value={result ? `${result.updated}` : "--"} />
          <Tiny label="实时" value={result?.realtimeUpdated !== undefined ? `${result.realtimeUpdated}` : "--"} tone={result?.realtimeUpdated ? "up" : "neutral"} />
          <Tiny label="兜底" value={result?.reportFallback !== undefined ? `${result.reportFallback}` : "--"} tone={result?.reportFallback ? "down" : "neutral"} />
          <Tiny label="未变" value={result?.unchanged !== undefined ? `${result.unchanged}` : "--"} />
        </div>
      </div>
      {result ? (
        <p className="rounded-xl border border-slate-800 bg-slate-900/45 px-3 py-2 text-xs leading-5 text-slate-400">
          {trackingRefreshResultHint(result)}
        </p>
      ) : null}
      {result?.items?.length ? <TrackingRefreshDetailList items={result.items} /> : null}
    </div>
  );
}

function TrackingRefreshDetailList({ items }: { items: TrackingRefreshItemResult[] }) {
  return (
    <details className="rounded-xl border border-slate-800 bg-slate-900/45 p-3" open>
      <summary className="cursor-pointer text-sm font-medium text-cyan-100">
        最新刷新明细 {items.length} 只
      </summary>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {items.slice(0, 6).map((item) => (
          <div key={`${item.trackingId}-${item.createdAt}`} className="rounded-lg border border-slate-800 bg-slate-950/45 p-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-100" title={cleanText(item.name) ?? item.name}>{cleanText(item.name) ?? item.name}</p>
                <p className="mt-0.5 font-mono text-[11px] text-slate-500">{item.code}</p>
              </div>
              <span className={`rounded border px-1.5 py-0.5 text-[10px] ${item.source === "realtime" ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100" : "border-amber-300/25 bg-amber-300/10 text-amber-100"}`}>
                {item.source === "realtime" ? "实时" : "报告"}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1">
              <Tiny label="价格" value={formatPrice(item.latestPrice)} />
              <Tiny label="收益" value={formatSignedPct(item.latestReturnPct)} tone={returnTone(item.latestReturnPct)} />
              <Tiny label="状态" value={item.unchanged ? "未变" : "变化"} tone={item.unchanged ? "neutral" : "up"} />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-slate-500">
              报价 {formatShortTime(item.quoteUpdatedAt ?? item.fetchedAt ?? item.createdAt)}
              {item.quality ? ` / ${snapshotQualityLabel(item.quality)}` : ""}
              {item.actionabilityLevel ? ` / ${actionabilityLevelLabel(item.actionabilityLevel)}` : ""}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">
              K线 {formatTradeDate(item.latestKlineDate)} / 预期 {formatTradeDate(item.expectedKlineDate)}
              {item.klineFreshnessStatus ? ` / ${klineFreshnessLabel(item.klineFreshnessStatus)}` : ""}
            </p>
            {item.unchanged ? (
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                价格未变通常表示当前非连续竞价、原始行情未更新，或报价仍停留在最近有效交易快照。
              </p>
            ) : null}
            {item.warningCount ? <p className="mt-1 text-[11px] text-amber-100">警告 {item.warningCount}</p> : null}
          </div>
        ))}
        {items.length > 6 ? <p className="rounded-lg border border-slate-800 bg-slate-950/45 p-2 text-xs text-slate-500">还有 {items.length - 6} 只已刷新，当前折叠展示。</p> : null}
      </div>
    </details>
  );
}

function TrackingQualityOverview({
  items,
  statusFilter,
  session
}: {
  items: StockTrackingItem[];
  statusFilter: StockTrackingItem["status"];
  session: MarketSessionSnapshot | null;
}) {
  const stats = useMemo(() => {
    const qualityItems = items.map((item) => trackingSnapshotCurrentUseState(item.latestSnapshot, session));
    const stale = qualityItems.filter((item) => item.state === "stale").length;
    const referenceOnly = qualityItems.filter((item) => item.state === "reference_only").length;
    const actionable = qualityItems.filter((item) => item.state === "actionable").length;
    const missing = items.filter((item) => item.derivedState?.state === "data_insufficient" || !item.latestSnapshot).length;
    const calculable = items.filter((item) => {
      const baselinePrice = resolvedTrackingBaselinePrice(item);
      return item.performance?.latestReturnPct !== undefined || calcReturnPct(baselinePrice, item.latestSnapshot?.latestPrice) !== undefined;
    }).length;
    const triggered = items.filter((item) => item.derivedState?.state === "triggered").length;
    const risk = items.filter((item) => item.derivedState?.state === "risk_deteriorating" || item.derivedState?.state === "invalidated").length;
    return { stale, referenceOnly, actionable, missing, calculable, triggered, risk };
  }, [items, session]);

  return (
    <section className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.05] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs tracking-[0.16em] text-cyan-100">追踪数据质量</p>
          <h3 className="mt-1 text-base font-semibold text-slate-100">追踪闭环质量</h3>
          <p className="mt-2 max-w-4xl text-xs leading-5 text-slate-400">
            检查基准价、后续快照、加入以来涨跌和状态迁移是否形成可复盘闭环。盘中优先看可行动快照，闭市/盘后则按最近有效快照复盘。
          </p>
        </div>
        <span className="rounded-lg border border-slate-700 bg-slate-950/55 px-2 py-1 text-xs text-slate-300">
          筛选：{trackingStatusLabel(statusFilter)}
        </span>
      </div>
      <div className="mt-4 grid gap-2 text-xs md:grid-cols-3 xl:grid-cols-8">
        <Tiny label="数量" value={`${items.length}`} />
        <Tiny label="快照" value={`${items.filter((item) => item.latestSnapshot).length}`} />
        <Tiny label="基准" value={`${items.filter((item) => resolvedTrackingBaselinePrice(item) !== undefined).length}`} />
        <Tiny label="收益可算" value={`${stats.calculable}`} tone={stats.calculable === items.length && items.length ? "up" : "neutral"} />
        <Tiny label="可行动" value={`${stats.actionable}`} tone={stats.actionable ? "up" : "neutral"} />
        <Tiny label="仅参考/过期" value={`${stats.referenceOnly}/${stats.stale}`} tone={stats.stale ? "down" : stats.referenceOnly ? "neutral" : "up"} />
        <Tiny label="缺失" value={`${stats.missing}`} tone={stats.missing ? "down" : "neutral"} />
        <Tiny label="触发/风险" value={`${stats.triggered}/${stats.risk}`} tone={stats.risk ? "down" : stats.triggered ? "up" : "neutral"} />
      </div>
    </section>
  );
}

function TrackingPerformanceStrip({ item, baselinePrice }: { item: StockTrackingItem; baselinePrice?: number }) {
  const performance = item.performance;
  const points = performance?.recentPoints ?? [];
  const latestReturn = performance?.latestReturnPct;
  return (
    <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/42 p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={returnTone(latestReturn) === "up" ? "up" : returnTone(latestReturn) === "down" ? "down" : "neutral"}>
              {latestReturn === undefined ? "等待验证" : latestReturn >= 0 ? "正向验证" : "承压"}
            </Badge>
            <span className="text-xs text-slate-500">
              加入以来 {formatSignedPct(latestReturn)} / 快照 {performance?.snapshotCount || "--"}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            基准价优先取加入时记录价，其次取模拟买入价，缺失时使用首个有效快照。判断价格敏感结论前请先刷新。
          </p>
        </div>
        <div className="grid min-w-[280px] gap-2">
          <MiniSparkline points={points} baselinePrice={baselinePrice} />
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Tiny label="当前" value={formatSignedPct(performance?.latestReturnPct)} tone={returnTone(performance?.latestReturnPct)} />
            <Tiny label="最好" value={formatSignedPct(performance?.bestReturnPct)} tone={returnTone(performance?.bestReturnPct)} />
            <Tiny label="回撤" value={formatSignedPct(performance?.maxDrawdownPct)} tone={returnTone(performance?.maxDrawdownPct)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function trackingRefreshResultHint(result: TrackingRefreshResult) {
  const updated = result.updated || 0;
  const unchanged = result.unchanged || 0;
  const realtime = result.realtimeUpdated || 0;
  const fallback = result.reportFallback || 0;
  if (!updated) return "本次没有活跃追踪标的需要刷新。";
  if (unchanged >= updated) {
    return `本次 ${updated} 只已写入新快照，但价格全部未变；这通常表示行情源仍停留在最近有效报价、当前非连续竞价，或刷新间隔内个股报价没有更新。`;
  }
  if (unchanged > 0) {
    return `本次 ${updated} 只已写入新快照，其中 ${updated - unchanged} 只价格变化、${unchanged} 只价格未变；请以“报价时间”和“可行动/仅参考”判断数据新鲜度。`;
  }
  if (fallback > 0) {
    return `本次 ${updated} 只已刷新，${realtime} 只使用统一行情，${fallback} 只回退报告快照；回退项只适合复盘参考。`;
  }
  return `本次 ${updated} 只已刷新，价格均有变化；收益验证已按最新快照重新计算。`;
}

function MiniSparkline({ points, baselinePrice }: { points: NonNullable<StockTrackingItem["performance"]>["recentPoints"]; baselinePrice?: number }) {
  const values = points.map((point) => point.price).filter((value) => Number.isFinite(value));
  if (values.length < 2) {
    return <div className="flex h-16 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/50 text-xs text-slate-500">快照不足，等待后续刷新</div>;
  }
  const min = Math.min(...values, baselinePrice ?? values[0]);
  const max = Math.max(...values, baselinePrice ?? values[0]);
  const range = Math.max(0.01, max - min);
  const path = values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
      const y = 56 - ((value - min) / range) * 48;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  const baselineY = baselinePrice ? 56 - ((baselinePrice - min) / range) * 48 : undefined;
  const up = values.at(-1)! >= values[0];
  return (
    <svg className="h-16 w-full rounded-lg border border-slate-800 bg-slate-950/50" viewBox="0 0 100 64" preserveAspectRatio="none">
      {baselineY !== undefined ? <line x1="0" x2="100" y1={baselineY} y2={baselineY} stroke="rgba(148,163,184,.35)" strokeDasharray="3 3" /> : null}
      <path d={path} fill="none" stroke={up ? "rgb(110 231 183)" : "rgb(253 164 175)"} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function TrackingSnapshotTimeline({ trackingId, baselinePrice, refreshKey }: { trackingId: string; baselinePrice?: number; refreshKey?: string }) {
  const [snapshots, setSnapshots] = useState<StockTrackingSnapshot[]>([]);
  useEffect(() => {
    let alive = true;
    fetchJson<StockTrackingSnapshot[]>(`/api/tracking/items/${trackingId}/snapshots?limit=8`, { cache: "no-store" })
      .then((json) => {
        if (alive) setSnapshots(json.data ?? []);
      })
      .catch(() => {
        if (alive) setSnapshots([]);
      });
    return () => {
      alive = false;
    };
  }, [trackingId, refreshKey]);
  if (!snapshots.length) return null;
  return (
    <details className="mt-3 rounded-xl border border-slate-800 bg-slate-900/35 p-3">
      <summary className="cursor-pointer text-sm font-medium text-cyan-100">快照时间线</summary>
      <div className="mt-3 grid gap-2">
        {snapshots.map((snapshot, index) => {
          const returnPct = calcReturnPct(baselinePrice, snapshot.latestPrice);
          return (
            <div key={snapshot.id} className="rounded-lg border border-slate-800 bg-slate-950/45 p-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={index === 0 ? "text-cyan-100" : "text-slate-300"}>{formatShortTime(snapshot.createdAt)}</span>
                <span className={returnTone(returnPct) === "up" ? "text-emerald-200" : returnTone(returnPct) === "down" ? "text-rose-200" : "text-slate-300"}>
                  {formatPrice(snapshot.latestPrice)} / {formatSignedPct(returnPct)}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-slate-500">{cleanText(snapshot.recommendationReason)}</p>
            </div>
          );
        })}
      </div>
    </details>
  );
}

function TrackingEventTimeline({ trackingId, refreshKey }: { trackingId: string; refreshKey?: string }) {
  const [events, setEvents] = useState<StockTrackingEvent[]>([]);
  useEffect(() => {
    let alive = true;
    fetchJson<StockTrackingEvent[]>(`/api/tracking/items/${trackingId}/events?limit=8`, { cache: "no-store" })
      .then((json) => {
        if (alive) setEvents(json.data ?? []);
      })
      .catch(() => {
        if (alive) setEvents([]);
      });
    return () => {
      alive = false;
    };
  }, [trackingId, refreshKey]);
  if (!events.length) return null;
  return (
    <details className="mt-3 rounded-xl border border-slate-800 bg-slate-900/35 p-3">
      <summary className="cursor-pointer text-sm font-medium text-cyan-100">追踪事件</summary>
      <div className="mt-3 grid gap-2">
        {events.map((event) => (
          <div key={event.id} className="rounded-lg border border-slate-800 bg-slate-950/45 p-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-300">{eventTypeLabel(event.eventType)}</span>
              <span className="text-slate-500">{formatShortTime(event.createdAt)}</span>
            </div>
            <p className="mt-1 text-slate-400">{cleanText(event.message)}</p>
          </div>
        ))}
      </div>
    </details>
  );
}

function BaselineTrace({ item, baselinePrice }: { item: StockTrackingItem; baselinePrice?: number }) {
  const trace = item.baselineTrace;
  const source = trace?.source ?? (item.simulatedPrice ? "manual/simulatedPrice" : "tracking:first-valid-snapshot");
  const sourceLabel = baselineSourceLabel(source);
  const sourceHint = baselineSourceHint(source, trace?.warnings);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
      <span className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-2 py-1 text-cyan-100">基准价：{formatPrice(baselinePrice)}</span>
      <span className="rounded-lg border border-slate-700 bg-slate-900/60 px-2 py-1 text-slate-300" title={sourceHint}>
        基准来源：{sourceLabel}
      </span>
      <span className="rounded-lg border border-slate-700 bg-slate-900/60 px-2 py-1 text-slate-400">获取：{formatShortTime(trace?.fetchedAt ?? item.createdAt)}</span>
      {trace?.quoteUpdatedAt ? <span className="rounded-lg border border-slate-700 bg-slate-900/60 px-2 py-1 text-slate-400">基准报价：{formatShortTime(trace.quoteUpdatedAt)}</span> : null}
      {!trace?.quoteUpdatedAt && baselinePrice !== undefined ? (
        <span
          className="rounded-lg border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-amber-100"
          title="旧追踪记录通常只保存系统获取时间，没有保存行情本身的更新时间；收益可复盘，但短线口径需要结合最新快照。"
        >
          旧基准缺少报价时间
        </span>
      ) : null}
      {trace?.warnings.length ? <span className="rounded-lg border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-amber-100">基准警告 {trace.warnings.length}</span> : null}
    </div>
  );
}

function SnapshotSourceTrace({ snapshot }: { snapshot?: StockTrackingSnapshot }) {
  const meta = trackingSnapshotSourceMeta(snapshot?.raw);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
      <span className={`rounded-lg border px-2 py-1 ${meta.badgeClass}`}>快照：{meta.label}</span>
      {meta.qualityLabel ? <span className={`rounded-lg border px-2 py-1 ${qualityBadgeClass(meta.quality)}`}>质量：{cleanText(meta.qualityLabel)}</span> : null}
      <span className="rounded-lg border border-slate-700 bg-slate-900/60 px-2 py-1 text-slate-300" title={sourceExplain(meta.source)}>来源：{meta.shortSource}</span>
      <span className="rounded-lg border border-slate-700 bg-slate-900/60 px-2 py-1 text-slate-400">获取：{formatShortTime(meta.fetchedAt ?? snapshot?.createdAt)}</span>
      {meta.quoteUpdatedAt ? <span className="rounded-lg border border-slate-700 bg-slate-900/60 px-2 py-1 text-slate-400">报价：{formatShortTime(meta.quoteUpdatedAt)}</span> : null}
    </div>
  );
}

function TrackingReturnTrace({
  baselinePrice,
  snapshot,
  followReturnPct
}: {
  baselinePrice?: number;
  snapshot?: StockTrackingSnapshot;
  followReturnPct?: number;
}) {
  if (baselinePrice === undefined || snapshot?.latestPrice === undefined) {
    return (
      <div className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-100">
        加入以来收益暂不可算：缺少基准价或最新追踪快照价格。请先刷新追踪快照。
      </div>
    );
  }
  return (
    <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/45 px-3 py-2 text-xs leading-5 text-slate-300">
      收益依据：基准 {formatPrice(baselinePrice)} 到最新 {formatPrice(snapshot.latestPrice)}
      <span className={`ml-2 font-medium ${toneClass(returnTone(followReturnPct))}`}>{formatSignedPct(followReturnPct)}</span>
      <span className="ml-2 text-slate-500">最新快照 {formatShortTime(snapshot.createdAt)}</span>
    </div>
  );
}

function TrackingDataConsistencyCard({ consistency }: { consistency: StockDataConsistencyResult }) {
  return (
    <div className={`mt-2 rounded-lg border px-3 py-2 text-xs leading-5 ${consistencyToneClass(consistency.tone)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{consistency.label}</span>
        <span className="text-[11px] opacity-80">{consistency.tone === "ok" ? "可复盘" : consistency.tone === "review" ? "需复核" : "有冲突"}</span>
      </div>
      <p className="mt-1 opacity-90">{consistency.summary}</p>
      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] opacity-90">查看口径证据</summary>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {consistency.checks.map((check) => (
            <div key={check.key} className={`rounded border px-2 py-1.5 ${consistencyMiniClass(check.tone)}`} title={check.detail}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] opacity-75">{check.label}</span>
                <span className="font-mono text-[10px] opacity-75">{check.tone === "ok" ? "正常" : check.tone === "review" ? "复核" : "冲突"}</span>
              </div>
              <p className="mt-0.5 truncate text-[11px]">{check.value}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function SnapshotFreshnessBadge({ snapshot }: { snapshot?: StockTrackingSnapshot }) {
  if (!snapshot) {
    return <div className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-100">暂无追踪快照，请先刷新。</div>;
  }
  const meta = trackingSnapshotSourceMeta(snapshot.raw);
  return (
    <StockDataHealthBadge
      className="mt-2"
      quality={meta.quality}
      qualityLabel={cleanText(meta.qualityLabel)}
      actionability={meta.actionability ? { ...meta.actionability, label: cleanText(meta.actionability.label) ?? meta.actionability.label, reason: cleanText(meta.actionability.reason) ?? meta.actionability.reason } : undefined}
      coverage={meta.coverage}
      fetchedAt={meta.fetchedAt ?? snapshot.createdAt}
      quoteUpdatedAt={meta.quoteUpdatedAt}
      source={meta.source}
      warnings={meta.warnings.map((warning) => cleanText(warning) ?? warning)}
    />
  );
}

function TrackingStatusActions({ item, loading, onUpdate }: { item: StockTrackingItem; loading: boolean; onUpdate: (status: StockTrackingItem["status"]) => Promise<void> }) {
  if (item.status === "closed") return <ActionButton icon={Play} label="恢复" disabled={loading} onClick={() => onUpdate("active")} tone="info" />;
  if (item.status === "paused") {
    return (
      <div className="flex flex-wrap gap-2">
        <ActionButton icon={Play} label="恢复" disabled={loading} onClick={() => onUpdate("active")} tone="up" />
        <ActionButton icon={Archive} label="结束" disabled={loading} onClick={() => onUpdate("closed")} tone="down" />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton icon={Pause} label="暂停" disabled={loading} onClick={() => onUpdate("paused")} tone="warn" />
      <ActionButton icon={Archive} label="结束" disabled={loading} onClick={() => onUpdate("closed")} tone="down" />
    </div>
  );
}

function ActionButton({ icon: Icon, label, disabled, onClick, tone }: { icon: typeof Pause; label: string; disabled: boolean; onClick: () => void; tone: "info" | "up" | "warn" | "down" }) {
  const classes = {
    info: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/15",
    up: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/15",
    warn: "border-amber-300/25 bg-amber-300/10 text-amber-100 hover:bg-amber-300/15",
    down: "border-rose-300/25 bg-rose-300/10 text-rose-100 hover:bg-rose-300/15"
  };
  return (
    <button className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs transition disabled:opacity-60 ${classes[tone]}`} type="button" disabled={disabled} onClick={onClick}>
      <Icon size={13} />
      {label}
    </button>
  );
}

function Badge({ children, muted, tone = "info" }: { children: ReactNode; muted?: boolean; tone?: "info" | "up" | "down" | "warn" | "neutral" }) {
  const className = muted ? "border-slate-700 bg-slate-900/80 text-slate-300" : badgeClass(tone);
  return <span className={`rounded border px-2 py-0.5 text-[11px] ${className}`}>{children}</span>;
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-slate-400">{label}</span>
      <input className="rounded-xl border border-slate-800 bg-slate-900/72 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-300/60" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Mini({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "up" | "down" | "neutral" }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/58 px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-sm font-medium ${toneClass(tone)}`}>{value}</p>
    </div>
  );
}

function Tiny({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "up" | "down" | "neutral" }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900/60 px-1.5 py-1">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className={`mt-0.5 truncate text-[11px] ${toneClass(tone)}`}>{value}</p>
    </div>
  );
}

function trackingSnapshotSourceMeta(raw: unknown) {
  const payload = raw && typeof raw === "object" ? raw as TrackingSnapshotRaw : {};
  const supplemented = Boolean(payload.supplement);
  const missingCandidate = Boolean(payload.missingCandidate);
  const source = typeof payload.source === "string" && payload.source.trim()
    ? payload.source
    : missingCandidate
      ? "report:candidate-missing"
      : "analysis-report:snapshot";
  const warnings = Array.isArray(payload.warnings) ? payload.warnings.map(String).filter(Boolean) : [];
  const label = supplemented ? "统一行情补充" : missingCandidate ? "报告缺少候选" : "报告快照";
  const badgeClass = supplemented
    ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
    : missingCandidate
      ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
      : "border-slate-700 bg-slate-900/60 text-slate-300";
  return {
    label,
    badgeClass,
    source,
    shortSource: sourceLabel(source),
    fetchedAt: payload.fetchedAt,
    quoteUpdatedAt: payload.quoteUpdatedAt,
    latestKlineDate: payload.latestKlineDate,
    expectedKlineDate: payload.expectedKlineDate,
    klineFreshnessStatus: payload.klineFreshnessStatus,
    klineClose: readKlineClose(payload),
    quality: payload.quality,
    qualityLabel: payload.qualityLabel,
    actionability: payload.actionability,
    coverage: payload.coverage,
    warnings
  };
}

function trackingSnapshotCurrentUseState(snapshot: StockTrackingSnapshot | undefined, session: MarketSessionSnapshot | null) {
  if (!snapshot) return { state: "missing" as const, label: "缺少快照" };
  const meta = trackingSnapshotSourceMeta(snapshot.raw);
  if (meta.actionability?.level === "actionable") return { state: "actionable" as const, label: cleanText(meta.actionability.label) ?? meta.actionability.label };
  if (meta.actionability?.level === "reference_only") return { state: "reference_only" as const, label: cleanText(meta.actionability.label) ?? meta.actionability.label };
  if (meta.actionability?.level === "not_actionable") return { state: "stale" as const, label: cleanText(meta.actionability.label) ?? meta.actionability.label };

  const age = snapshotAgeMinutes(meta.fetchedAt ?? snapshot.createdAt);
  if (age === null) return { state: "reference_only" as const, label: "时间待确认" };
  if (session?.isTradingSession) {
    return age > 20
      ? { state: "stale" as const, label: "盘中快照滞后" }
      : { state: "actionable" as const, label: "盘中可复核" };
  }
  if (session?.isTradingDay) {
    return age > 240
      ? { state: "reference_only" as const, label: "非盘中复盘快照" }
      : { state: "reference_only" as const, label: "交易日非盘中快照" };
  }
  return { state: "reference_only" as const, label: "闭市复盘快照" };
}

function buildTrackingDataConsistency(
  item: StockTrackingItem,
  snapshot: StockTrackingSnapshot | undefined,
  meta: ReturnType<typeof trackingSnapshotSourceMeta>,
  baselinePrice?: number
) {
  return buildStockDataConsistency({
    latestPrice: snapshot?.latestPrice,
    baselinePrice,
    baselineFetchedAt: item.baselineTrace?.quoteUpdatedAt ?? item.baselineTrace?.fetchedAt ?? item.createdAt,
    quoteUpdatedAt: meta.quoteUpdatedAt,
    snapshotFetchedAt: meta.fetchedAt ?? snapshot?.createdAt,
    latestKlineTradeDate: meta.latestKlineDate,
    expectedKlineTradeDate: meta.expectedKlineDate,
    klineFreshnessStatus: meta.klineFreshnessStatus,
    klineClose: meta.klineClose,
    referencePrice: item.simulatedPrice,
    referenceLabel: item.entryMode === "simulated_buy" ? "模拟买入价" : "加入记录价"
  });
}

function readKlineClose(payload: TrackingSnapshotRaw) {
  return finiteNumber(payload.technical?.closePrice) ?? finiteNumber(payload.klineSummary?.latestClose);
}

function resolvedTrackingBaselinePrice(item: StockTrackingItem) {
  return item.baselineTrace?.price ?? item.performance?.baselinePrice ?? item.simulatedPrice;
}

function buildCreateTrackingMessage(result?: TrackingCreateResult | null) {
  if (!result) return "已加入追踪，系统将刷新最新快照。";
  const parts = [
    result.created ? "已加入追踪" : "已在追踪中",
    result.baselinePrice !== undefined ? `基准价 ${formatPrice(result.baselinePrice)}` : "基准价待补"
  ];
  if (result.created) {
    parts.push(result.initialSnapshot?.snapshot?.latestPrice !== undefined ? `快照价 ${formatPrice(result.initialSnapshot.snapshot.latestPrice)}` : "快照价待补");
  } else {
    parts.push("复用已有记录");
  }
  if (result.baselineSource) parts.push(`来源 ${sourceLabel(result.baselineSource)}`);
  if (result.warnings?.length) parts.push(`提示 ${result.warnings.length} 条`);
  return `${parts.join(" / ")}。`;
}

function calcReturnPct(base?: number, latest?: number) {
  if (!base || !latest || base <= 0) return undefined;
  return ((latest - base) / base) * 100;
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatPrice(value?: number) {
  return value === undefined || !Number.isFinite(value) ? "--" : value.toFixed(2);
}

function formatSignedPct(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatShortTime(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function newestTrackingTime(values: Array<string | undefined>) {
  let newest = "";
  for (const value of values) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) continue;
    if (!newest || time > new Date(newest).getTime()) newest = value;
  }
  return newest || null;
}

function formatTradeDate(value?: string) {
  if (!value) return "--";
  if (/^\d{8}$/.test(value)) return `${value.slice(4, 6)}/${value.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value.slice(5, 7)}/${value.slice(8, 10)}`;
  return value;
}

function formatTrackingDays(createdAt: string) {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return "--";
  const days = Math.max(0, Math.floor((Date.now() - created) / 86_400_000));
  return days === 0 ? "0 天" : `${days} 天`;
}

function snapshotAgeMinutes(value?: string) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.round((Date.now() - time) / 60_000));
}

function trackingStatusLabel(status: StockTrackingItem["status"]) {
  if (status === "active") return "追踪中";
  if (status === "paused") return "已暂停";
  return "已结束";
}

function formatRecommendation(value?: string) {
  return cleanText(value) ?? "--";
}

function trendStateLabel(value?: string) {
  const labels: Record<string, string> = {
    uptrend: "上升趋势",
    downtrend: "下降趋势",
    above_ma20: "站上 MA20",
    below_ma20: "跌破 MA20",
    reclaim_ma20: "收复 MA20",
    range: "震荡",
    unknown: "未知"
  };
  return value ? labels[value] ?? cleanText(value) ?? value : "--";
}

function fundFlowStateLabel(value?: string) {
  const labels: Record<string, string> = {
    inflow: "资金流入",
    outflow: "资金流出",
    flat: "资金平稳",
    mixed: "资金分歧",
    unknown: "未知"
  };
  return value ? labels[value] ?? cleanText(value) ?? value : "--";
}

function eventTypeLabel(eventType: string) {
  const labels: Record<string, string> = {
    created: "创建追踪",
    baseline_quote: "记录基准价",
    duplicate_ignored: "重复忽略",
    state_initialized: "状态初始化",
    state_changed: "状态变化",
    tracking_paused: "暂停追踪",
    tracking_closed: "结束追踪",
    tracking_resumed: "恢复追踪",
    tracking_status_changed: "追踪状态变更"
  };
  return labels[eventType] ?? eventType;
}

function sourceLabel(source: string) {
  if (source.includes("realtime") || source.includes("stock-snapshot")) return "统一实时快照";
  if (source.includes("eastmoney")) return source.includes("westock") ? "东方财富 + westock 补源" : "东方财富";
  if (source.includes("westock")) return "westock 补源";
  if (source.includes("tushare")) return "Tushare 补源";
  if (source.includes("candidate-missing")) return "报告缺少候选";
  if (source.includes("analysis-report")) return "历史报告快照";
  if (source.includes("tracking:first-valid-snapshot")) return "首个有效追踪快照";
  if (source.includes("tracking:item.simulatedPrice")) return "加入时记录价";
  if (source.includes("manual")) return "手工/调用方兜底";
  return source.length > 20 ? `${source.slice(0, 20)}...` : source;
}

function sourceExplain(source: string) {
  if (source.includes("analysis-report")) return "该数据来自历史分析报告，不等同于当前实时行情。涉及买点或收益验证请先刷新追踪快照。";
  if (source.includes("candidate-missing")) return "最近报告没有覆盖该股票，系统只能保留追踪记录并等待补数。";
  if (source.includes("tracking:first-valid-snapshot")) return "历史追踪缺少加入时基准价，系统使用第一条有效快照作为收益基准。";
  if (source.includes("manual")) return "基准价来自手动输入或调用方传入，后续收益需要结合刷新快照验证。";
  if (source.includes("eastmoney") || source.includes("westock") || source.includes("tushare")) return "该数据来自统一行情补数链路，已保留来源和抓取时间。";
  return source;
}

function baselineSourceLabel(source: string) {
  return sourceLabel(source);
}

function baselineSourceHint(source: string, warnings?: string[]) {
  const base = sourceExplain(source);
  const warningText = warnings?.length ? ` 警告：${warnings.map((item) => cleanText(item) ?? item).join("；")}` : "";
  return `${base}${warningText}`;
}

function qualityBadgeClass(quality?: string) {
  if (quality === "complete") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (quality === "partial") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  if (quality === "quote_only") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-rose-300/25 bg-rose-300/10 text-rose-100";
}

function snapshotQualityLabel(quality: string) {
  if (quality === "complete") return "完整";
  if (quality === "partial") return "部分完整";
  if (quality === "quote_only") return "仅报价";
  if (quality === "missing") return "缺失";
  return quality;
}

function klineFreshnessLabel(status: string) {
  if (status === "current") return "K线已对齐";
  if (status === "stale") return "K线滞后";
  if (status === "unknown") return "交易日待确认";
  return status;
}

function actionabilityLevelLabel(level: string) {
  if (level === "actionable") return "盘中可行动";
  if (level === "reference_only") return "研究参考";
  if (level === "not_actionable") return "不可行动";
  return level;
}

function returnTone(value?: number): "up" | "down" | "neutral" {
  if (value === undefined || Math.abs(value) < 0.01) return "neutral";
  return value > 0 ? "up" : "down";
}

function stateTone(severity: string): "info" | "up" | "down" | "warn" | "neutral" {
  if (severity === "positive") return "up";
  if (severity === "warning") return "warn";
  if (severity === "danger") return "down";
  if (severity === "muted") return "neutral";
  return "info";
}

function badgeClass(tone: "info" | "up" | "down" | "warn" | "neutral") {
  if (tone === "up") return "border-emerald-300/35 bg-emerald-300/10 text-emerald-100";
  if (tone === "down") return "border-rose-300/35 bg-rose-300/10 text-rose-100";
  if (tone === "warn") return "border-amber-300/35 bg-amber-300/10 text-amber-100";
  if (tone === "neutral") return "border-slate-700 bg-slate-800/60 text-slate-400";
  return "border-cyan-300/30 bg-cyan-300/10 text-cyan-100";
}

function toneClass(tone: "up" | "down" | "neutral") {
  if (tone === "up") return "text-emerald-200";
  if (tone === "down") return "text-rose-200";
  return "text-slate-100";
}

function consistencyToneClass(tone: StockDataConsistencyTone) {
  if (tone === "ok") return "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100";
  if (tone === "review") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-rose-300/25 bg-rose-300/10 text-rose-100";
}

function consistencyMiniClass(tone: StockDataConsistencyTone) {
  if (tone === "ok") return "border-emerald-300/15 bg-emerald-300/[0.05]";
  if (tone === "review") return "border-amber-300/20 bg-amber-300/[0.06]";
  return "border-rose-300/20 bg-rose-300/[0.06]";
}

function statePanelClass(severity: string) {
  if (severity === "positive") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (severity === "warning") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (severity === "danger") return "border-rose-300/25 bg-rose-300/10 text-rose-100";
  if (severity === "muted") return "border-slate-700 bg-slate-900/70 text-slate-400";
  return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
}

function stateName(state: string) {
  const labels: Record<string, string> = {
    watching: "观察中",
    triggered: "已触发",
    risk_deteriorating: "风险转弱",
    invalidated: "已失效",
    data_insufficient: "数据不足"
  };
  return labels[state] ?? state;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<ApiResponse<T>> {
  return fetchApiJson<T>(url, init);
}
