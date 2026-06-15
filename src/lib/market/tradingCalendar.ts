import fs from "node:fs";
import path from "node:path";

export interface TradingCalendarFile {
  market: string;
  source: string;
  updatedAt: string;
  closedDates: string[];
}

const CALENDAR_PATH = path.resolve(process.cwd(), "data", "trading-calendar.json");

const FALLBACK_CALENDAR: TradingCalendarFile = {
  market: "A_SHARE",
  source: "fallback_2026",
  updatedAt: "2026-06-05",
  closedDates: [
    "20260101",
    "20260102",
    "20260216",
    "20260217",
    "20260218",
    "20260219",
    "20260220",
    "20260223",
    "20260406",
    "20260501",
    "20260504",
    "20260505",
    "20260619",
    "20260925",
    "20261001",
    "20261002",
    "20261005",
    "20261006",
    "20261007"
  ]
};

export function getTradingCalendarPath() {
  return CALENDAR_PATH;
}

export function readTradingCalendar(): TradingCalendarFile {
  try {
    const raw = fs.readFileSync(CALENDAR_PATH, "utf8");
    return normalizeCalendar(JSON.parse(raw));
  } catch {
    return FALLBACK_CALENDAR;
  }
}

export function saveTradingCalendar(input: Partial<TradingCalendarFile>): TradingCalendarFile {
  const calendar = normalizeCalendar({
    market: input.market || "A_SHARE",
    source: input.source || "manual",
    updatedAt: new Date().toISOString().slice(0, 10),
    closedDates: input.closedDates ?? []
  });
  fs.mkdirSync(path.dirname(CALENDAR_PATH), { recursive: true });
  fs.writeFileSync(CALENDAR_PATH, `${JSON.stringify(calendar, null, 2)}\n`, "utf8");
  return calendar;
}

function normalizeCalendar(input: unknown): TradingCalendarFile {
  const object = input && typeof input === "object" ? input as Partial<TradingCalendarFile> : {};
  const closedDates = Array.isArray(object.closedDates)
    ? object.closedDates
        .map((date) => String(date).trim())
        .filter((date) => /^\d{8}$/.test(date))
    : [];
  return {
    market: object.market || "A_SHARE",
    source: object.source || "manual",
    updatedAt: object.updatedAt || new Date().toISOString().slice(0, 10),
    closedDates: Array.from(new Set(closedDates)).sort()
  };
}
