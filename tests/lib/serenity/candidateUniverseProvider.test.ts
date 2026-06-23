import { describe, expect, it } from "vitest";
import { serenityCandidateUniverseProvider } from "@/lib/serenity/candidateUniverseProvider";

describe("serenity candidate universe provider", () => {
  it("documents candidate-pool data sources separately from bottleneck evidence", () => {
    const description = serenityCandidateUniverseProvider.describe();

    expect(description.name).toBe("SerenityCandidateUniverseProvider");
    expect(description.providers.map((item) => [item.provider, item.role])).toEqual([
      ["eastmoney_public", "primary"],
      ["tushare", "planned_fallback"]
    ]);
    expect(description.contract).toContain("A 股候选公司初始池");
    expect(description.boundary).toContain("不负责供应链评分");
  });
});
