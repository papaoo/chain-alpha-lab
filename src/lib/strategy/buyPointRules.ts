import type { MarketRuleResult, MarketSessionContext, SectorRuleResult, StockCandidate, StockTechnicalSnapshot } from "@/lib/types";
import { BUY_POINT_STRETCH_LIMIT, ZH } from "@/lib/strategy/support";
import { buyPointSessionConstraint, withSessionTrigger } from "@/lib/strategy/buyPointSessionRules";
import { buildBuyPointInvalidCondition, buildBuyPointTriggerCondition } from "@/lib/strategy/buyPointExplainRules";

export function evaluateBuyPoint(input: {
  trendState: StockCandidate["trendState"];
  fundFlowState: StockCandidate["fundFlowState"];
  maDistance: NonNullable<StockCandidate["klineSummary"]>["maDistance"] | undefined;
  technical?: StockTechnicalSnapshot;
  sectorStage?: SectorRuleResult["stage"];
  allowedBuyTypes: SectorRuleResult["allowedBuyTypes"];
  marketState: MarketRuleResult["marketState"];
  sessionPhase: MarketSessionContext["phase"];
  activity?: StockCandidate["activity"];
  quote?: StockCandidate["quote"];
}): NonNullable<StockCandidate["buyPointEvaluation"]> {
  const satisfied: string[] = [];
  const blockers: string[] = [];
  const ma5 = input.maDistance?.ma5;
  const ma10 = input.maDistance?.ma10;
  const ma20 = input.maDistance?.ma20;
  const nearMa5 = ma5 !== undefined && Math.abs(ma5) <= 3;
  const nearMa10 = ma10 !== undefined && Math.abs(ma10) <= 4;
  const nearMa20 = ma20 !== undefined && Math.abs(ma20) <= 6;
  const farAboveMa5 = (ma5 ?? 0) > BUY_POINT_STRETCH_LIMIT.ma5;
  const farAboveMa20 = (ma20 ?? 0) > BUY_POINT_STRETCH_LIMIT.ma20;
  const macdRepair = (input.technical?.macd ?? 0) >= 0 || (input.technical?.macdDif ?? -99) >= (input.technical?.macdDea ?? 99);

  if (input.trendState === "above_ma20") satisfied.push("趋势站上MA20");
  if (input.trendState === "reclaim_ma20") satisfied.push("刚收复MA20，具备修复观察价值");
  if (nearMa5) satisfied.push("贴近MA5，短线成本未明显失控");
  if (nearMa10) satisfied.push("贴近MA10，具备突破回踩观察条件");
  if (nearMa20) satisfied.push("贴近MA20，具备趋势低吸观察条件");
  if (input.fundFlowState === "inflow") satisfied.push("多周期主力资金偏流入");
  if (input.fundFlowState === "mixed") satisfied.push("资金分歧但未连续流出");
  if (macdRepair) satisfied.push("MACD未明显恶化或存在修复迹象");
  if (input.activity?.status === "强" || input.activity?.status === "中") {
    satisfied.push(`成交活跃度${input.activity.status}，具备基础承接验证`);
  }

  if (input.trendState === "unknown") blockers.push("缺少趋势证据");
  if (input.fundFlowState === "unknown") blockers.push("缺少资金流证据");
  if (input.trendState === "below_ma20" || input.trendState === "downtrend") blockers.push("趋势未站稳MA20");
  if (input.fundFlowState === "outflow") blockers.push("主力资金连续流出");
  if (input.sectorStage === ZH.observe) blockers.push("主线仍处观察阶段");
  if (input.sectorStage === ZH.fading) blockers.push("主线退潮");
  if (input.marketState === "defensive") blockers.push("大盘防守，买点只记录为待激活");
  const sessionConstraint = buyPointSessionConstraint(input.sessionPhase);
  satisfied.push(`当前时段：${sessionConstraint.semantic}`);
  satisfied.push(`时段仓位语义：${sessionConstraint.positionTone}`);
  if (sessionConstraint.blocksImmediateAction) blockers.push(sessionConstraint.blocker);
  if (farAboveMa5 || farAboveMa20) blockers.push("股价远离均线，不能追高");
  if (!input.sectorStage) blockers.push("缺少主线阶段证据");
  const activityBlockers = buyPointActivityBlockers(input.activity, input.quote);
  blockers.push(...activityBlockers);

  let type: StockCandidate["buyPointType"] = ZH.noBuyPoint;
  let score = 0;
  if (input.trendState === "above_ma20" && nearMa20 && input.fundFlowState !== "outflow") {
    type = ZH.maPullback;
    score = input.sectorStage === ZH.startup
      ? 20
      : input.sectorStage === ZH.confirmed
        ? 18
        : input.sectorStage === ZH.diverging
          ? 16
          : input.fundFlowState === "inflow"
            ? 16
            : 14;
  } else if (input.trendState === "above_ma20" && nearMa10 && input.fundFlowState !== "outflow") {
    type = ZH.breakoutPullback;
    score = input.fundFlowState === "inflow" ? 14 : 10;
  } else if (input.sectorStage === ZH.diverging && input.trendState === "above_ma20" && input.fundFlowState !== "outflow") {
    type = ZH.divergenceRepair;
    score = input.fundFlowState === "mixed" ? 12 : 14;
  } else if (input.trendState === "reclaim_ma20" && input.fundFlowState !== "outflow") {
    type = ZH.divergenceRepair;
    score = macdRepair ? 12 : 10;
  }

  if (farAboveMa5 || farAboveMa20) score = Math.min(score, 6);
  if (activityBlockers.length) score = Math.min(score, 8);
  if (type === ZH.noBuyPoint) score = 0;

  const hardBlocked = blockers.some((item) => ["缺少趋势证据", "缺少资金流证据", "趋势未站稳MA20", "主力资金连续流出", "主线退潮", "股价远离均线，不能追高"].includes(item));
  const allowedBySector = input.allowedBuyTypes.includes(type);
  const status: NonNullable<StockCandidate["buyPointEvaluation"]>["status"] =
    input.trendState === "unknown" || input.fundFlowState === "unknown"
      ? "缺证据"
      : type === ZH.noBuyPoint || hardBlocked
        ? "无效"
        : input.marketState === "defensive" || !allowedBySector || sessionConstraint.blocksImmediateAction || activityBlockers.length > 0
          ? "待激活"
          : "有效";

  return {
    type,
    score,
    status,
    satisfied,
    blockers,
    triggerCondition: withSessionTrigger(buildBuyPointTriggerCondition(type, input.marketState, input.sectorStage, input.allowedBuyTypes), sessionConstraint),
    invalidCondition: buildBuyPointInvalidCondition(type),
    sessionNote: `${sessionConstraint.semantic}：${sessionConstraint.note}${sessionConstraint.focusChecks.length ? `重点看 ${sessionConstraint.focusChecks.join("、")}。${sessionConstraint.positionTone}` : ""}`
  };
}

function buyPointActivityBlockers(activity?: StockCandidate["activity"], quote?: StockCandidate["quote"]) {
  const blockers: string[] = [];
  const amount = quote?.amount ?? activity?.basis.amount;
  const turnoverRate = quote?.turnoverRate ?? activity?.basis.turnoverRate;

  if (!activity || activity.status === "缺失") {
    blockers.push("缺少成交额/换手率等活跃度验证，买点只能待激活");
    return blockers;
  }
  if (activity.status === "弱") {
    blockers.push("成交活跃度偏弱，形态买点需要等待放量承接验证");
  }
  if (amount !== undefined && amount > 0 && amount < 100_000_000) {
    blockers.push("成交额低于1亿，承接不足，回踩形态不能直接视为有效买点");
  }
  if (turnoverRate !== undefined && turnoverRate > 25) {
    blockers.push("换手率超过25%，短线分歧过大，买点需要降级观察");
  }
  if (turnoverRate !== undefined && turnoverRate > 0 && turnoverRate < 1) {
    blockers.push("换手率低于1%，筹码交换不足，买点需要等待活跃度提升");
  }
  return blockers;
}

export { buyPointDiagnosticNote, scoreCandidateBuyPoint } from "@/lib/strategy/buyPointExplainRules";
