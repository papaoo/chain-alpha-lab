import { getRuntimeSettings } from "@/lib/db/settings";
import { dbGet } from "@/lib/db/client";
import { buildDataSourceHealth } from "@/lib/db/dataSourceHealth";
import { getAnalysisReportSummaryMaintenanceStatus, listAnalysisReportSummaries } from "@/lib/db/reportSummaries";
import { getDatabaseStats } from "@/lib/db/stats";
import { buildModelUsageSummary } from "@/lib/db/modelUsage";
import { getSchedulerSettings } from "@/lib/db/settings";
import { listRecentSchedulerRuns } from "@/lib/db/incremental";
import { buildSelectionSummaryInsight } from "@/lib/selection/insights";
import { listSelectionRunSummaries } from "@/lib/selection/runs";

export type ProjectHealthLevel = "healthy" | "degraded" | "risk" | "idle";

type SchedulerRunHealthRow = {
  status?: unknown;
  startedAt?: unknown;
};

export type ProjectHealthCheck = {
  key: string;
  label: string;
  level: ProjectHealthLevel;
  value: string;
  detail: string;
  nextAction?: string;
};

export type ProjectHealthSnapshot = {
  generatedAt: string;
  overallLevel: ProjectHealthLevel;
  overallLabel: string;
  summary: string;
  checks: ProjectHealthCheck[];
  metrics: {
    databaseSizeMB: number;
    latestReportAt?: string | null;
    latestReportAgeMinutes?: number;
    reportSummaryCoveragePct: number;
    dataSourceStatus: string;
    modelEnabled: boolean;
    modelCallCount7d: number;
    modelFailedOrRejected7d: number;
    schedulerEnabled: boolean;
    recentSchedulerFailures: number;
    activeTrackingCount: number;
    latestTrackingSnapshotAt?: string | null;
    selectionRunCount: number;
    latestSelectionRunAt?: string | null;
    serenityRunCount: number;
    latestSerenityRunAt?: string | null;
  };
  nextActions: string[];
};

export function buildProjectHealthSnapshot(): ProjectHealthSnapshot {
  const generatedAt = new Date().toISOString();
  const databaseStats = getDatabaseStats();
  const summaryStatus = getAnalysisReportSummaryMaintenanceStatus();
  const latestSummary = listAnalysisReportSummaries(1)[0];
  const dataHealth = buildDataSourceHealth(20);
  const modelSettings = getRuntimeSettings();
  const modelUsage = buildModelUsageSummary({ windowDays: 7, limit: 80 });
  const schedulerSettings = getSchedulerSettings();
  const schedulerRuns = listRecentSchedulerRuns(10) as SchedulerRunHealthRow[];
  const trackingStats = readTrackingStats();
  const selectionStats = readRunStats("selection_runs", "startedAt");
  const latestSelectionRun = listSelectionRunSummaries(1)[0];
  const serenityStats = readRunStats("serenity_research_runs", "createdAt");
  const latestReportAgeMinutes = latestSummary?.createdAt ? minutesBetween(latestSummary.createdAt, generatedAt) : undefined;
  const recentSchedulerFailures = schedulerRuns.filter((run) => String(run.status) === "failed").length;

  const checks: ProjectHealthCheck[] = [
    buildDatabaseCheck(databaseStats.sizeMB, summaryStatus.coveragePct, summaryStatus.missingCount),
    buildLatestReportCheck(latestSummary?.createdAt, latestReportAgeMinutes),
    buildDataSourceCheck(dataHealth.overallStatus, dataHealth.actionability.label, dataHealth.actionability.summary),
    buildModelCheck(modelSettings.enabled, modelUsage.callCount, modelUsage.failedOrRejectedCount, modelUsage.repairOrRetryCount, modelUsage.recentCalls),
    buildSchedulerCheck(schedulerSettings.enabled, recentSchedulerFailures, stringOrUndefined(schedulerRuns[0]?.startedAt)),
    buildTrackingCheck(trackingStats.activeCount, trackingStats.latestSnapshotAt),
    buildSelectionCheck(selectionStats.count, selectionStats.latestAt, latestSelectionRun),
    buildSerenityCheck(serenityStats.count, serenityStats.latestAt)
  ];

  const overallLevel = inferOverallLevel(checks);
  const nextActions = checks
    .filter((check) => check.level === "risk" || check.level === "degraded")
    .map((check) => check.nextAction)
    .filter((item): item is string => Boolean(item))
    .slice(0, 6);

  return {
    generatedAt,
    overallLevel,
    overallLabel: levelLabel(overallLevel),
    summary: buildOverallSummary(overallLevel, checks),
    checks,
    metrics: {
      databaseSizeMB: databaseStats.sizeMB,
      latestReportAt: latestSummary?.createdAt ?? null,
      latestReportAgeMinutes,
      reportSummaryCoveragePct: summaryStatus.coveragePct,
      dataSourceStatus: dataHealth.overallStatus,
      modelEnabled: modelSettings.enabled,
      modelCallCount7d: modelUsage.callCount,
      modelFailedOrRejected7d: modelUsage.failedOrRejectedCount,
      schedulerEnabled: schedulerSettings.enabled,
      recentSchedulerFailures,
      activeTrackingCount: trackingStats.activeCount,
      latestTrackingSnapshotAt: trackingStats.latestSnapshotAt,
      selectionRunCount: selectionStats.count,
      latestSelectionRunAt: selectionStats.latestAt,
      serenityRunCount: serenityStats.count,
      latestSerenityRunAt: serenityStats.latestAt
    },
    nextActions
  };
}

function buildDatabaseCheck(sizeMB: number, coveragePct: number, missingCount: number): ProjectHealthCheck {
  const level: ProjectHealthLevel = coveragePct < 80 ? "risk" : coveragePct < 100 || sizeMB > 800 ? "degraded" : "healthy";
  return {
    key: "database",
    label: "数据库与摘要索引",
    level,
    value: `${sizeMB} MB / 摘要覆盖 ${coveragePct}%`,
    detail: missingCount
      ? `仍有 ${missingCount} 份历史报告缺少轻量摘要，高频面板可能回退到较慢读取路径。`
      : "摘要索引覆盖完整，高频健康面板可以走轻量读取路径。",
    nextAction: missingCount ? "在配置中心执行报告摘要索引补齐，避免列表面板反复解析完整 FactPackage。" : undefined
  };
}

function buildLatestReportCheck(latestAt: string | undefined, ageMinutes: number | undefined): ProjectHealthCheck {
  if (!latestAt || ageMinutes === undefined) {
    return {
      key: "latest-report",
      label: "最新正式分析",
      level: "risk",
      value: "暂无",
      detail: "系统还没有可展示的正式分析报告，主线、选股和追踪都缺少最新事实包。",
      nextAction: "先运行一次今日分析，并确认数据源质量门没有拦截。"
    };
  }
  const level: ProjectHealthLevel = ageMinutes > 36 * 60 ? "risk" : ageMinutes > 6 * 60 ? "degraded" : "healthy";
  return {
    key: "latest-report",
    label: "最新正式分析",
    level,
    value: formatAge(ageMinutes),
    detail: `最近报告时间：${latestAt}。${level === "healthy" ? "可作为当前研究入口。" : "时间偏旧，盘面判断需要重新刷新。"}`,
    nextAction: level === "healthy" ? undefined : "运行今日分析或等待自动调度生成新的有效报告。"
  };
}

function buildDataSourceCheck(status: string, label: string, summary: string): ProjectHealthCheck {
  const level: ProjectHealthLevel = status === "healthy" ? "healthy" : status === "empty" || status === "risk" ? "risk" : "degraded";
  return {
    key: "data-source",
    label: "数据源可行动性",
    level,
    value: label,
    detail: summary,
    nextAction: level === "healthy" ? undefined : "打开数据源状态面板，优先排查行情、涨跌停池、全 A 宽度和候选股快照。"
  };
}

function buildModelCheck(
  enabled: boolean,
  callCount: number,
  failedOrRejected: number,
  retryCount: number,
  recentCalls: Array<{ status: string; requestCount?: number; retryCount?: number; errors?: string[] }>
): ProjectHealthCheck {
  if (!enabled) {
    return {
      key: "model",
      label: "大模型调用",
      level: "idle",
      value: "未启用",
      detail: "模型关闭时系统只运行硬规则，不会生成结构化研判和 Agent 复核。",
      nextAction: "需要模型研判时，在模型配置中启用服务并测试连接。"
    };
  }
  const activeRecentCalls = recentCalls.filter((call) => call.status !== "disabled" && call.status !== "skipped").slice(0, 3);
  const latestCall = activeRecentCalls[0];
  const recentFailedCount = activeRecentCalls.filter((call) => call.status === "failed" || call.status === "rejected").length;
  const recentRepairCount = activeRecentCalls.filter((call) => (call.requestCount ?? 1) > 1 || (call.retryCount ?? 0) > 0).length;
  const latestFailed = latestCall?.status === "failed" || latestCall?.status === "rejected";
  const latestSucceededWithRepair = latestCall?.status === "success" && ((latestCall.requestCount ?? 1) > 1 || (latestCall.retryCount ?? 0) > 0);
  const level: ProjectHealthLevel =
    latestFailed || recentFailedCount >= 2 ? "risk" :
    failedOrRejected || retryCount >= 3 || recentRepairCount || latestSucceededWithRepair ? "degraded" :
    "healthy";
  const detail =
    latestFailed
      ? "最近一次模型调用仍被失败或校验拦截，需要先处理当前输出质量。"
      : recentFailedCount >= 2
        ? `最近 ${activeRecentCalls.length} 次调用中有 ${recentFailedCount} 次失败或拦截，需要暂停扩大模型调用。`
        : latestSucceededWithRepair
          ? "最近一次模型调用已成功，但触发过修复重试，说明输出结构仍需继续收敛。"
          : retryCount
            ? `7 天内存在 ${retryCount} 次历史修复或重试；若最新调用持续成功，可视为历史债务，继续观察即可。`
            : "最近模型调用质量稳定，未观察到明显重试压力。";
  return {
    key: "model",
    label: "大模型调用",
    level,
    value: `7日 ${callCount} 次 / 失败拦截 ${failedOrRejected}`,
    detail,
    nextAction: level === "healthy" ? undefined : "查看模型质量面板，优先确认最近一次错误类型；历史 evidenceRefs 错误已通过白名单约束收敛，下一次分析后再观察是否复发。"
  };
}

function buildSchedulerCheck(enabled: boolean, failureCount: number, latestStartedAt?: string): ProjectHealthCheck {
  if (!enabled) {
    return {
      key: "scheduler",
      label: "自动分析调度",
      level: "idle",
      value: "未开启",
      detail: "当前不会自动积累盘前、盘中和收盘过程数据，需要手动运行分析。",
      nextAction: "如果要形成连续复盘样本，在自动分析配置中开启调度并设置关键时间点。"
    };
  }
  const level: ProjectHealthLevel = failureCount >= 3 ? "risk" : failureCount ? "degraded" : "healthy";
  return {
    key: "scheduler",
    label: "自动分析调度",
    level,
    value: latestStartedAt ? `最近 ${latestStartedAt}` : "等待运行",
    detail: failureCount ? `最近调度记录中有 ${failureCount} 次失败，需要确认数据源或脚本状态。` : "调度已开启，最近未发现集中失败。",
    nextAction: failureCount ? "查看自动分析运行记录，确认失败是否来自数据源、质量门或模型调用。" : undefined
  };
}

function buildTrackingCheck(activeCount: number, latestSnapshotAt?: string | null): ProjectHealthCheck {
  if (!activeCount) {
    return {
      key: "tracking",
      label: "个股追踪闭环",
      level: "idle",
      value: "暂无活跃追踪",
      detail: "当前没有活跃观察对象，无法验证主线候选或选股策略后续表现。",
      nextAction: "从候选股、选股结果或瓶颈研究中加入少量观察标的，建立后验验证样本。"
    };
  }
  const age = latestSnapshotAt ? minutesBetween(latestSnapshotAt, new Date().toISOString()) : undefined;
  const level: ProjectHealthLevel = age === undefined ? "degraded" : age > 24 * 60 ? "risk" : age > 6 * 60 ? "degraded" : "healthy";
  return {
    key: "tracking",
    label: "个股追踪闭环",
    level,
    value: `${activeCount} 只活跃`,
    detail: latestSnapshotAt ? `最近追踪快照：${latestSnapshotAt}，距今 ${formatAge(age ?? 0)}。` : "还没有追踪快照，收益验证暂不可用。",
    nextAction: level === "healthy" ? undefined : "刷新个股追踪快照，确认加入观察后的涨跌和失效条件是否更新。"
  };
}

function buildSelectionCheck(
  count: number,
  latestAt?: string | null,
  latestRun?: ReturnType<typeof listSelectionRunSummaries>[number]
): ProjectHealthCheck {
  if (!count || !latestRun) {
    return {
      key: "selection",
      label: "策略选股运行",
      level: "idle",
      value: "暂无运行",
      detail: "六策略框架已存在，但还需要持续运行形成可回测样本。",
      nextAction: "先跑主力吸筹、突破、价值稳健等规则模式，再逐步接入 Agent 复核。"
    };
  }

  const insight = buildSelectionSummaryInsight(latestRun);
  const warningSummary = latestRun.warningSummary;
  const hasRiskWarnings = (warningSummary?.riskCount ?? 0) > 0;
  const hasWarningDowngrade = (warningSummary?.warningCount ?? 0) > 0;
  const allReferenceOnly =
    insight.actionabilityStats.total > 0 &&
    insight.actionabilityStats.actionable === 0 &&
    insight.actionabilityStats.referenceOnly + insight.actionabilityStats.notActionable >= insight.actionabilityStats.total;
  const agentSkipped =
    latestRun.mode === "agent" &&
    /跳过|skipped|未启用|disabled/i.test(`${warningSummary?.primaryWarning ?? ""} ${latestRun.warnings.join(" ")}`);
  const level: ProjectHealthLevel =
    latestRun.status === "failed" || hasRiskWarnings ? "risk" :
    allReferenceOnly || hasWarningDowngrade || agentSkipped ? "degraded" :
    "healthy";
  const modeLabel = latestRun.mode === "agent" ? "Agent" : "规则";
  const warningText = warningSummary?.primaryWarning ? `主提示：${warningSummary.primaryWarning}` : "没有关键告警。";
  const actionabilityText = insight.actionabilityStats.summary;
  return {
    key: "selection",
    label: "策略选股运行",
    level,
    value: `${count} 次运行 / 最新 ${modeLabel} / 入选 ${latestRun.pickCount}`,
    detail: `最近选股运行：${latestAt ?? latestRun.startedAt}。${actionabilityText}${warningText}`,
    nextAction:
      latestRun.status === "failed"
        ? "打开选股运行历史查看失败原因，确认候选池刷新、数据源和后台任务状态。"
        : hasRiskWarnings
          ? "打开最新选股详情，优先处理高风险告警后再使用结果。"
          : allReferenceOnly
            ? "当前选股结果更适合研究和加入观察池；等进入连续竞价或刷新今日分析后再判断是否可行动。"
            : hasWarningDowngrade
              ? "查看最新选股的主提示和数据依据，确认是否只是研究降级还是影响候选有效性。"
              : undefined
  };
}

function buildSerenityCheck(count: number, latestAt?: string | null): ProjectHealthCheck {
  const level: ProjectHealthLevel = count ? "healthy" : "idle";
  return {
    key: "serenity",
    label: "瓶颈研究样本",
    level,
    value: count ? `${count} 次研究` : "暂无研究",
    detail: latestAt ? `最近瓶颈研究：${latestAt}。` : "还没有形成 Serenity 产业链瓶颈研究样本。",
    nextAction: count ? undefined : "从主线或手动主题生成一次 A 股瓶颈研究，沉淀证据任务和候选公司。"
  };
}

function readTrackingStats() {
  const active = dbGet<{ count: number }>(
    "select count(*) as count from stock_tracking_items where status = 'active'",
    undefined,
    { label: "project_health.tracking.active" }
  );
  const latest = dbGet<{ latestAt: string | null }>(
    "select max(createdAt) as latestAt from stock_tracking_snapshots",
    undefined,
    { label: "project_health.tracking.latest_snapshot" }
  );
  return {
    activeCount: active?.count ?? 0,
    latestSnapshotAt: latest?.latestAt ?? null
  };
}

function readRunStats(table: "selection_runs" | "serenity_research_runs", timeColumn: "startedAt" | "createdAt") {
  const row = dbGet<{ count: number; latestAt: string | null }>(
    `select count(*) as count, max(${timeColumn}) as latestAt from ${table}`,
    undefined,
    { label: `project_health.${table}` }
  );
  return {
    count: row?.count ?? 0,
    latestAt: row?.latestAt ?? null
  };
}

function inferOverallLevel(checks: ProjectHealthCheck[]): ProjectHealthLevel {
  if (checks.some((check) => check.level === "risk")) return "risk";
  if (checks.some((check) => check.level === "degraded")) return "degraded";
  if (checks.some((check) => check.level === "healthy")) return "healthy";
  return "idle";
}

function buildOverallSummary(level: ProjectHealthLevel, checks: ProjectHealthCheck[]) {
  const riskCount = checks.filter((check) => check.level === "risk").length;
  const degradedCount = checks.filter((check) => check.level === "degraded").length;
  const idleCount = checks.filter((check) => check.level === "idle").length;
  if (level === "risk") return `系统存在 ${riskCount} 个高风险运行点，需要先处理数据、报告或调度问题。`;
  if (level === "degraded") return `系统可用但有 ${degradedCount} 个降级点，结论使用前要看证据链和新鲜度。`;
  if (level === "idle") return `核心服务大多处于待运行状态，建议先生成报告并建立追踪样本。`;
  return idleCount ? `核心链路健康，另有 ${idleCount} 个模块尚未开始沉淀样本。` : "核心链路健康，可继续推进策略与研究功能。";
}

function levelLabel(level: ProjectHealthLevel) {
  if (level === "healthy") return "健康";
  if (level === "degraded") return "降级可用";
  if (level === "risk") return "需要处理";
  return "待运行";
}

function minutesBetween(fromIso: string, toIso: string) {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return undefined;
  return Math.max(0, Math.round((to - from) / 60_000));
}

function formatAge(minutes: number) {
  if (minutes < 60) return `${minutes} 分钟`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} 小时`;
  return `${Math.round(minutes / 1440)} 天`;
}

function stringOrUndefined(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}
