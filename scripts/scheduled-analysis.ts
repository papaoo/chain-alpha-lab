import { runFullAnalysis, runModelAnalysisFromReport } from "../src/lib/analysis/service";
import { createSchedulerRun, finishSchedulerRun } from "../src/lib/db/incremental";
import { getSchedulerSettings } from "../src/lib/db/settings";
import { sendAuctionWatchlistNotification, sendRiskWarningNotification } from "../src/lib/notifications/service";
import { cnDateKey, cnMinuteKey, decideSchedulerJob, type SchedulerJobDecision, type SchedulerJobMode } from "../src/lib/scheduler/decision";
import { pathToFileURL } from "node:url";

const DAEMON_INTERVAL_MS = 60_000;
const executedSlots = new Set<string>();
let running = false;

async function main() {
  const args = new Set(process.argv.slice(2));
  const daemon = args.has("--daemon");
  const dryRun = args.has("--dry-run");
  const mode = parseMode(process.argv.find((arg) => arg.startsWith("--mode="))?.split("=")[1]);

  if (daemon) {
    console.log("A股主线趋势助手定时分析守护进程已启动。");
    await runAutoOnce();
    setInterval(() => {
      void runAutoOnce();
    }, DAEMON_INTERVAL_MS);
    return;
  }

  const decision = decideSchedulerJob(mode, getSchedulerSettings());
  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, mode, decision }, null, 2));
    return;
  }
  if (!decision.shouldRun) {
    console.log(`跳过：${decision.reason}`);
    return;
  }
  await runDecision(decision);
}

async function runAutoOnce() {
  const decision = decideSchedulerJob("auto", getSchedulerSettings());
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

async function runDecision(decision: SchedulerJobDecision) {
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
    let auctionWatchlistDeliveries = 0;
    let riskWarningDeliveries = 0;
    if (!decision.useLLM && eventCount > 0 && decision.llmOnEvent) {
      const triggered = await runModelAnalysisFromReport(result.reportId, {
        pushNotification: decision.pushNotification
      });
      eventTriggeredReportId = triggered.reportId;
    }
    if (decision.auctionWatchlistPush) {
      const deliveries = await sendAuctionWatchlistNotification({ limit: 80, itemLimit: 8 });
      auctionWatchlistDeliveries = deliveries.filter((item) => item.ok).length;
    }
    if (decision.riskWarningPush) {
      const deliveries = await sendRiskWarningNotification({ minLevel: "high", itemLimit: 6 });
      riskWarningDeliveries = deliveries.filter((item) => item.ok).length;
    }
    finishSchedulerRun(runId, {
      status: "success",
      finishedAt: new Date().toISOString(),
      reportId: eventTriggeredReportId ?? result.reportId,
      eventCount,
      message: `${decision.reason}；报告 ${result.reportId}；事件 ${eventCount} 个${eventTriggeredReportId ? `；已触发模型报告 ${eventTriggeredReportId}` : ""}${decision.auctionWatchlistPush ? `；观察池推送成功 ${auctionWatchlistDeliveries} 个通道` : ""}${decision.riskWarningPush ? `；风险预警推送成功 ${riskWarningDeliveries} 个通道` : ""}。`,
      rawJson: {
        reportId: result.reportId,
        eventTriggeredReportId,
        eventCount,
        modelAuditStatus: result.modelAuditStatus,
        auctionWatchlistPush: decision.auctionWatchlistPush,
        auctionWatchlistDeliveries,
        riskWarningPush: decision.riskWarningPush,
        riskWarningDeliveries
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

function parseMode(value?: string): SchedulerJobMode {
  if (value === "scan" || value === "keypoint" || value === "deep-research") return value;
  return "auto";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  });
}
