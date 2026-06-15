"use client";

import { Gauge, GitBranch, Network, Radar, ShieldCheck, Target } from "lucide-react";
import type { AnalysisReport, Fact } from "@/lib/types";
import { InsightBlock, InsightList } from "@/components/ResearchModelInsightCommon";

export function ExtendedModelInsights({ model, factMap }: { model: NonNullable<AnalysisReport["llmResult"]>; factMap: Map<string, Fact> }) {
  const hasInsights = Boolean(
    model.marketStructureInsight ||
      model.marketStateFlipConditions?.length ||
      model.mainlineCompetition?.length ||
      model.mainlineStageForecasts?.length ||
      model.coreStructureHealth?.length ||
      model.intradayWatchlist?.length
  );
  if (!hasInsights) {
    return (
      <div className="mt-4 rounded-lg border border-line/70 bg-panel/60 p-3 text-sm leading-6 text-muted">
        当前报告缺少扩展模型结构。重新运行今日分析后，会尝试生成市场结构、主线竞争、阶段预案和盘中观察清单。
      </div>
    );
  }
  return (
    <div className="mt-4 grid gap-3 xl:grid-cols-2">
      {model.marketStructureInsight ? (
        <InsightBlock
          icon={Gauge}
          title="市场结构洞察"
          meta="宽度 / 流动性 / 风险压力"
          lines={[
            ["宽度", model.marketStructureInsight.breadth],
            ["流动性", model.marketStructureInsight.liquidity],
            ["风险", model.marketStructureInsight.riskPressure]
          ]}
          refs={model.marketStructureInsight.evidenceRefs}
          factMap={factMap}
        />
      ) : null}
      {model.marketStateFlipConditions?.length ? (
        <InsightList
          icon={ShieldCheck}
          title="状态翻转条件"
          meta="什么情况上修或下修大盘状态"
          items={model.marketStateFlipConditions.slice(0, 3).map((item) => ({
            title: `转为${item.targetState}`,
            body: item.condition,
            refs: item.evidenceRefs
          }))}
          factMap={factMap}
        />
      ) : null}
      {model.mainlineCompetition?.length ? (
        <InsightList
          icon={Network}
          title="主线竞争格局"
          meta="谁更像主线，谁只是轮动"
          items={model.mainlineCompetition.slice(0, 4).map((item) => ({
            title: `${item.rank}. ${item.lineName}`,
            body: item.competitionLogic,
            refs: item.evidenceRefs
          }))}
          factMap={factMap}
        />
      ) : null}
      {model.mainlineStageForecasts?.length ? (
        <InsightList
          icon={GitBranch}
          title="阶段迁移预案"
          meta="下一阶段触发与失效"
          items={model.mainlineStageForecasts.slice(0, 4).map((item) => ({
            title: `${item.name}：${item.currentStage} → ${item.nextStage}`,
            body: `触发：${item.triggerCondition}；失效：${item.invalidCondition}`,
            refs: item.evidenceRefs
          }))}
          factMap={factMap}
        />
      ) : null}
      {model.coreStructureHealth?.length ? (
        <InsightList
          icon={Target}
          title="核心结构健康度"
          meta="龙头延续、成分扩散、结构风险"
          items={model.coreStructureHealth.slice(0, 4).map((item) => ({
            title: `${item.lineName}：${item.health}`,
            body: `核心：${item.leaderContinuity}；扩散：${item.breadthQuality}；风险：${item.risk}`,
            refs: item.evidenceRefs
          }))}
          factMap={factMap}
        />
      ) : null}
      {model.intradayWatchlist?.length ? (
        <InsightList
          icon={Radar}
          title="盘中观察清单"
          meta="仅限候选池，不产生自动交易"
          items={model.intradayWatchlist.slice(0, 5).map((item) => ({
            title: `${item.name} / ${item.watchType}`,
            body: `触发：${item.triggerCondition}；失效：${item.invalidCondition}`,
            refs: item.evidenceRefs
          }))}
          factMap={factMap}
        />
      ) : null}
    </div>
  );
}
