"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Database } from "lucide-react";
import type { AnalysisReport } from "@/lib/types";
import { classifyDataWarnings, formatDataStatus, groupDataWarnings, localizeText } from "@/components/ResearchMarketCommon";

export function DataSourceStatusPanel({ report }: { report: AnalysisReport }) {
  const status = report.dataSourceStatus ?? report.factPackage.dataSource;
  const warnings = status.warnings ?? [];
  const traces = status.traces ?? report.factPackage.dataSource.traces ?? [];
  const session = report.factPackage.session;
  const classified = classifyDataWarnings(warnings);
  const grouped = groupDataWarnings(classified);
  const fallbackCount = traces.filter((item) => item.quality === "fallback").length;
  const approximateCount = traces.filter((item) => item.quality === "approximate").length;
  const missingCount = traces.filter((item) => item.quality === "missing").length;
  const riskCount = classified.filter((item) => item.tone === "risk").length;
  const tencentCount = traces.filter((item) => item.provider === "tencent_zixuangu").length;
  const eastmoneyCount = traces.filter((item) => item.provider === "eastmoney_public").length;
  const tushareCount = traces.filter((item) => item.provider === "tushare").length;
  const [detailOpen, setDetailOpen] = useState(false);
  return (
    <div className="grid gap-3">
      <div className={`rounded-lg border p-3 ${riskCount ? "border-warn/35 bg-warn/10" : warnings.length ? "border-info/30 bg-info/10" : "border-up/30 bg-up/10"}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${riskCount ? "border-warn/40 text-warn" : warnings.length ? "border-info/40 text-info" : "border-up/40 text-up"}`}>
              {riskCount ? <AlertTriangle size={18} /> : <Database size={18} />}
            </div>
            <div>
              <p className="text-sm font-medium">
                数据源{formatDataStatus(status.status)}，{warnings.length ? `${warnings.length} 条提示` : "暂无明显异常"}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted">
                {session ? `${session.phaseLabel} / ${session.expectedDataBasis}。${session.dataFreshnessHint}` : "当前报告缺少时段上下文。"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded border border-line bg-bg/55 px-2 py-1">腾讯 {tencentCount}</span>
            <span className="rounded border border-line bg-bg/55 px-2 py-1">东财 {eastmoneyCount}</span>
            <span className="rounded border border-line bg-bg/55 px-2 py-1">Tushare {tushareCount}</span>
            <span className="rounded border border-line bg-bg/55 px-2 py-1">回退 {fallbackCount}</span>
            <span className="rounded border border-line bg-bg/55 px-2 py-1">近似 {approximateCount}</span>
            <span className={riskCount ? "rounded border border-warn/40 bg-warn/10 px-2 py-1 text-warn" : "rounded border border-up/40 bg-up/10 px-2 py-1 text-up"}>风险 {riskCount}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <DataHealthCard title="腾讯自选股" value={tencentCount ? `${tencentCount} 条追踪` : "未触发"} meta="通过 westock-data CLI 访问" tone={tencentCount ? "up" : "warn"} />
        <DataHealthCard title="东方财富" value={eastmoneyCount ? `${eastmoneyCount} 条追踪` : "未触发"} meta="公开行情 / 成分 / F10" tone={eastmoneyCount ? "info" : "up"} />
        <DataHealthCard title="Tushare" value={tushareCount ? `${tushareCount} 条追踪` : "未触发"} meta="日线指标 / 财务 / 成分" tone={tushareCount ? "info" : "up"} />
        <DataHealthCard title="备用补源" value={fallbackCount ? `${fallbackCount} 项启用` : "未触发"} meta="东财 / Tushare 回退补充" tone={fallbackCount ? "info" : "up"} />
        <DataHealthCard title="近似映射" value={approximateCount ? `${approximateCount} 项` : "无"} meta="板块别名 / 关联成分" tone={approximateCount ? "warn" : "up"} />
        <DataHealthCard title="缺失字段" value={missingCount ? `${missingCount} 项` : "无"} meta="缺失不会伪造成完整来源" tone={missingCount ? "warn" : "up"} />
      </div>

      {classified.length ? (
        <div className="rounded-lg border border-line/70 bg-bg/50">
          <button
            className="flex w-full items-center justify-between gap-3 p-3 text-left"
            type="button"
            onClick={() => setDetailOpen((value) => !value)}
          >
            <span>
              <span className="block text-sm font-medium">来源提示明细</span>
              <span className="mt-1 block text-xs text-muted">按影响类型分组，默认收起，避免信息挤占主判断区。</span>
            </span>
            <ChevronDown className={`shrink-0 text-muted transition-transform ${detailOpen ? "rotate-180" : ""}`} size={18} />
          </button>
          {detailOpen ? (
            <div className="grid gap-2 border-t border-line/70 p-3">
              {grouped.map((group) => (
                <WarningGroup key={group.type} group={group} />
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="rounded-lg border border-up/30 bg-up/10 p-3 text-sm text-up">数据源未返回明显警告。</p>
      )}
    </div>
  );
}

function DataHealthCard({
  title,
  value,
  meta,
  tone
}: {
  title: string;
  value: string;
  meta: string;
  tone: "up" | "info" | "warn";
}) {
  const cls = tone === "up" ? "border-up/30 bg-up/10 text-up" : tone === "info" ? "border-info/30 bg-info/10 text-info" : "border-warn/30 bg-warn/10 text-warn";
  const Icon = tone === "up" ? CheckCircle2 : tone === "info" ? Database : AlertTriangle;
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">{title}</p>
        <Icon size={15} />
      </div>
      <p className="mt-2 text-sm font-medium">{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-muted">{meta}</p>
    </div>
  );
}

function WarningGroup({
  group
}: {
  group: { type: string; tone: "risk" | "info"; scope: string; items: ReturnType<typeof classifyDataWarnings> };
}) {
  const [open, setOpen] = useState(group.tone === "risk");
  return (
    <div className={`rounded-lg border ${group.tone === "risk" ? "border-warn/35 bg-warn/10" : "border-info/25 bg-info/10"}`}>
      <button className="flex w-full items-center justify-between gap-3 p-3 text-left" type="button" onClick={() => setOpen((value) => !value)}>
        <span className="flex items-center gap-2">
          <span className={group.tone === "risk" ? "text-warn" : "text-info"}>{group.type}</span>
          <span className="rounded border border-line/70 bg-bg/50 px-2 py-0.5 text-[11px] text-muted">{group.items.length} 条</span>
        </span>
        <span className="flex items-center gap-2 text-[11px] text-muted">
          {group.scope}
          <ChevronDown className={`transition-transform ${open ? "rotate-180" : ""}`} size={16} />
        </span>
      </button>
      {open ? (
        <div className="space-y-2 border-t border-line/60 p-3">
          {group.items.map((item, index) => (
            <p key={`${item.message}-${index}`} className="rounded border border-line/60 bg-bg/45 p-2 text-xs leading-5 text-muted">
              {localizeText(item.message)}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
