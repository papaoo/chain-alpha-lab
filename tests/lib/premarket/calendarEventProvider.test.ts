import { describe, expect, it } from "vitest";
import { calendarEventProvider } from "@/lib/premarket/calendarEventProvider";

describe("calendar event provider", () => {
  it("documents the macro calendar boundary and planned fallback", () => {
    const description = calendarEventProvider.describe();

    expect(description.name).toBe("CalendarEventProvider");
    expect(description.providers.map((item) => [item.provider, item.role, item.scope])).toEqual([
      ["tencent_zixuangu", "primary", "macro_calendar"],
      ["tushare", "planned_fallback", "macro_calendar"]
    ]);
    expect(description.contract).toContain("中美宏观事件");
    expect(description.boundary).toContain("不负责外围指数温度评分");
    expect(description.boundary).toContain("交易建议");
  });
});
