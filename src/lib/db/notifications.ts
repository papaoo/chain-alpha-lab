import crypto from "node:crypto";
import { maskSecret } from "@/lib/config";
import { dbAll, dbGet, dbRun } from "@/lib/db/client";
import type { NotificationChannel, NotificationChannelType } from "@/lib/types";

interface ChannelRow {
  id: string;
  type: NotificationChannelType;
  name: string;
  webhookUrl: string;
  enabled: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationChannelInput {
  type: NotificationChannelType;
  name: string;
  webhookUrl: string;
  enabled?: boolean;
}

export function listNotificationChannels(): NotificationChannel[] {
  const rows = dbAll<ChannelRow>(
    "select id, type, name, webhookUrl, enabled, createdAt, updatedAt from notification_channels order by createdAt desc",
    undefined,
    { label: "notification_channels.list" }
  );
  return rows.map(toPublicChannel);
}

export function listEnabledNotificationChannelRows(): ChannelRow[] {
  return dbAll<ChannelRow>(
    "select id, type, name, webhookUrl, enabled, createdAt, updatedAt from notification_channels where enabled = 1 order by createdAt desc",
    undefined,
    { label: "notification_channels.list_enabled" }
  );
}

export function getNotificationChannelRow(id: string): ChannelRow | null {
  const row = dbGet<ChannelRow>(
    "select id, type, name, webhookUrl, enabled, createdAt, updatedAt from notification_channels where id = ?",
    [id],
    { label: "notification_channels.get" }
  );
  return row ?? null;
}

export function saveNotificationChannel(input: NotificationChannelInput): NotificationChannel {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const row = {
    id,
    type: input.type,
    name: input.name.trim() || defaultChannelName(input.type),
    webhookUrl: input.webhookUrl.trim(),
    enabled: input.enabled === false ? 0 : 1,
    createdAt: now,
    updatedAt: now
  };
  dbRun(
    `insert into notification_channels (id, type, name, webhookUrl, enabled, createdAt, updatedAt)
       values (@id, @type, @name, @webhookUrl, @enabled, @createdAt, @updatedAt)`,
    row,
    { label: "notification_channels.insert" }
  );
  return toPublicChannel(row);
}

export function setNotificationChannelEnabled(id: string, enabled: boolean): NotificationChannel | null {
  const now = new Date().toISOString();
  dbRun(
    "update notification_channels set enabled = ?, updatedAt = ? where id = ?",
    [enabled ? 1 : 0, now, id],
    { label: "notification_channels.set_enabled" }
  );
  const row = getNotificationChannelRow(id);
  return row ? toPublicChannel(row) : null;
}

export function deleteNotificationChannel(id: string) {
  dbRun("delete from notification_channels where id = ?", [id], { label: "notification_channels.delete" });
}

function toPublicChannel(row: ChannelRow): NotificationChannel {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    webhookUrlMasked: maskWebhook(row.webhookUrl),
    enabled: Boolean(row.enabled),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function maskWebhook(value: string) {
  if (!value) return "";
  if (value.length <= 16) return maskSecret(value);
  return `${value.slice(0, 18)}...${value.slice(-6)}`;
}

function defaultChannelName(type: NotificationChannelType) {
  return type === "feishu" ? "飞书通知" : "企业微信通知";
}
