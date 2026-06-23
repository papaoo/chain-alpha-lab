"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { StockCandidate } from "@/lib/types";
import { StockKLineHoverCard } from "@/components/StockKLineHoverCard";
import { StockDataHealthBadge } from "@/components/StockDataHealthBadge";
import { BasicStockNameHover } from "@/components/SelectionStockHover";
import {
  findCandidateForStock,
  findCoreStock,
  findRealtimeSnapshot,
  useStockHoverRegistry,
  type CoreStockSnapshot
} from "@/components/ResearchStockHoverRegistry";
import {
  coreStockClass,
  formatAction,
  formatFundFlow,
  formatMoneyDisplay,
  formatPctDisplay,
  formatPriceDisplay,
  formatSignedPctDisplay,
  formatTrend,
  localizeText,
  MiniStat
} from "@/components/ResearchStockHoverFormatters";
import { StockTrackingActionButton } from "@/components/StockTrackingActionButton";

export { StockHoverProvider } from "@/components/ResearchStockHoverRegistry";

type HoverPosition = { left: number; top: number };

export function StockNameHover({ candidate, className = "" }: { candidate: StockCandidate; className?: string }) {
  const registry = useStockHoverRegistry();
  const realtime = findRealtimeSnapshot(registry, candidate.code);
  const [position, setPosition] = useState<HoverPosition | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const price = realtime?.latestPrice ?? candidate.quote?.latest ?? candidate.price;
  const changePct = realtime?.changePct ?? candidate.quote?.changePct;
  const turnoverRate = realtime?.turnoverRate ?? candidate.quote?.turnoverRate;
  const amount = realtime?.amount ?? candidate.quote?.amount;
  const mainNetFlow = realtime?.mainNetInflow ?? candidate.fundFlow?.mainNetFlow ?? candidate.quote?.mainNetInflow;
  const trendState = realtime?.trendState ?? candidate.trendState;

  const cancelHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const show = (target: EventTarget & HTMLElement) => {
    cancelHide();
    const rect = target.getBoundingClientRect();
    const width = 360;
    const chartWidth = 520;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - chartWidth - 22));
    const top = Math.min(rect.bottom + 8, window.innerHeight - 430);
    setPosition({ left, top: Math.max(12, top) });
  };
  const hide = () => {
    cancelHide();
    hideTimer.current = setTimeout(() => setPosition(null), 120);
  };

  return (
    <span className="relative inline-block">
      <button
        className={`${className} group cursor-pointer text-left hover:text-info focus:text-info focus:outline-none`}
        type="button"
        onClick={(event) => event.stopPropagation()}
        onFocus={(event) => show(event.currentTarget)}
        onBlur={hide}
        onMouseEnter={(event) => show(event.currentTarget)}
        onMouseLeave={hide}
      >
        <span>{candidate.name}</span>
        <span className="ml-1 rounded border border-info/35 bg-info/10 px-1.5 py-0.5 text-[10px] font-medium text-info opacity-80 transition group-hover:opacity-100">
          行情
        </span>
      </button>
      {position && typeof document !== "undefined"
        ? createPortal(
            <>
              <div
                className="fixed z-50 w-[360px] rounded-xl border border-info/25 bg-[#081019]/95 p-3 text-left shadow-2xl shadow-black/40 backdrop-blur"
                style={{ left: position.left, top: position.top }}
                onClick={(event) => event.stopPropagation()}
                onMouseEnter={cancelHide}
                onMouseLeave={hide}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-text">{candidate.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted">{candidate.code} / {candidate.sectorName}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      统一快照 {formatDateTime(realtime?.fetchedAt)} / 报告快照 {formatDateTime(registry.reportCreatedAt)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      行情时间 {formatDateTime(realtime?.quoteUpdatedAt ?? realtime?.raw?.quoteUpdatedAt)}
                    </p>
                  </div>
                  <span className={`rounded border px-2 py-1 text-xs ${actionTone(candidate.action)}`}>
                    {formatAction(candidate.action)}
                  </span>
                </div>

                <StockTrackingActionButton stock={candidate} reportId={registry.reportId} />

                <StockDataHealthBadge
                  className="mt-3"
                  compact
                  quality={realtime?.quality}
                  qualityLabel={realtime?.qualityLabel}
                  actionability={realtime?.actionability}
                  coverage={realtime?.coverage}
                  fetchedAt={realtime?.fetchedAt ?? registry.reportCreatedAt}
                  quoteUpdatedAt={realtime?.quoteUpdatedAt ?? realtime?.raw?.quoteUpdatedAt}
                  source={realtime?.source ?? "analysis-report:snapshot"}
                  warnings={realtime?.warnings ?? ["尚未取得统一实时快照，当前显示报告快照。"]}
                />
                <HoverRefreshState registry={registry} hasRealtime={Boolean(realtime)} />

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <MiniStat label="现价" value={formatPriceDisplay(price)} />
                  <MiniStat label="涨跌幅" value={formatSignedPctDisplay(changePct) ?? "缺失"} />
                  <MiniStat label="换手率" value={formatPctDisplay(turnoverRate) ?? "缺失"} />
                  <MiniStat label="活跃度" value={candidate.activity ? `${candidate.activity.status} ${candidate.activity.score}` : "缺失"} />
                  <MiniStat label="成交额" value={formatMoneyDisplay(amount) ?? "缺失"} />
                  <MiniStat label="主力净流" value={formatMoneyDisplay(mainNetFlow) ?? "缺失"} />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <MiniStat label="资金质量" value={candidate.fundFlowQuality ? `${candidate.fundFlowQuality.state} ${candidate.fundFlowQuality.score}` : formatFundFlow(candidate.fundFlowState)} />
                  <MiniStat label="活跃依据" value={candidate.activity?.reasons[0] ?? "缺失"} />
                  <MiniStat label="趋势" value={formatTrend(trendState)} />
                  <MiniStat label="MA20距离" value={formatSignedPctDisplay(candidate.klineSummary?.maDistance?.ma20) ?? "缺失"} />
                  <MiniStat label="买入可达性" value={candidate.tradability?.status ?? "缺失"} />
                </div>

                {realtime?.warnings.length ? (
                  <p className="mt-3 line-clamp-2 text-[11px] leading-4 text-warn">
                    快照提示：{realtime.warnings.slice(0, 2).join("；")}
                  </p>
                ) : null}

                <div className="mt-3 rounded-lg border border-line/70 bg-bg/60 p-2 text-xs leading-5 text-muted">
                  <p className="font-medium text-text">规则提示</p>
                  <p className="mt-1">{localizeText(candidate.tradability?.waitFor || candidate.buyPointEvaluation?.triggerCondition || candidate.invalidCondition)}</p>
                </div>

                {candidate.opportunityProfile ? (
                  <div className="mt-3 rounded-lg border border-info/25 bg-info/[0.06] p-2 text-xs leading-5 text-muted">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-text">机会画像</p>
                      <span className="rounded border border-info/30 px-1.5 py-0.5 text-[10px] text-info">
                        {candidate.opportunityProfile.label} {candidate.opportunityProfile.score}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2">{localizeText(candidate.opportunityProfile.primaryReason)}</p>
                    <p className="mt-1 line-clamp-2 text-info">
                      激活：{localizeText(candidate.opportunityProfile.activationConditions[0] ?? "等待更多证据")}
                    </p>
                  </div>
                ) : null}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <MiniStat label="信号质量" value={`${candidate.signalTier ?? "-"} / ${candidate.signalScore ?? "-"}`} />
                  <MiniStat label="仓位上限" value={`${candidate.positionLimitPct}%`} />
                  <MiniStat label="股东户数" value={candidate.companyKnowledge.shareholderSummary?.holderCount ? String(candidate.companyKnowledge.shareholderSummary.holderCount) : "缺失"} />
                  <MiniStat label="户数变化" value={formatSignedPctDisplay(candidate.companyKnowledge.shareholderSummary?.holderCountChangePct) ?? "缺失"} />
                </div>

                {candidate.riskFlags.length ? (
                  <p className="mt-3 line-clamp-2 text-xs leading-5 text-warn">
                    风险：{localizeText(candidate.riskFlags.slice(0, 3).join("；"))}
                  </p>
                ) : null}
              </div>
              <div onMouseEnter={cancelHide} onMouseLeave={hide}>
                <StockKLineHoverCard
                  left={position.left + 370}
                  top={position.top}
                  stock={{
                    name: candidate.name,
                    code: candidate.code,
                    latest: price,
                    changePct,
                    reportCreatedAt: registry.reportCreatedAt,
                    snapshotFetchedAt: realtime?.fetchedAt,
                    quoteUpdatedAt: realtime?.quoteUpdatedAt ?? realtime?.raw?.quoteUpdatedAt,
                    reportLatest: candidate.quote?.latest ?? candidate.price,
                    reportChangePct: candidate.quote?.changePct,
                    turnoverRate,
                    amount,
                    mainNetFlow,
                    ma20DistancePct: candidate.klineSummary?.maDistance?.ma20,
                    score: candidate.signalScore ?? candidate.strengthScore
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

export function CoreStockInlineList({ stocks }: { stocks: CoreStockSnapshot[] }) {
  if (!stocks.length) return <>待确认</>;
  return (
    <>
      {stocks.map((stock, index) => (
        <span key={`${stock.marketCode ?? stock.code}-${stock.name}-${index}`}>
          {index > 0 ? "、" : ""}
          <CoreStockHover stock={stock} />
        </span>
      ))}
    </>
  );
}

export function CoreStockHover({ stock }: { stock: CoreStockSnapshot }) {
  const registry = useStockHoverRegistry();
  const realtime = findRealtimeSnapshot(registry, stock.marketCode ?? stock.code);
  const [position, setPosition] = useState<HoverPosition | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const candidate = findCandidateForStock(registry, stock.name, stock.marketCode ?? stock.code);

  const price = realtime?.latestPrice;
  const changePct = realtime?.changePct ?? stock.changePct;
  const turnoverRate = realtime?.turnoverRate ?? stock.turnoverRate;
  const amount = realtime?.amount ?? stock.amount;
  const mainNetFlow = realtime?.mainNetInflow ?? stock.mainNetInflow;

  const cancelHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const show = (target: EventTarget & HTMLElement) => {
    cancelHide();
    const rect = target.getBoundingClientRect();
    const width = 320;
    const chartWidth = 520;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - chartWidth - 22));
    const top = Math.min(rect.bottom + 8, window.innerHeight - 430);
    setPosition({ left, top: Math.max(12, top) });
  };
  const hide = () => {
    cancelHide();
    hideTimer.current = setTimeout(() => setPosition(null), 120);
  };

  if (candidate) return <StockNameHover candidate={candidate} className="text-info/90 underline decoration-info/30 decoration-dotted underline-offset-2" />;

  return (
    <span className="relative inline-block">
      <button
        className="cursor-pointer text-left text-info/90 underline decoration-info/30 decoration-dotted underline-offset-2 hover:text-info focus:outline-none"
        type="button"
        onClick={(event) => event.stopPropagation()}
        onFocus={(event) => show(event.currentTarget)}
        onBlur={hide}
        onMouseEnter={(event) => show(event.currentTarget)}
        onMouseLeave={hide}
      >
        {stock.name}
      </button>
      {position && typeof document !== "undefined"
        ? createPortal(
            <>
              <div
                className="fixed z-50 w-[320px] rounded-xl border border-info/25 bg-[#081019]/95 p-3 text-left shadow-2xl shadow-black/40 backdrop-blur"
                style={{ left: position.left, top: position.top }}
                onMouseEnter={cancelHide}
                onMouseLeave={hide}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-text">{stock.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted">{stock.marketCode ?? stock.code ?? "代码缺失"} / {stock.role}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      统一快照 {formatDateTime(realtime?.fetchedAt)} / 报告快照 {formatDateTime(registry.reportCreatedAt)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      行情时间 {formatDateTime(realtime?.quoteUpdatedAt ?? realtime?.raw?.quoteUpdatedAt)}
                    </p>
                  </div>
                  <span className={`rounded border px-2 py-1 text-xs ${coreStockClass(stock.role, stock.limitStatus)}`}>{stock.limitStatus}</span>
                </div>

                {stock.marketCode || stock.code ? <StockTrackingActionButton stock={stock} reportId={registry.reportId} /> : null}

                <StockDataHealthBadge
                  className="mt-3"
                  compact
                  quality={realtime?.quality}
                  qualityLabel={realtime?.qualityLabel}
                  actionability={realtime?.actionability}
                  coverage={realtime?.coverage}
                  fetchedAt={realtime?.fetchedAt ?? registry.reportCreatedAt}
                  quoteUpdatedAt={realtime?.quoteUpdatedAt ?? realtime?.raw?.quoteUpdatedAt}
                  source={realtime?.source ?? "analysis-report:core-stock"}
                  warnings={realtime?.warnings ?? ["尚未取得统一实时快照，当前显示报告核心股快照。"]}
                />
                <HoverRefreshState registry={registry} hasRealtime={Boolean(realtime)} />

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <MiniStat label="现价" value={formatPriceDisplay(price)} />
                  <MiniStat label="涨跌幅" value={formatSignedPctDisplay(changePct) ?? "缺失"} />
                  <MiniStat label="成交额" value={formatMoneyDisplay(amount) ?? "缺失"} />
                  <MiniStat label="换手率" value={formatPctDisplay(turnoverRate) ?? "缺失"} />
                  <MiniStat label="主力净流" value={formatMoneyDisplay(mainNetFlow) ?? "缺失"} />
                  <MiniStat label="流通市值" value={formatMoneyDisplay(stock.floatMarketValue) ?? "缺失"} />
                  <MiniStat label="核心分" value={stock.score !== undefined ? stock.score.toFixed(0) : "缺失"} />
                </div>

                {stock.risks?.length ? (
                  <p className="mt-3 line-clamp-2 text-xs leading-5 text-warn">风险：{stock.risks.slice(0, 3).join("；")}</p>
                ) : null}
              </div>
              <div onMouseEnter={cancelHide} onMouseLeave={hide}>
                <StockKLineHoverCard
                  left={position.left + 330}
                  top={position.top}
                  stock={{
                    name: stock.name,
                    code: stock.marketCode ?? stock.code,
                    latest: price,
                    changePct,
                    reportCreatedAt: registry.reportCreatedAt,
                    snapshotFetchedAt: realtime?.fetchedAt,
                    quoteUpdatedAt: realtime?.quoteUpdatedAt ?? realtime?.raw?.quoteUpdatedAt,
                    reportChangePct: stock.changePct,
                    turnoverRate,
                    amount,
                    mainNetFlow,
                    score: stock.score
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

export function StockMention({ name, code, className = "" }: { name: string; code?: string | null; className?: string }) {
  const registry = useStockHoverRegistry();
  const candidate = findCandidateForStock(registry, name, code);
  if (candidate) return <StockNameHover candidate={candidate} className={className || "font-medium"} />;
  const coreStock = findCoreStock(registry, name, code);
  if (coreStock) return <CoreStockHover stock={coreStock} />;
  if (code) return <BasicStockNameHover stock={{ name, code }} className={className || "font-medium"} />;
  return <span className={className}>{name}</span>;
}

export function SmartStockTitle({ title }: { title: string }) {
  const match = title.match(/^([^，。；：:]+)(.*)$/);
  if (!match) return <>{title}</>;
  const [, name, suffix] = match;
  return (
    <>
      <StockMention name={name.trim()} className="font-medium" />
      {suffix}
    </>
  );
}

function actionTone(action: string) {
  if (/试错|买|持有|观察/.test(action)) return "border-up/35 bg-up/10 text-up";
  if (/回避|卖|剔除/.test(action)) return "border-warn/35 bg-warn/10 text-warn";
  return "border-info/30 bg-info/10 text-info";
}

function HoverRefreshState({ registry, hasRealtime }: { registry: ReturnType<typeof useStockHoverRegistry>; hasRealtime: boolean }) {
  const state = registry.refreshState;
  const isFailed = state.status === "failed";
  const isLoading = state.status === "loading";
  const tone = isFailed || !hasRealtime ? "border-warn/25 bg-warn/10 text-warn" : isLoading ? "border-info/25 bg-info/10 text-info" : "border-up/20 bg-up/10 text-up";
  const label = isFailed
    ? "实时快照刷新失败"
    : isLoading && !hasRealtime
      ? "正在刷新实时快照"
      : hasRealtime
        ? "已接入统一实时快照"
        : "当前仍是报告快照";
  const detail = isFailed
    ? state.error
    : hasRealtime
      ? `覆盖 ${state.codeCount || "--"} 只，刷新 ${formatDateTime(state.refreshedAt)}`
      : "悬浮卡片暂未拿到统一快照，价格/涨停状态只代表报告生成时。";
  return (
    <div className={`mt-2 rounded-lg border px-2.5 py-1.5 text-[11px] leading-4 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        <span className="font-mono opacity-75">{state.status}</span>
      </div>
      {detail ? <p className="mt-0.5 line-clamp-2 opacity-85">{detail}</p> : null}
    </div>
  );
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
