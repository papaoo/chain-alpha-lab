"use client";

import { BrainCircuit } from "lucide-react";
import type { ModelAuditStatus } from "@/lib/types";
import type { AuditDetail } from "@/components/ResearchModelAuditCommon";
import {
  PlanLine,
  SectionTitle,
  auditCategoryClass,
  auditPriorityClass,
  auditStatusClass,
  formatDateTime,
  formatFactId
} from "@/components/ResearchModelAuditCommon";

const AUDIT_STATUSES: ModelAuditStatus[] = ["待评估", "已采纳", "已拒绝", "已实现"];

export function ModelAuditDetail({
  selected,
  statusMessage,
  onUpdateStatus,
  onCopy
}: {
  selected: AuditDetail | null;
  statusMessage: string;
  onUpdateStatus: (status: ModelAuditStatus) => void;
  onCopy: () => void;
}) {
  if (!selected) return null;

  return (
    <>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <SectionTitle icon={BrainCircuit} title="模型审计详情" meta={`关联报告 ${selected.reportId}`} />
        <div className="flex flex-wrap gap-2">
          {AUDIT_STATUSES.map((status) => (
            <button
              key={status}
              className={`rounded-lg border px-3 py-2 text-xs ${selected.status === status ? "border-info/50 bg-info/10 text-info" : "border-line bg-bg/60 text-muted"}`}
              type="button"
              onClick={() => onUpdateStatus(status)}
            >
              {status}
            </button>
          ))}
          <button className="rounded-lg border border-up/40 bg-up/10 px-3 py-2 text-xs text-up" type="button" onClick={onCopy}>
            复制给 Codex
          </button>
        </div>
      </div>

      <p className="mt-4 text-lg font-semibold leading-7">{selected.feedback.summary}</p>
      {statusMessage ? <p className="mt-3 rounded-lg border border-info/30 bg-info/10 p-3 text-sm text-info">{statusMessage}</p> : null}

      <div className="mt-4 rounded-lg border border-line/80 bg-bg/45 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">处理轨迹</p>
          <span className="text-xs text-muted">{selected.events.length} 条记录</span>
        </div>
        <div className="mt-3 grid gap-2">
          {selected.events.map((event) => (
            <div key={event.id} className="grid gap-1 rounded border border-line/70 bg-panel/55 p-3 text-xs sm:grid-cols-[150px_1fr]">
              <span className="text-muted">{formatDateTime(event.createdAt)}</span>
              <span className="leading-5">
                <span className={`mr-2 rounded border px-2 py-0.5 ${auditStatusClass(event.toStatus)}`}>{event.toStatus}</span>
                {event.note}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {selected.feedback.items.map((item, index) => (
          <div key={`${item.category}-${item.title}-${index}`} className="rounded-lg border border-line bg-bg/55 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded border px-2 py-1 text-xs ${auditCategoryClass(item.category)}`}>{item.category}</span>
              <span className={`rounded border px-2 py-1 text-xs ${auditPriorityClass(item.priority)}`}>{item.priority}优先级</span>
              <p className="font-medium">{item.title}</p>
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-3">
              <PlanLine label="问题" value={item.issue} />
              <PlanLine label="影响" value={item.impact} tone={item.priority === "高" ? "warn" : "normal"} />
              <PlanLine label="建议" value={item.suggestion} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.evidenceRefs.map((ref) => (
                <span key={ref} className="rounded border border-info/30 bg-info/10 px-2 py-1 text-[11px] text-info">{formatFactId(ref)}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {selected.feedback.doNotChange.length ? (
        <div className="mt-5 rounded-lg border border-warn/30 bg-warn/10 p-4">
          <p className="font-medium text-warn">不建议轻易改动</p>
          <div className="mt-3 space-y-2">
            {selected.feedback.doNotChange.map((item, index) => (
              <p key={`${item.reason}-${index}`} className="text-sm leading-6 text-warn">{item.reason}</p>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
