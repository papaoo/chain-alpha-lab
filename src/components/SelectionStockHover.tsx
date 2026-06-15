"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StockKLineHoverCard } from "@/components/StockKLineHoverCard";
import { formatSignedPctDisplay, MiniStat } from "@/components/ResearchStockHoverFormatters";
import type { SelectionPick } from "@/lib/selection/types";

export function SelectionStockNameHover({ pick, className = "" }: { pick: SelectionPick; className?: string }) {
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
    const width = 340;
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
        className={`${className} group cursor-pointer text-left hover:text-cyan-200 focus:text-cyan-200 focus:outline-none`}
        type="button"
        onClick={(event) => event.stopPropagation()}
        onFocus={(event) => show(event.currentTarget)}
        onBlur={hide}
        onMouseEnter={(event) => show(event.currentTarget)}
        onMouseLeave={hide}
      >
        <span>{pick.name}</span>
        <span className="ml-1 rounded border border-cyan-300/35 bg-cyan-300/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-200 opacity-80 transition group-hover:opacity-100">
          行情
        </span>
      </button>
      {position && typeof document !== "undefined" ? createPortal(
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
                <p className="truncate text-base font-semibold text-slate-100">{pick.name}</p>
                <p className="mt-0.5 font-mono text-xs text-slate-500">{pick.code} / {pick.sectorName}</p>
              </div>
              <span className={`rounded border px-2 py-1 text-xs ${actionClass(pick.action)}`}>{pick.action}</span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <MiniStat label="策略分" value={`${pick.tier} ${pick.score}`} />
              <MiniStat label="现价" value={pick.price !== undefined ? pick.price.toFixed(2) : "缺失"} />
              <MiniStat label="涨跌幅" value={formatSignedPctDisplay(pick.changePct) ?? "缺失"} />
            </div>

            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/55 p-2">
              <p className="text-xs font-medium text-slate-200">策略判断</p>
              <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-400">
                {pick.reasons[0] ?? "暂无加分理由"}
                {pick.blockers[0] ? `；限制：${pick.blockers[0]}` : ""}
              </p>
            </div>

            <div className="mt-3 grid gap-2">
              {pick.scoreFactors.slice(0, 4).map((factor) => (
                <div key={factor.key} className="rounded border border-slate-800 bg-slate-950/50 px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-300">{factor.label}</span>
                    <span className="font-mono text-cyan-200">{factor.score}/{factor.maxScore}</span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-[11px] text-slate-500">
                    {factor.reasons[0] ?? factor.blockers[0] ?? "无明细"}
                  </p>
                </div>
              ))}
            </div>

            {pick.evidenceRefs.length ? (
              <p className="mt-3 line-clamp-2 text-[11px] leading-4 text-slate-500">
                证据：{pick.evidenceRefs.slice(0, 5).join("、")}
              </p>
            ) : null}
          </div>
          <div onMouseEnter={cancelHide} onMouseLeave={hide}>
            <StockKLineHoverCard
              left={position.left + 350}
              top={position.top}
              stock={{
                name: pick.name,
                code: pick.code,
                latest: pick.price,
                changePct: pick.changePct,
                score: pick.score
              }}
            />
          </div>
        </>
      , document.body) : null}
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
    const width = 300;
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
        className={`${className} group cursor-pointer text-left hover:text-cyan-200 focus:text-cyan-200 focus:outline-none`}
        type="button"
        onClick={(event) => event.stopPropagation()}
        onFocus={(event) => show(event.currentTarget)}
        onBlur={hide}
        onMouseEnter={(event) => show(event.currentTarget)}
        onMouseLeave={hide}
      >
        <span>{stock.name}</span>
        <span className="ml-1 rounded border border-cyan-300/30 bg-cyan-300/10 px-1.5 py-0.5 text-[10px] text-cyan-200 opacity-75 transition group-hover:opacity-100">
          行情
        </span>
      </button>
      {position && typeof document !== "undefined" ? createPortal(
        <>
          <div
            className="fixed z-50 w-[300px] rounded-xl border border-cyan-300/25 bg-[#081019]/96 p-3 text-left shadow-2xl shadow-black/45 backdrop-blur"
            style={{ left: position.left, top: position.top }}
            onClick={(event) => event.stopPropagation()}
            onMouseEnter={cancelHide}
            onMouseLeave={hide}
          >
            <div>
              <p className="truncate text-base font-semibold text-slate-100">{stock.name}</p>
              <p className="mt-0.5 font-mono text-xs text-slate-500">{stock.code ?? "代码缺失"}</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MiniStat label="现价" value={stock.latest !== undefined && stock.latest !== null ? stock.latest.toFixed(2) : "缺失"} />
              <MiniStat label="涨跌幅" value={formatSignedPctDisplay(stock.changePct ?? undefined) ?? "缺失"} />
              <MiniStat label="换手率" value={stock.turnoverRate !== undefined && stock.turnoverRate !== null ? `${stock.turnoverRate.toFixed(2)}%` : "缺失"} />
              <MiniStat label="信号分" value={stock.score !== undefined && stock.score !== null ? String(stock.score) : "缺失"} />
              <MiniStat label="成交额" value={formatMoney(stock.amount)} />
              <MiniStat label="主力净流入" value={formatMoney(stock.mainNetFlow)} />
            </div>
            {stock.note ? <p className="mt-3 text-xs leading-5 text-slate-400">{stock.note}</p> : null}
          </div>
          <div onMouseEnter={cancelHide} onMouseLeave={hide}>
            <StockKLineHoverCard left={position.left + 310} top={position.top} stock={stock} />
          </div>
        </>
      , document.body) : null}
    </span>
  );
}

function actionClass(action: SelectionPick["action"]) {
  if (action === "重点观察") return "border-emerald-300/35 bg-emerald-300/10 text-emerald-200";
  if (action === "跟踪观察") return "border-cyan-300/35 bg-cyan-300/10 text-cyan-200";
  if (action === "条件等待") return "border-amber-300/35 bg-amber-300/10 text-amber-200";
  return "border-rose-300/35 bg-rose-300/10 text-rose-200";
}

function formatMoney(value?: number | null) {
  if (value === undefined || value === null || !Number.isFinite(value)) return "缺失";
  const abs = Math.abs(value);
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(2)}亿`;
  if (abs >= 10_000) return `${sign}${(abs / 10_000).toFixed(0)}万`;
  return `${sign}${abs.toFixed(0)}`;
}
