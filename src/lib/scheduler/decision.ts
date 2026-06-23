import { inferMarketSessionContext } from "@/lib/market/session";
import type { SchedulerSettings } from "@/lib/types";

export type SchedulerJobMode = "auto" | "scan" | "keypoint" | "deep-research";

export interface SchedulerJobDecision {
  shouldRun: boolean;
  jobType: SchedulerJobMode | "skip";
  useLLM: boolean;
  pushNotification: boolean;
  llmOnEvent: boolean;
  auctionWatchlistPush: boolean;
  riskWarningPush: boolean;
  reason: string;
}

const CN_TIME_ZONE = "Asia/Shanghai";

export function decideSchedulerJob(mode: SchedulerJobMode, settings: SchedulerSettings, now = new Date()): SchedulerJobDecision {
  if (mode === "scan") {
    return {
      shouldRun: true,
      jobType: "scan",
      useLLM: false,
      pushNotification: false,
      llmOnEvent: settings.llmOnEvent,
      auctionWatchlistPush: false,
      riskWarningPush: false,
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
      auctionWatchlistPush: settings.pushNotification && settings.auctionWatchlistPushEnabled,
      riskWarningPush: settings.pushNotification && settings.riskWarningPushEnabled,
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
      auctionWatchlistPush: false,
      riskWarningPush: false,
      reason: "夜间研究：生成深度复盘，不主动推送。"
    };
  }

  return decideAutoSchedulerJob(now, settings);
}

export function decideAutoSchedulerJob(now: Date, settings: SchedulerSettings): SchedulerJobDecision {
  if (!settings.enabled) {
    return {
      shouldRun: false,
      jobType: "skip",
      useLLM: false,
      pushNotification: false,
      llmOnEvent: settings.llmOnEvent,
      auctionWatchlistPush: false,
      riskWarningPush: false,
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
        auctionWatchlistPush: false,
        riskWarningPush: false,
        reason: "非交易日跳过盘中/关键时点自动分析，仅保留夜间研究。"
      };
    }
    return {
      shouldRun: true,
      jobType: deepResearch ? "deep-research" : "keypoint",
      useLLM: true,
      pushNotification: !deepResearch && settings.pushNotification,
      llmOnEvent: settings.llmOnEvent,
      auctionWatchlistPush: !deepResearch && settings.pushNotification && settings.auctionWatchlistPushEnabled,
      riskWarningPush: !deepResearch && settings.pushNotification && settings.riskWarningPushEnabled,
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
      auctionWatchlistPush: false,
      riskWarningPush: false,
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
      auctionWatchlistPush: false,
      riskWarningPush: false,
      reason: `盘中${settings.intradayIntervalMinutes}分钟轻量扫描：只积累过程快照。`
    };
  }

  return {
    shouldRun: false,
    jobType: "skip",
    useLLM: false,
    pushNotification: false,
    llmOnEvent: settings.llmOnEvent,
    auctionWatchlistPush: false,
    riskWarningPush: false,
    reason: "当前不在自动分析时间窗。"
  };
}

export function cnDateKey(date: Date) {
  const parts = cnParts(date);
  return `${parts.year}${String(parts.month).padStart(2, "0")}${String(parts.day).padStart(2, "0")}`;
}

export function cnMinuteKey(date: Date) {
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
