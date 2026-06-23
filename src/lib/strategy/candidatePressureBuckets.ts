import type { AnalysisReport, StockCandidate } from "@/lib/types";

export type CandidatePressureTone = "open" | "wait" | "risk";

export type CandidatePressureBucket = {
  key: string;
  title: string;
  value: string;
  subtitle: string;
  tone: CandidatePressureTone;
  details: string[];
};

export type CandidatePressureHistoryPoint = {
  reportId: string;
  createdAt: string;
  candidateCount: number;
  buckets: CandidatePressureBucket[];
};

export type CandidatePressureHistorySummary = {
  generatedAt: string;
  reportCount: number;
  candidateObservationCount: number;
  calibrationHints: CandidatePressureCalibrationHint[];
  topBuckets: Array<{
    key: string;
    title: string;
    totalCount: number;
    latestValue: string;
    tone: CandidatePressureTone;
    frequencyPct: number;
    trend: "升高" | "持平" | "降低" | "样本不足";
    details: string[];
  }>;
  points: CandidatePressureHistoryPoint[];
};

export type CandidatePressureCalibrationHint = {
  key: string;
  category: "market_regime" | "data_quality" | "buy_point_strictness" | "reachability" | "fund_trend" | "mainline_attribution";
  severity: "info" | "warning" | "risk";
  title: string;
  message: string;
  suggestedAction: string;
  evidence: string[];
};

export function buildCandidatePressureBuckets(report: AnalysisReport, candidates: StockCandidate[]): CandidatePressureBucket[] {
  const market = report.ruleResult.market;
  const marketBlocked = market.marketState === "defensive" || market.maxTotalPositionPct <= 0;
  const mainlineBlocked = candidates.filter((candidate) =>
    candidate.mainlineAttribution?.shouldExclude ||
    candidate.mainlineAttribution?.status === "mismatch" ||
    candidate.opportunityProfile?.blockingReasons.some((reason) => /主线|板块|归属|成分|主营/.test(reason))
  );
  const buyPointBlocked = candidates.filter((candidate) =>
    candidate.buyPointEvaluation?.status !== "有效" ||
    candidate.buyPointType === "无买点"
  );
  const dataBlocked = candidates.filter((candidate) => candidate.dataCompleteness.level !== "complete");
  const reachabilityBlocked = candidates.filter((candidate) =>
    candidate.tradability?.status === "涨停不可达" ||
    candidate.tradability?.status === "接近涨停" ||
    candidate.tradability?.status === "高位拉升"
  );
  const fundTrendBlocked = candidates.filter((candidate) =>
    candidate.fundFlowState === "outflow" ||
    candidate.fundFlowState === "mixed" ||
    candidate.trendState === "downtrend" ||
    candidate.trendState === "below_ma20" ||
    candidate.riskFlags.some((flag) => /资金|流出|趋势|均线|破位|回落/.test(flag))
  );

  return [
    {
      key: "market",
      title: "大盘总闸",
      value: marketBlocked ? `${candidates.length}` : "0",
      subtitle: marketBlocked ? `${market.tradeMode}，总仓上限 ${market.maxTotalPositionPct}%` : "大盘没有形成硬压制",
      tone: marketBlocked ? "risk" : market.marketState === "cautious" ? "wait" : "open",
      details: [
        `市场状态：${formatMarketState(market.marketState)} / ${market.marketStateReason}`,
        `大盘评分：${market.score}/100`,
        ...market.riskFlags.slice(0, 3),
        ...market.forbiddenActions.slice(0, 2).map((item) => `硬约束：${item}`)
      ].filter(isUsefulText)
    },
    {
      key: "mainline",
      title: "主线归属",
      value: `${mainlineBlocked.length}`,
      subtitle: mainlineBlocked.length ? "候选与当前主线证据不够硬" : "主线归属未形成集中阻断",
      tone: mainlineBlocked.length ? "risk" : "open",
      details: collectTopItems(mainlineBlocked.flatMap((candidate) => [
        candidate.mainlineAttribution?.reason,
        ...(candidate.mainlineAttribution?.evidenceChain?.negativeEvidence ?? []),
        ...(candidate.opportunityProfile?.blockingReasons ?? []).filter((reason) => /主线|板块|归属|成分|主营/.test(reason))
      ]), 5)
    },
    {
      key: "buy-point",
      title: "买点质量",
      value: `${buyPointBlocked.length}`,
      subtitle: buyPointBlocked.length ? "买点无效、待激活或缺少确认" : "买点没有形成集中压制",
      tone: buyPointBlocked.length ? "wait" : "open",
      details: collectTopItems(buyPointBlocked.flatMap((candidate) => [
        candidate.buyPointEvaluation?.triggerCondition,
        ...(candidate.buyPointEvaluation?.blockers ?? [])
      ]), 5)
    },
    {
      key: "data",
      title: "数据完整性",
      value: `${dataBlocked.length}`,
      subtitle: dataBlocked.length || report.factPackage.dataSource.status !== "success" ? "字段缺失或来源降级会压制动作" : "关键数据覆盖较完整",
      tone: dataBlocked.length || report.factPackage.dataSource.status !== "success" ? "risk" : "open",
      details: [
        `数据源状态：${report.factPackage.dataSource.status}`,
        ...report.factPackage.dataSource.warnings.slice(0, 3),
        ...collectTopItems(dataBlocked.flatMap((candidate) => candidate.dataCompleteness.missingFields ?? []), 4).map((item) => `缺字段：${item}`)
      ].filter(isUsefulText)
    },
    {
      key: "reachability",
      title: "盘口可达性",
      value: `${reachabilityBlocked.length}`,
      subtitle: reachabilityBlocked.length ? "涨停、接近涨停或高位拉升不适合追" : "暂无集中不可达问题",
      tone: reachabilityBlocked.length ? "risk" : "open",
      details: collectTopItems(reachabilityBlocked.flatMap((candidate) => [
        `${candidate.name}：${candidate.tradability?.status}`,
        candidate.tradability?.waitFor,
        ...(candidate.tradability?.blockers ?? [])
      ]), 5)
    },
    {
      key: "fund-trend",
      title: "资金 / 趋势",
      value: `${fundTrendBlocked.length}`,
      subtitle: fundTrendBlocked.length ? "资金分歧、流出或趋势破坏" : "资金趋势未形成集中压制",
      tone: fundTrendBlocked.length ? "wait" : "open",
      details: collectTopItems(fundTrendBlocked.flatMap((candidate) => [
        `${candidate.name}：资金${fundFlowStateLabel(candidate.fundFlowState)}，趋势${trendStateLabel(candidate.trendState)}`,
        ...candidate.riskFlags.filter((flag) => /资金|流出|趋势|均线|破位|回落/.test(flag))
      ]), 5)
    }
  ];
}

export function buildCandidatePressureHistorySummary(points: CandidatePressureHistoryPoint[], now = new Date()): CandidatePressureHistorySummary {
  const ordered = [...points].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const totals = new Map<string, {
    key: string;
    title: string;
    totalCount: number;
    latestValue: string;
    tone: CandidatePressureTone;
    details: string[];
    values: number[];
  }>();
  let candidateObservationCount = 0;
  for (const point of ordered) {
    candidateObservationCount += point.candidateCount;
    for (const bucket of point.buckets) {
      const value = numericBucketValue(bucket.value);
      const current = totals.get(bucket.key) ?? {
        key: bucket.key,
        title: bucket.title,
        totalCount: 0,
        latestValue: bucket.value,
        tone: bucket.tone,
        details: [],
        values: []
      };
      current.totalCount += value;
      current.latestValue = bucket.value;
      current.tone = strongestTone(current.tone, bucket.tone);
      current.details = collectTopItems([...current.details, ...bucket.details], 5);
      current.values.push(point.candidateCount ? value / point.candidateCount : 0);
      totals.set(bucket.key, current);
    }
  }
  const topBuckets = Array.from(totals.values())
    .map((item) => ({
      key: item.key,
      title: item.title,
      totalCount: item.totalCount,
      latestValue: item.latestValue,
      tone: item.tone,
      frequencyPct: candidateObservationCount ? Math.round((item.totalCount / candidateObservationCount) * 100) : 0,
      trend: inferPressureTrend(item.values),
      details: item.details
    }))
    .sort((left, right) => right.totalCount - left.totalCount || pressureToneRank(right.tone) - pressureToneRank(left.tone) || left.title.localeCompare(right.title));
  return {
    generatedAt: now.toISOString(),
    reportCount: ordered.length,
    candidateObservationCount,
    calibrationHints: buildCalibrationHints(topBuckets, ordered.length),
    topBuckets,
    points: ordered
  };
}

function buildCalibrationHints(
  buckets: CandidatePressureHistorySummary["topBuckets"],
  reportCount: number
): CandidatePressureCalibrationHint[] {
  if (reportCount < 3) {
    return [{
      key: "sample-too-small",
      category: "market_regime",
      severity: "info",
      title: "样本仍不足",
      message: "历史压制复盘至少需要 3 份可展示报告，才能判断规则是否持续过严或数据是否持续缺口。",
      suggestedAction: "继续让定时分析或手动分析积累报告，不要根据单期结果调整规则。",
      evidence: [`当前样本 ${reportCount} 份`]
    }];
  }
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  const hints: CandidatePressureCalibrationHint[] = [];
  const market = byKey.get("market");
  const data = byKey.get("data");
  const buyPoint = byKey.get("buy-point");
  const reachability = byKey.get("reachability");
  const fundTrend = byKey.get("fund-trend");
  const mainline = byKey.get("mainline");

  if (market && market.frequencyPct >= 70) {
    hints.push({
      key: "market-regime-dominates",
      category: "market_regime",
      severity: market.trend === "升高" ? "risk" : "warning",
      title: "主要瓶颈来自大盘总闸",
      message: "多数候选被大盘仓位上限或防守状态压制，这更像市场环境不可做，而不是单股规则过严。",
      suggestedAction: "优先观察大盘宽度、指数均线和主线确认数量是否改善；不要单独放松个股买点。",
      evidence: [`频率 ${market.frequencyPct}%`, `趋势 ${market.trend}`, ...market.details.slice(0, 2)]
    });
  }
  if (data && data.frequencyPct >= 20) {
    hints.push({
      key: "data-quality-bottleneck",
      category: "data_quality",
      severity: data.frequencyPct >= 45 || data.trend === "升高" ? "risk" : "warning",
      title: "数据缺口正在影响判断",
      message: "数据完整性反复成为阻断项时，不能通过放松规则解决，应优先补数据源、字段映射和新鲜度。",
      suggestedAction: "排查缺失字段、板块映射和行情补源；数据未补齐前继续禁止把缺口候选升级为买入。",
      evidence: [`频率 ${data.frequencyPct}%`, `趋势 ${data.trend}`, ...data.details.slice(0, 2)]
    });
  }
  if (buyPoint && buyPoint.frequencyPct >= 80 && (!market || market.frequencyPct < 50) && (!data || data.frequencyPct < 20)) {
    hints.push({
      key: "buy-point-may-be-too-strict",
      category: "buy_point_strictness",
      severity: buyPoint.trend === "升高" ? "risk" : "warning",
      title: "买点规则可能偏严",
      message: "当大盘和数据不是主要瓶颈，但买点质量长期高频压制，说明需要复核买点定义是否过度保守。",
      suggestedAction: "不要直接放宽买入；先拆分盘前、早盘、午间、尾盘买点，并加入量能和承接验证的差异化阈值。",
      evidence: [`频率 ${buyPoint.frequencyPct}%`, `趋势 ${buyPoint.trend}`, ...buyPoint.details.slice(0, 2)]
    });
  } else if (buyPoint && buyPoint.frequencyPct >= 80) {
    hints.push({
      key: "buy-point-blocked-by-context",
      category: "buy_point_strictness",
      severity: "info",
      title: "买点压制需要结合大盘和数据看",
      message: "买点质量高频压制，但同时大盘或数据也是主要瓶颈；这不应直接解读为买点规则过严。",
      suggestedAction: "先确认大盘和数据恢复，再复核买点阈值，否则容易把弱市反抽误判为机会。",
      evidence: [`买点频率 ${buyPoint.frequencyPct}%`, `大盘频率 ${market?.frequencyPct ?? 0}%`, `数据频率 ${data?.frequencyPct ?? 0}%`]
    });
  }
  if (reachability && reachability.frequencyPct >= 50) {
    hints.push({
      key: "reachability-dominates",
      category: "reachability",
      severity: "warning",
      title: "高频瓶颈来自涨停或高位不可达",
      message: "候选经常已经涨停、接近涨停或高位拉升，问题不是选不出强股，而是买点进入了不可达区。",
      suggestedAction: "把这类候选更多转入次日竞价观察池和追踪验证，不在当日追板环节给买入建议。",
      evidence: [`频率 ${reachability.frequencyPct}%`, `趋势 ${reachability.trend}`, ...reachability.details.slice(0, 2)]
    });
  }
  if (fundTrend && fundTrend.frequencyPct >= 70) {
    hints.push({
      key: "fund-trend-confirmation-needed",
      category: "fund_trend",
      severity: fundTrend.trend === "升高" ? "warning" : "info",
      title: "资金或趋势确认不足",
      message: "资金分歧、流出或趋势破坏长期压制候选，说明系统需要继续强调资金质量，而不是只看题材热度。",
      suggestedAction: "保留资金质量约束，并在前端优先展示 1日、5日、10日资金方向分歧，帮助判断是否只是弱修复。",
      evidence: [`频率 ${fundTrend.frequencyPct}%`, `趋势 ${fundTrend.trend}`, ...fundTrend.details.slice(0, 2)]
    });
  }
  if (mainline && mainline.frequencyPct >= 20) {
    hints.push({
      key: "mainline-attribution-bottleneck",
      category: "mainline_attribution",
      severity: "warning",
      title: "主线归属证据需要复核",
      message: "主线归属反复阻断时，应优先补成分股、主营关键词和产业链证据，避免无关股票占用候选池。",
      suggestedAction: "把长期归属弱的股票移入人工复核或剔除列表，保留证据链而不是直接放宽匹配。",
      evidence: [`频率 ${mainline.frequencyPct}%`, `趋势 ${mainline.trend}`, ...mainline.details.slice(0, 2)]
    });
  }
  return hints.slice(0, 5);
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

function numericBucketValue(value: string) {
  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function strongestTone(left: CandidatePressureTone, right: CandidatePressureTone): CandidatePressureTone {
  return pressureToneRank(right) > pressureToneRank(left) ? right : left;
}

function pressureToneRank(tone: CandidatePressureTone) {
  if (tone === "risk") return 3;
  if (tone === "wait") return 2;
  return 1;
}

function inferPressureTrend(values: number[]): "升高" | "持平" | "降低" | "样本不足" {
  if (values.length < 3) return "样本不足";
  const previous = average(values.slice(0, -1));
  const latest = values[values.length - 1] ?? 0;
  if (latest >= previous + 0.15) return "升高";
  if (latest <= previous - 0.15) return "降低";
  return "持平";
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isUsefulText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim() !== "无";
}

function formatMarketState(value: AnalysisReport["ruleResult"]["market"]["marketState"]) {
  if (value === "tradable") return "可交易";
  if (value === "cautious") return "谨慎";
  return "防守";
}

function fundFlowStateLabel(value: StockCandidate["fundFlowState"]) {
  if (value === "inflow") return "流入";
  if (value === "outflow") return "流出";
  if (value === "mixed") return "分歧";
  return "未知";
}

function trendStateLabel(value: StockCandidate["trendState"]) {
  if (value === "above_ma20") return "站上MA20";
  if (value === "reclaim_ma20") return "收复MA20";
  if (value === "below_ma20") return "跌破MA20";
  if (value === "downtrend") return "下降趋势";
  return "未知";
}
