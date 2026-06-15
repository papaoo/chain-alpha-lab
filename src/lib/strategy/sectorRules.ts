import type { Fact, LimitPoolSnapshot, MarketTimelinePoint, SectorConstituentSnapshot, SectorCoreStockSnapshot, SectorRuleResult, SectorSnapshot } from "@/lib/types";
import type { ParsedCommandResult } from "@/lib/westock/parser";
import { ZH } from "@/lib/strategy/support";
import { allowedBuyTypesForStage, buildSectorDiagnostics, decideSectorStage, forbiddenActionsForStage, inferDivergenceType, inferLineQuality, inferSectorConfidence, invalidConditionsForStage, scoreSectorBreadth, scoreSectorCore, scoreSectorFunding, scoreSectorFundingQuality, scoreSectorLeader, scoreSectorLimitPool, scoreSectorPrice } from "@/lib/strategy/sectorStageRules";
import { diagnosticsToScoreBreakdown, numberValue, pushFact, scoreStatus } from "@/lib/strategy/utils";
import { normalizeSectorName } from "@/lib/sector/normalization";
import { applySectorStageTransition, buildSectorCoreContinuity } from "@/lib/strategy/sectorTransitionRules";

export function evaluateSectors(sectors: SectorSnapshot[], facts: Fact[], marketTimeline: MarketTimelinePoint[]): SectorRuleResult[] {
  return sectors
    .map((sector, index) => {
      const change = sector.changePct ?? 0;
      const change5 = sector.changePct5d ?? 0;
      const change20 = sector.changePct20d ?? 0;
      const inflow = sector.mainNetInflow ?? 0;
      const inflow5 = sector.mainNetInflow5d ?? 0;
      const breadthScore = scoreSectorBreadth(sector);
      const priceScore = scoreSectorPrice(change, change5, change20);
      const limitPoolScore = scoreSectorLimitPool(sector);
      const rankScore = Math.max(0, 12 - index);
      const fundingQuality = scoreSectorFundingQuality(sector);
      const fundingScore = scoreSectorFunding(sector);
      const score = Math.min(100, Math.max(0, priceScore + fundingScore + breadthScore + limitPoolScore + rankScore));
      const rawStage = decideSectorStage({ score, change, change5, change20, inflow, inflow5, breadthScore, limitPoolScore, sector });
      const coreContinuity = buildSectorCoreContinuity(sector, marketTimeline);
      const transition = applySectorStageTransition({
        sector,
        rawStage,
        score,
        fundingScore,
        breadthScore,
        limitPoolScore,
        coreContinuity,
        marketTimeline
      });
      const stage = transition.stage;
      const diagnostics = buildSectorDiagnostics({ priceScore, fundingScore, fundingQuality, breadthScore, limitPoolScore, rankScore, sector });
      diagnostics.push({
        label: "阶段迁移",
        score: transition.adjusted ? 6 : 10,
        max: 10,
        status: transition.adjusted ? "中" : "强",
        note: transition.reason
      });
      diagnostics.push({
        label: "核心延续",
        score: coreContinuity.score,
        max: 20,
        status: coreContinuity.state === "无历史" ? "缺失" : scoreStatus(coreContinuity.score, 20),
        note: coreContinuity.reason
      });
      const confidence = inferSectorConfidence(sector, diagnostics, stage);
      const leaderStrength = scoreSectorLeader(sector, score, rankScore);
      const coreStrength = scoreSectorCore(change5, change20, fundingScore, sector);
      const lineQuality = inferLineQuality(stage, score, leaderStrength, coreStrength);
      const allowedBuyTypes = allowedBuyTypesForStage(stage);
      const forbiddenActions = forbiddenActionsForStage(stage);
      const invalidConditions = invalidConditionsForStage(stage);
      const divergenceType = stage === ZH.diverging ? inferDivergenceType(change, inflow, inflow5, breadthScore) : undefined;
      const ruleFact = pushFact(facts, `rule.sector.${sector.name}.stage`, "ruleComputed", `${sector.name} 主线阶段为${stage}，当日原始阶段${rawStage}，规则评分 ${score.toFixed(0)}：价格${priceScore}/25，资金${fundingScore}/25（${fundingQuality.state}），扩散${breadthScore}/20，涨停核心${limitPoolScore}/15，排名${rankScore}/12；资金依据：${fundingQuality.evidence.join("；") || "无"}；资金约束：${fundingQuality.blockers.join("；") || "无"}；阶段迁移：${transition.reason}；核心延续：${coreContinuity.reason}`, stage);
      const riskFlags = [
        stage === ZH.accelerating ? "板块处于加速阶段，避免追涨后排个股" : "",
        stage === ZH.diverging ? "板块处于分歧阶段，只观察核心股修复，不追后排" : "",
        stage === ZH.fading ? "板块资金或持续性转弱，按退潮处理" : "",
        sector.constituentUpPct !== undefined && sector.constituentUpPct < 45 ? "成分股扩散不足，主线持续性打折" : "",
        (sector.openBoardCount ?? 0) > (sector.limitUpCount ?? 0) && (sector.limitUpCount ?? 0) > 0 ? "炸板数量高于涨停数量，短线分歧偏大" : ""
      ].filter(Boolean);
      if (transition.adjusted) riskFlags.push(transition.reason);
      return {
        name: sector.name,
        code: sector.code,
        normalizedName: sector.normalizedName ?? normalizeSectorName(sector.name),
        sourceNames: sector.sourceNames,
        stage,
        rawStage,
        previousStage: transition.previousStage,
        stageTransition: transition.transition,
        stageTransitionReason: transition.reason,
        lineQuality,
        confidence,
        coreStocks: sector.coreStocks ?? [],
        coreContinuity,
        diagnostics,
        scoreBreakdown: diagnosticsToScoreBreakdown({
          prefix: `sector.${sector.name}`,
          diagnostics,
          defaultDataSources: ["westock-data: board/hot board", "东方财富: board constituents/limit pools"],
          evidenceRefs: [`rule.sector.${sector.name}.stage`, `sector.${sector.name}.board.changePct`, `sector.${sector.name}.constituents.breadth`, `sector.${sector.name}.limit_pool.concentration`]
        }),
        leaderStrength,
        coreStrength,
        breadthScore,
        fundingScore,
        lifecycleDays: transition.lifecycleDays,
        allowedBuyTypes,
        forbiddenActions,
        invalidConditions,
        divergenceType,
        score,
        facts: [...sector.facts, ruleFact],
        riskFlags
      };
    })
    .sort((a, b) => b.score - a.score);
}
