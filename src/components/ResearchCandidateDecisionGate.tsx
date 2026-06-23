"use client";

import { AlertTriangle, BarChart3, CheckCircle2, Clock3, Database, Gauge, GitBranch, LockKeyhole, TimerReset } from "lucide-react";
import type { AnalysisReport, StockCandidate } from "@/lib/types";
import { CandidatePressureBuckets } from "@/components/ResearchCandidatePressureBuckets";
import { localizeText } from "@/components/ResearchCandidateCommon";

type GateTone = "open" | "wait" | "risk" | "muted";

type GateCard = {
  key: string;
  title: string;
  value: string;
  subtitle: string;
  tone: GateTone;
  icon: typeof Gauge;
  details: string[];
};

export function CandidateDecisionGate({ report, candidates }: { report: AnalysisReport; candidates: StockCandidate[] }) {
  const summary = buildDecisionSummary(report, candidates);
  const gates = buildGateCards(report, candidates);
  const boundary = buildActionDataBoundary(report, candidates);

  return (
    <section className="mt-4 rounded-xl border border-line bg-gradient-to-br from-slate-950/78 via-slate-950/50 to-slate-900/70 p-3 shadow-[0_18px_70px_rgba(0,0,0,0.2)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${toneClass(summary.tone)}`}>
              <summary.icon size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold text-text">决策闸口总览</p>
              <p className="mt-0.5 text-xs leading-5 text-muted">把大盘、主线、买点、数据和可达性放到同一张图里，解释为什么现在能买或不能买。</p>
            </div>
          </div>
          <p className={`mt-3 rounded-lg border px-3 py-2 text-sm leading-5 ${toneSoftClass(summary.tone)}`}>
            {summary.title}：{summary.reason}
          </p>
          <div className={`mt-2 rounded-lg border px-3 py-2 text-xs leading-5 ${toneSoftClass(boundary.tone)}`}>
            <span className="font-medium">{boundary.title}</span>
            <span className="ml-1">{boundary.message}</span>
            {boundary.details.length ? (
              <details className="mt-1">
                <summary className="cursor-pointer opacity-85">查看数据边界</summary>
                <div className="mt-1 grid gap-1">
                  {boundary.details.slice(0, 5).map((detail) => (
                    <p key={detail} className="rounded border border-current/15 bg-slate-950/18 px-2 py-1 text-[11px]">
                      {localizeText(detail)}
                    </p>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-3 gap-2 text-center sm:min-w-[360px]">
          <Mini label="候选" value={`${candidates.length}`} />
          <Mini label="行动层" value={`${summary.activeCount}`} tone={summary.activeCount ? "open" : "muted"} />
          <Mini label="硬阻断" value={`${summary.blockedCount}`} tone={summary.blockedCount ? "risk" : "muted"} />
        </div>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-6">
        {gates.map((gate) => (
          <GateMiniCard key={gate.key} gate={gate} />
        ))}
      </div>

      <CandidatePressureBuckets report={report} candidates={candidates} />

      <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_1fr]">
        <InsightList title="最接近触发" items={summary.nearestTriggers} empty="暂无明确触发条件，优先检查数据和主线归属。" tone="open" />
        <InsightList title="当前主要阻断" items={summary.topBlockers} empty="暂无集中阻断项，继续看单股买点和主线阶段。" tone="risk" />
      </div>
    </section>
  );
}

function buildActionDataBoundary(report: AnalysisReport, candidates: StockCandidate[]) {
  const actionableCandidates = candidates.filter((candidate) =>
    candidate.opportunityProfile?.state === "executable" ||
    candidate.opportunityProfile?.state === "next_day_auction" ||
    candidate.opportunityProfile?.state === "pending_activation" ||
    candidate.action === "小仓试错"
  );
  const reportAge = ageMinutes(report.createdAt);
  const dataStatus = report.factPackage.dataSource.status;
  const insufficientCount = actionableCandidates.filter((candidate) => candidate.dataCompleteness.level === "insufficient").length;
  const partialCount = actionableCandidates.filter((candidate) => candidate.dataCompleteness.level === "partial").length;
  const sourceWarnings = report.factPackage.dataSource.warnings.slice(0, 3);
  const stale = isIntradayReport(report) && reportAge !== null && reportAge > 30;
  const hardDataRisk = dataStatus === "failed" || dataStatus === "empty" || hasHardDataRisk(report);
  const missingFields = collectTopItems(actionableCandidates.flatMap((candidate) => candidate.dataCompleteness.missingFields ?? []), 4);
  const details = [
    `报告生成：${formatAge(reportAge)}，基准时段：${report.factPackage.session.phaseLabel}`,
    `数据源状态：${dataStatus}`,
    insufficientCount ? `行动层候选中 ${insufficientCount} 只核心数据不足` : "",
    partialCount ? `行动层候选中 ${partialCount} 只数据部分可用` : "",
    ...missingFields.map((item) => `缺字段：${item}`),
    ...sourceWarnings
  ].filter(isUsefulText);

  if (!actionableCandidates.length) {
    return {
      tone: hardDataRisk || stale ? "risk" as const : "muted" as const,
      title: "数据行动边界",
      message: hardDataRisk || stale
        ? "当前没有可行动候选，且报告时效或关键数据源存在风险；后续判断前建议先刷新。"
        : "当前没有可行动候选，数据仅用于解释观察和复盘。",
      details
    };
  }
  if (hardDataRisk || insufficientCount || stale) {
    return {
      tone: "risk" as const,
      title: "数据行动边界",
      message: "存在行动层候选，但数据新鲜度或关键字段不足，不能直接把它当成当前买入依据。",
      details
    };
  }
  if (partialCount || reportAge === null || reportAge > 15) {
    return {
      tone: "wait" as const,
      title: "数据行动边界",
      message: "候选可以继续观察，但真正执行前需要用悬浮卡片或刷新结果确认最新盘口。",
      details
    };
  }
  return {
    tone: "open" as const,
    title: "数据行动边界",
    message: "行动层候选的数据状态较完整，仍需结合仓位上限、涨停可达性和触发条件执行。",
    details
  };
}

function GateMiniCard({ gate }: { gate: GateCard }) {
  const Icon = gate.icon;
  return (
    <details className={`rounded-lg border p-2 ${toneSoftClass(gate.tone)}`} open={gate.tone === "risk"}>
      <summary className="cursor-pointer list-none">
        <div className="flex items-start justify-between gap-2">
          <span className={`flex h-7 w-7 items-center justify-center rounded-md border ${toneClass(gate.tone)}`}>
            <Icon size={14} />
          </span>
          <span className="text-right text-lg font-semibold">{gate.value}</span>
        </div>
        <p className="mt-2 text-xs font-medium">{gate.title}</p>
        <p className="mt-1 line-clamp-2 text-[11px] leading-4 opacity-80">{gate.subtitle}</p>
      </summary>
      <div className="mt-2 grid gap-1">
        {gate.details.slice(0, 4).map((detail) => (
          <p key={detail} className="rounded border border-current/15 bg-slate-950/18 px-2 py-1 text-[11px] leading-4 opacity-85">
            {localizeText(detail)}
          </p>
        ))}
      </div>
    </details>
  );
}

function InsightList({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone: GateTone }) {
  return (
    <div className={`rounded-lg border p-3 ${toneSoftClass(tone)}`}>
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-2 grid gap-1.5">
        {items.length ? items.slice(0, 5).map((item) => (
          <p key={item} className="rounded border border-current/15 bg-slate-950/18 px-2 py-1.5 text-xs leading-5">
            {localizeText(item)}
          </p>
        )) : (
          <p className="text-xs leading-5 opacity-75">{empty}</p>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value, tone = "muted" }: { label: string; value: string; tone?: GateTone }) {
  return (
    <div className={`rounded-lg border p-2 ${toneSoftClass(tone)}`}>
      <p className="text-[11px] opacity-75">{label}</p>
      <p className="mt-1 text-base font-semibold">{value}</p>
    </div>
  );
}

function buildDecisionSummary(report: AnalysisReport, candidates: StockCandidate[]) {
  const executable = candidates.filter((candidate) => candidate.opportunityProfile?.state === "executable" || candidate.action === "小仓试错");
  const auction = candidates.filter((candidate) => candidate.opportunityProfile?.state === "next_day_auction" || candidate.tradability?.nextSessionPlan?.mode === "次日竞价观察");
  const pending = candidates.filter((candidate) => candidate.opportunityProfile?.state === "pending_activation" || candidate.buyPointEvaluation?.status === "待激活");
  const blocked = candidates.filter((candidate) => isHardBlocked(candidate));
  const market = report.ruleResult.market;
  const activeCount = executable.length + auction.length + pending.length;
  const topBlockers = collectTopItems(candidates.flatMap(candidateBlockers), 6);
  const nearestTriggers = collectTopItems(candidates.flatMap(candidateTriggers), 6);

  if (executable.length) {
    return {
      title: "已有可执行试错",
      reason: `${executable.length} 只候选满足规则动作，但仍要看仓位上限、盘口可达性和刷新时间。`,
      tone: "open" as const,
      icon: CheckCircle2,
      activeCount,
      blockedCount: blocked.length,
      topBlockers,
      nearestTriggers
    };
  }
  if (auction.length) {
    return {
      title: "今天不追，转入次日竞价验证",
      reason: `${auction.length} 只候选更适合看明日竞价承接，避免涨停或高位不可达时硬追。`,
      tone: "wait" as const,
      icon: Clock3,
      activeCount,
      blockedCount: blocked.length,
      topBlockers,
      nearestTriggers
    };
  }
  if (market.marketState === "defensive" || market.maxTotalPositionPct <= 0) {
    return {
      title: "大盘闸口压制",
      reason: `当前${market.tradeMode}，总仓上限 ${market.maxTotalPositionPct}%，正式买入需要先看到市场或主线边际改善。`,
      tone: "risk" as const,
      icon: LockKeyhole,
      activeCount,
      blockedCount: blocked.length,
      topBlockers,
      nearestTriggers
    };
  }
  if (pending.length) {
    return {
      title: "有雏形，等待激活",
      reason: `${pending.length} 只候选有部分证据，但买点、资金、主线扩散或数据质量还没同时达标。`,
      tone: "wait" as const,
      icon: TimerReset,
      activeCount,
      blockedCount: blocked.length,
      topBlockers,
      nearestTriggers
    };
  }
  return {
    title: "以观察和复盘为主",
    reason: "当前候选没有形成明确可执行路径，先看阻断项到底来自数据缺口、主线弱化还是个股买点不成立。",
    tone: blocked.length ? "risk" as const : "muted" as const,
    icon: AlertTriangle,
    activeCount,
    blockedCount: blocked.length,
    topBlockers,
    nearestTriggers
  };
}

function buildGateCards(report: AnalysisReport, candidates: StockCandidate[]): GateCard[] {
  const market = report.ruleResult.market;
  const topSector = report.factPackage.sectors[0];
  const executable = candidates.filter((candidate) => candidate.opportunityProfile?.state === "executable" || candidate.action === "小仓试错").length;
  const pending = candidates.filter((candidate) => candidate.opportunityProfile?.state === "pending_activation" || candidate.buyPointEvaluation?.status === "待激活").length;
  const auction = candidates.filter((candidate) => candidate.opportunityProfile?.state === "next_day_auction" || candidate.tradability?.nextSessionPlan?.mode === "次日竞价观察").length;
  const buyPointValid = candidates.filter((candidate) => candidate.buyPointEvaluation?.status === "有效").length;
  const buyPointPending = candidates.filter((candidate) => candidate.buyPointEvaluation?.status === "待激活").length;
  const dataComplete = candidates.filter((candidate) => candidate.dataCompleteness.level === "complete").length;
  const dataInsufficient = candidates.filter((candidate) => candidate.dataCompleteness.level === "insufficient").length;
  const unreachable = candidates.filter((candidate) => candidate.tradability?.status === "涨停不可达" || candidate.tradability?.status === "接近涨停").length;
  const hardBlocked = candidates.filter(isHardBlocked).length;
  const riskFlags = candidates.reduce((sum, candidate) => sum + candidate.riskFlags.length, 0);

  return [
    {
      key: "market",
      title: "大盘闸口",
      value: market.maxTotalPositionPct > 0 ? `${market.maxTotalPositionPct}%` : "0%",
      subtitle: `${formatMarketState(market.marketState)} / ${market.tradeMode}`,
      tone: market.marketState === "tradable" ? "open" : market.marketState === "cautious" ? "wait" : "risk",
      icon: Gauge,
      details: [
        `状态原因：${market.marketStateReason}`,
        `评分：${market.score}/100`,
        ...market.riskFlags.slice(0, 2),
        ...market.forbiddenActions.slice(0, 2).map((item) => `禁止：${item}`)
      ]
    },
    {
      key: "mainline",
      title: "主线阶段",
      value: topSector ? topSector.stage : "无",
      subtitle: topSector ? `${topSector.name} / ${topSector.lineQuality}` : "暂无有效主线",
      tone: topSector && ["确认", "加速"].includes(topSector.stage) ? "open" : topSector && ["启动", "分歧"].includes(topSector.stage) ? "wait" : "risk",
      icon: GitBranch,
      details: topSector
        ? [
            `主线评分：${topSector.score.toFixed(0)}`,
            `允许买点：${topSector.allowedBuyTypes.join("、") || "无"}`,
            topSector.stageTransitionReason ?? "",
            topSector.coreContinuity?.reason ?? ""
          ].filter(Boolean)
        : ["缺少可用主线，候选股只能做低置信观察。"]
    },
    {
      key: "opportunity",
      title: "机会路径",
      value: `${executable}/${candidates.length}`,
      subtitle: `待激活 ${pending} / 竞价 ${auction}`,
      tone: executable ? "open" : auction || pending ? "wait" : "muted",
      icon: BarChart3,
      details: collectTopItems(candidates.flatMap((candidate) => [
        candidate.opportunityProfile?.primaryReason,
        ...(candidate.opportunityProfile?.nextSteps ?? [])
      ]), 4)
    },
    {
      key: "buy-point",
      title: "买点质量",
      value: `${buyPointValid}`,
      subtitle: `有效 ${buyPointValid} / 待激活 ${buyPointPending}`,
      tone: buyPointValid ? "open" : buyPointPending ? "wait" : "risk",
      icon: TimerReset,
      details: collectTopItems(candidates.flatMap((candidate) => [
        candidate.buyPointEvaluation?.triggerCondition,
        ...(candidate.buyPointEvaluation?.blockers ?? [])
      ]), 4)
    },
    {
      key: "data",
      title: "数据完整",
      value: `${dataComplete}/${candidates.length}`,
      subtitle: dataInsufficient ? `不足 ${dataInsufficient} 只` : "关键字段可解释",
      tone: dataInsufficient ? "risk" : dataComplete ? "open" : "wait",
      icon: Database,
      details: [
        `数据源状态：${report.factPackage.dataSource.status}`,
        ...report.factPackage.dataSource.warnings.slice(0, 3),
        ...collectTopItems(candidates.flatMap((candidate) => candidate.dataCompleteness.missingFields ?? []), 3).map((item) => `缺字段：${item}`)
      ]
    },
    {
      key: "reachability",
      title: "盘口可达",
      value: unreachable ? `受限 ${unreachable}` : "可评估",
      subtitle: `硬阻断 ${hardBlocked} / 风险 ${riskFlags}`,
      tone: unreachable || hardBlocked ? "risk" : "open",
      icon: AlertTriangle,
      details: collectTopItems(candidates.flatMap((candidate) => [
        candidate.tradability?.waitFor,
        ...(candidate.tradability?.blockers ?? []),
        ...candidate.riskFlags
      ]), 4)
    }
  ];
}

function candidateTriggers(candidate: StockCandidate) {
  return [
    ...(candidate.opportunityProfile?.activationConditions ?? []),
    ...(candidate.tradability?.nextSessionPlan?.preconditions ?? []),
    candidate.buyPointEvaluation?.triggerCondition,
    candidate.tradability?.waitFor
  ].filter(isUsefulText);
}

function candidateBlockers(candidate: StockCandidate) {
  return [
    ...(candidate.opportunityProfile?.blockingReasons ?? []),
    ...(candidate.buyPointEvaluation?.blockers ?? []),
    ...(candidate.tradability?.blockers ?? []),
    ...candidate.riskFlags,
    candidate.dataCompleteness.level === "insufficient" ? "核心数据不足，不能形成可执行建议。" : undefined,
    candidate.mainlineAttribution?.shouldExclude ? candidate.mainlineAttribution.reason : undefined
  ].filter(isUsefulText);
}

function isHardBlocked(candidate: StockCandidate) {
  return (
    candidate.action === "回避" ||
    candidate.action === "数据不足" ||
    candidate.opportunityProfile?.state === "blocked" ||
    candidate.dataCompleteness.level === "insufficient" ||
    candidate.mainlineAttribution?.shouldExclude === true
  );
}

function collectTopItems(values: Array<string | null | undefined | false>, limit: number) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!isUsefulText(value)) continue;
    const text = value.trim();
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([text, count]) => count > 1 ? `${text}（${count}只）` : text);
}

function isUsefulText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim() !== "无";
}

function formatMarketState(value: AnalysisReport["ruleResult"]["market"]["marketState"]) {
  if (value === "tradable") return "可交易";
  if (value === "cautious") return "谨慎";
  return "防守";
}

function ageMinutes(value?: string) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.round((Date.now() - time) / 60_000));
}

function isIntradayReport(report: AnalysisReport) {
  return Boolean(report.factPackage.session?.isIntraday);
}

function hasHardDataRisk(report: AnalysisReport) {
  const warningDetails = report.factPackage.dataSource.warningDetails ?? [];
  if (warningDetails.some((item) => item.severity === "risk" && ["market", "stock"].includes(item.scope))) return true;
  return report.factPackage.dataSource.warnings.some((warning) =>
    /涨跌停池|涨停池|跌停池|炸板池|全A宽度|市场宽度|指数技术指标|大盘核心指数|候选股K线|候选股资金|候选股技术/i.test(warning)
    && /失败|failed|fetch failed|timeout|超时|网络|接口请求失败|未取得|未返回|空数据|缺失/i.test(warning)
  );
}

function formatAge(minutes: number | null) {
  if (minutes === null) return "时间未知";
  if (minutes <= 0) return "刚生成";
  if (minutes < 60) return `${minutes} 分钟前`;
  return `${Math.round(minutes / 60)} 小时前`;
}

function toneClass(tone: GateTone) {
  if (tone === "open") return "border-emerald-300/35 bg-emerald-300/10 text-emerald-100";
  if (tone === "wait") return "border-cyan-300/35 bg-cyan-300/10 text-cyan-100";
  if (tone === "risk") return "border-amber-300/35 bg-amber-300/10 text-amber-100";
  return "border-slate-600 bg-slate-900/70 text-slate-300";
}

function toneSoftClass(tone: GateTone) {
  if (tone === "open") return "border-emerald-300/25 bg-emerald-300/[0.07] text-emerald-100";
  if (tone === "wait") return "border-cyan-300/25 bg-cyan-300/[0.07] text-cyan-100";
  if (tone === "risk") return "border-amber-300/25 bg-amber-300/[0.08] text-amber-100";
  return "border-line bg-panel/55 text-slate-300";
}
