"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalMarketHeatmap } from "@/components/ExternalMarketHeatmap";
import { StrategyShellNav } from "@/components/StrategyShellNav";
import { HeroPanel, SessionAwarenessPanel, TopBar } from "@/components/StrategyCockpitShellSections";
import { EventTimelinePanel, MacroRiskPanel, MarketStatusPanel, SentimentRadarPanel } from "@/components/StrategyCockpitMarketSections";
import { MarketCognitionCanvas } from "@/components/StrategyCockpitCognitionSections";
import { FundsAndRiskPanel, SectorRadarPanel, StrategyMapPanel } from "@/components/StrategyCockpitInsightSections";
import { CandidatePanel } from "@/components/StrategyCockpitCandidatePanel";
import { ReportDataHealthBanner } from "@/components/ReportDataHealthBanner";
import { ReportFreshnessBanner } from "@/components/ReportFreshnessBanner";
import { fetchJson, marketStateTone } from "@/components/StrategyCockpitUtils";
import type { MacroSnapshot, MarketCognitionSnapshot, MarketSessionSnapshot, ReportSummary } from "@/components/StrategyCockpitTypes";
import type { AnalysisReport, AppSettings } from "@/lib/types";
import type { SchedulerSettings } from "@/lib/types";

export function StrategyCockpit() {
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [macroSnapshot, setMacroSnapshot] = useState<MacroSnapshot | null>(null);
  const [macroStatus, setMacroStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [macroError, setMacroError] = useState("");
  const [marketCognition, setMarketCognition] = useState<MarketCognitionSnapshot | null>(null);
  const [marketCognitionStatus, setMarketCognitionStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [marketCognitionError, setMarketCognitionError] = useState("");
  const [marketCognitionRefreshing, setMarketCognitionRefreshing] = useState(false);
  const [sessionSnapshot, setSessionSnapshot] = useState<MarketSessionSnapshot | null>(null);
  const [schedulerSettings, setSchedulerSettings] = useState<SchedulerSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const sectors = report?.factPackage.sectors ?? [];
  const candidates = report?.factPackage.candidates ?? [];
  const dataWarnings = report?.factPackage.dataSource.warnings ?? [];
  const marketTone = useMemo(() => marketStateTone(report?.ruleResult.market.marketState), [report]);

  useEffect(() => {
    void loadLatestReport();
    void loadSettings();
    void loadMacroSnapshot();
    void loadMarketCognition();
    void loadMarketSession();
    void loadSchedulerSettings();
  }, []);

  async function loadLatestReport() {
    try {
      const list = await fetchJson<ReportSummary[]>("/api/reports?displayable=1&limit=12");
      setReports(list.data ?? []);
      const id = list.data?.[0]?.id;
      if (!id) return;
      const detail = await fetchJson<AnalysisReport>(`/api/reports/${id}`);
      setReport(detail.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function loadSettings() {
    try {
      const json = await fetchJson<AppSettings>("/api/settings");
      setSettings(json.data);
    } catch {
      setSettings(null);
    }
  }

  async function loadMacroSnapshot() {
    setMacroStatus("loading");
    setMacroError("");
    try {
      const json = await fetchJson<MacroSnapshot>("/api/macro-snapshot");
      setMacroSnapshot(json.data);
      setMacroStatus(json.data ? "ready" : "failed");
    } catch {
      setMacroSnapshot(null);
      setMacroStatus("failed");
      setMacroError("宏观快照暂时不可用，首页仅保留 A 股内部数据。");
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

  async function loadSchedulerSettings() {
    try {
      const json = await fetchJson<SchedulerSettings>("/api/scheduler-settings");
      setSchedulerSettings(json.data);
    } catch {
      setSchedulerSettings(null);
    }
  }

  async function loadMarketCognition() {
    const hasSnapshot = Boolean(marketCognition);
    if (hasSnapshot) {
      setMarketCognitionRefreshing(true);
    } else {
      setMarketCognitionStatus("loading");
    }
    setMarketCognitionError("");
    try {
      const json = await fetchJson<MarketCognitionSnapshot>("/api/market-cognition");
      setMarketCognition(json.data);
      setMarketCognitionStatus(json.data ? "ready" : "failed");
    } catch {
      setMarketCognition(null);
      setMarketCognitionStatus("failed");
      setMarketCognitionError("市场认知数据暂时不可用。系统不会用空数据生成有效行情展示。");
    } finally {
      setMarketCognitionRefreshing(false);
    }
  }

  async function runAnalysis() {
    setLoading(true);
    setMessage(sessionSnapshot?.isTradingDay ? "正在获取真实行情、运行规则引擎并生成报告..." : "闭市研究模式：正在基于历史数据生成复盘和下个交易日计划...");
    try {
      await fetchJson<{ reportId: string }>("/api/analyze/full", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ useLLM: true, pushNotification: false })
      });
      await loadLatestReport();
      await loadMacroSnapshot();
      await loadMarketCognition();
      await loadMarketSession();
      await loadSchedulerSettings();
      setMessage("分析完成，报告已保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[#070b10] text-slate-100">
      <div className="market-topology" />
      <div className="relative z-10 grid min-h-[100dvh] grid-cols-1 xl:grid-cols-[276px_1fr]">
        <StrategyShellNav settings={settings} report={report} />
        <section className="min-w-0 px-4 py-4 sm:px-6 lg:px-7">
          <div className="mx-auto flex max-w-[1680px] flex-col gap-4">
            <TopBar report={report} loading={loading} onRun={runAnalysis} session={sessionSnapshot} />
            {message ? <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">{message}</div> : null}
            <ReportFreshnessBanner report={report} session={sessionSnapshot} />
            <ReportDataHealthBanner report={report} />
            <SessionAwarenessPanel session={sessionSnapshot} />

            <section className="grid gap-4 2xl:grid-cols-[1fr_440px]">
              <HeroPanel report={report} sectors={sectors} candidatesCount={candidates.length} marketTone={marketTone} session={sessionSnapshot} />
              <MacroRiskPanel report={report} macroSnapshot={macroSnapshot} status={macroStatus} error={macroError} />
            </section>

            <section className="grid gap-4 xl:grid-cols-[1fr_430px]">
              <MarketStatusPanel report={report} />
              <SentimentRadarPanel report={report} macroSnapshot={macroSnapshot} />
            </section>

            <EventTimelinePanel report={report} session={sessionSnapshot} scheduler={schedulerSettings} />

            <MarketCognitionCanvas snapshot={marketCognition} status={marketCognitionStatus} refreshing={marketCognitionRefreshing} error={marketCognitionError} report={report} onRefresh={loadMarketCognition} />

            <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <SectorRadarPanel sectors={sectors} />
              <FundsAndRiskPanel report={report} reports={reports} settings={settings} dataWarnings={dataWarnings} />
            </section>

            <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
              <CandidatePanel candidates={candidates} reviews={report?.factPackage.candidateReviews ?? []} />
              <StrategyMapPanel />
            </section>

            <ExternalMarketHeatmap />
          </div>
        </section>
      </div>
    </main>
  );
}
