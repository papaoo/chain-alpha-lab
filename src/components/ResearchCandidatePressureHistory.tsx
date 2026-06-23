"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Info, TrendingDown, TrendingUp } from "lucide-react";
import type { CandidatePressureHistorySummary, CandidatePressureTone } from "@/lib/strategy/candidatePressureBuckets";
import { localizeText } from "@/components/ResearchCandidateCommon";

type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };

export function CandidatePressureHistoryPanel() {
  const [summary, setSummary] = useState<CandidatePressureHistorySummary | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    void loadHistory();
  }, []);

  async function loadHistory() {
    setStatus("正在读取历史压制来源...");
    try {
      const response = await fetch("/api/candidate-pressure/history?limit=8", { cache: "no-store" });
      const json = (await response.json()) as ApiResponse<CandidatePressureHistorySummary>;
      if (!response.ok || !json.success || !json.data) throw new Error(json.error?.message ?? "历史压制来源读取失败");
      setSummary(json.data);
      setStatus("");
    } catch (error) {
      setSummary(null);
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  const items = summary?.topBuckets.slice(0, 6) ?? [];
  return (
    <details className="mt-3 rounded-lg border border-line/70 bg-bg/45 p-3">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-info/25 bg-info/10 text-info">
              <Clock3 size={15} />
            </span>
            <div>
              <p className="text-sm font-medium text-text">历史压制复盘</p>
              <p className="mt-0.5 text-xs leading-5 text-muted">
                最近 {summary?.reportCount ?? "--"} 份报告，统计候选没进入可执行层的高频瓶颈。
              </p>
            </div>
          </div>
          <button className="rounded-md border border-line bg-panel/60 px-2 py-1 text-xs text-muted hover:border-info/50 hover:text-info" type="button" onClick={(event) => { event.preventDefault(); void loadHistory(); }}>
            刷新
          </button>
        </div>
      </summary>

      <div className="mt-3">
        {status ? <p className="rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 text-xs leading-5 text-warn">{status}</p> : null}
        {summary?.calibrationHints.length ? (
          <div className="mb-3 grid gap-2 lg:grid-cols-2">
            {summary.calibrationHints.slice(0, 4).map((hint) => (
              <div key={hint.key} className={`rounded-lg border p-3 ${hintToneClass(hint.severity)}`}>
                <div className="flex items-start gap-2">
                  <HintIcon severity={hint.severity} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{hint.title}</p>
                    <p className="mt-1 text-[11px] leading-4 opacity-80">{hint.message}</p>
                    <p className="mt-2 rounded border border-current/15 bg-slate-950/18 px-2 py-1 text-[11px] leading-4">
                      建议：{hint.suggestedAction}
                    </p>
                    {hint.evidence[0] ? <p className="mt-1 line-clamp-1 text-[11px] leading-4 opacity-70">证据：{localizeText(hint.evidence[0])}</p> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {items.length ? (
          <div className="grid gap-2 lg:grid-cols-3">
            {items.map((item) => (
              <div key={item.key} className={`rounded-lg border p-2 ${toneClass(item.tone)}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium">{item.title}</p>
                    <p className="mt-1 text-[11px] leading-4 opacity-75">累计 {item.totalCount} 次 / 频率 {item.frequencyPct}%</p>
                  </div>
                  <TrendPill trend={item.trend} />
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-950/45">
                  <div className="h-full rounded-full bg-current" style={{ width: `${Math.min(100, item.frequencyPct)}%` }} />
                </div>
                <p className="mt-2 text-[11px] leading-4 opacity-75">最新：{item.latestValue}</p>
                {item.details[0] ? <p className="mt-1 line-clamp-2 text-[11px] leading-4 opacity-80">{localizeText(item.details[0])}</p> : null}
              </div>
            ))}
          </div>
        ) : !status ? (
          <p className="rounded-lg border border-line bg-panel/55 px-3 py-2 text-xs leading-5 text-muted">历史样本不足，后续定时分析或手动分析保存后会自动形成复盘。</p>
        ) : null}
      </div>
    </details>
  );
}

function HintIcon({ severity }: { severity: CandidatePressureHistorySummary["calibrationHints"][number]["severity"] }) {
  const Icon = severity === "risk" ? AlertTriangle : severity === "warning" ? Info : CheckCircle2;
  return <Icon className="mt-0.5 shrink-0" size={14} />;
}

function TrendPill({ trend }: { trend: CandidatePressureHistorySummary["topBuckets"][number]["trend"] }) {
  const Icon = trend === "升高" ? TrendingUp : trend === "降低" ? TrendingDown : Clock3;
  const className = trend === "升高"
    ? "border-warn/30 bg-warn/10 text-warn"
    : trend === "降低"
      ? "border-up/30 bg-up/10 text-up"
      : "border-line bg-panel/60 text-muted";
  return (
    <span className={`flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] ${className}`}>
      <Icon size={11} />
      {trend}
    </span>
  );
}

function hintToneClass(severity: CandidatePressureHistorySummary["calibrationHints"][number]["severity"]) {
  if (severity === "risk") return "border-amber-300/30 bg-amber-300/[0.08] text-amber-100";
  if (severity === "warning") return "border-cyan-300/25 bg-cyan-300/[0.07] text-cyan-100";
  return "border-line bg-panel/55 text-slate-300";
}

function toneClass(tone: CandidatePressureTone) {
  if (tone === "risk") return "border-amber-300/25 bg-amber-300/[0.08] text-amber-100";
  if (tone === "wait") return "border-cyan-300/25 bg-cyan-300/[0.07] text-cyan-100";
  return "border-emerald-300/25 bg-emerald-300/[0.07] text-emerald-100";
}
