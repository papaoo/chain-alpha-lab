"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, Flame, WalletCards, Zap } from "lucide-react";
import { AccessWorkspace } from "@/components/AccessWorkspace";
import { ModelAuditView } from "@/components/ResearchModelAuditView";
import { Dashboard } from "@/components/ResearchMainlineDashboard";
import { ReportView } from "@/components/ResearchReportsView";
import { ResearchTopCommandBar, StrategyOverview, StrategyPlaceholder } from "@/components/ResearchShellViews";
import { SettingsView } from "@/components/ResearchSettingsView";
import { StockHoverProvider } from "@/components/ResearchStockHover";
import { StrategyShellNav, type StrategyWorkspaceView } from "@/components/StrategyShellNav";
import { PremarketScoutWorkspace } from "@/components/PremarketScoutWorkspace";
import { SelectionWorkspace } from "@/components/SelectionWorkspace";
import { SerenityResearchWorkspace } from "@/components/SerenityResearchWorkspace";
import { TrackingWorkspace } from "@/components/TrackingWorkspace";
import type { AuditSummary } from "@/components/ResearchModelAuditCommon";
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
  const [view, setView] = useState<ViewKey>(initialView);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [auditFeedback, setAuditFeedback] = useState<AuditSummary[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [selectedCode, setSelectedCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const candidates = report?.factPackage?.candidates ?? [];
  const selected = useMemo(
    () => candidates.find((item) => item.code === selectedCode) ?? candidates[0] ?? null,
    [candidates, selectedCode]
  );
  const factMap = useMemo(() => new Map((report?.factPackage?.facts ?? []).map((fact) => [fact.factId, fact])), [report]);

  useEffect(() => {
    loadLatestReport();
    loadSettings();
    loadAuditFeedback();
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get("view");
    const anchorParam = params.get("anchor");
    if (isViewKey(viewParam)) setView(viewParam);
    if (anchorParam) scrollToMainlineAnchor(anchorParam);
  }, []);

  useEffect(() => {
    if (!selectedCode && candidates[0]) setSelectedCode(candidates[0].code);
  }, [candidates, selectedCode]);

  async function loadLatestReport() {
    try {
      const list = await fetchJson<ReportSummary[]>("/api/reports?displayable=1");
      setReports(list.data ?? []);
      const id = list.data?.[0]?.id;
      if (!id) return;
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

  async function runAnalysis() {
    setLoading(true);
    setMessage("正在调用真实行情、规则引擎和模型生成分析...");
    try {
      await fetchJson<{ reportId: string }>("/api/analyze/full", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ useLLM: true, pushNotification: false })
      });
      await loadLatestReport();
      await loadAuditFeedback();
      setMessage("分析完成，报告已保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
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
        <StrategyShellNav currentView={view} onNavigate={handleShellNavigate} report={report} settings={settings} />
        <section className="min-w-0 px-4 py-4 sm:px-6 lg:px-7">
          <div className="mx-auto flex max-w-[1680px] flex-col gap-4">
            <ResearchTopCommandBar view={view} report={report} runAnalysis={runAnalysis} loading={loading} />
            {message ? <div className="rounded-lg border border-info/30 bg-info/10 px-4 py-3 text-sm text-info">{message}</div> : null}
            <StockHoverProvider report={report}>
              {view === "overview" ? <StrategyOverview report={report} settings={settings} setView={setView} /> : null}
              {view === "mainline" ? (
                <Dashboard report={report} candidates={candidates} selected={selected} factMap={factMap} onSelect={setSelectedCode} />
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
                <StrategyPlaceholder
                  icon={BellRing}
                  title="风险预警"
                  status="规划中"
                  description="集中展示大盘翻转条件、主线退潮信号、个股失效条件和通知订阅，后续对接企业微信、钉钉或微信推送。"
                  bullets={["大盘翻转", "主线退潮", "个股破位", "Webhook 推送"]}
                />
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
  const response = await fetch(url, init);
  const json = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!response.ok || !json?.success) {
    throw new Error(json?.error?.message ?? `请求失败：${url}`);
  }
  return json;
}
