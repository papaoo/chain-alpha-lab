"use client";

import type * as React from "react";
import type { AnalysisReport, Fact } from "@/lib/types";
import { SmartStockTitle } from "@/components/ResearchStockHover";

export function InsightBlock({
  icon: Icon,
  title,
  meta,
  lines,
  refs,
  factMap
}: {
  icon: React.ElementType;
  title: string;
  meta: string;
  lines: Array<[string, string]>;
  refs: string[];
  factMap: Map<string, Fact>;
}) {
  return (
    <div className="rounded-lg border border-line/80 bg-panel/70 p-3">
      <SectionTitle icon={Icon} title={title} meta={meta} />
      <div className="mt-4 grid gap-2">
        {lines.map(([label, value]) => (
          <PlanLine key={label} label={label} value={value} />
        ))}
      </div>
      <EvidenceChips refs={refs.slice(0, 5)} factMap={factMap} />
    </div>
  );
}

export function InsightList({
  icon: Icon,
  title,
  meta,
  items,
  factMap
}: {
  icon: React.ElementType;
  title: string;
  meta: string;
  items: Array<{ title: string; body: string; refs: string[] }>;
  factMap: Map<string, Fact>;
}) {
  return (
    <div className="rounded-lg border border-line/80 bg-panel/70 p-3">
      <SectionTitle icon={Icon} title={title} meta={meta} />
      <div className="mt-4 space-y-2">
        {items.map((item, index) => (
          <div key={`${item.title}-${index}`} className="rounded-lg border border-line/70 bg-bg/50 p-3">
            <p className="text-sm font-medium"><SmartStockTitle title={item.title} /></p>
            <p className="mt-2 text-xs leading-5 text-muted">{localizeText(item.body)}</p>
            <EvidenceChips refs={item.refs.slice(0, 4)} factMap={factMap} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function EvidenceChips({ refs, factMap }: { refs: string[]; factMap: Map<string, Fact> }) {
  if (!refs.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {refs.map((ref, index) => {
        const fact = factMap.get(ref);
        return (
          <span
            key={`${ref}-${index}`}
            className="rounded border border-info/30 bg-info/10 px-2 py-1 text-[11px] text-info"
            title={fact?.text ? localizeText(fact.text) : ref}
          >
            {formatFactId(ref)}
          </span>
        );
      })}
    </div>
  );
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

export function PlanLine({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "warn" }) {
  return (
    <div className={`rounded-lg border p-3 text-xs leading-5 ${tone === "warn" ? "border-warn/30 bg-warn/10 text-warn" : "border-line/70 bg-panel/70 text-muted"}`}>
      <p className="mb-1 font-medium text-text">{label}</p>
      {localizeText(value)}
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

export function formatMarketState(state: string) {
  if (state === "tradable") return "可交易";
  if (state === "cautious") return "谨慎交易";
  if (state === "defensive") return "防守观望";
  return state || "未知";
}

export function stagePillClass(stage: string) {
  if (stage === "确认" || stage === "启动") return "border-up/40 bg-up/10 text-up";
  if (stage === "加速") return "border-warn/40 bg-warn/10 text-warn";
  if (stage === "分歧") return "border-[#b779ff]/40 bg-[#b779ff]/10 text-[#d6b5ff]";
  if (stage === "退潮") return "border-down/40 bg-down/10 text-down";
  return "border-line bg-white/5 text-muted";
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

export function formatFactId(factId: string) {
  const parts = factId.split(".");
  if (parts[0] === "stock") {
    const code = parts[1] ?? "";
    if (parts.includes("hot")) return `${code} 热门行情`;
    if (parts.includes("kline")) return `${code} K线数据`;
    if (parts.includes("technical")) return `${code} 技术指标`;
    if (parts.includes("fund")) return `${code} 资金流`;
    return `${code} 个股事实`;
  }
  if (parts[0] === "company") return `${parts[1] ?? ""} 公司认知`;
  if (parts[0] === "memory" && parts[1] === "stock") return `${parts[2] ?? ""} 历史跟踪`;
  if (parts[0] === "sector") return `${parts[1] ?? ""} 板块证据`;
  if (parts[0] === "market") return `${parts[1] ?? ""} 大盘指数`;
  if (parts[0] === "rule" && parts[1] === "market") return "规则引擎：大盘状态";
  if (parts[0] === "rule" && parts[1] === "sector") return `规则引擎：${parts[2] ?? ""} 主线阶段`;
  return factId;
}
