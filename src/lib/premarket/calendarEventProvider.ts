import { firstTableRows, type ParsedCell } from "@/lib/westock/parser";
import { westockAdapter } from "@/lib/westock/adapter";
import type { DataProviderId } from "@/lib/types";
import type { PremarketCalendarEvent } from "@/lib/premarket/types";

export type CalendarSourceStatus = "ok" | "partial" | "failed";

export type CalendarEventProviderSource = {
  provider: DataProviderId;
  role: "primary" | "planned_fallback";
  scope: "macro_calendar";
  note: string;
};

export type CalendarEventProviderResult = {
  events: PremarketCalendarEvent[];
  sourceStatus: CalendarSourceStatus;
  warnings: string[];
};

const SOURCES: CalendarEventProviderSource[] = [
  {
    provider: "tencent_zixuangu",
    role: "primary",
    scope: "macro_calendar",
    note: "westock calendar 提供中美宏观事件，当前用于盘前温度和事件提醒。"
  },
  {
    provider: "tushare",
    role: "planned_fallback",
    scope: "macro_calendar",
    note: "后续可接 Tushare/官方财经日历作为备用源，避免单一路径失败。"
  }
];

export class CalendarEventProvider {
  describe() {
    return {
      name: "CalendarEventProvider",
      providers: SOURCES,
      contract: "为盘前侦察提供中美宏观事件列表、事件相关性、事件时点和来源状态。",
      boundary: "只负责宏观日历获取、过滤和排序，不负责外围指数温度评分、交易建议或消息推送。"
    };
  }

  async fetchNearTermEvents(today = localDateKey(new Date())): Promise<CalendarEventProviderResult> {
    const [china, us] = await Promise.all([
      westockAdapter.getCalendar(today, 1, 1, 20, { timeoutMs: 60000, retries: 1 }),
      westockAdapter.getCalendar(today, 2, 1, 20, { timeoutMs: 60000, retries: 1 })
    ]);
    const rows = [...firstTableRows(china), ...firstTableRows(us)];
    const chinaFailed = china.status === "failed";
    const usFailed = us.status === "failed";
    const sourceStatus: CalendarSourceStatus = chinaFailed && usFailed ? "failed" : chinaFailed || usFailed ? "partial" : "ok";
    const events = rows
      .map(toCalendarEvent)
      .filter((event): event is PremarketCalendarEvent => Boolean(event))
      .filter((event) => event.weight >= 2)
      .filter(isNearTermCalendarEvent)
      .sort(sortCalendarEventsForPremarket)
      .slice(0, 20);
    return {
      events,
      sourceStatus,
      warnings: [
        ...(chinaFailed ? china.warnings : []),
        ...(usFailed ? us.warnings : []),
        ...(!events.length ? ["westock 投资日历未返回中美高权重事件。"] : [])
      ]
    };
  }
}

function toCalendarEvent(row: Record<string, ParsedCell>): PremarketCalendarEvent | null {
  const date = stringCell(row.date);
  const content = stringCell(row.Content);
  if (!date || !content) return null;
  const time = stringCell(row.time) ?? "00:00";
  const country = stringCell(row.CountryName) ?? "未知";
  const weight = numberCell(row.Weightiness) ?? 1;
  const actual = stringCell(row.CurrentValue);
  const timing = inferCalendarTiming(date, time, actual);
  const relevance = inferCalendarRelevance(country, content, weight);
  return {
    date,
    time,
    country,
    weight,
    content,
    previous: stringCell(row.Previous),
    forecast: stringCell(row.Predict),
    actual,
    source: "westock_calendar",
    timing,
    relevance,
    relevanceReason: calendarRelevanceReason(country, content, weight, relevance),
    decisionHint: calendarDecisionHint(timing, relevance)
  };
}

function inferCalendarTiming(date: string, time: string, actual?: string): NonNullable<PremarketCalendarEvent["timing"]> {
  if (actual && actual !== "--" && actual !== "-") return "released";
  const eventTime = Date.parse(`${date.slice(0, 10)}T${time || "00:00"}:00+08:00`);
  const now = Date.now();
  if (!Number.isFinite(eventTime)) return "upcoming";
  const diffMs = eventTime - now;
  if (diffMs < -3 * 60 * 60 * 1000) return "past";
  if (diffMs <= 12 * 60 * 60 * 1000) return "pending";
  return "upcoming";
}

function inferCalendarRelevance(country: string, content: string, weight: number): NonNullable<PremarketCalendarEvent["relevance"]> {
  const text = `${country} ${content}`;
  if (/钻井|活跃钻机|天然气钻井/.test(text)) return "low";
  if (/美联储|联邦基金|利率|CPI|PCE|非农|失业率|PMI|GDP|央行|美元|原油库存|EIA|API/.test(text)) return "high";
  if (/LPR|贷款市场报价/.test(text)) return weight >= 3 ? "high" : "medium";
  if (/制造业|就业|通胀|贸易|财政|债券|资本流|公债|拍卖|信心|房屋|零售|经常帐/.test(text)) return "medium";
  if (weight >= 3) return "medium";
  return "low";
}

function calendarRelevanceReason(country: string, content: string, weight: number, relevance: NonNullable<PremarketCalendarEvent["relevance"]>) {
  if (relevance === "high") return `${country}${content} 权重 ${weight}，可能影响外围风险偏好、汇率或 A 股开盘预期。`;
  if (relevance === "medium") return `${country}${content} 对宏观预期有间接影响，作为观察项，不单独改变交易状态。`;
  return `${country}${content} 与 A 股盘前交易决策关联较弱，仅保留留痕。`;
}

function calendarDecisionHint(timing: NonNullable<PremarketCalendarEvent["timing"]>, relevance: NonNullable<PremarketCalendarEvent["relevance"]>) {
  if (timing === "released" && relevance === "high") return "已公布高相关事件：重点观察外围指数、A50、汇率是否继续反应。";
  if (timing === "pending" && relevance === "high") return "待公布高相关事件：盘前不要提前放大仓位假设，等事件落地。";
  if (timing === "past") return "事件窗口已过，若市场没有持续反应，降低其盘中权重。";
  return "观察项：只做背景提醒，不直接生成买入信号。";
}

function isNearTermCalendarEvent(event: PremarketCalendarEvent) {
  const distance = calendarDayDistance(event.date);
  return distance >= 0 && distance <= 7;
}

function sortCalendarEventsForPremarket(left: PremarketCalendarEvent, right: PremarketCalendarEvent) {
  const leftDistance = calendarDayDistance(left.date);
  const rightDistance = calendarDayDistance(right.date);
  if (leftDistance !== rightDistance) return leftDistance - rightDistance;
  const relevanceDiff = calendarRelevanceRank(right.relevance) - calendarRelevanceRank(left.relevance);
  if (relevanceDiff !== 0) return relevanceDiff;
  const timingDiff = calendarTimingRank(right.timing) - calendarTimingRank(left.timing);
  if (timingDiff !== 0) return timingDiff;
  if (left.weight !== right.weight) return right.weight - left.weight;
  return left.time.localeCompare(right.time);
}

function calendarRelevanceRank(value?: PremarketCalendarEvent["relevance"]) {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

function calendarTimingRank(value?: PremarketCalendarEvent["timing"]) {
  if (value === "pending") return 4;
  if (value === "released") return 3;
  if (value === "upcoming") return 2;
  return 1;
}

function calendarDayDistance(dateText: string) {
  const today = localDateKey(new Date());
  const target = dateText.slice(0, 10);
  const todayTime = Date.parse(`${today}T00:00:00+08:00`);
  const targetTime = Date.parse(`${target}T00:00:00+08:00`);
  if (!Number.isFinite(todayTime) || !Number.isFinite(targetTime)) return 999;
  return Math.round((targetTime - todayTime) / 86_400_000);
}

function localDateKey(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(date);
}

function stringCell(value: ParsedCell | undefined) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "object" && !Array.isArray(value) && "invalid" in value) return undefined;
  return String(value);
}

function numberCell(value: ParsedCell | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export const calendarEventProvider = new CalendarEventProvider();
