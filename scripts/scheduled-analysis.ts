import { runFullAnalysis, runModelAnalysisFromReport } from "../src/lib/analysis/service";
import { createSchedulerRun, finishSchedulerRun } from "../src/lib/db/incremental";
import { getSchedulerSettings } from "../src/lib/db/settings";
import { inferMarketSessionContext } from "../src/lib/market/session";
import type { SchedulerSettings } from "../src/lib/types";
import { pathToFileURL } from "node:url";

type JobMode = "auto" | "scan" | "keypoint" | "deep-research";

interface JobDecision {
  shouldRun: boolean;
  jobType: JobMode | "skip";
  useLLM: boolean;
  pushNotification: boolean;
  llmOnEvent: boolean;
  reason: string;
}

const CN_TIME_ZONE = "Asia/Shanghai";
const DAEMON_INTERVAL_MS = 60_000;
const executedSlots = new Set<string>();
let running = false;

async function main() {
  const args = new Set(process.argv.slice(2));
  const daemon = args.has("--daemon");
  const mode = parseMode(process.argv.find((arg) => arg.startsWith("--mode="))?.split("=")[1]);

  if (daemon) {
    console.log("A股主线趋势助手定时分析守护进程已启动。");
    await runAutoOnce();
    setInterval(() => {
      void runAutoOnce();
    }, DAEMON_INTERVAL_MS);
    return;
  }

  const decision = decideJob(mode, getSchedulerSettings());
  if (!decision.shouldRun) {
    console.log(`跳过：${decision.reason}`);
    return;
  }
  await runDecision(decision);
}

async function runAutoOnce() {
  const decision = decideJob("auto", getSchedulerSettings());
  if (!decision.shouldRun) return;
  const slot = `${cnDateKey(new Date())}-${decision.jobType}-${cnMinuteKey(new Date())}`;
  if (executedSlots.has(slot)) return;
  if (running) {
    console.log("上一轮定时分析尚未结束，跳过本轮。");
    return;
  }
  executedSlots.add(slot);
  running = true;
  await runDecision(decision).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
  }).finally(() => {
    running = false;
  });
}

async function runDecision(decision: JobDecision) {
  const startedAt = new Date().toISOString();
  const runId = createSchedulerRun({
    jobType: decision.jobType,
    startedAt,
    status: "running",
    useLLM: decision.useLLM,
    pushNotification: decision.pushNotification,
    message: decision.reason
  });

  try {
    const result = await runFullAnalysis({
      useLLM: decision.useLLM,
      pushNotification: decision.pushNotification
    });
    const eventCount = result.incrementalEvents?.length ?? 0;
    let eventTriggeredReportId: string | null = null;
    if (!decision.useLLM && eventCount > 0 && decision.llmOnEvent) {
      const triggered = await runModelAnalysisFromReport(result.reportId, {
        pushNotification: decision.pushNotification
      });
      eventTriggeredReportId = triggered.reportId;
    }
    finishSchedulerRun(runId, {
      status: "success",
      finishedAt: new Date().toISOString(),
      reportId: eventTriggeredReportId ?? result.reportId,
      eventCount,
      message: `${decision.reason}；报告 ${result.reportId}；事件 ${eventCount} 个${eventTriggeredReportId ? `；已触发模型报告 ${eventTriggeredReportId}` : ""}。`,
      rawJson: {
        reportId: result.reportId,
        eventTriggeredReportId,
        eventCount,
        modelAuditStatus: result.modelAuditStatus
      }
    });
    console.log(`完成：${decision.reason}`);
    console.log(`报告ID：${result.reportId}`);
    console.log(`增量事件：${eventCount}`);
  } catch (error) {
    finishSchedulerRun(runId, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
      rawJson: { error: error instanceof Error ? error.stack ?? error.message : String(error) }
    });
    throw error;
  }
}

function decideJob(mode: JobMode, settings: SchedulerSettings): JobDecision {
  if (mode === "scan") {
    return {
      shouldRun: true,
      jobType: "scan",
      useLLM: false,
      pushNotification: false,
      llmOnEvent: settings.llmOnEvent,
      reason: "轻量规则扫描：只写快照和事件，不调用模型。"
    };
  }
  if (mode === "keypoint") {
    return {
      shouldRun: true,
      jobType: "keypoint",
      useLLM: true,
      pushNotification: settings.pushNotification,
      llmOnEvent: settings.llmOnEvent,
      reason: "关键节点分析：生成模型增强报告。"
    };
  }
  if (mode === "deep-research") {
    return {
      shouldRun: true,
      jobType: "deep-research",
      useLLM: true,
      pushNotification: false,
      llmOnEvent: settings.llmOnEvent,
      reason: "夜间研究：生成深度复盘，不主动推送。"
    };
  }

  return decideAutoJob(new Date(), settings);
}

export function decideAutoJob(now: Date, settings: SchedulerSettings): JobDecision {
  if (!settings.enabled) {
    return {
      shouldRun: false,
      jobType: "skip",
      useLLM: false,
      pushNotification: false,
      llmOnEvent: settings.llmOnEvent,
      reason: "自动分析已关闭。"
    };
  }
  const minuteKey = cnMinuteKey(now);
  const session = inferMarketSessionContext(now.toISOString());
  const keypointLabels: Record<string, string> = {
    "08:50": "盘前计划",
    "09:26": "竞价结束快照",
    "11:35": "午间复盘",
    "14:50": "尾盘确认",
    "15:10": "收盘复盘",
    "20:30": "夜间研究"
  };
  if (settings.keypointTimes.includes(minuteKey) || settings.deepResearchTimes.includes(minuteKey)) {
    const deepResearch = settings.deepResearchTimes.includes(minuteKey);
    if (!session.isTradingDay && !deepResearch) {
      return {
        shouldRun: false,
        jobType: "skip",
        useLLM: false,
        pushNotification: false,
        llmOnEvent: settings.llmOnEvent,
        reason: "非交易日跳过盘中/关键时点自动分析，仅保留夜间研究。"
      };
    }
    return {
      shouldRun: true,
      jobType: deepResearch ? "deep-research" : "keypoint",
      useLLM: true,
      pushNotification: !deepResearch && settings.pushNotification,
      llmOnEvent: settings.llmOnEvent,
      reason: `${keypointLabels[minuteKey] ?? (deepResearch ? "夜间研究" : "关键节点")}：关键节点模型分析。`
    };
  }

  const parts = cnParts(now);
  const minuteOfDay = parts.hour * 60 + parts.minute;
  const inTradingWindow = (minuteOfDay >= 9 * 60 + 30 && minuteOfDay <= 11 * 60 + 30) ||
    (minuteOfDay >= 13 * 60 && minuteOfDay <= 14 * 60 + 55);
  if (!session.isTradingDay && inTradingWindow) {
    return {
      shouldRun: false,
      jobType: "skip",
      useLLM: false,
      pushNotification: false,
      llmOnEvent: settings.llmOnEvent,
      reason: "非交易日不执行盘中轻量扫描。"
    };
  }
  if (settings.intradayScanEnabled && inTradingWindow && parts.minute % settings.intradayIntervalMinutes === 0) {
    return {
      shouldRun: true,
      jobType: "scan",
      useLLM: false,
      pushNotification: false,
      llmOnEvent: settings.llmOnEvent,
      reason: `盘中${settings.intradayIntervalMinutes}分钟轻量扫描：只积累过程快照。`
    };
  }

  return {
    shouldRun: false,
    jobType: "skip",
    useLLM: false,
    pushNotification: false,
    llmOnEvent: settings.llmOnEvent,
    reason: "当前不在自动分析时间窗。"
  };
}

function parseMode(value?: string): JobMode {
  if (value === "scan" || value === "keypoint" || value === "deep-research") return value;
  return "auto";
}

function cnDateKey(date: Date) {
  const parts = cnParts(date);
  return `${parts.year}${String(parts.month).padStart(2, "0")}${String(parts.day).padStart(2, "0")}`;
}

function cnMinuteKey(date: Date) {
  const parts = cnParts(date);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function cnParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: CN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  });
}
