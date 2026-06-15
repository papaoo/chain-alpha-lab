import type { MarketSessionContext } from "@/lib/types";
import { readTradingCalendar } from "./tradingCalendar";

const MINUTE = 60 * 1000;
const CN_TIME_ZONE = "Asia/Shanghai";

export interface TradingCalendar {
  isTradingDay(date: string): boolean;
  previousTradingDay(date: string): string;
}

export const defaultTradingCalendar: TradingCalendar = {
  isTradingDay(date: string) {
    const parsed = parseCnDate(date);
    if (!parsed) return false;
    const weekday = parsed.getUTCDay();
    const closedDates = new Set(readTradingCalendar().closedDates);
    return weekday >= 1 && weekday <= 5 && !closedDates.has(date);
  },
  previousTradingDay(date: string) {
    const parsed = parseCnDate(date);
    if (!parsed) return date;
    let cursor = new Date(parsed.getTime());
    do {
      cursor = new Date(cursor.getTime() - 24 * 60 * MINUTE);
    } while (!defaultTradingCalendar.isTradingDay(formatCnDate(cursor)));
    return formatCnDate(cursor);
  }
};

export function inferMarketSessionContext(timestamp = new Date().toISOString(), calendar: TradingCalendar = defaultTradingCalendar): MarketSessionContext {
  const cn = toChinaDateParts(timestamp);
  const minuteOfDay = cn.hour * 60 + cn.minute;
  const today = formatCnDate(toChinaDate(timestamp));
  const isTradingDay = calendar.isTradingDay(today);

  if (!isTradingDay) {
    return buildContext("non_trading_day", false, false, false);
  }
  if (minuteOfDay < 7 * 60) return buildContext("night_research", true, false, false);
  if (minuteOfDay < 9 * 60 + 15) return buildContext("premarket", true, false, false);
  if (minuteOfDay < 9 * 60 + 30) return buildContext("call_auction", true, true, true);
  if (minuteOfDay < 11 * 60 + 30) return buildContext("morning", true, true, true);
  if (minuteOfDay < 13 * 60) return buildContext("midday_break", true, false, false);
  if (minuteOfDay < 14 * 60 + 30) return buildContext("afternoon", true, true, true);
  if (minuteOfDay < 15 * 60) return buildContext("closing_auction", true, true, true);
  if (minuteOfDay < 21 * 60) return buildContext("postmarket", true, false, false);
  return buildContext("night_research", true, false, false);
}

export function effectiveTradeDateForSession(timestamp: string, session: MarketSessionContext, calendar: TradingCalendar = defaultTradingCalendar) {
  const today = formatCnDate(toChinaDate(timestamp));
  const cn = toChinaDateParts(timestamp);
  const minuteOfDay = cn.hour * 60 + cn.minute;

  if (session.phase === "premarket" || session.phase === "non_trading_day" || session.phase === "call_auction") {
    return calendar.previousTradingDay(today);
  }
  if (session.phase === "night_research") {
    return session.isTradingDay && minuteOfDay >= 21 * 60 ? today : calendar.previousTradingDay(today);
  }
  return today;
}

function buildContext(
  phase: MarketSessionContext["phase"],
  isTradingDay: boolean,
  isTradingSession: boolean,
  isIntraday: boolean
): MarketSessionContext {
  const config: Record<MarketSessionContext["phase"], Omit<MarketSessionContext, "phase" | "isTradingDay" | "isTradingSession" | "isIntraday" | "canUseRealtimeQuotes" | "canUseAuctionQuotes">> = {
    premarket: {
      phaseLabel: "盘前计划",
      analysisMode: "计划",
      expectedDataBasis: "上一交易日收盘",
      dataFreshnessHint: "盘前没有可靠盘中确认，今日盘口、资金和涨跌停只能在开盘后再验证。",
      ruleFocus: ["沿用上一交易日收盘结构", "生成今日观察清单", "不把盘前计划写成盘中确认"],
      llmFocus: ["输出今日验证条件", "列出主线向上/向下触发", "避免明确盘中买入结论"],
      outputRestrictions: ["不得声称已验证今日盘口", "不得因盘前数据给出盘中确认", "仓位必须服从规则引擎"]
    },
    call_auction: {
      phaseLabel: "集合竞价",
      analysisMode: "竞价观察",
      expectedDataBasis: "竞价数据",
      dataFreshnessHint: "竞价阶段波动大，只能作为弱确认，不能替代开盘后承接。",
      ruleFocus: ["识别竞价强弱", "标记竞价参考", "等待开盘承接确认"],
      llmFocus: ["说明竞价只是预演", "输出开盘后验证条件"],
      outputRestrictions: ["不得把竞价异动写成全天主线确认", "不得突破候选股仓位上限"]
    },
    morning: {
      phaseLabel: "早盘盯盘",
      analysisMode: "盘中盯盘",
      expectedDataBasis: "盘中实时/延迟行情",
      dataFreshnessHint: "早盘适合发现主线，但信号仍需午后和尾盘验证。",
      ruleFocus: ["大盘总闸", "主线启动/确认", "核心股承接", "不追高"],
      llmFocus: ["解释早盘结构", "给出午前/午后观察点", "区分启动和确认"],
      outputRestrictions: ["不得把早盘单点强势写成收盘确认", "观察清单优先于重仓结论"]
    },
    midday_break: {
      phaseLabel: "午间复盘",
      analysisMode: "半日复盘",
      expectedDataBasis: "上午收盘快照",
      dataFreshnessHint: "午间应复盘上午验证情况，并给出下午翻转/失效条件。",
      ruleFocus: ["上午强弱验证", "下午状态翻转条件", "主线延续或分歧预案"],
      llmFocus: ["总结上午被验证/被证伪的条件", "列出下午重点盯盘任务"],
      outputRestrictions: ["不得声称下午盘口已经发生", "不得把半日结论写成收盘定论"]
    },
    afternoon: {
      phaseLabel: "午后确认",
      analysisMode: "盘中盯盘",
      expectedDataBasis: "盘中实时/延迟行情",
      dataFreshnessHint: "午后重点看早盘主线是否延续、资金是否回流、核心股是否修复。",
      ruleFocus: ["主线延续", "核心股修复", "资金回流", "分歧是否扩大"],
      llmFocus: ["判断早盘线索是否延续", "输出尾盘确认条件"],
      outputRestrictions: ["不得忽略尾盘确认", "不得对后排追涨放宽约束"]
    },
    closing_auction: {
      phaseLabel: "尾盘确认",
      analysisMode: "尾盘决策",
      expectedDataBasis: "尾盘实时/延迟行情",
      dataFreshnessHint: "尾盘更重视收盘位置、资金回流和次日可验证条件。",
      ruleFocus: ["收盘确认", "是否带到次日", "不追尾盘脉冲", "失效条件"],
      llmFocus: ["输出收盘前确认/放弃条件", "强调隔日风险"],
      outputRestrictions: ["不得追尾盘无承接脉冲", "不得把尾盘拉升直接写成低风险机会"]
    },
    postmarket: {
      phaseLabel: "收盘复盘",
      analysisMode: "收盘复盘",
      expectedDataBasis: "当日收盘数据",
      dataFreshnessHint: "收盘后应写入正式复盘和记忆，盘中盯盘任务转为次日验证条件。",
      ruleFocus: ["收盘状态", "主线阶段迁移", "记忆写入", "次日验证条件"],
      llmFocus: ["复盘今日判断是否被验证", "输出明日开盘前三个验证点"],
      outputRestrictions: ["不得输出盘中实时盯盘措辞", "不得把收盘复盘写成正在发生的盘口"]
    },
    night_research: {
      phaseLabel: "夜间研究",
      analysisMode: "深度研究",
      expectedDataBasis: "历史数据",
      dataFreshnessHint: "夜间不做实时盘口判断，适合公司认知、候选池维护和策略复盘。",
      ruleFocus: ["历史复盘", "公司认知", "候选池维护", "策略问题归因"],
      llmFocus: ["输出研究清单和次日计划", "避免实时盘口措辞"],
      outputRestrictions: ["不得声称正在盯盘", "不得用夜间数据判断盘中资金"]
    },
    non_trading_day: {
      phaseLabel: "非交易日研究",
      analysisMode: "深度研究",
      expectedDataBasis: "历史数据",
      dataFreshnessHint: "非交易日只能做历史复盘、策略研究和候选池维护。",
      ruleFocus: ["历史复盘", "策略研究", "公司认知补全"],
      llmFocus: ["输出下个交易日计划", "提示非交易日无实时行情"],
      outputRestrictions: ["不得输出今日盘中建议", "不得声称市场正在交易"]
    }
  };
  return {
    phase,
    ...config[phase],
    isTradingDay,
    isTradingSession,
    isIntraday,
    canUseRealtimeQuotes: isTradingSession && phase !== "call_auction",
    canUseAuctionQuotes: phase === "call_auction"
  };
}

function toChinaDateParts(timestamp: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: CN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short"
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
  const weekdays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: weekdays[parts.weekday ?? "Sun"] ?? 0
  };
}

function toChinaDate(timestamp: string) {
  const parts = toChinaDateParts(timestamp);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function formatCnDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function parseCnDate(date: string) {
  if (!/^\d{8}$/.test(date)) return null;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(4, 6));
  const day = Number(date.slice(6, 8));
  return new Date(Date.UTC(year, month - 1, day));
}
