import { describe, expect, it } from "vitest";
import { buildSerenityEvidenceNeeds } from "@/lib/serenity/evidenceNeeds";

describe("serenity evidence needs", () => {
  it("prioritizes filing, customer and capacity proof when hard evidence is missing", () => {
    const needs = buildSerenityEvidenceNeeds({
      missingProof: ["客户、订单或导入进度证据", "产能、认证、良率或扩产约束证据"],
      evidence: [
        {
          claim: "行情放量",
          sourceType: "quote",
          sourceLabel: "行情",
          strength: "weak",
          fetchedAt: "2026-06-18T07:30:00.000Z"
        }
      ],
      evidenceCoverage: {
        hardEvidenceCount: 0,
        verifiedHardEvidenceCount: 0,
        freshnessLevel: "fresh"
      }
    });

    expect(needs.filter((item) => item.priority === "high").map((item) => item.key)).toEqual(
      expect.arrayContaining(["filing", "customer", "capacity", "business"])
    );
    expect(needs.find((item) => item.key === "filing")?.sourcePaths.join(" ")).toContain("交易所公告");
  });

  it("adds market refresh when evidence freshness is unknown", () => {
    const needs = buildSerenityEvidenceNeeds({
      missingProof: [],
      evidence: [],
      evidenceCoverage: {
        hardEvidenceCount: 0,
        verifiedHardEvidenceCount: 0,
        freshnessLevel: "unknown"
      }
    });

    expect(needs.some((item) => item.key === "market")).toBe(true);
    expect(needs.some((item) => item.key === "evidence_strength")).toBe(true);
  });
});
