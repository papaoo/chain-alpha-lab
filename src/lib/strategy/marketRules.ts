import type { Fact, LimitPoolSnapshot, MarketBreadthSnapshot, MarketIndexSnapshot, MarketRuleResult, MarketSessionContext, SectorRuleResult, SectorSnapshot } from "@/lib/types";
import type { PremarketSnapshot } from "@/lib/premarket/types";
import type { ParsedCommandResult } from "@/lib/westock/parser";
import { ZH } from "@/lib/strategy/support";
import { pushFact, scoreStatus } from "@/lib/strategy/utils";
import { buildMarketDiagnostics, buildMarketScoreBreakdown, inferMarketConfidence, inferMarketDataQuality, scoreLimitPoolSentiment, scoreMainlines, scoreMarketBreadth } from "@/lib/strategy/marketEnvironmentRules";
import { buildIndexSnapshots, calculateIndexResonance, scoreIndexTrend } from "@/lib/strategy/marketIndexRules";
import { buildMarketProfile, marketStateLabel } from "@/lib/strategy/marketProfileRules";

export function evaluateMarket(
  indices: MarketIndexSnapshot[],
  sectorSnapshots: SectorSnapshot[],
  sectors: SectorRuleResult[],
  hotStocks: ParsedCommandResult,
  marketBreadth: MarketBreadthSnapshot | null,
  limitPools: LimitPoolSnapshot[],
  facts: Fact[],
  session?: MarketSessionContext,
  premarket?: PremarketSnapshot
): MarketRuleResult {
  const valid = indices.filter((item) => item.latestPrice !== undefined).length;
  const trendScore = scoreIndexTrend(indices);
  const indexResonance = calculateIndexResonance(indices.filter((item) => item.latestPrice !== undefined));
  const breadth = scoreMarketBreadth(sectorSnapshots, hotStocks, marketBreadth);
  const sentiment = scoreLimitPoolSentiment(limitPools, marketBreadth);
  const mainlineScore = scoreMainlines(sectors);
  const premarketOverlay = buildPremarketOverlay(session, premarket);
  const weakIndices = indices.filter((item) => item.aboveMa20 === false).map((item) => item.name);
  const topStage = sectors[0]?.stage;
  const riskPenalty =
    (weakIndices.length >= 3 ? 12 : weakIndices.length >= 2 ? 8 : 0) +
    (indexResonance < 0.55 ? 4 : 0) +
    (topStage === ZH.fading ? 12 : 0) +
    (topStage === ZH.accelerating ? 4 : 0) +
    sentiment.riskPenalty +
    premarketOverlay.scorePenalty;
  const rawScore = trendScore + breadth.score + sentiment.score + mainlineScore - riskPenalty;
  const score = Math.min(100, Math.max(0, Math.round(valid < 3 ? Math.min(rawScore, 35) : rawScore)));
  let marketState: MarketRuleResult["marketState"] =
    score >= 70 && trendScore >= 28 && breadth.score >= 14 && sentiment.score >= 3 && mainlineScore >= 10 && weakIndices.length <= 1
      ? "tradable"
      : score >= 45 && trendScore >= 18 && breadth.score >= 6 && mainlineScore >= 5
        ? "cautious"
        : "defensive";

  if (valid < 3) marketState = "defensive";
  if (!breadth.available && marketState === "tradable") marketState = "cautious";
  if (breadth.reliability < 1 && marketState === "tradable") marketState = "cautious";
  if (weakIndices.length >= 2 && marketState === "tradable") marketState = "cautious";
  if (indexResonance < 0.55 && marketState === "tradable") marketState = "cautious";
  if (sentiment.limitDownRisk && marketState === "tradable") marketState = "cautious";
  if (sentiment.panicRisk) marketState = "defensive";
  if (topStage === ZH.fading) marketState = "defensive";
  if (premarketOverlay.stateCap === "cautious" && marketState === "tradable") marketState = "cautious";
  const marketStateReason: MarketRuleResult["marketStateReason"] =
    valid < 3 || !breadth.available
      ? "数据不足防守"
      : sentiment.panicRisk || topStage === ZH.fading
        ? "风险事件防守"
        : marketState === "defensive"
          ? "真实弱势"
          : "正常评估";
  const marketProfile = buildMarketProfile({
    marketState,
    score,
    trendScore,
    breadthScore: breadth.score,
    sentimentScore: sentiment.score,
    mainlineScore,
    weakIndexCount: weakIndices.length,
    topStage,
    indices
  });
  const diagnostics = [
    ...buildMarketDiagnostics({ trendScore, indexResonance, breadth, sentiment, mainlineScore }),
    ...(premarketOverlay.diagnostic ? [premarketOverlay.diagnostic] : [])
  ];
  const dataQuality = inferMarketDataQuality(valid, breadth, limitPools, sentiment);
  const confidence = inferMarketConfidence(dataQuality, diagnostics, riskPenalty);
  const scoreBreakdown = [
    ...(buildMarketScoreBreakdown({
    trendScore,
    breadth,
    sentiment,
    mainlineScore,
    riskPenalty,
    validIndexCount: valid,
    limitPoolCount: limitPools.length,
    hasMarketBreadth: Boolean(marketBreadth)
    }) ?? []),
    ...(premarketOverlay.scoreBreakdown ? [premarketOverlay.scoreBreakdown] : [])
  ];

  const riskFlags = [
    valid < 3 ? "指数数据不足，按数据不足防守处理，不等同于确认市场真实走弱" : "",
    !breadth.available ? "市场广度数据不足，不允许直接判为可交易" : "",
    breadth.reliability < 1 && score >= 45 ? `缺少全 A 宽度，只能使用${breadth.sourceQuality === "sector" ? "板块加权" : "热股样本"}弱证据，可靠性${breadth.reliability.toFixed(2)}，不能直接判为进攻环境` : "",
    sentiment.limitDownRisk ? "跌停或大跌数量偏高，亏钱效应未解除" : "",
    sentiment.panicRisk ? "跌停/大跌风险显著，按防守环境处理" : "",
    sentiment.sourceQuality === "missing" ? "涨跌停情绪数据缺失，情绪分不加分，不能视为安全" : "",
    sentiment.reliability < 0.6 && sentiment.sourceQuality !== "missing" ? `涨跌停情绪数据降级，来源${sentiment.sourceQuality}，可靠性${sentiment.reliability.toFixed(2)}` : "",
    sentiment.zbSource === "missing" && sentiment.sourceQuality !== "missing" ? "炸板池缺失，炸板风险不能按0处理，情绪置信度下降" : "",
    indexResonance < 0.55 ? `核心指数共振不足：${indexResonance.toFixed(2)}` : "",
    topStage === ZH.fading ? "最强主线处于退潮阶段" : "",
    topStage === ZH.accelerating ? "最强主线处于加速阶段，追涨风险升高" : "",
    ...premarketOverlay.riskFlags,
    marketState === "defensive" ? `市场处于防守状态：${marketStateReason}` : "",
    weakIndices.length >= 2 ? `多个核心指数未站上MA20：${weakIndices.join("、")}` : ""
  ].filter(Boolean);
  const componentFact = pushFact(
    facts,
    "rule.market.components",
    "ruleComputed",
    `大盘评分分解：指数趋势 ${trendScore}/40，共振系数 ${indexResonance.toFixed(2)}，市场广度 ${breadth.score}/20，涨跌停情绪 ${sentiment.score}/10，主线强度 ${mainlineScore}/20，风险扣分 ${riskPenalty}，总分 ${score}`,
    score
  );
  const breadthFact = marketBreadth
    ? pushFact(
        facts,
        "market.breadth.eastmoney.summary",
        "dataSourceFact",
        `全 A 宽度：上涨${marketBreadth.up}家，下跌${marketBreadth.down}家，上涨占比${marketBreadth.upPct ?? "缺失"}%，中位涨跌幅${marketBreadth.medianChangePct ?? "缺失"}%，近似涨停${marketBreadth.limitUpApprox}家，近似跌停${marketBreadth.limitDownApprox}家`,
        marketBreadth.upPct,
        "%"
      )
    : undefined;
  const profileFact = pushFact(
    facts,
    "rule.market.profile",
    "ruleComputed",
    `大盘交易画像：市场结构${marketProfile.marketRegime}，交易模式${marketProfile.tradeMode}，情绪周期${marketProfile.sentimentCycle}，风格偏向${marketProfile.styleBias}，总仓上限${marketProfile.maxTotalPositionPct}%，单票上限${marketProfile.maxSingleStockPct}%`,
    marketProfile.tradeMode
  );
  const ruleFact = pushFact(facts, "rule.market.state", "ruleComputed", `规则引擎判断大盘状态为${marketStateLabel(marketState)}，原因${marketStateReason}，评分 ${score}`, marketState);
  if (premarketOverlay.factText) {
    pushFact(facts, "premarket.risk.overlay", "dataSourceFact", premarketOverlay.factText, premarket?.temperature, "/100");
  }
  return {
    marketState,
    marketStateReason,
    ...marketProfile,
    confidence,
    dataQuality,
    diagnostics,
    scoreBreakdown,
    score,
    breadthScore: breadth.score,
    breadthSourceQuality: breadth.sourceQuality,
    breadthReliability: breadth.reliability,
    sentimentScore: sentiment.score,
    sentimentSourceQuality: sentiment.sourceQuality,
    sentimentReliability: sentiment.reliability,
    sentimentSnapshot: {
      zt: sentiment.zt,
      dt: sentiment.dt,
      zb: sentiment.zb,
      bigDown: sentiment.bigDown,
      ztSource: sentiment.ztSource,
      dtSource: sentiment.dtSource,
      zbSource: sentiment.zbSource,
      bigDownSource: sentiment.bigDownSource,
      burstRate: sentiment.burstRate,
      consecutiveZt: sentiment.consecutiveZt,
      firstZt: sentiment.firstZt
    },
    facts: [componentFact, ...(breadthFact ? [breadthFact] : []), profileFact, ruleFact],
    riskFlags,
    status: "success"
  };
}

function buildPremarketOverlay(session?: MarketSessionContext, premarket?: PremarketSnapshot) {
  const inactive = {
    scorePenalty: 0,
    stateCap: undefined as undefined | "cautious",
    diagnostic: undefined as MarketRuleResult["diagnostics"][number] | undefined,
    scoreBreakdown: undefined as NonNullable<MarketRuleResult["scoreBreakdown"]>[number] | undefined,
    riskFlags: [] as string[],
    factText: ""
  };
  if (!premarket) return inactive;

  const active = session?.phase === "premarket" || session?.phase === "call_auction";
  const bucketScore = Math.max(0, Math.min(10, Math.round(premarket.temperature / 10)));
  const severe = premarket.riskLevel === "risk" || premarket.riskLevel === "risk_off";
  const scorePenalty =
    active && premarket.riskLevel === "risk_off" ? 8 :
    active && premarket.riskLevel === "risk" ? 6 :
    active && premarket.riskLevel === "watch" ? 3 :
    0;
  const stateCap = active && severe ? "cautious" as const : undefined;
  const firstFlag = premarket.riskFlags[0] ?? "外围市场未触发明确系统性风险。";
  const modeNote = active
    ? "盘前/竞价阶段生效：只压制开盘前进攻冲动，等待A股开盘宽度、承接和主线核心股确认。"
    : "当前不是盘前/竞价阶段：仅作为背景风险，不改写A股盘面规则结论。";
  const riskFlags = active && scorePenalty > 0
    ? [`盘前外围风险温度 ${premarket.temperature}/100（${premarket.emotionLabel}）：${firstFlag}${stateCap ? " 若规则原本为可交易，开盘前先降为谨慎交易，等待A股承接确认。" : ""}`]
    : [`盘前外围风险温度 ${premarket.temperature}/100（${premarket.emotionLabel}）：${modeNote}`];

  return {
    scorePenalty,
    stateCap,
    diagnostic: {
      label: "盘前外围",
      score: bucketScore,
      max: 10,
      status: scoreStatus(bucketScore, 10),
      note: `${premarket.emotionLabel}，风险温度 ${premarket.temperature}/100。${modeNote}`
    },
    scoreBreakdown: {
      key: "premarket_external_risk",
      label: "盘前外围",
      score: -scorePenalty,
      maxScore: 0,
      evidenceRefs: ["premarket.risk.overlay"],
      dataSources: premarket.sourceTraces.map((trace) => `${trace.source}:${trace.records}`).slice(0, 4),
      confidence: premarket.sourceTraces.some((trace) => trace.status === "failed") ? "低" as const : "中" as const,
      missingFields: premarket.sourceTraces.filter((trace) => trace.status === "failed").map((trace) => trace.label),
      downgradeReasons: scorePenalty > 0 ? [`盘前外围风险折扣 ${scorePenalty}`] : [],
      note: `${firstFlag}${active ? " 仅在盘前/竞价约束交易进攻。" : " 当前只作背景风险。"}`
    },
    riskFlags,
    factText: `盘前侦察：外围风险温度 ${premarket.temperature}/100，状态 ${premarket.emotionLabel}，市场记录 ${premarket.markets.length} 条，事件日历 ${premarket.calendarEvents.length} 条；${firstFlag} ${modeNote}`
  };
}
