"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Database,
  Gauge,
  Globe2,
  Loader2,
  Radar,
  RefreshCw,
  ShieldAlert,
  SunMoon,
  XCircle
} from "lucide-react";
import { fetchApiJson } from "@/lib/client/api";
import { cleanDisplayList, cleanDisplayText } from "@/lib/display/text";
import type { PremarketSnapshot } from "@/lib/premarket/types";

type MarketGroup = PremarketSnapshot["markets"][number]["group"];
type CalendarEvent = PremarketSnapshot["calendarEvents"][number];
type SourceTrace = PremarketSnapshot["sourceTraces"][number];

const MARKET_GROUP_LABELS: Record<MarketGroup, string> = {
  us: "美股",
  asia: "亚太",
  hk_cn: "港股 / A50",
  fx: "汇率",
  other: "其他"
};

const RISK_LEVEL_CLASS: Record<PremarketSnapshot["riskLevel"], string> = {
  friendly: "border-up/35 bg-up/10 text-up",
  neutral: "border-info/35 bg-info/10 text-info",
  watch: "border-warn/35 bg-warn/10 text-warn",
  risk: "border-rose-400/35 bg-rose-400/10 text-rose-200",
  risk_off: "border-red-500/45 bg-red-500/15 text-red-200"
};

export function PremarketScoutWorkspace() {
  const [snapshot, setSnapshot] = useState<PremarketSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void load(true);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  async function load(refresh = false) {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const json = await fetchApiJson<PremarketSnapshot>("/api/premarket/snapshot", { cache: "no-store" });
      if (!json.data) throw new Error(json.error?.message ?? "盘前侦察数据加载失败");
      setSnapshot(json.data);
    } catch (err) {
      setSnapshot(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const groupedMarkets = useMemo(() => groupMarkets(snapshot?.markets ?? []), [snapshot?.markets]);
  const calendarGroups = useMemo(() => groupCalendarEvents(snapshot?.calendarEvents ?? []), [snapshot?.calendarEvents]);

  if (loading) {
    return (
      <section className="rounded-lg border border-line bg-panel/80 p-8 text-center">
        <Loader2 className="mx-auto animate-spin text-info" size={28} />
        <p className="mt-3 text-sm text-muted">正在侦察外围市场...</p>
      </section>
    );
  }

  if (error || !snapshot) {
    return (
      <section className="rounded-lg border border-warn/30 bg-warn/10 p-5 text-warn">
        <div className="flex items-center gap-2 font-medium">
          <AlertTriangle size={18} />
          盘前侦察不可用
        </div>
        <p className="mt-2 text-sm">{cleanDisplayText(error) || "未知错误"}</p>
      </section>
    );
  }

  const sourceSummary = summarizeSources(snapshot.sourceTraces);

  return (
    <section className="grid gap-4">
      <header className="overflow-hidden rounded-lg border border-info/20 bg-[radial-gradient(circle_at_18%_0%,rgba(56,189,248,0.2),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.82)_50%,rgba(248,113,113,0.13))] p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs tracking-[0.18em] text-info">盘前侦察</p>
            <h2 className="mt-3 text-3xl font-semibold">盘前风险指挥台</h2>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-muted">{safeText(snapshot.summary)}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge className={dataQualityClass(snapshot.dataQuality.status)}>
                {safeText(snapshot.dataQuality.label)} {snapshot.dataQuality.criticalOk}/{snapshot.dataQuality.criticalTotal}
              </Badge>
              <Badge className={actionabilityClass(snapshot.actionability.level)}>
                {safeText(snapshot.actionability.label)}
              </Badge>
              <Badge className={temperatureReliabilityClass(snapshot.temperatureReliability.level)}>
                温度置信 {safeText(snapshot.temperatureReliability.label)} {snapshot.temperatureReliability.confidencePct}%
              </Badge>
              <Badge className="border-line bg-bg/60 text-muted">
                {safeText(snapshot.dataBasis)} / {formatDateTime(snapshot.fetchedAt)}
              </Badge>
            </div>
          </div>
          <button
            className="flex w-fit items-center gap-2 rounded-lg border border-info/40 bg-info/10 px-4 py-2 text-sm text-info transition hover:border-info/70 disabled:opacity-60"
            type="button"
            onClick={() => load(true)}
            disabled={refreshing}
          >
            {refreshing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
            刷新侦察
          </button>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatusMiniCard
          icon={<SunMoon size={17} />}
          title={safeText(snapshot.session.phaseLabel)}
          value={snapshot.session.isTradingDay ? "A股交易日" : "A股闭市 / 研究模式"}
          note={`${formatTradeDate(snapshot.session.effectiveTradeDate)} / ${safeText(snapshot.session.expectedDataBasis)}`}
          tone={snapshot.session.isTradingDay ? "info" : "warn"}
        />
        <StatusMiniCard
          icon={<Clock3 size={17} />}
          title="行情权限"
          value={quoteModeLabel(snapshot)}
          note={safeText(snapshot.session.dataFreshnessHint)}
          tone={snapshot.session.canUseRealtimeQuotes ? "up" : "warn"}
        />
        <StatusMiniCard
          icon={<Database size={17} />}
          title="核心数据源"
          value={`${snapshot.dataQuality.criticalOk}/${snapshot.dataQuality.criticalTotal} 可用`}
          note={sourceSummary}
          tone={snapshot.dataQuality.status === "ok" ? "up" : snapshot.dataQuality.status === "failed" ? "down" : "warn"}
        />
        <StatusMiniCard
          icon={<RefreshCw size={17} />}
          title="快照新鲜度"
          value={formatAge(snapshot.fetchedAt)}
          note={snapshot.dataQuality.staleSources.length ? `过期源：${safeList(snapshot.dataQuality.staleSources).join("、")}` : "快照与来源时间已留痕"}
          tone={snapshot.dataQuality.staleSources.length ? "warn" : "info"}
        />
        <StatusMiniCard
          icon={<Gauge size={17} />}
          title="温度置信度"
          value={`${snapshot.temperatureReliability.confidencePct}% / ${safeText(snapshot.temperatureReliability.label)}`}
          note={`有效输入 ${snapshot.temperatureReliability.scoreInputOk}/${snapshot.temperatureReliability.scoreInputTotal}，缺失档 ${snapshot.temperatureReliability.fallbackBucketCount}`}
          tone={snapshot.temperatureReliability.level === "high" ? "up" : snapshot.temperatureReliability.level === "invalid" ? "down" : "warn"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        <TemperatureCard snapshot={snapshot} />
        <div className="grid gap-4">
          <ActionabilityPanel snapshot={snapshot} />
          <RiskRadar snapshot={snapshot} />
        </div>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[1.35fr_0.9fr]">
        <MarketBoard groupedMarkets={groupedMarkets} />
        <CalendarBoard snapshot={snapshot} calendarGroups={calendarGroups} />
      </div>

      <CatalystBoard snapshot={snapshot} />

      <div className="grid gap-4 xl:grid-cols-2">
        <InfoList title="风险提示" items={safeList(snapshot.riskFlags)} tone="risk" />
        <InfoList title="开盘观察清单" items={safeList(snapshot.watchItems)} tone="info" />
      </div>

      <SourceTraceBoard sources={snapshot.sourceTraces} />
    </section>
  );
}

function TemperatureCard({ snapshot }: { snapshot: PremarketSnapshot }) {
  return (
    <section className="rounded-lg border border-line bg-panel/86 p-5">
      <SectionTitle icon={<Gauge size={20} />} title="外围温度计" subtitle="越低代表开盘前风险越高" />
      <div className="mt-6 flex items-end gap-5">
        <div className="relative h-64 w-16 overflow-hidden rounded-full border border-line bg-bg/70 p-1">
          <div className={temperatureFillClass(snapshot.temperature)} style={{ height: `${Math.max(8, snapshot.temperature)}%` }} />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),transparent_25%,transparent_75%,rgba(0,0,0,0.22))]" />
        </div>
        <div className="min-w-0">
          <p className="font-mono text-5xl font-semibold tabular-nums">{snapshot.temperature}</p>
          <p className="mt-1 text-sm text-muted">/ 100</p>
          <span className={`mt-4 inline-flex rounded-lg border px-3 py-1.5 text-sm ${RISK_LEVEL_CLASS[snapshot.riskLevel]}`}>
            {safeText(snapshot.emotionLabel)}
          </span>
          <div className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-5 ${temperatureReliabilityClass(snapshot.temperatureReliability.level)}`}>
            <p className="font-medium">
              {safeText(snapshot.temperatureReliability.label)} / 有效输入 {snapshot.temperatureReliability.scoreInputOk}/{snapshot.temperatureReliability.scoreInputTotal}
            </p>
            <p className="mt-1 opacity-90">
              缺失档 {snapshot.temperatureReliability.fallbackBucketCount}，过期源 {snapshot.temperatureReliability.staleScoreInputCount}，失败源 {snapshot.temperatureReliability.failedScoreInputCount}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-6 rounded-lg border border-line bg-bg/55 p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ShieldAlert size={16} className="text-warn" />
          开盘处理原则
        </div>
        <p className="mt-2 text-xs leading-5 text-muted">
          盘前侦察只负责风险背景和观察清单，不直接生成买入信号。真正买点必须等 A 股开盘后的承接、宽度、主线强度和个股结构共同验证。
        </p>
        <p className="mt-2 text-xs leading-5 text-muted">{safeText(snapshot.temperatureReliability.message)}</p>
      </div>
    </section>
  );
}

function ActionabilityPanel({ snapshot }: { snapshot: PremarketSnapshot }) {
  const missingImpact = safeList(snapshot.actionability.missingImpact);
  return (
    <section className={`rounded-lg border p-4 ${actionabilityPanelClass(snapshot.actionability.level)}`}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldAlert size={17} />
            <h3 className="font-semibold">可行动等级：{safeText(snapshot.actionability.label)}</h3>
          </div>
          <p className="mt-2 text-sm leading-6">{safeText(snapshot.actionability.guidance)}</p>
        </div>
        <div className="grid min-w-[300px] gap-2 text-xs md:grid-cols-2">
          <ActionabilityList title="允许用途" items={safeList(snapshot.actionability.allowedUses)} tone="allow" />
          <ActionabilityList title="禁止用途" items={safeList(snapshot.actionability.blockedUses)} tone="block" />
        </div>
      </div>
      {missingImpact.length ? (
        <details className="mt-3 rounded-lg border border-line/70 bg-bg/35 p-3">
          <summary className="cursor-pointer text-xs font-medium">缺失 / 过期影响范围 {missingImpact.length} 项</summary>
          <div className="mt-2 grid gap-1.5 text-xs leading-5">
            {missingImpact.map((item) => <p key={item}>{item}</p>)}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function RiskRadar({ snapshot }: { snapshot: PremarketSnapshot }) {
  return (
    <section className="rounded-lg border border-line bg-panel/86 p-4">
      <SectionTitle icon={<Radar size={18} />} title="风险雷达" subtitle="规则分桶评分，未接入授权资讯情绪前不做主观情绪扣分" />
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {snapshot.buckets.map((bucket) => (
          <details key={bucket.key} className="group rounded-lg border border-line bg-bg/50 p-3" open={bucket.state === "risk" || bucket.state === "missing"}>
            <summary className="cursor-pointer list-none">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{safeText(bucket.label)}</p>
                <span className="font-mono text-sm text-info">{bucket.score}/{bucket.maxScore}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                <div className={bucketFillClass(bucket.state)} style={{ width: `${bucket.maxScore ? (bucket.score / bucket.maxScore) * 100 : 0}%` }} />
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">{safeText(bucket.note)}</p>
            </summary>
            <div className="mt-3 border-t border-line pt-3">
              <p className="text-[11px] text-muted">证据</p>
              <div className="mt-2 grid gap-1.5">
                {safeList(bucket.evidence).slice(0, 5).map((item) => (
                  <p key={item} className="rounded border border-line/70 bg-panel/50 px-2 py-1.5 text-[11px] leading-4 text-muted">{item}</p>
                ))}
                {!bucket.evidence.length ? <p className="text-[11px] text-muted">暂无可展示证据。</p> : null}
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function MarketBoard({ groupedMarkets }: { groupedMarkets: Array<[MarketGroup, PremarketSnapshot["markets"]]> }) {
  return (
    <section className="rounded-lg border border-line bg-panel/86 p-4">
      <SectionTitle icon={<Globe2 size={18} />} title="外围市场" subtitle="展示真实来源快照，新鲜度不足时只做参考" />
      <div className="mt-4 grid gap-4">
        {groupedMarkets.map(([group, items]) => (
          <div key={group}>
            <p className="mb-2 text-xs tracking-[0.16em] text-muted">{MARKET_GROUP_LABELS[group] ?? group}</p>
            <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
              {items.map((item) => (
                <div key={item.code} className="rounded-lg border border-line bg-bg/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium" title={safeText(item.name)}>{safeText(item.name)}</p>
                    <span className={`font-mono text-sm ${toneClass(item.changePct)}`}>{formatPct(item.changePct)}</span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted">{formatNumber(item.latest)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded border border-line bg-panel/60 px-1.5 py-0.5 text-muted">{formatDataType(item.dataType)} / {item.code}</span>
                    <span className={`rounded border px-1.5 py-0.5 ${marketFreshnessClass(item.updatedAt)}`}>
                      {formatMarketUpdatedAt(item.updatedAt)}
                    </span>
                  </div>
                  {marketNote(item.code) ? <p className="mt-2 text-[11px] leading-4 text-muted">{marketNote(item.code)}</p> : null}
                </div>
              ))}
            </div>
          </div>
        ))}
        {!groupedMarkets.length ? (
          <p className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">外围市场数据未返回，盘前温度不可用于行动判断。</p>
        ) : null}
      </div>
    </section>
  );
}

function CalendarBoard({
  snapshot,
  calendarGroups
}: {
  snapshot: PremarketSnapshot;
  calendarGroups: ReturnType<typeof groupCalendarEvents>;
}) {
  return (
    <section className="rounded-lg border border-line bg-panel/86 p-4">
      <SectionTitle icon={<CalendarClock size={18} />} title="宏观事件日历" subtitle="经济数据 / 央行 / 高频宏观事件" />
      <div className="mt-4 grid grid-cols-4 gap-2 text-center text-[11px]">
        <CalendarMiniStat label="今日" value={`${snapshot.calendarSummary.today}`} tone={snapshot.calendarSummary.today ? "warn" : "muted"} />
        <CalendarMiniStat label="待公布" value={`${snapshot.calendarSummary.pending}`} tone={snapshot.calendarSummary.pending ? "info" : "muted"} />
        <CalendarMiniStat label="高相关" value={`${snapshot.calendarSummary.highRelevance}`} tone={snapshot.calendarSummary.highRelevance ? "risk" : "muted"} />
        <CalendarMiniStat label="背景项" value={`${snapshot.calendarSummary.backgroundOnly}`} tone="muted" />
      </div>
      <div className="mt-4 grid gap-2">
        <CalendarEventGroup title="今日核心" meta="影响盘前温度和开盘观察" events={calendarGroups.todayCore} defaultOpen />
        <CalendarEventGroup title="未来观察" meta="保留提醒，临近后再放大权重" events={calendarGroups.futureWatch} />
        <CalendarEventGroup title="背景留痕" meta="不参与温度扣分，只做复盘资料" events={calendarGroups.background} />
        {!snapshot.calendarEvents.length ? (
          <p className="rounded-lg border border-line bg-bg/50 p-3 text-sm text-muted">当前宏观日历没有返回中高权重事件。</p>
        ) : null}
      </div>
    </section>
  );
}

function CatalystBoard({ snapshot }: { snapshot: PremarketSnapshot }) {
  const secWarning = snapshot.sourceTraces.find((source) => source.key === "sec_company_filings")?.warnings[0];
  return (
    <section className="rounded-lg border border-line bg-panel/86 p-4">
      <SectionTitle icon={<CalendarClock size={18} />} title="重大催化" subtitle="IPO / 监管 / 产业事件，必须可追溯；传闻不参与打分" />
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {(snapshot.catalystEvents ?? []).map((event) => (
          <a
            key={event.id}
            href={event.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-info/20 bg-info/[0.055] p-3 transition hover:border-info/45"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted">{event.date} / {event.market} / {event.category}</p>
              <span className="rounded border border-info/30 bg-info/10 px-1.5 py-0.5 text-[10px] text-info">权重 {event.weight}</span>
            </div>
            <p className="mt-2 text-sm font-medium leading-5">{safeText(event.title)}</p>
            <p className="mt-2 text-xs leading-5 text-muted">{safeText(event.relevance)}</p>
          </a>
        ))}
        {!(snapshot.catalystEvents ?? []).length ? (
          <p className="rounded-lg border border-line bg-bg/50 p-3 text-sm leading-6 text-muted md:col-span-2">
            暂无已确认的重大公司 / 产业催化。盘前催化只接受可追溯来源；未配置关键词时，系统不会把传闻或示例事件纳入风险温度。
            <span className="mt-2 block text-muted">当前配置：{safeText(snapshot.catalystWatchConfig.note)}</span>
            {secWarning ? <span className="mt-2 block text-warn">校验提示：{safeText(secWarning)}</span> : null}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function SourceTraceBoard({ sources }: { sources: SourceTrace[] }) {
  return (
    <section className="rounded-lg border border-line bg-panel/86 p-4">
      <SectionTitle icon={<Database size={18} />} title="数据来源留痕" subtitle="只把可追溯数据纳入盘前温度，失败和过期必须展示" />
      <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {sources.map((source) => (
          <details key={source.key} className="rounded-lg border border-line bg-bg/50 p-3" open={source.status === "failed" || source.status === "partial"}>
            <summary className="cursor-pointer list-none">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium" title={safeText(source.label)}>{safeText(source.label)}</p>
                  <p className="mt-1 text-xs text-muted">{source.critical ? "核心源" : "可选源"} / {safeText(source.source)}</p>
                </div>
                <span className={`shrink-0 rounded border px-2 py-1 text-[11px] ${sourceStatusClass(source.status)}`}>
                  {formatSourceStatus(source.status)}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <span className="rounded border border-line bg-panel/60 px-2 py-1 text-muted">记录 {source.records}</span>
                <span className={`rounded border px-2 py-1 ${sourceFreshnessClass(source)}`}>{formatSourceAge(source)}</span>
              </div>
              <div className="mt-2">
                <span className={`rounded border px-2 py-1 text-[11px] ${sourceUsageClass(source.usage)}`}>
                  {safeText(source.usageLabel)}
                </span>
              </div>
            </summary>
            <div className="mt-3 border-t border-line pt-3">
              {source.impact ? <p className="text-xs leading-5 text-muted">{safeText(source.impact)}</p> : null}
              {source.warnings.length ? (
                <div className="mt-2 grid gap-1.5">
                  {safeList(source.warnings).slice(0, 3).map((warning) => (
                    <p key={warning} className={`text-xs leading-5 ${source.status === "unavailable" ? "text-muted" : "text-warn"}`}>{warning}</p>
                  ))}
                </div>
              ) : (
                <p className="mt-2 break-all text-xs leading-5 text-muted">{safeText(source.command ?? source.sourceUrl ?? "来源已记录")}</p>
              )}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function StatusMiniCard({
  icon,
  title,
  value,
  note,
  tone
}: {
  icon: ReactNode;
  title: string;
  value: string;
  note: string;
  tone: "up" | "info" | "warn" | "down";
}) {
  const cls = miniToneClass(tone);
  return (
    <div className={`rounded-lg border p-3 ${cls.panel}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${cls.icon}`}>{icon}</span>
        <div className="min-w-0">
          <p className="text-xs text-muted">{title}</p>
          <p className="mt-1 truncate text-sm font-semibold">{value}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{note}</p>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-bg/70 text-info">{icon}</span>
      <div className="min-w-0">
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
      </div>
    </div>
  );
}

function InfoList({ title, items, tone }: { title: string; items: string[]; tone: "risk" | "info" }) {
  return (
    <section className="rounded-lg border border-line bg-panel/86 p-4">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-4 grid gap-2">
        {items.map((item) => (
          <div key={item} className={`rounded-lg border px-3 py-2 text-sm leading-5 ${tone === "risk" ? "border-warn/25 bg-warn/10 text-warn" : "border-info/20 bg-info/10 text-info"}`}>
            {item}
          </div>
        ))}
        {!items.length ? <p className="rounded-lg border border-line bg-bg/50 px-3 py-2 text-sm text-muted">暂无条目。</p> : null}
      </div>
    </section>
  );
}

function ActionabilityList({ title, items, tone }: { title: string; items: string[]; tone: "allow" | "block" }) {
  const Icon = tone === "allow" ? CheckCircle2 : XCircle;
  return (
    <div className="rounded-lg border border-line/70 bg-bg/40 p-2">
      <p className="flex items-center gap-1.5 text-[11px] text-muted"><Icon size={12} />{title}</p>
      <div className="mt-1 grid gap-1">
        {items.slice(0, 4).map((item) => (
          <p key={item} className="text-[11px] leading-4">{item}</p>
        ))}
        {!items.length ? <p className="text-[11px] leading-4 text-muted">暂无。</p> : null}
      </div>
    </div>
  );
}

function CalendarMiniStat({ label, value, tone }: { label: string; value: string; tone: "info" | "warn" | "risk" | "muted" }) {
  return (
    <div className={`rounded-lg border px-2 py-2 ${calendarMiniToneClass(tone)}`}>
      <p>{label}</p>
      <p className="mt-1 font-mono text-sm">{value}</p>
    </div>
  );
}

function CalendarEventGroup({
  title,
  meta,
  events,
  defaultOpen = false
}: {
  title: string;
  meta: string;
  events: CalendarEvent[];
  defaultOpen?: boolean;
}) {
  if (!events.length) {
    return <div className="rounded-lg border border-line bg-bg/35 px-3 py-2 text-xs text-muted">{title}：暂无</div>;
  }
  return (
    <details className="rounded-lg border border-line bg-bg/35" open={defaultOpen}>
      <summary className="cursor-pointer list-none p-3">
        <div className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-medium">{title}</span>
            <span className="mt-1 block text-[11px] leading-4 text-muted">{meta}</span>
          </span>
          <span className="rounded border border-line bg-panel/60 px-2 py-1 text-[11px] text-muted">{events.length} 条</span>
        </div>
      </summary>
      <div className="grid gap-2 border-t border-line p-2">
        {events.slice(0, 6).map((event) => <CalendarEventCard key={`${event.date}-${event.time}-${event.content}`} event={event} />)}
        {events.length > 6 ? (
          <p className="rounded border border-line bg-panel/50 px-2 py-1.5 text-[11px] text-muted">
            还有 {events.length - 6} 条已折叠，后续可进入历史事件页查看完整留痕。
          </p>
        ) : null}
      </div>
    </details>
  );
}

function CalendarEventCard({ event }: { event: CalendarEvent }) {
  return (
    <div className={`rounded-lg border p-3 ${event.relevance === "low" ? "border-line bg-bg/35 opacity-80" : "border-line bg-bg/50"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">{event.date} {event.time} / {safeText(event.country)}</p>
        <div className="flex shrink-0 items-center gap-1">
          <span className={`rounded border px-1.5 py-0.5 text-[10px] ${calendarTimingClass(event.timing)}`}>{formatCalendarTiming(event.timing)}</span>
          <span className={`rounded border px-1.5 py-0.5 text-[10px] ${calendarRelevanceClass(event.relevance)}`}>{formatCalendarRelevance(event.relevance)}</span>
        </div>
      </div>
      <p className="mt-2 text-sm leading-5">{safeText(event.content)}</p>
      {(event.previous || event.forecast || event.actual) ? (
        <p className="mt-2 text-[11px] text-muted">
          前值 {safeText(event.previous) ?? "--"} / 预期 {safeText(event.forecast) ?? "--"} / 实际 {safeText(event.actual) ?? "--"}
        </p>
      ) : null}
      <p className="mt-2 text-[11px] leading-4 text-muted">{safeText(event.relevanceReason) ?? "事件相关性待确认。"}</p>
      {event.decisionHint ? <p className="mt-1 text-[11px] leading-4 text-info">{safeText(event.decisionHint)}</p> : null}
    </div>
  );
}

function groupMarkets(markets: PremarketSnapshot["markets"]) {
  const groups = new Map<MarketGroup, PremarketSnapshot["markets"]>();
  for (const item of markets) {
    groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  }
  return Array.from(groups.entries());
}

function groupCalendarEvents(events: CalendarEvent[]) {
  const todayCore: CalendarEvent[] = [];
  const futureWatch: CalendarEvent[] = [];
  const background: CalendarEvent[] = [];
  for (const event of events) {
    const distance = calendarDistance(event.date);
    if (event.relevance === "low") {
      background.push(event);
    } else if (event.relevance === "high" && distance <= 1) {
      todayCore.push(event);
    } else {
      futureWatch.push(event);
    }
  }
  return { todayCore, futureWatch, background };
}

function summarizeSources(sources: SourceTrace[]) {
  const ok = sources.filter((source) => source.status === "ok").length;
  const partial = sources.filter((source) => source.status === "partial").length;
  const failed = sources.filter((source) => source.status === "failed").length;
  return `可用 ${ok}，部分 ${partial}，失败 ${failed}`;
}

function quoteModeLabel(snapshot: PremarketSnapshot) {
  if (snapshot.session.canUseRealtimeQuotes) return "可用实时行情";
  if (snapshot.session.canUseAuctionQuotes) return "仅竞价弱参考";
  return "不使用实时盘口";
}

function safeText(value?: string | null) {
  return cleanDisplayText(value) ?? "";
}

function safeList(values?: string[] | null) {
  return cleanDisplayList(values);
}

function Badge({ children, className }: { children: ReactNode; className: string }) {
  return <span className={`rounded-lg border px-2 py-1 text-xs ${className}`}>{children}</span>;
}

function calendarDistance(dateText: string) {
  const today = new Date();
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(today);
  const todayTime = Date.parse(`${todayKey}T00:00:00+08:00`);
  const targetTime = Date.parse(`${dateText.slice(0, 10)}T00:00:00+08:00`);
  if (!Number.isFinite(todayTime) || !Number.isFinite(targetTime)) return 999;
  return Math.round((targetTime - todayTime) / 86_400_000);
}

function toneClass(value: number | null) {
  if (value === null) return "text-muted";
  if (value > 0) return "text-up";
  if (value < 0) return "text-down";
  return "text-muted";
}

function formatPct(value: number | null) {
  if (value === null) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatNumber(value: number | null) {
  if (value === null) return "--";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

function formatDataType(value?: PremarketSnapshot["markets"][number]["dataType"]) {
  if (value === "futures") return "期指";
  if (value === "fx") return "汇率";
  if (value === "commodity") return "商品";
  return "指数";
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatTradeDate(value: string) {
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  return value;
}

function formatAge(value: string) {
  const minutes = minutesSince(value);
  if (minutes === null) return "时间未知";
  if (minutes < 1) return "刚刷新";
  if (minutes < 60) return `${minutes} 分钟前`;
  return `${Math.round(minutes / 60)} 小时前`;
}

function formatSourceAge(source: SourceTrace) {
  if (typeof source.freshnessMinutes === "number") {
    if (source.freshnessMinutes < 1) return "刚更新";
    if (source.freshnessMinutes < 60) return `${source.freshnessMinutes} 分钟`;
    return `${Math.round(source.freshnessMinutes / 60)} 小时`;
  }
  return source.dataUpdatedAt ? formatDateTime(source.dataUpdatedAt) : formatDateTime(source.fetchedAt);
}

function formatMarketUpdatedAt(value?: string) {
  if (!value) return "更新时间未知";
  const minutes = minutesSince(value);
  if (minutes === null) return formatDateTime(value);
  if (minutes < 1) return "刚更新";
  if (minutes < 60) return `${minutes}分钟前`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)}小时前`;
  return formatDateTime(value);
}

function minutesSince(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.round((Date.now() - time) / 60_000));
}

function marketNote(code: string) {
  if (code === "CN00Y") return "A50期指当月连续，优先用于盘前风险偏好，不等同于富时中国A50指数本体。";
  if (code === "XIN9") return "富时中国A50指数本体，更多作为对照，不替代期指盘口。";
  return "";
}

function temperatureFillClass(value: number) {
  const color = value >= 60 ? "bg-up" : value >= 40 ? "bg-warn" : "bg-red-400";
  return `absolute bottom-1 left-1 right-1 rounded-full transition-all ${color}`;
}

function bucketFillClass(state: PremarketSnapshot["buckets"][number]["state"]) {
  if (state === "risk" || state === "missing") return "h-full bg-red-400";
  if (state === "watch") return "h-full bg-warn";
  if (state === "good") return "h-full bg-up";
  return "h-full bg-info";
}

function marketFreshnessClass(value?: string) {
  const minutes = value ? minutesSince(value) : null;
  if (minutes === null) return "border-line bg-panel/60 text-muted";
  if (minutes > 180) return "border-warn/35 bg-warn/10 text-warn";
  return "border-info/25 bg-info/10 text-info";
}

function sourceFreshnessClass(source: SourceTrace) {
  const stale = typeof source.freshnessMinutes === "number" && typeof source.staleAfterMinutes === "number" && source.freshnessMinutes > source.staleAfterMinutes;
  return stale ? "border-warn/35 bg-warn/10 text-warn" : "border-line bg-panel/60 text-muted";
}

function sourceStatusClass(status: SourceTrace["status"]) {
  if (status === "ok") return "border-up/30 bg-up/10 text-up";
  if (status === "partial") return "border-warn/30 bg-warn/10 text-warn";
  if (status === "unavailable") return "border-line bg-bg/70 text-muted";
  return "border-down/30 bg-down/10 text-down";
}

function sourceUsageClass(usage: SourceTrace["usage"]) {
  if (usage === "score_input") return "border-info/30 bg-info/10 text-info";
  if (usage === "watch_only") return "border-warn/30 bg-warn/10 text-warn";
  return "border-line bg-bg/70 text-muted";
}

function dataQualityClass(status: PremarketSnapshot["dataQuality"]["status"]) {
  if (status === "ok") return "border-up/30 bg-up/10 text-up";
  if (status === "partial") return "border-info/30 bg-info/10 text-info";
  if (status === "degraded") return "border-warn/35 bg-warn/10 text-warn";
  return "border-down/35 bg-down/10 text-down";
}

function actionabilityClass(level: PremarketSnapshot["actionability"]["level"]) {
  if (level === "plan_ready") return "border-up/30 bg-up/10 text-up";
  if (level === "degraded_reference") return "border-warn/35 bg-warn/10 text-warn";
  return "border-down/35 bg-down/10 text-down";
}

function actionabilityPanelClass(level: PremarketSnapshot["actionability"]["level"]) {
  if (level === "plan_ready") return "border-up/25 bg-up/10 text-up";
  if (level === "degraded_reference") return "border-warn/30 bg-warn/10 text-warn";
  return "border-down/30 bg-down/10 text-down";
}

function temperatureReliabilityClass(level: PremarketSnapshot["temperatureReliability"]["level"]) {
  if (level === "high") return "border-up/30 bg-up/10 text-up";
  if (level === "medium") return "border-info/30 bg-info/10 text-info";
  if (level === "low") return "border-warn/35 bg-warn/10 text-warn";
  return "border-down/35 bg-down/10 text-down";
}

function miniToneClass(tone: "up" | "info" | "warn" | "down") {
  if (tone === "up") return { panel: "border-up/25 bg-up/10", icon: "border-up/35 bg-up/10 text-up" };
  if (tone === "warn") return { panel: "border-warn/30 bg-warn/10", icon: "border-warn/40 bg-warn/10 text-warn" };
  if (tone === "down") return { panel: "border-down/30 bg-down/10", icon: "border-down/40 bg-down/10 text-down" };
  return { panel: "border-info/25 bg-info/10", icon: "border-info/35 bg-info/10 text-info" };
}

function calendarMiniToneClass(tone: "info" | "warn" | "risk" | "muted") {
  if (tone === "risk") return "border-rose-300/30 bg-rose-300/10 text-rose-100";
  if (tone === "warn") return "border-warn/30 bg-warn/10 text-warn";
  if (tone === "info") return "border-info/30 bg-info/10 text-info";
  return "border-line bg-bg/45 text-muted";
}

function formatSourceStatus(status: SourceTrace["status"]) {
  if (status === "ok") return "可用";
  if (status === "partial") return "部分可用";
  if (status === "unavailable") return "可选未接入";
  return "失败";
}

function formatCalendarTiming(value?: CalendarEvent["timing"]) {
  if (value === "released") return "已公布";
  if (value === "pending") return "待公布";
  if (value === "past") return "窗口已过";
  return "近期待看";
}

function formatCalendarRelevance(value?: CalendarEvent["relevance"]) {
  if (value === "high") return "高相关";
  if (value === "medium") return "中相关";
  return "低相关";
}

function calendarTimingClass(value?: CalendarEvent["timing"]) {
  if (value === "released") return "border-emerald-300/30 bg-emerald-300/10 text-emerald-100";
  if (value === "pending") return "border-amber-300/35 bg-amber-300/10 text-amber-100";
  if (value === "past") return "border-slate-700 bg-slate-900/70 text-slate-400";
  return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
}

function calendarRelevanceClass(value?: CalendarEvent["relevance"]) {
  if (value === "high") return "border-rose-300/35 bg-rose-300/10 text-rose-100";
  if (value === "medium") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  return "border-slate-700 bg-slate-900/70 text-slate-400";
}
