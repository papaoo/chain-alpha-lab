import { describe, expect, it } from "vitest";
import { __testSelectionAgentActionabilityGate, runSelectionAgentReview } from "@/lib/selection/agent-workflow";
import type { SelectionRunResult, SelectionStrategyDefinition } from "@/lib/selection/types";

describe("runSelectionAgentReview", () => {
  it("skips model review when rule layer has no selected picks", async () => {
    const result = await runSelectionAgentReview(mockStrategy(), {
      strategyId: "main_force_accumulation",
      strategyName: "主力吸筹",
      mode: "agent",
      parameters: {},
      picks: [],
      rejected: [],
      warnings: ["测试警告"],
      dataBasis: "unit-test"
    });

    expect(result.llmStatus).toBe("skipped");
    expect(result.llmMetrics?.estimatedInputTokens).toBe(0);
    expect(result.llmMetrics?.retryCount).toBe(0);
    expect(result.finalReview?.finalPicks).toEqual([]);
    expect(result.llmErrors?.[0]).toContain("跳过选股 Agent 复核");
  });

  it("skips model review on stale source reports unless explicitly forced", async () => {
    const result = await runSelectionAgentReview(mockStrategy(), {
      strategyId: "main_force_accumulation",
      strategyName: "主力吸筹",
      mode: "agent",
      parameters: {},
      picks: [mockPick()],
      rejected: [],
      warnings: ["来源报告过期"],
      dataBasis: "unit-test",
      freshnessStatus: "stale"
    });

    expect(result.llmStatus).toBe("skipped");
    expect(result.llmMetrics?.estimatedInputTokens).toBe(0);
    expect(result.llmMetrics?.retryCount).toBe(0);
    expect(result.llmMetrics?.skipReason).toContain("选股来源报告已经过期");
    expect(result.finalReview?.finalPicks).toEqual([]);
  });

  it("skips model review when all selected picks are research-only snapshots", async () => {
    const result = await runSelectionAgentReview(mockStrategy(), {
      strategyId: "main_force_accumulation",
      strategyName: "主力吸筹",
      mode: "agent",
      parameters: {},
      picks: [mockPick({ actionabilityLevel: "reference_only" })],
      rejected: [],
      warnings: [],
      dataBasis: "unit-test",
      freshnessStatus: "current"
    });

    expect(result.llmStatus).toBe("skipped");
    expect(result.llmMetrics?.estimatedInputTokens).toBe(0);
    expect(result.llmMetrics?.skipReason).toContain("研究参考或不可行动");
    expect(result.finalReview?.strategySuitability).toContain("复核仅研究快照");
  });

  it("keeps the actionability gate explicit so manual override can be handled without a model call in tests", () => {
    const ruleResult: SelectionRunResult = {
      strategyId: "main_force_accumulation",
      strategyName: "主力吸筹",
      mode: "agent",
      parameters: { forceAgentOnReferenceOnly: true },
      picks: [mockPick({ actionabilityLevel: "reference_only" })],
      rejected: [],
      warnings: [],
      dataBasis: "unit-test",
      freshnessStatus: "current"
    };
    const gate = __testSelectionAgentActionabilityGate(ruleResult);

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain("研究参考或不可行动");
    expect(ruleResult.parameters.forceAgentOnReferenceOnly).toBe(true);
  });
});

function mockStrategy(): SelectionStrategyDefinition {
  return {
    id: "main_force_accumulation",
    order: 1,
    name: "主力吸筹",
    subtitle: "unit",
    description: "unit",
    defaultTimeRange: "30d",
    recommendedPickCount: 5,
    candidatePoolLimit: 20,
    riskLevel: "medium",
    cycle: "mid",
    enabledInMvp: true,
    hardFilters: [],
    scoreFactors: [],
    requiredData: [],
    outputFocus: [],
    parameters: []
  };
}

function mockPick(options: { actionabilityLevel?: "actionable" | "reference_only" | "not_actionable" } = {}): SelectionRunResult["picks"][number] {
  return {
    code: "sz000001",
    name: "平安银行",
    sectorName: "银行",
    score: 72,
    tier: "B",
    action: "跟踪观察",
    reasons: ["unit"],
    blockers: [],
    evidenceRefs: ["stock.sz000001.quote"],
    scoreFactors: [],
    runtimeSnapshot: options.actionabilityLevel
      ? {
          source: "unit",
          basis: "runtime_refresh",
          actionability: {
            level: options.actionabilityLevel,
            label: options.actionabilityLevel === "actionable" ? "可行动" : options.actionabilityLevel === "reference_only" ? "研究可参考" : "不可行动",
            reason: "unit reference-only snapshot",
            staleAfterMinutes: 30,
            sessionPhase: "premarket"
          },
          warnings: []
        }
      : undefined
  };
}
