import { describe, expect, it } from "vitest";
import { effectiveTradeDateForSession, inferMarketSessionContext } from "../../../src/lib/market/session";

describe("market session context", () => {
  it("classifies trading-day phases by China A-share session", () => {
    expect(inferMarketSessionContext("2026-06-05T08:30:00+08:00").phase).toBe("premarket");
    expect(inferMarketSessionContext("2026-06-05T09:20:00+08:00").phase).toBe("call_auction");
    expect(inferMarketSessionContext("2026-06-05T10:30:00+08:00").phase).toBe("morning");
    expect(inferMarketSessionContext("2026-06-05T12:00:00+08:00").phase).toBe("midday_break");
    expect(inferMarketSessionContext("2026-06-05T13:30:00+08:00").phase).toBe("afternoon");
    expect(inferMarketSessionContext("2026-06-05T14:45:00+08:00").phase).toBe("closing_auction");
    expect(inferMarketSessionContext("2026-06-05T16:00:00+08:00").phase).toBe("postmarket");
  });

  it("uses prior weekday data for premarket and non-trading research", () => {
    const premarket = inferMarketSessionContext("2026-06-05T08:30:00+08:00");
    const weekend = inferMarketSessionContext("2026-06-07T10:00:00+08:00");

    expect(effectiveTradeDateForSession("2026-06-05T08:30:00+08:00", premarket)).toBe("20260604");
    expect(weekend.phase).toBe("non_trading_day");
    expect(effectiveTradeDateForSession("2026-06-07T10:00:00+08:00", weekend)).toBe("20260605");
  });

  it("routes night research to the correct effective trade date", () => {
    const mondayNight = inferMarketSessionContext("2026-06-08T22:00:00+08:00");
    const mondayEarlyMorning = inferMarketSessionContext("2026-06-08T06:00:00+08:00");

    expect(mondayNight.phase).toBe("night_research");
    expect(effectiveTradeDateForSession("2026-06-08T22:00:00+08:00", mondayNight)).toBe("20260608");
    expect(mondayEarlyMorning.phase).toBe("night_research");
    expect(effectiveTradeDateForSession("2026-06-08T06:00:00+08:00", mondayEarlyMorning)).toBe("20260605");
  });

  it("uses prior trade date and disables realtime confirmation during call auction", () => {
    const session = inferMarketSessionContext("2026-06-05T09:20:00+08:00");

    expect(session.phase).toBe("call_auction");
    expect(session.canUseRealtimeQuotes).toBe(false);
    expect(session.canUseAuctionQuotes).toBe(true);
    expect(effectiveTradeDateForSession("2026-06-05T09:20:00+08:00", session)).toBe("20260604");
  });

  it("recognizes configured A-share holidays as non-trading days", () => {
    const newYearHoliday = inferMarketSessionContext("2026-01-02T10:00:00+08:00");
    const springFestivalHoliday = inferMarketSessionContext("2026-02-23T10:00:00+08:00");
    const dragonBoatHoliday = inferMarketSessionContext("2026-06-19T10:00:00+08:00");

    expect(newYearHoliday.phase).toBe("non_trading_day");
    expect(effectiveTradeDateForSession("2026-01-02T10:00:00+08:00", newYearHoliday)).toBe("20251231");
    expect(springFestivalHoliday.phase).toBe("non_trading_day");
    expect(effectiveTradeDateForSession("2026-02-23T10:00:00+08:00", springFestivalHoliday)).toBe("20260213");
    expect(dragonBoatHoliday.phase).toBe("non_trading_day");
    expect(effectiveTradeDateForSession("2026-06-19T10:00:00+08:00", dragonBoatHoliday)).toBe("20260618");
  });

  it("keeps boundary times stable", () => {
    expect(inferMarketSessionContext("2026-06-05T07:00:00+08:00").phase).toBe("premarket");
    expect(inferMarketSessionContext("2026-06-05T09:15:00+08:00").phase).toBe("call_auction");
    expect(inferMarketSessionContext("2026-06-05T09:30:00+08:00").phase).toBe("morning");
    expect(inferMarketSessionContext("2026-06-05T11:30:00+08:00").phase).toBe("midday_break");
    expect(inferMarketSessionContext("2026-06-05T13:00:00+08:00").phase).toBe("afternoon");
    expect(inferMarketSessionContext("2026-06-05T14:30:00+08:00").phase).toBe("closing_auction");
    expect(inferMarketSessionContext("2026-06-05T15:00:00+08:00").phase).toBe("postmarket");
    expect(inferMarketSessionContext("2026-06-05T21:00:00+08:00").phase).toBe("night_research");
  });
});
