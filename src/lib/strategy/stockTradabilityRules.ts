import type { DataCompleteness, MarketRuleResult, SectorRuleResult, StockCandidate } from "@/lib/types";
import { ZH } from "@/lib/strategy/support";

export function roleAllowsTrial(
  role: StockCandidate["role"],
  marketState: MarketRuleResult["marketState"],
  sectorStage?: SectorRuleResult["stage"]
) {
  if (role === ZH.leader || role === ZH.core) return true;
  if (role === ZH.catchUp && marketState === "tradable" && (sectorStage === ZH.startup || sectorStage === ZH.confirmed)) return true;
  return false;
}

export function evaluateTradability(changePct?: number): NonNullable<StockCandidate["tradability"]> {
  if (changePct === undefined) {
    return {
      status: "未知",
      score: 35,
      blockers: ["涨跌幅缺失，无法判断买入可达性"],
      waitFor: "先补充实时涨跌幅、盘口和成交额，再判断是否可参与。"
    };
  }
  if (changePct >= 9.7) {
    return {
      status: "涨停不可达",
      score: 0,
      blockers: ["个股已接近或达到10%涨停区间，普通实盘大概率买入不可达，禁止追板给仓位"],
      waitFor: "今日不追；转入次日竞价观察计划，只有竞价、板块、核心股反馈和风险位置同时满足时，才允许重新评估。",
      nextSessionPlan: {
        mode: "次日竞价观察",
        preconditions: [
          "次日集合竞价不是一字涨停买不到，也不是明显低开弱转强失败",
          "竞价成交活跃且开盘位置不过度高开，不能用无量高开追价",
          "所属主线继续启动/确认，核心股没有大面积负反馈",
          "开盘后承接不破分时均价线或回踩关键均线后快速修复"
        ],
        doNotChase: [
          "一字板或接近一字板买不到不排队追",
          "高开过多后快速下杀不接飞刀",
          "板块核心股炸板、后排补跌或大盘转防守时不参与"
        ],
        invalidConditions: [
          "竞价低于预期且开盘不能快速收回",
          "开盘放量下杀跌破分时均价线后无修复",
          "主线退潮、核心股负反馈或资金明显流出"
        ]
      }
    };
  }
  if (changePct >= 8) {
    return {
      status: "接近涨停",
      score: 15,
      blockers: ["个股接近涨停区间，追价成交质量差，禁止按当前价给试错仓位"],
      waitFor: "等待放量换手后不炸板、尾盘确认，或次日竞价/回踩不破再重新评估。",
      nextSessionPlan: {
        mode: "次日竞价观察",
        preconditions: [
          "次日竞价不出现明显抢高诱多",
          "主线和核心股继续延续",
          "开盘后能回踩不破或快速承接修复"
        ],
        doNotChase: [
          "高开冲板但量能和板块不配合不追",
          "后排补跌或核心股炸板不追"
        ],
        invalidConditions: [
          "竞价弱于板块",
          "开盘冲高回落且不能收回均价线"
        ]
      }
    };
  }
  if (changePct >= 6) {
    return {
      status: "高位拉升",
      score: 45,
      blockers: ["日内涨幅偏高，不能用追涨价作为计划买点"],
      waitFor: "等待回踩MA5/MA10、分歧修复或尾盘承接确认。",
      nextSessionPlan: {
        mode: "盘中回踩观察",
        preconditions: ["回踩不破关键均线或分时均价线", "主线不退潮", "资金流出收敛或重新流入"],
        doNotChase: ["继续高开高走但无回踩不追", "板块分歧扩大不追"],
        invalidConditions: ["跌破MA20", "资金持续流出", "主线退潮"]
      }
    };
  }
  return {
    status: "可买入观察",
    score: 80,
    blockers: [],
    waitFor: "若同时满足主线、买点、资金和风控条件，可进入规则仓位评估。",
    nextSessionPlan: { mode: "无", preconditions: [], doNotChase: [], invalidConditions: [] }
  };
}

export function decideCandidateAction(input: {
  dataCompleteness: DataCompleteness;
  trendState: StockCandidate["trendState"];
  fundFlowState: StockCandidate["fundFlowState"];
  buyPointType: StockCandidate["buyPointType"];
  buyPointStatus?: NonNullable<StockCandidate["buyPointEvaluation"]>["status"];
  marketState: MarketRuleResult["marketState"];
  sectorStage?: SectorRuleResult["stage"];
  sectorAllowedBuyTypes: SectorRuleResult["allowedBuyTypes"];
  role: StockCandidate["role"];
  farAboveMa5: boolean;
  farAboveMa20: boolean;
  tradability: NonNullable<StockCandidate["tradability"]>;
  strengthScore: number;
  sectorEvidenceOk: boolean;
}): StockCandidate["action"] {
  if (input.dataCompleteness.level === "insufficient") return ZH.insufficient;
  if (!input.sectorEvidenceOk) return ZH.observe;
  if (input.trendState === "downtrend" || input.trendState === "below_ma20") return ZH.avoid;
  if (input.fundFlowState === "outflow") return ZH.avoid;
  if (input.sectorStage === ZH.fading) return ZH.avoid;
  if (input.sectorStage === ZH.observe) return ZH.observe;
  if (input.farAboveMa5 || input.farAboveMa20) return ZH.noChase;
  if (input.tradability.status === "涨停不可达" || input.tradability.status === "接近涨停") return ZH.noChase;
  if (input.marketState === "defensive") return ZH.observe;
  if (input.strengthScore < 60) return ZH.observe;
  if (input.buyPointStatus && input.buyPointStatus !== "有效") {
    return input.buyPointType === ZH.noBuyPoint ? ZH.observe : ZH.waitPullback;
  }
  if (!roleAllowsTrial(input.role, input.marketState, input.sectorStage)) return input.buyPointType === ZH.noBuyPoint ? ZH.observe : ZH.waitPullback;
  if (!input.sectorAllowedBuyTypes.includes(input.buyPointType)) {
    return input.buyPointType === ZH.breakoutPullback ? ZH.waitPullback : ZH.observe;
  }
  if (input.buyPointType === ZH.maPullback || input.buyPointType === ZH.divergenceRepair) {
    if (input.marketState === "tradable" && input.strengthScore >= 70) return ZH.smallTrial;
    if (
      input.marketState === "cautious" &&
      input.sectorStage === ZH.confirmed &&
      (input.role === ZH.leader || input.role === ZH.core) &&
      input.strengthScore >= 68
    ) {
      return ZH.smallTrial;
    }
    return ZH.observe;
  }
  if (input.buyPointType === ZH.breakoutPullback) return ZH.waitPullback;
  return ZH.observe;
}

export function positionLimitForAction(action: StockCandidate["action"], market: MarketRuleResult, sectorDiverging: boolean) {
  if (action !== ZH.smallTrial) return 0;
  const base = market.maxSingleStockPct;
  if (market.marketState === "cautious") return Math.min(base, 2);
  return sectorDiverging ? Math.min(base, 3) : base;
}

export function buildInvalidCondition(
  trendState: StockCandidate["trendState"],
  fundFlowState: StockCandidate["fundFlowState"],
  sectorStage?: SectorRuleResult["stage"]
) {
  if (trendState === "below_ma20" || trendState === "downtrend") return "重新站上MA20前不恢复买入计划";
  if (fundFlowState === "outflow") return "主力资金持续净流出时维持回避";
  if (sectorStage === ZH.fading) return "主线退潮未修复前不参与";
  return "跌破MA20、主线退潮或资金连续流出时失效";
}
