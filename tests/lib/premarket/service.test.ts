import { describe, expect, it } from "vitest";
import { __testPremarketReliability } from "@/lib/premarket/service";
import type { PremarketCalendarEvent, PremarketMarketItem, PremarketScoreBucket, PremarketSnapshot } from "@/lib/premarket/types";

function sessionTrace(overrides: Partial<PremarketSnapshot["session"]> = {}): PremarketSnapshot["session"] {
  return {
    phase: "premarket",
    phaseLabel: "盘前计划",
    analysisMode: "计划",
    isTradingDay: true,
    isTradingSession: false,
    canUseRealtimeQuotes: false,
    canUseAuctionQuotes: false,
    expectedDataBasis: "上一交易日收盘",
    effectiveTradeDate: "20260618",
    dataFreshnessHint: "盘前只做计划。",
    checkedAt: "2026-06-19T00:00:00.000Z",
    ...overrides
  };
}

function market(overrides: Partial<PremarketMarketItem> = {}): PremarketMarketItem {
  return {
    code: "CN00Y",
    name: "富时中国A50期指",
    latest: 12000,
    changePct: -0.2,
    change: -24,
    open: 12020,
    high: 12080,
    low: 11960,
    prevClose: 12024,
    source: "eastmoney_global",
    sourceUrl: "https://quote.eastmoney.com/center/gridlist.html",
    updatedAt: "2026-06-18T23:30:00.000Z",
    dataType: "futures",
    group: "hk_cn",
    ...overrides
  };
}

function event(overrides: Partial<PremarketCalendarEvent> = {}): PremarketCalendarEvent {
  return {
    date: "2026-06-19",
    time: "20:30",
    country: "美国",
    weight: 3,
    content: "核心PCE",
    source: "westock_calendar",
    timing: "pending",
    relevance: "high",
    ...overrides
  };
}

function buckets(overrides: Partial<PremarketScoreBucket>[] = []): PremarketScoreBucket[] {
  const base: PremarketScoreBucket[] = [
    { key: "usTech", label: "美股科技", score: 20, maxScore: 25, state: "neutral", note: "", evidence: ["纳指 -0.2%"] },
    { key: "asia", label: "亚太市场", score: 18, maxScore: 20, state: "good", note: "", evidence: ["日经 0.3%"] },
    { key: "hkA50", label: "港股/A50期指", score: 12, maxScore: 15, state: "neutral", note: "", evidence: ["A50 -0.2%"] },
    { key: "fx", label: "美元与汇率", score: 8, maxScore: 10, state: "neutral", note: "", evidence: ["美元 0.1%"] },
    { key: "calendar", label: "事件日历", score: 15, maxScore: 20, state: "watch", note: "", evidence: ["PCE"] }
  ];
  return base.map((bucket, index) => ({ ...bucket, ...(overrides[index] ?? {}) }));
}

describe("premarket reliability", () => {
  it("does not treat an empty but reachable macro calendar as a failed critical source", () => {
    const result = __testPremarketReliability({
      fetchedAt: "2026-06-19T00:00:00.000Z",
      markets: [market({ updatedAt: "2026-06-18T23:30:00.000Z" })],
      calendarEvents: [],
      buckets: buckets([{ state: "missing" }]),
      sessionTrace: sessionTrace(),
      calendarWarnings: ["westock 投资日历未返回中美高权重事件。"],
      calendarSourceStatus: "ok"
    });

    const calendarTrace = result.sourceTraces.find((trace) => trace.key === "westock_calendar");
    expect(calendarTrace?.status).toBe("partial");
    expect(result.dataQuality.status).toBe("partial");
    expect(result.actionability.level).toBe("degraded_reference");
    expect(result.temperatureReliability.level).not.toBe("invalid");
  });

  it("keeps non-trading-day research usable when global market timestamps are not intraday-fresh", () => {
    const result = __testPremarketReliability({
      fetchedAt: "2026-06-20T04:00:00.000Z",
      markets: [market({ updatedAt: "2026-06-19T08:00:00.000Z" })],
      calendarEvents: [event({ date: "2026-06-22" })],
      buckets: buckets(),
      sessionTrace: sessionTrace({
        phase: "non_trading_day",
        phaseLabel: "非交易日研究",
        isTradingDay: false,
        checkedAt: "2026-06-20T04:00:00.000Z"
      }),
      calendarSourceStatus: "ok"
    });

    const globalTrace = result.sourceTraces.find((trace) => trace.key === "eastmoney_global");
    expect(globalTrace?.staleAfterMinutes).toBe(72 * 60);
    expect(globalTrace?.status).toBe("ok");
    expect(result.actionability.level).toBe("plan_ready");
  });

  it("marks the snapshot not actionable when both critical market and calendar inputs fail", () => {
    const result = __testPremarketReliability({
      fetchedAt: "2026-06-19T00:00:00.000Z",
      markets: [],
      calendarEvents: [],
      buckets: buckets([
        { state: "missing" },
        { state: "missing" },
        { state: "missing" },
        { state: "missing" },
        { state: "missing" }
      ]),
      sessionTrace: sessionTrace(),
      marketWarnings: ["东方财富全球指数 fetch failed"],
      calendarWarnings: ["westock calendar failed"],
      calendarSourceStatus: "failed"
    });

    expect(result.dataQuality.status).toBe("degraded");
    expect(result.actionability.level).toBe("not_actionable");
    expect(result.temperatureReliability.level).toBe("invalid");
  });
});
