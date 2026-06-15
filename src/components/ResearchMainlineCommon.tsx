"use client";

import { useState } from "react";
import type * as React from "react";
import { ChevronDown } from "lucide-react";
import type { AnalysisReport } from "@/lib/types";

export function StatusPill({ icon: Icon, label, tone }: { icon: React.ElementType; label: string; tone: "up" | "info" | "warn" }) {
  const cls = tone === "up" ? "border-up/35 bg-up/10 text-up" : tone === "warn" ? "border-warn/35 bg-warn/10 text-warn" : "border-info/35 bg-info/10 text-info";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${cls}`}>
      <Icon size={14} />
      {label}
    </span>
  );
}

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

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg/60 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
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

export function formatReportStatus(status: AnalysisReport["reportStatus"]) {
  const labels: Record<AnalysisReport["reportStatus"], string> = {
    ruleOnly: "仅规则报告",
    llmEnhanced: "模型增强报告",
    blocked: "已阻断",
    failed: "失败"
  };
  return labels[status] ?? status;
}

export function formatLlmStatus(status: AnalysisReport["llmStatus"]) {
  const labels: Record<AnalysisReport["llmStatus"], string> = {
    disabled: "模型未启用",
    success: "模型成功",
    rejected: "模型输出被拒绝",
    failed: "模型失败"
  };
  return labels[status] ?? status;
}

export function sessionTone(phase?: string): "up" | "info" | "warn" {
  if (phase === "call_auction" || phase === "closing_auction") return "warn";
  if (phase === "morning" || phase === "midday_break" || phase === "afternoon" || phase === "premarket") return "info";
  return "up";
}

export function formatMarketState(state: string) {
  if (state === "tradable") return "可交易";
  if (state === "cautious") return "谨慎交易";
  if (state === "defensive") return "防守观望";
  return state || "未知";
}

export function formatStage(stage: string) {
  if (stage === "unknown") return "观察";
  return stage || "未知";
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

export function stageColor(stage: string) {
  if (stage === "启动") return "bg-info";
  if (stage === "确认") return "bg-up";
  if (stage === "加速") return "bg-warn";
  if (stage === "分歧") return "bg-[#b779ff]";
  if (stage === "退潮") return "bg-down";
  return "bg-line";
}

export function stagePillClass(stage: string) {
  if (stage === "确认" || stage === "启动") return "border-up/40 bg-up/10 text-up";
  if (stage === "加速") return "border-warn/40 bg-warn/10 text-warn";
  if (stage === "分歧") return "border-[#b779ff]/40 bg-[#b779ff]/10 text-[#d6b5ff]";
  if (stage === "退潮") return "border-down/40 bg-down/10 text-down";
  return "border-line bg-white/5 text-muted";
}

export function timelineTrendClass(trend: string) {
  if (trend === "改善" || trend === "新出现") return "border-up/40 bg-up/10 text-up";
  if (trend === "持平") return "border-info/40 bg-info/10 text-info";
  if (trend === "无历史") return "border-line bg-white/5 text-muted";
  return "border-warn/40 bg-warn/10 text-warn";
}

export function marketStateTextClass(state: string) {
  if (state === "tradable") return "text-up";
  if (state === "cautious") return "text-info";
  return "text-warn";
}

export function marketStateFill(state: string) {
  if (state === "tradable") return "bg-up";
  if (state === "cautious") return "bg-info";
  return "bg-warn";
}

export function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
