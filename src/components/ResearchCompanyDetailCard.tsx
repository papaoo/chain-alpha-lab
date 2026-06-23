"use client";

import type { AnalysisReport, Fact, StockCandidate } from "@/lib/types";
import { StockNameHover } from "@/components/ResearchStockHover";
import { SIGNAL_SCORE_BOUNDARY } from "@/components/ResearchCandidateCommon";
import { attributionPillClass, formatAction, formatAttributionSourceQuality, formatChainPosition, formatDateTime, formatFundFlow, formatKnowledgeState, formatMoneyDisplay, formatPctDisplay, formatSignedPctDisplay, formatThemeMatch, formatThemeMatchType, formatTrend, localizeText } from "@/components/ResearchCompanyFormatters";
import { Evidence, Metric, MiniDiagnostic, MiniStat, PlanLine, ScoreBreakdownPanel, SignalBadge, StrengthBadge } from "@/components/ResearchCompanyUi";
import { CompanyBulletBlock } from "@/components/ResearchCompanyBulletBlock";
import { CompanyInfoBlock } from "@/components/ResearchCompanyInfoBlock";
import { SerenityTagPanel } from "@/components/ResearchSerenityTags";
import { CandidateTriggerGapPanel } from "@/components/ResearchCandidateTriggerGap";
import type { SerenityResearchTag } from "@/lib/serenity/tagTypes";

export function CompanyDetailCard({
  candidate,
  factMap,
  report,
  serenityTag
}: {
  candidate: StockCandidate;
  factMap: Map<string, Fact>;
  report: AnalysisReport;
  serenityTag?: SerenityResearchTag;
}) {
  const card = candidate.companyKnowledge;
  const plan = report.llmResult?.stockPlans.find((item) => item.code === candidate.code);
  const memory = report.factPackage.stockMemories?.find((item) => item.code.toLowerCase() === candidate.code.toLowerCase());
  return (
    <div className="mt-4 space-y-4">
      <div>
        <StockNameHover candidate={candidate} className="text-xl font-semibold" />
        <p className="mt-1 text-xs font-mono text-muted">{candidate.code} / {card.industry || "未知行业"}</p>
      </div>
      <p className="text-sm leading-6 text-muted">{localizeText(card.coreBusiness || card.mainBusiness || "公司基础信息不足。")}</p>
      <SerenityTagPanel tag={serenityTag} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Metric label="主线匹配" value={formatThemeMatch(card.themeMatch)} />
        <Metric label="匹配类型" value={formatThemeMatchType(card.themeMatchType)} />
        <Metric label="产业链位置" value={formatChainPosition(card.industryChainPosition)} />
        <Metric label="上涨驱动" value={card.currentMoveDriver} />
        <Metric label="财务趋势" value={card.financialTrend} />
        <Metric label="认知状态" value={formatKnowledgeState(card.companyKnowledgeState)} />
      </div>
      <div className="rounded-lg border border-line bg-bg/60 p-3 text-sm">
        <p className="font-medium">公司一句话认知</p>
        <p className="mt-2 leading-6 text-muted">{localizeText(card.oneLineUnderstanding)}</p>
        <p className="mt-2 text-xs leading-5 text-muted">{localizeText(card.themeMatchLogic)}</p>
      </div>
      {candidate.mainlineAttribution ? (
        <div className="rounded-lg border border-info/25 bg-info/[0.045] p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">主线归属证据链</p>
            <span className={`rounded-full border px-2 py-1 text-xs ${attributionPillClass(candidate.mainlineAttribution.status)}`}>
              {formatThemeMatchType(candidate.mainlineAttribution.status)} / {candidate.mainlineAttribution.confidence}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted">{localizeText(candidate.mainlineAttribution.reason)}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <MiniStat label="目标主线" value={candidate.mainlineAttribution.matchedSector ?? "无"} />
            <MiniStat label="成分板块" value={candidate.mainlineAttribution.membershipSector ?? "缺失"} />
            <MiniStat label="命中关键词" value={candidate.mainlineAttribution.businessKeywords?.join("、") || "无"} />
            <MiniStat label="是否剔除" value={candidate.mainlineAttribution.shouldExclude ? "是" : "否"} />
            <MiniStat label="来源质量" value={formatAttributionSourceQuality(candidate.mainlineAttribution.evidenceChain?.sourceQuality)} />
            <MiniStat label="人工复核" value={candidate.mainlineAttribution.evidenceChain?.reviewRequired ? "需要" : "不需要"} />
          </div>
          {candidate.mainlineAttribution.evidenceChain?.reviewReason ? (
            <p className="mt-3 rounded-md border border-warning/25 bg-warning/10 p-2 text-xs leading-5 text-warning">
              {localizeText(candidate.mainlineAttribution.evidenceChain.reviewReason)}
            </p>
          ) : null}
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <CompanyBulletBlock title="成分股证据" items={candidate.mainlineAttribution.evidenceChain?.constituentEvidence ?? []} empty="暂无成分股证据" />
            <CompanyBulletBlock title="主营关键词" items={candidate.mainlineAttribution.evidenceChain?.businessEvidence ?? candidate.mainlineAttribution.evidence ?? []} empty="暂无主营匹配" />
            <CompanyBulletBlock title="产业链位置" items={candidate.mainlineAttribution.evidenceChain?.industryChainEvidence ?? []} empty="暂无产业链证据" />
            <CompanyBulletBlock title="否定证据" items={candidate.mainlineAttribution.evidenceChain?.negativeEvidence ?? candidate.mainlineAttribution.blockers ?? []} empty="暂无否定证据" tone="warn" />
          </div>
        </div>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        <CompanyInfoBlock
          title="财务摘要"
          empty="暂无财务摘要"
          lines={[
            ["报告期", card.financialSummary?.reportDate],
            ["营收", formatMoneyDisplay(card.financialSummary?.revenue)],
            ["营收变化", formatSignedPctDisplay(card.financialSummary?.revenueChangePct)],
            ["归母净利", formatMoneyDisplay(card.financialSummary?.netProfit)],
            ["净利变化", formatSignedPctDisplay(card.financialSummary?.netProfitChangePct)],
            ["毛利率", formatPctDisplay(card.financialSummary?.grossMarginPct)],
            ["毛利率变化", formatSignedPctDisplay(card.financialSummary?.grossMarginChangePct)],
            ["净利率", formatPctDisplay(card.financialSummary?.netProfitMarginPct)],
            ["经营现金流", formatMoneyDisplay(card.financialSummary?.operatingCashFlow)],
            ["现金流变化", formatSignedPctDisplay(card.financialSummary?.operatingCashFlowChangePct)],
            ["资产负债率", formatPctDisplay(card.financialSummary?.debtRatioPct)],
            ["ROE", formatPctDisplay(card.financialSummary?.roePct)]
          ]}
        />
        <CompanyInfoBlock
          title="股东与披露"
          empty="暂无股东或披露摘要"
          lines={[
            ["股东报告期", card.shareholderSummary?.reportDate],
            ["第一大股东", card.shareholderSummary?.topHolder],
            ["持股比例", formatPctDisplay(card.shareholderSummary?.topHolderPct)],
            ["股东户数", card.shareholderSummary?.holderCount ? String(card.shareholderSummary.holderCount) : undefined],
            ["户数变化", formatPctDisplay(card.shareholderSummary?.holderCountChangePct)],
            ["北向持股", formatPctDisplay(card.shareholderSummary?.northboundHolderPct)],
            ["披露日期", card.earningsPreview?.disclosureDate],
            ["披露说明", card.earningsPreview?.disclosureDesc]
          ]}
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <CompanyBulletBlock title="趋势依据" items={card.financialSummary?.trendBasis ?? []} empty="暂无多期趋势依据" />
        <CompanyBulletBlock title="基本面亮点" items={card.fundamentalHighlights} empty="暂无可验证亮点" />
        <CompanyBulletBlock title="认知风险" items={card.fundamentalRisks} empty="暂无额外风险" tone="warn" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <CompanyBulletBlock title="失效条件" items={card.logicInvalidConditions} empty="暂无失效条件" tone="warn" />
        <CompanyBulletBlock title="长期观察项" items={card.longTermWatchItems} empty="暂无长期观察项" />
      </div>
      <div className="rounded-lg border border-line bg-bg/60 p-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium">阶段强股诊断</p>
          <div className="flex flex-wrap justify-end gap-2">
            <SignalBadge candidate={candidate} />
            <StrengthBadge score={candidate.strengthScore} />
          </div>
        </div>
        {candidate.signalReasons?.length ? (
          <div className="mt-3 rounded-lg border border-info/20 bg-info/10 p-3 text-xs leading-5 text-info">
            {candidate.signalReasons.join("；")}
          </div>
        ) : null}
        <p className="mt-2 rounded-lg border border-line bg-panel/60 px-3 py-2 text-xs leading-5 text-muted">{SIGNAL_SCORE_BOUNDARY}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(candidate.diagnostics ?? []).map((item) => (
            <MiniDiagnostic key={item.label} item={item} />
          ))}
        </div>
        {candidate.diagnostics?.length ? null : <p className="mt-2 text-muted">旧报告暂无强股诊断，重新运行分析后会生成。</p>}
      </div>
      <CandidateTriggerGapPanel candidate={candidate} />
      {candidate.buyPointEvaluation ? (
        <div className="rounded-lg border border-line bg-bg/60 p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">买点纪律</p>
            <span className="rounded-full border border-info/30 bg-info/10 px-2 py-1 text-xs text-info">
              {candidate.buyPointEvaluation.status} / {candidate.buyPointEvaluation.score}/20
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <MiniStat label="买点类型" value={candidate.buyPointEvaluation.type} />
            <MiniStat label="时段要求" value={candidate.buyPointEvaluation.sessionNote} />
            <MiniStat label="触发条件" value={candidate.buyPointEvaluation.triggerCondition} />
            <MiniStat label="失效条件" value={candidate.buyPointEvaluation.invalidCondition} />
            <MiniStat label="阻断条件" value={candidate.buyPointEvaluation.blockers.join("；") || "无"} />
          </div>
          {candidate.buyPointEvaluation.satisfied.length ? (
            <div className="mt-3 rounded-lg border border-line/60 bg-panel/40 p-3 text-xs leading-5 text-muted">
              {candidate.buyPointEvaluation.satisfied.slice(0, 5).join("；")}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="rounded-lg border border-line bg-bg/60 p-3 text-sm">
        <p className="font-medium">模型计划</p>
        {plan ? (
          <div className="mt-3 space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <MiniStat label="模型动作" value={formatAction(plan.action)} />
              <MiniStat label="仓位建议" value={localizeText(plan.positionSuggestion)} />
            </div>
            <PlanLine label="买入触发" value={plan.buyCondition} />
            <PlanLine label="卖出条件" value={plan.sellCondition} />
            <PlanLine label="失效条件" value={plan.invalidCondition} />
            <PlanLine label="不买条件" value={plan.doNotBuyCondition} />
            <PlanLine label="风险" value={plan.risk} tone="warn" />
          </div>
        ) : (
          <p className="mt-2 text-muted">该候选股暂无模型计划。</p>
        )}
      </div>
      <div className="rounded-lg border border-line bg-bg/60 p-3 text-sm">
        <p className="font-medium">历史跟踪记忆</p>
        {memory ? (
          <div className="mt-3 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <MiniStat label="累计跟踪" value={`${memory.seenCount} 次`} />
              <MiniStat label="上次动作" value={formatAction(memory.lastAction)} />
              <MiniStat label="上次主线" value={memory.lastSectorName || "未知"} />
              <MiniStat label="上次时间" value={formatDateTime(memory.lastSeenAt)} />
            </div>
            <p className="leading-6 text-muted">{localizeText(memory.lastSummary)}</p>
            <div className="space-y-2">
              {memory.recentSnapshots.slice(0, 3).map((snapshot, index) => (
                <div key={`${snapshot.reportId}-${snapshot.createdAt}-${index}`} className="rounded-lg border border-line/70 bg-panel/70 p-2">
                  <p className="text-xs text-info">{formatDateTime(snapshot.createdAt)} / {formatAction(snapshot.action)}</p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    {snapshot.sectorName}，趋势 {formatTrend(snapshot.trendState)}，资金 {formatFundFlow(snapshot.fundFlowState)}，仓位上限 {snapshot.positionLimitPct}%
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-muted">该股暂无历史跟踪记录，本次分析后会写入记忆。</p>
        )}
      </div>
      <div className="space-y-2">
        {candidate.evidenceRefs.map((ref, index) => {
          const fact = factMap.get(ref);
          return fact ? <Evidence key={`${ref}-${index}`} fact={fact} /> : null;
        })}
      </div>
    </div>
  );
}
