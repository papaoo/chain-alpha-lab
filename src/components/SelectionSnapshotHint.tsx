"use client";

import { cleanDisplayText } from "@/lib/display/text";
import type { SelectionPick } from "@/lib/selection/types";

export function SelectionSnapshotHint({ pick, compact = false }: { pick: SelectionPick; compact?: boolean }) {
  const snapshot = pick.runtimeSnapshot;
  const price = snapshot?.latestPrice ?? pick.price;
  const changePct = snapshot?.changePct ?? pick.changePct;
  const age = snapshotAge(snapshot?.quoteUpdatedAt ?? snapshot?.fetchedAt ?? pick.dataFreshness?.refreshedAt);
  const actionability = snapshot?.actionability;
  const sourceLabel = cleanDisplayText(snapshot?.source ?? pick.dataFreshness?.label) ?? "未记录";
  const snapshotTime = formatDateTimeOptional(snapshot?.fetchedAt ?? pick.dataFreshness?.refreshedAt);
  const quoteTime = formatDateTimeOptional(snapshot?.quoteUpdatedAt);
  const title = [
    "列表展示的是选股运行快照，不一定是当前行情。",
    "鼠标悬停股票名称可请求或查看当前统一行情快照。",
    `快照来源：${sourceLabel}`,
    `运行时间：${snapshotTime}`,
    `报价时间：${quoteTime}`
  ].join(" ");

  return (
    <div
      className={`mt-2 rounded-lg border px-2 py-1.5 text-[11px] leading-4 ${hintClass(age.state)}`}
      title={title}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">运行价</span>
        <span className="font-mono">{formatPrice(price)}</span>
        <span>{formatPct(changePct)}</span>
        <span className="opacity-80">{age.label}</span>
        {actionability ? (
          <span className={`rounded border px-1.5 py-0.5 ${actionabilityClass(actionability.level)}`}>
            {cleanDisplayText(actionability.label) ?? actionability.label}
          </span>
        ) : null}
        {!compact ? <span className="opacity-70">悬停股票名查看当前快照</span> : null}
      </div>
      {!compact ? <p className="mt-1 opacity-75">运行 {snapshotTime} / 报价 {quoteTime}</p> : null}
      {!compact && snapshot?.qualityLabel ? <p className="mt-1 opacity-80">{cleanDisplayText(snapshot.qualityLabel)}</p> : null}
      {!compact && actionability?.reason ? <p className="mt-1 opacity-80">{cleanDisplayText(actionability.reason)}</p> : null}
    </div>
  );
}

function snapshotAge(value?: string) {
  if (!value) return { state: "unknown" as const, label: "时间未知" };
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return { state: "unknown" as const, label: "时间异常" };
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60_000));
  if (minutes <= 3) return { state: "fresh" as const, label: "刚刷新" };
  if (minutes <= 20) return { state: "aging" as const, label: `${minutes}分钟前` };
  return { state: "stale" as const, label: "需要刷新" };
}

function hintClass(state: ReturnType<typeof snapshotAge>["state"]) {
  if (state === "fresh") return "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100";
  if (state === "aging") return "border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-100";
  if (state === "stale") return "border-amber-300/25 bg-amber-300/[0.08] text-amber-100";
  return "border-slate-700 bg-slate-900/55 text-slate-400";
}

function actionabilityClass(level: NonNullable<NonNullable<SelectionPick["runtimeSnapshot"]>["actionability"]>["level"]) {
  if (level === "actionable") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (level === "reference_only") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-rose-300/25 bg-rose-300/10 text-rose-100";
}

function formatPrice(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "价格缺失";
  return value.toFixed(2);
}

function formatPct(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "涨跌缺失";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatDateTimeOptional(value?: string) {
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
