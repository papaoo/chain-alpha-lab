import { describe, expect, it } from "vitest";
import { serenityEvidenceProvider } from "@/lib/serenity/evidenceProvider";

describe("serenity evidence provider", () => {
  it("documents source hardness so bottleneck research does not treat market data as hard proof", () => {
    const description = serenityEvidenceProvider.describe();

    expect(description.name).toBe("SerenityEvidenceProvider");
    expect(description.providers.map((item) => [item.provider, item.role, item.hardness])).toEqual([
      ["eastmoney_public", "primary", "medium"],
      ["eastmoney_public", "fallback", "weak"],
      ["tushare", "fallback", "medium"],
      ["tushare", "planned", "hard"]
    ]);
    expect(description.contract).toContain("证据强弱边界");
    expect(description.boundary).toContain("不负责产业链评分");
  });

  it("keeps quote and fund-flow evidence classified as weak leads", () => {
    const sources = serenityEvidenceProvider.describe().providers;
    const marketEvidence = sources.find((item) => item.scopes.includes("quote"));

    expect(marketEvidence?.hardness).toBe("weak");
    expect(marketEvidence?.note).toContain("不能证明产业链瓶颈");
  });

  it("marks announcement and filing evidence as planned hard proof", () => {
    const sources = serenityEvidenceProvider.describe().providers;
    const filingEvidence = sources.find((item) => item.scopes.includes("filing_announcement"));

    expect(filingEvidence?.role).toBe("planned");
    expect(filingEvidence?.hardness).toBe("hard");
  });
});
