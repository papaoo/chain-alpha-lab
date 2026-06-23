import { describe, expect, it } from "vitest";
import { scoreSerenityCandidate } from "@/lib/serenity/scoring";
import type { SerenityCandidateInput } from "@/lib/serenity/types";

const now = () => new Date().toISOString();

function richCandidate(overrides: Partial<SerenityCandidateInput> = {}): SerenityCandidateInput {
  return {
    code: "sz000001",
    name: "测试公司",
    chainPosition: "关键材料",
    constrains: "高纯材料认证和产能爬坡",
    factors: {
      demandInflection: 5,
      architectureCoupling: 5,
      chokepointSeverity: 5,
      supplierConcentration: 5,
      expansionDifficulty: 5,
      evidenceQuality: 5,
      valuationDisconnect: 5,
      catalystTiming: 5
    },
    penalties: {},
    weakenConditions: ["公告无法证明相关业务收入"],
    missingProof: [],
    ...overrides
  };
}

describe("scoreSerenityCandidate evidence gates", () => {
  it("does not allow weak market-only evidence to become high priority", () => {
    const scored = scoreSerenityCandidate(richCandidate({
      evidence: [{
        claim: "涨幅和资金较强，但只是行情线索",
        sourceType: "quote",
        sourceLabel: "行情",
        fetchedAt: now(),
        strength: "weak"
      }]
    }), "A-share");

    expect(scored.score).toBeLessThanOrEqual(58);
    expect(scored.priority).toBe("watch");
    expect(scored.researchBoundary?.level).toBe("needs_hard_evidence");
    expect(scored.evidenceCoverage?.verifiedHardEvidenceCount).toBe(0);
    expect(scored.evidenceCoverage?.confidencePct).toBeLessThanOrEqual(30);
  });

  it("caps stale hard evidence and keeps it out of top priority", () => {
    const scored = scoreSerenityCandidate(richCandidate({
      evidence: [{
        claim: "年报曾披露相关产品",
        sourceType: "financial_report",
        sourceLabel: "历史年报",
        fetchedAt: "2024-01-01T00:00:00.000Z",
        strength: "strong"
      }]
    }), "A-share");

    expect(scored.score).toBeLessThanOrEqual(60);
    expect(scored.priority).not.toBe("top");
    expect(scored.researchBoundary?.level).toBe("research_only");
    expect(scored.evidenceCoverage?.freshnessLevel).toBe("stale");
    expect(scored.evidenceCoverage?.confidencePct).toBeLessThanOrEqual(78);
  });

  it("allows fresh verified hard evidence to become evidence-backed", () => {
    const scored = scoreSerenityCandidate(richCandidate({
      evidence: [{
        claim: "公司公告披露关键材料客户认证通过",
        sourceType: "announcement",
        sourceLabel: "公司公告",
        fetchedAt: now(),
        strength: "strong"
      }]
    }), "A-share");

    expect(scored.priority).toBe("top");
    expect(scored.researchBoundary?.level).toBe("evidence_backed");
    expect(scored.evidenceCoverage?.verifiedHardEvidenceCount).toBe(1);
    expect(scored.evidenceCoverage?.freshnessLevel).toBe("fresh");
    expect(scored.evidenceCoverage?.confidencePct).toBeGreaterThanOrEqual(50);
  });
});
