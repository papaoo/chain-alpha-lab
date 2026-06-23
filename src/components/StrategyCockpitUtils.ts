import type { AnalysisReport, LlmStatus } from "@/lib/types";
import type { ApiResponse, CockpitWarning, MacroSnapshot, MarketSessionSnapshot, SentimentItem, Tone } from "@/components/StrategyCockpitTypes";
import { fetchApiJson } from "@/lib/client/api";

export function buildSentimentItems(report: AnalysisReport | null, macroSnapshot: MacroSnapshot | null): SentimentItem[] {
  const market = report?.ruleResult.market;
  const risks = market?.riskFlags ?? [];
  const macroRisks = macroSnapshot?.riskFlags ?? [];
  const diagnostics = market?.diagnostics ?? [];
  const emotionDiagnostic = diagnostics.find((item) => item.label.includes("情绪") || item.note.includes("涨停"));
  const breadthDiagnostic = diagnostics.find((item) => item.label.includes("宽度") || item.note.includes("上涨占比"));
  const llmPressure = report?.llmResult?.marketStructureInsight?.riskPressure;

  return [
    {
      label: "A股交易情绪",
      status: market?.sentimentCycle ?? "待分析",
      tone: sentimentCycleTone(market?.sentimentCycle),
      reason: emotionDiagnostic?.note ?? "等待规则引擎输出涨跌停、炸板率、连板和大跌家数。"
    },
    {
      label: "市场宽度",
      status: breadthDiagnostic ? `${breadthDiagnostic.score}/${breadthDiagnostic.max}` : "待分析",
      tone: breadthDiagnostic ? scoreTone(breadthDiagnostic.score, breadthDiagnostic.max) : "muted",
      reason: breadthDiagnostic?.note ?? "等待全 A 宽度和中位涨跌幅数据。"
    },
    {
      label: "宏观压力",
      status: macroRisks.length ? `${macroRisks.length} 条` : "未触发",
      tone: macroRisks.length >= 2 ? "risk" : macroRisks.length === 1 ? "warn" : "up",
      reason: macroRisks[0] ?? "当前宏观快照未触发明显压制信号。"
    },
    {
      label: "模型语境",
      status: report?.llmStatus === "success" ? "已研判" : formatLlmStatus(report?.llmStatus ?? "disabled"),
      tone: report?.llmStatus === "success" ? "info" : "muted",
      reason: llmPressure ?? "模型语境未生成或已关闭。本项不会自行编造新闻。"
    },
    {
      label: "风控压力",
      status: risks.length ? `${risks.length} 条` : "无新增",
      tone: risks.length >= 3 ? "risk" : risks.length ? "warn" : "up",
      reason: risks[0] ?? "当前报告没有新增风控提示。"
    }
  ];
}

export function classifyCockpitDataWarnings(warnings: string[]): CockpitWarning[] {
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
              : message.includes("空数据") || message.includes("缺失")
                ? "空数据/缺字段"
                : "数据提示";
    const tone: Tone = type === "接口失败" || type === "空数据/缺字段" ? "risk" : type === "近似映射" || type === "时段降级" ? "warn" : "info";
    const scope = message.includes("Tushare")
      ? "Tushare"
      : message.includes("东方财富")
        ? "东方财富"
        : message.includes("westock")
          ? "westock-data"
          : "系统";
    return { type, message, tone, scope };
  });
}

export function groupCockpitDataWarnings(items: CockpitWarning[]) {
  const map = new Map<string, { type: string; tone: Tone; scope: string; items: CockpitWarning[] }>();
  for (const item of items) {
    const key = `${item.type}-${item.scope}`;
    const current = map.get(key);
    if (current) current.items.push(item);
    else map.set(key, { type: item.type, tone: item.tone, scope: item.scope, items: [item] });
  }
  return Array.from(map.values()).sort((left, right) => warningToneWeight(right.tone) - warningToneWeight(left.tone) || right.items.length - left.items.length);
}

export function warningToneWeight(tone: Tone) {
  if (tone === "risk") return 3;
  if (tone === "warn") return 2;
  if (tone === "info") return 1;
  return 0;
}

export function sentimentCycleTone(cycle?: string): Tone {
  if (!cycle) return "muted";
  if (cycle.includes("退潮") || cycle.includes("冰点")) return "risk";
  if (cycle.includes("分歧") || cycle.includes("修复")) return "warn";
  if (cycle.includes("高潮") || cycle.includes("上升")) return "up";
  return "info";
}

export function scoreTone(score: number, max: number): Tone {
  const ratio = max > 0 ? score / max : 0;
  if (ratio >= 0.7) return "up";
  if (ratio >= 0.45) return "warn";
  return "risk";
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<ApiResponse<T>> {
  return fetchApiJson<T>(url, init);
}

export function buildMacroItems(snapshot: MacroSnapshot | null, status: "loading" | "ready" | "failed") {
  const assetMap = new Map((snapshot?.assets ?? []).map((item) => [item.key, item]));
  const definitions = [
    { key: "nasdaq", label: "纳斯达克", hint: "科技成长风险偏好参考。" },
    { key: "sp500", label: "标普500", hint: "全球风险资产基准。" },
    { key: "usdcnh", label: "美元/离岸人民币", hint: "汇率压力与外资风险偏好参考。" },
    { key: "a50_future", label: "A50期指", hint: "盘前风险偏好优先参考，和富时A50指数不是同一标的。" },
    { key: "a50_index", label: "富时A50指数", hint: "官方指数/延迟行情，用于和期指对照。" },
    { key: "hsi", label: "恒生指数", hint: "港股与外资风险偏好参考。" },
    { key: "gold", label: "COMEX黄金", hint: "避险情绪与通胀预期参考。" },
    { key: "oil", label: "NYMEX原油", hint: "资源线、通胀预期与全球需求参考。" },
    { key: "sox", label: "费半指数", hint: "半导体与科技主线情绪参考，当前东方财富快照未覆盖。" }
  ];

  return definitions.map((definition) => {
    const asset = assetMap.get(definition.key);
    if (!asset) {
      const value = status === "loading" ? "读取中" : status === "failed" ? "快照失败" : "暂无数据";
      const hint = status === "ready"
        ? `${definition.hint} 当前数据源未返回该资产，不能用模型补写。`
        : definition.hint;
      return { label: definition.label, value, hint, tone: status === "failed" ? "warn" as Tone : "muted" as Tone };
    }
    const pct = asset.changePct;
    const value = `${formatNumber(asset.latest)} ${pct === null ? "" : `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`}`.trim();
    const typeLabel = asset.dataType === "futures" ? "期指"
      : asset.dataType === "index" ? "指数"
        : asset.dataType === "fx" ? "汇率"
          : asset.dataType === "commodity" ? "商品"
            : "行情";
    return { label: definition.label, value, hint: `${asset.note} 类型：${typeLabel}；标识：${asset.symbol}；来源：${asset.source}`, tone: macroTone(asset.key, pct) };
  });
}

export function buildBreadthDots(upPct: number, downPct: number, flatPct: number) {
  const total = 160;
  const up = Math.round((upPct / 100) * total);
  const down = Math.round((downPct / 100) * total);
  const flat = Math.max(0, total - up - down || Math.round((flatPct / 100) * total));
  return [
    ...Array.from({ length: up }, () => "up" as const),
    ...Array.from({ length: flat }, () => "flat" as const),
    ...Array.from({ length: down }, () => "down" as const)
  ].slice(0, total);
}

export function emotionLabel(heat: number, burstRate: number) {
  if (burstRate >= 40) return "分歧偏大";
  if (heat >= 70) return "情绪高热";
  if (heat >= 45) return "局部活跃";
  if (heat >= 25) return "弱修复";
  return "情绪低温";
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function formatSignedPct(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatPercent(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "--";
  return `${value.toFixed(1)}%`;
}

export function formatMoney(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "--";
  const abs = Math.abs(value);
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(2)}亿`;
  if (abs >= 10_000) return `${sign}${(abs / 10_000).toFixed(0)}万`;
  return `${sign}${abs.toFixed(0)}`;
}

export function macroTone(key: string, pct: number | null): Tone {
  if (pct === null) return "muted";
  if (key === "usdcnh") {
    if (pct >= 0.3) return "warn";
    if (pct <= -0.2) return "up";
    return "info";
  }
  if (key === "gold") {
    if (pct >= 1.5) return "warn";
    if (pct <= -1.5) return "info";
    return "muted";
  }
  if (key === "oil") {
    if (pct >= 2) return "warn";
    if (pct <= -2) return "risk";
    return "muted";
  }
  if (pct <= -1.5) return "risk";
  if (pct < 0) return "warn";
  if (pct > 0) return "up";
  return "info";
}

export function macroPressureScore(assets: MacroSnapshot["assets"]) {
  const valueOf = (key: string) => assets.find((item) => item.key === key)?.changePct ?? null;
  let score = 20;
  const nasdaq = valueOf("nasdaq");
  const sp500 = valueOf("sp500");
  const a50 = valueOf("a50_future") ?? valueOf("a50_index");
  const hsi = valueOf("hsi");
  const usdcnh = valueOf("usdcnh");
  const gold = valueOf("gold");
  const oil = valueOf("oil");

  if (nasdaq !== null) score += nasdaq <= -2 ? 22 : nasdaq < 0 ? 8 : -5;
  if (sp500 !== null) score += sp500 <= -1.5 ? 16 : sp500 < 0 ? 6 : -4;
  if (a50 !== null) score += a50 <= -1 ? 18 : a50 < 0 ? 7 : -5;
  if (hsi !== null) score += hsi <= -1.5 ? 10 : hsi < 0 ? 4 : -3;
  if (usdcnh !== null) score += usdcnh >= 0.3 ? 12 : usdcnh > 0 ? 4 : -3;
  if (gold !== null) score += gold >= 1.5 ? 8 : gold <= -1.5 ? -2 : 0;
  if (oil !== null) score += oil >= 2 ? 5 : oil <= -2 ? 4 : 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function macroNodeTone(key: string, pct: number | null | undefined) {
  if (pct === null || pct === undefined) return "bg-slate-900/70 text-slate-500";
  const tone = macroTone(key, pct);
  if (tone === "risk") return "bg-rose-400/15 text-rose-100";
  if (tone === "warn") return "bg-amber-400/15 text-amber-100";
  if (tone === "up") return "bg-emerald-400/15 text-emerald-100";
  return "bg-cyan-400/12 text-cyan-100";
}

export function formatNumber(value: number | null) {
  if (value === null) return "--";
  return value >= 1000 ? value.toFixed(2) : value.toString();
}

export function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export function formatTradeDate(value?: string) {
  if (!value) return "--";
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  return value;
}

export function formatMarketState(state?: AnalysisReport["ruleResult"]["market"]["marketState"]) {
  const labels: Record<string, string> = { tradable: "可交易", cautious: "谨慎交易", defensive: "防守观望" };
  return labels[String(state)] ?? "等待报告";
}

export function formatLlmStatus(status: LlmStatus) {
  const labels: Record<LlmStatus, string> = { disabled: "模型关闭", success: "模型已研判", rejected: "模型输出被拦截", failed: "模型失败" };
  return labels[status] ?? status;
}

export function llmStatusTone(status?: LlmStatus): Tone {
  if (status === "success") return "info";
  if (status === "rejected" || status === "failed") return "risk";
  if (status === "disabled") return "muted";
  return "muted";
}

export function formatSectorStage(stage: string) {
  const labels: Record<string, string> = { watch: "观察", start: "启动", confirm: "确认", accelerate: "加速", divergence: "分歧", fade: "退潮" };
  return labels[stage] ?? stage;
}

export function formatAction(action: string) {
  const labels: Record<string, string> = { small_try: "小仓试错", observe: "观察", avoid: "回避", no_chase: "不追", data_insufficient: "数据不足" };
  return labels[action] ?? action;
}

export function marketStateTone(state?: AnalysisReport["ruleResult"]["market"]["marketState"]): Tone {
  if (state === "tradable") return "up";
  if (state === "cautious") return "warn";
  if (state === "defensive") return "risk";
  return "info";
}

export function sessionTone(session: MarketSessionSnapshot | null): Tone {
  if (!session) return "info";
  if (!session.isTradingDay) return "warn";
  if (session.mode === "trade") return "up";
  if (session.mode === "review") return "info";
  return "muted";
}

export function sessionModeLabel(mode?: MarketSessionSnapshot["mode"]) {
  const labels: Record<MarketSessionSnapshot["mode"], string> = { trade: "交易盯盘", watch: "观察计划", review: "复盘确认", research: "研究模式" };
  return mode ? labels[mode] : "识别中";
}

export function sessionBorder(tone: Tone) {
  return { up: "border-emerald-400/30", warn: "border-amber-400/35", risk: "border-rose-400/35", info: "border-cyan-400/25", muted: "border-slate-700" }[tone];
}

export function sessionGradient(tone: Tone) {
  return {
    up: "bg-[linear-gradient(135deg,rgba(16,185,129,0.16),rgba(15,23,42,0.78)_58%,rgba(14,165,233,0.08))]",
    warn: "bg-[linear-gradient(135deg,rgba(245,158,11,0.18),rgba(15,23,42,0.8)_58%,rgba(14,165,233,0.06))]",
    risk: "bg-[linear-gradient(135deg,rgba(244,63,94,0.16),rgba(15,23,42,0.8)_58%,rgba(245,158,11,0.08))]",
    info: "bg-[linear-gradient(135deg,rgba(14,165,233,0.16),rgba(15,23,42,0.8)_58%,rgba(16,185,129,0.06))]",
    muted: "bg-slate-950/70"
  }[tone];
}

export function sessionChipClass(tone: Tone) {
  return {
    up: "border border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
    warn: "border border-amber-400/25 bg-amber-400/10 text-amber-200",
    risk: "border border-rose-400/25 bg-rose-400/10 text-rose-200",
    info: "border border-cyan-400/25 bg-cyan-400/10 text-cyan-200",
    muted: "border border-slate-700 bg-slate-900 text-slate-300"
  }[tone];
}

export function toneBadge(tone: Tone) {
  return {
    up: "border-emerald-400/35 bg-emerald-400/10 text-emerald-200",
    warn: "border-amber-400/35 bg-amber-400/10 text-amber-200",
    risk: "border-rose-400/35 bg-rose-400/10 text-rose-200",
    info: "border-cyan-400/35 bg-cyan-400/10 text-cyan-200",
    muted: "border-slate-700 bg-slate-900 text-slate-300"
  }[tone];
}

export function toneBorder(tone: Tone) {
  return { up: "border-emerald-400/25", warn: "border-amber-400/25", risk: "border-rose-400/25", info: "border-slate-800", muted: "border-slate-800" }[tone];
}

export function toneText(tone: Tone) {
  return { up: "text-emerald-200", warn: "text-amber-200", risk: "text-rose-200", info: "text-slate-100", muted: "text-slate-300" }[tone];
}

export function sentimentBoxClass(tone: Tone) {
  return {
    up: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
    warn: "border-amber-400/25 bg-amber-400/10 text-amber-100",
    risk: "border-rose-400/25 bg-rose-400/10 text-rose-100",
    info: "border-cyan-400/25 bg-cyan-400/10 text-cyan-100",
    muted: "border-slate-800 bg-slate-950/58 text-slate-300"
  }[tone];
}

export function dotClass(tone: Tone) {
  return { up: "bg-emerald-300", warn: "bg-amber-300", risk: "bg-rose-300", info: "bg-cyan-300", muted: "bg-slate-400" }[tone];
}
