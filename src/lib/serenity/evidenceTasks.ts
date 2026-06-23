import { buildSerenityEvidenceNeeds } from "@/lib/serenity/evidenceNeeds";
import { getSerenityRun, listSerenityRuns } from "@/lib/serenity/research";
import type {
  SerenityCandidateScore,
  SerenityEvidenceCoverage,
  SerenityEvidenceNeed,
  SerenityEvidenceStrength,
  SerenityResearchBoundaryLevel,
  SerenityRunResult
} from "@/lib/serenity/types";

export type SerenityEvidenceTask = {
  id: string;
  runId: string;
  theme: string;
  runCreatedAt: string;
  code?: string;
  name: string;
  score: number;
  candidatePriority: SerenityCandidateScore["priority"];
  evidenceStrength: SerenityEvidenceStrength;
  boundaryLevel: SerenityResearchBoundaryLevel;
  boundaryLabel: string;
  needKey: SerenityEvidenceNeed["key"];
  needLabel: string;
  taskPriority: SerenityEvidenceNeed["priority"];
  reason: string;
  sourcePaths: string[];
  canAutomate: boolean;
  missingProof: string[];
  nextResearchChecks: string[];
  hardEvidenceCount: number;
  verifiedHardEvidenceCount: number;
  confidencePct: number;
  freshnessLevel: SerenityEvidenceCoverage["freshnessLevel"] | "unknown";
  evidenceSourceLabels: string[];
  actionLabel: string;
  verificationMethod: string;
  recommendedTool: "tushare" | "eastmoney" | "web" | "manual" | "mixed";
};

export type SerenityEvidenceTaskSummary = {
  generatedAt: string;
  runCount: number;
  candidateCount: number;
  taskCount: number;
  highPriorityCount: number;
  automatableCount: number;
  manualCount: number;
  needsHardEvidenceCount: number;
};

export type SerenityEvidenceTaskList = {
  summary: SerenityEvidenceTaskSummary;
  tasks: SerenityEvidenceTask[];
};

export type SerenityEvidenceTaskListOptions = {
  runId?: string;
  limit?: number;
  priority?: SerenityEvidenceNeed["priority"];
  canAutomate?: boolean;
};

export function listSerenityEvidenceTasks(options: SerenityEvidenceTaskListOptions = {}): SerenityEvidenceTaskList {
  const runs = loadRunsForEvidenceTasks(options);
  const tasks = runs
    .flatMap(buildSerenityEvidenceTasksFromRun)
    .filter((task) => !options.priority || task.taskPriority === options.priority)
    .filter((task) => options.canAutomate === undefined || task.canAutomate === options.canAutomate)
    .sort(compareEvidenceTasks);

  return {
    summary: {
      generatedAt: new Date().toISOString(),
      runCount: runs.length,
      candidateCount: runs.reduce((sum, run) => sum + run.candidates.length, 0),
      taskCount: tasks.length,
      highPriorityCount: tasks.filter((task) => task.taskPriority === "high").length,
      automatableCount: tasks.filter((task) => task.canAutomate).length,
      manualCount: tasks.filter((task) => !task.canAutomate).length,
      needsHardEvidenceCount: tasks.filter((task) => task.boundaryLevel === "needs_hard_evidence").length
    },
    tasks
  };
}

export function buildSerenityEvidenceTasksFromRun(run: SerenityRunResult): SerenityEvidenceTask[] {
  return run.candidates.flatMap((candidate) => {
    const coverage = candidate.evidenceCoverage;
    const needs = candidate.evidenceNeeds?.length
      ? candidate.evidenceNeeds
      : buildSerenityEvidenceNeeds({
          missingProof: candidate.missingProof,
          evidence: candidate.evidence,
          evidenceCoverage: coverage
        });
    const boundary = candidate.researchBoundary ?? fallbackBoundary(candidate, coverage);

    return needs.map((need) => ({
      id: buildTaskId(run.id, candidate, need),
      runId: run.id,
      theme: run.theme,
      runCreatedAt: run.createdAt,
      code: candidate.code,
      name: candidate.name,
      score: candidate.score,
      candidatePriority: candidate.priority,
      evidenceStrength: candidate.evidenceStrength,
      boundaryLevel: boundary.level,
      boundaryLabel: boundary.label,
      needKey: need.key,
      needLabel: need.label,
      taskPriority: need.priority,
      reason: need.reason,
      sourcePaths: need.sourcePaths,
      canAutomate: need.canAutomate,
      missingProof: candidate.missingProof,
      nextResearchChecks: candidate.nextResearchChecks ?? [],
      hardEvidenceCount: coverage?.hardEvidenceCount ?? 0,
      verifiedHardEvidenceCount: coverage?.verifiedHardEvidenceCount ?? 0,
      confidencePct: coverage?.confidencePct ?? 0,
      freshnessLevel: coverage?.freshnessLevel ?? "unknown",
      evidenceSourceLabels: coverage?.sourceLabels ?? [],
      actionLabel: actionLabelForNeed(need),
      verificationMethod: verificationMethodForNeed(need),
      recommendedTool: recommendedToolForNeed(need)
    }));
  });
}

function loadRunsForEvidenceTasks(options: SerenityEvidenceTaskListOptions) {
  if (options.runId) {
    const run = getSerenityRun(options.runId);
    return run ? [run] : [];
  }
  return listSerenityRuns(options.limit ?? 8)
    .map((summary) => getSerenityRun(summary.id))
    .filter((run): run is SerenityRunResult => Boolean(run));
}

function buildTaskId(runId: string, candidate: SerenityCandidateScore, need: SerenityEvidenceNeed) {
  return `${runId}:${candidate.code ?? candidate.name}:${need.key}`;
}

function compareEvidenceTasks(left: SerenityEvidenceTask, right: SerenityEvidenceTask) {
  return evidenceTaskSortScore(right) - evidenceTaskSortScore(left)
    || Date.parse(right.runCreatedAt) - Date.parse(left.runCreatedAt)
    || right.score - left.score
    || left.name.localeCompare(right.name, "zh-CN");
}

function evidenceTaskSortScore(task: SerenityEvidenceTask) {
  const priority = task.taskPriority === "high" ? 60 : task.taskPriority === "medium" ? 35 : 12;
  const boundary = task.boundaryLevel === "needs_hard_evidence" ? 25 : task.boundaryLevel === "research_only" ? 16 : 5;
  const candidate = task.candidatePriority === "top" ? 18 : task.candidatePriority === "high" ? 14 : task.candidatePriority === "watch" ? 8 : 0;
  const evidence = task.verifiedHardEvidenceCount <= 0 ? 18 : task.hardEvidenceCount <= 1 ? 8 : 0;
  const freshness = task.freshnessLevel === "stale" || task.freshnessLevel === "unknown" ? 6 : 0;
  return priority + boundary + candidate + evidence + freshness + Math.min(10, task.score / 10);
}

function fallbackBoundary(
  candidate: SerenityCandidateScore,
  coverage?: SerenityEvidenceCoverage
): { level: SerenityResearchBoundaryLevel; label: string } {
  if (!coverage?.verifiedHardEvidenceCount) return { level: "needs_hard_evidence", label: "先补硬证据" };
  if (candidate.priority === "top" || candidate.priority === "high") return { level: "candidate_watch", label: "研究候选" };
  if (candidate.evidenceStrength === "weak" || candidate.evidenceStrength === "needs_checking") return { level: "needs_hard_evidence", label: "先补硬证据" };
  return { level: "research_only", label: "研究线索" };
}

function actionLabelForNeed(need: SerenityEvidenceNeed) {
  if (need.key === "business") return "核对主营、产品和产业链位置";
  if (need.key === "filing") return "查公告、财报和交易所问询";
  if (need.key === "customer") return "查客户、订单、中标或认证";
  if (need.key === "capacity") return "查产能、项目、认证和良率";
  if (need.key === "constraint") return "说明瓶颈机制和不可替代性";
  if (need.key === "falsification") return "补充反证条件和降级触发";
  if (need.key === "market") return "刷新行情、资金和主线连续性";
  return "做强/中证据交叉验证";
}

function verificationMethodForNeed(need: SerenityEvidenceNeed) {
  if (need.key === "business") return "先核对 F10 主营、产品关键词和产业链位置，再用公告或年报确认是否真实参与该环节。";
  if (need.key === "filing") return "优先查交易所公告、定期报告、业绩预告和问询回复，提取原文证据而不是二级转述。";
  if (need.key === "customer") return "查客户认证、订单、中标、供货协议、互动易/公告中的导入进度，至少需要一个可追溯来源。";
  if (need.key === "capacity") return "查产能、扩产项目、认证周期、良率、投产时间和资本开支，确认瓶颈是否真实受限。";
  if (need.key === "constraint") return "把瓶颈机制拆成供给约束、技术认证、客户导入、产能爬坡和替代难度，并分别找证据。";
  if (need.key === "falsification") return "列出反证条件：替代品突破、客户切换、价格下行、产能过剩或订单取消。";
  if (need.key === "market") return "刷新行情、板块成分、资金和主线阶段，只用于确认市场是否开始定价该瓶颈。";
  return "先找原始公开资料，再用行情和资金做辅助交叉验证。";
}

function recommendedToolForNeed(need: SerenityEvidenceNeed): SerenityEvidenceTask["recommendedTool"] {
  if (need.key === "market") return "eastmoney";
  if (need.key === "business") return "mixed";
  if (need.key === "filing") return "tushare";
  if (need.key === "customer" || need.key === "capacity" || need.key === "constraint") return need.canAutomate ? "web" : "manual";
  if (need.key === "falsification") return "manual";
  return need.canAutomate ? "mixed" : "manual";
}
