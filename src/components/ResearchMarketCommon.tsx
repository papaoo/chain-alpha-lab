"use client";

import type * as React from "react";
import type { AnalysisReport } from "@/lib/types";

export function formatDataStatus(status: AnalysisReport["dataSourceStatus"]["status"]) {
  const labels: Record<AnalysisReport["dataSourceStatus"]["status"], string> = {
    success: "成功",
    partial: "部分可用",
    empty: "空数据",
    failed: "失败"
  };
  return labels[status] ?? status;
}

export function classifyDataWarnings(warnings: string[]) {
  return warnings.map((message) => {
    const type = message.includes("近似成分来源") || message.includes("关联板块")
      ? "近似映射"
      : message.includes("补充") || message.includes("补源") || message.includes("fallback")
        ? "备用补源"
        : message.includes("非交易日") || message.includes("休市")
          ? "休市/研究模式"
          : message.includes("盘前") || message.includes("竞价") || message.includes("时段")
            ? "时段降级"
            : message.includes("超时") || message.includes("HTTP") || message.includes("接口请求失败") || /failed|fetch failed|timeout|error/i.test(message)
              ? "接口失败"
              : message.includes("空数据")
                ? "空数据"
                : "数据提示";
    const tone = type === "接口失败" || type === "空数据" ? "risk" as const : "info" as const;
    const scope = message.includes("东方财富") ? "东方财富" : message.includes("westock") ? "westock-data" : "系统";
    return { type, message, tone, scope };
  });
}

export function groupDataWarnings(items: ReturnType<typeof classifyDataWarnings>) {
  const map = new Map<string, { type: string; tone: "risk" | "info"; scope: string; items: ReturnType<typeof classifyDataWarnings> }>();
  for (const item of items) {
    const key = `${item.type}-${item.scope}`;
    const current = map.get(key);
    if (current) current.items.push(item);
    else map.set(key, { type: item.type, tone: item.tone, scope: item.scope, items: [item] });
  }
  return Array.from(map.values()).sort((left, right) => {
    if (left.tone !== right.tone) return left.tone === "risk" ? -1 : 1;
    return right.items.length - left.items.length;
  });
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

export function formatTraceField(field: string) {
  const labels: Record<string, string> = {
    indexKline: "指数K线",
    indexTechnical: "指数技术",
    boardOverview: "板块概览",
    hotBoards: "热门板块",
    hotStocks: "热门股",
    marketBreadth: "全A宽度",
    sectorConstituents: "板块成分",
    quote: "行情报价",
    dailyKline: "日K",
    technical: "技术指标",
    fundFlow: "资金流",
    companyProfile: "公司资料"
  };
  return labels[field] ?? field;
}

export function formatTraceQuality(quality: string) {
  const labels: Record<string, string> = {
    primary: "主源",
    fallback: "备用补源",
    approximate: "近似映射",
    derived: "规则派生",
    missing: "缺失"
  };
  return labels[quality] ?? quality;
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

export function statusClass(status: string) {
  if (status === "强") return "border-up/40 bg-up/10 text-up";
  if (status === "中") return "border-info/40 bg-info/10 text-info";
  if (status === "缺失") return "border-muted/40 bg-white/5 text-muted";
  return "border-warn/40 bg-warn/10 text-warn";
}

export function statusFill(status: string) {
  if (status === "强") return "bg-up";
  if (status === "中") return "bg-info";
  if (status === "缺失") return "bg-muted";
  return "bg-warn";
}

export function stageColor(stage: string) {
  if (stage === "启动") return "bg-info";
  if (stage === "确认") return "bg-up";
  if (stage === "加速") return "bg-warn";
  if (stage === "分歧") return "bg-[#b779ff]";
  if (stage === "退潮") return "bg-down";
  return "bg-line";
}

export function coreStockClass(role: string, limitStatus: string) {
  if (limitStatus === "炸板") return "border-warn/40 bg-warn/10 text-warn";
  if (role === "龙头") return "border-up/40 bg-up/10 text-up";
  if (role === "中军") return "border-info/40 bg-info/10 text-info";
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

export function stagePillClass(stage: string) {
  if (stage === "确认" || stage === "启动") return "border-up/40 bg-up/10 text-up";
  if (stage === "加速") return "border-warn/40 bg-warn/10 text-warn";
  if (stage === "分歧") return "border-[#b779ff]/40 bg-[#b779ff]/10 text-[#d6b5ff]";
  if (stage === "退潮") return "border-down/40 bg-down/10 text-down";
  return "border-line bg-white/5 text-muted";
}

export function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line/70 bg-panel/70 p-2">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
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

export function formatLlmStatus(status: AnalysisReport["llmStatus"]) {
  const labels: Record<AnalysisReport["llmStatus"], string> = {
    disabled: "模型未启用",
    success: "模型成功",
    rejected: "模型输出被拒绝",
    failed: "模型失败"
  };
  return labels[status] ?? status;
}

export function formatPctDisplay(value?: number) {
  return value === undefined ? undefined : `${value.toFixed(2)}%`;
}

export function formatSignedPctDisplay(value?: number) {
  if (value === undefined) return undefined;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}
