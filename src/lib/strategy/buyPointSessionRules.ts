import type { MarketSessionContext } from "@/lib/types";

export type BuyPointSessionConstraint = {
  blocksImmediateAction: boolean;
  blocker: string;
  note: string;
  semantic: "计划" | "竞价验证" | "早盘线索" | "午间复核" | "午后确认" | "尾盘决策" | "次日计划" | "研究";
  focusChecks: string[];
  positionTone: string;
};

export function buyPointSessionConstraint(phase: MarketSessionContext["phase"]): BuyPointSessionConstraint {
  if (phase === "premarket") {
    return {
      blocksImmediateAction: true,
      blocker: "盘前只生成验证清单，不能确认今日买点",
      note: "盘前计划：只记录潜在买点，等待开盘后承接、宽度和资金验证。",
      semantic: "计划",
      focusChecks: ["外围风险是否缓和", "竞价是否高开过多或弱转强", "主线核心股是否继续被资金承接"],
      positionTone: "不直接给买入仓位，只生成盘中触发清单。"
    };
  }
  if (phase === "call_auction") {
    return {
      blocksImmediateAction: true,
      blocker: "集合竞价只作弱参考，不能确认买点",
      note: "集合竞价：异动只作弱参考，必须等待 9:30 后承接确认。",
      semantic: "竞价验证",
      focusChecks: ["竞价量能是否显著高于常态", "高开幅度是否透支买点", "开盘后 5-15 分钟是否承接而非冲高回落"],
      positionTone: "只允许记录竞价候选，不把竞价异动直接升级为有效买点。"
    };
  }
  if (phase === "midday_break") {
    return {
      blocksImmediateAction: true,
      blocker: "午间休市只能给下午验证条件",
      note: "午间复盘：上午结构只形成下午观察条件，不能声称下午已确认。",
      semantic: "午间复核",
      focusChecks: ["上午强势股午后是否继续站稳均线", "主线后排是否补跌", "下午开盘资金是否继续回流"],
      positionTone: "午间只输出下午条件单语义，不把上午半日结构当作全天确认。"
    };
  }
  if (phase === "closing_auction") {
    return {
      blocksImmediateAction: false,
      blocker: "",
      note: "尾盘确认：需要收盘位置有效，并额外考虑隔日低开和尾盘脉冲风险。",
      semantic: "尾盘决策",
      focusChecks: ["收盘价是否站稳关键均线或突破位", "尾盘拉升是否有量能配合", "隔日低开风险是否可由仓位承受"],
      positionTone: "尾盘买点只适合更小仓位，且必须写明隔日低开失效条件。"
    };
  }
  if (phase === "postmarket") {
    return {
      blocksImmediateAction: true,
      blocker: "收盘后只能转为次日验证条件",
      note: "收盘复盘：不做盘中买入，只输出次日开盘验证条件。",
      semantic: "次日计划",
      focusChecks: ["次日竞价是否确认今日结构", "核心股是否继续留在主线核心池", "若低开是否仍守住失效位"],
      positionTone: "收盘后只生成次日计划，不产生当日交易动作。"
    };
  }
  if (phase === "night_research" || phase === "non_trading_day") {
    return {
      blocksImmediateAction: true,
      blocker: "研究时段不做实时买点确认",
      note: "研究模式：只做历史复盘、候选池维护和下个交易日验证计划。",
      semantic: "研究",
      focusChecks: ["复核主线阶段是否连续", "清理主线归属弱或数据长期不足股票", "生成下个交易日验证清单"],
      positionTone: "研究时段不输出即时买入，只输出观察与复盘任务。"
    };
  }
  if (phase === "morning") {
    return {
      blocksImmediateAction: false,
      blocker: "",
      note: "早盘盯盘：可识别启动线索，但需要午后和尾盘继续验证。",
      semantic: "早盘线索",
      focusChecks: ["开盘后 30-60 分钟是否持续承接", "不是单纯冲高回落", "主线核心和中军是否同步"],
      positionTone: "早盘只适合试错级别，禁止因早盘脉冲直接放大仓位。"
    };
  }
  if (phase === "afternoon") {
    return {
      blocksImmediateAction: false,
      blocker: "",
      note: "午后确认：重点验证早盘主线是否延续、资金是否回流。",
      semantic: "午后确认",
      focusChecks: ["早盘主线是否午后继续扩散", "核心股是否没有跳水", "全 A 宽度和资金是否边际改善"],
      positionTone: "午后确认优先级高于早盘脉冲，但仍服从大盘状态和主线阶段。"
    };
  }
  return {
    blocksImmediateAction: false,
    blocker: "",
    note: "盘中：按当前规则和风控约束判断。",
    semantic: "午后确认",
    focusChecks: ["价格是否守住关键位", "资金是否没有继续恶化", "主线阶段是否仍允许该买点"],
    positionTone: "盘中动作必须服从规则仓位和失效条件。"
  };
}

export function withSessionTrigger(base: string, sessionConstraint: BuyPointSessionConstraint) {
  return sessionConstraint.blocksImmediateAction || sessionConstraint.note
    ? `${base}；时段要求：${sessionConstraint.note}；重点验证：${sessionConstraint.focusChecks.join("、")}`
    : base;
}
