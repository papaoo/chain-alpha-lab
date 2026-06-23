import { getNotificationChannelRow, listEnabledNotificationChannelRows } from "@/lib/db/notifications";
import { buildAuctionWatchlistSnapshot } from "@/lib/db/auctionWatchlist";
import { getAnalysisReport, listAnalysisReports } from "@/lib/db/reports";
import { listTrackingItemsCached } from "@/lib/db/stockTrackingCache";
import { effectiveTradeDateForSession, inferMarketSessionContext } from "@/lib/market/session";
import { buildRiskAlerts, buildRiskSummary } from "@/lib/risk/warnings";
import type { AnalysisReport, NotificationDeliveryResult } from "@/lib/types";

interface SendInput {
  title: string;
  text: string;
}

export async function sendAnalysisNotification(report: Omit<AnalysisReport, "id"> & { id: string }): Promise<NotificationDeliveryResult[]> {
  const topSectors = report.factPackage.sectors.slice(0, 3).map((sector) => `${sector.name}/${sector.stage}`).join("、") || "暂无";
  const topCandidates = report.factPackage.candidates
    .slice(0, 3)
    .map((candidate) => `${candidate.name}：${candidate.action}，仓位上限${candidate.positionLimitPct}%`)
    .join("\n");
  return sendToEnabledChannels({
    title: "A股主线趋势助手分析完成",
    text: [
      `报告：${report.title}`,
      `摘要：${report.summary}`,
      `大盘：${marketStateLabel(report.factPackage.market.marketState)}，评分 ${report.factPackage.market.ruleScore}`,
      `主线：${topSectors}`,
      `候选：\n${topCandidates || "暂无候选"}`,
      `报告ID：${report.id}`,
      "本通知仅作交易辅助，不构成收益承诺。"
    ].join("\n")
  });
}

export async function sendAuctionWatchlistNotification(input: { limit?: number; itemLimit?: number } = {}): Promise<NotificationDeliveryResult[]> {
  const snapshot = buildAuctionWatchlistSnapshot(input.limit ?? 80, input.itemLimit ?? 8);
  const rows = snapshot.items
    .slice(0, 8)
    .map((item, index) => {
      const change = item.changePct !== undefined ? `${formatSigned(item.changePct)}%` : "涨跌缺失";
      const score = item.score !== undefined ? `${item.score}分` : "未评分";
      const firstCondition = item.preconditions[0] ? `；看点：${item.preconditions[0]}` : "";
      return `${index + 1}. ${item.name}(${item.code}) ${item.sectorName}/${item.sectorStage ?? "阶段未知"} ${change} ${score}${firstCondition}`;
    })
    .join("\n");
  return sendToEnabledChannels({
    title: "次日竞价观察池",
    text: [
      snapshot.summary.title,
      snapshot.summary.message,
      rows || "暂无次日竞价观察样本。",
      "纪律：这不是买入清单，只在竞价、开板承接、板块扩散和失效条件同时通过后，才允许重新评估。",
      `数据基准：最近 ${snapshot.reportCount} 份报告 / 最新报告 ${snapshot.latestReportAt ?? "未知"}`
    ].join("\n")
  });
}

export async function sendRiskWarningNotification(input: { minLevel?: "high" | "medium" | "low"; itemLimit?: number } = {}): Promise<NotificationDeliveryResult[]> {
  const message = buildRiskWarningNotificationMessage(input);
  if (!message.shouldSend) return [];
  return sendToEnabledChannels({
    title: message.title,
    text: message.text
  });
}

export function buildRiskWarningNotificationMessage(input: { minLevel?: "high" | "medium" | "low"; itemLimit?: number } = {}) {
  const latest = listAnalysisReports(1, 0, { displayableOnly: true })[0] ?? null;
  const report = latest ? getAnalysisReport(latest.id) : null;
  const tracking = listTrackingItemsCached("active");
  const timestamp = new Date().toISOString();
  const session = inferMarketSessionContext(timestamp);
  const alerts = buildRiskAlerts({
    report,
    session,
    trackingItems: tracking.data
  });
  const summary = buildRiskSummary({
    alerts,
    report,
    trackingItems: tracking.data,
    freshnessStatus: report?.factPackage.tradeDate === effectiveTradeDateForSession(timestamp, session) ? "current" : "unknown"
  });
  const minLevel = input.minLevel ?? "high";
  const filtered = alerts.filter((alert) => levelRank(alert.level) >= levelRank(minLevel));
  const itemLimit = Math.min(Math.max(Math.trunc(input.itemLimit ?? 6), 1), 12);
  const rows = filtered
    .slice(0, itemLimit)
    .map((alert, index) => `${index + 1}. [${riskLevelLabel(alert.level)}][${alert.scope}] ${alert.title}：${alert.action}`)
    .join("\n");
  const shouldSend = filtered.length > 0;
  return {
    shouldSend,
    title: `风险预警：高 ${summary.high} / 中 ${summary.medium}`,
    text: [
      `时间：${formatCnDateTime(timestamp)}`,
      `交易状态：${session.phaseLabel}，${session.isTradingSession ? "盘中" : "非盘中/参考模式"}`,
      `报告：${report?.title ?? "暂无可用报告"}`,
      `风险汇总：高 ${summary.high}，中 ${summary.medium}，低 ${summary.low}；追踪 ${summary.trackingActive}，数据提示 ${summary.dataWarnings}`,
      rows || `没有达到 ${riskLevelLabel(minLevel)} 以上的风险项。`,
      "边界：本通知只汇总规则、报告、追踪与数据源风险，不构成买卖建议。"
    ].join("\n"),
    summary,
    alertCount: filtered.length,
    reportId: report?.id ?? null
  };
}

export async function sendTestNotification(channelId: string): Promise<NotificationDeliveryResult> {
  const channel = getNotificationChannelRow(channelId);
  if (!channel) {
    return { channelId, channelName: "未知渠道", ok: false, error: "通知渠道不存在" };
  }
  return sendToChannel(channel, {
    title: "A股主线趋势助手测试通知",
    text: "这是一条测试通知。若你收到此消息，说明 Webhook 配置可用。"
  });
}

async function sendToEnabledChannels(input: SendInput): Promise<NotificationDeliveryResult[]> {
  const channels = listEnabledNotificationChannelRows();
  return Promise.all(channels.map((channel) => sendToChannel(channel, input)));
}

async function sendToChannel(
  channel: ReturnType<typeof listEnabledNotificationChannelRows>[number],
  input: SendInput
): Promise<NotificationDeliveryResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(channel.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildWebhookPayload(channel.type, input)),
      signal: controller.signal
    });
    const body = await response.text().catch(() => "");
    return {
      channelId: channel.id,
      channelName: channel.name,
      ok: response.ok,
      status: response.status,
      error: response.ok ? undefined : body.slice(0, 300) || `HTTP ${response.status}`
    };
  } catch (error) {
    return {
      channelId: channel.id,
      channelName: channel.name,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildWebhookPayload(type: string, input: SendInput) {
  if (type === "wecom") {
    return {
      msgtype: "text",
      text: {
        content: `${input.title}\n${input.text}`
      }
    };
  }
  return {
    msg_type: "text",
    content: {
      text: `${input.title}\n${input.text}`
    }
  };
}

function marketStateLabel(state: string) {
  if (state === "tradable") return "可交易";
  if (state === "cautious") return "谨慎交易";
  if (state === "defensive") return "防守观望";
  return state;
}

function formatSigned(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function levelRank(level: "high" | "medium" | "low") {
  if (level === "high") return 3;
  if (level === "medium") return 2;
  return 1;
}

function riskLevelLabel(level: "high" | "medium" | "low") {
  if (level === "high") return "高";
  if (level === "medium") return "中";
  return "低";
}

function formatCnDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
