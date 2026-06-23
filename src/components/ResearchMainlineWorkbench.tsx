"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, BrainCircuit, Building2, Database, Gauge, GitBranch, Layers3, ServerCog } from "lucide-react";
import type { AnalysisReport, Fact, StockCandidate } from "@/lib/types";
import { CandidateSignalsPanel } from "@/components/ResearchCandidateSignals";
import { CompanyDetailOverlay, CompanySummaryCard } from "@/components/ResearchCompanyCards";
import { DataSourceHealthPanel } from "@/components/ResearchDataSourceHealthPanel";
import { EmptyState } from "@/components/ResearchReportsView";
import { DataSourceStatusPanel, MarketDiagnostics, ModelQualityPanel, PositionGauge, SectorDiagnostics, TimelineEvidence } from "@/components/ResearchMarketDiagnostics";
import { ModelJudgementPanel } from "@/components/ResearchModelInsights";
import { MainlineHero } from "@/components/ResearchMainlineHero";
import { MainlinePulseStrip } from "@/components/ResearchMainlinePulseStrip";
import { RuleBottleneckPanel } from "@/components/ResearchRuleBottleneckPanel";
import { RuleReplayPanel } from "@/components/ResearchRuleReplayPanel";
import { getSerenityTag, useSerenityTags } from "@/components/ResearchSerenityTags";
import { CollapsibleSection, formatLlmStatus, formatMarketState, formatReportStatus, formatStage, localizeText, Metric, MiniStat, Panel, SectionTitle } from "@/components/ResearchMainlineCommon";

export function Dashboard({
  report,
  reports = [],
  candidates,
  selected,
  factMap,
  onSelect
}: {
  report: AnalysisReport | null;
  reports?: Array<Pick<AnalysisReport, "id" | "reportType" | "title" | "summary" | "llmStatus" | "reportStatus" | "createdAt">>;
  candidates: StockCandidate[];
  selected: StockCandidate | null;
  factMap: Map<string, Fact>;
  onSelect: (code: string) => void;
}) {
  const [companyDetailOpen, setCompanyDetailOpen] = useState(false);
  const serenityTags = useSerenityTags(candidates.map((candidate) => candidate.code));
  const selectedSerenityTag = getSerenityTag(serenityTags, selected?.code);

  useEffect(() => {
    setCompanyDetailOpen(false);
  }, [selected?.code]);

  if (!report) return <EmptyState reports={reports} />;
  const market = report.llmResult?.marketJudgement;
  return (
    <section className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <div className="xl:col-span-2">
        <MainlineHero report={report} />
      </div>
      <div id="market-gate" className="scroll-mt-24">
        <Panel>
          <SectionTitle icon={Gauge} title="市场总闸" meta={`${formatReportStatus(report.reportStatus)} / ${formatLlmStatus(report.llmStatus)}`} />
          <div className="mt-4 grid gap-4 lg:grid-cols-5">
            <Metric label="大盘状态" value={market?.level ?? formatMarketState(report.factPackage.market.marketState)} />
            <Metric label="交易模式" value={report.ruleResult.market.tradeMode} />
            <Metric label="情绪周期" value={report.ruleResult.market.sentimentCycle} />
            <Metric label="风格偏向" value={report.ruleResult.market.styleBias} />
            <Metric label="主线板块" value={report.factPackage.sectors[0]?.name ?? "暂无"} />
          </div>
          <p className="mt-5 rounded-lg border border-info/25 bg-info/[0.06] p-4 text-2xl font-semibold leading-snug">{localizeText(report.summary)}</p>
          <MainlinePulseStrip report={report} />
          <div className="mt-5 grid gap-3">
            <CollapsibleSection title="大盘诊断" meta="指数 / 宽度 / 量能 / 风险" icon={Gauge} defaultOpen={false}>
              <MarketDiagnostics report={report} />
            </CollapsibleSection>
            <CollapsibleSection title="数据源状态" meta="可用性 / 降级原因 / 缓存风险" icon={Database} defaultOpen={false}>
              <DataSourceStatusPanel report={report} />
              <div className="mt-3">
                <DataSourceHealthPanel />
              </div>
            </CollapsibleSection>
            <CollapsibleSection title="时间链证据" meta="连续性 / 阶段迁移 / 核心股变化" icon={GitBranch} defaultOpen={false}>
              <TimelineEvidence report={report} />
              <div className="mt-3">
                <RuleBottleneckPanel />
              </div>
              <div className="mt-3">
                <RuleReplayPanel />
              </div>
            </CollapsibleSection>
            <CollapsibleSection title="规则边界 × 模型研判" meta="DeepSeek 结构解读与观察清单" icon={ServerCog} defaultOpen={false}>
              <ModelJudgementPanel report={report} factMap={factMap} />
            </CollapsibleSection>
            <div id="model-quality" className="scroll-mt-24">
              <CollapsibleSection title="模型调用质量" meta="耗时 / Prompt 体积 / 修复重试 / 历史成本" icon={BrainCircuit} defaultOpen={true}>
                <ModelQualityPanel report={report} />
              </CollapsibleSection>
            </div>
            <div id="mainline-stages" className="scroll-mt-24">
              <CollapsibleSection title="主线阶段明细" meta="评分、允许买点、禁止动作" icon={Layers3} defaultOpen={false}>
                <div className="grid gap-3">
                  {report.factPackage.sectors.slice(0, 3).map((sector, index) => (
                    <div key={`${sector.code ?? sector.name}-${sector.stage}-${index}`} className="rounded-lg border border-line bg-bg/60 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{sector.name}</p>
                          <p className="mt-1 text-xs text-muted">{formatStage(sector.stage)} / {sector.lineQuality} / 置信度{sector.confidence ?? "低"}</p>
                          <p className="mt-1 text-xs text-muted">
                            迁移：{sector.previousStage ? `${formatStage(sector.previousStage)} → ` : ""}{sector.rawStage && sector.rawStage !== sector.stage ? `${formatStage(sector.rawStage)} → ` : ""}{formatStage(sector.stage)}
                            {sector.stageTransition ? ` / ${formatCoreContinuityState(sector.stageTransition)}` : ""}
                          </p>
                          {(sector.sourceNames?.length ?? 0) > 1 ? <p className="mt-1 text-xs text-muted">来源：{sector.sourceNames?.join(" / ")}</p> : null}
                          <p className="mt-2 text-xs text-muted">允许：{sector.allowedBuyTypes.length ? sector.allowedBuyTypes.join("、") : "无"}；禁止：{sector.forbiddenActions.join("、") || "无"}</p>
                          {sector.stageTransitionReason ? <p className="mt-2 text-xs leading-5 text-muted">{localizeText(sector.stageTransitionReason)}</p> : null}
                          {sector.coreContinuity ? (
                            <div className="mt-2 grid gap-2 md:grid-cols-4">
                              <MiniStat label="核心状态" value={formatCoreContinuityState(sector.coreContinuity.state)} />
                              <MiniStat label="延续核心" value={sector.coreContinuity.retained.length ? `${sector.coreContinuity.retained.length} 只` : "无"} />
                              <MiniStat label="新核心" value={sector.coreContinuity.appeared.length ? `${sector.coreContinuity.appeared.length} 只` : "无"} />
                              <MiniStat label="换龙头" value={sector.coreContinuity.leaderChanged ? "是" : "否"} />
                            </div>
                          ) : null}
                        </div>
                        <p className="text-xl font-semibold text-info">{sector.score.toFixed(0)}</p>
                      </div>
                      <SectorDiagnostics sector={sector} />
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            </div>
          </div>
        </Panel>
      </div>

      <Panel>
        <SectionTitle icon={AlertTriangle} title="风险约束" meta="规则引擎与模型约束" />
        <div className="mt-4 space-y-3 text-sm text-muted">
          <PositionGauge report={report} />
          {(report.ruleResult.market.riskFlags.length ? report.ruleResult.market.riskFlags : ["没有有效买点前，不主动提高仓位。"]).map((risk) => (
            <div key={risk} className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-warn">{localizeText(risk)}</div>
          ))}
          <div className="rounded-lg border border-line bg-bg/60 p-3">
            总仓上限：{report.ruleResult.market.maxTotalPositionPct}% / 单票上限：{report.factPackage.constraints.maxSingleStockPositionPct}% / 单主线上限：{report.factPackage.constraints.maxThemePositionPct}%
          </div>
          <div className="rounded-lg border border-line bg-bg/60 p-3">
            禁止动作：{report.ruleResult.market.forbiddenActions.join("、") || "无"}
          </div>
        </div>
      </Panel>

      <CandidateSignalsPanel
        report={report}
        candidates={candidates}
        selected={selected}
        onSelect={onSelect}
        serenityTags={serenityTags}
        latestReportCreatedAt={reports[0]?.createdAt}
      />

      <div id="company-card" className="scroll-mt-24">
        <Panel>
          <SectionTitle icon={Building2} title="公司认知卡片" meta={selected?.code ?? "暂无"} />
          {selected ? <CompanySummaryCard candidate={selected} report={report} onOpen={() => setCompanyDetailOpen(true)} serenityTag={selectedSerenityTag} /> : null}
        </Panel>
      </div>
      {selected ? (
        <CompanyDetailOverlay
          open={companyDetailOpen}
          candidate={selected}
          factMap={factMap}
          report={report}
          serenityTag={selectedSerenityTag}
          onClose={() => setCompanyDetailOpen(false)}
        />
      ) : null}
    </section>
  );
}

function formatCoreContinuityState(value?: string) {
  const text = String(value ?? "").trim();
  const labels: Record<string, string> = {
    retained: "核心延续",
    appeared: "出现新核心",
    disappeared: "核心退出",
    stable: "结构稳定",
    healthy: "结构健康",
    improving: "结构改善",
    deteriorating: "结构转弱",
    leader_changed: "龙头切换",
    no_core: "核心不足",
    none: "无",
    upgrade: "升级",
    downgrade: "降级",
    unchanged: "延续",
    watch: "观察",
    unknown: "待确认"
  };
  return labels[text] ?? localizeText(text) ?? (text || "待确认");
}
