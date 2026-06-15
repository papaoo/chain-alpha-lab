"use client";

import type { AnalysisReport, StockCandidate } from "@/lib/types";
import { StockNameHover } from "@/components/ResearchStockHover";
import { formatAction, formatThemeMatch, formatThemeMatchType, localizeText } from "@/components/ResearchCompanyFormatters";
import { MiniStat, ScoreBreakdownPanel, SignalBadge, SourceTraceChips } from "@/components/ResearchCompanyUi";
import { CompanyBulletBlock } from "@/components/ResearchCompanyBulletBlock";

export function CompanySummaryCard({ candidate, report, onOpen }: { candidate: StockCandidate; report: AnalysisReport; onOpen: () => void }) {
  const card = candidate.companyKnowledge;
  const plan = report.llmResult?.stockPlans.find((item) => item.code === candidate.code);
  const memory = report.factPackage.stockMemories?.find((item) => item.code.toLowerCase() === candidate.code.toLowerCase());
  const buyPoint = candidate.diagnostics?.find((item) => item.label === "买点质量");
  return (
    <div className="mt-4 space-y-3">
      <div className="relative overflow-hidden rounded-lg border border-info/25 bg-info/[0.055] p-4">
        <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full border border-info/20" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <StockNameHover candidate={candidate} className="text-xl font-semibold" />
            <p className="mt-1 font-mono text-xs text-muted">{candidate.code} / {card.industry || "未知行业"}</p>
          </div>
          <SignalBadge candidate={candidate} />
        </div>
        <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted">{localizeText(card.coreBusiness || card.mainBusiness || "公司基础信息不足。")}</p>
        <SourceTraceChips traces={candidate.sourceTraces ?? []} />
      </div>
      <div className="grid gap-2">
        <MiniStat label="主线匹配" value={formatThemeMatch(card.themeMatch)} />
        <MiniStat label="归属证据" value={formatThemeMatchType(candidate.mainlineAttribution?.status ?? card.themeMatchType)} />
        <MiniStat label="强度 / 排序" value={`${candidate.strengthScore ?? "-"} / ${candidate.signalScore ?? "-"}`} />
        <MiniStat label="活跃度" value={candidate.activity ? `${candidate.activity.status} / ${candidate.activity.score}` : "缺失"} />
        <MiniStat label="动作 / 仓位" value={`${formatAction(candidate.action)} / ${candidate.positionLimitPct}%`} />
        <MiniStat label="买点状态" value={candidate.buyPointEvaluation ? `${candidate.buyPointEvaluation.status} / ${candidate.buyPointEvaluation.type}` : candidate.buyPointType} />
        <MiniStat label="机会状态" value={candidate.opportunityProfile ? `${candidate.opportunityProfile.label} / ${candidate.opportunityProfile.score}` : "未生成"} />
        <MiniStat label="累计跟踪" value={memory ? `${memory.seenCount} 次` : "新候选"} />
      </div>
      {candidate.opportunityProfile ? (
        <div className="rounded-lg border border-info/25 bg-info/[0.055] p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">机会画像</p>
            <span className="rounded border border-info/30 px-2 py-0.5 text-[11px] text-info">{candidate.opportunityProfile.label}</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted">{candidate.opportunityProfile.primaryReason}</p>
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            <CompanyBulletBlock title="激活条件" items={candidate.opportunityProfile.activationConditions} empty="暂无激活条件" />
            <CompanyBulletBlock title="阻断原因" items={candidate.opportunityProfile.blockingReasons} empty="暂无硬阻断" tone="warn" />
          </div>
        </div>
      ) : null}
      {plan ? (
        <div className="rounded-lg border border-line bg-bg/60 p-3 text-sm">
          <p className="font-medium">模型计划摘要</p>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">{localizeText(plan.buyCondition)}</p>
        </div>
      ) : null}
      {buyPoint ? (
        <div className="rounded-lg border border-line bg-bg/60 p-3 text-sm">
          <p className="font-medium">买点解释</p>
          <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted">{buyPoint.note}</p>
          {candidate.buyPointEvaluation?.triggerCondition ? (
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-info">触发：{candidate.buyPointEvaluation.triggerCondition}</p>
          ) : null}
        </div>
      ) : null}
      {candidate.tradability ? (
        <div className="rounded-lg border border-line bg-bg/60 p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">买入可达性</p>
            <span className="rounded border border-info/30 px-2 py-0.5 text-[11px] text-info">{candidate.tradability.status}</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted">{candidate.tradability.waitFor}</p>
          {candidate.tradability.nextSessionPlan?.mode !== "无" ? (
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              <CompanyBulletBlock title={candidate.tradability.nextSessionPlan?.mode ?? "后续观察"} items={candidate.tradability.nextSessionPlan?.preconditions ?? []} empty="暂无前提" />
              <CompanyBulletBlock title="不追条件" items={candidate.tradability.nextSessionPlan?.doNotChase ?? []} empty="暂无" tone="warn" />
            </div>
          ) : null}
        </div>
      ) : null}
      <ScoreBreakdownPanel items={candidate.scoreBreakdown ?? []} compact />
      <button
        className="w-full rounded-lg border border-info/40 bg-info/10 px-4 py-3 text-sm font-medium text-info transition hover:bg-info/15"
        type="button"
        onClick={onOpen}
      >
        查看公司详情
      </button>
    </div>
  );
}
