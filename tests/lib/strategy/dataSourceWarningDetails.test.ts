import { describe, expect, it } from "vitest";
import { buildDataSourceWarningDetails } from "@/lib/strategy/support";

describe("data source warning details", () => {
  it("treats resolved approximate board mappings as warning instead of hard risk", () => {
    const [detail] = buildDataSourceWarningDetails([
      "东方财富未找到概念板块“金刚石”，已使用关联板块“培育钻石”作为近似成分来源，主线归属需降级确认。"
    ]);

    expect(detail).toMatchObject({
      scope: "sector",
      severity: "warning"
    });
  });

  it("keeps unresolved missing board mappings as risk", () => {
    const [detail] = buildDataSourceWarningDetails([
      "东方财富未找到概念板块：金刚石"
    ]);

    expect(detail).toMatchObject({
      scope: "sector",
      severity: "risk"
    });
  });

  it("classifies transient fetch failures as source warnings, not hard missing data", () => {
    const [detail] = buildDataSourceWarningDetails([
      "东方财富接口请求失败：网络或解析错误：fetch failed（重复 3 次）"
    ]);

    expect(detail).toMatchObject({
      scope: "system",
      severity: "warning"
    });
  });

  it("keeps unavailable decision datasets as risk", () => {
    const [detail] = buildDataSourceWarningDetails([
      "涨跌停情绪数据缺失：未取得涨停池、跌停池、炸板池和全A大跌数据，情绪分不加分。"
    ]);

    expect(detail).toMatchObject({
      scope: "market",
      severity: "risk"
    });
  });

  it("keeps critical market endpoint failures as risk", () => {
    const [detail] = buildDataSourceWarningDetails([
      "东方财富涨跌停池接口请求失败：网络错误"
    ]);

    expect(detail).toMatchObject({
      scope: "market",
      severity: "risk"
    });
  });
});
