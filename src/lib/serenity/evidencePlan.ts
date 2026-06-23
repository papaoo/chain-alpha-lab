import { listSerenityEvidenceTasks, type SerenityEvidenceTask, type SerenityEvidenceTaskListOptions } from "@/lib/serenity/evidenceTasks";
import { serenityEvidenceProvider, type SerenityEvidenceHardness, type SerenityEvidenceScope } from "@/lib/serenity/evidenceProvider";

export type SerenityEvidenceExecutionSupport = "ready" | "partial" | "planned" | "manual";

export type SerenityEvidenceExecutionTaskPreview = {
  taskId: string;
  runId: string;
  code?: string;
  name: string;
  needKey: SerenityEvidenceTask["needKey"];
  needLabel: string;
  taskPriority: SerenityEvidenceTask["taskPriority"];
  recommendedTool: SerenityEvidenceTask["recommendedTool"];
  support: SerenityEvidenceExecutionSupport;
  supportLabel: string;
  sourceLabel: string;
  expectedHardness: SerenityEvidenceHardness;
  expectedHardnessLabel: string;
  scopeLabels: string[];
  willFetch: string[];
  limitations: string[];
  nextAction: string;
};

export type SerenityEvidenceExecutionGroup = {
  id: string;
  recommendedTool: SerenityEvidenceTask["recommendedTool"];
  label: string;
  support: SerenityEvidenceExecutionSupport;
  supportLabel: string;
  expectedHardness: SerenityEvidenceHardness;
  expectedHardnessLabel: string;
  sourceLabel: string;
  taskCount: number;
  highPriorityCount: number;
  candidateCount: number;
  scopeLabels: string[];
  capabilityLabels: string[];
  limitations: string[];
  nextAction: string;
  tasks: SerenityEvidenceExecutionTaskPreview[];
};

export type SerenityEvidenceExecutionPlan = {
  generatedAt: string;
  sourceContract: string;
  boundary: string;
  summary: {
    taskCount: number;
    readyCount: number;
    partialCount: number;
    plannedCount: number;
    manualCount: number;
    highPriorityCount: number;
    highPriorityExecutableCount: number;
    needsHardEvidenceCount: number;
    groupCount: number;
    label: string;
    text: string;
  };
  groups: SerenityEvidenceExecutionGroup[];
  warnings: string[];
};

export function buildSerenityEvidenceExecutionPlan(
  options: SerenityEvidenceTaskListOptions = {}
): SerenityEvidenceExecutionPlan {
  const taskList = listSerenityEvidenceTasks(options);
  return buildSerenityEvidenceExecutionPlanFromTasks(taskList.tasks);
}

export function buildSerenityEvidenceExecutionPlanFromTasks(
  tasks: SerenityEvidenceTask[],
  generatedAt = new Date().toISOString()
): SerenityEvidenceExecutionPlan {
  const provider = serenityEvidenceProvider.describe();
  const previews = tasks.map(buildTaskPreview);
  const groups = buildExecutionGroups(previews);
  const readyCount = previews.filter((task) => task.support === "ready").length;
  const partialCount = previews.filter((task) => task.support === "partial").length;
  const plannedCount = previews.filter((task) => task.support === "planned").length;
  const manualCount = previews.filter((task) => task.support === "manual").length;
  const highPriorityCount = previews.filter((task) => task.taskPriority === "high").length;
  const highPriorityExecutableCount = previews.filter((task) => task.taskPriority === "high" && (task.support === "ready" || task.support === "partial")).length;
  const needsHardEvidenceCount = tasks.filter((task) => task.boundaryLevel === "needs_hard_evidence").length;

  return {
    generatedAt,
    sourceContract: provider.contract,
    boundary: provider.boundary,
    summary: {
      taskCount: previews.length,
      readyCount,
      partialCount,
      plannedCount,
      manualCount,
      highPriorityCount,
      highPriorityExecutableCount,
      needsHardEvidenceCount,
      groupCount: groups.length,
      label: planLabel(previews.length, readyCount, partialCount, manualCount),
      text: planText(previews.length, readyCount, partialCount, plannedCount, manualCount, highPriorityCount, highPriorityExecutableCount)
    },
    groups,
    warnings: buildPlanWarnings(previews, needsHardEvidenceCount)
  };
}

function buildTaskPreview(task: SerenityEvidenceTask): SerenityEvidenceExecutionTaskPreview {
  const capability = capabilityForTask(task);
  return {
    taskId: task.id,
    runId: task.runId,
    code: task.code,
    name: task.name,
    needKey: task.needKey,
    needLabel: task.needLabel,
    taskPriority: task.taskPriority,
    recommendedTool: task.recommendedTool,
    support: capability.support,
    supportLabel: supportLabel(capability.support),
    sourceLabel: capability.sourceLabel,
    expectedHardness: capability.hardness,
    expectedHardnessLabel: hardnessLabel(capability.hardness),
    scopeLabels: capability.scopes.map(scopeLabel),
    willFetch: capability.willFetch,
    limitations: capability.limitations,
    nextAction: capability.nextAction
  };
}

function buildExecutionGroups(previews: SerenityEvidenceExecutionTaskPreview[]): SerenityEvidenceExecutionGroup[] {
  const groups = new Map<string, SerenityEvidenceExecutionTaskPreview[]>();
  for (const task of previews) {
    const key = `${task.recommendedTool}:${task.support}:${task.expectedHardness}`;
    const current = groups.get(key) ?? [];
    current.push(task);
    groups.set(key, current);
  }

  return Array.from(groups.entries())
    .map(([id, groupTasks]) => {
      const first = groupTasks[0];
      const support = strongestSupport(groupTasks.map((task) => task.support));
      const hardness = strongestHardness(groupTasks.map((task) => task.expectedHardness));
      const taskCount = groupTasks.length;
      const candidateCount = new Set(groupTasks.map((task) => task.code ?? task.name)).size;
      const highPriorityCount = groupTasks.filter((task) => task.taskPriority === "high").length;
      return {
        id,
        recommendedTool: first.recommendedTool,
        label: toolLabel(first.recommendedTool),
        support,
        supportLabel: supportLabel(support),
        expectedHardness: hardness,
        expectedHardnessLabel: hardnessLabel(hardness),
        sourceLabel: first.sourceLabel,
        taskCount,
        highPriorityCount,
        candidateCount,
        scopeLabels: unique(groupTasks.flatMap((task) => task.scopeLabels)).slice(0, 8),
        capabilityLabels: unique(groupTasks.flatMap((task) => task.willFetch)).slice(0, 8),
        limitations: unique(groupTasks.flatMap((task) => task.limitations)).slice(0, 6),
        nextAction: groupNextAction(groupTasks),
        tasks: groupTasks.slice(0, 8)
      };
    })
    .sort(compareExecutionGroups);
}

function capabilityForTask(task: SerenityEvidenceTask): {
  support: SerenityEvidenceExecutionSupport;
  sourceLabel: string;
  hardness: SerenityEvidenceHardness;
  scopes: SerenityEvidenceScope[];
  willFetch: string[];
  limitations: string[];
  nextAction: string;
} {
  if (task.needKey === "market" || task.recommendedTool === "eastmoney") {
    return {
      support: "ready",
      sourceLabel: "东方财富公开行情/资金",
      hardness: "weak",
      scopes: ["quote", "fund_flow"],
      willFetch: ["最新行情", "成交额与换手", "个股资金流"],
      limitations: ["行情和资金只能证明市场关注度，不能证明供应链瓶颈。"],
      nextAction: "可以立即刷新市场关注度，但结论仍需公告、财报或客户/产能证据确认。"
    };
  }

  if (task.needKey === "business") {
    return {
      support: "partial",
      sourceLabel: "东方财富 F10 + 后续公告核对",
      hardness: "medium",
      scopes: ["company_profile"],
      willFetch: ["公司行业", "主营业务", "经营范围", "主营构成线索"],
      limitations: ["F10 能定位主营和产品线索，但不能替代公告、年报原文和客户认证。"],
      nextAction: "先自动补 F10 主营构成，再把未命中的候选交给公告/互动易人工核验。"
    };
  }

  if (task.needKey === "filing" || task.recommendedTool === "tushare") {
    return {
      support: "partial",
      sourceLabel: "Tushare 财务指标/预告 + 公告原文待接入",
      hardness: "medium",
      scopes: ["financial_indicator", "forecast", "filing_announcement"],
      willFetch: ["财务指标", "业绩预告", "股东户数线索"],
      limitations: ["当前可自动补财务和预告，公告/合同/问询原文仍属于规划中的强证据通道。"],
      nextAction: "先用 Tushare 补基本面承接，再补交易所公告原文解析。"
    };
  }

  if (task.recommendedTool === "web") {
    return {
      support: "planned",
      sourceLabel: "公开网页检索",
      hardness: task.needKey === "customer" || task.needKey === "capacity" ? "hard" : "medium",
      scopes: ["filing_announcement"],
      willFetch: ["客户认证线索", "订单/中标线索", "项目备案或扩产线索"],
      limitations: ["网页检索需要来源可信度和原文抽取校验，尚未接入自动写库。"],
      nextAction: "适合做下一步自动采集器，但上线前必须做来源白名单和证据强度校验。"
    };
  }

  if (task.recommendedTool === "mixed") {
    return {
      support: "partial",
      sourceLabel: "东方财富 + Tushare + 人工核验",
      hardness: "medium",
      scopes: ["company_profile", "financial_indicator", "forecast"],
      willFetch: ["主营资料", "财务指标", "业绩预告", "人工核验清单"],
      limitations: ["混合补证只能先补基础资料，客户、产能和合同仍需原文验证。"],
      nextAction: "先自动补基础资料，再把关键缺口拆成公告、客户和产能任务。"
    };
  }

  return {
    support: "manual",
    sourceLabel: "人工/Agent 研究",
    hardness: task.needKey === "customer" || task.needKey === "capacity" ? "hard" : "medium",
    scopes: ["filing_announcement"],
    willFetch: ["生成核验清单", "等待人工选择来源", "后续 Agent 分工检索"],
    limitations: ["当前无法保证自动取得可信原文，不能用模型猜测补齐。"],
    nextAction: "先保留为人工核验任务，等来源白名单和采集器完善后再自动化。"
  };
}

function compareExecutionGroups(left: SerenityEvidenceExecutionGroup, right: SerenityEvidenceExecutionGroup) {
  return supportSortWeight(right.support) - supportSortWeight(left.support)
    || right.highPriorityCount - left.highPriorityCount
    || right.taskCount - left.taskCount
    || hardnessSortWeight(right.expectedHardness) - hardnessSortWeight(left.expectedHardness)
    || left.label.localeCompare(right.label, "zh-CN");
}

function groupNextAction(tasks: SerenityEvidenceExecutionTaskPreview[]) {
  if (tasks.some((task) => task.support === "ready")) return "可直接执行，适合做无模型的批量刷新。";
  if (tasks.some((task) => task.support === "partial")) return "可先自动补基础证据，再把强证据缺口留给公告/人工核验。";
  if (tasks.some((task) => task.support === "planned")) return "适合进入下一阶段采集器建设，先不要静默写入研究结论。";
  return "保留为人工或 Agent 核验任务，等待来源和原文证据确认。";
}

function strongestSupport(values: SerenityEvidenceExecutionSupport[]) {
  return values.slice().sort((left, right) => supportSortWeight(right) - supportSortWeight(left))[0] ?? "manual";
}

function strongestHardness(values: SerenityEvidenceHardness[]) {
  return values.slice().sort((left, right) => hardnessSortWeight(right) - hardnessSortWeight(left))[0] ?? "weak";
}

function supportSortWeight(value: SerenityEvidenceExecutionSupport) {
  if (value === "ready") return 4;
  if (value === "partial") return 3;
  if (value === "planned") return 2;
  return 1;
}

function hardnessSortWeight(value: SerenityEvidenceHardness) {
  if (value === "hard") return 4;
  if (value === "medium") return 3;
  return 2;
}

function planLabel(taskCount: number, readyCount: number, partialCount: number, manualCount: number) {
  if (!taskCount) return "暂无待执行补证";
  if (readyCount + partialCount >= Math.ceil(taskCount * 0.65)) return "多数证据可先自动补";
  if (manualCount >= Math.ceil(taskCount * 0.5)) return "强证据仍以人工核验为主";
  return "自动补证与人工核验并行";
}

function planText(
  taskCount: number,
  readyCount: number,
  partialCount: number,
  plannedCount: number,
  manualCount: number,
  highPriorityCount: number,
  highPriorityExecutableCount: number
) {
  if (!taskCount) return "当前没有 Serenity 证据任务，先生成一次瓶颈研究留痕。";
  return `共 ${taskCount} 个待补证任务：可直接执行 ${readyCount} 个，部分自动化 ${partialCount} 个，规划中 ${plannedCount} 个，人工/Agent ${manualCount} 个；高优先级 ${highPriorityCount} 个，其中 ${highPriorityExecutableCount} 个可先自动补基础证据。`;
}

function buildPlanWarnings(previews: SerenityEvidenceExecutionTaskPreview[], needsHardEvidenceCount: number) {
  const warnings: string[] = [];
  if (previews.some((task) => task.expectedHardness === "weak")) {
    warnings.push("行情、成交额和资金流只作为弱线索，不得直接升级为瓶颈控制力证据。");
  }
  if (previews.some((task) => task.support === "partial")) {
    warnings.push("部分自动化任务只能补主营、财务或预告，公告原文、客户、订单和产能仍需强证据核验。");
  }
  if (needsHardEvidenceCount) {
    warnings.push(`有 ${needsHardEvidenceCount} 个任务处在“先补硬证据”边界内，结论必须保持研究线索口径。`);
  }
  return warnings;
}

function supportLabel(value: SerenityEvidenceExecutionSupport) {
  if (value === "ready") return "可直接执行";
  if (value === "partial") return "部分自动化";
  if (value === "planned") return "采集器待接入";
  return "人工/Agent 核验";
}

function hardnessLabel(value: SerenityEvidenceHardness) {
  if (value === "hard") return "强证据";
  if (value === "medium") return "中证据";
  return "弱线索";
}

function toolLabel(tool: SerenityEvidenceTask["recommendedTool"]) {
  if (tool === "tushare") return "Tushare 补证";
  if (tool === "eastmoney") return "东方财富刷新";
  if (tool === "web") return "公开网页采集";
  if (tool === "mixed") return "混合补证";
  return "人工核验";
}

function scopeLabel(scope: SerenityEvidenceScope) {
  if (scope === "quote") return "行情";
  if (scope === "company_profile") return "F10 主营";
  if (scope === "fund_flow") return "资金流";
  if (scope === "financial_indicator") return "财务指标";
  if (scope === "shareholder_count") return "股东户数";
  if (scope === "forecast") return "业绩预告";
  return "公告/财报原文";
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
