import { NextResponse } from "next/server";
import { effectiveTradeDateForSession, inferMarketSessionContext } from "@/lib/market/session";

export const dynamic = "force-dynamic";

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

type SessionPhase =
  | "premarket"
  | "call_auction"
  | "morning"
  | "midday_break"
  | "afternoon"
  | "closing_auction"
  | "postmarket"
  | "night_research"
  | "non_trading_day";

const PHASE_COPY: Record<SessionPhase, {
  phaseLabel: string;
  headline: string;
  subline: string;
  expectedDataBasis: string;
  mode: "trade" | "watch" | "review" | "research";
  tasks: string[];
  restrictions: string[];
}> = {
  premarket: {
    phaseLabel: "盘前计划",
    headline: "盘前只做计划，不把昨日结构当成今日确认。",
    subline: "适合看外盘、事件日历、昨日主线延续条件和开盘验证清单。",
    expectedDataBasis: "上一交易日收盘",
    mode: "watch",
    tasks: ["检查隔夜外盘与汇率", "确认昨日主线的向上/向下条件", "准备开盘后观察清单"],
    restrictions: ["不输出盘中已验证结论", "不因盘前信息突破仓位约束"]
  },
  call_auction: {
    phaseLabel: "集合竞价",
    headline: "竞价只看预演，开盘承接才是关键。",
    subline: "适合识别竞价强弱、排除明显失真信号，等待 9:30 后承接验证。",
    expectedDataBasis: "竞价数据",
    mode: "watch",
    tasks: ["观察竞价高开是否有量", "标记一字/大幅高开不可追", "等待开盘 15 分钟承接"],
    restrictions: ["竞价异动只作为弱参考", "不把竞价写成全天主线确认"]
  },
  morning: {
    phaseLabel: "早盘盯盘",
    headline: "早盘发现主线，午后和尾盘确认持续性。",
    subline: "适合看全 A 宽度、涨跌停结构、核心股承接和主线扩散。",
    expectedDataBasis: "盘中实时/延迟行情",
    mode: "trade",
    tasks: ["看大盘总闸是否打开", "看核心股是否带动中军和后排", "识别高位不追和资金流出"],
    restrictions: ["不把单点强势写成收盘确认", "防守状态不做新开仓计划"]
  },
  midday_break: {
    phaseLabel: "午间复盘",
    headline: "午间复盘上午验证，下午只等条件触发。",
    subline: "适合总结上午哪些判断被验证，哪些主线下午可能转强或失效。",
    expectedDataBasis: "上午收盘快照",
    mode: "review",
    tasks: ["复盘上午宽度和情绪", "列出下午状态翻转条件", "检查核心股是否有分歧扩大"],
    restrictions: ["不声称下午盘口已经发生", "不把半日结论当成收盘定论"]
  },
  afternoon: {
    phaseLabel: "午后确认",
    headline: "午后看延续，不追后排脉冲。",
    subline: "适合确认早盘主线是否延续、资金是否回流、核心股是否修复。",
    expectedDataBasis: "盘中实时/延迟行情",
    mode: "trade",
    tasks: ["验证早盘主线是否扩散", "看资金回流质量", "准备尾盘确认条件"],
    restrictions: ["不忽略尾盘确认", "不放宽后排追涨约束"]
  },
  closing_auction: {
    phaseLabel: "尾盘确认",
    headline: "尾盘看收盘位置和隔日风险，不追冲高。",
    subline: "适合判断是否具备带到次日的结构，重点看资金回流和核心股收盘。",
    expectedDataBasis: "尾盘实时/延迟行情",
    mode: "trade",
    tasks: ["确认核心股收盘位置", "评估次日高开兑现风险", "记录失效条件"],
    restrictions: ["不追尾盘无承接脉冲", "不把尾盘拉升写成低风险机会"]
  },
  postmarket: {
    phaseLabel: "收盘复盘",
    headline: "收盘后做正式复盘，写入记忆系统。",
    subline: "适合复盘今日规则是否被验证、主线阶段是否迁移、明日验证点是什么。",
    expectedDataBasis: "当日收盘数据",
    mode: "review",
    tasks: ["复盘大盘状态连续性", "更新主线阶段迁移", "沉淀明日三条验证条件"],
    restrictions: ["不输出正在发生的盘中措辞", "不把复盘写成实时盯盘"]
  },
  night_research: {
    phaseLabel: "夜间研究",
    headline: "夜间不盯盘，只做研究和计划。",
    subline: "适合补公司认知、候选池维护、策略问题归因和次日计划。",
    expectedDataBasis: "历史数据",
    mode: "research",
    tasks: ["补公司主营和产业链证据", "复盘策略偏差", "准备次日观察清单"],
    restrictions: ["不声称正在盯盘", "不使用夜间数据判断盘中资金"]
  },
  non_trading_day: {
    phaseLabel: "非交易日研究",
    headline: "今天 A 股闭市，不做盘中买卖判断。",
    subline: "适合做历史复盘、策略校准、公司认知补全和下个交易日计划。",
    expectedDataBasis: "历史数据",
    mode: "research",
    tasks: ["复盘最近报告是否被验证", "维护候选池和剔除名单", "补齐公司认知与主线归属证据", "准备下个交易日观察清单"],
    restrictions: ["不输出今日盘中建议", "不声称市场正在交易", "不因外部热力图产生买卖结论"]
  }
};

export async function GET() {
  const now = new Date();
  const timestamp = now.toISOString();
  const session = inferMarketSessionContext(timestamp);
  const phase = session.phase as SessionPhase;
  const cnParts = getChinaDateParts(now);
  const tradeDate = effectiveTradeDateForSession(timestamp, session);
  const copy = PHASE_COPY[phase] ?? PHASE_COPY.non_trading_day;

  return NextResponse.json({
    success: true,
    data: {
      timestamp,
      date: `${cnParts.year}-${String(cnParts.month).padStart(2, "0")}-${String(cnParts.day).padStart(2, "0")}`,
      weekday: WEEKDAY_LABELS[cnParts.weekday],
      isTradingDay: session.isTradingDay,
      isTradingSession: session.isTradingSession,
      phase,
      phaseLabel: copy.phaseLabel,
      headline: copy.headline,
      subline: copy.subline,
      expectedDataBasis: copy.expectedDataBasis,
      effectiveTradeDate: tradeDate,
      mode: copy.mode,
      tasks: copy.tasks,
      restrictions: copy.restrictions,
      canUseRealtimeQuotes: session.canUseRealtimeQuotes,
      canUseAuctionQuotes: session.canUseAuctionQuotes
    },
    error: null
  });
}

function getChinaDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: weekdays[parts.weekday ?? "Sun"] ?? 0
  };
}
