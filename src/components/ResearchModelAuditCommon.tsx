"use client";

import type * as React from "react";
import { Clipboard } from "lucide-react";
import type { AppSettings, ModelAuditStatus, StoredModelAuditFeedback } from "@/lib/types";

export type AuditSummary = {
  id: string;
  reportId: string;
  summary: string;
  status: ModelAuditStatus;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  highPriorityCount: number;
  categoryCounts: Array<{ category: string; count: number }>;
};

export type AuditDetail = StoredModelAuditFeedback;

export function AuditFeedbackHeader({
  feedbackCount,
  settings,
  saving,
  onToggle
}: {
  feedbackCount: number;
  settings: AppSettings | null;
  saving: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const enabled = Boolean(settings?.modelAuditEnabled);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <SectionTitle
        icon={Clipboard}
        title="系统反馈"
        meta={feedbackCount ? `${feedbackCount} 条审计记录` : "运行今日分析后生成模型审计建议"}
      />
      <label className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm sm:w-auto ${enabled ? "border-info/40 bg-info/10 text-info" : "border-line bg-bg/60 text-muted"}`}>
        <span>
          <span className="block font-medium">生成反馈</span>
          <span className="mt-0.5 block text-[11px] text-muted">{enabled ? "下次分析会生成" : "节省 Token"}</span>
        </span>
        <button
          className={`relative h-6 w-11 rounded-full border transition ${enabled ? "border-info/50 bg-info/60" : "border-line bg-panel"}`}
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={!settings || saving}
          onClick={() => onToggle(!enabled)}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-text transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </label>
    </div>
  );
}

export function auditStatusClass(status: ModelAuditStatus) {
  if (status === "已采纳") return "border-up/40 bg-up/10 text-up";
  if (status === "已实现") return "border-info/40 bg-info/10 text-info";
  if (status === "已拒绝") return "border-warn/40 bg-warn/10 text-warn";
  return "border-line bg-white/5 text-muted";
}

export function auditCategoryClass(category: string) {
  if (category === "数据缺口") return "border-info/40 bg-info/10 text-info";
  if (category === "规则疑点") return "border-warn/40 bg-warn/10 text-warn";
  if (category === "不建议改动") return "border-up/40 bg-up/10 text-up";
  return "border-line bg-white/5 text-muted";
}

export function auditPriorityClass(priority: string) {
  if (priority === "高") return "border-warn/40 bg-warn/10 text-warn";
  if (priority === "中") return "border-info/40 bg-info/10 text-info";
  return "border-line bg-white/5 text-muted";
}

export function summarizeAuditCategories(item: AuditSummary) {
  return item.categoryCounts.map(({ category, count }) => `${category} ${count}`);
}

export function buildAuditCopyText(item: AuditDetail) {
  const lines = [
    "请判断以下 DeepSeek 系统反馈是否合理，是否需要更新进系统。",
    `反馈ID：${item.id}`,
    `关联报告：${item.reportId}`,
    `状态：${item.status}`,
    `摘要：${item.feedback.summary}`,
    "",
    "反馈项：",
    ...item.feedback.items.map((feedback, index) => [
      `${index + 1}. [${feedback.priority}][${feedback.category}] ${feedback.title}`,
      `问题：${feedback.issue}`,
      `影响：${feedback.impact}`,
      `建议：${feedback.suggestion}`,
      `证据：${feedback.evidenceRefs.join("、")}`
    ].join("\n")),
    "",
    "不建议轻易改动：",
    ...item.feedback.doNotChange.map((feedback, index) => `${index + 1}. ${feedback.reason}（证据：${feedback.evidenceRefs.join("、")}）`)
  ];
  return lines.join("\n");
}

export function PlanLine({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "warn" }) {
  return (
    <div className={`rounded-lg border p-3 text-xs leading-5 ${tone === "warn" ? "border-warn/30 bg-warn/10 text-warn" : "border-line/70 bg-panel/70 text-muted"}`}>
      <p className="mb-1 font-medium text-text">{label}</p>
      {value}
    </div>
  );
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
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
