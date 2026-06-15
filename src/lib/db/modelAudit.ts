import crypto from "node:crypto";
import { dbAll, dbGet, dbRun, dbTransaction } from "@/lib/db/client";
import type { ModelAuditFeedback, ModelAuditFeedbackEvent, ModelAuditStatus, StoredModelAuditFeedback } from "@/lib/types";

type AuditRow = {
  id: string;
  reportId: string;
  summary: string;
  feedbackJson: string;
  status: ModelAuditStatus;
  itemCount: number | null;
  highPriorityCount: number | null;
  categorySummaryJson: string | null;
  createdAt: string;
  updatedAt: string;
};

type AuditEventRow = ModelAuditFeedbackEvent;

export interface ModelAuditFeedbackSummary {
  id: string;
  reportId: string;
  summary: string;
  status: ModelAuditStatus;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  highPriorityCount: number;
  categoryCounts: Array<{ category: string; count: number }>;
}

export function saveModelAuditFeedback(input: { reportId: string; feedback: ModelAuditFeedback; createdAt?: string }) {
  const id = crypto.randomUUID();
  const now = input.createdAt ?? new Date().toISOString();
  const summary = summarizeFeedback(input.feedback);
  dbTransaction("model_audit_feedback.save", () => {
    dbRun(
      `insert into model_audit_feedback
         (id, reportId, summary, feedbackJson, status, itemCount, highPriorityCount, categorySummaryJson, createdAt, updatedAt)
         values (@id, @reportId, @summary, @feedbackJson, @status, @itemCount, @highPriorityCount, @categorySummaryJson, @createdAt, @updatedAt)`,
      {
        id,
        reportId: input.reportId,
        summary: input.feedback.summary,
        feedbackJson: JSON.stringify(input.feedback),
        status: "待评估",
        itemCount: summary.itemCount,
        highPriorityCount: summary.highPriorityCount,
        categorySummaryJson: JSON.stringify(summary.categoryCounts),
        createdAt: now,
        updatedAt: now
      },
      { label: "model_audit_feedback.insert" }
    );
    insertEvent(id, "created", null, "待评估", "DeepSeek 生成系统反馈，等待人工评估。", now);
  });
  return id;
}

export function listModelAuditFeedbackSummaries(limit = 30, offset = 0): ModelAuditFeedbackSummary[] {
  const rows = dbAll<Omit<AuditRow, "feedbackJson">>(
    `select id, reportId, summary, status, itemCount, highPriorityCount, categorySummaryJson, createdAt, updatedAt
       from model_audit_feedback
       order by createdAt desc
       limit ? offset ?`,
    [limit, offset],
    { label: "model_audit_feedback.list_summary" }
  );
  return rows.map(rowToSummary);
}

export function listModelAuditFeedback(limit = 30, offset = 0): StoredModelAuditFeedback[] {
  const rows = dbAll<AuditRow>(
    `select *
       from model_audit_feedback
       order by createdAt desc
       limit ? offset ?`,
    [limit, offset],
    { label: "model_audit_feedback.list" }
  );
  return rows.map(rowToFeedback);
}

export function getModelAuditFeedback(id: string): StoredModelAuditFeedback | null {
  const row = dbGet<AuditRow>(
    `select * from model_audit_feedback where id = ?`,
    [id],
    { label: "model_audit_feedback.get" }
  );
  return row ? rowToFeedback(row) : null;
}

export function updateModelAuditFeedbackStatus(id: string, status: ModelAuditStatus): StoredModelAuditFeedback | null {
  const updatedAt = new Date().toISOString();
  const row = dbGet<Pick<AuditRow, "status">>(
    `select status from model_audit_feedback where id = ?`,
    [id],
    { label: "model_audit_feedback.get_status" }
  );
  if (!row) return null;
  if (row.status === status) return getModelAuditFeedback(id);
  dbTransaction("model_audit_feedback.update_status", () => {
    dbRun(
      `update model_audit_feedback set status = ?, updatedAt = ? where id = ?`,
      [status, updatedAt, id],
      { label: "model_audit_feedback.update_status" }
    );
    insertEvent(id, "status_changed", row.status, status, `人工将反馈状态从${row.status}标记为${status}。`, updatedAt);
  });
  return getModelAuditFeedback(id);
}

function rowToSummary(row: Omit<AuditRow, "feedbackJson">): ModelAuditFeedbackSummary {
  return {
    id: row.id,
    reportId: row.reportId,
    summary: row.summary,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    itemCount: row.itemCount ?? 0,
    highPriorityCount: row.highPriorityCount ?? 0,
    categoryCounts: safeJson<Array<{ category: string; count: number }>>(row.categorySummaryJson ?? "[]", [])
  };
}

function rowToFeedback(row: AuditRow): StoredModelAuditFeedback {
  const events = readEvents(row);
  return {
    id: row.id,
    reportId: row.reportId,
    summary: row.summary,
    feedback: JSON.parse(row.feedbackJson) as ModelAuditFeedback,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    events
  };
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function summarizeFeedback(feedback: ModelAuditFeedback) {
  const categoryMap = new Map<string, number>();
  for (const item of feedback.items) {
    categoryMap.set(item.category, (categoryMap.get(item.category) ?? 0) + 1);
  }
  return {
    itemCount: feedback.items.length,
    highPriorityCount: feedback.items.filter((item) => item.priority === "高").length,
    categoryCounts: Array.from(categoryMap.entries()).map(([category, count]) => ({ category, count }))
  };
}

function insertEvent(
  feedbackId: string,
  eventType: ModelAuditFeedbackEvent["eventType"],
  fromStatus: ModelAuditStatus | null,
  toStatus: ModelAuditStatus,
  note: string,
  createdAt: string
) {
  dbRun(
    `insert into model_audit_feedback_events
       (id, feedbackId, eventType, fromStatus, toStatus, note, createdAt)
       values (@id, @feedbackId, @eventType, @fromStatus, @toStatus, @note, @createdAt)`,
    {
      id: crypto.randomUUID(),
      feedbackId,
      eventType,
      fromStatus,
      toStatus,
      note,
      createdAt
    },
    { label: "model_audit_feedback_events.insert" }
  );
}

function readEvents(row: AuditRow): ModelAuditFeedbackEvent[] {
  const events = dbAll<AuditEventRow>(
    `select id, feedbackId, eventType, fromStatus, toStatus, note, createdAt
       from model_audit_feedback_events
       where feedbackId = ?
       order by createdAt asc`,
    [row.id],
    { label: "model_audit_feedback_events.list_by_feedback" }
  );
  if (events.length) return events;
  return [{
    id: `${row.id}:created`,
    feedbackId: row.id,
    eventType: "created",
    fromStatus: null,
    toStatus: row.status,
    note: "历史反馈记录，创建时尚未启用处理轨迹。",
    createdAt: row.createdAt
  }];
}
