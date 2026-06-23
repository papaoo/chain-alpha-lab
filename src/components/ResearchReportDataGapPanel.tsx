"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, DatabaseZap, GitBranch, Info, Wrench } from "lucide-react";
import type { AnalysisReport } from "@/lib/types";

type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };

type ReportDataGapAudit = {
  reportId: string;
  reportCreatedAt: string;
  latestReportId?: string;
  latestReportCreatedAt?: string;
  isLatestReport?: boolean;
  conclusion: "核心数据完整" | "存在软补充项" | "存在关键缺口";
  summary: string;
  candidateSummary: {
    total: number;
    coreComplete: number;
    hardGapCount: number;
    companySupplementCount: number;
  };
  hardCandidateGaps: CandidateGapItem[];
  companySupplementGaps: CandidateGapItem[];
  approximateSectorMappings: SourceTraceItem[];
  fallbackSources: SourceTraceItem[];
  providerCapabilities?: {
    criticalGaps: string[];
    supplementAdvice: string[];
  };
  warningSummary: {
    risk: WarningItem[];
    warning: WarningItem[];
    info: WarningItem[];
  };
  canSupplement: SupplementPlanItem[];
};

type CandidateGapItem = {
  code: string;
  name: string;
  sectorName: string;
  action: string;
  missingFields: string[];
  blockingReasons: string[];
  companyMissingFields?: string[];
  sourceTraces: SourceTraceItem[];
};

type SourceTraceItem = {
  scope: string;
  field: string;
  subjectCode?: string;
  subjectName?: string;
  providerName: string;
  quality: string;
  freshness: string;
  warning?: string;
  fetchedAt?: string;
};

type WarningItem = {
  message: string;
  severity: "info" | "warning" | "risk";
  scope: string;
  impact: string;
  action: string;
};

type SupplementPlanItem = {
  target: string;
  status: "已补齐" | "需要补源" | "需要人工复核";
  reason: string;
  suggestedSource: string;
};

export function ReportDataGapPanel({ report }: { report: AnalysisReport }) {
  const [audit, setAudit] = useState<ReportDataGapAudit | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/reports/data-gaps?reportId=${encodeURIComponent(report.id)}`, { cache: "no-store" });
        const json = (await response.json()) as ApiResponse<ReportDataGapAudit>;
        if (!response.ok || !json.success || !json.data) throw new Error(json.error?.message ?? "数据缺口审计读取失败");
        if (!cancelled) setAudit(json.data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [report.id]);

  if (loading && !audit) {
    return <div className="mt-4 rounded-lg border border-line bg-bg/45 px-3 py-3 text-xs text-muted">正在审计本期数据缺口...</div>;
  }
  if (error) {
    return <div className="mt-4 rounded-lg border border-amber-300/25 bg-amber-300/[0.08] px-3 py-3 text-xs text-amber-100">{error}</div>;
  }
  if (!audit) return null;

  const tone = auditTone(audit.conclusion);
  const Icon = audit.conclusion === "核心数据完整" ? CheckCircle2 : audit.conclusion === "存在关键缺口" ? AlertTriangle : Info;
  const isHistorical = audit.isLatestReport === false;

  return (
    <details className={`mt-4 rounded-lg border ${tone.panel}`} open={isHistorical || audit.conclusion === "存在关键缺口"}>
      <summary className="cursor-pointer list-none p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${tone.icon}`}>
              <Icon size={17} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">本期数据缺口审计：{audit.conclusion}</p>
                {isHistorical ? (
                  <span className="rounded border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[11px] text-amber-100">
                    历史快照
                  </span>
                ) : null}
                <ChevronDown className="text-muted" size={15} />
              </div>
              <p className="mt-1 text-xs leading-5 opacity-85">{audit.summary}</p>
              {isHistorical ? (
                <p className="mt-1 text-xs leading-5 text-amber-100/90">
                  当前查看的是 {formatDateTime(audit.reportCreatedAt)} 的旧报告；最新报告为 {formatDateTime(audit.latestReportCreatedAt)}。
                  旧报告里的“缺 K线 / 数据不足”只代表当时抓取链路状态，不代表当前仍然缺数。
                </p>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-xs xl:min-w-[520px]">
            <Mini label="核心完整" value={`${audit.candidateSummary.coreComplete}/${audit.candidateSummary.total}`} />
            <Mini label="硬缺口" value={`${audit.candidateSummary.hardGapCount}`} risk={audit.candidateSummary.hardGapCount > 0} />
            <Mini label="公司待补" value={`${audit.candidateSummary.companySupplementCount}`} risk={false} />
            <Mini label="风险警告" value={`${audit.warningSummary.risk.length}`} risk={audit.warningSummary.risk.length > 0} />
          </div>
        </div>
      </summary>
      <div className="grid gap-3 border-t border-current/10 p-3 xl:grid-cols-2">
        <AuditList
          icon={AlertTriangle}
          title="硬性候选缺口"
          empty="本期候选股没有 K线、技术、资金或主线归属硬缺口。"
          items={audit.hardCandidateGaps.map((item) => `${item.name} ${item.code}：${item.missingFields.join("、") || "核心字段待确认"}；${item.blockingReasons.join("；") || "无阻断原因"}`)}
          tone="risk"
        />
        <AuditList
          icon={Info}
          title="公司认知软补充"
          empty="公司认知字段已满足本期解释需要。"
          items={audit.companySupplementGaps.slice(0, 8).map((item) => `${item.name} ${item.code}：${item.companyMissingFields?.join("、") || item.missingFields.join("、") || "公司字段待补"}`)}
          tone="warn"
        />
        <AuditList
          icon={GitBranch}
          title="板块近似映射"
          empty="本期没有近似板块成分映射。"
          items={audit.approximateSectorMappings.map((item) => `${item.subjectName ?? "板块"}：${item.warning ?? `${item.providerName} ${item.field}`}`)}
          tone="warn"
        />
        <AuditList
          icon={DatabaseZap}
          title="备用来源补齐"
          empty="本期没有使用备用来源补齐字段。"
          items={audit.fallbackSources.slice(0, 10).map((item) => `${item.subjectName ?? item.subjectCode ?? item.field}：${item.field} / ${item.providerName} / ${qualityLabel(item.quality)}`)}
          tone="info"
        />
        <div className="xl:col-span-2">
          <AuditList
            icon={Wrench}
            title="补数处理建议"
            empty="暂无额外补数动作。"
            items={audit.canSupplement.map((item) => `${item.status}｜${item.target}：${item.reason}；建议来源：${item.suggestedSource}`)}
            tone="info"
          />
        </div>
        {audit.providerCapabilities?.criticalGaps.length || audit.providerCapabilities?.supplementAdvice.length ? (
          <div className="xl:col-span-2">
            <AuditList
              icon={DatabaseZap}
              title="数据源能力边界"
              empty="暂无额外数据源权限提示。"
              items={[
                ...(audit.providerCapabilities?.criticalGaps ?? []).map((item) => `权限/来源限制：${item}`),
                ...(audit.providerCapabilities?.supplementAdvice ?? []).map((item) => `补源建议：${item}`)
              ]}
              tone="warn"
            />
          </div>
        ) : null}
      </div>
    </details>
  );
}

function Mini({ label, value, risk = false }: { label: string; value: string; risk?: boolean }) {
  return (
    <div className={`rounded border px-2 py-1.5 ${risk ? "border-amber-300/25 bg-amber-300/10" : "border-current/15 bg-slate-950/20"}`}>
      <p className="opacity-60">{label}</p>
      <p className="mt-0.5 font-mono text-[11px] font-semibold">{value}</p>
    </div>
  );
}

function AuditList({
  icon: Icon,
  title,
  empty,
  items,
  tone
}: {
  icon: typeof AlertTriangle;
  title: string;
  empty: string;
  items: string[];
  tone: "risk" | "warn" | "info";
}) {
  const visible = items.filter(Boolean);
  return (
    <div className={`rounded-lg border p-3 ${listTone(tone)}`}>
      <div className="flex items-center gap-2">
        <Icon size={15} />
        <p className="text-sm font-semibold">{title}</p>
        <span className="rounded border border-current/15 bg-slate-950/20 px-1.5 py-0.5 text-[10px]">{visible.length}</span>
      </div>
      <div className="mt-2 grid gap-1.5">
        {visible.length ? visible.map((item, index) => (
          <p key={`${item}-${index}`} className="rounded border border-current/12 bg-slate-950/18 px-2 py-1.5 text-xs leading-5 opacity-88">
            {item}
          </p>
        )) : <p className="text-xs leading-5 opacity-70">{empty}</p>}
      </div>
    </div>
  );
}

function auditTone(conclusion: ReportDataGapAudit["conclusion"]) {
  if (conclusion === "核心数据完整") {
    return {
      panel: "border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-100",
      icon: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
    };
  }
  if (conclusion === "存在关键缺口") {
    return {
      panel: "border-amber-300/25 bg-amber-300/[0.08] text-amber-100",
      icon: "border-amber-300/30 bg-amber-300/10 text-amber-100"
    };
  }
  return {
    panel: "border-cyan-300/20 bg-cyan-300/[0.07] text-cyan-100",
    icon: "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
  };
}

function listTone(tone: "risk" | "warn" | "info") {
  if (tone === "risk") return "border-amber-300/25 bg-amber-300/[0.07] text-amber-100";
  if (tone === "warn") return "border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-100";
  return "border-slate-700 bg-slate-950/28 text-slate-200";
}

function qualityLabel(value: string) {
  if (value === "fallback") return "备用补齐";
  if (value === "approximate") return "近似映射";
  if (value === "missing") return "缺失";
  if (value === "primary") return "主源";
  if (value === "derived") return "派生";
  return value;
}

function formatDateTime(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}
