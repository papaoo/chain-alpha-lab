import { effectiveTradeDateForSession, inferMarketSessionContext } from "@/lib/market/session";
import { calendarEventProvider, type CalendarSourceStatus } from "@/lib/premarket/calendarEventProvider";
import {
  evaluatePremarketActionability,
  evaluatePremarketDataQuality,
  evaluatePremarketTemperatureReliability
} from "@/lib/premarket/reliability";
import type {
  PremarketCalendarEvent,
  PremarketCatalystEvent,
  PremarketCatalystWatchConfig,
  PremarketMarketItem,
  PremarketRiskLevel,
  PremarketScoreBucket,
  PremarketSnapshot,
  PremarketSourceTrace
} from "@/lib/premarket/types";

const EASTMONEY_GLOBAL_URL = "https://push2.eastmoney.com/api/qt/clist/get";
const EASTMONEY_ULIST_URL = "https://push2.eastmoney.com/api/qt/ulist.np/get";
const EASTMONEY_FIELDS = "f12,f14,f2,f3,f4,f17,f15,f16,f18,f7,f124";
const EASTMONEY_A50_FUTURE_FIELDS = "f12,f14,f2,f3,f4,f17,f15,f16,f18,f124";
const EASTMONEY_GLOBAL_SOURCE_URL = "https://quote.eastmoney.com/center/gridlist.html";
const SEC_COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const SEC_COMPANY_SEARCH_URL = "https://www.sec.gov/edgar/browse/?CIK=";
const DEFAULT_CATALYST_WATCH_NOTE = "未配置盘前重大催化关键词；系统不会把传闻或示例事件纳入盘前风险温度。";
const GLOBAL_MARKET_STALE_MINUTES = 90;
const CALENDAR_STALE_MINUTES = 24 * 60;

const CORE_CODES = new Set([
  "NDX",
  "NDX100",
  "SPX",
  "DJIA",
  "N225",
  "KS11",
  "KOSPI200",
  "HSI",
  "HSCEI",
  "CN00Y",
  "XIN9",
  "TWII",
  "UDI",
  "SXXP",
  "GDAXI"
]);

const REQUIRED_MARKET_COVERAGE: Array<{ label: string; codes: string[]; warning: string }> = [
  {
    label: "A50期指",
    codes: ["CN00Y"],
    warning: "未取得 A50期指当月连续（CN00Y），港股/A50 维度只能降级参考。"
  },
  {
    label: "美股科技/权重",
    codes: ["NDX", "NDX100", "SPX"],
    warning: "未取得纳指/纳指100/标普500中的任一关键指数，美股科技风险温度只能降级参考。"
  },
  {
    label: "港股承压参照",
    codes: ["HSI", "HSCEI"],
    warning: "未取得恒生指数/国企指数，港股对 A 股开盘风险偏好的参考不足。"
  },
  {
    label: "美元指数",
    codes: ["UDI"],
    warning: "未取得美元指数，汇率/全球风险偏好维度只能降级参考。"
  }
];

const CODE_GROUPS: Record<string, PremarketMarketItem["group"]> = {
  NDX: "us",
  NDX100: "us",
  SPX: "us",
  DJIA: "us",
  N225: "asia",
  KS11: "asia",
  KOSPI200: "asia",
  TWII: "asia",
  HSI: "hk_cn",
  HSCEI: "hk_cn",
  CN00Y: "hk_cn",
  XIN9: "hk_cn",
  UDI: "fx",
  SXXP: "other",
  GDAXI: "other"
};

type RawEastmoneyGlobal = {
  f2?: number | string;
  f3?: number | string;
  f4?: number | string;
  f12?: string;
  f14?: string;
  f15?: number | string;
  f16?: number | string;
  f17?: number | string;
  f18?: number | string;
  f124?: number | string;
};

export async function buildPremarketSnapshot(): Promise<PremarketSnapshot> {
  const fetchedAt = new Date().toISOString();
  const session = inferMarketSessionContext(fetchedAt);
  const sessionTrace: PremarketSnapshot["session"] = {
    phase: session.phase,
    phaseLabel: session.phaseLabel,
    analysisMode: session.analysisMode,
    isTradingDay: session.isTradingDay,
    isTradingSession: session.isTradingSession,
    canUseRealtimeQuotes: session.canUseRealtimeQuotes,
    canUseAuctionQuotes: session.canUseAuctionQuotes,
    expectedDataBasis: session.expectedDataBasis,
    effectiveTradeDate: effectiveTradeDateForSession(fetchedAt, session),
    dataFreshnessHint: session.dataFreshnessHint,
    checkedAt: fetchedAt
  };
  const [marketResult, calendarResult, catalystResult] = await Promise.allSettled([fetchGlobalMarkets(), calendarEventProvider.fetchNearTermEvents(), fetchCatalystEvents()]);
  const markets = marketResult.status === "fulfilled" ? marketResult.value.markets : [];
  const marketWarnings = marketResult.status === "fulfilled" ? marketResult.value.warnings : [formatError(marketResult.reason)];
  const calendarEvents = calendarResult.status === "fulfilled" ? calendarResult.value.events : [];
  const calendarWarnings = calendarResult.status === "fulfilled" ? calendarResult.value.warnings : [formatError(calendarResult.reason)];
  const calendarSourceStatus: CalendarSourceStatus = calendarResult.status === "fulfilled" ? calendarResult.value.sourceStatus : "failed";
  const catalystEvents = catalystResult.status === "fulfilled" ? catalystResult.value.events : [];
  const catalystWatchConfig = catalystResult.status === "fulfilled" ? catalystResult.value.config : getCatalystWatchConfig();
  const catalystWarnings = catalystResult.status === "fulfilled" ? catalystResult.value.warnings : [formatError(catalystResult.reason)];
  const buckets = buildBuckets(markets, calendarEvents);
  const temperature = clamp(Math.round(buckets.reduce((sum, bucket) => sum + bucket.score, 0)), 0, 100);
  const riskLevel = classifyRiskLevel(temperature);
  const riskFlags = buildRiskFlags(markets, calendarEvents, buckets, catalystEvents);
  const sourceTraces = buildSourceTraces(fetchedAt, markets, calendarEvents, catalystEvents, marketWarnings, calendarWarnings, catalystWarnings, sessionTrace, calendarSourceStatus);
  const dataQuality = evaluatePremarketDataQuality(sourceTraces);
  const actionability = evaluatePremarketActionability(dataQuality, sourceTraces);
  const temperatureReliability = evaluatePremarketTemperatureReliability(buckets, sourceTraces, actionability);

  return {
    fetchedAt,
    dataBasis: "东方财富全球指数实时/延迟行情 + westock 宏观投资日历 + SEC 公司事实校验",
    session: sessionTrace,
    temperature,
    riskLevel,
    emotionLabel: riskLevelLabel(riskLevel),
    summary: buildSummary(temperature, riskLevel, riskFlags),
    markets,
    calendarEvents,
    calendarSummary: buildCalendarSummary(calendarEvents),
    catalystEvents,
    catalystWatchConfig,
    buckets,
    riskFlags,
    watchItems: buildWatchItems(markets, riskLevel),
    sourceTraces,
    dataQuality,
    actionability,
    temperatureReliability,
    warnings: buildPremarketWarnings(marketWarnings, calendarWarnings, catalystWarnings, catalystWatchConfig)
  };
}

function buildCalendarSummary(events: PremarketCalendarEvent[]) {
  return {
    total: events.length,
    today: events.filter((event) => calendarDayDistance(event.date) === 0).length,
    tomorrow: events.filter((event) => calendarDayDistance(event.date) === 1).length,
    pending: events.filter((event) => event.timing === "pending" || event.timing === "upcoming").length,
    released: events.filter((event) => event.timing === "released").length,
    highRelevance: events.filter((event) => event.relevance === "high").length,
    mediumRelevance: events.filter((event) => event.relevance === "medium").length,
    backgroundOnly: events.filter((event) => event.relevance === "low").length
  };
}

function buildPremarketWarnings(marketWarnings: string[], calendarWarnings: string[], catalystWarnings: string[], catalystWatchConfig: PremarketCatalystWatchConfig) {
  return [...marketWarnings, ...calendarWarnings, ...(catalystWatchConfig.enabled ? catalystWarnings : [])].filter(Boolean);
}

function buildSourceTraces(
  fetchedAt: string,
  markets: PremarketMarketItem[],
  calendarEvents: PremarketCalendarEvent[],
  catalystEvents: PremarketCatalystEvent[],
  marketWarnings: string[],
  calendarWarnings: string[],
  catalystWarnings: string[],
  sessionTrace: PremarketSnapshot["session"],
  calendarSourceStatus: CalendarSourceStatus = "ok"
): PremarketSourceTrace[] {
  const newestMarketUpdate = newestIso(markets.map((market) => market.updatedAt).filter(Boolean) as string[]);
  const globalMarketFreshness = newestMarketUpdate ? minutesBetween(newestMarketUpdate, fetchedAt) : undefined;
  const globalMarketStaleAfterMinutes = globalMarketStaleAfterMinutesForSession(sessionTrace.phase);
  const globalMarketStale = typeof globalMarketFreshness === "number" && globalMarketFreshness > globalMarketStaleAfterMinutes;
  const calendarTraceStatus: PremarketSourceTrace["status"] =
    calendarSourceStatus === "failed"
      ? "failed"
      : calendarSourceStatus === "partial" || calendarWarnings.length
        ? "partial"
        : "ok";

  return [
    {
      key: "a_share_session",
      label: "A股交易时段",
      status: "ok",
      usage: "score_input",
      usageLabel: "计入盘前约束",
      source: "本地交易日历 + 北京时间时段识别",
      fetchedAt,
      dataUpdatedAt: sessionTrace.checkedAt,
      freshnessMinutes: 0,
      staleAfterMinutes: 10,
      critical: true,
      impact: sessionTrace.isTradingDay
        ? `${sessionTrace.phaseLabel}，${sessionTrace.expectedDataBasis}，有效交易日 ${sessionTrace.effectiveTradeDate}。`
        : `今天 A 股闭市：只做研究计划，不输出盘中买卖判断；有效交易日 ${sessionTrace.effectiveTradeDate}。`,
      records: 1,
      warnings: []
    },
    {
      key: "eastmoney_global",
      label: "外围指数",
      status: markets.length ? (marketWarnings.length || globalMarketStale ? "partial" : "ok") : "failed",
      usage: "score_input",
      usageLabel: "计入温度",
      source: "东方财富全球指数",
      sourceUrl: EASTMONEY_GLOBAL_SOURCE_URL,
      fetchedAt,
      dataUpdatedAt: newestMarketUpdate,
      freshnessMinutes: globalMarketFreshness,
      staleAfterMinutes: globalMarketStaleAfterMinutes,
      critical: true,
      impact: "用于盘前外围温度、风险提示和开盘观察清单；不能替代 A 股开盘后的宽度/主线确认。",
      records: markets.length,
      warnings: [
        ...marketWarnings,
        ...(newestMarketUpdate && globalMarketStale ? [`外围指数最新时间 ${formatCnDateTime(newestMarketUpdate)}，已超过 ${globalMarketStaleAfterMinutes} 分钟，需降级参考。`] : [])
      ]
    },
    {
      key: "westock_calendar",
      label: "宏观日历",
      status: calendarTraceStatus,
      usage: "score_input",
      usageLabel: "计入事件权重",
      source: "westock-data calendar",
      command: "calendar <date> --country 1/2 --indicator 1 --limit 20",
      fetchedAt,
      dataUpdatedAt: fetchedAt,
      freshnessMinutes: 0,
      staleAfterMinutes: CALENDAR_STALE_MINUTES,
      critical: true,
      impact: "用于识别今日/近期中美和宏观事件风险；没有实际值时只作为事件提醒。",
      records: calendarEvents.length,
      warnings: calendarWarnings
    },
    {
      key: "sec_company_filings",
      label: "重大催化",
      status: catalystEvents.length ? (catalystWarnings.length ? "partial" : "ok") : "unavailable",
      usage: catalystEvents.length ? "watch_only" : "excluded",
      usageLabel: catalystEvents.length ? "只做观察线索" : "未配置，排除",
      source: "SEC company ticker index",
      sourceUrl: SEC_COMPANY_TICKERS_URL,
      fetchedAt,
      dataUpdatedAt: fetchedAt,
      freshnessMinutes: 0,
      staleAfterMinutes: CALENDAR_STALE_MINUTES,
      critical: false,
      impact: "只做已配置关键词的公司事实校验，不作为默认新闻流。",
      records: catalystEvents.length,
      warnings: catalystWarnings
    },
    {
      key: "official_news",
      label: "新闻情绪",
      status: "unavailable",
      usage: "excluded",
      usageLabel: "未接入，排除",
      source: "待接入授权新闻源",
      fetchedAt,
      critical: false,
      impact: "新闻情绪未接入授权源前不参与温度扣分，避免用传闻污染规则。",
      records: 0,
      warnings: ["未配置授权新闻源：新闻情绪不参与温度计扣分，也不会被当作交易证据。"]
    }
  ];
}

async function fetchGlobalMarkets() {
  const params = new URLSearchParams({
    pn: "1",
    pz: "300",
    po: "1",
    np: "1",
    ut: "bd1d9ddb04089700cf9c27f6f7426281",
    fltt: "2",
    invt: "2",
    fid: "f3",
    fs: "m:100",
    fields: EASTMONEY_FIELDS
  });
  const sourceUrl = `${EASTMONEY_GLOBAL_URL}?${params.toString()}`;
  const response = await fetch(sourceUrl, {
    cache: "no-store",
    headers: {
      "user-agent": "Mozilla/5.0 ASharePremarketScout/0.1",
      referer: EASTMONEY_GLOBAL_SOURCE_URL
    }
  });
  if (!response.ok) throw new Error(`东方财富全球指数 HTTP ${response.status}`);
  const json = (await response.json()) as { data?: { diff?: RawEastmoneyGlobal[] } };
  const rows = json.data?.diff ?? [];
  const globalMarkets = rows
    .filter((row) => row.f12 && CORE_CODES.has(row.f12))
    .map(toMarketItem);
  const future = await fetchA50FutureMarket().catch(() => null);
  const markets = mergeMarkets(future ? [future, ...globalMarkets] : globalMarkets)
    .sort((a, b) => groupOrder(a.group) - groupOrder(b.group) || (a.changePct ?? 0) - (b.changePct ?? 0));

  return {
    markets,
    warnings: markets.length ? buildMarketCoverageWarnings(markets) : ["东方财富全球指数未返回核心外围市场数据。"]
  };
}

function buildMarketCoverageWarnings(markets: PremarketMarketItem[]) {
  const codes = new Set(markets.map((market) => market.code));
  return REQUIRED_MARKET_COVERAGE
    .filter((coverage) => !coverage.codes.some((code) => codes.has(code)))
    .map((coverage) => coverage.warning);
}

async function fetchA50FutureMarket(): Promise<PremarketMarketItem | null> {
  const params = new URLSearchParams({
    fltt: "2",
    invt: "2",
    fields: EASTMONEY_A50_FUTURE_FIELDS,
    secids: "104.CN00Y"
  });
  const sourceUrl = `${EASTMONEY_ULIST_URL}?${params.toString()}`;
  const response = await fetch(sourceUrl, {
    cache: "no-store",
    headers: {
      "user-agent": "Mozilla/5.0 ASharePremarketScout/0.1",
      referer: EASTMONEY_GLOBAL_SOURCE_URL
    }
  });
  if (!response.ok) throw new Error(`东方财富A50期指 HTTP ${response.status}`);
  const json = (await response.json()) as { data?: { diff?: RawEastmoneyGlobal[] } };
  const row = json.data?.diff?.find((item) => item.f12 === "CN00Y");
  return row ? toMarketItem(row) : null;
}

function toMarketItem(row: RawEastmoneyGlobal): PremarketMarketItem {
  const code = String(row.f12);
  const updatedAt = eastmoneyTimestampToIso(row.f124);
  return {
    code,
    name: String(row.f14 ?? row.f12),
    latest: toNumberOrNull(row.f2),
    changePct: toNumberOrNull(row.f3),
    change: toNumberOrNull(row.f4),
    open: toNumberOrNull(row.f17),
    high: toNumberOrNull(row.f15),
    low: toNumberOrNull(row.f16),
    prevClose: toNumberOrNull(row.f18),
    source: "eastmoney_global",
    sourceUrl: EASTMONEY_GLOBAL_SOURCE_URL,
    updatedAt,
    dataType: marketDataType(code),
    group: CODE_GROUPS[code] ?? "other"
  };
}

function mergeMarkets(markets: PremarketMarketItem[]) {
  const byCode = new Map<string, PremarketMarketItem>();
  for (const market of markets) {
    if (!byCode.has(market.code)) byCode.set(market.code, market);
  }
  return Array.from(byCode.values());
}

async function fetchCatalystEvents(): Promise<{ events: PremarketCatalystEvent[]; warnings: string[]; config: PremarketCatalystWatchConfig }> {
  const config = getCatalystWatchConfig();
  const warnings: string[] = [];
  if (!config.enabled || !config.keywords.length) {
    warnings.push(config.note);
    return { events: [], warnings, config };
  }
  const events: PremarketCatalystEvent[] = [];
  for (const keyword of config.keywords.slice(0, 8)) {
    const company = await lookupSecCompany(keyword).catch((error) => {
      warnings.push(`SEC 公司索引查询失败：${keyword} / ${formatError(error)}`);
      return null;
    });
    if (!company) {
      warnings.push(`未在 SEC 公司 ticker 索引中确认“${keyword}”对应公开上市公司；不纳入可交易事件。`);
      continue;
    }
    events.push({
      id: `sec-${company.cik_str}`,
      date: new Date().toISOString().slice(0, 10),
      title: `${company.title} 已出现在 SEC 公司索引，需人工核对是否存在 IPO、监管或公告催化`,
      source: "sec_company_filings",
      sourceUrl: `${SEC_COMPANY_SEARCH_URL}${String(company.cik_str).padStart(10, "0")}`,
      entity: company.title,
      market: "US",
      weight: 2,
      category: "OTHER",
      relevance: "该事件只作为外围情绪和产业链观察线索，不能替代 A 股盘口、主线和个股证据。",
      status: "watch"
    });
  }
  return { events, warnings, config };
}

function getCatalystWatchConfig(): PremarketCatalystWatchConfig {
  const rawKeywords = process.env.PREMARKET_CATALYST_KEYWORDS ?? "";
  const keywords = rawKeywords
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    enabled: keywords.length > 0,
    keywords,
    note: keywords.length ? `已配置 ${keywords.length} 个盘前重大催化关键词。` : DEFAULT_CATALYST_WATCH_NOTE
  };
}

async function lookupSecCompany(keyword: string): Promise<{ cik_str: number; ticker: string; title: string } | null> {
  const response = await fetch(SEC_COMPANY_TICKERS_URL, {
    cache: "no-store",
    headers: {
      "user-agent": "ASharePremarketScout/0.1 contact@example.com",
      accept: "application/json"
    }
  });
  if (!response.ok) throw new Error(`SEC company tickers HTTP ${response.status}`);
  const json = (await response.json()) as Record<string, { cik_str: number; ticker: string; title: string }>;
  const needle = keyword.toLowerCase();
  return Object.values(json).find((item) => item.title.toLowerCase().includes(needle) || item.ticker.toLowerCase() === needle) ?? null;
}

function buildBuckets(markets: PremarketMarketItem[], events: PremarketCalendarEvent[]): PremarketScoreBucket[] {
  return [
    scoreBucket("usTech", "美股科技", 25, markets.filter((item) => item.group === "us")),
    scoreBucket("asia", "亚太市场", 20, markets.filter((item) => item.group === "asia")),
    scoreBucket("hkA50", "港股/A50期指", 15, markets.filter((item) => item.group === "hk_cn")),
    scoreBucket("fx", "美元与汇率", 10, markets.filter((item) => item.group === "fx"), true),
    scoreCalendar(events)
  ];
}

function scoreBucket(key: string, label: string, maxScore: number, items: PremarketMarketItem[], inverse = false): PremarketScoreBucket {
  if (!items.length) {
    return { key, label, score: Math.round(maxScore * 0.45), maxScore, state: "missing", note: "核心数据缺失，按保守分处理。", evidence: [] };
  }
  const changes = items.map((item) => item.changePct).filter((value): value is number => typeof value === "number");
  if (!changes.length) {
    return { key, label, score: Math.round(maxScore * 0.45), maxScore, state: "missing", note: "涨跌幅缺失，按保守分处理。", evidence: items.map(formatMarketEvidence) };
  }
  const avg = changes.reduce((sum, value) => sum + value, 0) / changes.length;
  const worst = Math.min(...changes);
  const pressure = inverse ? avg : -avg;
  let deduction = 0;
  if (pressure >= 4 || worst <= -4) deduction = maxScore * 0.75;
  else if (pressure >= 2 || worst <= -2) deduction = maxScore * 0.52;
  else if (pressure >= 1 || worst <= -1) deduction = maxScore * 0.32;
  else if (pressure >= 0.3 || worst <= -0.5) deduction = maxScore * 0.16;
  const score = clamp(Math.round(maxScore - deduction), 0, maxScore);
  const state = score <= maxScore * 0.35 ? "risk" : score <= maxScore * 0.65 ? "watch" : score < maxScore * 0.85 ? "neutral" : "good";
  return {
    key,
    label,
    score,
    maxScore,
    state,
    note: `平均涨跌幅 ${avg.toFixed(2)}%，最弱 ${worst.toFixed(2)}%。`,
    evidence: items.map(formatMarketEvidence)
  };
}

function scoreCalendar(events: PremarketCalendarEvent[]): PremarketScoreBucket {
  const scoredEvents = events.filter((event) => event.relevance !== "low");
  const high = scoredEvents.filter((event) => event.relevance === "high");
  const todayEvents = scoredEvents.filter((event) => calendarDayDistance(event.date) === 0);
  const tomorrowEvents = scoredEvents.filter((event) => calendarDayDistance(event.date) === 1);
  const maxScore = 20;
  if (!events.length) {
    return { key: "calendar", label: "事件日历", score: 13, maxScore, state: "missing", note: "未获取到高权重财经事件，保持中性偏保守。", evidence: [] };
  }
  const todayPressure = todayEvents.reduce((sum, event) => sum + calendarEventPressure(event), 0);
  const tomorrowPressure = tomorrowEvents.reduce((sum, event) => sum + calendarEventPressure(event) * 0.6, 0);
  const laterPressure = scoredEvents
    .filter((event) => {
      const distance = calendarDayDistance(event.date);
      return distance > 1;
    })
    .reduce((sum, event) => sum + calendarEventPressure(event) * 0.25, 0);
  const deduction = Math.min(12, todayPressure * 1.5 + tomorrowPressure + laterPressure);
  const score = Math.round(maxScore - deduction);
  return {
    key: "calendar",
    label: "事件日历",
    score,
    maxScore,
    state: todayEvents.some((event) => event.relevance === "high") || todayEvents.length >= 4 ? "risk" : tomorrowEvents.some((event) => event.relevance === "high") || high.length >= 2 ? "watch" : "neutral",
    note: `近7日事件 ${events.length} 条，计入温度 ${scoredEvents.length} 条，今日 ${todayEvents.length} 条，明日 ${tomorrowEvents.length} 条，高相关 ${high.length} 条。`,
    evidence: [...scoredEvents, ...events.filter((event) => event.relevance === "low")]
      .slice(0, 6)
      .map((event) => `${event.date} ${event.time} ${event.country}：${event.content}，${formatCalendarRelevanceForText(event.relevance)}`)
  };
}

function buildRiskFlags(markets: PremarketMarketItem[], events: PremarketCalendarEvent[], buckets: PremarketScoreBucket[], catalystEvents: PremarketCatalystEvent[]) {
  const flags: string[] = [];
  for (const item of markets) {
    if ((item.changePct ?? 0) <= -4) flags.push(`${item.name} 跌幅超过 4%，外围风险显著升温。`);
    else if ((item.changePct ?? 0) <= -2) flags.push(`${item.name} 跌幅超过 2%，开盘需防风险偏好下行。`);
  }
  const highEvents = events.filter((event) => event.relevance === "high" && calendarDayDistance(event.date) <= 1);
  if (highEvents.length) flags.push(`今日/明日有 ${highEvents.length} 条高相关宏观事件，盘前不宜忽略事件冲击。`);
  const confirmedCatalysts = catalystEvents.filter((event) => event.status === "confirmed" && event.weight >= 3);
  if (confirmedCatalysts.length) flags.push(`今日/近期有 ${confirmedCatalysts.length} 条高权重公司/产业催化，需要单独核对相关主线。`);
  const weakBuckets = buckets.filter((bucket) => bucket.state === "risk");
  if (weakBuckets.length >= 2) flags.push(`多个外围维度同时偏弱：${weakBuckets.map((bucket) => bucket.label).join("、")}。`);
  if (!flags.length) flags.push("外围市场未触发明显系统性压力，仍需等待 A 股开盘宽度和主线承接确认。");
  return Array.from(new Set(flags));
}

function buildWatchItems(markets: PremarketMarketItem[], riskLevel: PremarketRiskLevel) {
  const items = [
    "开盘前优先核对 A50期指、恒生科技和人民币汇率是否继续恶化；富时A50指数只作收盘/指数本体对照。",
    "开盘 15-30 分钟观察全 A 宽度、中位涨跌幅和科技链核心股承接。",
    "若外围 Risk-off 但 A 股核心主线逆势，应标记为弱市穿越观察，不直接追高。"
  ];
  const usTech = markets.filter((item) => item.group === "us" && (item.changePct ?? 0) <= -2);
  if (usTech.length) items.unshift(`美股科技承压：重点看 A 股 AI、半导体、PCB、光模块是否低开后修复。`);
  if (riskLevel === "risk_off" || riskLevel === "risk") items.push("风险温度偏低时，策略选股只输出观察/待确认，不输出盘前立即买入。");
  return items;
}

function buildSummary(temperature: number, riskLevel: PremarketRiskLevel, riskFlags: string[]) {
  return `外围温度 ${temperature}/100，状态为${riskLevelLabel(riskLevel)}。${riskFlags[0] ?? "暂无核心风险提示"}`;
}

function riskLevelLabel(level: PremarketRiskLevel) {
  if (level === "friendly") return "外围友好";
  if (level === "neutral") return "中性偏稳";
  if (level === "watch") return "分歧观察";
  if (level === "risk") return "风险偏高";
  return "明显 Risk-off";
}

function classifyRiskLevel(score: number): PremarketRiskLevel {
  if (score >= 80) return "friendly";
  if (score >= 60) return "neutral";
  if (score >= 40) return "watch";
  if (score >= 20) return "risk";
  return "risk_off";
}

function calendarEventPressure(event: PremarketCalendarEvent) {
  const base = Math.max(1, Math.min(3, event.weight));
  if (event.relevance === "high") return base;
  if (event.relevance === "medium") return base * 0.45;
  return 0;
}

function formatCalendarRelevanceForText(value?: PremarketCalendarEvent["relevance"]) {
  if (value === "high") return "高相关";
  if (value === "medium") return "中相关";
  return "背景项";
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

function eastmoneyTimestampToIso(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(number) || number <= 0) return undefined;
  const milliseconds = number > 9_999_999_999 ? number : number * 1000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function newestIso(values: string[]) {
  return values.filter(Boolean).sort().at(-1);
}

function minutesBetween(leftIso: string, rightIso: string) {
  const left = Date.parse(leftIso);
  const right = Date.parse(rightIso);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return undefined;
  return Math.max(0, Math.round((right - left) / 60_000));
}

function globalMarketStaleAfterMinutesForSession(phase: string) {
  if (phase === "premarket" || phase === "call_auction") return GLOBAL_MARKET_STALE_MINUTES;
  if (phase === "morning" || phase === "afternoon" || phase === "closing_auction") return 180;
  if (phase === "non_trading_day") return 72 * 60;
  return 12 * 60;
}

export function __testPremarketReliability(input: {
  fetchedAt: string;
  markets: PremarketMarketItem[];
  calendarEvents: PremarketCalendarEvent[];
  buckets: PremarketScoreBucket[];
  sessionTrace: PremarketSnapshot["session"];
  marketWarnings?: string[];
  calendarWarnings?: string[];
  catalystWarnings?: string[];
  calendarSourceStatus?: CalendarSourceStatus;
}) {
  const sourceTraces = buildSourceTraces(
    input.fetchedAt,
    input.markets,
    input.calendarEvents,
    [],
    input.marketWarnings ?? [],
    input.calendarWarnings ?? [],
    input.catalystWarnings ?? [],
    input.sessionTrace,
    input.calendarSourceStatus ?? "ok"
  );
  const dataQuality = evaluatePremarketDataQuality(sourceTraces);
  const actionability = evaluatePremarketActionability(dataQuality, sourceTraces);
  const temperatureReliability = evaluatePremarketTemperatureReliability(input.buckets, sourceTraces, actionability);
  return { sourceTraces, dataQuality, actionability, temperatureReliability };
}

function formatCnDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

function toNumberOrNull(value: unknown) {
  if (value === "-" || value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function marketDataType(code: string): PremarketMarketItem["dataType"] {
  if (code === "CN00Y") return "futures";
  if (code === "UDI") return "fx";
  return "index";
}

function formatMarketEvidence(item: PremarketMarketItem) {
  return `${item.name} ${formatPct(item.changePct)}`;
}

function formatPct(value: number | null) {
  return value === null ? "涨跌幅缺失" : `${value.toFixed(2)}%`;
}

function groupOrder(group: PremarketMarketItem["group"]) {
  return { us: 1, asia: 2, hk_cn: 3, fx: 4, other: 5 }[group];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
