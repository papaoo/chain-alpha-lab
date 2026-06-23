"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BellPlus, CheckCircle2, Loader2 } from "lucide-react";
import { StockKLineHoverCard } from "@/components/StockKLineHoverCard";
import { StockDataHealthBadge } from "@/components/StockDataHealthBadge";
import {
  formatMoneyDisplay,
  formatPctDisplay,
  formatPriceDisplay,
  formatSignedPctDisplay,
  MiniStat
} from "@/components/ResearchStockHoverFormatters";
import { fetchApiJson } from "@/lib/client/api";
import { cleanDisplayList, cleanDisplayText } from "@/lib/display/text";
import type { StockRealtimeSnapshot } from "@/lib/market/stockSnapshot";
import type { SelectionPick, SelectionRunRecord } from "@/lib/selection/types";

type HoverPosition = { left: number; top: number };
type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };
type TrackingCreateResult = { id: string; created: boolean; baselinePrice?: number };

const snapshotCache = new Map<string, { snapshot?: StockRealtimeSnapshot; fetchedAt: number; error?: string }>();
const SNAPSHOT_CACHE_MS = 60_000;

export function SelectionStockNameHover({
  pick,
  run,
  currentSnapshot,
  className = ""
}: {
  pick: SelectionPick;
  run?: Pick<SelectionRunRecord, "id" | "sourceReportId" | "strategyName">;
  currentSnapshot?: StockRealtimeSnapshot;
  className?: string;
}) {
  const [position, setPosition] = useState<HoverPosition | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtime = useRealtimeSnapshot(pick.code, Boolean(position) && !currentSnapshot, currentSnapshot);
  const runtimeSnapshot = pick.runtimeSnapshot;

  const current = realtime.snapshot ?? currentSnapshot;
  const displayName = cleanDisplayText(pick.name) ?? pick.name;
  const sectorName = cleanDisplayText(pick.sectorName) ?? pick.sectorName;
  const action = cleanDisplayText(pick.action) ?? pick.action;
  const reasons = cleanDisplayList(pick.reasons);
  const blockers = cleanDisplayList(pick.blockers);
  const evidenceRefs = cleanDisplayList(pick.evidenceRefs);
  const runtimeWarnings = cleanDisplayList(runtimeSnapshot?.warnings);
  const currentWarnings = cleanDisplayList(current?.warnings);

  const price = current?.latestPrice ?? pick.price;
  const changePct = current?.changePct ?? pick.changePct;
  const turnoverRate = current?.turnoverRate ?? runtimeSnapshot?.turnoverRate;
  const amount = current?.amount ?? runtimeSnapshot?.amount;
  const mainNetFlow = current?.mainNetInflow ?? runtimeSnapshot?.mainNetInflow;
  const runPrice = runtimeSnapshot?.latestPrice ?? pick.price;
  const runChangePct = runtimeSnapshot?.changePct ?? pick.changePct;
  const runFetchedAt = runtimeSnapshot?.fetchedAt ?? pick.dataFreshness?.refreshedAt;
  const currentVsRun = price !== undefined && runPrice !== undefined && runPrice > 0 ? ((price - runPrice) / runPrice) * 100 : undefined;

  const cancelHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const show = (target: EventTarget & HTMLElement) => {
    cancelHide();
    setPosition(calcPosition(target, 340, 520));
  };
  const hide = () => {
    cancelHide();
    hideTimer.current = setTimeout(() => setPosition(null), 120);
  };

  return (
    <span className="relative inline-block">
      <button
        className={`${className} group cursor-pointer text-left hover:text-cyan-200 focus:text-cyan-200 focus:outline-none`}
        type="button"
        onClick={(event) => event.stopPropagation()}
        onFocus={(event) => show(event.currentTarget)}
        onBlur={hide}
        onMouseEnter={(event) => show(event.currentTarget)}
        onMouseLeave={hide}
      >
        <span>{displayName}</span>
        <span className="ml-1 rounded border border-cyan-300/35 bg-cyan-300/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-200 opacity-80 transition group-hover:opacity-100">
          行情
        </span>
      </button>
      {position && typeof document !== "undefined"
        ? createPortal(
            <>
              <div
                className="fixed z-50 w-[340px] rounded-xl border border-cyan-300/25 bg-[#081019]/96 p-3 text-left shadow-2xl shadow-black/45 backdrop-blur"
                style={{ left: position.left, top: position.top }}
                onClick={(event) => event.stopPropagation()}
                onMouseEnter={cancelHide}
                onMouseLeave={hide}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-slate-100">{displayName}</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-500">
                      {pick.code} / {sectorName}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      当前快照 {formatDateTime(current?.fetchedAt)} / 运行快照 {formatDateTime(runFetchedAt)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      报价时间 {formatDateTime(current?.quoteUpdatedAt ?? current?.raw?.quoteUpdatedAt ?? runtimeSnapshot?.quoteUpdatedAt)}
                    </p>
                  </div>
                  <span className={`rounded border px-2 py-1 text-xs ${actionClass(action)}`}>{action}</span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <MiniStat label="评分" value={`${pick.tier} ${pick.score}`} />
                  <MiniStat label="价格" value={formatPrice(price)} />
                  <MiniStat label="涨跌" value={formatSignedPctDisplay(changePct) ?? "缺失"} />
                  <MiniStat label="换手" value={formatPctDisplay(turnoverRate) ?? "缺失"} />
                  <MiniStat label="成交额" value={formatMoneyDisplay(amount) ?? "缺失"} />
                  <MiniStat label="主力净流" value={formatMoneyDisplay(mainNetFlow) ?? "缺失"} />
                </div>

                <StockDataHealthBadge
                  className="mt-3"
                  compact
                  quality={current?.quality}
                  qualityLabel={current?.qualityLabel ?? pick.dataFreshness?.label}
                  actionability={current?.actionability}
                  coverage={current?.coverage}
                  fetchedAt={current?.fetchedAt ?? runFetchedAt}
                  quoteUpdatedAt={current?.quoteUpdatedAt ?? current?.raw?.quoteUpdatedAt ?? runtimeSnapshot?.quoteUpdatedAt}
                  source={current?.source ?? runtimeSnapshot?.source}
                  warnings={currentWarnings.length ? currentWarnings : runtimeWarnings.length ? runtimeWarnings : cleanDisplayList(pick.dataFreshness?.warnings)}
                />
                {realtime.loading ? <p className="mt-1 text-[11px] text-cyan-100">正在刷新统一行情...</p> : null}
                {realtime.error ? <p className="mt-1 text-[11px] text-amber-100">{cleanDisplayText(realtime.error) ?? realtime.error}</p> : null}

                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/55 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-slate-200">运行快照 vs 当前行情</p>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] ${snapshotDeltaClass(currentVsRun)}`}>
                      {formatSignedPctDisplay(currentVsRun) ?? "待刷新"}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <MiniStat label="运行价格" value={formatPrice(runPrice)} />
                    <MiniStat label="运行涨跌" value={formatSignedPctDisplay(runChangePct) ?? "缺失"} />
                    <MiniStat label="运行来源" value={shortText(runtimeSnapshot?.source ?? pick.dataFreshness?.label ?? "运行快照", 18)} />
                  </div>
                  {runtimeWarnings.length ? (
                    <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-amber-100">
                      运行警告：{runtimeWarnings.slice(0, 2).join("；")}
                    </p>
                  ) : null}
                </div>

                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/55 p-2">
                  <p className="text-xs font-medium text-slate-200">策略视角</p>
                  <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-400">
                    {reasons[0] ?? "未记录正向理由。"}
                    {blockers[0] ? `；阻断：${blockers[0]}` : ""}
                  </p>
                </div>

                <div className="mt-3 grid gap-2">
                  {pick.scoreFactors.slice(0, 4).map((factor) => (
                    <div key={factor.key} className="rounded border border-slate-800 bg-slate-950/50 px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-slate-300">{cleanDisplayText(factor.label) ?? factor.label}</span>
                        <span className="font-mono text-cyan-200">
                          {factor.score}/{factor.maxScore}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-1 text-[11px] text-slate-500">
                        {cleanDisplayText(factor.reasons[0]) ?? cleanDisplayText(factor.blockers[0]) ?? "暂无细节"}
                      </p>
                    </div>
                  ))}
                </div>

                {currentWarnings.length ? (
                  <p className="mt-3 line-clamp-2 text-[11px] leading-4 text-amber-100">
                    当前警告：{currentWarnings.slice(0, 2).join("；")}
                  </p>
                ) : null}

                {evidenceRefs.length ? (
                  <p className="mt-3 line-clamp-2 text-[11px] leading-4 text-slate-500">
                    证据：{evidenceRefs.slice(0, 5).join("、")}
                  </p>
                ) : null}

                <QuickTrackButton
                  stock={{
                    code: pick.code,
                    name: displayName,
                    source: "selection",
                    price,
                    snapshotSource: current?.source ?? runtimeSnapshot?.source,
                    snapshotFetchedAt: current?.fetchedAt ?? runFetchedAt,
                    quoteUpdatedAt: current?.quoteUpdatedAt ?? current?.raw?.quoteUpdatedAt ?? runtimeSnapshot?.quoteUpdatedAt,
                    snapshotWarnings: currentWarnings.length ? currentWarnings : runtimeWarnings,
                    sourceReportId: run?.sourceReportId,
                    sourceStrategyRunId: run?.id,
                    sectorName,
                    thesis: `${cleanDisplayText(run?.strategyName) ?? "选股"}悬浮观察：等级 ${pick.tier}，评分 ${pick.score}，动作=${action}。${reasons[0] ?? "等待后续刷新验证。"}`,
                    invalidCondition: blockers[0] ?? "若评分下降、板块证据失效、资金转弱，或刷新后的行情不再支持该形态，则重新评估。",
                    watchConditions: reasons.slice(0, 4),
                    riskNotes: [...blockers.slice(0, 3), ...cleanDisplayList(pick.dataFreshness?.warnings).slice(0, 2)]
                  }}
                />
              </div>
              <div onMouseEnter={cancelHide} onMouseLeave={hide}>
                <StockKLineHoverCard
                  left={position.left + 350}
                  top={position.top}
                  stock={{
                    name: displayName,
                    code: pick.code,
                    latest: price,
                    changePct,
                    reportCreatedAt: pick.dataFreshness?.refreshedAt,
                    snapshotFetchedAt: current?.fetchedAt,
                    quoteUpdatedAt: current?.quoteUpdatedAt ?? current?.raw?.quoteUpdatedAt ?? runtimeSnapshot?.quoteUpdatedAt,
                    reportLatest: runPrice,
                    reportChangePct: runChangePct,
                    turnoverRate,
                    amount,
                    mainNetFlow,
                    score: pick.score
                  }}
                />
              </div>
            </>,
            document.body
          )
        : null}
    </span>
  );
}

export function BasicStockNameHover({
  stock,
  className = ""
}: {
  stock: {
    name: string;
    code?: string | null;
    latest?: number | null;
    changePct?: number | null;
    turnoverRate?: number | null;
    amount?: number | null;
    mainNetFlow?: number | null;
    score?: number | null;
    note?: string;
  };
  className?: string;
}) {
  const [position, setPosition] = useState<HoverPosition | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtime = useRealtimeSnapshot(stock.code, Boolean(position));

  const displayName = cleanDisplayText(stock.name) ?? stock.name;
  const note = cleanDisplayText(stock.note);
  const price = realtime.snapshot?.latestPrice ?? stock.latest ?? undefined;
  const changePct = realtime.snapshot?.changePct ?? stock.changePct ?? undefined;
  const turnoverRate = realtime.snapshot?.turnoverRate ?? stock.turnoverRate ?? undefined;
  const amount = realtime.snapshot?.amount ?? stock.amount ?? undefined;
  const mainNetFlow = realtime.snapshot?.mainNetInflow ?? stock.mainNetFlow ?? undefined;

  const cancelHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const show = (target: EventTarget & HTMLElement) => {
    cancelHide();
    setPosition(calcPosition(target, 300, 520));
  };
  const hide = () => {
    cancelHide();
    hideTimer.current = setTimeout(() => setPosition(null), 120);
  };

  return (
    <span className="relative inline-block">
      <button
        className={`${className} group cursor-pointer text-left hover:text-cyan-200 focus:text-cyan-200 focus:outline-none`}
        type="button"
        onClick={(event) => event.stopPropagation()}
        onFocus={(event) => show(event.currentTarget)}
        onBlur={hide}
        onMouseEnter={(event) => show(event.currentTarget)}
        onMouseLeave={hide}
      >
        <span>{displayName}</span>
        <span className="ml-1 rounded border border-cyan-300/30 bg-cyan-300/10 px-1.5 py-0.5 text-[10px] text-cyan-200 opacity-75 transition group-hover:opacity-100">
          行情
        </span>
      </button>
      {position && typeof document !== "undefined"
        ? createPortal(
            <>
              <div
                className="fixed z-50 w-[300px] rounded-xl border border-cyan-300/25 bg-[#081019]/96 p-3 text-left shadow-2xl shadow-black/45 backdrop-blur"
                style={{ left: position.left, top: position.top }}
                onClick={(event) => event.stopPropagation()}
                onMouseEnter={cancelHide}
                onMouseLeave={hide}
              >
                <div>
                  <p className="truncate text-base font-semibold text-slate-100">{displayName}</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">{stock.code ?? "代码缺失"}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">统一快照 {formatDateTime(realtime.snapshot?.fetchedAt)}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    报价时间 {formatDateTime(realtime.snapshot?.quoteUpdatedAt ?? realtime.snapshot?.raw?.quoteUpdatedAt)}
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <MiniStat label="价格" value={formatPrice(price)} />
                  <MiniStat label="涨跌" value={formatSignedPctDisplay(changePct) ?? "缺失"} />
                  <MiniStat label="换手" value={formatPctDisplay(turnoverRate) ?? "缺失"} />
                  <MiniStat label="信号" value={stock.score !== undefined && stock.score !== null ? String(stock.score) : "缺失"} />
                  <MiniStat label="成交额" value={formatMoneyDisplay(amount) ?? "缺失"} />
                  <MiniStat label="主力净流" value={formatMoneyDisplay(mainNetFlow) ?? "缺失"} />
                </div>
                {realtime.snapshot ? (
                  <StockDataHealthBadge
                    className="mt-3"
                    compact
                    quality={realtime.snapshot.quality}
                    qualityLabel={realtime.snapshot.qualityLabel}
                    actionability={realtime.snapshot.actionability}
                    coverage={realtime.snapshot.coverage}
                    fetchedAt={realtime.snapshot.fetchedAt}
                    quoteUpdatedAt={realtime.snapshot.quoteUpdatedAt ?? realtime.snapshot.raw?.quoteUpdatedAt}
                    source={realtime.snapshot.source}
                    warnings={realtime.snapshot.warnings}
                  />
                ) : null}
                {realtime.loading ? <p className="mt-3 text-xs leading-5 text-cyan-100">正在刷新统一行情...</p> : null}
                {realtime.error ? <p className="mt-3 text-xs leading-5 text-amber-100">{cleanDisplayText(realtime.error) ?? realtime.error}</p> : null}
                {note ? <p className="mt-3 text-xs leading-5 text-slate-400">{note}</p> : null}
                <QuickTrackButton
                  stock={{
                    code: stock.code ?? "",
                    name: displayName,
                    source: "manual",
                    price,
                    snapshotSource: realtime.snapshot?.source,
                    snapshotFetchedAt: realtime.snapshot?.fetchedAt,
                    quoteUpdatedAt: realtime.snapshot?.quoteUpdatedAt ?? realtime.snapshot?.raw?.quoteUpdatedAt,
                    snapshotWarnings: cleanDisplayList(realtime.snapshot?.warnings),
                    thesis: note ? `悬浮卡片观察：${note}` : "从股票悬浮卡片加入观察，用于后续刷新行情验证。",
                    invalidCondition: "若刷新后的行情、趋势或资金状态转弱，则重新评估。"
                  }}
                />
              </div>
              <div onMouseEnter={cancelHide} onMouseLeave={hide}>
                <StockKLineHoverCard
                  left={position.left + 310}
                  top={position.top}
                  stock={{
                    ...stock,
                    name: displayName,
                    latest: price,
                    changePct,
                    snapshotFetchedAt: realtime.snapshot?.fetchedAt,
                    quoteUpdatedAt: realtime.snapshot?.quoteUpdatedAt ?? realtime.snapshot?.raw?.quoteUpdatedAt,
                    turnoverRate,
                    amount,
                    mainNetFlow
                  }}
                />
              </div>
            </>,
            document.body
          )
        : null}
    </span>
  );
}

function useRealtimeSnapshot(code: string | null | undefined, enabled: boolean, seedSnapshot?: StockRealtimeSnapshot) {
  const normalizedCode = normalizeCode(code);
  const [state, setState] = useState<{ snapshot?: StockRealtimeSnapshot; loading: boolean; error?: string }>({
    snapshot: seedSnapshot,
    loading: false
  });

  useEffect(() => {
    if (seedSnapshot && normalizedCode) {
      snapshotCache.set(normalizedCode, { snapshot: seedSnapshot, fetchedAt: Date.now() });
      setState({ snapshot: seedSnapshot, loading: false });
      return;
    }
    if (!enabled || !normalizedCode) {
      setState((old) => ({ ...old, loading: false }));
      return;
    }
    const cached = snapshotCache.get(normalizedCode);
    if (cached && Date.now() - cached.fetchedAt < SNAPSHOT_CACHE_MS) {
      setState({ snapshot: cached.snapshot, loading: false, error: cached.error });
      return;
    }
    const controller = new AbortController();
    setState((old) => ({ ...old, loading: true, error: undefined }));
    fetchApiJson<Record<string, StockRealtimeSnapshot>>(`/api/stock-snapshots?codes=${encodeURIComponent(normalizedCode)}`, {
      cache: "no-store",
      signal: controller.signal
    })
      .then((json) => {
        if (!json.data) throw new Error(cleanDisplayText(json.error?.message) ?? "统一股票快照读取失败");
        const snapshot = json.data[normalizedCode];
        snapshotCache.set(normalizedCode, { snapshot, fetchedAt: Date.now() });
        setState({ snapshot, loading: false });
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const message = cleanDisplayText(error instanceof Error ? error.message : String(error)) ?? "统一股票快照读取失败";
        snapshotCache.set(normalizedCode, { fetchedAt: Date.now(), error: message });
        setState({ loading: false, error: message });
      });
    return () => controller.abort();
  }, [enabled, normalizedCode, seedSnapshot]);

  return state;
}

function QuickTrackButton({
  stock
}: {
  stock: {
    code: string;
    name: string;
    source?: "manual" | "mainline" | "selection" | "serenity";
    price?: number;
    snapshotSource?: string;
    snapshotFetchedAt?: string;
    quoteUpdatedAt?: string;
    snapshotWarnings?: string[];
    sourceReportId?: string;
    sourceStrategyRunId?: string;
    sectorName?: string;
    thesis: string;
    invalidCondition: string;
    watchConditions?: string[];
    riskNotes?: string[];
  };
}) {
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);
  const [message, setMessage] = useState("");
  const disabled = loading || added || !normalizeCode(stock.code);

  async function addToTracking() {
    const code = normalizeCode(stock.code);
    if (!code) {
      setMessage("股票代码缺失，无法加入追踪。");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/tracking/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code,
          name: stock.name,
          source: stock.source ?? "manual",
          entryMode: "watch",
          simulatedPrice: stock.price,
          simulatedPositionPct: 0,
          sourceReportId: stock.sourceReportId,
          sourceStrategyRunId: stock.sourceStrategyRunId,
          sectorName: stock.sectorName,
          thesis: stock.thesis,
          invalidCondition: stock.invalidCondition,
          watchConditions: cleanDisplayList(stock.watchConditions),
          riskNotes: cleanDisplayList(stock.riskNotes),
          baselineMeta: {
            price: stock.price,
            source: stock.snapshotSource ?? "hover-unified-snapshot",
            fetchedAt: stock.snapshotFetchedAt ?? new Date().toISOString(),
            quoteUpdatedAt: stock.quoteUpdatedAt,
            warnings: cleanDisplayList(stock.snapshotWarnings)
          }
        })
      });
      const json = (await response.json().catch(() => null)) as ApiResponse<TrackingCreateResult> | null;
      if (!response.ok || !json?.success) throw new Error(cleanDisplayText(json?.error?.message) ?? "加入追踪失败");
      setAdded(true);
      const baselineText =
        json.data?.baselinePrice !== undefined ? `基准价 ${json.data.baselinePrice.toFixed(2)}` : "基准价待补";
      setMessage(json.data?.created ? `已加入追踪，${baselineText}` : `已在追踪中，${baselineText}`);
    } catch (error) {
      setMessage(cleanDisplayText(error instanceof Error ? error.message : String(error)) ?? "加入追踪失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        className={`inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-60 ${
          added
            ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
            : "border-cyan-300/35 bg-cyan-300/10 text-cyan-100 hover:border-cyan-200/60 hover:bg-cyan-300/15"
        }`}
        disabled={disabled}
        onClick={addToTracking}
        title={stock.price === undefined ? "前端暂无价格，后端会拉取统一行情作为基准。" : "使用当前快照价格，并由后端校验最新基准。"}
      >
        {loading ? <Loader2 className="animate-spin" size={14} /> : added ? <CheckCircle2 size={14} /> : <BellPlus size={14} />}
        {added ? "已追踪" : stock.price === undefined ? "用后端行情追踪" : "加入追踪"}
      </button>
      {message ? <p className={`mt-1 text-[11px] leading-4 ${added ? "text-emerald-200" : "text-amber-100"}`}>{message}</p> : null}
    </div>
  );
}

function calcPosition(target: EventTarget & HTMLElement, width: number, chartWidth: number): HoverPosition {
  const rect = target.getBoundingClientRect();
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - chartWidth - 22));
  const top = Math.min(rect.bottom + 8, window.innerHeight - 430);
  return { left, top: Math.max(12, top) };
}

function normalizeCode(value?: string | null) {
  const raw = String(value ?? "").trim().toLowerCase();
  const digits = raw.match(/\d{6}/)?.[0];
  if (!digits) return raw;
  if (raw.startsWith("sh") || digits.startsWith("6")) return `sh${digits}`;
  if (raw.startsWith("bj") || /^[489]/.test(digits)) return `bj${digits}`;
  return `sz${digits}`;
}

function actionClass(action: string) {
  if (/watch|focus|track|观察|重点|跟踪|\u7459\u509a\u7642|\u74ba\u71bb\u91dc/.test(action)) return "border-cyan-300/35 bg-cyan-300/10 text-cyan-200";
  if (/wait|条件|等待|\u7edb\u590a\u7ddf|\u93c9\u2032\u6b22/.test(action)) return "border-amber-300/35 bg-amber-300/10 text-amber-200";
  if (/remove|avoid|剔除|回避|\u9353\u65c8\u6ace|\u934f\u70ba\u4f29/.test(action)) return "border-rose-300/35 bg-rose-300/10 text-rose-200";
  return "border-slate-700 bg-slate-900/70 text-slate-300";
}

function snapshotDeltaClass(delta?: number) {
  if (delta === undefined || !Number.isFinite(delta)) return "border-slate-700 bg-slate-900/70 text-slate-300";
  if (Math.abs(delta) < 0.3) return "border-slate-700 bg-slate-900/70 text-slate-300";
  if (delta > 0) return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  return "border-rose-300/25 bg-rose-300/10 text-rose-100";
}

function formatDateTime(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatPrice(value?: number | null) {
  if (value === undefined || value === null) return "缺失";
  return formatPriceDisplay(value);
}

function shortText(value: string, maxLength: number) {
  const clean = cleanDisplayText(value) ?? value;
  return clean.length > maxLength ? `${clean.slice(0, maxLength)}...` : clean;
}
