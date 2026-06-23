"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, BellRing, Flame, ShieldCheck, WalletCards, Zap } from "lucide-react";
import { AccessWorkspace } from "@/components/AccessWorkspace";
import { ModelAuditView } from "@/components/ResearchModelAuditView";
import { Dashboard } from "@/components/ResearchMainlineDashboard";
import { ReportView } from "@/components/ResearchReportsView";
import { ResearchTopCommandBar, StrategyOverview, StrategyPlaceholder } from "@/components/ResearchShellViews";
import { SettingsView } from "@/components/ResearchSettingsView";
import { ReportDataHealthBanner } from "@/components/ReportDataHealthBanner";
import { ReportFreshnessBanner } from "@/components/ReportFreshnessBanner";
import { StockHoverProvider } from "@/components/ResearchStockHover";
import { StrategyShellNav, type StrategyWorkspaceView } from "@/components/StrategyShellNav";
import { PremarketScoutWorkspace } from "@/components/PremarketScoutWorkspace";
import { SelectionWorkspace } from "@/components/SelectionWorkspace";
import { SerenityResearchWorkspace } from "@/components/SerenityResearchWorkspace";
import { RiskWarningWorkspace } from "@/components/RiskWarningWorkspace";
import { TrackingWorkspace } from "@/components/TrackingWorkspace";
import { fetchApiJson } from "@/lib/client/api";
import type { AuditSummary } from "@/components/ResearchModelAuditCommon";
import type { MarketSessionSnapshot } from "@/components/StrategyCockpitTypes";
import type { AnalysisReport, AppSettings } from "@/lib/types";

type ApiResponse<T> = { success: boolean; data: T | null; error: { code: string; message: string } | null };
type ViewKey = StrategyWorkspaceView;
type ReportSummary = Pick<AnalysisReport, "id" | "reportType" | "title" | "summary" | "llmStatus" | "reportStatus" | "createdAt">;

const WORKSPACE_VIEWS: ViewKey[] = [
  "overview",
  "premarket",
  "mainline",
  "selection",
  "serenity",
  "limitBoard",
  "smallCap",
  "tracking",
  "portfolio",
  "risk",
  "audit",
  "analysis",
  "settings",
  "users",
  "roles",
  "operationLog"
];

function isViewKey(value: string | null): value is ViewKey {
  return WORKSPACE_VIEWS.includes(value as ViewKey);
}

function scrollToMainlineAnchor(anchor: string) {
  window.setTimeout(() => {
    document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 90);
}

export function ResearchDashboard({ initialView = "mainline" }: { initialView?: ViewKey }) {
  const searchParams = useSearchParams();
  const [view, setView] = useState<ViewKey>(initialView);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [auditFeedback, setAuditFeedback] = useState<AuditSummary[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [sessionSnapshot, setSessionSnapshot] = useState<MarketSessionSnapshot | null>(null);
  const [selectedCode, setSelectedCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [analysisFailure, setAnalysisFailure] = useState<string | null>(null);

  const candidates = report?.factPackage?.candidates ?? [];
  const needsFullReport = view === "overview" || view === "mainline" || view === "analysis" || view === "audit" || view === "risk";
  const latestReportSummary = reports[0] ?? null;
  const selected = useMemo(
    () => candidates.find((item) => item.code === selectedCode) ?? candidates[0] ?? null,
    [candidates, selectedCode]
  );
  const factMap = useMemo(() => new Map((report?.factPackage?.facts ?? []).map((fact) => [fact.factId, fact])), [report]);

  useEffect(() => {
    loadLatestReport();
    loadSettings();
    loadAuditFeedback();
    loadMarketSession();
  }, []);

  useEffect(() => {
    const viewParam = searchParams.get("view");
    const anchorParam = searchParams.get("anchor");
    if (isViewKey(viewParam) && viewParam !== view) setView(viewParam);
    if (anchorParam) scrollToMainlineAnchor(anchorParam);
  }, [searchParams, view]);

  useEffect(() => {
    if (!needsFullReport || report || !reports[0]?.id) return;
    void loadReport(reports[0].id);
  }, [needsFullReport, report, reports]);

  useEffect(() => {
    if (!selectedCode && candidates[0]) setSelectedCode(candidates[0].code);
  }, [candidates, selectedCode]);

  async function loadLatestReport() {
    try {
      const list = await fetchJson<ReportSummary[]>("/api/reports?displayable=1&limit=12");
      setReports(list.data ?? []);
      const id = list.data?.[0]?.id;
      if (!id || !needsFullReport) return;
      await loadReport(id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function loadReport(id: string) {
    const detail = await fetchJson<AnalysisReport>(`/api/reports/${id}`);
    if (detail.data) setReport(detail.data);
  }

  async function loadSettings() {
    try {
      const json = await fetchJson<AppSettings>("/api/settings");
      setSettings(json.data);
    } catch (error) {
      setSettings(null);
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function loadAuditFeedback() {
    try {
      const json = await fetchJson<AuditSummary[]>("/api/model-audit");
      setAuditFeedback(json.data ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function loadMarketSession() {
    try {
      const json = await fetchJson<MarketSessionSnapshot>("/api/market-session");
      setSessionSnapshot(json.data);
    } catch {
      setSessionSnapshot(null);
    }
  }

  async function runAnalysis() {
    setLoading(true);
    setAnalysisFailure(null);
    setMessage("正在调用真实行情、规则引擎和模型生成分析...");
    try {
      await fetchJson<{ reportId: string }>("/api/analyze/full", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ useLLM: true, pushNotification: false })
      });
      await loadLatestReport();
      await loadAuditFeedback();
      await loadMarketSession();
      setMessage("分析完成，报告已保存。");
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setAnalysisFailure(text);
      setMessage("");
    } finally {
      setLoading(false);
    }
  }

  function handleShellNavigate(target: { view?: ViewKey; anchor?: string }) {
    const nextView = target.view ?? "mainline";
    setView(nextView);
    const params = new URLSearchParams();
    params.set("view", nextView);
    if (target.anchor) params.set("anchor", target.anchor);
    window.history.replaceState(null, "", `/mainline?${params.toString()}`);
    if (target.anchor) scrollToMainlineAnchor(target.anchor);
  }

  return (
    <main className="min-h-[100dvh] overflow-hidden bg-[#070b10] text-slate-100">
      <div className="market-topology" />
      <div className="relative z-10 grid min-h-[100dvh] grid-cols-1 xl:grid-cols-[276px_1fr]">
        <StrategyShellNav
          currentView={view}
          onNavigate={handleShellNavigate}
          report={report}
          reportSummary={latestReportSummary}
          settings={settings}
        />
        <section className="min-w-0 px-4 py-4 sm:px-6 lg:px-7">
          <div className="mx-auto flex max-w-[1680px] flex-col gap-4">
            <ResearchTopCommandBar view={view} report={report} reportSummary={latestReportSummary} runAnalysis={runAnalysis} loading={loading} />
            {message ? <div className="rounded-lg border border-info/30 bg-info/10 px-4 py-3 text-sm text-info">{message}</div> : null}
            {analysisFailure ? <AnalysisFailureNotice message={analysisFailure} onDismiss={() => setAnalysisFailure(null)} /> : null}
            {report && latestReportSummary && report.id !== latestReportSummary.id ? (
              <HistoricalReportNotice
                report={report}
                latestReport={latestReportSummary}
                onOpenLatest={() => loadReport(latestReportSummary.id)}
              />
            ) : null}
            {needsFullReport || report ? <ReportFreshnessBanner report={report} session={sessionSnapshot} compact={view !== "mainline"} /> : null}
            {needsFullReport || report ? <ReportDataHealthBanner report={report} compact={view !== "mainline"} /> : null}
            <StockHoverProvider report={report}>
              {view === "overview" ? <StrategyOverview report={report} settings={settings} setView={setView} /> : null}
              {view === "mainline" ? (
                <Dashboard report={report} reports={reports} candidates={candidates} selected={selected} factMap={factMap} onSelect={setSelectedCode} />
              ) : null}
              {view === "premarket" ? <PremarketScoutWorkspace /> : null}
              {view === "selection" ? <SelectionWorkspace /> : null}
              {view === "serenity" ? <SerenityResearchWorkspace /> : null}
              {view === "limitBoard" ? (
                <StrategyPlaceholder
                  icon={Flame}
                  title="连板接力"
                  status="后续策略"
                  description="后续会独立接入涨停池、炸板率、连板梯队、情绪周期和龙头换手结构，不与主线趋势规则混用。"
                  bullets={["涨停池 / 跌停池", "连板梯队", "炸板率", "竞价承接"]}
                />
              ) : null}
              {view === "smallCap" ? (
                <StrategyPlaceholder
                  icon={Zap}
                  title="小盘强势"
                  status="后续策略"
                  description="后续会围绕小市值、量价异动、资金净流、题材发酵和流动性风险形成独立策略模块。"
                  bullets={["市值过滤", "量价异动", "流动性约束", "题材发酵"]}
                />
              ) : null}
              {view === "tracking" ? <TrackingWorkspace /> : null}
              {view === "portfolio" ? (
                <StrategyPlaceholder
                  icon={WalletCards}
                  title="模拟持仓"
                  status="规划中"
                  description="用于承接策略选股和个股追踪的模拟交易结果，记录入场依据、仓位变化、盈亏曲线和复盘结论。"
                  bullets={["入场快照", "仓位变化", "盈亏曲线", "复盘标记"]}
                />
              ) : null}
              {view === "risk" ? (
                <RiskWarningWorkspace report={report} session={sessionSnapshot} />
              ) : null}
              {view === "users" ? <AccessWorkspace view="users" /> : null}
              {view === "roles" ? <AccessWorkspace view="roles" /> : null}
              {view === "operationLog" ? <AccessWorkspace view="operationLog" /> : null}
              {view === "audit" ? <ModelAuditView feedback={auditFeedback} settings={settings} onSettingsSaved={setSettings} onReload={loadAuditFeedback} /> : null}
              {view === "analysis" ? <ReportView report={report} reports={reports} factMap={factMap} onSelectReport={loadReport} /> : null}
              {view === "settings" ? <SettingsView settings={settings} onSaved={setSettings} /> : null}
            </StockHoverProvider>
          </div>
        </section>
      </div>
    </main>
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<ApiResponse<T>> {
  return fetchApiJson<T>(url, init);
}

function HistoricalReportNotice({
  report,
  latestReport,
  onOpenLatest
}: {
  report: AnalysisReport;
  latestReport: ReportSummary;
  onOpenLatest: () => void;
}) {
  return (
    <section className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.08] p-4 text-amber-100 shadow-[0_18px_70px_rgba(2,6,23,0.26)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-semibold">正在查看历史快照，不是最新盘面</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            当前报告生成于 {formatShortDateTime(report.createdAt)}，最新报告生成于 {formatShortDateTime(latestReport.createdAt)}。
            如果这份旧报告里出现“数据不足”，它表示当时抓取链路的状态，不代表现在仍然缺数。
          </p>
        </div>
        <button
          className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-300/16"
          type="button"
          onClick={onOpenLatest}
        >
          切回最新报告
        </button>
      </div>
    </section>
  );
}

function formatShortDateTime(value: string) {
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

function AnalysisFailureNotice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const isQualityGate = /数据源不足|未生成有效报告|主线和候选股均为空|数据源不/.test(message);
  const hints = isQualityGate
    ? [
        "系统已阻止空报告落库，没有用无效行情继续生成结论。",
        "优先检查热门板块、涨跌停池、全A宽度、指数K线和候选股盘口这些关键源。",
        "如果是闭市或接口短暂失败，可以稍后重试；旧报告仍可用于复盘，但不能当作最新盘面。"
      ]
    : [
        "请求没有完成，可能是本地服务、网络接口或模型调用异常。",
        "可以先查看数据源状态和终端日志，再决定是否重试。",
        "系统不会因为本次失败覆盖已有可展示报告。"
      ];
  return (
    <section className="rounded-lg border border-amber-300/25 bg-amber-300/[0.07] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-300/30 bg-amber-300/10 text-amber-100">
            {isQualityGate ? <ShieldCheck size={17} /> : <AlertTriangle size={17} />}
          </span>
          <div>
            <p className="font-semibold text-amber-100">{isQualityGate ? "本次分析被质量门拦截" : "运行今日分析失败"}</p>
            <p className="mt-2 max-w-5xl break-words text-sm leading-6 text-slate-300">{message}</p>
            <div className="mt-3 grid gap-1.5 text-xs leading-5 text-slate-400">
              {hints.map((hint) => <p key={hint}>{hint}</p>)}
            </div>
          </div>
        </div>
        <button
          className="rounded-lg border border-amber-300/25 px-3 py-2 text-xs text-amber-100 transition hover:bg-amber-300/10"
          type="button"
          onClick={onDismiss}
        >
          收起
        </button>
      </div>
    </section>
  );
}
