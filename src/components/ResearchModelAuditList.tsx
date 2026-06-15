"use client";

import type { AuditSummary } from "@/components/ResearchModelAuditCommon";
import { auditStatusClass, formatDateTime, summarizeAuditCategories } from "@/components/ResearchModelAuditCommon";

export function ModelAuditList({
  feedback,
  selectedId,
  onSelect
}: {
  feedback: AuditSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mt-4 max-h-[720px] space-y-2 overflow-y-auto pr-1">
      {feedback.map((item) => (
        <button
          key={item.id}
          className={`w-full rounded-lg border p-3 text-left text-sm ${selectedId === item.id ? "border-info/50 bg-info/10" : "border-line bg-bg/60 hover:bg-white/[0.035]"}`}
          type="button"
          onClick={() => onSelect(item.id)}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">{formatDateTime(item.createdAt)}</span>
            <span className={`rounded border px-2 py-0.5 text-[11px] ${auditStatusClass(item.status)}`}>{item.status}</span>
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">{item.summary}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {summarizeAuditCategories(item).map((label) => (
              <span key={label} className="rounded border border-line px-2 py-0.5 text-[11px] text-muted">{label}</span>
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}
