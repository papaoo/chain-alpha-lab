import { describe, expect, it } from "vitest";
import { buildSerenityEvidenceTasksFromRun } from "@/lib/serenity/evidenceTasks";
import type { SerenityRunResult } from "@/lib/serenity/types";

describe("serenity evidence tasks", () => {
  it("derives evidence tasks for legacy runs without persisted evidenceNeeds", () => {
    const run: SerenityRunResult = {
      id: "run-1",
      theme: "CPO",
      market: "A-share",
      timeWindow: "未来 3-12 个月",
      createdAt: "2026-06-20T10:00:00.000Z",
      layerRanking: [],
      candidates: [
        {
          code: "sz000001",
          name: "示例公司",
          market: "A-share",
          chainPosition: "关键材料",
          constrains: "认证周期长",
          score: 58,
          rawFactorPoints: 70,
          penaltyPoints: 4,
          priority: "watch",
          factorDetails: {} as SerenityRunResult["candidates"][number]["factorDetails"],
          penaltyDetails: {} as SerenityRunResult["candidates"][number]["penaltyDetails"],
          evidenceStrength: "weak",
          evidence: [
            {
              claim: "行情放量",
              sourceType: "quote",
              sourceLabel: "行情",
              strength: "weak",
              fetchedAt: "2026-06-19T07:00:00.000Z"
            }
          ],
          evidenceCoverage: {
            sourceCount: 1,
            strongCount: 0,
            mediumCount: 0,
            weakCount: 1,
            needsCheckingCount: 0,
            hardEvidenceCount: 0,
            verifiedHardEvidenceCount: 0,
            freshEvidenceCount: 1,
            agingEvidenceCount: 0,
            staleEvidenceCount: 0,
            undatedEvidenceCount: 0,
            freshnessLevel: "fresh",
            confidencePct: 18,
            sourceLabels: ["行情"],
            latestFetchedAt: "2026-06-19T07:00:00.000Z"
          },
          missingProof: ["客户、订单或导入进度证据", "产能、认证、良率或扩产约束证据"],
          weakenConditions: [],
          verdict: "研究线索"
        }
      ],
      summary: "demo",
      methodNote: "demo",
      warnings: []
    };

    const tasks = buildSerenityEvidenceTasksFromRun(run);

    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.map((task) => task.needKey)).toEqual(expect.arrayContaining(["filing", "customer", "capacity"]));
    expect(tasks.every((task) => task.runId === "run-1")).toBe(true);
    expect(tasks.find((task) => task.needKey === "customer")?.actionLabel).toContain("客户");
    expect(tasks.find((task) => task.needKey === "customer")?.verificationMethod).toContain("客户认证");
    expect(tasks.find((task) => task.needKey === "filing")?.recommendedTool).toBe("tushare");
  });
});
