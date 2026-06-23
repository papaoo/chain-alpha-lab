"use client";

import type * as React from "react";
import { Database, FileText } from "lucide-react";
import type { AnalysisReport, Fact } from "@/lib/types";

type ReportSummary = Pick<AnalysisReport, "id" | "reportType" | "title" | "summary" | "llmStatus" | "reportStatus" | "createdAt">;


export function ReportView({
  report,
  reports,
  factMap,
  onSelectReport
}: {
  report: AnalysisReport | null;
  reports: ReportSummary[];
  factMap: Map<string, Fact>;
  onSelectReport: (id: string) => Promise<void>;
}) {
  if (!report) return <EmptyState reports={reports} />;
  return (
    <section className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <Panel>
        <SectionTitle icon={FileText} title={localizeText(report.title)} meta={report.id} />
        <p className="mt-4 text-xl font-semibold">{localizeText(report.summary)}</p>
        <div className="mt-5 space-y-4">
          <ReportBlock title="大盘判断" body={localizeText(report.llmResult?.marketJudgement.logic ?? report.summary)} refs={report.llmResult?.marketJudgement.evidenceRefs ?? []} factMap={factMap} />
          {(report.llmResult?.mainLines ?? []).map((line, index) => (
            <ReportBlock key={`${line.name}-${line.stage}-${index}`} title={`${line.name} / ${formatStage(line.stage)}`} body={localizeText(line.logic)} refs={line.evidenceRefs} factMap={factMap} />
          ))}
        </div>
      </Panel>
      <Panel>
        <SectionTitle icon={FileText} title="历史报告" meta={`${reports.length} 份已保存报告`} />
        <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {reports.map((item) => (
            <button
              key={item.id}
              className={`w-full rounded-lg border p-3 text-left text-sm ${
                item.id === report.id ? "border-info/50 bg-info/10" : "border-line bg-bg/60 hover:bg-white/[0.035]"
              }`}
              type="button"
              onClick={() => void onSelectReport(item.id)}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{localizeText(item.title)}</span>
                <span className="shrink-0 text-xs text-muted">{formatDateTime(item.createdAt)}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">{localizeText(item.summary)}</p>
              <p className="mt-2 text-[11px] text-info">{formatReportStatus(item.reportStatus)} / {formatLlmStatus(item.llmStatus)}</p>
            </button>
          ))}
        </div>
        <div className="mt-5 border-t border-line pt-4">
          <SectionTitle icon={Database} title="事实包" meta={`${report.factPackage?.facts?.length ?? 0} 条事实`} />
          <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {(report.factPackage?.facts ?? []).slice(0, 30).map((fact, index) => <Evidence key={`${fact.factId}-${index}`} fact={fact} />)}
          </div>
        </div>
      </Panel>
    </section>
  );
}



export function EmptyState({ reports = [] }: { reports?: ReportSummary[] }) {
  const hasReportSummary = reports.length > 0;
  return (
    <Panel>
      <SectionTitle
        icon={Database}
        title={hasReportSummary ? "报告详情待加载" : "暂无可展示报告"}
        meta={hasReportSummary ? `${reports.length} 份报告摘要可用` : "运行分析后会生成真实报告"}
      />
      <p className="mt-4 text-sm leading-6 text-muted">
        {hasReportSummary
          ? "系统已经读取到报告摘要，但详情尚未进入当前视图。请稍等刷新，或在历史研报中打开指定报告；页面不会用空事实包生成候选股动作判断。"
          : "当前没有通过质量门的可展示报告。请点击“运行今日分析”；如果数据库中存在旧报告但未展示，说明它可能被标记为不可展示或详情 JSON 需要复核。"}
      </p>
      {hasReportSummary ? (
        <div className="mt-4 grid gap-2">
          {reports.slice(0, 3).map((item) => (
            <div key={item.id} className="rounded-lg border border-line bg-bg/60 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-text">{localizeText(item.title)}</span>
                <span className="text-muted">{formatDateTime(item.createdAt)}</span>
              </div>
              <p className="mt-1 line-clamp-2 leading-5 text-muted">{localizeText(item.summary)}</p>
            </div>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}



function Evidence({ fact }: { fact: Fact }) {
  return (
    <div className="rounded-lg border border-line bg-bg/60 p-3 text-sm">
      <p className="text-[11px] text-info">{formatFactId(fact.factId)}</p>
      <p className="mt-2 leading-6 text-muted">{localizeText(fact.text)}</p>
    </div>
  );
}



function ReportBlock({ title, body, refs, factMap }: { title: string; body: string; refs: string[]; factMap: Map<string, Fact> }) {
  return (
    <div className="rounded-lg border border-line bg-bg/60 p-4">
      <p className="font-medium">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{localizeText(body)}</p>
      <div className="mt-3 space-y-2">
        {refs.map((ref, index) => {
          const fact = factMap.get(ref);
          return fact ? <Evidence key={`${ref}-${index}`} fact={fact} /> : null;
        })}
      </div>
    </div>
  );
}


function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-line bg-panel/88 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.22)] ${className}`}>{children}</div>;
}



function SectionTitle({ icon: Icon, title, meta }: { icon: React.ElementType; title: string; meta: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-bg/70 text-info">
        <Icon size={18} />
      </span>
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted">{meta}</p>
      </div>
    </div>
  );
}



function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}



function localizeText(text?: string | null) {
  return String(text ?? "")
    .replaceAll("Market:", "大盘状态：")
    .replaceAll("Mainline:", "主线板块：")
    .replaceAll("Candidates:", "候选股数量：")
    .replaceAll("Invalid when MA20 breaks or mainline fades", "跌破MA20或主线退潮时失效")
    .replaceAll("Wait until reclaiming MA20", "等待重新收复MA20")
    .replaceAll("Weak trend versus MA20", "趋势弱于MA20")
    .replaceAll("Main fund flow is outflow", "主力资金净流出")
    .replaceAll("Defensive market state", "市场处于防守状态")
    .replaceAll("Accelerating sector, avoid chasing laggards", "板块加速阶段，避免追涨后排")
    .replaceAll("Company profile missing", "公司基础信息不足")
    .replaceAll("Rule-based initial match with mainline", "基于规则初步匹配主线")
    .replaceAll("Financial reports and announcement originals are not yet connected.", "财报和公告原文尚未接入。")
    .replaceAll("Track finance, reserve and official filings later.", "后续跟踪财报、业绩预告和正式公告。")
    .replaceAll("Market state by rule engine", "规则引擎判断的大盘状态")
    .replaceAll("Market state", "大盘状态")
    .replaceAll("latest daily close", "最新日线收盘价")
    .replaceAll("mainNetFlow", "主力净流")
    .replaceAll("close", "收盘价")
    .replaceAll("stage", "阶段")
    .replaceAll("trend", "趋势")
    .replaceAll("volume", "成交量")
    .replaceAll("amount", "成交额")
    .replaceAll("missing", "缺失")
    .replaceAll("unknown", "未知")
    .replaceAll("above_ma20", "站上MA20")
    .replaceAll("below_ma20", "跌破MA20")
    .replaceAll("reclaim_ma20", "收复MA20")
    .replaceAll("downtrend", "下降趋势")
    .replaceAll("inflow", "流入")
    .replaceAll("outflow", "流出")
    .replaceAll("mixed", "分歧")
    .replaceAll("complete", "完整")
    .replaceAll("partial", "部分")
    .replaceAll("insufficient", "不足");
}



function formatFactId(factId: string) {
  const parts = factId.split(".");
  if (parts[0] === "stock") {
    const code = parts[1] ?? "";
    if (parts.includes("hot")) return `${code} 热门行情`;
    if (parts.includes("kline")) return `${code} K线数据`;
    if (parts.includes("technical")) return `${code} 技术指标`;
    if (parts.includes("fund")) return `${code} 资金流`;
    return `${code} 个股事实`;
  }
  if (parts[0] === "company") return `${parts[1] ?? ""} 公司认知`;
  if (parts[0] === "memory" && parts[1] === "stock") return `${parts[2] ?? ""} 历史跟踪`;
  if (parts[0] === "sector") return `${parts[1] ?? ""} 板块证据`;
  if (parts[0] === "market") return `${parts[1] ?? ""} 大盘指数`;
  if (parts[0] === "rule" && parts[1] === "market") return "规则引擎：大盘状态";
  if (parts[0] === "rule" && parts[1] === "sector") return `规则引擎：${parts[2] ?? ""} 主线阶段`;
  return factId;
}



function formatStage(stage: string) {
  if (stage === "unknown") return "观察";
  return stage || "未知";
}

function formatReportStatus(status: AnalysisReport["reportStatus"]) {
  const labels: Record<AnalysisReport["reportStatus"], string> = {
    ruleOnly: "仅规则报告",
    llmEnhanced: "模型增强报告",
    blocked: "已阻断",
    failed: "失败"
  };
  return labels[status] ?? status;
}



function formatLlmStatus(status: AnalysisReport["llmStatus"]) {
  const labels: Record<AnalysisReport["llmStatus"], string> = {
    disabled: "模型未启用",
    success: "模型成功",
    rejected: "模型输出被拒绝",
    failed: "模型失败"
  };
  return labels[status] ?? status;
}

