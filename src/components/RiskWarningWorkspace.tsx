"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Database,
  GitBranch,
  Radar,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
  TrendingUp
} from "lucide-react";
import { BasicStockNameHover } from "@/components/SelectionStockHover";
import type { MarketSessionSnapshot, Tone } from "@/components/StrategyCockpitTypes";
import { fetchApiJson } from "@/lib/client/api";
import { cleanDisplayList, cleanDisplayText } from "@/lib/display/text";
import { buildReportFreshness, formatTradeDate } from "@/lib/market/freshness";
import type { StockTrackingItem } from "@/lib/db/stockTracking";
import { buildRiskAlerts, buildRiskSummary, formatRiskWarningDetail, type RiskAlert, type RiskAlertLevel } from "@/lib/risk/warnings";
import type { AnalysisReport, SectorRuleResult, StockCandidate } from "@/lib/types";

type TrackingApiMeta = {
  cacheStatus?: string;
  cacheTtlSeconds?: number;
};

export function RiskWarningWorkspace({
  report,
  session
}: {
  report: AnalysisReport | null;
  session: MarketSessionSnapshot | null;
}) {
  const [trackingItems, setTrackingItems] = useState<StockTrackingItem[]>([]);
  const [trackingMeta, setTrackingMeta] = useState<TrackingApiMeta | null>(null);
  const [loadingTracking, setLoadingTracking] = useState(false);
  const [trackingError, setTrackingError] = useState("");

  useEffect(() => {
    void loadTrackingItems();
  }, []);

  async function loadTrackingItems() {
    setLoadingTracking(true);
    setTrackingError("");
    try {
      const response = await fetchApiJson<StockTrackingItem[]>(`/api/tracking/items?status=active&t=${Date.now()}`, { cache: "no-store" });
      setTrackingItems(response.data ?? []);
      setTrackingMeta((response as unknown as { meta?: TrackingApiMeta }).meta ?? null);
    } catch (error) {
      setTrackingItems([]);
      setTrackingError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingTracking(false);
    }
  }

  const freshness = useMemo(() => buildReportFreshness(report, session), [report, session]);
  const alerts = useMemo(() => buildRiskAlerts({ report, session, trackingItems, trackingError }), [report, session, trackingItems, trackingError]);
  const summary = useMemo(() => buildRiskSummary({ alerts, report, trackingItems, freshnessStatus: freshness.status }), [alerts, report, trackingItems, freshness.status]);

  return (
    <section className="grid gap-4">
      <div className="rounded-2xl border border-rose-300/20 bg-[linear-gradient(135deg,rgba(244,63,94,0.14),rgba(15,23,42,0.78)_46%,rgba(56,189,248,0.08))] p-5 shadow-[0_24px_90px_rgba(2,6,23,0.34)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>风控值班台</span>
              <span className="text-slate-700">/</span>
              <span className="text-cyan-200">只读聚合，不新增模型调用</span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-slate-100">风险预警</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              这里集中展示大盘硬闸门、数据新鲜度、主线失效条件、候选股阻断和个股追踪异常。页面只使用已保存的报告与追踪快照，不会为了刷新预警额外消耗 DeepSeek token。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill icon={session?.isTradingSession ? TrendingUp : Clock3} label={session?.headline ?? "等待交易时段识别"} tone={session?.isTradingSession ? "up" : "info"} />
            <StatusPill icon={freshness.status === "stale" ? AlertTriangle : CheckCircle2} label={freshness.title} tone={freshness.status === "stale" ? "warn" : freshness.status === "current" ? "up" : "info"} />
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-300/50 hover:text-cyan-100 disabled:opacity-60"
              type="button"
              onClick={loadTrackingItems}
              disabled={loadingTracking}
            >
              <RefreshCw className={loadingTracking ? "animate-spin" : ""} size={16} />
              刷新追踪
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <RiskMetric label="高级别预警" value={`${summary.high}`} tone={summary.high ? "risk" : "up"} />
          <RiskMetric label="中级别预警" value={`${summary.medium}`} tone={summary.medium ? "warn" : "up"} />
          <RiskMetric label="活跃追踪" value={`${summary.trackingActive}`} tone={summary.trackingRisk ? "warn" : "info"} />
          <RiskMetric label="数据源提示" value={`${summary.dataWarnings}`} tone={summary.dataWarnings ? "warn" : "up"} />
          <RiskMetric label="报告基准" value={formatTradeDate(freshness.reportTradeDate)} tone={freshness.status === "stale" ? "risk" : "info"} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="grid gap-4">
          <AlertGroupPanel
            title="优先处理"
            icon={ShieldAlert}
            alerts={alerts.filter((item) => item.level === "high")}
            empty="暂无高级别预警。继续观察数据新鲜度、主线退潮和追踪破位即可。"
            defaultOpen
          />
          <AlertGroupPanel
            title="观察清单"
            icon={BellRing}
            alerts={alerts.filter((item) => item.level !== "high")}
            empty="暂无中低级别观察项。"
            defaultOpen={alerts.filter((item) => item.level === "high").length === 0}
          />
        </div>

        <aside className="grid h-fit gap-4">
          <Panel title="状态翻转条件" icon={GitBranch}>
            <FlipConditionList report={report} />
          </Panel>
          <Panel title="追踪风险分布" icon={Radar}>
            <TrackingRiskDigest
              items={trackingItems}
              meta={trackingMeta}
              loading={loadingTracking}
              error={trackingError}
            />
          </Panel>
          <Panel title="数据质量影响" icon={Database}>
            <DataQualityDigest report={report} freshnessTitle={freshness.title} freshnessMessage={freshness.message} />
          </Panel>
        </aside>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="主线失效条件" icon={TrendingDown}>
          <MainlineInvalidationList report={report} />
        </Panel>
        <Panel title="候选股阻断原因" icon={AlertTriangle}>
          <CandidateRiskList report={report} />
        </Panel>
      </div>
    </section>
  );
}

function AlertGroupPanel({
  title,
  icon: Icon,
  alerts,
  empty,
  defaultOpen
}: {
  title: string;
  icon: typeof BellRing;
  alerts: RiskAlert[];
  empty: string;
  defaultOpen?: boolean;
}) {
  return (
    <Panel title={title} icon={Icon} defaultOpen={defaultOpen}>
      {alerts.length ? (
        <div className="grid gap-3">
          {alerts.map((alert) => <AlertCard key={alert.id} alert={alert} />)}
        </div>
      ) : (
        <EmptyState text={empty} />
      )}
    </Panel>
  );
}

function AlertCard({ alert }: { alert: RiskAlert }) {
  return (
    <article className={`rounded-2xl border p-4 ${alertPanelClass(alert.level)}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-lg border px-2 py-1 text-[11px] ${levelBadgeClass(alert.level)}`}>{levelLabel(alert.level)}</span>
            <span className="rounded-lg border border-slate-700 bg-slate-950/45 px-2 py-1 text-[11px] text-slate-400">{alert.scope}</span>
            {alert.code && alert.name ? <BasicStockNameHover stock={{ code: alert.code, name: cleanText(alert.name) ?? alert.name }} /> : null}
          </div>
          <h3 className="mt-2 text-base font-semibold text-slate-100">{cleanText(alert.title) ?? alert.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">{cleanText(alert.summary) ?? alert.summary}</p>
        </div>
        <p className="rounded-xl border border-slate-700 bg-slate-950/40 px-3 py-2 text-xs leading-5 text-cyan-100 lg:max-w-[320px]">
          {cleanText(alert.action) ?? alert.action}
        </p>
      </div>
      {alert.evidence.length ? (
        <details className="group mt-3 rounded-xl border border-slate-700/70 bg-slate-950/38">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs text-slate-300">
            <span>证据与触发条件 {alert.evidence.length}</span>
            <ChevronDown className="transition-transform group-open:rotate-180" size={15} />
          </summary>
          <div className="grid gap-2 border-t border-slate-800 p-3">
            {alert.evidence.map((item, index) => (
              <p key={`${item}-${index}`} className="rounded-lg border border-slate-800 bg-slate-900/55 px-3 py-2 text-xs leading-5 text-slate-300">
                {cleanText(item) ?? item}
              </p>
            ))}
          </div>
        </details>
      ) : null}
    </article>
  );
}

function FlipConditionList({ report }: { report: AnalysisReport | null }) {
  const conditions = report?.llmResult?.marketStateFlipConditions ?? [];
  if (!conditions.length) {
    return <EmptyState text="本期报告没有模型翻转条件。可先参考大盘闸门、宽度、涨跌停情绪和数据源质量。" />;
  }
  return (
    <div className="grid gap-2">
      {conditions.slice(0, 5).map((item, index) => (
        <div key={`${item.targetState}-${index}`} className="rounded-xl border border-slate-800 bg-slate-950/48 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-100">转向{item.targetState}</p>
            <span className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[11px] text-cyan-100">模型条件</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">{cleanText(item.condition) ?? item.condition}</p>
        </div>
      ))}
    </div>
  );
}

function TrackingRiskDigest({
  items,
  meta,
  loading,
  error
}: {
  items: StockTrackingItem[];
  meta: TrackingApiMeta | null;
  loading: boolean;
  error: string;
}) {
  if (error) return <EmptyState text={`追踪读取失败：${error}`} />;
  const stats = {
    active: items.length,
    invalid: items.filter((item) => item.derivedState?.state === "invalidated").length,
    risk: items.filter((item) => item.derivedState?.state === "risk_deteriorating").length,
    data: items.filter((item) => item.derivedState?.state === "data_insufficient").length
  };
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        <RiskMetric label="活跃" value={`${stats.active}`} tone="info" compact />
        <RiskMetric label="失效" value={`${stats.invalid}`} tone={stats.invalid ? "risk" : "up"} compact />
        <RiskMetric label="转弱" value={`${stats.risk}`} tone={stats.risk ? "warn" : "up"} compact />
        <RiskMetric label="数据不足" value={`${stats.data}`} tone={stats.data ? "warn" : "up"} compact />
      </div>
      <p className="text-xs leading-5 text-slate-500">
        {loading ? "正在刷新追踪列表。" : meta?.cacheStatus ? `缓存状态：${meta.cacheStatus}，TTL ${meta.cacheTtlSeconds ?? "--"} 秒。` : "追踪列表使用接口返回的最新缓存元信息。"}
      </p>
    </div>
  );
}

function DataQualityDigest({
  report,
  freshnessTitle,
  freshnessMessage
}: {
  report: AnalysisReport | null;
  freshnessTitle: string;
  freshnessMessage: string;
}) {
  const warnings = report?.factPackage.dataSource.warningDetails ?? [];
  const top = warnings.slice(0, 4);
  return (
    <div className="grid gap-3">
      <div className="rounded-xl border border-slate-800 bg-slate-950/48 p-3">
        <p className="text-sm font-semibold text-slate-100">{freshnessTitle}</p>
        <p className="mt-2 text-xs leading-5 text-slate-400">{freshnessMessage}</p>
      </div>
      {top.length ? (
        <div className="grid gap-2">
          {top.map((item, index) => (
            <p key={`${item.message}-${index}`} className={`rounded-lg border px-3 py-2 text-xs leading-5 ${item.severity === "risk" ? "border-rose-300/25 bg-rose-300/10 text-rose-100" : "border-amber-300/25 bg-amber-300/10 text-amber-100"}`}>
              {formatRiskWarningDetail(item)}
            </p>
          ))}
        </div>
      ) : (
        <EmptyState text="本期没有结构化数据源警告。" />
      )}
    </div>
  );
}

function MainlineInvalidationList({ report }: { report: AnalysisReport | null }) {
  const sectors = report?.ruleResult.sectors ?? [];
  if (!sectors.length) return <EmptyState text="暂无主线数据。" />;
  return (
    <div className="grid gap-2">
      {sectors.slice(0, 6).map((sector) => (
        <MainlineRiskRow key={sector.name} sector={sector} />
      ))}
    </div>
  );
}

function MainlineRiskRow({ sector }: { sector: SectorRuleResult }) {
  const risks = cleanTextList([...sector.invalidConditions, ...sector.riskFlags, sector.stageTransitionReason].filter(Boolean) as string[]).slice(0, 3);
  return (
    <details className="group rounded-xl border border-slate-800 bg-slate-950/45 p-3" open={sector.stage === "分歧" || sector.stage === "退潮"}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-100">{cleanText(sector.name) ?? sector.name}</p>
          <p className="mt-1 text-xs text-slate-500">阶段 {sector.stage}，分数 {sector.score}/100，资金 {sector.fundingScore}/25</p>
        </div>
        <ChevronDown className="transition-transform group-open:rotate-180" size={15} />
      </summary>
      <div className="mt-3 grid gap-2 border-t border-slate-800 pt-3">
        {(risks.length ? risks : ["暂无明确失效条件，继续看核心股延续、扩散和资金强度。"]).map((risk, index) => (
          <p key={`${risk}-${index}`} className="rounded-lg border border-slate-800 bg-slate-900/55 px-3 py-2 text-xs leading-5 text-slate-300">
            {risk}
          </p>
        ))}
      </div>
    </details>
  );
}

function CandidateRiskList({ report }: { report: AnalysisReport | null }) {
  const candidates = report?.ruleResult.candidates ?? [];
  if (!candidates.length) return <EmptyState text="暂无候选股数据。" />;
  return (
    <div className="grid gap-2">
      {candidates.slice(0, 8).map((candidate) => (
        <CandidateRiskRow key={candidate.code} candidate={candidate} />
      ))}
    </div>
  );
}

function CandidateRiskRow({ candidate }: { candidate: StockCandidate }) {
  const risks = cleanTextList([candidate.invalidCondition, ...(candidate.riskFlags ?? [])]).slice(0, 3);
  return (
    <details className="group rounded-xl border border-slate-800 bg-slate-950/45 p-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <BasicStockNameHover stock={{ code: candidate.code, name: cleanText(candidate.name) ?? candidate.name }} />
            <span className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-400">{candidate.action}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">仓位上限 {candidate.positionLimitPct}% ，买点 {candidate.buyPointEvaluation?.status ?? candidate.buyPointType}</p>
        </div>
        <ChevronDown className="shrink-0 transition-transform group-open:rotate-180" size={15} />
      </summary>
      <div className="mt-3 grid gap-2 border-t border-slate-800 pt-3">
        {risks.map((risk, index) => (
          <p key={`${risk}-${index}`} className="rounded-lg border border-slate-800 bg-slate-900/55 px-3 py-2 text-xs leading-5 text-slate-300">
            {risk}
          </p>
        ))}
        {candidate.buyPointEvaluation?.triggerCondition ? (
          <p className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs leading-5 text-cyan-100">
            触发：{cleanText(candidate.buyPointEvaluation.triggerCondition) ?? candidate.buyPointEvaluation.triggerCondition}
          </p>
        ) : null}
      </div>
    </details>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
  defaultOpen = true
}: {
  title: string;
  icon: typeof BellRing;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/62 p-4 shadow-[0_22px_80px_rgba(2,6,23,0.28)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="text-cyan-200" size={17} />
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        </div>
        <button
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-200 transition hover:border-cyan-300/50"
          type="button"
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown className={open ? "rotate-180 transition" : "transition"} size={14} />
          {open ? "收起" : "展开"}
        </button>
      </div>
      {open ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

function StatusPill({ icon: Icon, label, tone }: { icon: typeof BellRing; label: string; tone: Tone }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${toneBadgeClass(tone)}`}>
      <Icon size={16} />
      {label}
    </span>
  );
}

function RiskMetric({ label, value, tone, compact = false }: { label: string; value: string; tone: Tone; compact?: boolean }) {
  return (
    <div className={`rounded-xl border ${toneBorderClass(tone)} bg-slate-950/55 ${compact ? "p-3" : "p-4"}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`${compact ? "mt-1 text-lg" : "mt-2 text-2xl"} font-semibold ${toneTextClass(tone)}`}>{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-4 text-sm leading-6 text-slate-400">
      {text}
    </div>
  );
}

function cleanText(value?: string | null) {
  return cleanDisplayText(value);
}

function cleanTextList(values: string[]) {
  return cleanDisplayList(values);
}

function levelLabel(level: RiskAlertLevel) {
  if (level === "high") return "高风险";
  if (level === "medium") return "需观察";
  return "提示";
}

function alertPanelClass(level: RiskAlertLevel) {
  if (level === "high") return "border-rose-300/25 bg-rose-300/[0.08]";
  if (level === "medium") return "border-amber-300/25 bg-amber-300/[0.08]";
  return "border-cyan-300/20 bg-cyan-300/[0.07]";
}

function levelBadgeClass(level: RiskAlertLevel) {
  if (level === "high") return "border-rose-300/35 bg-rose-300/10 text-rose-100";
  if (level === "medium") return "border-amber-300/35 bg-amber-300/10 text-amber-100";
  return "border-cyan-300/30 bg-cyan-300/10 text-cyan-100";
}

function toneBadgeClass(tone: Tone) {
  if (tone === "up") return "border-emerald-300/30 bg-emerald-300/10 text-emerald-100";
  if (tone === "warn") return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  if (tone === "risk") return "border-rose-300/30 bg-rose-300/10 text-rose-100";
  if (tone === "muted") return "border-slate-700 bg-slate-900 text-slate-400";
  return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
}

function toneBorderClass(tone: Tone) {
  if (tone === "up") return "border-emerald-300/25";
  if (tone === "warn") return "border-amber-300/25";
  if (tone === "risk") return "border-rose-300/30";
  if (tone === "muted") return "border-slate-800";
  return "border-cyan-300/20";
}

function toneTextClass(tone: Tone) {
  if (tone === "up") return "text-emerald-100";
  if (tone === "warn") return "text-amber-100";
  if (tone === "risk") return "text-rose-100";
  if (tone === "muted") return "text-slate-400";
  return "text-cyan-100";
}
