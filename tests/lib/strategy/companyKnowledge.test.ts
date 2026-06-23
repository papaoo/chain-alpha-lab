import { describe, expect, it } from "vitest";
import { buildCompanyKnowledge } from "../../../src/lib/strategy/companyKnowledge";

describe("company knowledge completeness", () => {
  it("treats Tushare financial indicator rows as usable financial evidence", () => {
    const companyKnowledge = buildCompanyKnowledge("sh600001", "测试股份", {
      code: "sh600001",
      name: "测试股份",
      business: "通信设备制造与服务",
      industry: "通信设备"
    }, "通信设备", {
      hasSectorMembership: true,
      hasBusinessMatch: true,
      themeMatchType: "direct_constituent",
      themeMatchLogic: "成分股直接匹配。",
      incomeHistory: [{
        symbol: "sh600001",
        EndDate: "20260331",
        roePct: 8.2,
        revenueChangePct: 18.5,
        netProfitChangePct: 25.3,
        grossMarginPct: 31.2,
        debtRatioPct: 42.1,
        source: "tushare_fina_indicator_fallback"
      }],
      shareholder: {
        holderStats: [{ date: "2026-03-31", totalSHNum: 10000 }]
      }
    });

    expect(companyKnowledge.companyKnowledgeState).toBe("sufficient");
    expect(companyKnowledge.missingFields).not.toContain("financial");
    expect(companyKnowledge.financialSummary?.revenueChangePct).toBe(18.5);
    expect(companyKnowledge.financialSummary?.debtRatioPct).toBe(42.1);
  });
});
