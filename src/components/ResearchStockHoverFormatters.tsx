"use client";

export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line/70 bg-panel/70 p-2">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

export function formatPriceDisplay(value?: number) {
  return value === undefined ? "缺失" : value.toFixed(2);
}

export function formatPctDisplay(value?: number) {
  return value === undefined ? undefined : `${value.toFixed(2)}%`;
}

export function formatSignedPctDisplay(value?: number) {
  if (value === undefined) return undefined;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatMoneyDisplay(value?: number) {
  if (value === undefined) return undefined;
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${(value / 100000000).toFixed(2)}亿`;
  if (abs >= 10000) return `${(value / 10000).toFixed(2)}万`;
  return value.toFixed(2);
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

export function coreStockClass(role: string, limitStatus?: string) {
  if (limitStatus && limitStatus !== "未涨停") return "border-up/40 bg-up/10 text-up";
  if (role === "leader") return "border-info/40 bg-info/10 text-info";
  if (role === "core") return "border-warn/40 bg-warn/10 text-warn";
  return "border-line bg-bg/70 text-muted";
}

export function localizeText(text?: string | null) {
  return String(text ?? "")
    .replaceAll("Invalid when MA20 breaks or mainline fades", "跌破MA20或主线退潮时失效")
    .replaceAll("Wait until reclaiming MA20", "等待重新收复MA20")
    .replaceAll("Weak trend versus MA20", "趋势弱于MA20")
    .replaceAll("Main fund flow is outflow", "主力资金净流出")
    .replaceAll("Defensive market state", "市场处于防守状态");
}
