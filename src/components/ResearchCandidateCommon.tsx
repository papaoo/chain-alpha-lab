"use client";

import { useState } from "react";
import type * as React from "react";
import { ChevronDown } from "lucide-react";
import type { StockCandidate } from "@/lib/types";

export function CollapsibleSection({
  title,
  meta,
  icon: Icon,
  defaultOpen = false,
  children
}: {
  title: string;
  meta: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-line bg-bg/45">
      <button
        className="flex w-full items-center justify-between gap-4 p-3 text-left transition hover:bg-white/[0.025]"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-panel/70 text-info">
            <Icon size={16} />
          </span>
          <span>
            <span className="block text-sm font-medium">{title}</span>
            <span className="mt-0.5 block text-xs text-muted">{meta}</span>
          </span>
        </span>
        <ChevronDown className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} size={18} />
      </button>
      {open ? <div className="border-t border-line/70 p-3">{children}</div> : null}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-line bg-panel/88 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.22)] ${className}`}>{children}</div>;
}

export function SectionTitle({ icon: Icon, title, meta }: { icon: React.ElementType; title: string; meta: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-bg/70 text-info">
        <Icon size={18} />
      </span>
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted">{meta}</p>
      </div>
    </div>
  );
}

export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line/70 bg-panel/70 p-2">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

export function SignalBadge({ candidate }: { candidate: StockCandidate }) {
  const tier = candidate.signalTier ?? "-";
  const score = candidate.signalScore ?? candidate.strengthScore;
  const label = candidate.signalLabel ?? "待分层";
  const title = candidate.signalReasons?.length ? candidate.signalReasons.join("；") : "旧报告暂无信号分层，重新运行分析后会生成。";
  const cls = tier === "S"
    ? "border-up/50 bg-up/15 text-up"
    : tier === "A"
      ? "border-info/50 bg-info/15 text-info"
      : tier === "B"
        ? "border-[#b779ff]/50 bg-[#b779ff]/15 text-[#d6b5ff]"
        : tier === "C"
          ? "border-warn/50 bg-warn/15 text-warn"
          : "border-line bg-bg/70 text-muted";
  return (
    <span className={`inline-flex min-w-[92px] flex-col rounded border px-2 py-1 text-xs ${cls}`} title={title}>
      <span className="font-semibold">{tier} · {label}</span>
      <span className="mt-0.5 font-mono text-[11px] opacity-80">{score ?? "-"} / 100</span>
    </span>
  );
}

export function StrengthBadge({ score }: { score?: number }) {
  if (score === undefined) return <span className="rounded border border-line px-2 py-1 text-xs text-muted">待刷新</span>;
  const cls = score >= 80
    ? "border-up/40 bg-up/10 text-up"
    : score >= 65
      ? "border-info/40 bg-info/10 text-info"
      : score >= 45
        ? "border-warn/40 bg-warn/10 text-warn"
        : "border-line bg-bg/70 text-muted";
  return <span className={`inline-flex min-w-14 justify-center rounded border px-2 py-1 text-xs font-medium ${cls}`}>{score}</span>;
}

export function formatMemoryBadge(seenCount?: number, lastAction?: string) {
  if (!seenCount) return "新";
  return `跟踪 ${seenCount} 次 / 上次${formatAction(lastAction ?? "")}`;
}

export function attributionPillClass(value?: string) {
  if (value === "direct_constituent") return "border-up/35 bg-up/10 text-up";
  if (value === "business_direct") return "border-info/35 bg-info/10 text-info";
  if (value === "supply_chain_related" || value === "theme_indirect") return "border-warn/35 bg-warn/10 text-warn";
  if (value === "mismatch") return "border-warn/35 bg-warn/10 text-warn";
  return "border-line bg-panel/70 text-muted";
}

export function formatThemeMatchType(value?: string) {
  const labels: Record<string, string> = {
    direct_constituent: "成分股直接匹配",
    business_direct: "主营直接匹配",
    supply_chain_related: "产业链相关",
    theme_indirect: "题材间接相关",
    mismatch: "主题偏离",
    unknown: "未知"
  };
  return labels[value ?? ""] ?? value ?? "未知";
}

export function formatRole(role: string) {
  const labels: Record<string, string> = {
    leader: "龙头",
    core: "中军",
    momentum: "补涨",
    dip_watch: "低吸观察",
    unknown: "未知"
  };
  return labels[role] ?? role;
}

export function formatTrend(trend: string) {
  const labels: Record<string, string> = {
    above_ma20: "站上MA20",
    below_ma20: "跌破MA20",
    reclaim_ma20: "收复MA20",
    downtrend: "下降趋势",
    unknown: "未知"
  };
  return labels[trend] ?? trend;
}

export function formatFundFlow(flow: string) {
  const labels: Record<string, string> = {
    inflow: "主力流入",
    outflow: "主力流出",
    mixed: "资金分歧",
    unknown: "未知"
  };
  return labels[flow] ?? flow;
}

export function formatAction(action: string) {
  const labels: Record<string, string> = {
    watch: "观察",
    trial_buy: "小仓试错",
    wait_pullback: "等待回踩",
    no_chase: "不追",
    avoid: "回避",
    insufficient: "数据不足"
  };
  return labels[action] ?? action;
}

export function formatCompleteness(level: string) {
  const labels: Record<string, string> = {
    complete: "完整",
    partial: "部分",
    insufficient: "不足"
  };
  return labels[level] ?? level;
}

export function localizeText(text?: string | null) {
  return String(text ?? "")
    .replaceAll("Market:", "大盘状态：")
    .replaceAll("Mainline:", "主线板块：")
    .replaceAll("Candidates:", "候选股数量：")
    .replaceAll("Invalid when MA20 breaks or mainline fades", "跌破MA20或主线退潮时失效")
    .replaceAll("Wait until reclaiming MA20", "等待重新收复MA20")
    .replaceAll("Weak trend versus MA20", "趋势弱于MA20")
    .replaceAll("Main fund flow is outflow", "主力资金净流出")
    .replaceAll("Defensive market state", "市场处于防守状态")
    .replaceAll("Accelerating sector, avoid chasing laggards", "板块加速阶段，避免追涨后排")
    .replaceAll("Company profile missing", "公司基础信息不足")
    .replaceAll("Rule-based initial match with mainline", "基于规则初步匹配主线")
    .replaceAll("Financial reports and announcement originals are not yet connected.", "财报和公告原文尚未接入。")
    .replaceAll("Track finance, reserve and official filings later.", "后续跟踪财报、业绩预告和正式公告。")
    .replaceAll("Market state by rule engine", "规则引擎判断的大盘状态")
    .replaceAll("Market state", "大盘状态")
    .replaceAll("latest daily close", "最新日线收盘价")
    .replaceAll("mainNetFlow", "主力净流")
    .replaceAll("close", "收盘价")
    .replaceAll("stage", "阶段")
    .replaceAll("trend", "趋势")
    .replaceAll("volume", "成交量")
    .replaceAll("amount", "成交额")
    .replaceAll("missing", "缺失")
    .replaceAll("unknown", "未知")
    .replaceAll("above_ma20", "站上MA20")
    .replaceAll("below_ma20", "跌破MA20")
    .replaceAll("reclaim_ma20", "收复MA20")
    .replaceAll("downtrend", "下降趋势")
    .replaceAll("inflow", "流入")
    .replaceAll("outflow", "流出")
    .replaceAll("mixed", "分歧")
    .replaceAll("complete", "完整")
    .replaceAll("partial", "部分")
    .replaceAll("insufficient", "不足");
}

export function formatAttributionSourceQuality(value?: string) {
  const labels: Record<string, string> = {
    direct: "直接证据",
    inferred: "规则归纳",
    weak: "弱相关",
    missing: "缺失"
  };
  return labels[value ?? ""] ?? value ?? "未知";
}
