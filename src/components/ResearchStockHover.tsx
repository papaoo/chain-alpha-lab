"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { StockCandidate } from "@/lib/types";
import { StockKLineHoverCard } from "@/components/StockKLineHoverCard";
import { findCandidateForStock, findCoreStock, useStockHoverRegistry, type CoreStockSnapshot } from "@/components/ResearchStockHoverRegistry";
import { coreStockClass, formatAction, formatFundFlow, formatMoneyDisplay, formatPctDisplay, formatPriceDisplay, formatSignedPctDisplay, formatTrend, localizeText, MiniStat } from "@/components/ResearchStockHoverFormatters";

export { StockHoverProvider } from "@/components/ResearchStockHoverRegistry";



export function StockNameHover({ candidate, className = "" }: { candidate: StockCandidate; className?: string }) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        onClick={(event) => {
          event.stopPropagation();
        }}
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
      {position && typeof document !== "undefined" ? createPortal(
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
            </div>
            <span className={`rounded border px-2 py-1 text-xs ${candidate.action === "小仓试错" ? "border-up/35 bg-up/10 text-up" : candidate.action === "回避" ? "border-warn/35 bg-warn/10 text-warn" : "border-info/30 bg-info/10 text-info"}`}>
              {formatAction(candidate.action)}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <MiniStat label="现价" value={formatPriceDisplay(candidate.quote?.latest ?? candidate.price)} />
            <MiniStat label="涨跌幅" value={formatSignedPctDisplay(candidate.quote?.changePct) ?? "缺失"} />
            <MiniStat label="换手率" value={formatPctDisplay(candidate.quote?.turnoverRate) ?? "缺失"} />
            <MiniStat label="活跃度" value={candidate.activity ? `${candidate.activity.status} ${candidate.activity.score}` : "缺失"} />
            <MiniStat label="成交额" value={formatMoneyDisplay(candidate.quote?.amount) ?? "缺失"} />
            <MiniStat label="主力净流" value={formatMoneyDisplay(candidate.fundFlow?.mainNetFlow ?? candidate.quote?.mainNetInflow) ?? "缺失"} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <MiniStat label="资金质量" value={candidate.fundFlowQuality ? `${candidate.fundFlowQuality.state} ${candidate.fundFlowQuality.score}` : formatFundFlow(candidate.fundFlowState)} />
            <MiniStat label="活跃依据" value={candidate.activity?.reasons[0] ?? "缺失"} />
            <MiniStat label="趋势" value={formatTrend(candidate.trendState)} />
            <MiniStat label="MA20距离" value={formatSignedPctDisplay(candidate.klineSummary?.maDistance?.ma20) ?? "缺失"} />
            <MiniStat label="买入可达性" value={candidate.tradability?.status ?? "缺失"} />
          </div>

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
              <p className="mt-1 line-clamp-2 text-info">激活：{localizeText(candidate.opportunityProfile.activationConditions[0] ?? "等待更多证据")}</p>
            </div>
          ) : null}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <MiniStat label="信号质量" value={`${candidate.signalTier ?? "-"} / ${candidate.signalScore ?? "-"}`} />
            <MiniStat label="仓位上限" value={`${candidate.positionLimitPct}%`} />
            <MiniStat label="股东户数" value={candidate.companyKnowledge.shareholderSummary?.holderCount ? String(candidate.companyKnowledge.shareholderSummary.holderCount) : "缺失"} />
            <MiniStat label="户数变化" value={formatSignedPctDisplay(candidate.companyKnowledge.shareholderSummary?.holderCountChangePct) ?? "缺失"} />
          </div>
          {candidate.riskFlags.length ? (
            <p className="mt-3 line-clamp-2 text-xs leading-5 text-warn">风险：{localizeText(candidate.riskFlags.slice(0, 3).join("；"))}</p>
          ) : null}
        </div>
        <div onMouseEnter={cancelHide} onMouseLeave={hide}>
          <StockKLineHoverCard
            left={position.left + 370}
            top={position.top}
            stock={{
              name: candidate.name,
              code: candidate.code,
              latest: candidate.quote?.latest ?? candidate.price,
              changePct: candidate.quote?.changePct,
              turnoverRate: candidate.quote?.turnoverRate,
              amount: candidate.quote?.amount,
              mainNetFlow: candidate.fundFlow?.mainNetFlow ?? candidate.quote?.mainNetInflow,
              ma20DistancePct: candidate.klineSummary?.maDistance?.ma20,
              score: candidate.signalScore ?? candidate.strengthScore
            }}
          />
        </div>
        </>
      , document.body) : null}
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
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const candidate = findCandidateForStock(registry, stock.name, stock.marketCode ?? stock.code);
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
        onClick={(event) => {
          event.stopPropagation();
        }}
        onFocus={(event) => show(event.currentTarget)}
        onBlur={hide}
        onMouseEnter={(event) => show(event.currentTarget)}
        onMouseLeave={hide}
      >
        {stock.name}
      </button>
      {position && typeof document !== "undefined" ? createPortal(
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
            </div>
            <span className={`rounded border px-2 py-1 text-xs ${coreStockClass(stock.role, stock.limitStatus)}`}>{stock.limitStatus}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MiniStat label="涨跌幅" value={formatSignedPctDisplay(stock.changePct) ?? "缺失"} />
            <MiniStat label="成交额" value={formatMoneyDisplay(stock.amount) ?? "缺失"} />
            <MiniStat label="换手率" value={formatPctDisplay(stock.turnoverRate) ?? "缺失"} />
            <MiniStat label="主力净流" value={formatMoneyDisplay(stock.mainNetInflow) ?? "缺失"} />
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
              changePct: stock.changePct,
              turnoverRate: stock.turnoverRate,
              amount: stock.amount,
              mainNetFlow: stock.mainNetInflow,
              score: stock.score
            }}
          />
        </div>
        </>
      , document.body) : null}
    </span>
  );
}



export function StockMention({ name, code, className = "" }: { name: string; code?: string | null; className?: string }) {
  const registry = useStockHoverRegistry();
  const candidate = findCandidateForStock(registry, name, code);
  if (candidate) return <StockNameHover candidate={candidate} className={className || "font-medium"} />;
  const coreStock = findCoreStock(registry, name, code);
  if (coreStock) return <CoreStockHover stock={coreStock} />;
  return <span className={className}>{name}</span>;
}



export function SmartStockTitle({ title }: { title: string }) {
  const match = title.match(/^([^：/]+)(.*)$/);
  if (!match) return <>{title}</>;
  const [, name, suffix] = match;
  return (
    <>
      <StockMention name={name.trim()} className="font-medium" />
      {suffix}
    </>
  );
}
