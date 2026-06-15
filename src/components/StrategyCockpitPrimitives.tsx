"use client";

import { useState } from "react";
import type React from "react";
import { ChevronDown, Gauge } from "lucide-react";
import type { SentimentItem, Tone } from "@/components/StrategyCockpitTypes";
import { sentimentBoxClass, toneBadge, toneBorder, toneText } from "@/components/StrategyCockpitUtils";

export const toolbarButtonClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 transition hover:border-cyan-400/60 hover:text-cyan-200";

export function Panel({
  title,
  icon: Icon,
  action,
  children,
  collapsible = false,
  defaultOpen = true,
  summary,
  testId
}: {
  title: string;
  icon: typeof Gauge;
  action?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  summary?: React.ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section data-testid={testId} className="rounded-2xl border border-slate-800 bg-slate-900/62 p-4 shadow-[0_22px_80px_rgba(2,6,23,0.34)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon size={17} className="text-cyan-200" />
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {action}
          {collapsible ? (
            <button type="button" className={toolbarButtonClass} onClick={() => setOpen((value) => !value)}>
              <ChevronDown className={open ? "rotate-180 transition" : "transition"} size={14} />
              {open ? "收起" : "展开"}
            </button>
          ) : null}
        </div>
      </div>
      {summary ? <div className="mt-4">{summary}</div> : null}
      {open ? <div className={summary ? "mt-4 border-t border-slate-800 pt-4" : "mt-4"}>{children}</div> : null}
    </section>
  );
}

export function MetricTile({ label, value, compact, tone = "info" }: { label: string; value: string; compact?: boolean; tone?: Tone }) {
  return (
    <div className={`rounded-xl border ${toneBorder(tone)} bg-slate-950/58 ${compact ? "p-3" : "p-4"}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`${compact ? "mt-1 text-lg" : "mt-2 text-2xl"} font-semibold ${toneText(tone)}`}>{value}</p>
    </div>
  );
}

export function HoverMetric({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: Tone }) {
  return (
    <div className="group relative rounded-xl border border-slate-800 bg-slate-950/58 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${toneText(tone)}`}>{value}</p>
      <div className="pointer-events-none absolute left-3 top-[calc(100%+8px)] z-20 hidden w-64 rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs leading-5 text-slate-300 shadow-2xl group-hover:block">
        {hint}
      </div>
    </div>
  );
}

export function StatusBadge({ icon: Icon, label, tone }: { icon: typeof Gauge; label: string; tone: Tone }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${toneBadge(tone)}`}>
      <Icon size={16} />
      {label}
    </span>
  );
}

export function StrategyCard({ title, status, body }: { title: string; status: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/58 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-slate-100">{title}</p>
        <span className="text-xs text-cyan-200">{status}</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-400">{body}</p>
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/58 px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-slate-200">{value}</span>
    </div>
  );
}

export function MiniStat({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className={`rounded-xl border p-3 ${sentimentBoxClass(tone)}`}>
      <p className="text-[11px] opacity-75">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

export function MiniTooltipStat({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`mt-0.5 truncate font-semibold ${toneText(tone)}`}>{value}</p>
    </div>
  );
}

export function EvidencePill({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${sentimentBoxClass(tone)}`}>
      <p className="opacity-75">{label}</p>
      <p className="mt-0.5 font-semibold">{value}</p>
    </div>
  );
}

export function SentimentChip({ label, status, tone }: SentimentItem) {
  return (
    <span className={`inline-flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs ${toneBadge(tone)}`}>
      <span>{label}</span>
      <span className="font-semibold">{status}</span>
    </span>
  );
}
