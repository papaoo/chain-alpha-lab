import { getNotificationChannelRow, listEnabledNotificationChannelRows } from "@/lib/db/notifications";
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
