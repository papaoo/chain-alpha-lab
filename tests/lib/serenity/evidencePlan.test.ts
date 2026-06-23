import { describe, expect, it } from "vitest";
import { buildSerenityEvidenceExecutionPlanFromTasks } from "@/lib/serenity/evidencePlan";
import type { SerenityEvidenceTask } from "@/lib/serenity/evidenceTasks";

describe("serenity evidence execution plan", () => {
  it("separates executable market refresh from hard bottleneck proof", () => {
    const plan = buildSerenityEvidenceExecutionPlanFromTasks([
      task({ id: "m", needKey: "market", recommendedTool: "eastmoney", needLabel: "市场关注度连续性" }),
      task({ id: "f", needKey: "filing", recommendedTool: "tushare", needLabel: "公告/财报硬证据" }),
      task({ id: "c", needKey: "customer", recommendedTool: "web", needLabel: "客户/订单验证" }),
      task({ id: "x", needKey: "falsification", recommendedTool: "manual", needLabel: "反证条件" })
    ], "2026-06-22T09:00:00.000Z");

    expect(plan.summary.taskCount).toBe(4);
    expect(plan.summary.readyCount).toBe(1);
    expect(plan.summary.partialCount).toBe(1);
    expect(plan.summary.plannedCount).toBe(1);
    expect(plan.summary.manualCount).toBe(1);
    expect(plan.groups.map((group) => group.support)).toEqual(expect.arrayContaining(["ready", "partial", "planned", "manual"]));

    const market = plan.groups.find((group) => group.recommendedTool === "eastmoney");
    expect(market?.expectedHardness).toBe("weak");
    expect(market?.limitations.join(" ")).toContain("不能证明供应链瓶颈");

    const filing = plan.groups.find((group) => group.recommendedTool === "tushare");
    expect(filing?.support).toBe("partial");
    expect(filing?.limitations.join(" ")).toContain("公告/合同/问询原文仍属于规划");

    const customer = plan.groups.find((group) => group.recommendedTool === "web");
    expect(customer?.support).toBe("planned");
    expect(customer?.expectedHardness).toBe("hard");
    expect(plan.warnings.join(" ")).toContain("研究线索口径");
  });

  it("keeps business tasks as partial evidence instead of final conclusions", () => {
    const plan = buildSerenityEvidenceExecutionPlanFromTasks([
      task({ id: "b", needKey: "business", recommendedTool: "mixed", needLabel: "主营/产品匹配" })
    ]);
    const group = plan.groups[0];

    expect(group.support).toBe("partial");
    expect(group.expectedHardness).toBe("medium");
    expect(group.capabilityLabels).toEqual(expect.arrayContaining(["公司行业", "主营业务", "主营构成线索"]));
    expect(group.limitations.join(" ")).toContain("不能替代公告");
  });
});

function task(overrides: Partial<SerenityEvidenceTask>): SerenityEvidenceTask {
  return {
    id: overrides.id ?? "task",
    runId: "run-1",
    theme: "AI 半导体",
    runCreatedAt: "2026-06-21T10:00:00.000Z",
    code: "sz000001",
    name: "示例公司",
    score: 62,
    candidatePriority: "watch",
    evidenceStrength: "weak",
    boundaryLevel: "needs_hard_evidence",
    boundaryLabel: "先补硬证据",
    needKey: overrides.needKey ?? "market",
    needLabel: overrides.needLabel ?? "市场关注度连续性",
    taskPriority: overrides.taskPriority ?? "high",
    reason: "缺少可验证证据",
    sourcePaths: ["来源路径"],
    canAutomate: overrides.canAutomate ?? true,
    missingProof: ["公告或客户证据"],
    nextResearchChecks: ["核验公告"],
    hardEvidenceCount: 0,
    verifiedHardEvidenceCount: 0,
    confidencePct: 18,
    freshnessLevel: "unknown",
    evidenceSourceLabels: ["行情"],
    actionLabel: "补证",
    verificationMethod: "核验公开资料",
    recommendedTool: overrides.recommendedTool ?? "eastmoney"
  };
}
