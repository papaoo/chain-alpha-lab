import { describe, expect, it } from "vitest";
import { isLowQualityFactPackage } from "../../../src/lib/analysis/service";
import { isDisplayableReport } from "../../../src/lib/db/reports";

function minimalFactPackage(overrides: Record<string, unknown> = {}) {
  return {
    sectors: [],
    candidates: [],
    dataSource: {
      status: "partial",
      warnings: []
    },
    ...overrides
  };
}

describe("analysis quality gates", () => {
  it("rejects empty mainline and candidate reports when data sources failed", () => {
    const factPackage = minimalFactPackage({
      dataSource: {
        status: "partial",
        warnings: ["热门板块首页失败", "东方财富接口 fetch failed"]
      }
    });

    expect(isLowQualityFactPackage(factPackage as never)).toBe(true);
    expect(isDisplayableReport(JSON.stringify(factPackage))).toBe(false);
  });

  it("allows display when report has sectors or candidates", () => {
    const withSector = minimalFactPackage({
      sectors: [{ name: "通信设备", stage: "启动", score: 50 }]
    });
    const withCandidate = minimalFactPackage({
      candidates: [{ code: "sh600000", name: "测试股份" }]
    });

    expect(isLowQualityFactPackage(withSector as never)).toBe(false);
    expect(isDisplayableReport(JSON.stringify(withSector))).toBe(true);
    expect(isDisplayableReport(JSON.stringify(withCandidate))).toBe(true);
  });
});
