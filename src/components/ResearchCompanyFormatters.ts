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

export function formatAttributionSourceQuality(value?: string) {
  const labels: Record<string, string> = {
    direct: "直接证据",
    inferred: "规则归纳",
    weak: "弱相关",
    missing: "缺失"
  };
  return labels[value ?? ""] ?? value ?? "未知";
}

export function formatThemeMatch(value: string) {
  if (value === "strong") return "强";
  if (value === "medium") return "中";
  if (value === "weak") return "弱";
  if (value === "unknown") return "未知";
  return value || "未知";
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

export function attributionPillClass(value?: string) {
  if (value === "direct_constituent") return "border-up/35 bg-up/10 text-up";
  if (value === "business_direct") return "border-info/35 bg-info/10 text-info";
  if (value === "supply_chain_related" || value === "theme_indirect") return "border-warn/35 bg-warn/10 text-warn";
  if (value === "mismatch") return "border-warn/35 bg-warn/10 text-warn";
  return "border-line bg-panel/70 text-muted";
}

export function formatChainPosition(value?: string) {
  if (!value || value === "unknown") return "未知";
  return value;
}

export function formatMoneyDisplay(value?: number) {
  if (value === undefined) return undefined;
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${(value / 100000000).toFixed(2)}亿`;
  if (abs >= 10000) return `${(value / 10000).toFixed(2)}万`;
  return value.toFixed(2);
}

export function formatPctDisplay(value?: number) {
  return value === undefined ? undefined : `${value.toFixed(2)}%`;
}

export function formatSignedPctDisplay(value?: number) {
  if (value === undefined) return undefined;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatKnowledgeState(value: string) {
  if (value === "sufficient") return "充分";
  if (value === "partial") return "部分";
  if (value === "missing") return "缺失";
  return value || "未知";
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

export function statusFill(status: string) {
  if (status === "强") return "bg-up";
  if (status === "中") return "bg-info";
  if (status === "缺失") return "bg-muted";
  return "bg-warn";
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
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
